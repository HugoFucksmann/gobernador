import {
  BUILDING_CATALOG,
  DEMOG_CONSTANTS,
  ECON_CONSTANTS,
  FIRM_CONSTANTS,
  HOUSING_CONSTANTS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  ROLE_CATALOG,
} from '../data/catalogs';
import {
  BuildingType,
  Casa,
  EconomyOutput,
  Firma,
  FirmRubro,
  GameState,
  Hogar,
  HouseType,
  MediaOutlet,
  Npc,
  Parcela,
  PublicRoleId,
  RoleId,
  ZoneId,
} from '../types/game';
import {
  computeMaintenanceBreakdown,
  getBuildingJobCaps,
} from './policies';
import { nextSeqId, nextSubRand, subRandInt } from './rng';
import {
  clamp,
  computeDailyFoodPriceForZone,
  getActivePhenomena,
  getEffectivePropensionEmprender,
  getEffectivePropensionGasto,
  getFirmaRoleCaps,
  getNpcProductivity,
  getWorldZones,
  syncLegacyEnterprisesView,
} from './worldHelpers';
import { emitSimEvent } from './worldHelpers';

export function runDailyEconomyV2(state: GameState): void {
  const isM1Plus = state.config.nivelMundo !== 'M0';
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);
  const zones = getWorldZones(state);
  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));

  // 1. Agro production per agro firm
  const agroFirms = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  const activeFen = getActivePhenomena(state);

  let droughtInt = 0;
  let plagueInt = 0;
  for (const fen of activeFen) {
    if (fen.tipo === 'sequia') droughtInt = Math.max(droughtInt, fen.intensidad / 100);
    if (fen.tipo === 'plaga') plagueInt = Math.max(plagueInt, fen.intensidad / 100);
  }
  const hasRiego = state.parcelas.some((p) => p.edificio?.activo && p.edificio.tipo === 'riego');
  if (hasRiego && droughtInt > 0) droughtInt *= 0.5;
  const subProd = 1 + (state.gobierno.extras?.vigentes?.subsidioAlimento ?? 0) * 0.005;

  let extraSiloDias = 0;
  for (const p of state.parcelas) {
    if (p.edificio?.activo && p.edificio.tipo === 'silo') {
      extraSiloDias += BUILDING_CATALOG.silo.siloExtraDias ?? 10;
    }
  }
  const siloDiasTotal = ECON_CONSTANTS.siloDias + extraSiloDias;
  state.alimento.siloDias = siloDiasTotal;

  let totalProdToday = 0;
  const npcById = new Map<string, Npc>(vivos.map((n) => [n.id, n]));

  for (const agro of agroFirms) {
    let agWorkers = 0;
    let techWorkers = 0;
    let prodBaseSum = 0;
    for (const eid of agro.empleados) {
      const emp = npcById.get(eid);
      if (!emp || emp.hospital.internado || emp.accionIa?.fueraDePuesto) continue;
      const pFactor = getNpcProductivity(emp, state) / 100;
      if (emp.rol === 'agricultor') {
        agWorkers++;
        prodBaseSum += ECON_CONSTANTS.produccionBaseAgricultor * pFactor;
      } else if (emp.rol === 'tecnico') {
        techWorkers++;
      }
    }
    const effTech = Math.min(techWorkers, agWorkers * ECON_CONSTANTS.tecnicosPorAgricultor);
    const techMult = 1 + ECON_CONSTANTS.kTecnificacion * (effTech / Math.max(1, agWorkers));
    const climateMult =
      (1 - ECON_CONSTANTS.coefSequiaProduccion * droughtInt) *
      (1 - ECON_CONSTANTS.coefPlagaProduccion * plagueInt);

    const produced = Math.max(0, prodBaseSum * techMult * climateMult * subProd);
    totalProdToday += produced;
    const capFirm = Math.max(80, siloDiasTotal * Math.max(15, pop / Math.max(1, agroFirms.length)));
    agro.stock = Math.min(capFirm, (agro.stock ?? 0) + produced);
  }

  state.alimento.produccionDiaria = Number(totalProdToday.toFixed(2));
  state.alimento.consumoDiario = Number((pop * ECON_CONSTANTS.consumoPorNpc).toFixed(2));

  // 2. Foreign trade
  const flujoExt = state.gobierno.palancasVigentes.comercioExterior;
  const merchants = vivos.filter((n) => n.rol === 'comerciante' && !n.accionIa?.fueraDePuesto).length;
  const tradeCap = merchants * ECON_CONSTANTS.intercambioPorComerciante * (Math.abs(flujoExt) / 100);
  const inflFactor = 1 + (state.gobierno.inflacion || 0) / 100;

  if (flujoExt < 0 && tradeCap > 0 && agroFirms.length > 0) {
    const floorGlobal = pop * ECON_CONSTANTS.stockMinExportarDias;
    const totalStockNow = agroFirms.reduce((s, f) => s + (f.stock ?? 0), 0);
    const exportable = Math.max(0, Math.min(tradeCap, totalStockNow - floorGlobal));
    if (exportable > 0.05) {
      const unitExportPrice = ECON_CONSTANTS.precioBaseAlimento * inflFactor * 0.95;
      let exportedSum = 0;
      for (const agro of agroFirms) {
        const share = totalStockNow > 0 ? (agro.stock ?? 0) / totalStockNow : 0;
        const units = Math.min(agro.stock ?? 0, exportable * share);
        if (units > 0) {
          agro.stock = Math.max(0, (agro.stock ?? 0) - units);
          const rev = units * unitExportPrice;
          agro.ventas += rev;
          exportedSum += rev;
        }
      }
      state.gobierno.acumuladoPeriodo.exportaciones += exportedSum;
      state.auditEntradasDia += exportedSum;
    }
  } else if (flujoExt > 0 && tradeCap > 0 && agroFirms.length > 0) {
    const unitImportPrice =
      ECON_CONSTANTS.precioBaseAlimento * inflFactor * ECON_CONSTANTS.diferencialImportacion;
    const maxAffordableUnits = Math.floor(Math.max(0, state.gobierno.reserva) / Math.max(0.1, unitImportPrice));
    const importedUnits = Math.min(tradeCap, maxAffordableUnits);
    if (importedUnits > 0.05) {
      const cost = importedUnits * unitImportPrice;
      state.gobierno.reserva -= cost;
      state.gobierno.acumuladoPeriodo.importaciones += cost;
      state.auditSalidasDia += cost;
      const perAgro = importedUnits / agroFirms.length;
      for (const agro of agroFirms) {
        agro.stock = (agro.stock ?? 0) + perAgro;
      }
    }
  }

  const totalStockAfterTrade = agroFirms.reduce((s, f) => s + (f.stock ?? 0), 0);
  state.alimento.stock = Number(totalStockAfterTrade.toFixed(2));
  state.alimento.diasStock = Number((totalStockAfterTrade / Math.max(1, pop * ECON_CONSTANTS.consumoPorNpc)).toFixed(2));

  // 3. Zone prices
  const precioPorZona: Record<ZoneId, number> = {};
  let weightedPriceSum = 0;
  for (const z of zones) {
    const zp = computeDailyFoodPriceForZone(state, z);
    precioPorZona[z] = zp;
    weightedPriceSum += zp;
  }
  const avgPrice = zones.length > 0 ? weightedPriceSum / zones.length : ECON_CONSTANTS.precioBaseAlimento;
  state.alimento.precio = Number(avgPrice.toFixed(3));
  state.alimento.precioMercado = Number(avgPrice.toFixed(3));

  // Index commerce firms and daily capacity
  const comercios = state.firmas.filter((f) => f.activa && f.rubro === 'comercio' && f.locales.length > 0);
  const parcelById = new Map<string, Parcela>(state.parcelas.map((p) => [p.id, p]));
  const comCapLeft = new Map<string, number>();
  for (const c of comercios) {
    let cap = 0;
    for (const pid of c.locales) {
      const p = parcelById.get(pid);
      if (p?.edificio?.activo) {
        p.edificio.ventasHoy = 0;
        cap += BUILDING_CATALOG[p.edificio.tipo].capacidadVentasDiaria ?? 90;
      }
    }
    comCapLeft.set(c.id, Math.max(40, cap));
  }

  const comByZone = new Map<ZoneId, Firma[]>();
  for (const c of comercios) {
    const arr = comByZone.get(c.zona) ?? [];
    arr.push(c);
    comByZone.set(c.zona, arr);
  }

  // Track retencion measure
  const retencionFirms = new Set<string>();
  for (const m of state.medidasVigentes) {
    if (m.tipo === 'retencion_stock' && m.empresaId) retencionFirms.add(m.empresaId);
  }

  const pickComercioSeller = (zona: ZoneId, boycottedFirmId?: string): Firma | undefined => {
    const candidatesZones = [zona, ...(state.zonas[zona]?.vecinas ?? [])];
    for (const cz of candidatesZones) {
      const list = (comByZone.get(cz) ?? []).filter(
        (f) => f.id !== boycottedFirmId && (comCapLeft.get(f.id) ?? 0) > 1
      );
      if (list.length > 0) {
        list.sort((a, b) => a.margenPoder - b.margenPoder);
        return list[0];
      }
    }
    return comercios.find((f) => f.id !== boycottedFirmId) ?? comercios[0];
  };

  // Helper to route food purchase proceeds strictly without creating or losing money
  const settleFoodPurchase = (seller: Firma | undefined, amount: number, unitsRequested: number) => {
    if (amount <= 0) return;
    const totalAvailStock = agroFirms.reduce((s, a) => {
      const avail = retencionFirms.has(a.id) ? (a.stock ?? 0) * 0.45 : (a.stock ?? 0);
      return s + Math.max(0, avail);
    }, 0);
    const margin = ECON_CONSTANTS.margenComercialPct / 100;
    const comShare = seller ? amount * margin : 0;
    const agroShare = amount - comShare;

    if (seller && comShare > 0) {
      seller.ventas += comShare;
      comCapLeft.set(seller.id, Math.max(0, (comCapLeft.get(seller.id) ?? 0) - comShare));
    } else if (!seller && agroFirms.length > 0) {
      agroFirms[0].ventas += comShare;
    }

    if (agroFirms.length > 0) {
      let distributedAgro = 0;
      for (let i = 0; i < agroFirms.length; i++) {
        const a = agroFirms[i];
        const w =
          totalAvailStock > 0
            ? Math.max(0, a.stock ?? 0) / totalAvailStock
            : 1 / agroFirms.length;
        const cut = i === agroFirms.length - 1 ? agroShare - distributedAgro : agroShare * w;
        distributedAgro += cut;
        a.ventas += cut;
        const unitTake = unitsRequested * w;
        a.stock = Math.max(0, (a.stock ?? 0) - unitTake);
      }
    } else if (seller) {
      seller.ventas += agroShare;
    } else {
      state.gobierno.reserva += amount;
    }
  };

  const guaranteePct = clamp(state.gobierno.palancasVigentes.garantiaAlimentaria, 0, 100) / 100;
  const accesoComida: Record<string, number> = {};
  const poderAdquisitivo: Record<string, number> = {};

  // 4 & 5 & 6. Daily Household food purchase, living spend & consumption
  for (const h of state.hogares) {
    const members = h.miembros.map((id) => npcById.get(id)).filter((n): n is Npc => Boolean(n && n.vivo));
    const count = members.length;
    if (count === 0) continue;

    // Acogida household: state pays food & care directly
    if (h.estado === 'acogida') {
      const zPrice = precioPorZona[h.zona] ?? avgPrice;
      const foodCost = Math.min(state.gobierno.reserva, count * zPrice);
      if (foodCost > 0) {
        state.gobierno.reserva -= foodCost;
        state.gobierno.acumuladoPeriodo.comidaMenores += foodCost;
        const seller = pickComercioSeller(h.zona);
        settleFoodPurchase(seller, foodCost, count);
        h.despensa += count;
      }
      const careCost = Math.min(state.gobierno.reserva, count * HOUSING_CONSTANTS.costoAcogidaMenorDia);
      if (careCost > 0 && comercios.length > 0) {
        state.gobierno.reserva -= careCost;
        state.gobierno.acumuladoPeriodo.acogidaMenores += careCost;
        comercios[0].ventas += careCost;
      }
      h.despensa = Math.max(0, h.despensa - count);
      accesoComida[h.id] = 1;
      poderAdquisitivo[h.id] = 60;
      continue;
    }

    const zPrice = precioPorZona[h.zona] ?? avgPrice;
    const isStreet = h.estado === 'calle';
    const effPrice = isStreet
      ? zPrice * (1 + HOUSING_CONSTANTS.recargoCalleComidaPct / 100)
      : zPrice;

    // Boycotted firm if any member has active boicotea
    const boycotted = members.find((m) => m.accionIa?.firmaObjetivoId)?.accionIa?.firmaObjetivoId;
    const seller = pickComercioSeller(h.zona, boycotted);

    // Pantry target
    const avgFear = members.reduce((s, m) => s + m.variables.miedo, 0) / count;
    const avgVal = members.reduce((s, m) => s + m.personalidad.valentia, 0) / count;
    let acaparaExtra = 0;
    for (const m of members) {
      if (m.accionIa?.efectos.some((e) => e.id === 'acapara')) {
        acaparaExtra = Math.max(acaparaExtra, 4);
      }
    }
    const objDiasPerPerson = isStreet
      ? 1.0
      : Math.min(
          ECON_CONSTANTS.despensaMaxDias,
          ECON_CONSTANTS.objetivoBaseDias *
            (1 +
              ECON_CONSTANTS.kPrudenciaDespensa * (1 - avgVal / 100) +
              ECON_CONSTANTS.kMiedoDespensa * (avgFear / 100)) +
            acaparaExtra
        );
    const umbralRecompra = isStreet ? 1.0 : ECON_CONSTANTS.umbralRecompraDias;

    let unitsWanted = 0;
    if (h.despensa < umbralRecompra * count) {
      unitsWanted = Math.max(0, objDiasPerPerson * count - h.despensa);
    }
    const maxWorldAvail = Math.max(0, state.alimento.stock);
    unitsWanted = Math.min(unitsWanted, Math.max(count, maxWorldAvail * 0.25));

    const minorCount = members.filter((m) => m.edad < 18).length;
    const adultCount = Math.max(0, count - minorCount);
    const totalNeededCost = unitsWanted * effPrice;

    let unitsBought = 0;
    h.noPudoPagarComida = false;

    if (unitsWanted > 0.05 && totalNeededCost > 0) {
      if (h.dinero >= totalNeededCost) {
        h.dinero -= totalNeededCost;
        settleFoodPurchase(seller, totalNeededCost, unitsWanted);
        unitsBought = unitsWanted;
      } else {
        // Household pays whatever money it has
        const paidByHogar = Math.max(0, h.dinero);
        h.dinero -= paidByHogar;
        const unitsPaidByHogar = paidByHogar / Math.max(0.1, effPrice);
        if (paidByHogar > 0) settleFoodPurchase(seller, paidByHogar, unitsPaidByHogar);
        unitsBought += unitsPaidByHogar;

        const missingUnits = Math.max(0, unitsWanted - unitsPaidByHogar);
        const missingCost = missingUnits * effPrice;
        // Split shortfall proportionally between minors (state covers) & adults (garantia covers)
        const minorFrac = count > 0 ? minorCount / count : 0;
        const minorCostNeeded = missingCost * minorFrac;
        const adultCostNeeded = missingCost * (1 - minorFrac);

        if (minorCostNeeded > 0) {
          const paidMinor = Math.min(state.gobierno.reserva, minorCostNeeded);
          if (paidMinor > 0) {
            state.gobierno.reserva -= paidMinor;
            state.gobierno.acumuladoPeriodo.comidaMenores += paidMinor;
            settleFoodPurchase(seller, paidMinor, paidMinor / Math.max(0.1, effPrice));
            unitsBought += paidMinor / Math.max(0.1, effPrice);
          }
          if (paidMinor + 0.1 < minorCostNeeded) h.noPudoPagarComida = true;
        }
        if (adultCostNeeded > 0 && adultCount > 0) {
          const garWanted = adultCostNeeded * guaranteePct;
          const paidGar = Math.min(state.gobierno.reserva, garWanted);
          if (paidGar > 0) {
            state.gobierno.reserva -= paidGar;
            state.gobierno.acumuladoPeriodo.garantiaAlimentaria += paidGar;
            settleFoodPurchase(seller, paidGar, paidGar / Math.max(0.1, effPrice));
            unitsBought += paidGar / Math.max(0.1, effPrice);
          }
          const unpaidGar = garWanted - paidGar;
          if (unpaidGar > 0) state.gobierno.acumuladoPeriodo.garantiaImpaga += unpaidGar;
        }
      }
      h.despensa += unitsBought;
    }

    // Gasto de vida (only if not starving / has money left)
    const adults = members.filter((m) => m.edad >= 18);
    if (adults.length > 0 && h.dinero > effPrice * count) {
      const avgProp =
        adults.reduce((s, a) => s + getEffectivePropensionGasto(a), 0) / adults.length / 100;
      const dailyNetIncome = h.ultimoIngresoNeto / PERIOD_DAYS;
      const colchon = ECON_CONSTANTS.colchonDias * (count * effPrice);
      const wealthTerm = h.dinero > colchon ? ECON_CONSTANTS.kRiqueza * (h.dinero - colchon) : 0;
      const targetSpend = Math.max(0, avgProp * dailyNetIncome + wealthTerm);
      const actualSpend = Math.min(Math.max(0, h.dinero - count * effPrice * 0.5), targetSpend);

      if (actualSpend > 0.01 && seller) {
        h.dinero -= actualSpend;
        seller.ventas += actualSpend;
        comCapLeft.set(seller.id, Math.max(0, (comCapLeft.get(seller.id) ?? 0) - actualSpend));
      }
    }

    // Consume daily food
    const requiredFood = count * ECON_CONSTANTS.consumoPorNpc;
    const consumed = Math.min(h.despensa, requiredFood);
    h.despensa = Math.max(0, h.despensa - consumed);
    if (isStreet && h.despensa > 0.5 * count) {
      // Street households cannot store large pantry overnight
      h.despensa = 0.5 * count;
    }

    const foodRatio = clamp(consumed / Math.max(0.1, requiredFood), 0, 1);
    accesoComida[h.id] = Number(foodRatio.toFixed(2));

    const dailyNeed = Math.max(1, count * effPrice + (h.alquilerPagadoPeriodo / PERIOD_DAYS));
    const power = clamp(((h.ultimoIngresoNeto / PERIOD_DAYS + h.dinero / 14) / dailyNeed) * 45, 0, 100);
    poderAdquisitivo[h.id] = Number(power.toFixed(1));
  }

  // 7. Accrue daily public salaries, pensions, aid, maintenance & press
  const salDia = ECON_CONSTANTS.salarioBasePublico * (state.gobierno.palancasVigentes.salarioPublico / 100);
  const ayuDia = state.gobierno.palancasVigentes.ayudaSocial;

  for (const n of vivos) {
    const roleDef = ROLE_CATALOG[n.rol];
    if (roleDef.publico && !n.accionIa?.fueraDePuesto) {
      state.gobierno.acumuladoPeriodo.nominaPorNpc[n.id] =
        (state.gobierno.acumuladoPeriodo.nominaPorNpc[n.id] ?? 0) + salDia;
      state.gobierno.acumuladoPeriodo.nominaDevengada += salDia;
    } else if (n.rol === 'jubilado') {
      state.gobierno.acumuladoPeriodo.pensionesPorNpc[n.id] =
        (state.gobierno.acumuladoPeriodo.pensionesPorNpc[n.id] ?? 0) + ECON_CONSTANTS.pensionBase;
      state.gobierno.acumuladoPeriodo.pensionesDevengadas += ECON_CONSTANTS.pensionBase;
      if (ayuDia > 0) {
        state.gobierno.acumuladoPeriodo.ayudaPorNpc[n.id] =
          (state.gobierno.acumuladoPeriodo.ayudaPorNpc[n.id] ?? 0) + ayuDia;
        state.gobierno.acumuladoPeriodo.ayudaDevengada += ayuDia;
      }
    } else if (n.rol === 'desempleado' && ayuDia > 0) {
      state.gobierno.acumuladoPeriodo.ayudaPorNpc[n.id] =
        (state.gobierno.acumuladoPeriodo.ayudaPorNpc[n.id] ?? 0) + ayuDia;
      state.gobierno.acumuladoPeriodo.ayudaDevengada += ayuDia;
    }
  }
  state.gobierno.acumuladoPeriodo.dias += 1;

  // Update economy output snapshot
  state.ultimaSalidaEconomica.accesoComida = accesoComida;
  state.ultimaSalidaEconomica.poderAdquisitivo = poderAdquisitivo;
  state.ultimaSalidaEconomica.precioAlimento = precioPorZona;
  state.ultimaSalidaEconomica.precioGlobal = state.alimento.precio;
  state.ultimaSalidaEconomica.inflacion = state.gobierno.inflacion;

  if (!isM1Plus) {
    // Keep legacy view synced in M0 too
    syncLegacyEnterprisesView(state);
  }
}

export function runPaydayEconomyV2(state: GameState): void {
  const isM1Plus = state.config.nivelMundo !== 'M0';
  const isM2Plus = state.config.nivelMundo !== 'M0' && state.config.nivelMundo !== 'M1';
  const isM4 = state.config.nivelMundo === 'M4' || state.config.economiaModulo === 'fiscal';
  const zones = getWorldZones(state);
  const taxRate = clamp(state.gobierno.palancasVigentes.impuesto, 0, 75) / 100;

  const npcById = new Map<string, Npc>(state.npcs.map((n) => [n.id, n]));
  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
  const firmaById = new Map<string, Firma>(state.firmas.map((f) => [f.id, f]));

  // Track net household income during this payday
  for (const h of state.hogares) {
    h.ultimoIngresoNeto = 0;
    h.alquilerPagadoPeriodo = 0;
  }
  for (const n of state.npcs) {
    if (n.vivo) n.economia.ultimoIngresoNeto = 0;
  }

  let taxCollectedTotal = 0;
  const creditNetToNpc = (npc: Npc, gross: number, taxable: boolean) => {
    if (gross <= 0) return;
    const tax = taxable ? gross * taxRate : 0;
    const net = gross - tax;
    if (tax > 0) {
      state.gobierno.reserva += tax;
      taxCollectedTotal += tax;
    }
    const h = hogarById.get(npc.hogarId);
    if (h) {
      h.dinero += net;
      h.ultimoIngresoNeto += net;
    } else {
      state.gobierno.reserva += net;
    }
    npc.economia.ultimoIngresoNeto += net / PERIOD_DAYS;
  };

  // ====================================================================
  // 1. FIRMS SETTLEMENT: ads -> payroll -> hiring -> manager -> profit
  // ====================================================================
  const activeMedios = state.medios.filter((m) => m.activa !== false);
  const medioFirmaPairs = activeMedios
    .map((m) => ({ m, f: m.firmaId ? firmaById.get(m.firmaId) : undefined }))
    .filter((p): p is { m: MediaOutlet; f: Firma } => Boolean(p.f && p.f.activa));

  for (const m of activeMedios) {
    m.ingresos.publicidad = 0;
    m.ingresos.fondosEstado = 0;
  }

  // Advertising outflow from agro & comercio into medio firms
  if (isM1Plus && medioFirmaPairs.length > 0) {
    const totalWeight = medioFirmaPairs.reduce(
      (s, { m }) => s + Math.max(1, m.alcancePct * m.credibilidad),
      0
    );
    for (const f of state.firmas) {
      if (!f.activa || (f.rubro !== 'comercio' && f.rubro !== 'agro') || f.ventas <= 0) continue;
      const adBudget = f.ventas * FIRM_CONSTANTS.pctPublicidad;
      f.ventas -= adBudget;
      let distributed = 0;
      for (let i = 0; i < medioFirmaPairs.length; i++) {
        const { m, f: mf } = medioFirmaPairs[i];
        const w = Math.max(1, m.alcancePct * m.credibilidad) / totalWeight;
        const share = i === medioFirmaPairs.length - 1 ? adBudget - distributed : adBudget * w;
        distributed += share;
        mf.ventas += share;
        m.ingresos.publicidad += share;
      }
    }
  }

  // Settlement for all active firms
  for (const f of state.firmas) {
    if (!f.activa) continue;
    const grossRevenue = f.ventas;
    f.ventas = 0;
    f.ultimoIngresoPeriodo = Number(grossRevenue.toFixed(2));

    // Prune dead/invalid employees
    f.empleados = f.empleados.filter((id) => {
      const emp = npcById.get(id);
      return Boolean(emp && emp.vivo && emp.empleadorId === f.id);
    });

    const activeWorkers = f.empleados
      .map((id) => npcById.get(id)!)
      .filter((emp) => !emp.accionIa?.fueraDePuesto);

    // Reference payroll for period
    const refs = new Map<string, number>();
    let totalRef = 0;
    for (const emp of activeWorkers) {
      const def = ROLE_CATALOG[emp.rol];
      const range = def.ingreso ?? [7.5, 9.5];
      const baseDaily = range[0] + (emp.economia.ingresoPos / 100) * (range[1] - range[0]);
      const dailyRef = baseDaily * (getNpcProductivity(emp, state) / 100);
      const periodRef = dailyRef * PERIOD_DAYS * 0.65;
      refs.set(emp.id, periodRef);
      f.refPorEmpleado[emp.id] = Number(periodRef.toFixed(2));
      totalRef += periodRef;
    }

    // Manager salary if gerente has 0 shares
    const gerente = f.gerenteId ? npcById.get(f.gerenteId) : undefined;
    const gerenteNeedsSalary =
      Boolean(gerente && gerente.vivo) &&
      !f.partes.some((p) => p.tipo === 'npc' && p.id === f.gerenteId) &&
      !activeWorkers.some((w) => w.id === f.gerenteId);
    const gerenteRef = gerenteNeedsSalary ? 8.5 * PERIOD_DAYS * 0.65 * FIRM_CONSTANTS.sueldoGerenteFactor : 0;
    totalRef += gerenteRef;

    let wageFund = grossRevenue * f.parteSueldos;
    const minWageFund = totalRef * (ECON_CONSTANTS.pisoSueldoPct / 100);
    if (wageFund < minWageFund && f.caja > 0) {
      wageFund += Math.min(f.caja, minWageFund - wageFund);
    }

    // Hiring if wageFund > totalRef and firm has vacancies
    const roleCaps = getFirmaRoleCaps(state, f);
    if (totalRef > 0 && wageFund > totalRef && f.locales.length > 0) {
      const unempPool = state.npcs.filter(
        (n) => n.vivo && n.rol === 'desempleado' && n.edad >= 18 && n.edad < 65
      );
      let hired = 0;
      for (const [rStr, cap] of Object.entries(roleCaps)) {
        if (hired >= ECON_CONSTANTS.maxContratacionesPorPeriodo) break;
        const role = rStr as RoleId;
        if (typeof cap !== 'number') continue;
        const curCount = f.empleados.filter((id) => npcById.get(id)?.rol === role).length;
        let vac = cap - curCount;
        const def = ROLE_CATALOG[role];
        const estCost = ((def.ingreso?.[0] ?? 8) + (def.ingreso?.[1] ?? 10)) * 0.5 * PERIOD_DAYS * 0.65;
        while (vac > 0 && hired < ECON_CONSTANTS.maxContratacionesPorPeriodo && wageFund >= totalRef + estCost) {
          const cand = unempPool.find(
            (u) => u.rol === 'desempleado' && u.educacion.nivel >= def.educMin
          );
          if (!cand) break;
          cand.rol = role;
          cand.empleadorId = f.id;
          f.empleados.push(cand.id);
          activeWorkers.push(cand);
          refs.set(cand.id, estCost);
          f.refPorEmpleado[cand.id] = Number(estCost.toFixed(2));
          totalRef += estCost;
          vac--;
          hired++;
        }
      }
    }

    const factor =
      totalRef > 0
        ? clamp(wageFund / totalRef, 0, ECON_CONSTANTS.factorMax)
        : grossRevenue > 0
        ? 1.05
        : 1.0;
    f.factor = Number(factor.toFixed(3));

    let paidWages = 0;
    const maxPayablePool = grossRevenue + Math.max(0, f.caja);
    for (const emp of activeWorkers) {
      const pay = (refs.get(emp.id) ?? 0) * factor;
      const remainingPool = Math.max(0, maxPayablePool - paidWages);
      const actualPay = Math.min(remainingPool, pay);
      creditNetToNpc(emp, actualPay, true);
      paidWages += actualPay;
    }
    if (gerenteNeedsSalary && gerente) {
      const gPay = gerenteRef * factor;
      const remainingPool = Math.max(0, maxPayablePool - paidWages);
      const actualGPay = Math.min(remainingPool, gPay);
      creditNetToNpc(gerente, actualGPay, true);
      paidWages += actualGPay;
    }
    f.ultimoSueldosPeriodo = Number(paidWages.toFixed(2));

    // Remaining money after wages: grossRevenue - paidWages goes to profit or deficit in caja
    const netSurplus = grossRevenue - paidWages;
    f.ultimaGanancia = Number(netSurplus.toFixed(2));
    f.historialGanancias = [...f.historialGanancias.slice(-7), f.ultimaGanancia];

    if (netSurplus >= 0) {
      const reinv = f.partes.length > 0 ? netSurplus * FIRM_CONSTANTS.pctReinversion : netSurplus;
      f.caja += reinv;
      const distPool = netSurplus - reinv;

      if (distPool > 0 && f.partes.length > 0) {
        let distUsed = 0;
        for (let i = 0; i < f.partes.length; i++) {
          const part = f.partes[i];
          const cut =
            i === f.partes.length - 1
              ? distPool - distUsed
              : distPool * (part.pct / 100);
          distUsed += cut;
          if (part.tipo === 'npc') {
            const owner = npcById.get(part.id);
            if (owner && owner.vivo) creditNetToNpc(owner, cut, true);
            else state.gobierno.reserva += cut;
          } else if (part.tipo === 'firma') {
            const parent = firmaById.get(part.id);
            if (parent && parent.activa) parent.caja += cut;
            else state.gobierno.reserva += cut;
          } else {
            state.gobierno.reserva += cut;
          }
        }
      }

      if (f.partes.length === 0 && f.caja > FIRM_CONSTANTS.cajaMaxSinDueno) {
        const excess = f.caja - FIRM_CONSTANTS.cajaMaxSinDueno;
        f.caja -= excess;
        state.gobierno.reserva += excess;
      }
      f.periodosEnPerdida = f.caja <= 2 && netSurplus <= 0.1 ? f.periodosEnPerdida + 1 : 0;
    } else {
      f.caja += netSurplus; // subtracts deficit cleanly from caja (total money conserved!)
      f.periodosEnPerdida += 1;
    }

    // Track factor tramos and layoffs
    if (factor > 1.01) {
      f.ultimoTramo = 'aumento';
      f.periodosFactorAlto += 1;
      f.periodosFactorBajo = 0;
    } else if (factor < ECON_CONSTANTS.pisoSueldoPct / 100) {
      f.ultimoTramo = 'despido';
      f.periodosFactorAlto = 0;
      f.periodosFactorBajo += 1;
      if (isM1Plus && f.empleados.length > 1) {
        const layoffs = Math.min(ECON_CONSTANTS.maxPaseDesempleoPorDia, f.empleados.length - 1);
        for (let i = 0; i < layoffs; i++) {
          const firedId = f.empleados.pop();
          if (firedId) {
            const fired = npcById.get(firedId);
            if (fired) {
              fired.rol = 'desempleado';
              fired.empleadorId = null;
            }
          }
        }
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_emp_desp'),
          dia: state.reloj.dia,
          tipo: 'empresa_despido',
          zona: f.zona,
          empresaId: f.id,
          cantidad: layoffs,
          factor: f.factor,
          origen: `firma:${f.id}/respuesta`,
          causa: f.ultimaCausa,
        });
      }
    } else if (factor < 0.99) {
      f.ultimoTramo = 'recorte';
      f.periodosFactorAlto = 0;
      f.periodosFactorBajo += 1;
    } else {
      f.ultimoTramo = 'normal';
      f.periodosFactorAlto = 0;
      f.periodosFactorBajo = 0;
    }
  }

  // Update market share cuotaZona & monopoly pricing power
  const rubros: FirmRubro[] = ['agro', 'comercio', 'construccion', 'inmobiliaria', 'medio', 'banco'];
  const cuotaMercadoSalida: EconomyOutput['cuotaMercado'] = {};
  for (const rubro of rubros) {
    for (const z of zones) {
      const fZone = state.firmas.filter((f) => f.activa && f.rubro === rubro && f.zona === z);
      const sumRev = fZone.reduce((s, f) => s + Math.max(0.01, f.ultimoIngresoPeriodo), 0);
      let leader: { firma: string; cuota: number } = { firma: '-', cuota: 0 };
      for (const f of fZone) {
        const share = fZone.length === 1 ? 1 : Math.max(0.01, f.ultimoIngresoPeriodo) / Math.max(0.01, sumRev);
        const prevShare = f.cuotaZona[z] ?? 0;
        f.cuotaZona[z] = Number(share.toFixed(3));
        if (share > leader.cuota) {
          leader = { firma: f.id, cuota: Number((share * 100).toFixed(1)) };
        }
        if (isM1Plus && share >= FIRM_CONSTANTS.umbralPoderPrecio) {
          const excess = (share - FIRM_CONSTANTS.umbralPoderPrecio) / (1 - FIRM_CONSTANTS.umbralPoderPrecio);
          f.margenPoder = Number(clamp(excess * FIRM_CONSTANTS.margenPoderMax, 0, FIRM_CONSTANTS.margenPoderMax).toFixed(3));
          if (prevShare < FIRM_CONSTANTS.umbralPoderPrecio && fZone.length > 1) {
            emitSimEvent(state, {
              id: nextSeqId(state, 'ev_mono'),
              dia: state.reloj.dia,
              tipo: 'monopolio',
              zona: z,
              rubro,
              firmaId: f.id,
              cuota: Number((share * 100).toFixed(1)),
              causa: `firma:${f.id}/mercado`,
            });
          }
        } else {
          f.margenPoder = 0;
        }
      }
      if (leader.firma !== '-') {
        cuotaMercadoSalida[`${rubro}:${z}`] = leader;
      }
    }
  }

  // ====================================================================
  // 2. RENT & MAINTENANCE (casas y locales -> firmas de construcción)
  // ====================================================================
  const constructoras = state.firmas.filter((f) => f.activa && f.rubro === 'construccion');
  const pickConstructora = (zona: ZoneId): Firma | undefined =>
    constructoras.find((f) => f.zona === zona) ?? constructoras[0];

  for (const c of state.casas) {
    c.alquilerCobradoPeriodo = 0;
    const occ = c.hogarId ? hogarById.get(c.hogarId) : undefined;
    if (occ && occ.estado === 'con_casa') {
      const isSelfOwned =
        (c.dueno.tipo === 'hogar' && c.dueno.id === occ.id) ||
        (c.dueno.tipo === 'npc' && occ.miembros.includes(c.dueno.id));
      if (!isSelfOwned && !occ.ocupandoCasaId) {
        if (occ.dinero >= c.alquiler) {
          occ.dinero -= c.alquiler;
          occ.alquilerPagadoPeriodo = c.alquiler;
          occ.periodosSinPagar = 0;
          c.alquilerCobradoPeriodo = c.alquiler;

          const rentTax = c.alquiler * taxRate;
          const rentNet = c.alquiler - rentTax;
          state.gobierno.reserva += rentTax;
          taxCollectedTotal += rentTax;

          if (c.dueno.tipo === 'hogar') {
            const ownerH = hogarById.get(c.dueno.id);
            if (ownerH) ownerH.dinero += rentNet;
            else state.gobierno.reserva += rentNet;
          } else if (c.dueno.tipo === 'npc') {
            const ownerNpc = npcById.get(c.dueno.id);
            const ownerH = ownerNpc ? hogarById.get(ownerNpc.hogarId) : undefined;
            if (ownerH) ownerH.dinero += rentNet;
            else state.gobierno.reserva += rentNet;
          } else if (c.dueno.tipo === 'firma') {
            const ownerFirm = firmaById.get(c.dueno.id);
            if (ownerFirm && ownerFirm.activa) ownerFirm.caja += rentNet;
            else state.gobierno.reserva += rentNet;
          } else {
            state.gobierno.reserva += rentNet;
          }
        } else {
          occ.periodosSinPagar += 1;
        }
      }
      // Track hacinamiento
      if (occ.miembros.length > c.capacidad) occ.periodosHacinado += 1;
      else occ.periodosHacinado = 0;
    }

    // House decay & maintenance paid by owner to constructora
    const decay = c.hogarId
      ? HOUSING_CONSTANTS.decaimientoEstadoCasaPeriodo
      : HOUSING_CONSTANTS.estadoCasaSinMantVacia;
    c.estado = clamp(c.estado - decay, 0, 100);
    if (!c.hogarId) c.diasVaciaSinMantenimiento += PERIOD_DAYS;
    else c.diasVaciaSinMantenimiento = 0;

    const mantCost = BUILDING_CATALOG[c.tipo].mantenimientoPeriodo;
    const constr = pickConstructora(c.zona);
    if (c.estado < 96 && constr && mantCost > 0) {
      let paid = false;
      if (c.dueno.tipo === 'hogar') {
        const oh = hogarById.get(c.dueno.id);
        if (oh && oh.dinero >= mantCost * 1.5) {
          oh.dinero -= mantCost;
          constr.caja += mantCost;
          paid = true;
        }
      } else if (c.dueno.tipo === 'npc') {
        const on = npcById.get(c.dueno.id);
        const oh = on ? hogarById.get(on.hogarId) : undefined;
        if (oh && oh.dinero >= mantCost * 1.5) {
          oh.dinero -= mantCost;
          constr.caja += mantCost;
          paid = true;
        }
      } else if (c.dueno.tipo === 'firma') {
        const ofirm = firmaById.get(c.dueno.id);
        if (ofirm && ofirm.activa && ofirm.caja >= mantCost) {
          ofirm.caja -= mantCost;
          constr.caja += mantCost;
          paid = true;
        }
      }
      if (paid) c.estado = clamp(c.estado + decay + 2, 0, 100);
    }
  }

  // Private firm local maintenance
  const parcelById = new Map<string, Parcela>(state.parcelas.map((p) => [p.id, p]));
  for (const f of state.firmas) {
    if (!f.activa || f.rubro === 'construccion') continue;
    const constr = pickConstructora(f.zona);
    if (!constr) continue;
    for (const pid of f.locales) {
      const p = parcelById.get(pid);
      if (!p?.edificio?.activo) continue;
      const mant = BUILDING_CATALOG[p.edificio.tipo].mantenimientoPeriodo;
      if (mant > 0 && f.caja >= mant) {
        f.caja -= mant;
        constr.caja += mant;
        p.edificio.estadoSalud = clamp(p.edificio.estadoSalud + 2, 0, 100);
      } else if (mant > 0) {
        p.edificio.estadoSalud = clamp(p.edificio.estadoSalud - 4, 20, 100);
      }
    }
  }

  // ====================================================================
  // 3. STATE SETTLEMENT & AUTOPILOT (M2+ & G0)
  // ====================================================================
  const acum = state.gobierno.acumuladoPeriodo;
  const fin = state.gobierno.finanzas;
  const opBreak = computeMaintenanceBreakdown(
    state.parcelas,
    state.gobierno.palancasVigentes.nivelObras,
    Math.max(1, state.npcs.filter((n) => n.vivo).length),
    state.config.poblacionInicial
  );

  const nominaDue = acum.nominaDevengada;
  const pensDue = acum.pensionesDevengadas;
  const ayuDue = acum.ayudaDevengada;
  const opDue = opBreak.operacionTotal + (acum.operacion ?? 0);
  const prensaDue =
    activeMedios.length > 0 ? state.gobierno.palancasVigentes.prensa + (acum.prensa ?? 0) : 0;
  const totalDue = nominaDue + pensDue + ayuDue + opDue + prensaDue;

  const availNom = Math.max(0, state.gobierno.reserva);
  const ratioNom = nominaDue > 0 ? Math.min(1, availNom / nominaDue) : 1;
  const nomPaid = nominaDue * ratioNom;
  if (nomPaid > 0 && nominaDue > 0) {
    state.gobierno.reserva -= nomPaid;
    for (const [nid, amt] of Object.entries(acum.nominaPorNpc)) {
      const npc = npcById.get(nid);
      if (npc && npc.vivo) creditNetToNpc(npc, amt * ratioNom, true);
    }
  }

  const availPens = Math.max(0, state.gobierno.reserva);
  const ratioPens = pensDue > 0 ? Math.min(1, availPens / pensDue) : 1;
  const pensPaid = pensDue * ratioPens;
  if (pensPaid > 0 && pensDue > 0) {
    state.gobierno.reserva -= pensPaid;
    for (const [nid, amt] of Object.entries(acum.pensionesPorNpc)) {
      const npc = npcById.get(nid);
      if (npc && npc.vivo) creditNetToNpc(npc, amt * ratioPens, false);
    }
  }

  const availDisc = Math.max(0, state.gobierno.reserva);
  const discDue = ayuDue + opDue + prensaDue;
  const ratioDisc = discDue > 0 ? Math.min(1, availDisc / discDue) : 1;
  const ayuPaid = ayuDue * ratioDisc;
  const opPaid = opDue * ratioDisc;
  const prensaPaid = prensaDue * ratioDisc;

  if (ayuPaid > 0 && ayuDue > 0) {
    state.gobierno.reserva -= ayuPaid;
    for (const [nid, amt] of Object.entries(acum.ayudaPorNpc)) {
      const npc = npcById.get(nid);
      if (npc && npc.vivo) creditNetToNpc(npc, amt * ratioDisc, false);
    }
  }

  // Operation maintenance feeds constructora if active (zero leak!)
  if (opPaid > 0) {
    if (constructoras.length > 0) {
      state.gobierno.reserva -= opPaid;
      const share = opPaid / constructoras.length;
      for (const cf of constructoras) cf.caja += share;
    } else {
      const anyActive = state.firmas.find((f) => f.activa);
      if (anyActive) {
        state.gobierno.reserva -= opPaid;
        anyActive.caja += opPaid;
      }
    }
  }

  // Press budget split evenly to active media firms
  if (prensaPaid > 0 && medioFirmaPairs.length > 0) {
    state.gobierno.reserva -= prensaPaid;
    const perM = prensaPaid / medioFirmaPairs.length;
    for (const { m, f } of medioFirmaPairs) {
      f.caja += perM;
      m.ingresos.fondosEstado += perM;
      m.finanzas.fondosEstado += perM;
    }
  }

  // Update finanzas ledger
  fin.ingresos = Number(taxCollectedTotal.toFixed(2));
  fin.nomina = Number(nomPaid.toFixed(2));
  fin.pensiones = Number(pensPaid.toFixed(2));
  fin.ayudaSocial = Number(ayuPaid.toFixed(2));
  fin.garantiaAlimentaria = Number(acum.garantiaAlimentaria.toFixed(2));
  fin.garantiaImpaga = Number(acum.garantiaImpaga.toFixed(2));
  fin.comidaMenores = Number(acum.comidaMenores.toFixed(2));
  fin.acogidaMenores = Number(acum.acogidaMenores.toFixed(2));
  fin.mantenimiento = Number(opBreak.mantenimientoTotal.toFixed(2));
  fin.operacionObras = Number(opBreak.operacionObras.toFixed(2));
  fin.operacion = Number(opPaid.toFixed(2));
  fin.prensa = Number(prensaPaid.toFixed(2));
  fin.importaciones = Number(acum.importaciones.toFixed(2));
  fin.exportaciones = Number(acum.exportaciones.toFixed(2));
  const totalOut =
    fin.nomina +
    fin.pensiones +
    fin.ayudaSocial +
    fin.garantiaAlimentaria +
    fin.comidaMenores +
    fin.acogidaMenores +
    fin.operacion +
    fin.prensa;
  fin.saldo = Number((fin.ingresos - totalOut).toFixed(2));
  state.ultimoSaldoCierre = fin.saldo;

  const missing = Math.max(0, totalDue - (nomPaid + pensPaid + ayuPaid + opPaid + prensaPaid));
  const wasImpago = fin.impago;
  fin.impago = missing > 1;
  fin.alcanzaNomina = fin.impago && nominaDue > 0 && ratioNom < 0.98;
  fin.prorrateoNomina = Number(ratioNom.toFixed(3));
  fin.prorrateoPensionGarantia = Number(ratioPens.toFixed(3));
  fin.prorrateoDiscrecional = Number(ratioDisc.toFixed(3));

  if (fin.impago) {
    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_impago'),
      dia: state.reloj.dia,
      tipo: 'impago',
      zona: zones[0] ?? 'centro',
      faltante: Number(missing.toFixed(2)),
      alcanzaNomina: fin.alcanzaNomina,
      causa: state.ultimaCausaPalanca,
    });
  } else if (wasImpago) {
    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_impago_fin'),
      dia: state.reloj.dia,
      tipo: 'impago_fin',
      zona: zones[0] ?? 'centro',
    });
  }

  // Reset period accumulators
  acum.dias = 0;
  acum.impuestos = 0;
  acum.nominaPorNpc = {};
  acum.pensionesPorNpc = {};
  acum.ayudaPorNpc = {};
  acum.nominaDevengada = 0;
  acum.pensionesDevengadas = 0;
  acum.ayudaDevengada = 0;
  acum.garantiaAlimentaria = 0;
  acum.garantiaImpaga = 0;
  acum.comidaMenores = 0;
  acum.acogidaMenores = 0;
  acum.operacion = 0;
  acum.prensa = 0;
  acum.importaciones = 0;
  acum.exportaciones = 0;

  // Autopilot public service build when G0 + M2+
  if (isM2Plus && state.config.nivelGobernador === 'G0') {
    const vivosCount = state.npcs.filter((n) => n.vivo).length;
    const caps = getBuildingJobCaps(
      state.parcelas,
      vivosCount,
      state.gobierno.palancasVigentes.nivelObras,
      state.config.poblacionInicial,
      state.gobierno.cuposFijos
    );
    const targetMed = Math.max(1, Math.round(vivosCount * ECON_CONSTANTS.objetivoCobertura.medico));
    const targetPol = Math.max(1, Math.round(vivosCount * ECON_CONSTANTS.objetivoCobertura.policia));
    const freePub = state.parcelas.find((p) => p.tipoParcela === 'publica' && p.estado === 'libre');
    if (freePub && (!state.autopilotLastBuildDay || state.reloj.dia - state.autopilotLastBuildDay >= 21)) {
      let toBuild: 'hospital' | 'comisaria' | null = null;
      if (caps.medico < targetMed * 0.8 && state.gobierno.reserva >= BUILDING_CATALOG.hospital.costoObra * 1.6) {
        toBuild = 'hospital';
      } else if (caps.policia < targetPol * 0.8 && state.gobierno.reserva >= BUILDING_CATALOG.comisaria.costoObra * 1.6) {
        toBuild = 'comisaria';
      }
      if (toBuild) {
        const def = BUILDING_CATALOG[toBuild];
        state.gobierno.reserva -= def.costoObra;
        if (constructoras.length > 0) constructoras[0].caja += def.costoObra;
        freePub.estado = 'en_obra';
        freePub.edificio = {
          id: nextSeqId(state, 'ed'),
          tipo: toBuild,
          parcelaId: freePub.id,
          dueno: 'estado',
          duenoRef: { tipo: 'estado', id: 'estado' },
          estado: 'en_obra',
          activo: false,
          estadoSalud: 100,
          diasObraRestantes: def.diasObra,
          diasObraTotal: def.diasObra,
          zona: freePub.zona,
        };
        state.autopilotLastBuildDay = state.reloj.dia;
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_obra_i'),
          dia: state.reloj.dia,
          tipo: 'obra_inicio',
          zona: freePub.zona,
          parcelaId: freePub.id,
          edificio: toBuild,
          dueno: 'estado',
          costo: def.costoObra,
          diasObra: def.diasObra,
          causa: 'estado:piloto_automatico',
        });
      }
    }
  }

  // ====================================================================
  // 4. HOUSING MARKET (evictions, applications, price drops, home purchase)
  // ====================================================================
  const casaById = new Map<string, Casa>(state.casas.map((c) => [c.id, c]));

  // Evictions
  for (const h of state.hogares) {
    if (
      h.estado === 'con_casa' &&
      h.casaId &&
      h.periodosSinPagar >= HOUSING_CONSTANTS.periodosSinPagarDesalojo
    ) {
      const casa = casaById.get(h.casaId);
      if (casa) casa.hogarId = null;
      const oldCasaId = h.casaId;
      h.casaId = null;
      h.estado = 'calle';
      h.periodosSinPagar = 0;
      h.periodosHacinado = 0;

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_desalojo'),
        dia: state.reloj.dia,
        tipo: 'desalojo',
        zona: h.zona,
        hogarId: h.id,
        casaId: oldCasaId,
        periodosSinPagar: HOUSING_CONSTANTS.periodosSinPagarDesalojo,
        causa: 'vivienda:impago_alquiler',
      });
      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_calle_i'),
        dia: state.reloj.dia,
        tipo: 'calle_inicio',
        zona: h.zona,
        hogarId: h.id,
        causa: 'vivienda:desalojo',
      });
    }
  }

  // Housing search: street, overcrowded, or overloaded rent
  const freeHouses = state.casas.filter(
    (c) => !c.hogarId && !c.ocupadaPorAccion && c.estado > HOUSING_CONSTANTS.umbralAbandonoCasa
  );
  const seekers = state.hogares.filter((h) => {
    if (h.estado === 'acogida') return false;
    if (h.estado === 'calle') return true;
    const c = h.casaId ? casaById.get(h.casaId) : undefined;
    if (!c) return true;
    if (h.miembros.length > c.capacidad) return true;
    const isSelfOwner =
      (c.dueno.tipo === 'hogar' && c.dueno.id === h.id) ||
      (c.dueno.tipo === 'npc' && h.miembros.includes(c.dueno.id));
    if (!isSelfOwner && h.ultimoIngresoNeto > 0 && (c.alquiler / h.ultimoIngresoNeto) * 100 > HOUSING_CONSTANTS.pctAlquilerMax) {
      return true;
    }
    return false;
  });

  // Sort seekers by purchasing capacity descending
  seekers.sort((a, b) => (b.ultimoIngresoNeto + b.dinero * 0.25) - (a.ultimoIngresoNeto + a.dinero * 0.25));

  for (const h of seekers) {
    const allowedZones = new Set([h.zona, ...(state.zonas[h.zona]?.vecinas ?? [])]);
    const maxPay = Math.max(h.ultimoIngresoNeto * 0.55, h.dinero * 0.4);
    const idx = freeHouses.findIndex(
      (c) => allowedZones.has(c.zona) && c.alquiler <= maxPay && c.capacidad >= h.miembros.length
    );
    if (idx >= 0) {
      const [chosen] = freeHouses.splice(idx, 1);
      const prevCasaId = h.casaId;
      const wasStreet = h.estado === 'calle';
      if (prevCasaId) {
        const oldC = casaById.get(prevCasaId);
        if (oldC) oldC.hogarId = null;
      }
      chosen.hogarId = h.id;
      h.casaId = chosen.id;
      h.estado = 'con_casa';
      h.zona = chosen.zona;
      h.periodosSinPagar = 0;
      h.periodosHacinado = 0;
      for (const mid of h.miembros) {
        const m = npcById.get(mid);
        if (m) m.zona = chosen.zona;
      }

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_mud'),
        dia: state.reloj.dia,
        tipo: 'mudanza',
        zona: chosen.zona,
        hogarId: h.id,
        deCasaId: prevCasaId,
        aCasaId: chosen.id,
      });
      if (wasStreet) {
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_calle_f'),
          dia: state.reloj.dia,
          tipo: 'calle_fin',
          zona: chosen.zona,
          hogarId: h.id,
        });
      }
    }
  }

  // Lower rent slightly on houses still empty
  for (const c of freeHouses) {
    const base = BUILDING_CATALOG[c.tipo].alquilerBase ?? 12;
    const floor = base * HOUSING_CONSTANTS.alquilerPisoFactor;
    c.alquiler = Number(Math.max(floor, c.alquiler * (1 - HOUSING_CONSTANTS.pasoAlquilerPct / 100)).toFixed(2));
  }

  // Home purchase by wealthy renter households
  if (isM1Plus) {
    let purchasesLeft = 3;
    for (const h of state.hogares) {
      if (purchasesLeft <= 0) break;
      if (h.estado !== 'con_casa' || !h.casaId) continue;
      const c = casaById.get(h.casaId);
      if (!c) continue;
      const isOwner =
        (c.dueno.tipo === 'hogar' && c.dueno.id === h.id) ||
        (c.dueno.tipo === 'npc' && h.miembros.includes(c.dueno.id));
      if (isOwner) continue;
      const housePrice = c.alquiler * HOUSING_CONSTANTS.multiploCasa;
      if (h.dinero >= housePrice * 1.45) {
        h.dinero -= housePrice;
        if (c.dueno.tipo === 'firma') {
          const sellerFirm = firmaById.get(c.dueno.id);
          if (sellerFirm) sellerFirm.caja += housePrice;
          else state.gobierno.reserva += housePrice;
        } else if (c.dueno.tipo === 'hogar') {
          const sh = hogarById.get(c.dueno.id);
          if (sh) sh.dinero += housePrice;
          else state.gobierno.reserva += housePrice;
        } else if (c.dueno.tipo === 'npc') {
          const sn = npcById.get(c.dueno.id);
          const sh = sn ? hogarById.get(sn.hogarId) : undefined;
          if (sh) sh.dinero += housePrice;
          else state.gobierno.reserva += housePrice;
        } else {
          state.gobierno.reserva += housePrice;
        }
        c.dueno = { tipo: 'hogar', id: h.id };
        purchasesLeft--;
      }
    }
  }

  // ====================================================================
  // 5. FIRM M&A (firma_compra)
  // ====================================================================
  state.mercadoStats.comprasPeriodo = 0;
  state.mercadoStats.quiebrasPeriodo = 0;
  state.mercadoStats.fundacionesPeriodo = 0;
  state.mercadoStats.construccionesPeriodo = 0;

  if (isM1Plus) {
    let buys = 0;
    const buyers = state.firmas
      .filter((f) => f.activa && f.caja >= 500 && f.factor >= 1.05)
      .sort((a, b) => b.caja - a.caja);
    const targets = state.firmas.filter(
      (f) => f.activa && f.caja < 40 && f.periodosEnPerdida >= 1 && f.locales.length > 0
    );
    for (const buyer of buyers) {
      if (buys >= FIRM_CONSTANTS.maxComprasPorPeriodo) break;
      const target = targets.find(
        (t) =>
          t.activa &&
          t.id !== buyer.id &&
          t.rubro === buyer.rubro &&
          (t.zona === buyer.zona || state.zonas[buyer.zona]?.vecinas.includes(t.zona))
      );
      if (!target) continue;
      const avgProf =
        target.historialGanancias.length > 0
          ? target.historialGanancias.reduce((s, g) => s + g, 0) / target.historialGanancias.length
          : 0;
      const price = Math.max(120, avgProf * FIRM_CONSTANTS.multiploCompraFirma + target.locales.length * 140);
      if (buyer.caja < price + 150) continue;

      buyer.caja -= price;
      // Pay target owners
      if (target.partes.length > 0) {
        let paid = 0;
        for (let i = 0; i < target.partes.length; i++) {
          const p = target.partes[i];
          const cut = i === target.partes.length - 1 ? price - paid : price * (p.pct / 100);
          paid += cut;
          if (p.tipo === 'npc') {
            const o = npcById.get(p.id);
            const oh = o ? hogarById.get(o.hogarId) : undefined;
            if (oh) oh.dinero += cut;
            else state.gobierno.reserva += cut;
            if (o) o.partes = o.partes.filter((x) => x.firmaId !== target.id);
          } else if (p.tipo === 'firma') {
            const pf = firmaById.get(p.id);
            if (pf) pf.caja += cut;
            else state.gobierno.reserva += cut;
          } else {
            state.gobierno.reserva += cut;
          }
        }
      } else {
        state.gobierno.reserva += price;
      }

      // Absorb target into buyer (preserve caja cleanly!)
      buyer.caja += target.caja;
      target.caja = 0;
      buyer.locales.push(...target.locales);
      for (const pid of target.locales) {
        const p = parcelById.get(pid);
        if (p?.edificio) {
          p.edificio.firmaId = buyer.id;
          p.edificio.dueno = buyer.id;
        }
      }
      target.locales = [];
      for (const eid of target.empleados) {
        const emp = npcById.get(eid);
        if (emp && emp.vivo) {
          emp.empleadorId = buyer.id;
          buyer.empleados.push(eid);
        }
      }
      target.empleados = [];
      target.activa = false;
      buys++;
      state.mercadoStats.comprasPeriodo++;

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_fcompra'),
        dia: state.reloj.dia,
        tipo: 'firma_compra',
        zona: buyer.zona,
        compradorId: buyer.id,
        firmaId: target.id,
        precio: Number(price.toFixed(2)),
        modo: 'absorcion',
        causa: target.ultimaCausa,
      });
    }
  }

  // ====================================================================
  // 6. BANKRUPTCIES (firma_quiebra & medio_cierre)
  // ====================================================================
  if (isM1Plus) {
    for (const f of state.firmas) {
      if (!f.activa) continue;
      if ((f.caja <= 2 || f.factor < 0.7) && f.periodosEnPerdida >= FIRM_CONSTANTS.periodosParaQuebrar) {
        // Keep at least 1 agro/comercio firm afloat via emergency restructure if it's the sole provider
        const sameRubroCount = state.firmas.filter((x) => x.activa && x.rubro === f.rubro).length;
        if ((f.rubro === 'agro' || f.rubro === 'comercio') && sameRubroCount <= 1) {
          continue;
        }

        const empCount = f.empleados.length;
        // Severance from positive remaining caja if any
        if (f.caja > 0 && empCount > 0) {
          const perEmp = f.caja / empCount;
          for (const eid of f.empleados) {
            const emp = npcById.get(eid);
            const eh = emp ? hogarById.get(emp.hogarId) : undefined;
            if (eh) eh.dinero += perEmp;
            else state.gobierno.reserva += perEmp;
          }
          f.caja = 0;
        } else if (f.caja > 0) {
          state.gobierno.reserva += f.caja;
          f.caja = 0;
        } else if (f.caja < 0) {
          f.caja = 0;
        }

        for (const eid of f.empleados) {
          const emp = npcById.get(eid);
          if (emp && emp.vivo) {
            emp.rol = 'desempleado';
            emp.empleadorId = null;
          }
        }
        f.empleados = [];

        // Clear owner parts
        for (const part of f.partes) {
          if (part.tipo === 'npc') {
            const o = npcById.get(part.id);
            if (o) o.partes = o.partes.filter((x) => x.firmaId !== f.id);
          }
        }
        f.partes = [];

        // Release locales back to libre
        for (const pid of f.locales) {
          const p = parcelById.get(pid);
          if (p) {
            p.estado = 'libre';
            p.edificio = null;
          }
        }
        f.locales = [];
        f.activa = false;
        state.mercadoStats.quiebrasPeriodo++;

        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_fquiebra'),
          dia: state.reloj.dia,
          tipo: 'firma_quiebra',
          zona: f.zona,
          firmaId: f.id,
          cantidadDespedidos: empCount,
          causa: f.ultimaCausa,
        });

        if (f.rubro === 'medio') {
          const m = state.medios.find((x) => x.firmaId === f.id);
          if (m) {
            m.activa = false;
            m.columnistas = [];
            emitSimEvent(state, {
              id: nextSeqId(state, 'ev_mcierre'),
              dia: state.reloj.dia,
              tipo: 'medio_cierre',
              zona: f.zona,
              medioId: m.id,
              causa: f.ultimaCausa,
            });
          }
        }
      }
    }
  }

  // ====================================================================
  // 7. FIRM GROWTH, ENTREPRENEURSHIP & PRIVATE HOUSING CONSTRUCTION
  // ====================================================================
  if (isM1Plus) {
    const constr = pickConstructora(zones[0] ?? 'centro');

    // 7a. Existing firms expand onto free commercial/agricultural parcels
    for (const f of state.firmas) {
      if (!f.activa || f.periodosFactorAlto < FIRM_CONSTANTS.periodosParaInvertir) continue;
      const targetBuilding: BuildingType | null =
        f.rubro === 'agro'
          ? 'campo'
          : f.rubro === 'comercio'
          ? 'almacen'
          : f.rubro === 'construccion'
          ? 'oficina_constructora'
          : f.rubro === 'inmobiliaria'
          ? 'oficina_inmobiliaria'
          : null;
      if (!targetBuilding) continue;
      const def = BUILDING_CATALOG[targetBuilding];
      if (f.caja < def.costoObra * 1.4) continue;
      const freeParcel = state.parcelas.find(
        (p) => p.tipoParcela === def.parcelTipo && p.estado === 'libre' && (p.zona === f.zona || state.zonas[f.zona]?.vecinas.includes(p.zona))
      );
      if (!freeParcel) continue;

      f.caja -= def.costoObra;
      if (constr) constr.caja += def.costoObra;
      else state.gobierno.reserva += def.costoObra;

      freeParcel.estado = 'en_obra';
      freeParcel.edificio = {
        id: nextSeqId(state, 'ed'),
        tipo: targetBuilding,
        parcelaId: freeParcel.id,
        dueno: f.id,
        duenoRef: { tipo: 'firma', id: f.id },
        firmaId: f.id,
        estado: 'en_obra',
        activo: false,
        estadoSalud: 100,
        diasObraRestantes: def.diasObra,
        diasObraTotal: def.diasObra,
        zona: freeParcel.zona,
      };
      f.locales.push(freeParcel.id);
      f.periodosFactorAlto = 0;
      state.mercadoStats.construccionesPeriodo++;

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_obra_priv'),
        dia: state.reloj.dia,
        tipo: 'obra_inicio',
        zona: freeParcel.zona,
        parcelaId: freeParcel.id,
        edificio: targetBuilding,
        dueno: f.id,
        costo: def.costoObra,
        diasObra: def.diasObra,
        causa: `firma:${f.id}/inversion`,
      });
      break;
    }

    // 7b. Entrepreneurship (emprender)
    let founded = 0;
    const candidates = state.npcs.filter(
      (n) =>
        n.vivo &&
        n.edad >= 18 &&
        n.edad < 65 &&
        getEffectivePropensionEmprender(n) >= FIRM_CONSTANTS.umbralPropensionEmprender
    );
    for (const cand of candidates) {
      if (founded >= FIRM_CONSTANTS.maxEmprendimientosPorPeriodo) break;
      const h = hogarById.get(cand.hogarId);
      if (!h || h.dinero < FIRM_CONSTANTS.ahorroMinEmprender) continue;
      if (nextSubRand(state, 'mercado') >= DEMOG_CONSTANTS.probEmprenderBase) continue;

      const buildingType: BuildingType =
        cand.rol === 'periodista' ? 'oficina_medio' : 'kiosco';
      const def = BUILDING_CATALOG[buildingType];
      const rubro = def.rubro ?? 'comercio';
      if (h.dinero < def.costoObra + 40) continue;

      const freeP = state.parcelas.find(
        (p) => p.tipoParcela === def.parcelTipo && p.estado === 'libre' && (p.zona === cand.zona || state.zonas[cand.zona]?.vecinas.includes(p.zona))
      );
      if (!freeP) continue;

      h.dinero -= def.costoObra + 35;
      if (constr) constr.caja += def.costoObra;
      else state.gobierno.reserva += def.costoObra;

      const newFirmId = nextSeqId(state, 'f');
      const newFirm: Firma = {
        id: newFirmId,
        rubro,
        nombre: `${def.nombre} ${cand.apellido}`,
        zona: freeP.zona,
        activa: true,
        partes: [{ tipo: 'npc', id: cand.id, pct: 100 }],
        gerenteId: cand.id,
        locales: [freeP.id],
        empleados: [],
        ventas: 0,
        caja: 35,
        parteSueldos: FIRM_CONSTANTS.parteSueldosBase,
        factor: 1.0,
        cuotaZona: {},
        margenPoder: 0,
        periodosEnPerdida: 0,
        periodosSinDueno: 0,
        periodosFactorAlto: 0,
        periodosFactorBajo: 0,
        ultimoTramo: 'normal',
        despidosPendientes: 0,
        refPorEmpleado: {},
        ultimoIngresoPeriodo: 0,
        ultimoSueldosPeriodo: 0,
        ultimaGanancia: 0,
        historialGanancias: [],
        ultimaCausa: 'mercado:emprendimiento',
      };
      state.firmas.push(newFirm);
      cand.partes.push({ firmaId: newFirmId, pct: 100 });
      if (cand.rol === 'desempleado') {
        cand.rol = rubro === 'medio' ? 'periodista' : 'comerciante';
        cand.empleadorId = newFirmId;
        newFirm.empleados.push(cand.id);
      }

      freeP.estado = 'en_obra';
      freeP.edificio = {
        id: nextSeqId(state, 'ed'),
        tipo: buildingType,
        parcelaId: freeP.id,
        dueno: newFirmId,
        duenoRef: { tipo: 'firma', id: newFirmId },
        firmaId: newFirmId,
        estado: 'en_obra',
        activo: false,
        estadoSalud: 100,
        diasObraRestantes: def.diasObra,
        diasObraTotal: def.diasObra,
        zona: freeP.zona,
      };

      if (rubro === 'medio') {
        const newMedio: MediaOutlet = {
          id: newFirmId,
          firmaId: newFirmId,
          nombre: newFirm.nombre,
          zona: freeP.zona,
          activa: true,
          duenoNpcIds: [cand.id],
          columnistas: cand.rol === 'periodista' ? [cand.id] : [],
          alcancePct: 28,
          credibilidad: 64,
          afinidadBase: Math.round(cand.variables.lealtad),
          lineaEditorial: {
            afinidadGobierno: Math.round(cand.variables.lealtad),
            sensacionalismo: Math.round((cand.personalidad.rebeldia + cand.personalidad.codicia) * 0.5),
          },
          ingresos: { publicidad: 0, fondosEstado: 0, dependenciaPct: 0 },
          finanzas: { ingresosPropios: 0, fondosEstado: 0, dependenciaPct: 0 },
          caja: 35,
          periodosEnPerdida: 0,
        };
        state.medios.push(newMedio);
      }

      founded++;
      state.mercadoStats.fundacionesPeriodo++;
      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_ffund'),
        dia: state.reloj.dia,
        tipo: 'firma_fundada',
        zona: freeP.zona,
        firmaId: newFirmId,
        rubro,
        duenoId: cand.id,
        causa: 'mercado:emprendimiento',
      });
    }

    // 7c. Private residential construction when calle or crowding spikes
    let housesBuilt = 0;
    const inmobiliarias = state.firmas.filter((f) => f.activa && f.rubro === 'inmobiliaria');
    for (const z of zones) {
      if (housesBuilt >= FIRM_CONSTANTS.maxConstruccionesPrivadasPeriodo) break;
      const zHogares = state.hogares.filter((h) => h.zona === z && h.estado !== 'acogida');
      if (zHogares.length === 0) continue;
      const calleZ = (zHogares.filter((h) => h.estado === 'calle').length / zHogares.length) * 100;
      if (calleZ < HOUSING_CONSTANTS.umbralCalleConstruirPct) continue;

      const builder =
        inmobiliarias.find((f) => f.caja >= BUILDING_CATALOG.casa_mediana.costoObra) ??
        constructoras.find((f) => f.caja >= BUILDING_CATALOG.casa_mediana.costoObra);
      if (!builder) continue;

      const freeRes = state.parcelas.find(
        (p) => p.tipoParcela === 'residencial' && p.estado === 'libre' && p.zona === z
      );
      if (!freeRes) continue;

      const houseType: HouseType = 'casa_mediana';
      const def = BUILDING_CATALOG[houseType];
      builder.caja -= def.costoObra;
      if (constr) constr.caja += def.costoObra;
      else state.gobierno.reserva += def.costoObra;

      freeRes.estado = 'en_obra';
      freeRes.edificio = {
        id: nextSeqId(state, 'ed_casa'),
        tipo: houseType,
        parcelaId: freeRes.id,
        dueno: builder.id,
        duenoRef: { tipo: 'firma', id: builder.id },
        firmaId: builder.id,
        estado: 'en_obra',
        activo: false,
        estadoSalud: 100,
        diasObraRestantes: def.diasObra,
        diasObraTotal: def.diasObra,
        zona: z,
      };
      housesBuilt++;
      state.mercadoStats.construccionesPeriodo++;
    }
  }

  // ====================================================================
  // 8. MEDIA DEPENDENCY, CREDIBILITY & EDITORIAL DRIFT
  // ====================================================================
  for (const m of activeMedios) {
    const f = m.firmaId ? firmaById.get(m.firmaId) : undefined;
    if (f) {
      m.caja = Number(f.caja.toFixed(2));
      m.periodosEnPerdida = f.periodosEnPerdida;
    }
    const totalRev = m.ingresos.publicidad + m.ingresos.fondosEstado;
    const dep = totalRev > 0 ? (m.ingresos.fondosEstado / totalRev) * 100 : 0;
    m.ingresos.dependenciaPct = Number(dep.toFixed(1));
    m.finanzas.ingresosPropios = Number(m.ingresos.publicidad.toFixed(1));
    m.finanzas.fondosEstado = Number(m.ingresos.fondosEstado.toFixed(1));
    m.finanzas.dependenciaPct = m.ingresos.dependenciaPct;

    // Credibility moves with dependency & monopoly sensationalism
    if (dep > ECON_CONSTANTS.umbralDependenciaPrensaPct) {
      m.credibilidad = clamp(m.credibilidad - 2.2, 15, 98);
    } else {
      m.credibilidad = clamp(m.credibilidad + 0.8, 15, 98);
    }
    if (activeMedios.length === 1 && m.lineaEditorial.sensacionalismo > 60) {
      m.credibilidad = clamp(m.credibilidad - 1.2, 15, 98);
    }

    // Reach adjusts gently with total revenue
    const targetReach = clamp(25 + Math.sqrt(Math.max(0, totalRev)) * 5.2, 18, 92);
    m.alcancePct = Number((m.alcancePct * 0.82 + targetReach * 0.18).toFixed(1));

    // Editorial drift toward owners' political loyalty & traits
    if (f && f.partes.length > 0) {
      let avgLoy = 0;
      let avgSens = 0;
      let weightSum = 0;
      for (const p of f.partes) {
        if (p.tipo === 'npc') {
          const owner = npcById.get(p.id);
          if (owner && owner.vivo) {
            avgLoy += owner.variables.lealtad * p.pct;
            avgSens += (owner.personalidad.rebeldia * 0.6 + owner.personalidad.codicia * 0.4) * p.pct;
            weightSum += p.pct;
          }
        }
      }
      if (weightSum > 0) {
        const ownerTargetAff = clamp(avgLoy / weightSum + (dep > 35 ? 10 : 0), 10, 95);
        const ownerTargetSens = clamp(avgSens / weightSum, 15, 95);
        const prevAff = m.lineaEditorial.afinidadGobierno;
        const prevSens = m.lineaEditorial.sensacionalismo;
        m.lineaEditorial.afinidadGobierno = Number(
          (prevAff + (ownerTargetAff - prevAff) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
        );
        m.lineaEditorial.sensacionalismo = Number(
          (prevSens + (ownerTargetSens - prevSens) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
        );
        if (Math.abs(m.lineaEditorial.afinidadGobierno - prevAff) >= 3) {
          emitSimEvent(state, {
            id: nextSeqId(state, 'ev_mlin'),
            dia: state.reloj.dia,
            tipo: 'medio_cambio_linea',
            zona: m.zona ?? zones[0] ?? 'centro',
            medioId: m.id,
            lineaAnterior: { afinidadGobierno: prevAff, sensacionalismo: prevSens },
            lineaNueva: { ...m.lineaEditorial },
          });
        }
      }
    }
  }

  // ====================================================================
  // 9. M4 FISCAL EXTENSION (emisión & inflación)
  // ====================================================================
  if (isM4) {
    const maxEm = (taxCollectedTotal * state.gobierno.palancasVigentes.topeEmision) / 100;
    const deficit = Math.max(0, missing);
    const emitted = Math.min(deficit, maxEm);
    if (emitted > 0) {
      state.gobierno.reserva += emitted;
      fin.emision = Number(emitted.toFixed(2));
      state.auditEntradasDia += emitted;
      const inflJump = (emitted / Math.max(100, state.gobierno.reserva + 300)) * 8;
      state.gobierno.inflacion = Number(clamp(state.gobierno.inflacion + inflJump, 0, 180).toFixed(2));
    } else {
      fin.emision = 0;
      state.gobierno.inflacion = Number(Math.max(0, state.gobierno.inflacion - 0.15).toFixed(2));
    }
  }

  // Update alquilerMedio & cuotaMercado snapshot
  const alquilerMedio: Record<ZoneId, number> = {};
  for (const z of zones) {
    const zCasas = state.casas.filter((c) => c.zona === z);
    alquilerMedio[z] =
      zCasas.length > 0
        ? Number((zCasas.reduce((s, c) => s + c.alquiler, 0) / zCasas.length).toFixed(2))
        : 12;
  }
  state.ultimaSalidaEconomica.alquilerMedio = alquilerMedio;
  state.ultimaSalidaEconomica.cuotaMercado = cuotaMercadoSalida;
  state.ultimaSalidaEconomica.saldoDiarioEstimado = Number((fin.saldo / PERIOD_DAYS).toFixed(2));
  state.ultimaSalidaEconomica.inflacion = state.gobierno.inflacion;

  syncLegacyEnterprisesView(state);
}

export function pickRandomZoneSub(
  state: GameState,
  sub: 'vida' | 'mercado' | 'clima' | 'caos' | 'prensa'
): ZoneId {
  const zones = getWorldZones(state);
  return zones[subRandInt(state, sub, 0, zones.length - 1)] ?? 'centro';
}
