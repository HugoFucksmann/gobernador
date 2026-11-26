import {
  BUILDING_CATALOG,
  DEMOG_CONSTANTS,
  ECON_CONSTANTS,
  FIRM_CONSTANTS,
  HOUSING_CONSTANTS,
  LEVEL11_CONSTANTS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SPEND_CATEGORY_WEIGHTS,
  VIAL_CONSTANTS,
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
  RoleId,
  SpendCategory,
  ZoneId,
} from '../types/game';
import {
  computeMaintenanceBreakdown,
  getBuildingJobCaps,
} from './policies';
import { nextSeqId, nextSubRand, subRandInt } from './rng';
import {
  canBuildTypeInParcela,
  clamp,
  computeDailyFoodPriceForZone,
  computeDemandaSuelo,
  emitSimEvent,
  getActivePhenomena,
  getEffectivePropensionEmprender,
  getEffectivePropensionGasto,
  getFirmaRoleCaps,
  getNpcProductivity,
  getWorldZones,
  getZoneTravelCost,
  isLotIsolated,
  isViaConnectableToNetwork,
  recomputeRoadDistances,
  syncLegacyEnterprisesView,
} from './worldHelpers';

export function runDailyEconomyV2(state: GameState): void {
  const isM1Plus = state.config.nivelMundo !== 'M0';
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);
  const zones = getWorldZones(state);
  const parcelById = new Map<string, Parcela>(state.parcelas.map((p) => [p.id, p]));

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

  // 1b. Industria bienes production (ECONOMIA_V2 §6b)
  const industriaFirms = isM1Plus
    ? state.firmas.filter((f) => f.activa && f.rubro === 'industria')
    : [];
  for (const ind of industriaFirms) {
    let obreros = 0;
    let tecnicos = 0;
    let prodSum = 0;
    for (const eid of ind.empleados) {
      const emp = npcById.get(eid);
      if (!emp || emp.hospital.internado || emp.accionIa?.fueraDePuesto) continue;
      const pFactor = getNpcProductivity(emp, state) / 100;
      if (emp.rol === 'obrero') {
        obreros++;
        prodSum += VIAL_CONSTANTS.produccionBaseObreroBienes * pFactor;
      } else if (emp.rol === 'tecnico') {
        tecnicos++;
      }
    }
    const effTech = Math.min(tecnicos, obreros * ECON_CONSTANTS.tecnicosPorAgricultor);
    const techMult = 1 + ECON_CONSTANTS.kTecnificacion * (effTech / Math.max(1, obreros));
    let capLoc = 0;
    for (const pid of ind.locales) {
      const p = parcelById.get(pid);
      if (p?.edificio?.activo) {
        p.edificio.ventasHoy = 0;
        capLoc += BUILDING_CATALOG[p.edificio.tipo].capacidadVentasDiaria ?? 120;
      }
    }
    const capDiaria = Math.max(40, capLoc);
    ind.capacidadDiaria = capDiaria;
    const producedBienes = Math.max(0, prodSum * techMult);
    ind.stockBienes = Math.min(capDiaria * 10, (ind.stockBienes ?? 0) + producedBienes);
  }

  // 2. Foreign trade (agro & industria)
  const flujoExt = state.gobierno.palancasVigentes.comercioExterior;
  const merchants = vivos.filter((n) => n.rol === 'comerciante' && !n.accionIa?.fueraDePuesto).length;
  const tradeCap = merchants * ECON_CONSTANTS.intercambioPorComerciante * (Math.abs(flujoExt) / 100);
  const inflFactor = 1 + (state.gobierno.inflacion || 0) / 100;
  let industriaExportDia = 0;
  let bienesImportadosDia = 0;

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

  // Export surplus bienes from industria
  if (flujoExt < 0 && tradeCap > 0 && industriaFirms.length > 0) {
    const totalBienes = industriaFirms.reduce((s, f) => s + (f.stockBienes ?? 0), 0);
    const floorBienes = industriaFirms.reduce((s, f) => s + (f.capacidadDiaria ?? 80) * 1.5, 0);
    const exportableBienes = Math.max(0, Math.min(tradeCap * 0.7, totalBienes - floorBienes));
    if (exportableBienes > 0.1) {
      const unitExportBienes = VIAL_CONSTANTS.precioExternoBienes * inflFactor * 0.92;
      let exportedInd = 0;
      for (const ind of industriaFirms) {
        const share = totalBienes > 0 ? (ind.stockBienes ?? 0) / totalBienes : 0;
        const units = Math.min(ind.stockBienes ?? 0, exportableBienes * share);
        if (units > 0) {
          ind.stockBienes = Math.max(0, (ind.stockBienes ?? 0) - units);
          const rev = units * unitExportBienes;
          ind.ventas += rev;
          exportedInd += rev;
        }
      }
      if (exportedInd > 0) {
        state.gobierno.acumuladoPeriodo.exportaciones += exportedInd;
        state.auditEntradasDia += exportedInd;
        industriaExportDia += exportedInd;
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

  // Road health multiplier per zone (EDIFICIOS_V2 §3b)
  const tramosList = state.tramos ?? [];
  const roadCapMultByZone: Record<ZoneId, number> = {};
  for (const z of zones) {
    const zTramos = tramosList.filter((t) => t.construida && (t.zonaA === z || t.zonaB === z));
    if (zTramos.length === 0) {
      roadCapMultByZone[z] = 1;
    } else {
      const avgHealth = zTramos.reduce((s, t) => s + t.estado, 0) / zTramos.length;
      roadCapMultByZone[z] =
        avgHealth < VIAL_CONSTANTS.umbralMalEstadoVia
          ? clamp(0.4 + 0.6 * (avgHealth / VIAL_CONSTANTS.umbralMalEstadoVia), 0.25, 1)
          : 1;
    }
  }

  // Index commerce & category-selling firms and daily capacity
  const comercios = state.firmas.filter((f) => f.activa && f.rubro === 'comercio' && f.locales.length > 0);
  const comCapLeft = new Map<string, number>();
  for (const c of comercios) {
    let cap = 0;
    for (const pid of c.locales) {
      const p = parcelById.get(pid);
      if (p?.edificio?.activo && !isLotIsolated(state, p)) {
        p.edificio.ventasHoy = 0;
        const bDef = BUILDING_CATALOG[p.edificio.tipo];
        if (bDef.vendeComida !== false || !isM1Plus) {
          cap += bDef.capacidadVentasDiaria ?? 90;
        }
      }
    }
    const rMult = roadCapMultByZone[c.zona] ?? 1;
    comCapLeft.set(c.id, cap > 0 ? Math.max(25, cap * rMult) : 0);
  }

  const sellersByCat: Record<SpendCategory, Firma[]> = {
    bienes: [],
    gastronomia: [],
    servicios: [],
    entretenimiento: [],
  };
  const spendCapLeft = new Map<string, number>();
  const firmAvgMargenAdj = new Map<string, number>();

  for (const f of state.firmas) {
    if (!f.activa || f.locales.length === 0) continue;
    const catCaps: Partial<Record<SpendCategory, number>> = {};
    let adjSum = 0;
    let adjCount = 0;
    for (const pid of f.locales) {
      const p = parcelById.get(pid);
      if (!p?.edificio?.activo || isLotIsolated(state, p)) continue;
      p.edificio.ventasHoy = p.edificio.ventasHoy ?? 0;
      const bDef = BUILDING_CATALOG[p.edificio.tipo];
      const cat: SpendCategory | undefined =
        bDef.categoriaGasto ??
        (f.rubro === 'gastronomia' || f.rubro === 'servicios' || f.rubro === 'entretenimiento'
          ? f.rubro
          : f.rubro === 'comercio'
          ? 'bienes'
          : undefined);
      if (!cat) continue;
      const cVal = bDef.capacidadVentasDiaria ?? 80;
      catCaps[cat] = (catCaps[cat] ?? 0) + cVal;
      adjSum += (bDef.margenAjustePct ?? 0) / 100;
      adjCount++;
    }
    firmAvgMargenAdj.set(f.id, adjCount > 0 ? adjSum / adjCount : 0);
    const rMult = roadCapMultByZone[f.zona] ?? 1;
    for (const [catStr, rawCap] of Object.entries(catCaps)) {
      const cat = catStr as SpendCategory;
      if (typeof rawCap === 'number' && rawCap > 0) {
        sellersByCat[cat].push(f);
        spendCapLeft.set(`${cat}:${f.id}`, Math.max(20, rawCap * rMult));
      }
    }
  }

  // Track retencion measure
  const retencionFirms = new Set<string>();
  for (const m of state.medidasVigentes) {
    if (m.tipo === 'retencion_stock' && m.empresaId) retencionFirms.add(m.empresaId);
  }

  const pickComercioSeller = (zona: ZoneId, boycottedFirmId?: string): Firma | undefined => {
    let best: Firma | undefined;
    let bestScore = Infinity;
    for (const f of comercios) {
      if (f.id === boycottedFirmId || (comCapLeft.get(f.id) ?? 0) <= 1) continue;
      const travel = getZoneTravelCost(state, zona, f.zona);
      if (!Number.isFinite(travel)) continue;
      const score = travel * 0.14 + f.margenPoder * 22 + (firmAvgMargenAdj.get(f.id) ?? 0) * 15;
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best ?? comercios.find((f) => f.id !== boycottedFirmId) ?? comercios[0];
  };

  const pickCategorySeller = (
    cat: SpendCategory,
    zona: ZoneId,
    boycottedFirmId?: string
  ): Firma | undefined => {
    const list = sellersByCat[cat];
    let best: Firma | undefined;
    let bestScore = Infinity;
    for (const f of list) {
      if (f.id === boycottedFirmId) continue;
      const left = spendCapLeft.get(`${cat}:${f.id}`) ?? 0;
      if (left <= 0.5) continue;
      const travel = getZoneTravelCost(state, zona, f.zona);
      if (!Number.isFinite(travel)) continue;
      const score = travel * 0.14 + f.margenPoder * 24 + (firmAvgMargenAdj.get(f.id) ?? 0) * 16;
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
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
        const availA = retencionFirms.has(a.id)
          ? Math.max(0, (a.stock ?? 0) * 0.45)
          : Math.max(0, a.stock ?? 0);
        const w = totalAvailStock > 0 ? availA / totalAvailStock : 1 / agroFirms.length;
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
  const gastoVidaPorCategoria: Record<SpendCategory, number> = {
    bienes: 0,
    gastronomia: 0,
    servicios: 0,
    entretenimiento: 0,
  };

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
    const isStreet = h.estado === 'calle' && !h.ocupandoCasaId;
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

        const missingTodayUnits = Math.max(
          0,
          count * ECON_CONSTANTS.consumoPorNpc - (h.despensa + unitsPaidByHogar)
        );
        const missingCost = missingTodayUnits * effPrice;
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

    // Gasto de vida en 4 categorias (ECONOMIA_V2 §6b)
    const adults = members.filter((m) => m.edad >= 18);
    if (adults.length > 0 && h.dinero > effPrice * count) {
      const avgProp =
        adults.reduce((s, a) => s + getEffectivePropensionGasto(a), 0) / adults.length / 100;
      const avgCodicia = adults.reduce((s, a) => s + a.personalidad.codicia, 0) / adults.length / 100;
      const avgResil = adults.reduce((s, a) => s + a.personalidad.resiliencia, 0) / adults.length / 100;
      const dailyNetIncome = h.ultimoIngresoNeto / PERIOD_DAYS;
      const colchon = ECON_CONSTANTS.colchonDias * (count * effPrice);
      const wealthTerm = h.dinero > colchon ? ECON_CONSTANTS.kRiqueza * (h.dinero - colchon) : 0;
      const codiciaCut = 1 - Math.max(0, avgCodicia - 0.5) * 0.14;
      const targetSpend = Math.max(0, (avgProp * dailyNetIncome + wealthTerm) * codiciaCut);
      const cashFloorDays = isM1Plus ? 1.8 : 0.5;
      const actualSpend = Math.min(Math.max(0, h.dinero - count * effPrice * cashFloorDays), targetSpend);

      if (actualSpend > 0.01) {
        if (!isM1Plus) {
          if (seller) {
            h.dinero -= actualSpend;
            seller.ventas += actualSpend;
            comCapLeft.set(seller.id, Math.max(0, (comCapLeft.get(seller.id) ?? 0) - actualSpend));
            gastoVidaPorCategoria.bienes += actualSpend;
          }
        } else {
          const luxShift = clamp((h.dinero - colchon) / Math.max(40, colchon * 2), 0, 1) * VIAL_CONSTANTS.kLujo;
          const wBienes = Math.max(0.22, SPEND_CATEGORY_WEIGHTS.bienes - luxShift * 0.35);
          const wGastro = SPEND_CATEGORY_WEIGHTS.gastronomia + luxShift * 0.2;
          const wServ = SPEND_CATEGORY_WEIGHTS.servicios;
          const wEntret = SPEND_CATEGORY_WEIGHTS.entretenimiento + luxShift * 0.15 + Math.max(0, avgResil - 0.5) * 0.08;
          const wSum = wBienes + wGastro + wServ + wEntret;

          const catWeights: Array<[SpendCategory, number]> = [
            ['bienes', wBienes / wSum],
            ['gastronomia', wGastro / wSum],
            ['servicios', wServ / wSum],
            ['entretenimiento', wEntret / wSum],
          ];

          for (const [cat, weight] of catWeights) {
            const catWanted = actualSpend * weight;
            if (catWanted <= 0.01) continue;
            const catSeller = pickCategorySeller(cat, h.zona, boycotted);
            if (!catSeller) continue; // unserved category -> household saves that portion
            const capAvail = spendCapLeft.get(`${cat}:${catSeller.id}`) ?? 0;
            const catSpend = Math.min(catWanted, capAvail, h.dinero);
            if (catSpend <= 0.01) continue;

            h.dinero -= catSpend;
            spendCapLeft.set(`${cat}:${catSeller.id}`, Math.max(0, capAvail - catSpend));
            gastoVidaPorCategoria[cat] += catSpend;

            const firstLoc = parcelById.get(catSeller.locales[0]);
            if (firstLoc?.edificio) {
              firstLoc.edificio.ventasHoy = (firstLoc.edificio.ventasHoy ?? 0) + catSpend;
            }

            if (cat === 'bienes') {
              const adjMargin = clamp(
                ECON_CONSTANTS.margenComercialPct / 100 + (firmAvgMargenAdj.get(catSeller.id) ?? 0),
                0.08,
                0.35
              );
              const unitBienesPrice =
                VIAL_CONSTANTS.precioExternoBienes * inflFactor * (1 + catSeller.margenPoder);
              const unitsWanted = catSpend / Math.max(0.4, unitBienesPrice);
              const totalIndStock = industriaFirms.reduce((s, f) => s + Math.max(0, f.stockBienes ?? 0), 0);
              const localUnits = Math.min(unitsWanted, totalIndStock);
              const localRatio = unitsWanted > 0 ? localUnits / unitsWanted : 0;
              const localSpend = catSpend * localRatio;
              const importSpend = catSpend - localSpend;

              if (localSpend > 0 && industriaFirms.length > 0) {
                const comCut = localSpend * adjMargin;
                const indCut = localSpend - comCut;
                catSeller.ventas += comCut;
                let distributedInd = 0;
                for (let idx = 0; idx < industriaFirms.length; idx++) {
                  const ind = industriaFirms[idx];
                  const w = totalIndStock > 0 ? Math.max(0, ind.stockBienes ?? 0) / totalIndStock : 0;
                  const shareCut = idx === industriaFirms.length - 1 ? indCut - distributedInd : indCut * w;
                  distributedInd += shareCut;
                  ind.ventas += shareCut;
                  ind.stockBienes =
                    localUnits >= totalIndStock
                      ? 0
                      : Math.max(0, (ind.stockBienes ?? 0) - localUnits * w);
                }
              } else if (localSpend > 0) {
                catSeller.ventas += localSpend;
              }

              if (importSpend > 0) {
                const comImportCut = importSpend * Math.min(0.14, adjMargin * 0.6);
                const importOutflow = importSpend - comImportCut;
                catSeller.ventas += comImportCut;
                state.auditSalidasDia += importOutflow;
                bienesImportadosDia += importOutflow;
              }
            } else {
              catSeller.ventas += catSpend;
            }
          }
        }
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
  state.ultimaSalidaEconomica.gastoVidaPorCategoria = {
    bienes: Number(gastoVidaPorCategoria.bienes.toFixed(2)),
    gastronomia: Number(gastoVidaPorCategoria.gastronomia.toFixed(2)),
    servicios: Number(gastoVidaPorCategoria.servicios.toFixed(2)),
    entretenimiento: Number(gastoVidaPorCategoria.entretenimiento.toFixed(2)),
  };
  state.ultimaSalidaEconomica.bienesImportadosDia = Number(bienesImportadosDia.toFixed(2));
  state.ultimaSalidaEconomica.industriaExportDia = Number(industriaExportDia.toFixed(2));

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
  const creditNetAmountToHogarOrNpc = (
    npc: Npc | undefined,
    gross: number,
    taxable: boolean
  ) => {
    if (gross <= 0) return;
    const tax = taxable ? gross * taxRate : 0;
    const net = gross - tax;
    if (tax > 0) {
      state.gobierno.reserva += tax;
      taxCollectedTotal += tax;
    }
    const h = npc ? hogarById.get(npc.hogarId) : undefined;
    if (h) {
      h.dinero += net;
      h.ultimoIngresoNeto += net;
    } else {
      state.gobierno.reserva += net;
    }
    if (npc && npc.vivo) {
      npc.economia.ultimoIngresoNeto += net / PERIOD_DAYS;
    }
  };
  const creditNetToNpc = (npc: Npc, gross: number, taxable: boolean) =>
    creditNetAmountToHogarOrNpc(npc, gross, taxable);

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

  // Advertising outflow from all active non-medio firms into medio firms (ECONOMIA_V2 §5)
  if (isM1Plus && medioFirmaPairs.length > 0) {
    const totalWeight = medioFirmaPairs.reduce(
      (s, { m }) => s + Math.max(1, m.alcancePct * m.credibilidad),
      0
    );
    for (const f of state.firmas) {
      if (!f.activa || f.rubro === 'medio' || f.ventas <= 0) continue;
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

  // Pre-bucket unemployed adults once (O(N) instead of O(F*N) for 5.000 pop)
  const unempPool = state.npcs.filter(
    (n) => n.vivo && n.rol === 'desempleado' && n.edad >= 18 && n.edad < 65
  );

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
    if (totalRef > 0 && wageFund > totalRef && f.locales.length > 0 && unempPool.length > 0) {
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
          let cand: Npc | undefined;
          let bestTravel = Infinity;
          for (const u of unempPool) {
            if (u.rol !== 'desempleado' || u.educacion.nivel < def.educMin) continue;
            const d = getZoneTravelCost(state, u.zona, f.zona);
            if (Number.isFinite(d) && d <= VIAL_CONSTANTS.rutaMaxTrabajo && d < bestTravel) {
              bestTravel = d;
              cand = u;
              if (d <= VIAL_CONSTANTS.costoInternoZona) break;
            }
          }
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
          } else if (part.tipo === 'hogar') {
            const oh = hogarById.get(part.id);
            if (oh) {
              const tax = cut * taxRate;
              state.gobierno.reserva += tax;
              taxCollectedTotal += tax;
              oh.dinero += cut - tax;
            } else {
              state.gobierno.reserva += cut;
            }
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

  // Update market share cuotaZona & monopoly pricing power (all 10 rubros)
  const rubros: FirmRubro[] = [
    'agro',
    'industria',
    'comercio',
    'gastronomia',
    'servicios',
    'entretenimiento',
    'construccion',
    'inmobiliaria',
    'medio',
    'banco',
  ];
  const cuotaMercadoSalida: EconomyOutput['cuotaMercado'] = {};
  const activeFirmByRubroZone = new Map<string, Firma[]>();
  for (const f of state.firmas) {
    if (!f.activa) continue;
    const key = `${f.rubro}:${f.zona}`;
    const list = activeFirmByRubroZone.get(key);
    if (list) list.push(f);
    else activeFirmByRubroZone.set(key, [f]);
  }
  for (const rubro of rubros) {
    for (const z of zones) {
      const fZone = activeFirmByRubroZone.get(`${rubro}:${z}`) ?? [];
      if (fZone.length === 0) continue;
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

          if (c.dueno.tipo === 'hogar') {
            const rentTax = c.alquiler * taxRate;
            const rentNet = c.alquiler - rentTax;
            state.gobierno.reserva += rentTax;
            taxCollectedTotal += rentTax;
            const ownerH = hogarById.get(c.dueno.id);
            if (ownerH) ownerH.dinero += rentNet;
            else state.gobierno.reserva += rentNet;
          } else if (c.dueno.tipo === 'npc') {
            const rentTax = c.alquiler * taxRate;
            const rentNet = c.alquiler - rentTax;
            state.gobierno.reserva += rentTax;
            taxCollectedTotal += rentTax;
            const ownerNpc = npcById.get(c.dueno.id);
            const ownerH = ownerNpc ? hogarById.get(ownerNpc.hogarId) : undefined;
            if (ownerH) ownerH.dinero += rentNet;
            else state.gobierno.reserva += rentNet;
          } else if (c.dueno.tipo === 'firma') {
            const ownerFirm = firmaById.get(c.dueno.id);
            if (ownerFirm && ownerFirm.activa) ownerFirm.ventas += c.alquiler;
            else state.gobierno.reserva += c.alquiler;
          } else {
            state.gobierno.reserva += c.alquiler;
          }
        } else {
          occ.periodosSinPagar += 1;
        }
      }
      // Track hacinamiento
      if (occ.miembros.length > c.capacidad) occ.periodosHacinado += 1;
      else occ.periodosHacinado = 0;
    }

    // House decay & maintenance paid by owner to constructora (into ventas!)
    const prevCasaEstado = c.estado;
    const decay = c.hogarId
      ? HOUSING_CONSTANTS.decaimientoEstadoCasaPeriodo
      : HOUSING_CONSTANTS.estadoCasaSinMantVacia;
    c.estado = clamp(c.estado - decay, 0, 100);
    if (!c.hogarId) c.diasVaciaSinMantenimiento += PERIOD_DAYS;
    else c.diasVaciaSinMantenimiento = 0;

    const mantCost = BUILDING_CATALOG[c.tipo].mantenimientoPeriodo;
    const constr = pickConstructora(c.zona);
    let paid = false;
    if (c.estado < 96 && constr && mantCost > 0) {
      if (c.dueno.tipo === 'hogar') {
        const oh = hogarById.get(c.dueno.id);
        if (oh && oh.dinero >= mantCost * 1.5) {
          oh.dinero -= mantCost;
          constr.ventas += mantCost;
          paid = true;
        }
      } else if (c.dueno.tipo === 'npc') {
        const on = npcById.get(c.dueno.id);
        const oh = on ? hogarById.get(on.hogarId) : undefined;
        if (oh && oh.dinero >= mantCost * 1.5) {
          oh.dinero -= mantCost;
          constr.ventas += mantCost;
          paid = true;
        }
      } else if (c.dueno.tipo === 'firma') {
        const ofirm = firmaById.get(c.dueno.id);
        if (ofirm && ofirm.activa && ofirm.caja >= mantCost) {
          ofirm.caja -= mantCost;
          constr.ventas += mantCost;
          paid = true;
        }
      }
      if (paid) c.estado = clamp(c.estado + decay + 2, 0, 100);
    }

    // Venta forzada (ECONOMIA_V2 §7): unmaintained degraded house sold to inmobiliaria/hogar
    if (!paid && isM1Plus && c.estado < HOUSING_CONSTANTS.umbralEstadoCasaMalo && c.dueno.tipo !== 'estado') {
      const forcedPrice = Math.max(80, c.alquiler * HOUSING_CONSTANTS.multiploCasa * 0.65);
      const inmoBuyer = state.firmas.find(
        (f) => f.activa && f.rubro === 'inmobiliaria' && f.id !== c.dueno.id && f.caja >= forcedPrice + 80
      );
      if (inmoBuyer) {
        inmoBuyer.caja -= forcedPrice;
        if (c.dueno.tipo === 'hogar') {
          const oh = hogarById.get(c.dueno.id);
          if (oh) oh.dinero += forcedPrice;
          else state.gobierno.reserva += forcedPrice;
        } else if (c.dueno.tipo === 'npc') {
          const on = npcById.get(c.dueno.id);
          const oh = on ? hogarById.get(on.hogarId) : undefined;
          if (oh) oh.dinero += forcedPrice;
          else state.gobierno.reserva += forcedPrice;
        } else if (c.dueno.tipo === 'firma') {
          const ofirm = firmaById.get(c.dueno.id);
          if (ofirm) ofirm.caja += forcedPrice;
          else state.gobierno.reserva += forcedPrice;
        }
        c.dueno = { tipo: 'firma', id: inmoBuyer.id };
      }
    }

    if (
      Math.abs(c.estado - prevCasaEstado) >= 3 ||
      (prevCasaEstado >= HOUSING_CONSTANTS.umbralEstadoCasaMalo && c.estado < HOUSING_CONSTANTS.umbralEstadoCasaMalo)
    ) {
      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_cest'),
        dia: state.reloj.dia,
        tipo: 'casa_estado',
        zona: c.zona,
        casaId: c.id,
        estado: Number(c.estado.toFixed(1)),
        causa: paid ? 'vivienda:reparacion' : 'vivienda:deterioro',
      });
    }
  }

  // Private firm local maintenance (into constr.ventas!)
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
        constr.ventas += mant;
        p.edificio.estadoSalud = clamp(p.edificio.estadoSalud + 2, 0, 100);
      } else if (mant > 0) {
        p.edificio.estadoSalud = clamp(p.edificio.estadoSalud - 4, 20, 100);
      }
    }
  }

  // ====================================================================
  // 3. STATE SETTLEMENT & AUTOPILOT (M2+ & G0 / estadoAutomatico)
  // ====================================================================
  const acum = state.gobierno.acumuladoPeriodo;
  const fin = state.gobierno.finanzas;
  const opBreak = computeMaintenanceBreakdown(
    state.parcelas,
    state.gobierno.palancasVigentes.nivelObras,
    Math.max(1, state.npcs.filter((n) => n.vivo).length),
    state.config.poblacionInicial,
    state.tramos ?? []
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
    let credited = 0;
    for (const [nid, amt] of Object.entries(acum.nominaPorNpc)) {
      const share = amt * ratioNom;
      credited += share;
      const npc = npcById.get(nid);
      creditNetAmountToHogarOrNpc(npc, share, true);
    }
    if (Math.abs(nomPaid - credited) > 0.0001) {
      state.gobierno.reserva += nomPaid - credited;
    }
  }

  const availPens = Math.max(0, state.gobierno.reserva);
  const ratioPens = pensDue > 0 ? Math.min(1, availPens / pensDue) : 1;
  const pensPaid = pensDue * ratioPens;
  if (pensPaid > 0 && pensDue > 0) {
    state.gobierno.reserva -= pensPaid;
    let credited = 0;
    for (const [nid, amt] of Object.entries(acum.pensionesPorNpc)) {
      const share = amt * ratioPens;
      credited += share;
      const npc = npcById.get(nid);
      creditNetAmountToHogarOrNpc(npc, share, false);
    }
    if (Math.abs(pensPaid - credited) > 0.0001) {
      state.gobierno.reserva += pensPaid - credited;
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
    let credited = 0;
    for (const [nid, amt] of Object.entries(acum.ayudaPorNpc)) {
      const share = amt * ratioDisc;
      credited += share;
      const npc = npcById.get(nid);
      creditNetAmountToHogarOrNpc(npc, share, false);
    }
    if (Math.abs(ayuPaid - credited) > 0.0001) {
      state.gobierno.reserva += ayuPaid - credited;
    }
  }

  // Operation maintenance feeds constructora ventas if active (zero leak!)
  if (opPaid > 0) {
    if (constructoras.length > 0) {
      state.gobierno.reserva -= opPaid;
      const share = opPaid / constructoras.length;
      for (const cf of constructoras) cf.ventas += share;
    } else {
      const anyActive = state.firmas.find((f) => f.activa);
      if (anyActive) {
        state.gobierno.reserva -= opPaid;
        anyActive.ventas += opPaid;
      }
    }
  }

  // Press budget split evenly to active media firms' ventas
  if (prensaPaid > 0 && medioFirmaPairs.length > 0) {
    state.gobierno.reserva -= prensaPaid;
    const perM = prensaPaid / medioFirmaPairs.length;
    for (const { m, f } of medioFirmaPairs) {
      f.ventas += perM;
      m.ingresos.fondosEstado += perM;
      m.finanzas.fondosEstado += perM;
    }
  }

  // Road maintenance condition update (EDIFICIOS_V2 §3b)
  const roadMantFailed = state.gobierno.palancasVigentes.nivelObras === 0 || ratioDisc < 0.75;
  let roadTopologyChanged = false;
  for (const t of state.tramos ?? []) {
    if (!t.construida) continue;
    const prevEst = t.estado;
    if (roadMantFailed) {
      t.estado = clamp(t.estado - VIAL_CONSTANTS.decaimientoViaSinMant, 0, 100);
      if (Math.abs(t.estado - prevEst) >= 2) {
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_vest'),
          dia: state.reloj.dia,
          tipo: 'via_estado',
          zona: t.zonaA,
          tramoId: t.id,
          estado: Number(t.estado.toFixed(1)),
          causa: ratioDisc < 0.75 ? 'estado:impago' : 'estado:sin_obras',
        });
      }
      if (prevEst > 0 && t.estado <= 0) {
        roadTopologyChanged = true;
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_rcort'),
          dia: state.reloj.dia,
          tipo: 'ruta_cortada',
          zona: t.zonaA,
          tramoId: t.id,
          parcelasAisladas: [...t.parcelasAbiertas],
          causa: ratioDisc < 0.75 ? 'estado:impago' : 'estado:sin_obras',
        });
      }
    } else if (t.estado < 100) {
      const recov =
        VIAL_CONSTANTS.recuperacionViaConMant *
        (state.gobierno.palancasVigentes.nivelObras >= 3 ? 1.25 : 1);
      t.estado = clamp(t.estado + recov, 0, 100);
      if (prevEst <= 0 && t.estado > 0) roadTopologyChanged = true;
      if (Math.abs(t.estado - prevEst) >= 2) {
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_vest'),
          dia: state.reloj.dia,
          tipo: 'via_estado',
          zona: t.zonaA,
          tramoId: t.id,
          estado: Number(t.estado.toFixed(1)),
          causa: 'estado:mantenimiento',
        });
      }
    }
  }
  if (roadTopologyChanged || roadMantFailed) {
    recomputeRoadDistances(state);
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
  fin.mantenimientoVias = Number(opBreak.mantenimientoVias.toFixed(2));
  fin.mantenimientoEdificios = Number(opBreak.mantenimientoEdificios.toFixed(2));
  fin.mantenimiento = Number(opBreak.mantenimientoTotal.toFixed(2));
  fin.operacionObras = Number(opBreak.operacionObras.toFixed(2));
  fin.operacion = Number(opPaid.toFixed(2));
  fin.obras = Number((acum.obras ?? 0).toFixed(2));
  fin.subsidios = Number((acum.subsidios ?? 0).toFixed(2));
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
    fin.obras +
    fin.subsidios +
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
  acum.obras = 0;
  acum.subsidios = 0;
  acum.prensa = 0;
  acum.importaciones = 0;
  acum.exportaciones = 0;

  // Autopilot public service & road builds when estadoAutomatico is enabled (MUNDO_V2 §9)
  const autoState = state.config.estadoAutomatico ?? state.config.nivelGobernador === 'G0';
  if (isM2Plus && autoState) {
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
    let toBuild: 'hospital' | 'comisaria' | null = null;
    if (caps.medico < targetMed * 0.8 && state.gobierno.reserva >= BUILDING_CATALOG.hospital.costoObra * 1.6) {
      toBuild = 'hospital';
    } else if (caps.policia < targetPol * 0.8 && state.gobierno.reserva >= BUILDING_CATALOG.comisaria.costoObra * 1.6) {
      toBuild = 'comisaria';
    }
    const freePub = toBuild
      ? state.parcelas.find(
          (p) =>
            p.tipoParcela === 'publica' &&
            p.estado === 'libre' &&
            !isLotIsolated(state, p) &&
            canBuildTypeInParcela(p, toBuild!)
        )
      : undefined;
    if (toBuild && freePub && (!state.autopilotLastBuildDay || state.reloj.dia - state.autopilotLastBuildDay >= 21)) {
      const def = BUILDING_CATALOG[toBuild];
      const payee = constructoras[0] ?? state.firmas.find((f) => f.activa);
      if (payee) {
        state.gobierno.reserva -= def.costoObra;
        state.gobierno.acumuladoPeriodo.obras += def.costoObra;
        payee.ventas += def.costoObra;
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

  // Update demandaSuelo streaks & trigger road autopilot when exceeded (MUNDO_V2 §9)
  const newDemanda = computeDemandaSuelo(state);
  state.demandaSuelo = newDemanda;
  for (const [k, val] of Object.entries(newDemanda)) {
    if (val >= VIAL_CONSTANTS.umbralDemandaSuelo) {
      state.demandaSueloRachas[k] = (state.demandaSueloRachas[k] ?? 0) + 1;
    } else {
      state.demandaSueloRachas[k] = 0;
    }
  }

  if (
    isM1Plus &&
    autoState &&
    (!state.autopilotLastViaDay || state.reloj.dia - state.autopilotLastViaDay >= 14)
  ) {
    const hotEntry = Object.entries(state.demandaSueloRachas)
      .filter(([, streak]) => streak >= VIAL_CONSTANTS.periodosDemandaSuelo)
      .sort((a, b) => (newDemanda[b[0]] ?? 0) - (newDemanda[a[0]] ?? 0))[0];

    if (hotEntry) {
      const [hotZone, hotTipo] = hotEntry[0].split(':');
      const connectable = (state.tramos ?? []).filter((t) => isViaConnectableToNetwork(state, t));
      let bestTramo: (typeof connectable)[number] | null = null;
      let bestScore = Infinity;

      for (const t of connectable) {
        if (state.gobierno.reserva < t.costoObra * 1.35) continue;
        const opensMatchingType = t.parcelasAbiertas.filter((pid) => {
          const p = parcelById.get(pid);
          return p && (p.zona === hotZone || t.zonaAbierta === p.zona) && p.tipoParcela === hotTipo;
        }).length;
        const touchesHot = t.zonaA === hotZone || t.zonaB === hotZone;
        const totalOpen = Math.max(1, t.parcelasAbiertas.length);
        const relevance = opensMatchingType > 0 ? 0.45 : touchesHot ? 0.8 : 1.3;
        const score = (t.costoObra / totalOpen) * relevance;
        if (score < bestScore) {
          bestScore = score;
          bestTramo = t;
        }
      }

      if (bestTramo) {
        const payee =
          constructoras.find((f) => f.zona === bestTramo.zonaA || f.zona === bestTramo.zonaB) ??
          constructoras[0] ??
          state.firmas.find((f) => f.activa);
        if (payee) {
          state.gobierno.reserva -= bestTramo.costoObra;
          state.gobierno.acumuladoPeriodo.obras += bestTramo.costoObra;
          payee.ventas += bestTramo.costoObra;
          const diasFactor = OBRAS_LEVEL_TABLE[state.gobierno.palancasVigentes.nivelObras].diasObraFactor;
          const dias = Math.max(2, Math.round(bestTramo.diasObraTotal * diasFactor));
          bestTramo.enObra = true;
          bestTramo.diasObraRestantes = dias;
          state.autopilotLastViaDay = state.reloj.dia;
          state.demandaSueloRachas[hotEntry[0]] = 0;

          emitSimEvent(state, {
            id: nextSeqId(state, 'ev_via_i'),
            dia: state.reloj.dia,
            tipo: 'via_inicio',
            zona: bestTramo.zonaA,
            tramoId: bestTramo.id,
            tramoNombre: bestTramo.nombre,
            tipoVia: bestTramo.tipo,
            parcelasAbiertas: [...bestTramo.parcelasAbiertas],
            costo: bestTramo.costoObra,
            diasObra: dias,
            causa: 'estado:demanda_suelo',
          });
        }
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
      if (h.ocupandoCasaId) {
        const oldOccCasa = casaById.get(h.ocupandoCasaId);
        if (oldOccCasa) oldOccCasa.ocupadaPorAccion = false;
        h.ocupandoCasaId = null;
      }
      chosen.hogarId = h.id;
      chosen.ocupadaPorAccion = false;
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

  // Update zonal rent index & drop rent on houses still empty (ECONOMIA_V2 §7)
  const hogaresNonAcogidaByZone = new Map<ZoneId, Hogar[]>();
  for (const h of state.hogares) {
    if (h.estado === 'acogida') continue;
    const list = hogaresNonAcogidaByZone.get(h.zona);
    if (list) list.push(h);
    else hogaresNonAcogidaByZone.set(h.zona, [h]);
  }
  const freeHousesCountByZone = new Map<ZoneId, number>();
  for (const c of freeHouses) {
    freeHousesCountByZone.set(c.zona, (freeHousesCountByZone.get(c.zona) ?? 0) + 1);
  }
  for (const z of zones) {
    const zDef = state.zonas[z];
    if (!zDef) continue;
    const zHog = hogaresNonAcogidaByZone.get(z) ?? [];
    const calleZ = zHog.length > 0 ? zHog.filter((h) => h.estado === 'calle').length / zHog.length : 0;
    const vacZ = freeHousesCountByZone.get(z) ?? 0;
    if (calleZ > 0.08 && vacZ === 0) {
      zDef.demandaAlquilerIndice = Number(clamp(zDef.demandaAlquilerIndice * 1.04, 0.72, 1.75).toFixed(3));
    } else if (vacZ >= 2) {
      zDef.demandaAlquilerIndice = Number(clamp(zDef.demandaAlquilerIndice * 0.97, 0.72, 1.75).toFixed(3));
    }
  }

  for (const c of state.casas) {
    const base = BUILDING_CATALOG[c.tipo].alquilerBase ?? 12;
    const zIdx = state.zonas[c.zona]?.demandaAlquilerIndice ?? 1;
    const targetAlq = base * (0.4 + 0.6 * (c.estado / 100)) * zIdx;
    const floor = base * HOUSING_CONSTANTS.alquilerPisoFactor;
    if (!c.hogarId) {
      c.alquiler = Number(
        Math.max(floor, Math.min(c.alquiler * (1 - HOUSING_CONSTANTS.pasoAlquilerPct / 100), targetAlq)).toFixed(2)
      );
    } else {
      c.alquiler = Number(Math.max(floor, c.alquiler * 0.7 + targetAlq * 0.3).toFixed(2));
    }
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
      .filter((f) => f.activa && f.caja >= 460 && f.factor >= 1.04)
      .sort((a, b) => b.caja - a.caja);
    const targets = state.firmas.filter(
      (f) => f.activa && f.caja < 45 && f.periodosEnPerdida >= 1 && f.locales.length > 0
    );
    for (const buyer of buyers) {
      if (buys >= FIRM_CONSTANTS.maxComprasPorPeriodo) break;
      const target =
        targets.find(
          (t) =>
            t.activa &&
            t.id !== buyer.id &&
            t.rubro === buyer.rubro &&
            Number.isFinite(getZoneTravelCost(state, buyer.zona, t.zona))
        ) ??
        targets.find(
          (t) =>
            t.activa &&
            t.id !== buyer.id &&
            !t.esFilialDe &&
            Number.isFinite(getZoneTravelCost(state, buyer.zona, t.zona))
        );
      if (!target) continue;
      const avgProf =
        target.historialGanancias.length > 0
          ? target.historialGanancias.reduce((s, g) => s + g, 0) / target.historialGanancias.length
          : 0;
      const price = Math.max(120, avgProf * FIRM_CONSTANTS.multiploCompraFirma + target.locales.length * 130);
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
          } else if (p.tipo === 'hogar') {
            const oh = hogarById.get(p.id);
            if (oh) oh.dinero += cut;
            else state.gobierno.reserva += cut;
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

      const isSameRubro = target.rubro === buyer.rubro;
      if (isSameRubro) {
        // Absorb target into buyer (preserve caja + ventas cleanly!)
        buyer.caja += target.caja;
        buyer.ventas += target.ventas;
        target.caja = 0;
        target.ventas = 0;
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
      } else {
        // Subsidiary acquisition (filial)
        target.partes = [{ tipo: 'firma', id: buyer.id, pct: 100 }];
        target.esFilialDe = buyer.id;
        target.periodosEnPerdida = 0;
      }

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
        modo: isSameRubro ? 'absorcion' : 'filial',
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
        // Fold any un-settled ventas into dissolution estate cleanly
        if (f.ventas > 0) {
          f.caja += f.ventas;
          f.ventas = 0;
        }
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

        // Auction locales to solvent peer firm or release to libre
        for (const pid of f.locales) {
          const p = parcelById.get(pid);
          if (!p) continue;
          const auctionBuyer = p.edificio
            ? state.firmas.find(
                (peer) =>
                  peer.activa &&
                  peer.id !== f.id &&
                  peer.rubro === f.rubro &&
                  peer.caja >= 260 &&
                  BUILDING_CATALOG[p.edificio!.tipo]?.rubro === peer.rubro
              )
            : undefined;
          if (auctionBuyer && p.edificio) {
            auctionBuyer.caja -= 100;
            state.gobierno.reserva += 100;
            auctionBuyer.locales.push(pid);
            p.edificio.firmaId = auctionBuyer.id;
            p.edificio.dueno = auctionBuyer.id;
            p.edificio.duenoRef = { tipo: 'firma', id: auctionBuyer.id };
          } else {
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
    const sinInversionFirms = new Set(
      state.medidasVigentes.filter((m) => m.tipo === 'sin_inversion' && m.empresaId).map((m) => m.empresaId!)
    );

    // 7a. Existing firms expand onto free parcels matching their rubro
    for (const f of state.firmas) {
      if (!f.activa || sinInversionFirms.has(f.id) || f.periodosFactorAlto < FIRM_CONSTANTS.periodosParaInvertir) {
        continue;
      }
      const targetBuilding: BuildingType | null =
        f.rubro === 'agro'
          ? 'campo'
          : f.rubro === 'industria'
          ? 'fabrica'
          : f.rubro === 'comercio'
          ? 'tienda'
          : f.rubro === 'gastronomia'
          ? 'bar_cafe'
          : f.rubro === 'servicios'
          ? 'taller'
          : f.rubro === 'entretenimiento'
          ? 'cine_teatro'
          : f.rubro === 'construccion'
          ? 'oficina_constructora'
          : f.rubro === 'inmobiliaria'
          ? 'oficina_inmobiliaria'
          : null;
      if (!targetBuilding) continue;
      const def = BUILDING_CATALOG[targetBuilding];
      if (f.caja < def.costoObra * 1.4) continue;
      const freeParcel = state.parcelas.find(
        (p) =>
          p.tipoParcela === def.parcelTipo &&
          p.estado === 'libre' &&
          !isLotIsolated(state, p) &&
          canBuildTypeInParcela(p, targetBuilding) &&
          Number.isFinite(getZoneTravelCost(state, f.zona, p.zona))
      );
      if (!freeParcel) continue;

      f.caja -= def.costoObra;
      if (constr) constr.ventas += def.costoObra;
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

    // 7b. Demand-driven entrepreneurship (ECONOMIA_V2 §6b & §8)
    const activeCatFirmsCount: Record<SpendCategory, number> = {
      bienes: state.firmas.filter((f) => f.activa && f.rubro === 'comercio').length,
      gastronomia: state.firmas.filter((f) => f.activa && f.rubro === 'gastronomia').length,
      servicios: state.firmas.filter((f) => f.activa && f.rubro === 'servicios').length,
      entretenimiento: state.firmas.filter((f) => f.activa && f.rubro === 'entretenimiento').length,
    };
    const neediestCategory = (Object.entries(activeCatFirmsCount) as Array<[SpendCategory, number]>).sort(
      (a, b) => a[1] - b[1]
    )[0][0];

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

      let buildingType: BuildingType;
      let founderCause = 'mercado:emprendimiento';
      if (cand.rol === 'periodista') {
        buildingType = 'oficina_medio';
      } else if (
        !state.firmas.some((f) => f.activa && f.rubro === 'industria') &&
        state.parcelas.some(
          (p) =>
            p.tipoParcela === 'industrial' &&
            p.estado === 'libre' &&
            !isLotIsolated(state, p) &&
            canBuildTypeInParcela(p, 'fabrica')
        )
      ) {
        buildingType = 'fabrica';
        founderCause = 'mercado:demanda_industria';
      } else if (neediestCategory === 'gastronomia') {
        buildingType = 'bar_cafe';
        founderCause = 'mercado:demanda_gastronomia';
      } else if (neediestCategory === 'servicios') {
        buildingType = 'peluqueria';
        founderCause = 'mercado:demanda_servicios';
      } else if (neediestCategory === 'entretenimiento') {
        buildingType = 'club';
        founderCause = 'mercado:demanda_entretenimiento';
      } else {
        buildingType = 'kiosco';
      }

      const def = BUILDING_CATALOG[buildingType];
      const rubro = def.rubro ?? 'comercio';
      if (h.dinero < def.costoObra + 40) continue;

      const freeP = state.parcelas.find(
        (p) =>
          p.tipoParcela === def.parcelTipo &&
          p.estado === 'libre' &&
          !isLotIsolated(state, p) &&
          canBuildTypeInParcela(p, buildingType) &&
          Number.isFinite(getZoneTravelCost(state, cand.zona, p.zona))
      );
      if (!freeP) continue;

      h.dinero -= def.costoObra + 35;
      if (constr) constr.ventas += def.costoObra;
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
        ultimaCausa: founderCause,
      };
      state.firmas.push(newFirm);
      cand.partes.push({ firmaId: newFirmId, pct: 100 });
      if (cand.rol === 'desempleado') {
        cand.rol =
          rubro === 'medio'
            ? 'periodista'
            : rubro === 'industria'
            ? 'obrero'
            : 'comerciante';
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
        causa: founderCause,
      });
    }

    // 7c. Private residential construction when calle or crowding spikes & ROI holds
    let housesBuilt = 0;
    const inmobiliarias = state.firmas.filter((f) => f.activa && f.rubro === 'inmobiliaria');
    const freeResByZone = new Map<ZoneId, Parcela>();
    for (const p of state.parcelas) {
      if (p.tipoParcela === 'residencial' && p.estado === 'libre' && !isLotIsolated(state, p) && !freeResByZone.has(p.zona)) {
        freeResByZone.set(p.zona, p);
      }
    }
    const buildHogaresByZone = new Map<ZoneId, Hogar[]>();
    for (const h of state.hogares) {
      if (h.estado === 'acogida') continue;
      const list = buildHogaresByZone.get(h.zona);
      if (list) list.push(h);
      else buildHogaresByZone.set(h.zona, [h]);
    }
    for (const z of zones) {
      if (housesBuilt >= FIRM_CONSTANTS.maxConstruccionesPrivadasPeriodo) break;
      const zHogares = buildHogaresByZone.get(z) ?? [];
      if (zHogares.length === 0) continue;
      const calleZ = (zHogares.filter((h) => h.estado === 'calle').length / zHogares.length) * 100;
      const conCasaZ = zHogares.filter((h) => h.estado === 'con_casa');
      const hacinZ =
        conCasaZ.length > 0
          ? (conCasaZ.filter((h) => {
              const c = h.casaId ? casaById.get(h.casaId) : undefined;
              return Boolean(c && h.miembros.length > c.capacidad);
            }).length /
              conCasaZ.length) *
            100
          : 0;
      if (
        calleZ < HOUSING_CONSTANTS.umbralCalleConstruirPct &&
        hacinZ < HOUSING_CONSTANTS.umbralHacinamientoConstruirPct
      ) {
        continue;
      }

      const freeRes = freeResByZone.get(z);
      if (!freeRes) continue;
      const desiredHouseType: HouseType = calleZ >= 12 ? 'casa_chica' : 'casa_mediana';
      const houseType: HouseType = canBuildTypeInParcela(freeRes, desiredHouseType) ? desiredHouseType : 'casa_chica';
      if (!canBuildTypeInParcela(freeRes, houseType)) continue;
      const def = BUILDING_CATALOG[houseType];
      const zDem = state.zonas[z]?.demandaAlquilerIndice ?? 1;
      const expectedRent = (def.alquilerBase ?? 12) * zDem;
      if (expectedRent * HOUSING_CONSTANTS.periodosRecuperoInversionCasa < def.costoObra * 0.75) {
        continue;
      }

      const builder =
        inmobiliarias.find((f) => !sinInversionFirms.has(f.id) && f.caja >= def.costoObra) ??
        constructoras.find((f) => !sinInversionFirms.has(f.id) && f.caja >= def.costoObra);
      if (!builder) continue;

      freeResByZone.delete(z);

      builder.caja -= def.costoObra;
      if (constr) constr.ventas += def.costoObra;
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
  const extrasPresion = state.gobierno.extras?.vigentes?.presion ?? 0;
  const extrasAcceso = state.gobierno.extras?.vigentes?.acceso ?? 0;

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

    // Credibility moves with dependency, monopoly penalty, G3 press pressure & press office access
    if (dep > ECON_CONSTANTS.umbralDependenciaPrensaPct) {
      m.credibilidad = clamp(m.credibilidad - 2.2, 15, 98);
    } else {
      m.credibilidad = clamp(m.credibilidad + 0.8, 15, 98);
    }
    if (activeMedios.length === 1) {
      m.credibilidad = clamp(m.credibilidad - (m.lineaEditorial.sensacionalismo > 60 ? 1.7 : 0.5), 15, 98);
    }
    if (extrasPresion > LEVEL11_CONSTANTS.presionUmbral) {
      m.credibilidad = clamp(
        m.credibilidad - (extrasPresion - LEVEL11_CONSTANTS.presionUmbral) * LEVEL11_CONSTANTS.presionCredPorPunto,
        15,
        98
      );
    }
    if (extrasAcceso > 0) {
      m.credibilidad = clamp(m.credibilidad + extrasAcceso * LEVEL11_CONSTANTS.accesoCredPorPunto, 15, 98);
    }
    m.credibilidad = Number(m.credibilidad.toFixed(1));

    // Reach adjusts gently with total revenue & G3 press access
    const targetReach = clamp(
      25 + Math.sqrt(Math.max(0, totalRev)) * 5.2 + extrasAcceso * LEVEL11_CONSTANTS.accesoAlcancePorPunto,
      18,
      95
    );
    m.alcancePct = Number((m.alcancePct * 0.82 + targetReach * 0.18).toFixed(1));

    // Editorial drift toward owners' political loyalty & G3 press pressure
    const prevAff = m.lineaEditorial.afinidadGobierno;
    const prevSens = m.lineaEditorial.sensacionalismo;
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
        const ownerTargetAff = clamp(
          avgLoy / weightSum + (dep > 35 ? 10 : 0) + extrasPresion * LEVEL11_CONSTANTS.presionAfinidadPorPunto,
          10,
          96
        );
        const ownerTargetSens = clamp(avgSens / weightSum, 15, 95);
        m.lineaEditorial.afinidadGobierno = Number(
          (prevAff + (ownerTargetAff - prevAff) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
        );
        m.lineaEditorial.sensacionalismo = Number(
          (prevSens + (ownerTargetSens - prevSens) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
        );
      } else if (extrasPresion > 0) {
        const targetAff = clamp(m.afinidadBase + extrasPresion * LEVEL11_CONSTANTS.presionAfinidadPorPunto, 10, 96);
        m.lineaEditorial.afinidadGobierno = Number(
          (prevAff + (targetAff - prevAff) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
        );
      }
    } else if (extrasPresion > 0) {
      const targetAff = clamp(m.afinidadBase + extrasPresion * LEVEL11_CONSTANTS.presionAfinidadPorPunto, 10, 96);
      m.lineaEditorial.afinidadGobierno = Number(
        (prevAff + (targetAff - prevAff) * FIRM_CONSTANTS.kLineaEditorial).toFixed(1)
      );
    }
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
  const rentSumByZone = new Map<ZoneId, { sum: number; count: number }>();
  for (const c of state.casas) {
    const entry = rentSumByZone.get(c.zona);
    if (entry) {
      entry.sum += c.alquiler;
      entry.count++;
    } else {
      rentSumByZone.set(c.zona, { sum: c.alquiler, count: 1 });
    }
  }
  const alquilerMedio: Record<ZoneId, number> = {};
  for (const z of zones) {
    const entry = rentSumByZone.get(z);
    alquilerMedio[z] =
      entry && entry.count > 0 ? Number((entry.sum / entry.count).toFixed(2)) : 12;
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
