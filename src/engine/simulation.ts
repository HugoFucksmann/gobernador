import {
  ACTION_TABLE,
  DIRECTOR_CONSTANTS,
  DISTRICTS,
  ECON_CONSTANTS,
  EFFECT_CATALOG,
  FOREIGN_TRADE_STEPS,
  LEVER_BOUNDS,
  LEVER_VALENCIA,
  NEWS_TEMPLATES,
  PERIOD_DAYS,
  PRESS_CONSTANTS,
  PRICE_CAP_FACTORS,
  PRIVATE_ROLES,
  PUBLIC_ROLES,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
  SERVICE_LEVEL_TABLE,
  SERVICE_LEVER_TO_AREA,
  SERVICE_LEVER_TO_ROLE,
  SERVICE_PUBLIC_ROLES,
} from '../data/catalogs';
import {
  ActionDefinition,
  CausalStep,
  ClimatePhenomenon,
  CommunityDerived,
  EnterpriseTramo,
  EventLogEntry,
  ForeignTradeStep,
  GameState,
  ModifiableKey,
  Modifier,
  NewsArticle,
  NewsTone,
  NewsTopic,
  Npc,
  NpcVariable,
  ObjectiveCondition,
  PersonalityTrait,
  PhenomenonType,
  PressFact,
  PressFactData,
  PressValence,
  PriceCapMode,
  PrivateRoleId,
  PublicRoleId,
  RoleId,
  ServiceAreaId,
  ServiceLevel,
  ServiceLeverId,
  ServicePublicRoleId,
  SimEvent,
  ZoneId,
} from '../types/game';
import { nextRand, nextSeqId, randInt } from './rng';
import {
  getCityErrandPosition,
  getDistrictPosition,
  getZoneCanvasPosition,
} from './worldGenerator';

export const TICKS_PER_DAY = 120;

interface RngAndSeq {
  rngState: number;
  idSeq: number;
}

function drawRand(state?: { rngState: number }): number {
  return state ? nextRand(state) : Math.random();
}

function makeSeqId(state: { idSeq: number } | undefined, prefix: string): string {
  return state ? nextSeqId(state, prefix) : `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeTotalWorldMoney(state: GameState): number {
  let total =
    state.gobierno.reserva +
    state.empresas.alimento.ventasAcum +
    state.empresas.comercio.ventasAcum;
  for (const npc of state.npcs) {
    total += npc.economia.dinero;
  }
  return total;
}

export function getStage(edad: number): 'menor' | 'adulto' | 'jubilado' {
  if (edad < 18) return 'menor';
  if (edad >= 65) return 'jubilado';
  return 'adulto';
}

export function getEffectiveTrait(npc: Npc, trait: PersonalityTrait): number {
  let delta = 0;
  for (const mod of npc.modificadores) {
    if (mod.duracionDias <= 0) continue;
    const val = mod.afecta[trait];
    if (typeof val === 'number') delta += val;
  }
  return clamp(npc.personalidad[trait] + delta, 0, 100);
}

export function getModifierDelta(npc: Npc, key: ModifiableKey): number {
  let delta = 0;
  for (const mod of npc.modificadores) {
    if (mod.duracionDias <= 0) continue;
    const val = mod.afecta[key];
    if (typeof val === 'number') delta += val;
  }
  return delta;
}

export function getActivePhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => dia >= f.inicioDia && dia < f.inicioDia + f.duracionDias
  );
}

export function getAnnouncedPhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter((f) => {
    const aviso = f.avisoDias ?? 0;
    return aviso > 0 && dia >= f.inicioDia - aviso && dia < f.inicioDia;
  });
}

export function getEffectiveZone(npc: Npc, zonesCount: number): ZoneId {
  if (zonesCount <= 1) return 'centro';
  if (npc.hospital.internado) return 'centro';
  if (npc.accionIa?.zonaDestino) return npc.accionIa.zonaDestino;
  return npc.zona || 'centro';
}

const shortestPathCache = new Map<string, ZoneId[]>();

export function shortestZonePath(
  from: ZoneId,
  to: ZoneId,
  zonas: Record<ZoneId, { vecinas: ZoneId[] }>
): ZoneId[] {
  if (from === to) return [from];
  const order = Object.keys(zonas) as ZoneId[];
  const cacheKey = `${from}|${to}|${order.join(',')}`;
  const cached = shortestPathCache.get(cacheKey);
  if (cached) return cached;

  const visited = new Set<ZoneId>([from]);
  const parent: Partial<Record<ZoneId, ZoneId>> = {};
  const queue: ZoneId[] = [from];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const rawNeighbors = zonas[curr]?.vecinas || [];
    const orderedNeighbors = order.filter((z) => rawNeighbors.includes(z));
    for (const next of orderedNeighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent[next] = curr;
      if (next === to) {
        const path: ZoneId[] = [to];
        let step: ZoneId | undefined = to;
        while (step && step !== from) {
          step = parent[step];
          if (step) path.unshift(step);
        }
        shortestPathCache.set(cacheKey, path);
        return path;
      }
      queue.push(next);
    }
  }
  const fallback = [from, to];
  shortestPathCache.set(cacheKey, fallback);
  return fallback;
}

export function emitSimEvent(state: GameState, event: SimEvent): void {
  state.eventosDiaActual.push(event);
  state.eventos.unshift(event);
  if (state.eventos.length > 300) {
    state.eventos.length = 300;
  }
}

export function computeAmenazaPercibida(state: GameState): Record<ZoneId, number> {
  const dia = state.reloj.dia;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  const minHitDay = dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;

  const result: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };

  const trackedPhenomena = state.clima.fenomenos.filter((f) => {
    const aviso = f.avisoDias ?? 0;
    return f.origen && dia >= f.inicioDia - aviso && dia < f.inicioDia + f.duracionDias;
  });

  for (const z of zones) {
    let avisoVal = 0;
    const hasPhenomInZone = trackedPhenomena.some((f) => f.origen === z);
    if (hasPhenomInZone) {
      for (const n of state.noticias) {
        if (
          n.esAviso &&
          n.zonaOrigen === z &&
          (n.vigenteHastaDia === undefined || dia < n.vigenteHastaDia)
        ) {
          const medio = state.medios.find((m) => m.id === n.medioId);
          const cred = n.credibilidad ?? medio?.credibilidad ?? 60;
          const score = (n.alcance * cred) / 100;
          if (score > avisoVal) avisoVal = score;
        }
      }
    }

    const hits = (state.golpesPorZonaHistorial[z] || []).filter((d) => d > minHitDay && d <= dia).length;
    const golpesVal = Math.min(100, ECON_CONSTANTS.golpeAmenazaPeso * hits);

    result[z] = Number(Math.max(avisoVal, golpesVal).toFixed(1));
  }

  return result;
}

export function computePoliceSplitAndMetrics(state: GameState): {
  defensa: Record<ZoneId, number>;
  orden: Record<ZoneId, number>;
  satMediaZona: Record<ZoneId, number>;
  necesidadTotalZona: Record<ZoneId, number>;
} {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  const nZones = Math.max(1, zones.length);
  const seguridad = state.gobierno.indicadores.seguridad;
  const c = ECON_CONSTANTS.movilidadDefensa;
  const amenaza = computeAmenazaPercibida(state);

  const policeCounts: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  const popZona: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  const spontZona: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  const descontZona: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  const sumSatZona: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    const z = getEffectiveZone(npc, nZones);
    popZona[z] = (popZona[z] || 0) + 1;
    sumSatZona[z] = (sumSatZona[z] || 0) + npc.variables.satisfaccion;
    if (npc.accionIa?.tipo === 'espontanea') {
      spontZona[z] = (spontZona[z] || 0) + 1;
    }
    if (npc.variables.satisfaccion < 30) {
      descontZona[z] = (descontZona[z] || 0) + 1;
    }
    if (npc.rol === 'policia' && !npc.hospital.internado && !npc.accionIa?.fueraDePuesto) {
      policeCounts[z] = (policeCounts[z] || 0) + 1;
    }
  }

  let totalPolice = 0;
  for (const z of zones) {
    totalPolice += policeCounts[z] || 0;
  }

  const defensa: Record<ZoneId, number> = {
    centro: seguridad,
    norte: seguridad,
    este: seguridad,
    sur: seguridad,
    oeste: seguridad,
  };
  const orden: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  const satMediaZona: Record<ZoneId, number> = {
    centro: 50,
    norte: 50,
    este: 50,
    sur: 50,
    oeste: 50,
  };
  const necesidadTotalZona: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };

  for (const z of zones) {
    const popZ = popZona[z] || 0;
    satMediaZona[z] = popZ > 0 ? Number((sumSatZona[z] / popZ).toFixed(1)) : 50;

    const necDef = amenaza[z] ?? 0;
    const spontPct = popZ > 0 ? (spontZona[z] / popZ) * 100 : 0;
    const descontPct = popZ > 0 ? (descontZona[z] / popZ) * 100 : 0;
    const necOrd = Math.min(100, spontPct + descontPct);
    necesidadTotalZona[z] = necDef + necOrd;

    const polZ = policeCounts[z] || 0;
    const parte = totalPolice > 0 ? polZ / totalPolice : 1 / nZones;
    const integrity = state.gobierno.integridad?.[z] ?? 100;
    const integrityFactor = 1 - ECON_CONSTANTS.kIntegridad * (1 - integrity / 100);
    defensa[z] = Number(
      clamp(seguridad * (1 - c + c * nZones * parte) * integrityFactor, 0, 100).toFixed(1)
    );
    orden[z] =
      popZ > 0
        ? Number(clamp((100 * (polZ / popZ)) / ECON_CONSTANTS.objetivoOrden, 0, 100).toFixed(1))
        : 0;
  }

  return { defensa, orden, satMediaZona, necesidadTotalZona };
}

export function computeZoneDefense(state: GameState): Record<ZoneId, number> {
  return computePoliceSplitAndMetrics(state).defensa;
}

export function computeZoneOrder(state: GameState): Record<ZoneId, number> {
  return computePoliceSplitAndMetrics(state).orden;
}

function updateZoneIntegrity(state: GameState, zonesCount: number): void {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  const infraFactor = 0.5 + 0.5 * (state.gobierno.indicadores.infraestructura / 100);

  const repairersByZone: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };

  for (const npc of state.npcs) {
    if (!npc.vivo || npc.hospital.internado) continue;
    const z = getEffectiveZone(npc, zonesCount);
    if (!npc.accionIa?.fueraDePuesto && (npc.rol === 'obrero' || npc.rol === 'ingeniero')) {
      repairersByZone[z] = (repairersByZone[z] || 0) + 1;
    }
    if (npc.accionIa) {
      const repEf = npc.accionIa.efectos.find((e) => e.id === 'repara');
      if (repEf && (state.gobierno.integridad[z] ?? 100) < 100) {
        const spec = EFFECT_CATALOG.repara[repEf.intensidad ?? 'media'];
        repairersByZone[z] = (repairersByZone[z] || 0) + spec.pesoReparador;
      }
    }
  }

  for (const z of zones) {
    const current = state.gobierno.integridad[z] ?? 100;
    const gain = ECON_CONSTANTS.repPorNpc * repairersByZone[z] * infraFactor;
    const next = clamp(Number((current + gain).toFixed(2)), 0, 100);
    state.gobierno.integridad[z] = next;

    if (Math.round(next) !== Math.round(state.ultimaIntegridadZona[z] ?? 100)) {
      state.ultimaIntegridadZona[z] = next;
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'integridad',
        zona: z,
        valor: Number(next.toFixed(1)),
        causa: state.ultimaCausaPalanca || state.ultimoEventoClimaId,
      });
    }
  }
}

export function deriveCommunityStats(state: GameState): CommunityDerived {
  const vivosList = state.npcs.filter((n) => n.vivo);
  const vivos = vivosList.length;
  const bajas = state.npcs.length - vivos;

  const roles: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    empresario: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    desempleado: 0,
    jubilado: 0,
  };

  const { defensa, orden } = computePoliceSplitAndMetrics(state);
  const amenazaPercibida = computeAmenazaPercibida(state);

  if (vivos === 0) {
    return {
      poblacion: 0,
      poblacionPct: 0,
      vivos: 0,
      bajas,
      satisfaccionMedia: 0,
      apoyoPct: 0,
      descontentosPct: 0,
      hambreCriticaPct: 0,
      sinDineroPct: 0,
      despensaMediaDias: 0,
      hospitalOcupacionPct: 0,
      camasHospital: 1,
      internados: 0,
      esperandoCama: 0,
      defensa,
      orden,
      amenazaPercibida,
      productividadTotal: 0,
      roles,
    };
  }

  let sumSat = 0;
  let sumDespensa = 0;
  let electoresCount = 0;
  let apoyoCount = 0;
  let descontentosCount = 0;
  let hambreCriticaCount = 0;
  let sinDineroCount = 0;
  let prodTotal = 0;
  let medicosActivos = 0;
  let internados = 0;
  let esperandoCama = 0;

  for (const npc of vivosList) {
    roles[npc.rol]++;
    sumSat += npc.variables.satisfaccion;
    sumDespensa += npc.economia.despensa ?? 0;
    const isElector = npc.edad >= 18;
    if (isElector) {
      electoresCount++;
      if (npc.variables.lealtad >= 50) apoyoCount++;
      if (
        npc.economia.noPudoPagarComida ||
        (npc.economia.dinero < state.alimento.precio &&
          npc.economia.despensa < ECON_CONSTANTS.umbralRecompraDias)
      ) {
        sinDineroCount++;
      }
    }
    if (npc.variables.satisfaccion < 30) descontentosCount++;
    if (npc.variables.hambre > 80) hambreCriticaCount++;
    if (npc.hospital.internado) internados++;
    else if (npc.hospital.esperandoCama) esperandoCama++;
    if (npc.rol === 'medico' && !npc.hospital.internado && !npc.accionIa?.fueraDePuesto) {
      medicosActivos++;
    }
    prodTotal += getNpcProductivity(npc, state) * 100;
  }

  const basePop = Math.max(1, state.config.poblacionInicial || state.npcs.length);
  const camasHospital = Math.max(1, medicosActivos * ECON_CONSTANTS.pacientesPorMedico);
  const hospitalOcupacionPct = Number((((internados + esperandoCama) / camasHospital) * 100).toFixed(1));

  return {
    poblacion: vivos,
    poblacionPct: Number(((vivos / basePop) * 100).toFixed(1)),
    vivos,
    bajas,
    satisfaccionMedia: Number((sumSat / vivos).toFixed(1)),
    apoyoPct: electoresCount > 0 ? Number(((apoyoCount / electoresCount) * 100).toFixed(1)) : 0,
    descontentosPct: Number(((descontentosCount / vivos) * 100).toFixed(1)),
    hambreCriticaPct: Number(((hambreCriticaCount / vivos) * 100).toFixed(1)),
    sinDineroPct: electoresCount > 0 ? Number(((sinDineroCount / electoresCount) * 100).toFixed(1)) : 0,
    despensaMediaDias: Number((sumDespensa / vivos).toFixed(1)),
    hospitalOcupacionPct,
    camasHospital,
    internados,
    esperandoCama,
    defensa,
    orden,
    amenazaPercibida,
    productividadTotal: Math.round(prodTotal),
    roles,
  };
}

export function getTaxRateForNpc(npc: Npc, state: GameState): number {
  const def = ROLE_CATALOG[npc.rol];
  if (def.grupo === 'sin_ingreso') return 0;
  return state.gobierno.palancasVigentes.impuesto;
}

export function getNpcProductivity(npc: Npc, state: GameState): number {
  if (!npc.vivo) return 0;
  if (npc.hospital.internado) return 0;
  if (npc.accionIa?.fueraDePuesto) return 0;

  const lab = getEffectiveTrait(npc, 'laboriosidad') / 100;
  const salud = npc.variables.salud / 100;
  const sat = npc.variables.satisfaccion / 100;

  const infraFactor = 0.85 + 0.3 * (state.gobierno.indicadores.infraestructura / 100);
  const taxRate = getTaxRateForNpc(npc, state);
  const fiscalFactor =
    taxRate <= ECON_CONSTANTS.fiscalUmbral
      ? 1
      : Math.max(0.5, 1 - ECON_CONSTANTS.fiscalPendiente * (taxRate - ECON_CONSTANTS.fiscalUmbral));

  const modProd = getModifierDelta(npc, 'productividad') / 100;
  const impagoPenalty =
    ROLE_CATALOG[npc.rol].publico &&
    state.gobierno.finanzas.impago &&
    state.gobierno.finanzas.alcanzaNomina
      ? 0.65
      : 1;

  const raw =
    (0.35 + 0.65 * lab) *
    (0.45 + 0.55 * salud) *
    (0.55 + 0.45 * sat) *
    infraFactor *
    fiscalFactor *
    impagoPenalty +
    modProd;

  return clamp(raw, 0, 1.35);
}

function recordLeverEvent(
  state: GameState,
  palanca: string,
  prevVal: number | string,
  nextVal: number | string
): void {
  const isSame =
    typeof prevVal === 'number' && typeof nextVal === 'number'
      ? Math.abs(nextVal - prevVal) < 0.01
      : prevVal === nextVal;
  if (isSame) return;

  const fmt = (v: number | string) => (typeof v === 'number' ? Number(v.toFixed(1)) : v);
  const evId = nextSeqId(state, `ev_${state.reloj.dia}`);
  emitSimEvent(state, {
    id: evId,
    dia: state.reloj.dia,
    tipo: 'palanca',
    zona: 'centro',
    palanca,
    valorAnterior: fmt(prevVal),
    valorNuevo: fmt(nextVal),
  });
  state.ultimaCausaPalanca = evId;
  addLog(
    state,
    'gobernador',
    `palanca:${palanca}`,
    `Cambio en ${palanca}`,
    `${fmt(prevVal)} → ${fmt(nextVal)}`,
    undefined,
    evId
  );
}

function applyLeverChanges(state: GameState): void {
  const cur = state.gobierno.palancasVigentes;
  const tgt = state.gobierno.palancasObjetivo;

  const applyNum = (
    palanca: string,
    prevVal: number,
    tgtVal: number,
    min: number,
    max: number,
    setter: (v: number) => void
  ) => {
    const nextVal = Number(clamp(tgtVal, min, max).toFixed(2));
    if (Math.abs(nextVal - prevVal) >= 0.01) {
      setter(nextVal);
      recordLeverEvent(state, palanca, prevVal, nextVal);
    }
  };

  applyNum('impuesto', cur.impuesto, tgt.impuesto, LEVER_BOUNDS.impuesto.min, LEVER_BOUNDS.impuesto.max, (v) => {
    cur.impuesto = v;
  });

  applyNum(
    'salario_publico',
    cur.salarioPublico,
    tgt.salarioPublico,
    LEVER_BOUNDS.salarioPublico.min,
    LEVER_BOUNDS.salarioPublico.max,
    (v) => {
      cur.salarioPublico = v;
    }
  );

  (['seguridad', 'salud', 'obras'] as ServiceLeverId[]).forEach((lev) => {
    const nextLvl = clamp(Math.round(tgt.servicios[lev]), 0, 5) as ServiceLevel;
    const prevLvl = cur.servicios[lev];
    if (nextLvl !== prevLvl) {
      cur.servicios[lev] = nextLvl;
      recordLeverEvent(state, `servicios.${lev}`, prevLvl, nextLvl);
    }
  });

  applyNum(
    'ayuda_social',
    cur.ayudaSocial,
    tgt.ayudaSocial,
    LEVER_BOUNDS.ayudaSocial.min,
    LEVER_BOUNDS.ayudaSocial.max,
    (v) => {
      cur.ayudaSocial = v;
    }
  );

  applyNum(
    'garantia_alimentaria',
    cur.garantiaAlimentaria,
    tgt.garantiaAlimentaria,
    LEVER_BOUNDS.garantiaAlimentaria.min,
    LEVER_BOUNDS.garantiaAlimentaria.max,
    (v) => {
      cur.garantiaAlimentaria = v;
    }
  );

  const validCap: PriceCapMode =
    tgt.precioMaximo === 'moderado' || tgt.precioMaximo === 'estricto' ? tgt.precioMaximo : 'libre';
  if (validCap !== cur.precioMaximo) {
    const prev = cur.precioMaximo;
    cur.precioMaximo = validCap;
    recordLeverEvent(state, 'precio_maximo', prev, validCap);
  }

  const validTradeSteps = FOREIGN_TRADE_STEPS.map((s) => s.value);
  const nextTrade: ForeignTradeStep = validTradeSteps.includes(tgt.comercioExterior)
    ? tgt.comercioExterior
    : 0;
  if (nextTrade !== cur.comercioExterior) {
    const prev = cur.comercioExterior;
    cur.comercioExterior = nextTrade;
    recordLeverEvent(state, 'comercio_exterior', prev, nextTrade);
  }

  applyNum('prensa', cur.prensa, tgt.prensa, LEVER_BOUNDS.prensa.min, LEVER_BOUNDS.prensa.max, (v) => {
    cur.prensa = v;
  });

  if (state.config.economiaModulo === 'fiscal') {
    applyNum(
      'tope_emision',
      cur.topeEmision,
      tgt.topeEmision,
      LEVER_BOUNDS.topeEmision.min,
      LEVER_BOUNDS.topeEmision.max,
      (v) => {
        cur.topeEmision = v;
      }
    );
  }
}

function addLog(
  state: GameState,
  categoria: EventLogEntry['categoria'],
  origen: string,
  titulo: string,
  detalle: string,
  causa?: string,
  simEventId?: string
): void {
  state.bitacora.unshift({
    id: nextSeqId(state, `log_${state.reloj.dia}`),
    dia: state.reloj.dia,
    categoria,
    origen,
    causa,
    simEventId,
    titulo,
    detalle,
  });
  if (state.bitacora.length > 160) {
    state.bitacora.length = 160;
  }
}

export function applyModifierToNpc(
  npc: Npc,
  mod: Omit<Modifier, 'id' | 'diasRestantes'>,
  state?: { idSeq: number }
): void {
  npc.modificadores.push({
    ...mod,
    id: makeSeqId(state, 'mod'),
    diasRestantes: mod.duracionDias,
  });
  const varKeys: NpcVariable[] = ['salud', 'hambre', 'miedo', 'satisfaccion', 'lealtad'];
  for (const key of varKeys) {
    const val = mod.afecta[key];
    if (typeof val === 'number') {
      npc.variables[key] = clamp(npc.variables[key] + val * 0.6, 0, 100);
    }
  }
}

export function applyInstantModifierToNpc(
  npc: Npc,
  mod: {
    afecta: Partial<Record<NpcVariable, number>>;
    origen: string;
    texto: string;
    causa?: string;
    recordOnNpc?: boolean;
  },
  state?: { idSeq: number }
): void {
  const varKeys: NpcVariable[] = ['salud', 'hambre', 'miedo', 'satisfaccion', 'lealtad'];
  for (const key of varKeys) {
    const val = mod.afecta[key];
    if (typeof val === 'number') {
      npc.variables[key] = clamp(npc.variables[key] + val, 0, 100);
    }
  }
  if (mod.recordOnNpc) {
    npc.modificadores.push({
      id: makeSeqId(state, 'imod'),
      afecta: mod.afecta,
      duracionDias: 0,
      diasRestantes: 0,
      origen: mod.origen,
      causa: mod.causa,
      texto: mod.texto,
    });
  }
}

export function pickActionText(
  action: ActionDefinition,
  npcName: string,
  state?: GameState | { rngState: number; ultimaVariantePorAccion?: Record<string, number> },
  roleName?: string,
  zoneName?: string
): string {
  const pool = action.textos && action.textos.length > 0 ? action.textos : [`{nombre}: ${action.nombre}`];
  const lastIdx =
    state && 'ultimaVariantePorAccion' in state && state.ultimaVariantePorAccion
      ? state.ultimaVariantePorAccion[action.id]
      : undefined;

  let chosenIdx = 0;
  if (pool.length > 1 && typeof lastIdx === 'number' && lastIdx >= 0 && lastIdx < pool.length) {
    const candidates: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (i !== lastIdx) candidates.push(i);
    }
    chosenIdx = candidates[Math.floor(drawRand(state) * candidates.length)];
  } else {
    chosenIdx = Math.floor(drawRand(state) * pool.length);
  }

  if (state && 'ultimaVariantePorAccion' in state && state.ultimaVariantePorAccion) {
    state.ultimaVariantePorAccion[action.id] = chosenIdx;
  }

  return pool[chosenIdx]
    .replaceAll('{nombre}', npcName)
    .replaceAll('{rol}', roleName || 'vecino')
    .replaceAll('{zona}', zoneName || 'centro');
}

export function hasOutOfPostEffect(action: Pick<ActionDefinition, 'efectos'>): boolean {
  return action.efectos.some((e) => e.id === 'fuera_de_puesto');
}

export function canRoleLeavePost(state: GameState, role: RoleId): boolean {
  let total = 0;
  let out = 0;
  for (const n of state.npcs) {
    if (!n.vivo || n.rol !== role) continue;
    total++;
    if (n.accionIa?.fueraDePuesto) out++;
  }
  if (total === 0) return false;
  return ((out + 1) / total) * 100 <= state.config.caos.maxPctRolFueraDePuesto;
}

function setNpcActionMovement(
  npc: Npc,
  actionId: string,
  actionName: string,
  state: { rngState: number }
): void {
  if (['protesta', 'huelga', 'predicar', 'saqueo', 'organizar_asamblea'].includes(actionId)) {
    const plaza = DISTRICTS.find((d) => d.id === (actionId === 'huelga' ? 'civico' : 'mercado'))!;
    npc.mapa.destino = {
      x: plaza.x + 30 + drawRand(state) * (plaza.w - 60),
      y: plaza.y + 45 + drawRand(state) * (plaza.h - 70),
    };
  } else if (actionId === 'organizar_fiesta' || actionId === 'cantar_en_plaza') {
    const plaza = DISTRICTS.find((d) => d.id === 'mercado')!;
    npc.mapa.destino = {
      x: plaza.x + 40 + drawRand(state) * (plaza.w - 80),
      y: plaza.y + 50 + drawRand(state) * (plaza.h - 80),
    };
  }
  npc.mapa.accion = actionName.toLowerCase();
}

function resetNpcIdleLocation(npc: Npc, state: { rngState: number }): void {
  npc.mapa.accion =
    npc.rol === 'estudiante'
      ? 'estudiando'
      : npc.rol === 'jubilado' || npc.rol === 'desempleado'
      ? 'paseando'
      : 'trabajando';
  npc.mapa.destino = getDistrictPosition(npc.rol, state);
}

function pickNearestZoneNpcs(
  state: GameState,
  originNpc: Npc,
  effZone: ZoneId,
  zonesCount: number,
  radioPct: number
): Npc[] {
  const zoneNpcs = state.npcs.filter(
    (n) => n.vivo && !n.hospital.internado && getEffectiveZone(n, zonesCount) === effZone
  );
  const affectedCount = Math.max(1, Math.round(zoneNpcs.length * radioPct));
  const prioritized = [...zoneNpcs].sort((a, b) => {
    if (a.id === originNpc.id) return -1;
    if (b.id === originNpc.id) return 1;
    const distA = Math.hypot(a.mapa.x - originNpc.mapa.x, a.mapa.y - originNpc.mapa.y);
    const distB = Math.hypot(b.mapa.x - originNpc.mapa.x, b.mapa.y - originNpc.mapa.y);
    return distA - distB;
  });
  return prioritized.slice(0, Math.min(affectedCount, prioritized.length));
}

function applyActionEffectsToNpc(
  state: GameState,
  npc: Npc,
  action: ActionDefinition,
  duracion: number,
  origen: string,
  causaId: string | undefined,
  texto: string,
  zonesCount: number
): void {
  const effZone = getEffectiveZone(npc, zonesCount);

  for (const ef of action.efectos) {
    if (
      ef.id === 'fuera_de_puesto' ||
      ef.id === 'moviliza' ||
      ef.id === 'decorativa' ||
      ef.id === 'repara' ||
      ef.id === 'cuida' ||
      ef.id === 'comparte' ||
      ef.id === 'toma'
    ) {
      continue;
    }

    if (ef.id === 'anima') {
      const spec = EFFECT_CATALOG.anima[ef.intensidad ?? 'media'];
      const delta = (ef.signo ?? 1) * spec.satisfaccion;
      if (ef.alcance === 'zona') {
        const targets = pickNearestZoneNpcs(state, npc, effZone, zonesCount, 0.35);
        for (const t of targets) {
          applyModifierToNpc(
            t,
            {
              afecta: { satisfaccion: delta },
              duracionDias: duracion,
              origen,
              causa: causaId,
              texto: `${npc.nombre}: ${action.nombre}`,
            },
            state
          );
        }
      } else {
        applyModifierToNpc(
          npc,
          {
            afecta: { satisfaccion: delta },
            duracionDias: duracion,
            origen,
            causa: causaId,
            texto,
          },
          state
        );
      }
    } else if (ef.id === 'agita') {
      const spec = EFFECT_CATALOG.agita[ef.intensidad ?? 'media'];
      const targets = pickNearestZoneNpcs(state, npc, effZone, zonesCount, spec.radioPct);
      for (const t of targets) {
        applyModifierToNpc(
          t,
          {
            afecta: { miedo: spec.miedo, rebeldia: spec.rebeldia },
            duracionDias: duracion,
            origen,
            causa: causaId,
            texto: `${npc.nombre}: ${action.nombre}`,
          },
          state
        );
      }
    } else if (ef.id === 'acapara') {
      const spec = EFFECT_CATALOG.acapara[ef.intensidad ?? 'media'];
      // ESTADOS §7.1: acapara raises pantry target during action; does NOT withdraw stock directly
      applyModifierToNpc(
        npc,
        {
          afecta: { miedo: spec.miedo },
          duracionDias: duracion,
          origen,
          causa: causaId,
          texto,
        },
        state
      );
    } else if (ef.id === 'gasta') {
      const spec = EFFECT_CATALOG.gasta[ef.intensidad ?? 'media'];
      applyModifierToNpc(
        npc,
        {
          afecta: { propensionGasto: spec.propensionDelta },
          duracionDias: duracion,
          origen,
          causa: causaId,
          texto,
        },
        state
      );
    } else if (ef.id === 'ahorra') {
      const spec = EFFECT_CATALOG.ahorra[ef.intensidad ?? 'media'];
      applyModifierToNpc(
        npc,
        {
          afecta: { propensionGasto: spec.propensionDelta },
          duracionDias: duracion,
          origen,
          causa: causaId,
          texto,
        },
        state
      );
    } else if (ef.id === 'difunde') {
      const spec = EFFECT_CATALOG.difunde[ef.intensidad ?? 'media'];
      const theme = ef.temaRumor ?? 'miedo';
      const afecta: Partial<Record<ModifiableKey, number>> =
        theme === 'esperanza'
          ? { satisfaccion: spec.magnitud, miedo: -Math.round(spec.magnitud * 0.6) }
          : theme === 'descontento'
          ? { satisfaccion: -spec.magnitud }
          : { miedo: spec.magnitud };
      const targets = pickNearestZoneNpcs(state, npc, effZone, zonesCount, spec.radioPct);
      for (const t of targets) {
        applyModifierToNpc(
          t,
          {
            afecta,
            duracionDias: duracion,
            origen: 'rumor',
            causa: causaId,
            texto: `${npc.nombre} difundió un rumor (${theme})`,
          },
          state
        );
      }
    }
  }
}

export function applyActionToNpc(
  state: GameState,
  npc: Npc,
  action: ActionDefinition,
  texto: string,
  fuente: 'clasificador' | 'motor',
  causaId?: string
): void {
  const [minD, maxD] = action.duracionDias;
  const maxAllowed = action.tipo === 'espontanea' ? state.config.caos.duracionMaxDias : maxD;
  const duracion = clamp(
    Math.round(minD + drawRand(state) * (maxD - minD)),
    1,
    maxAllowed
  );
  const origen = `accion:${action.id}/${fuente}`;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;
  const movesZone = action.efectos.some((e) => e.id === 'moviliza');
  const zonaDestino = zonesCount > 1 && movesZone ? action.zonaDestino : undefined;
  const evId = nextSeqId(state, `ev_${state.reloj.dia}`);

  npc.accionIa = {
    id: action.id,
    nombre: action.nombre,
    tipo: action.tipo,
    efectos: action.efectos,
    fueraDePuesto: hasOutOfPostEffect(action),
    zonaDestino,
    diasRestantes: duracion,
    duracionTotal: duracion,
    esFoco: true,
    focoNpcId: npc.id,
    focoEventId: evId,
    origen,
    causa: causaId,
    texto,
  };

  emitSimEvent(state, {
    id: evId,
    dia: state.reloj.dia,
    tipo: 'accion_inicio',
    zona: getEffectiveZone(npc, zonesCount),
    accion: action.id,
    npcIds: [npc.id],
    zonaDestino: zonaDestino ?? npc.zona,
    origen,
    causa: causaId,
  });

  setNpcActionMovement(npc, action.id, action.nombre, state);
  applyActionEffectsToNpc(state, npc, action, duracion, origen, evId, texto, zonesCount);
}

function pruneOrphanedContagions(state: GameState, zonesCount: number): void {
  const npcById = new Map<string, Npc>();
  for (const n of state.npcs) npcById.set(n.id, n);

  for (const npc of state.npcs) {
    if (!npc.vivo || !npc.accionIa || npc.accionIa.esFoco) continue;
    const focus = npc.accionIa.focoNpcId ? npcById.get(npc.accionIa.focoNpcId) : undefined;
    const focusAliveAndMatching =
      Boolean(focus) &&
      focus!.vivo &&
      !focus!.hospital.internado &&
      Boolean(focus!.accionIa) &&
      focus!.accionIa!.id === npc.accionIa.id &&
      (!npc.accionIa.focoEventId || focus!.accionIa!.focoEventId === npc.accionIa.focoEventId);

    if (!focusAliveAndMatching) {
      const effZone = getEffectiveZone(npc, zonesCount);
      const ended = npc.accionIa;
      npc.accionIa = null;
      resetNpcIdleLocation(npc, state);
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'accion_fin',
        zona: effZone,
        accion: ended.id,
        npcIds: [npc.id],
        zonaDestino: ended.zonaDestino ?? npc.zona,
        origen: ended.origen,
        causa: ended.causa,
      });
    }
  }
}

function runDailyActionContagion(state: GameState, zonesCount: number): void {
  const actionById = new Map<string, ActionDefinition>();
  for (const a of ACTION_TABLE) actionById.set(a.id, a);

  const focusesByZoneAction = new Map<string, { focus: Npc; action: ActionDefinition; zone: ZoneId }>();
  const zonePop: Partial<Record<ZoneId, number>> = {};
  const zoneActionCount = new Map<string, number>();

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    const z = getEffectiveZone(npc, zonesCount);
    zonePop[z] = (zonePop[z] || 0) + 1;

    if (npc.accionIa && npc.accionIa.diasRestantes > 0) {
      const key = `${z}|${npc.accionIa.id}`;
      zoneActionCount.set(key, (zoneActionCount.get(key) || 0) + 1);
      if (npc.accionIa.esFoco && !focusesByZoneAction.has(key)) {
        const def = actionById.get(npc.accionIa.id);
        if (def && def.contagio > 0) {
          focusesByZoneAction.set(key, { focus: npc, action: def, zone: z });
        }
      }
    }
  }

  if (focusesByZoneAction.size === 0) return;

  const { orden, satMediaZona } = computePoliceSplitAndMetrics(state);
  const infectedGroups: Array<{
    action: ActionDefinition;
    zone: ZoneId;
    focusEventId?: string;
    npcIds: string[];
  }> = [];

  for (const { focus, action, zone } of focusesByZoneAction.values()) {
    const popZ = zonePop[zone] || 0;
    if (popZ <= 1) continue;
    const alreadyDoing = zoneActionCount.get(`${zone}|${action.id}`) || 0;
    const exposure = alreadyDoing / popZ;
    if (exposure <= 0) continue;

    let brake = 1;
    if (action.tipo === 'espontanea') {
      brake =
        (1 - ECON_CONSTANTS.kOrdenContagio * ((orden[zone] ?? 0) / 100)) *
        (1 - ECON_CONSTANTS.kSatisfaccionContagio * ((satMediaZona[zone] ?? 50) / 100));
      brake = Math.max(0, brake);
    }
    if (brake <= 0) continue;

    const focusAct = focus.accionIa!;
    const origen = `accion:${action.id}/contagio`;
    const requiresOutOfPostCap = action.tipo === 'espontanea' && hasOutOfPostEffect(action);
    const movesZone = zonesCount > 1 && action.efectos.some((e) => e.id === 'moviliza');
    const zonaDestino = movesZone ? action.zonaDestino : undefined;
    const newlyInfectedIds: string[] = [];

    for (const other of state.npcs) {
      if (!other.vivo || other.hospital.internado || other.accionIa) continue;
      if (getEffectiveZone(other, zonesCount) !== zone) continue;
      if (!isNpcEligibleForAction(other, action, state)) continue;
      if (requiresOutOfPostCap && !canRoleLeavePost(state, other.rol)) continue;

      const affinityFactor = clamp(scoreActionAffinity(other, action) / 100, 0.3, 1.5);
      const prob = clamp(action.contagio * exposure * brake * affinityFactor, 0, 0.95);
      if (drawRand(state) >= prob) continue;

      const zoneName = other.zona || 'centro';
      const copyText = pickActionText(
        action,
        other.nombre,
        state,
        ROLE_CATALOG[other.rol].nombre.toLowerCase(),
        zoneName
      );
      other.accionIa = {
        id: action.id,
        nombre: action.nombre,
        tipo: action.tipo,
        efectos: action.efectos,
        fueraDePuesto: hasOutOfPostEffect(action),
        zonaDestino,
        diasRestantes: focusAct.diasRestantes,
        duracionTotal: focusAct.duracionTotal,
        esFoco: false,
        focoNpcId: focus.id,
        focoEventId: focusAct.focoEventId,
        origen,
        causa: focusAct.focoEventId,
        texto: copyText,
      };
      setNpcActionMovement(other, action.id, action.nombre, state);
      applyActionEffectsToNpc(
        state,
        other,
        action,
        focusAct.diasRestantes,
        origen,
        focusAct.focoEventId,
        copyText,
        zonesCount
      );
      newlyInfectedIds.push(other.id);
    }

    if (newlyInfectedIds.length > 0) {
      infectedGroups.push({
        action,
        zone,
        focusEventId: focusAct.focoEventId,
        npcIds: newlyInfectedIds,
      });
    }
  }

  for (const grp of infectedGroups) {
    emitSimEvent(state, {
      id: nextSeqId(state, `ev_${state.reloj.dia}`),
      dia: state.reloj.dia,
      tipo: 'accion_inicio',
      zona: grp.zone,
      accion: grp.action.id,
      npcIds: grp.npcIds,
      zonaDestino: grp.action.zonaDestino ?? grp.zone,
      origen: `accion:${grp.action.id}/contagio`,
      causa: grp.focusEventId,
    });
  }
}

export function isNpcEligibleForAction(
  npc: Npc,
  action: ActionDefinition,
  state?: GameState
): boolean {
  if (!npc.vivo || npc.hospital.internado) return false;
  const req = action.requisitos;
  const stage = getStage(npc.edad);
  if (req.etapa && stage !== req.etapa) return false;
  if (req.publico && !ROLE_CATALOG[npc.rol].publico) return false;
  if (req.rolNoEn && req.rolNoEn.includes(npc.rol)) return false;
  if (req.conEmpleo && ['desempleado', 'jubilado', 'estudiante'].includes(npc.rol)) return false;
  if (req.conDinero) {
    const minCash = state ? Math.max(4, state.alimento.precio * 1.5) : 6;
    if (npc.economia.dinero < minCash) return false;
  }
  if (req.conDespensa && npc.economia.despensa <= ECON_CONSTANTS.umbralDespensaBaja) {
    return false;
  }
  if (req.conHambre && npc.variables.hambre <= 55) {
    return false;
  }

  if (state && action.contexto) {
    const ctx = action.contexto;
    const preset = SCENARIO_PRESETS[state.config.escenarioId];
    const zonesCount = Object.keys(preset.zonas).length;
    const effZone = getEffectiveZone(npc, zonesCount);
    const active = getActivePhenomena(state);

    if (ctx.fenomeno && !active.some((f) => f.tipo === ctx.fenomeno)) {
      return false;
    }
    if (ctx.fenomenoAnunciadoOActivo) {
      const announced = getAnnouncedPhenomena(state);
      const hasFen =
        active.some((f) => f.tipo === ctx.fenomenoAnunciadoOActivo) ||
        announced.some((f) => f.tipo === ctx.fenomenoAnunciadoOActivo);
      if (!hasFen) return false;
    }
    if (typeof ctx.zonaIntegridadMenorA === 'number') {
      if ((state.gobierno.integridad[effZone] ?? 100) >= ctx.zonaIntegridadMenorA) {
        return false;
      }
    }
    if (ctx.vecinoDespensaBaja) {
      const hasLowPantry = state.npcs.some(
        (other) =>
          other.vivo &&
          other.id !== npc.id &&
          !other.hospital.internado &&
          getEffectiveZone(other, zonesCount) === effZone &&
          other.economia.despensa < ECON_CONSTANTS.umbralDespensaBaja
      );
      if (!hasLowPantry) return false;
    }
    if (ctx.vecinoSaludBaja) {
      const hasSick = state.npcs.some(
        (other) =>
          other.vivo &&
          other.id !== npc.id &&
          !other.hospital.internado &&
          getEffectiveZone(other, zonesCount) === effZone &&
          other.variables.salud < ECON_CONSTANTS.umbralSaludBaja
      );
      if (!hasSick) return false;
    }
  }

  return true;
}

export function scoreActionAffinity(npc: Npc, action: ActionDefinition): number {
  let w = 1;
  for (const [trait, dir] of Object.entries(action.afinidad)) {
    const val = getEffectiveTrait(npc, trait as PersonalityTrait);
    const signedDelta = (dir === '+' ? 1 : -1) * ((val - 50) / 50);
    w *= Math.max(0.05, 1 + DIRECTOR_CONSTANTS.kAfinidad * signedDelta);
  }
  return Math.max(1, w * 100);
}

export function selectCandidateActions(npc: Npc, state?: GameState): ActionDefinition[] {
  const valid = ACTION_TABLE.filter((a) => {
    if (a.tipo !== 'espontanea') return false;
    if (!isNpcEligibleForAction(npc, a, state)) return false;
    if (state && hasOutOfPostEffect(a) && !canRoleLeavePost(state, npc.rol)) return false;
    return true;
  });
  if (valid.length === 0) return [];

  let filtered = valid;
  if (state) {
    const focusCounts = new Map<string, number>();
    let totalFocos = 0;
    for (const n of state.npcs) {
      if (n.vivo && n.accionIa?.tipo === 'espontanea' && n.accionIa.esFoco) {
        totalFocos++;
        focusCounts.set(n.accionIa.id, (focusCounts.get(n.accionIa.id) || 0) + 1);
      }
    }
    if (totalFocos >= 4) {
      const underCap = valid.filter((a) => {
        const c = focusCounts.get(a.id) || 0;
        return (c / totalFocos) * 100 < DIRECTOR_CONSTANTS.maxPctAccion;
      });
      if (underCap.length > 0) filtered = underCap;
    }
  }

  // Weighted sampling without replacement up to candidatasMax (DIRECTOR_PRENSA §2.3)
  const pool = filtered.map((a) => ({ a, w: scoreActionAffinity(npc, a) }));
  const picked: ActionDefinition[] = [];
  const limit = Math.min(DIRECTOR_CONSTANTS.candidatasMax, pool.length);
  for (let i = 0; i < limit && pool.length > 0; i++) {
    const totalW = pool.reduce((acc, item) => acc + item.w, 0);
    if (totalW <= 0) {
      const idx = Math.floor(drawRand(state) * pool.length);
      picked.push(pool.splice(idx, 1)[0].a);
      continue;
    }
    let r = drawRand(state) * totalW;
    let chosenIdx = pool.length - 1;
    for (let k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) {
        chosenIdx = k;
        break;
      }
    }
    picked.push(pool.splice(chosenIdx, 1)[0].a);
  }
  return picked;
}

export function canTriggerSpontaneousChaos(state: GameState): {
  allowed: boolean;
  reason?: string;
} {
  const derived = deriveCommunityStats(state);
  const limits = state.config.caos;
  if (derived.satisfaccionMedia < limits.respiroSiSatisfaccionMediaMenorA) {
    return { allowed: false, reason: 'respiro' };
  }
  if (state.caosTracker.accionesEnVentana >= limits.maxAccionesPorPeriodo) {
    return { allowed: false, reason: 'tope_periodo' };
  }
  return { allowed: true };
}

export function pickChaosCandidateNpc(state: GameState): Npc | null {
  const eligible = state.npcs.filter(
    (n) =>
      n.vivo &&
      !n.hospital.internado &&
      !n.accionIa &&
      getStage(n.edad) === 'adulto' &&
      selectCandidateActions(n, state).length > 0
  );
  if (eligible.length === 0) return null;

  const traits: PersonalityTrait[] = ['valentia', 'laboriosidad', 'codicia', 'rebeldia', 'resiliencia'];
  const weighted = eligible.map((n) => {
    let extremeTraits = 0;
    for (const t of traits) {
      const eff = getEffectiveTrait(n, t);
      if (eff < 20 || eff > 80) extremeTraits++;
    }
    const isDiscontent = n.variables.satisfaccion < 30 ? 1 : 0;
    const hasRecentMod = n.modificadores.some(
      (m) =>
        m.duracionDias > 0 &&
        m.duracionDias - m.diasRestantes <= DIRECTOR_CONSTANTS.recienteVentanaDias
    )
      ? 1
      : 0;
    const interest =
      1 +
      DIRECTOR_CONSTANTS.kExtremo * extremeTraits +
      DIRECTOR_CONSTANTS.kDescontento * isDiscontent +
      DIRECTOR_CONSTANTS.kReciente * hasRecentMod;
    return { n, interest };
  });

  const totalInterest = weighted.reduce((acc, item) => acc + item.interest, 0);
  if (totalInterest <= 0) {
    return weighted[Math.floor(drawRand(state) * weighted.length)].n;
  }
  let r = drawRand(state) * totalInterest;
  for (const item of weighted) {
    r -= item.interest;
    if (r <= 0) return item.n;
  }
  return weighted[weighted.length - 1].n;
}

export function resolveConditionWindowWithFallback(
  state: GameState,
  windowId: string,
  chosenActionId?: string,
  fuente: 'clasificador' | 'motor' = 'motor'
): void {
  const win = state.ventanasCondicion.find((w) => w.id === windowId);
  if (!win || win.estado === 'resuelta') return;

  const action =
    win.candidatas.find((c) => c.id === chosenActionId) ||
    win.candidatas[0] ||
    ACTION_TABLE.find((a) => a.tipo === 'condicion')!;

  const targets = state.npcs.filter((n) => n.vivo && !n.hospital.internado && win.npcIds.includes(n.id));
  const fallbackCause = win.causaId || state.ultimoEventoClimaId || state.ultimaCausaPalanca;
  for (const npc of targets) {
    const text = pickActionText(
      action,
      npc.nombre,
      state,
      ROLE_CATALOG[npc.rol].nombre.toLowerCase(),
      npc.zona
    );
    applyActionToNpc(state, npc, action, text, fuente, fallbackCause);
  }

  win.estado = 'resuelta';
  addLog(
    state,
    'condicion',
    `accion:${action.id}/${fuente}`,
    `${action.nombre} (${targets.length} habitantes)`,
    action.descripcion || `Desencadenado por ${win.disparador}.`,
    fallbackCause
  );
}

export function applyPressArticleEffects(state: GameState, article: NewsArticle): void {
  const medio = state.medios.find((m) => m.id === article.medioId);
  if (!medio) return;

  const inferredCause =
    article.causa ||
    (article.origen.startsWith('clima:') ? state.ultimoEventoClimaId : state.ultimaCausaPalanca);

  const zonaNorm = article.zonaOrigen ?? article.zona ?? 'centro';
  const enrichedArticle: NewsArticle = {
    ...article,
    zona: enrichedZoneOrDefault(article.zona, zonaNorm),
    zonaOrigen: zonaNorm,
    credibilidad: article.credibilidad ?? medio.credibilidad,
    causa: inferredCause,
  };

  const newsEvId = nextSeqId(state, `ev_n_${state.reloj.dia}`);
  emitSimEvent(state, {
    id: newsEvId,
    dia: state.reloj.dia,
    tipo: 'noticia',
    zona: zonaNorm,
    noticiaId: enrichedArticle.id,
    medio: medio.nombre,
    tema: enrichedArticle.tema,
    titulo: enrichedArticle.titulo,
    causa: inferredCause,
  });

  const isRepeated = state.noticias.some(
    (n) =>
      n.tema === enrichedArticle.tema &&
      (n.zonaOrigen ?? n.zona ?? 'centro') === zonaNorm &&
      state.reloj.dia - n.dia <= PRESS_CONSTANTS.ventanaRepeticionDias
  );
  const repFactor = isRepeated ? PRESS_CONSTANTS.factorRepeticionEfecto : 1;
  const impactScale = (medio.alcancePct / 100) * (medio.credibilidad / 100) * repFactor;

  const vivos = state.npcs.filter((n) => n.vivo);
  const consumersCount = Math.max(1, Math.round(vivos.length * (medio.alcancePct / 100)));

  const sortedConsumers = [...vivos]
    .map((n) => {
      const affinityDiff = Math.abs(n.variables.lealtad - medio.lineaEditorial.afinidadGobierno);
      const sensMatch = medio.lineaEditorial.sensacionalismo * 0.2;
      return { n, score: 100 - affinityDiff + sensMatch + drawRand(state) * 25 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, consumersCount)
    .map((x) => x.n);

  const baseToneEffect = PRESS_CONSTANTS.baseEfectoTono[enrichedArticle.tono] ?? 0;
  const rawDelta = Math.round(baseToneEffect * impactScale);

  if (rawDelta !== 0) {
    for (const npc of sortedConsumers) {
      let usedToday = 0;
      for (const m of npc.modificadores) {
        if (m.origen.startsWith('noticia:') && m.duracionDias > 0 && m.diasRestantes === m.duracionDias) {
          usedToday += Math.abs(m.afecta.miedo ?? 0) + Math.abs(m.afecta.lealtad ?? 0);
        }
      }
      const remainingBudget = Math.max(0, PRESS_CONSTANTS.maxEfectoNoticiasDia - usedToday);
      if (remainingBudget <= 0) continue;

      const cappedMag = Math.min(Math.abs(rawDelta), remainingBudget);
      const afecta: Partial<Record<NpcVariable, number>> =
        enrichedArticle.tono === 'alarmista'
          ? { miedo: cappedMag }
          : enrichedArticle.tono === 'critico'
          ? { lealtad: -cappedMag }
          : enrichedArticle.tono === 'favorable'
          ? { lealtad: cappedMag }
          : {};

      if (Object.keys(afecta).length > 0) {
        applyModifierToNpc(
          npc,
          {
            afecta,
            duracionDias: PRESS_CONSTANTS.duracionEfectoNoticia,
            origen: `noticia:${enrichedArticle.id}`,
            causa: newsEvId,
            texto: `Leyó "${enrichedArticle.titulo}" en ${medio.nombre}`,
          },
          state
        );
      }
    }
  }

  state.noticias.unshift(enrichedArticle);
  if (state.noticias.length > 50) state.noticias.length = 50;
}

function enrichedZoneOrDefault(z: ZoneId | undefined, fallback: ZoneId): ZoneId {
  return z ?? fallback;
}

function stepNpcPositions(state: GameState, dtTicks: number): void {
  const baseSpeed = ((5.6 * 10) / TICKS_PER_DAY) * dtTicks;
  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    const isUrgent = Boolean(
      npc.accionIa && ['protesta', 'huelga', 'saqueo'].includes(npc.accionIa.id)
    );
    const speed = isUrgent ? baseSpeed * 1.35 : npc.rol === 'policia' ? baseSpeed * 1.25 : baseSpeed;
    const dx = npc.mapa.destino.x - npc.mapa.x;
    const dy = npc.mapa.destino.y - npc.mapa.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= speed + 1.5) {
      npc.mapa.x = npc.mapa.destino.x;
      npc.mapa.y = npc.mapa.destino.y;
      if (drawRand(state) < 0.42) {
        if (npc.accionIa && ['protesta', 'huelga', 'predicar', 'saqueo', 'organizar_asamblea'].includes(npc.accionIa.id)) {
          const zoneId = npc.accionIa.id === 'huelga' ? 'civico' : 'mercado';
          const zone = DISTRICTS.find((d) => d.id === zoneId)!;
          npc.mapa.destino = {
            x: zone.x + 40 + drawRand(state) * (zone.w - 80),
            y: zone.y + 60 + drawRand(state) * (zone.h - 90),
          };
        } else if (npc.accionIa?.id === 'organizar_fiesta') {
          const zone = DISTRICTS.find((d) => d.id === 'mercado')!;
          npc.mapa.destino = {
            x: zone.x + 40 + drawRand(state) * (zone.w - 80),
            y: zone.y + 50 + drawRand(state) * (zone.h - 80),
          };
        } else if (npc.variables.hambre > 75 && drawRand(state) < 0.65) {
          const market = DISTRICTS.find((d) => d.id === 'mercado')!;
          npc.mapa.destino = {
            x: market.x + 42 + drawRand(state) * (market.w - 84),
            y: market.y + 66 + drawRand(state) * (market.h - 94),
          };
          if (!npc.accionIa) npc.mapa.accion = 'buscando alimento';
        } else {
          const nextSpot = getCityErrandPosition(npc.rol, npc.zona, state);
          npc.mapa.destino = { x: nextSpot.x, y: nextSpot.y };
          if (!npc.accionIa) {
            npc.mapa.accion = nextSpot.accion;
          }
        }
      }
    } else {
      let moveX = dx / dist;
      let moveY = dy / dist;
      if (dist > 140) {
        const nearAvenueX = Math.abs(npc.mapa.x - 355) < 16 || Math.abs(npc.mapa.x - 665) < 16;
        const nearAvenueY = Math.abs(npc.mapa.y - 295) < 16;
        if (!nearAvenueX && !nearAvenueY) {
          if (Math.abs(dx) > Math.abs(dy)) {
            moveY *= 1.18;
          } else {
            moveX *= 1.18;
          }
          const norm = Math.hypot(moveX, moveY) || 1;
          moveX /= norm;
          moveY /= norm;
        }
      }
      npc.mapa.x += moveX * speed;
      npc.mapa.y += moveY * speed;
    }
  }
}

function updateServiceCoverage(state: GameState): void {
  const vivos = Math.max(1, state.npcs.filter((n) => n.vivo).length);
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const getTargetCov = (role: ServicePublicRoleId): number =>
    preset.objetivoCobertura?.[role] ?? ECON_CONSTANTS.objetivoCobertura[role];

  const counts: Record<ServicePublicRoleId, number> = {
    policia: 0,
    medico: 0,
    ingeniero: 0,
  };
  for (const n of state.npcs) {
    if (!n.vivo || n.hospital.internado) continue;
    if (n.rol in counts && !n.accionIa?.fueraDePuesto) {
      counts[n.rol as ServicePublicRoleId]++;
    }
  }
  state.gobierno.coberturas = {
    policia: clamp(counts.policia / Math.max(1, vivos * getTargetCov('policia')), 0, 1),
    medico: clamp(counts.medico / Math.max(1, vivos * getTargetCov('medico')), 0, 1),
    ingeniero: clamp(counts.ingeniero / Math.max(1, vivos * getTargetCov('ingeniero')), 0, 1),
  };
}

function syncEnterprisesWithOwners(state: GameState): void {
  const empresarioNpc = state.npcs.find((n) => n.vivo && n.rol === 'empresario') || null;
  state.empresas.alimento.dueno = empresarioNpc ? empresarioNpc.id : null;
  state.empresas.comercio.socios = state.npcs
    .filter((n) => n.vivo && n.rol === 'comerciante')
    .map((c) => c.id);

  if (state.medios.length > 0) {
    const assigned = new Set<string>();
    for (const m of state.medios) {
      m.columnistas = m.columnistas.filter((id) =>
        state.npcs.some((n) => n.id === id && n.vivo && n.rol === 'periodista')
      );
      for (const id of m.columnistas) assigned.add(id);
    }
    for (const npc of state.npcs) {
      if (npc.vivo && npc.rol === 'periodista' && !assigned.has(npc.id)) {
        const sortedMedia = [...state.medios].sort(
          (a, b) => a.columnistas.length - b.columnistas.length
        );
        sortedMedia[0].columnistas.push(npc.id);
        assigned.add(npc.id);
      }
    }
  }
}

function getPublicRoleTargetCap(state: GameState, role: PublicRoleId, vivosCount: number): number {
  if (role === 'estatal') {
    return state.gobierno.cuposFijos.estatal;
  }
  if (role === 'docente') {
    return state.gobierno.cuposFijos.docente;
  }
  const pal = state.gobierno.palancasVigentes;
  const lever: ServiceLeverId =
    role === 'policia' ? 'seguridad' : role === 'medico' ? 'salud' : 'obras';
  const level = pal.servicios[lever];
  if (level <= 0) return 0;
  return Math.round((vivosCount * SERVICE_LEVEL_TABLE[lever][level].puestosPct) / 100);
}

function pickNextLayoffTarget(pool: Npc[], isFoodEnterprise: boolean, state: GameState): Npc {
  if (isFoodEnterprise) {
    const tecPool = pool.filter((n) => n.rol === 'tecnico');
    if (tecPool.length > 0) {
      const chosen = tecPool[Math.floor(drawRand(state) * tecPool.length)];
      const idx = pool.indexOf(chosen);
      if (idx !== -1) pool.splice(idx, 1);
      return chosen;
    }
  }
  const idx = Math.floor(drawRand(state) * pool.length);
  return pool.splice(idx, 1)[0];
}

function handleRolesAndAging(state: GameState): void {
  const dayOfYear = ((state.reloj.dia - 1) % 365) + 1;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const vivosCount = state.npcs.filter((n) => n.vivo).length;
  const popScale = Math.max(0.6, vivosCount / 100);

  const counts: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    empresario: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    desempleado: 0,
    jubilado: 0,
  };
  for (const n of state.npcs) {
    if (n.vivo) counts[n.rol]++;
  }

  // Gradual layoff if service level lowered below current public headcount (ESTADOS §2)
  for (const pRole of PUBLIC_ROLES) {
    const cap = getPublicRoleTargetCap(state, pRole, vivosCount);
    if (counts[pRole] > cap) {
      const toLayOff = Math.min(counts[pRole] - cap, ECON_CONSTANTS.maxPaseDesempleoPorDia);
      const pool = state.npcs.filter((n) => n.vivo && n.rol === pRole);
      let laidOff = 0;
      for (let i = 0; i < toLayOff && pool.length > 0; i++) {
        const idx = Math.floor(drawRand(state) * pool.length);
        const chosen = pool.splice(idx, 1)[0];
        chosen.rol = 'desempleado';
        chosen.mapa.accion = 'buscando trabajo';
        chosen.mapa.destino = getDistrictPosition('desempleado', state);
        applyInstantModifierToNpc(
          chosen,
          {
            afecta: { satisfaccion: -5 },
            origen: 'estado:servicio_publico',
            causa: state.ultimaCausaPalanca,
            texto: 'Pasó a desempleado por reducción de servicio público',
            recordOnNpc: true,
          },
          state
        );
        counts[pRole]--;
        counts.desempleado++;
        laidOff++;
      }
      if (laidOff > 0) {
        addLog(
          state,
          'economia',
          'estado:servicio_publico',
          `Ajuste de personal en ${ROLE_CATALOG[pRole].nombre} (${laidOff})`,
          `${laidOff} trabajador(es) público(s) pasan a desempleados tras bajar el nivel del servicio.`,
          state.ultimaCausaPalanca
        );
      }
    }
  }

  // Enterprise gradual layoffs from despidosPendientes (ECONOMIA §5: tecnicos before agricultores)
  if (state.empresas.alimento.despidosPendientes > 0) {
    const ent = state.empresas.alimento;
    const pool = state.npcs.filter(
      (n) => n.vivo && (n.rol === 'agricultor' || n.rol === 'tecnico')
    );
    let cutsLeft = Math.min(ent.despidosPendientes, ECON_CONSTANTS.maxPaseDesempleoPorDia);
    while (cutsLeft > 0 && pool.length > 0) {
      const target = pickNextLayoffTarget(pool, true, state);
      counts[target.rol]--;
      counts.desempleado++;
      target.rol = 'desempleado';
      target.mapa.accion = 'buscando trabajo';
      target.mapa.destino = getDistrictPosition('desempleado', state);
      applyInstantModifierToNpc(
        target,
        {
          afecta: { satisfaccion: -8 },
          origen: 'empresa:alimento/respuesta',
          causa: ent.ultimaCausa,
          texto: 'Despedido por recorte bajo piso salarial en alimento',
          recordOnNpc: true,
        },
        state
      );
      ent.despidosPendientes = Math.max(0, ent.despidosPendientes - 1);
      cutsLeft--;
    }
  }

  if (state.empresas.comercio.despidosPendientes > 0) {
    const ent = state.empresas.comercio;
    const pool = state.npcs.filter((n) => n.vivo && n.rol === 'obrero');
    let cutsLeft = Math.min(ent.despidosPendientes, ECON_CONSTANTS.maxPaseDesempleoPorDia);
    while (cutsLeft > 0 && pool.length > 0) {
      const target = pickNextLayoffTarget(pool, false, state);
      counts.obrero--;
      counts.desempleado++;
      target.rol = 'desempleado';
      target.mapa.accion = 'buscando trabajo';
      target.mapa.destino = getDistrictPosition('desempleado', state);
      applyInstantModifierToNpc(
        target,
        {
          afecta: { satisfaccion: -8 },
          origen: 'empresa:comercio/respuesta',
          causa: ent.ultimaCausa,
          texto: 'Despedido por recorte bajo piso salarial en comercio',
          recordOnNpc: true,
        },
        state
      );
      ent.despidosPendientes = Math.max(0, ent.despidosPendientes - 1);
      cutsLeft--;
    }
  }

  const foodLayoff = state.empresas.alimento.ultimoTramo === 'despido';
  const comLayoff = state.empresas.comercio.ultimoTramo === 'despido';

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;

    if (npc.cumpleanosDia === dayOfYear) {
      npc.edad += 1;
    }

    if (npc.edad >= 65 && npc.rol !== 'jubilado') {
      counts[npc.rol]--;
      npc.rol = 'jubilado';
      counts.jubilado++;
      npc.mapa.accion = 'jubilado';
    } else if (npc.rol === 'estudiante' && npc.edad >= 18) {
      counts.estudiante--;
      npc.rol = 'desempleado';
      counts.desempleado++;
      npc.mapa.accion = 'buscando trabajo';
    } else if (npc.rol !== 'desempleado' && npc.rol !== 'jubilado' && npc.rol !== 'estudiante') {
      const def = ROLE_CATALOG[npc.rol];
      if (def.edadMax !== null && npc.edad > def.edadMax && npc.edad < 65) {
        counts[npc.rol]--;
        npc.rol = 'desempleado';
        counts.desempleado++;
      }
    }

    // Unemployed can fill public jobs, owner seats or media seats daily; enterprise employees hire on payday (ECONOMIA §5)
    if (npc.rol === 'desempleado') {
      const candidateRoles: Array<{ rol: RoleId; score: number }> = [];

      if (state.reloj.dia % 3 === 0) {
        for (const pRole of PUBLIC_ROLES) {
          const cap = getPublicRoleTargetCap(state, pRole, vivosCount);
          const def = ROLE_CATALOG[pRole];
          if (counts[pRole] < cap && npc.educacion.nivel >= def.educMin) {
            const traitVal = def.afinidad ? getEffectiveTrait(npc, def.afinidad) : 50;
            candidateRoles.push({
              rol: pRole,
              score: traitVal + state.gobierno.palancasVigentes.salarioPublico * 0.25,
            });
          }
        }
      }

      const nonPayrollPrivate: PrivateRoleId[] = ['comerciante', 'empresario', 'periodista'];
      for (const privRole of nonPayrollPrivate) {
        if (privRole === 'empresario' && foodLayoff) continue;
        if (privRole === 'comerciante' && comLayoff) continue;
        const cap =
          privRole === 'empresario'
            ? Math.max(1, preset.topesPrivados.empresario)
            : Math.round(preset.topesPrivados[privRole] * popScale);
        const def = ROLE_CATALOG[privRole];
        if (counts[privRole] < cap && npc.educacion.nivel >= def.educMin) {
          const traitVal = def.afinidad ? getEffectiveTrait(npc, def.afinidad) : 50;
          candidateRoles.push({ rol: privRole, score: traitVal });
        }
      }

      if (candidateRoles.length > 0) {
        candidateRoles.sort((a, b) => b.score - a.score);
        const chosen = candidateRoles[0].rol;
        counts.desempleado--;
        counts[chosen]++;
        npc.rol = chosen;
        const allowedZones = preset.zonaPorRol[chosen] || ['centro'];
        if (!allowedZones.includes(npc.zona)) {
          npc.zona = allowedZones[counts[chosen] % allowedZones.length];
        }
        npc.mapa.destino = getDistrictPosition(chosen, state);
        npc.mapa.accion = 'trabajando';
      }
    }
  }

  // Adults fill vacant public roles and vacant critical empresario seat by affinity
  if (state.reloj.dia % 3 === 0) {
    let transfersLeft = 2;
    const targetRoles: RoleId[] = [
      ...PUBLIC_ROLES,
      ...(!foodLayoff && counts.empresario < Math.max(1, preset.topesPrivados.empresario)
        ? (['empresario'] as RoleId[])
        : []),
    ];
    const vacantTarget = targetRoles.filter((r) => {
      const cap =
        r === 'empresario'
          ? Math.max(1, preset.topesPrivados.empresario)
          : getPublicRoleTargetCap(state, r as PublicRoleId, vivosCount);
      return counts[r] < cap;
    });

    for (const targetRole of vacantTarget) {
      const cap =
        targetRole === 'empresario'
          ? Math.max(1, preset.topesPrivados.empresario)
          : getPublicRoleTargetCap(state, targetRole as PublicRoleId, vivosCount);
      while (transfersLeft > 0 && counts[targetRole] < cap) {
        const def = ROLE_CATALOG[targetRole];
        const minKeep = (r: RoleId) => (r === 'agricultor' ? 25 : r === 'empresario' ? 1 : 2);
        const eligible = state.npcs.filter((n) => {
          if (!n.vivo || n.hospital.internado || n.accionIa) return false;
          if (
            ROLE_CATALOG[n.rol].publico ||
            n.rol === 'estudiante' ||
            n.rol === 'jubilado' ||
            n.rol === 'desempleado' ||
            n.rol === 'empresario'
          ) {
            return false;
          }
          if (counts[n.rol] <= minKeep(n.rol)) return false;
          return (
            n.educacion.nivel >= def.educMin &&
            n.edad >= def.edadMin &&
            (def.edadMax === null || n.edad <= def.edadMax)
          );
        });
        if (eligible.length === 0) break;
        eligible.sort((a, b) => {
          const traitA = def.afinidad ? getEffectiveTrait(a, def.afinidad) : 50;
          const traitB = def.afinidad ? getEffectiveTrait(b, def.afinidad) : 50;
          return traitB - traitA;
        });
        const chosenNpc = eligible[0];
        counts[chosenNpc.rol]--;
        counts[targetRole]++;
        chosenNpc.rol = targetRole;
        const allowedZones = preset.zonaPorRol[targetRole] || ['centro'];
        chosenNpc.zona = allowedZones[counts[targetRole] % allowedZones.length];
        chosenNpc.mapa.destino = getDistrictPosition(targetRole, state);
        chosenNpc.mapa.accion = 'trabajando';
        transfersLeft--;
      }
      if (transfersLeft <= 0) break;
    }
  }

  syncEnterprisesWithOwners(state);
}

function killNpc(
  state: GameState,
  npc: Npc,
  causa: string,
  zonesCount: number,
  causaId?: string
): void {
  if (!npc.vivo) return;
  // Preserves npc.economia.dinero for strict world money conservation (ECONOMIA §1)
  const effZone = getEffectiveZone(npc, zonesCount);
  const wasWaitingBed = npc.hospital.esperandoCama;
  npc.vivo = false;
  npc.hospital.internado = false;
  npc.hospital.esperandoCama = false;
  npc.accionIa = null;
  npc.mapa.accion = 'fallecido';

  for (const medio of state.medios) {
    const idx = medio.columnistas.indexOf(npc.id);
    if (idx !== -1) medio.columnistas.splice(idx, 1);
  }

  emitSimEvent(state, {
    id: nextSeqId(state, `ev_${state.reloj.dia}`),
    dia: state.reloj.dia,
    tipo: 'muerte',
    zona: effZone,
    npcId: npc.id,
    causa: causaId || causa,
    ...(wasWaitingBed ? { esperandoCama: true } : {}),
  });
}

function runPoliceRelocation(state: GameState): void {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  if (zones.length <= 1) return;

  const { necesidadTotalZona } = computePoliceSplitAndMetrics(state);
  const totalNecesidad = zones.reduce((acc, z) => acc + (necesidadTotalZona[z] || 0), 0);

  if (totalNecesidad > 0) {
    const policias = state.npcs.filter(
      (n) => n.vivo && n.rol === 'policia' && !n.hospital.internado && !n.accionIa?.fueraDePuesto
    );
    if (policias.length > 0) {
      const exactMove = policias.length * (ECON_CONSTANTS.reubicacionPoliciasPct / 100);
      const countToMove =
        Math.floor(exactMove) + (drawRand(state) < exactMove - Math.floor(exactMove) ? 1 : 0);

      const movedByRoute = new Map<string, string[]>();
      const pool = [...policias];

      for (let i = 0; i < countToMove && pool.length > 0; i++) {
        let r = drawRand(state) * totalNecesidad;
        let targetZone: ZoneId = zones[0];
        for (const z of zones) {
          r -= necesidadTotalZona[z] || 0;
          if (r <= 0) {
            targetZone = z;
            break;
          }
        }

        const candidateIdxs: number[] = [];
        for (let k = 0; k < pool.length; k++) {
          if (pool[k].zona !== targetZone) candidateIdxs.push(k);
        }
        if (candidateIdxs.length === 0) continue;

        const pickIdx = candidateIdxs[Math.floor(drawRand(state) * candidateIdxs.length)];
        const chosen = pool.splice(pickIdx, 1)[0];
        const deZona = chosen.zona;
        chosen.zona = targetZone;
        chosen.mapa.destino = getZoneCanvasPosition(targetZone, state);

        const key = `${deZona}->${targetZone}`;
        const list = movedByRoute.get(key) || [];
        list.push(chosen.id);
        movedByRoute.set(key, list);
      }

      for (const [routeKey, npcIds] of movedByRoute.entries()) {
        const [deZona, aZona] = routeKey.split('->') as [ZoneId, ZoneId];
        emitSimEvent(state, {
          id: nextSeqId(state, `ev_${state.reloj.dia}`),
          dia: state.reloj.dia,
          tipo: 'reubicacion',
          zona: aZona,
          npcs: npcIds,
          deZona,
          aZona,
          causa: state.ultimoEventoClimaId || 'necesidad:reubicacion',
        });
      }
    }
  }

  const { defensa: def, orden: ord } = computePoliceSplitAndMetrics(state);
  if (!state.ultimaOrdenZona) {
    state.ultimaOrdenZona = { centro: 100, norte: 100, este: 100, sur: 100, oeste: 100 };
  }
  for (const z of zones) {
    if (Math.round(def[z]) !== Math.round(state.ultimaDefensaZona[z])) {
      state.ultimaDefensaZona[z] = def[z];
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'defensa',
        zona: z,
        valor: def[z],
        causa: state.ultimaCausaPalanca || 'seguridad:zona',
      });
    }
    if (Math.round(ord[z]) !== Math.round(state.ultimaOrdenZona[z] ?? 0)) {
      state.ultimaOrdenZona[z] = ord[z];
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'orden',
        zona: z,
        valor: ord[z],
        causa: state.ultimaCausaPalanca || 'orden:zona',
      });
    }
  }
}


function runDailyEconomyAndNeeds(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  const mod = state.config.economiaModulo;
  const pal = state.gobierno.palancasVigentes;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;
  const activePhenomena = getActivePhenomena(state);

  let agroClimaFactor = 1;
  let climaPrecioFactor = 1;

  for (const fen of activePhenomena) {
    const k = fen.intensidad / 100;
    if (fen.tipo === 'sequia') {
      agroClimaFactor *= 1 - ECON_CONSTANTS.coefSequiaProduccion * k;
      climaPrecioFactor *= 1 + ECON_CONSTANTS.coefSequiaPrecio * k;
    } else if (fen.tipo === 'plaga') {
      agroClimaFactor *= 1 - ECON_CONSTANTS.coefPlagaProduccion * k;
      climaPrecioFactor *= 1 + ECON_CONSTANTS.coefPlagaPrecio * k;
    }
  }

  // 1. Food Production + Tech Boost (tecnicos)
  let baseAgroProd = 0;
  let activeAgricultores = 0;
  const tecnicoProds: number[] = [];

  for (const npc of vivos) {
    if (npc.rol === 'agricultor') {
      const prod = getNpcProductivity(npc, state);
      if (prod > 0) {
        activeAgricultores++;
        baseAgroProd += ECON_CONSTANTS.produccionBaseAgricultor * prod * agroClimaFactor;
      }
    } else if (npc.rol === 'tecnico') {
      const prod = getNpcProductivity(npc, state);
      if (prod > 0) tecnicoProds.push(prod);
    }
  }

  const maxEffectiveTecs = activeAgricultores * ECON_CONSTANTS.tecnicosPorAgricultor;
  const totalTecProd = tecnicoProds.reduce((acc, p) => acc + p, 0);
  const effectiveTecs = Math.min(totalTecProd, maxEffectiveTecs);
  const techFactor =
    activeAgricultores > 0
      ? 1 + (effectiveTecs / activeAgricultores) * ECON_CONSTANTS.kTecnificacion
      : 1;

  const produccionAlimento = baseAgroProd * techFactor;
  state.alimento.stock += produccionAlimento;
  state.alimento.produccionDiaria = Number(produccionAlimento.toFixed(1));

  const siloDays = state.alimento.siloDias || ECON_CONSTANTS.siloDias;
  const maxSiloStock = pop * ECON_CONSTANTS.consumoPorNpc * siloDays;
  state.alimento.stock = Math.min(state.alimento.stock, maxSiloStock);

  // Market & capped prices (ESTADOS §4)
  const preTradeDiasStock = state.alimento.stock / Math.max(1, pop * ECON_CONSTANTS.consumoPorNpc);
  const preEscasez =
    preTradeDiasStock >= 12
      ? 1.0
      : preTradeDiasStock >= 5
      ? 1 + (12 - preTradeDiasStock) * 0.12
      : 1.84 + (5 - preTradeDiasStock) * 0.35;
  const inflFactor = 1 + state.gobierno.inflacion / 100;
  const precioMercado = Number(
    (ECON_CONSTANTS.precioBaseAlimento * preEscasez * climaPrecioFactor * inflFactor).toFixed(2)
  );
  const capMult = PRICE_CAP_FACTORS[pal.precioMaximo];
  const precioTope =
    capMult === null
      ? Infinity
      : Number((ECON_CONSTANTS.precioBaseAlimento * capMult).toFixed(2));
  const precioAlimento = Number(Math.min(precioMercado, precioTope).toFixed(2));

  // 2. Foreign Trade (ECONOMIA §9, ESTADOS §12)
  let importacionesDia = 0;
  let exportacionesDia = 0;
  const tradeLever = pal.comercioExterior;
  const activeComerciantes = vivos.filter(
    (n) => n.rol === 'comerciante' && !n.hospital.internado && !n.accionIa?.fueraDePuesto
  ).length;
  const maxTradeUnits = activeComerciantes * ECON_CONSTANTS.intercambioPorComerciante;
  const externalPriceBase =
    ECON_CONSTANTS.precioBaseAlimento * (1 + state.gobierno.inflacion / 100) * climaPrecioFactor;

  if (tradeLever > 0 && maxTradeUnits > 0) {
    const rawUnits = maxTradeUnits * (tradeLever / 100);
    const purchaseUnitPrice = externalPriceBase * ECON_CONSTANTS.diferencialImportacion;
    const affordableUnits =
      purchaseUnitPrice > 0
        ? Math.min(rawUnits, Math.max(0, state.gobierno.reserva) / purchaseUnitPrice)
        : 0;
    const units = Number(affordableUnits.toFixed(2));
    if (units > 0) {
      const paidImp = Math.min(Math.max(0, state.gobierno.reserva), units * purchaseUnitPrice);
      state.alimento.stock = Math.min(maxSiloStock, state.alimento.stock + units);
      state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidImp);
      state.auditSalidasDia += paidImp;
      importacionesDia = paidImp;
    }
  } else if (tradeLever < 0 && maxTradeUnits > 0) {
    const minStockReserve = pop * ECON_CONSTANTS.consumoPorNpc * ECON_CONSTANTS.stockMinExportarDias;
    if (state.alimento.stock > minStockReserve) {
      const rawUnits = Math.min(
        maxTradeUnits * (Math.abs(tradeLever) / 100),
        state.alimento.stock - minStockReserve
      );
      const units = Number(Math.max(0, rawUnits).toFixed(2));
      if (units > 0) {
        state.alimento.stock = Number(Math.max(0, state.alimento.stock - units).toFixed(2));
        const exportRevenue = units * externalPriceBase;
        state.empresas.alimento.ventasAcum += exportRevenue;
        state.auditEntradasDia += exportRevenue;
        exportacionesDia = exportRevenue;
      }
    }
  }

  state.alimento.precioMercado = precioMercado;
  state.alimento.precio = precioAlimento;

  // 3. Action effect 'toma' (saqueo) takes food without paying
  for (const npc of vivos) {
    if (!npc.accionIa) continue;
    const tomaEf = npc.accionIa.efectos.find((e) => e.id === 'toma');
    if (tomaEf && state.alimento.stock > 0) {
      const spec = EFFECT_CATALOG.toma[tomaEf.intensidad ?? 'media'];
      const space = Math.max(0, ECON_CONSTANTS.despensaMaxDias - npc.economia.despensa);
      const taken = Math.min(spec.topeDiario, space, state.alimento.stock);
      if (taken > 0) {
        state.alimento.stock = Math.max(0, state.alimento.stock - taken);
        npc.economia.despensa = Number((npc.economia.despensa + taken).toFixed(2));
      }
    }
  }

  // 4. Pantry rebuy & Payment (ECONOMIA §3, §6; ESTADOS §4, §12)
  const desiredMap = new Map<string, number>();
  let totalDemanded = 0;
  const cheapFoodBoost = precioAlimento < precioMercado * 0.9;

  for (const npc of vivos) {
    npc.economia.noPudoPagarComida = false;
    const valNorm = getEffectiveTrait(npc, 'valentia') / 100;
    const miedoNorm = npc.variables.miedo / 100;
    let acaparaExtra = 0;
    if (npc.accionIa) {
      for (const ef of npc.accionIa.efectos) {
        if (ef.id === 'acapara') {
          acaparaExtra += EFFECT_CATALOG.acapara[ef.intensidad ?? 'media'].extraDias;
        }
      }
    }
    const cheapBonusDias = cheapFoodBoost ? 2.5 : 0;
    const objetivo = clamp(
      ECON_CONSTANTS.objetivoBaseDias *
        (1 + ECON_CONSTANTS.kPrudenciaDespensa * (1 - valNorm) + ECON_CONSTANTS.kMiedoDespensa * miedoNorm) +
        acaparaExtra +
        cheapBonusDias,
      1,
      ECON_CONSTANTS.despensaMaxDias
    );

    const shouldRebuy =
      npc.economia.despensa < ECON_CONSTANTS.umbralRecompraDias ||
      (acaparaExtra > 0 && npc.economia.despensa < objetivo - 0.25) ||
      (cheapFoodBoost && npc.economia.despensa < objetivo - 0.5);

    if (shouldRebuy && npc.economia.despensa < objetivo) {
      const desired = objetivo - npc.economia.despensa;
      desiredMap.set(npc.id, desired);
      totalDemanded += desired;
    } else {
      desiredMap.set(npc.id, 0);
    }
  }

  const stockShareRatio =
    totalDemanded > 0 ? Math.min(1, Math.max(0, state.alimento.stock) / totalDemanded) : 1;

  let comidaMenoresDia = 0;
  let garantiaAlimentariaDia = 0;
  let garantiaImpagaDia = 0;
  let paidFoodMoney = 0;
  const garantiaPct = pal.garantiaAlimentaria / 100;

  for (const npc of vivos) {
    const desired = desiredMap.get(npc.id) || 0;
    if (desired <= 0) continue;
    const allocated = desired * stockShareRatio;
    const cost = allocated * precioAlimento;
    const stage = getStage(npc.edad);
    let paidUnits = 0;

    if (stage === 'menor') {
      // Minors food is paid daily from reserva first; cannot spend negative reserva
      const paidMinor = Math.min(Math.max(0, state.gobierno.reserva), cost);
      state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidMinor);
      const unpaidMinor = Math.max(0, cost - paidMinor);
      comidaMenoresDia += paidMinor;
      garantiaImpagaDia += unpaidMinor;
      paidUnits = cost > 0 ? allocated * clamp(paidMinor / cost, 0, 1) : allocated;
      paidFoodMoney += paidMinor;
    } else if (npc.economia.dinero >= cost) {
      npc.economia.dinero -= cost;
      paidUnits = allocated;
      paidFoodMoney += cost;
    } else {
      npc.economia.noPudoPagarComida = true;
      const fromNpc = Math.max(0, npc.economia.dinero);
      npc.economia.dinero = 0;
      const faltante = Math.max(0, cost - fromNpc);
      const garantiaFull = faltante * garantiaPct;
      const garantiaPaid = Math.min(Math.max(0, state.gobierno.reserva), garantiaFull);
      state.gobierno.reserva = Math.max(0, state.gobierno.reserva - garantiaPaid);
      const garantiaUnpaid = Math.max(0, garantiaFull - garantiaPaid);
      garantiaAlimentariaDia += garantiaPaid;
      garantiaImpagaDia += garantiaUnpaid;
      const pagoTotal = fromNpc + garantiaPaid;
      const frac = cost > 0 ? clamp(pagoTotal / cost, 0, 1) : 0;
      paidUnits = allocated * frac;
      paidFoodMoney += pagoTotal;
    }

    if (paidUnits > 0) {
      const actualStockUsed = Math.min(state.alimento.stock, paidUnits);
      state.alimento.stock = Math.max(0, state.alimento.stock - actualStockUsed);
      npc.economia.despensa = clamp(
        Number((npc.economia.despensa + actualStockUsed).toFixed(2)),
        0,
        ECON_CONSTANTS.despensaMaxDias
      );
    }
  }

  // Credit paid food revenue to comercio (margin) and food enterprise (rest)
  if (paidFoodMoney > 0) {
    const toComercio = paidFoodMoney * (ECON_CONSTANTS.margenComercialPct / 100);
    state.empresas.comercio.ventasAcum += toComercio;
    state.empresas.alimento.ventasAcum += paidFoodMoney - toComercio;
  }

  // 5. Effect 'comparte' (transfers pantry between same-zone neighbors before eating)
  for (const giver of vivos) {
    if (!giver.accionIa || giver.hospital.internado) continue;
    const compEf = giver.accionIa.efectos.find((e) => e.id === 'comparte');
    if (!compEf || giver.economia.despensa <= ECON_CONSTANTS.umbralDespensaBaja) continue;

    const spec = EFFECT_CATALOG.comparte[compEf.intensidad ?? 'media'];
    let budget = giver.economia.despensa * spec.maxPctDespensaCedida;
    const gZone = getEffectiveZone(giver, zonesCount);
    const needy = vivos
      .filter(
        (n) =>
          n.id !== giver.id &&
          !n.hospital.internado &&
          getEffectiveZone(n, zonesCount) === gZone &&
          n.economia.despensa < ECON_CONSTANTS.umbralDespensaBaja
      )
      .sort((a, b) => a.economia.despensa - b.economia.despensa);

    for (const rec of needy) {
      if (budget <= 0.05) break;
      const need = Math.min(budget, ECON_CONSTANTS.umbralDespensaBaja - rec.economia.despensa);
      if (need > 0) {
        giver.economia.despensa = Number(Math.max(0, giver.economia.despensa - need).toFixed(2));
        rec.economia.despensa = clamp(
          Number((rec.economia.despensa + need).toFixed(2)),
          0,
          ECON_CONSTANTS.despensaMaxDias
        );
        budget -= need;
      }
    }
  }

  // 6. Daily consumption from each NPC's pantry
  const accesoComida: Record<string, number> = {};
  const cons = ECON_CONSTANTS.consumoPorNpc;
  for (const npc of vivos) {
    if (npc.economia.despensa >= cons) {
      npc.economia.despensa = Number((npc.economia.despensa - cons).toFixed(2));
      accesoComida[npc.id] = 1;
    } else {
      accesoComida[npc.id] = clamp(npc.economia.despensa / Math.max(0.01, cons), 0, 1);
      npc.economia.despensa = 0;
    }
  }

  const diasStockRaw = state.alimento.stock / Math.max(1, pop * cons);
  state.alimento.consumoDiario = Number((pop * cons).toFixed(1));
  state.alimento.diasStock = Number(diasStockRaw.toFixed(1));
  state.empresas.alimento.stock = Number(state.alimento.stock.toFixed(2));
  state.empresas.alimento.diasStock = state.alimento.diasStock;

  // 7. Living Expense + Daily Entitlement Accruals (settled at Payday every PERIOD_DAYS)
  const acum = state.gobierno.acumuladoPeriodo;
  const salarioPublicoDia = ECON_CONSTANTS.salarioBasePublico * (pal.salarioPublico / 100);
  const colchonRef = ECON_CONSTANTS.colchonDias * precioAlimento * ECON_CONSTANTS.consumoPorNpc;

  let impuestosDiaEst = 0;
  let nominaDiaEst = 0;
  let pensionesDiaEst = 0;
  let ayudaSocialDiaEst = 0;
  let livingPoolDomestico = 0;
  const poderAdquisitivo: Record<string, number> = {};
  const ayudaRecibidaByNpc: Record<string, number> = {};

  for (const npc of vivos) {
    const def = ROLE_CATALOG[npc.rol];
    const taxRate = getTaxRateForNpc(npc, state);
    const isOwner = npc.rol === 'empresario' || npc.rol === 'comerciante';

    if (def.publico) {
      acum.nominaPorNpc[npc.id] = (acum.nominaPorNpc[npc.id] || 0) + salarioPublicoDia;
      acum.nominaDevengada += salarioPublicoDia;
      nominaDiaEst += salarioPublicoDia;
      impuestosDiaEst += salarioPublicoDia * (taxRate / 100);
    } else if (npc.rol === 'jubilado') {
      acum.pensionesPorNpc[npc.id] = (acum.pensionesPorNpc[npc.id] || 0) + ECON_CONSTANTS.pensionBase;
      acum.pensionesDevengadas += ECON_CONSTANTS.pensionBase;
      pensionesDiaEst += ECON_CONSTANTS.pensionBase;
    } else if (!isOwner && def.ingreso && !npc.hospital.internado) {
      const prod = getNpcProductivity(npc, state);
      const [minI, maxI] = def.ingreso;
      const refDia = (minI + npc.economia.ingresoPos * (maxI - minI)) * prod;

      if (npc.rol === 'agricultor' || npc.rol === 'tecnico') {
        state.empresas.alimento.refPorEmpleado[npc.id] =
          (state.empresas.alimento.refPorEmpleado[npc.id] || 0) + refDia;
        impuestosDiaEst += refDia * state.empresas.alimento.factor * (taxRate / 100);
      } else if (npc.rol === 'obrero') {
        state.empresas.comercio.refPorEmpleado[npc.id] =
          (state.empresas.comercio.refPorEmpleado[npc.id] || 0) + refDia;
        impuestosDiaEst += refDia * state.empresas.comercio.factor * (taxRate / 100);
      } else if (npc.rol === 'periodista') {
        acum.periodistasPorNpc[npc.id] = (acum.periodistasPorNpc[npc.id] || 0) + refDia;
        impuestosDiaEst += refDia * (taxRate / 100);
      }
    } else if (npc.rol === 'empresario') {
      impuestosDiaEst += (Math.max(0, state.empresas.alimento.ultimaGanancia) / PERIOD_DAYS) * (taxRate / 100);
    } else if (npc.rol === 'comerciante') {
      const sociosLen = Math.max(1, state.empresas.comercio.socios.length);
      impuestosDiaEst +=
        (Math.max(0, state.empresas.comercio.ultimaGanancia) / sociosLen / PERIOD_DAYS) * (taxRate / 100);
    }

    // Ayuda social accrual -> desempleados y jubilados (paid on payday)
    if ((npc.rol === 'desempleado' || npc.rol === 'jubilado') && pal.ayudaSocial > 0) {
      acum.ayudaPorNpc[npc.id] = (acum.ayudaPorNpc[npc.id] || 0) + pal.ayudaSocial;
      acum.ayudaDevengada += pal.ayudaSocial;
      ayudaSocialDiaEst += pal.ayudaSocial;
      ayudaRecibidaByNpc[npc.id] = pal.ayudaSocial;
    }

    // Gasto de vida (ECONOMIA §4) -> 100% goes to empresa de comercio
    if (getStage(npc.edad) !== 'menor') {
      const propMod = getModifierDelta(npc, 'propensionGasto');
      const effProp = clamp(npc.economia.propensionGasto + propMod, 0.05, 0.95);
      const baseNet = Math.max(0, npc.economia.ultimoIngresoNeto - precioAlimento);
      const wealthTerm =
        npc.economia.dinero > colchonRef ? ECON_CONSTANTS.kRiqueza * (npc.economia.dinero - colchonRef) : 0;
      const desiredLiving = effProp * baseNet + wealthTerm;
      const actualLiving = Math.min(
        Math.max(0, npc.economia.dinero - precioAlimento),
        Math.max(0, desiredLiving)
      );
      if (actualLiving > 0) {
        npc.economia.dinero -= actualLiving;
        livingPoolDomestico += actualLiving;
      }
    }

    const dineroTarget = precioAlimento * (ECON_CONSTANTS.colchonDias * 1.9);
    const wealthScore = clamp(
      (npc.economia.dinero / Math.max(1, dineroTarget)) * 60 +
        (Math.max(0, npc.economia.ultimoIngresoNeto) / Math.max(1, precioAlimento * 2.0)) * 40,
      0,
      100
    );
    poderAdquisitivo[npc.id] = npc.rol === 'desempleado' ? Math.min(wealthScore, 35) : wealthScore;
  }

  if (livingPoolDomestico > 0) {
    state.empresas.comercio.ventasAcum += livingPoolDomestico;
  }

  const opScale = pop / 100;
  const areaOpDia: Record<ServiceAreaId, number> = {
    seguridad: (SERVICE_LEVEL_TABLE.seguridad[pal.servicios.seguridad].operacionPeriodo * opScale) / PERIOD_DAYS,
    salud: (SERVICE_LEVEL_TABLE.salud[pal.servicios.salud].operacionPeriodo * opScale) / PERIOD_DAYS,
    infraestructura: (SERVICE_LEVEL_TABLE.obras[pal.servicios.obras].operacionPeriodo * opScale) / PERIOD_DAYS,
  };
  const operacionDia = areaOpDia.seguridad + areaOpDia.salud + areaOpDia.infraestructura;
  const prensaDia = pal.prensa / PERIOD_DAYS;

  acum.dias += 1;
  acum.impuestos += impuestosDiaEst;
  acum.garantiaAlimentaria += garantiaAlimentariaDia;
  acum.garantiaImpaga += garantiaImpagaDia;
  acum.comidaMenores += comidaMenoresDia;
  acum.operacion += operacionDia;
  acum.operacionPorArea.seguridad += areaOpDia.seguridad;
  acum.operacionPorArea.salud += areaOpDia.salud;
  acum.operacionPorArea.infraestructura += areaOpDia.infraestructura;
  acum.prensa += prensaDia;
  acum.importaciones += importacionesDia;
  acum.exportaciones += exportacionesDia;

  const estSaldoDia =
    impuestosDiaEst -
    (nominaDiaEst +
      pensionesDiaEst +
      garantiaAlimentariaDia +
      comidaMenoresDia +
      ayudaSocialDiaEst +
      operacionDia +
      prensaDia);

  state.ultimaSalidaEconomica = {
    accesoComida,
    poderAdquisitivo,
    saldoDiarioEstimado: Number(estSaldoDia.toFixed(1)),
    precioAlimento,
    inflacion: state.gobierno.inflacion,
  };

  // 8. Hunger update before Health sequence (ESTADOS §12)
  for (const npc of vivos) {
    const acceso = accesoComida[npc.id] ?? 1;
    if (acceso >= 0.98) {
      npc.variables.hambre = clamp(npc.variables.hambre - ECON_CONSTANTS.coefHambreBaja, 0, 100);
    } else {
      npc.variables.hambre = clamp(
        npc.variables.hambre + (1 - acceso) * ECON_CONSTANTS.coefHambreSubida,
        0,
        100
      );
    }
  }

  // 9. Individual Health & Hospital Sequence (ESTADOS §5 & §12)
  const defensa = computeZoneDefense(state);
  const attackPhenomena = activePhenomena.filter(
    (f) => f.tipo === 'plaga_zombie' || f.tipo === 'pandemia'
  );

  for (const fen of attackPhenomena) {
    const cfg =
      fen.tipo === 'plaga_zombie'
        ? ECON_CONSTANTS.fenomenosSalud.plaga_zombie
        : ECON_CONSTANTS.fenomenosSalud.pandemia;
    const causa = `clima:${fen.tipo}`;

    for (const npc of vivos) {
      if (!npc.vivo || npc.hospital.internado) continue;
      const effZone = getEffectiveZone(npc, zonesCount);
      const path =
        fen.origen && zonesCount > 1
          ? shortestZonePath(fen.origen, effZone, preset.zonas)
          : [effZone];
      const dist = fen.origen && zonesCount > 1 ? path.length - 1 : 0;
      const prob = clamp(
        cfg.exposicionMax * (fen.intensidad / 100) * Math.pow(cfg.atenuacion, dist),
        0,
        1
      );
      if (drawRand(state) >= prob) continue;

      let repelledZone: ZoneId | null = null;
      if (cfg.usaProteccion) {
        for (const z of path) {
          const repelProb = clamp(ECON_CONSTANTS.proteccionMaxZona * (defensa[z] / 100), 0, 0.99);
          if (drawRand(state) < repelProb) {
            repelledZone = z;
            break;
          }
        }
      }

      if (repelledZone) {
        emitSimEvent(state, {
          id: nextSeqId(state, `ev_${state.reloj.dia}`),
          dia: state.reloj.dia,
          tipo: 'ataque',
          zona: repelledZone,
          zonaOrigen: fen.origen,
          zonaDestino: effZone,
          resultado: 'repelido',
          npcId: npc.id,
          causa: state.ultimoEventoClimaId || causa,
        });
      } else {
        let dano = Math.round(cfg.danoMin + drawRand(state) * (cfg.danoMax - cfg.danoMin));
        if (npc.edad < 18 || npc.edad >= 65) {
          dano = Math.round(dano * ECON_CONSTANTS.kVulnerabilidadEdad);
        }
        const ataqueEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
        const golpeEvId = nextSeqId(state, `ev_${state.reloj.dia}`);

        if (cfg.usaProteccion) {
          state.gobierno.integridad[effZone] = clamp(
            Number(((state.gobierno.integridad[effZone] ?? 100) - ECON_CONSTANTS.danoIntegridad).toFixed(2)),
            0,
            100
          );
        }

        applyInstantModifierToNpc(
          npc,
          {
            afecta: { salud: -dano },
            origen: causa,
            causa: ataqueEvId,
            texto: `Recibió golpe (${fen.nombre}, -${dano} salud)`,
            recordOnNpc: true,
          },
          state
        );
        npc.ultimoGolpeOrigen = causa;
        npc.ultimoGolpeCausaId = golpeEvId;
        state.golpesPorZonaHistorial[effZone].push(state.reloj.dia);

        emitSimEvent(state, {
          id: ataqueEvId,
          dia: state.reloj.dia,
          tipo: 'ataque',
          zona: effZone,
          zonaOrigen: fen.origen,
          zonaDestino: effZone,
          resultado: 'golpe',
          npcId: npc.id,
          causa: state.ultimoEventoClimaId || causa,
        });
        emitSimEvent(state, {
          id: golpeEvId,
          dia: state.reloj.dia,
          tipo: 'golpe',
          zona: effZone,
          npcId: npc.id,
          dano,
          origen: causa,
          causa: ataqueEvId,
        });
      }
    }
  }

  let hungerDamageCount = 0;
  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.variables.hambre > 80) {
      applyInstantModifierToNpc(
        npc,
        {
          afecta: { salud: -ECON_CONSTANTS.coefDanoHambreCritica },
          origen: 'hambre:critica',
          texto: 'Daño por hambre crítica',
          recordOnNpc: false,
        },
        state
      );
      hungerDamageCount++;
      if (npc.variables.salud <= 0 && !npc.ultimoGolpeOrigen) {
        npc.ultimoGolpeOrigen = 'hambre:critica';
      }
    }
    if (npc.variables.salud <= 0) {
      killNpc(
        state,
        npc,
        npc.ultimoGolpeOrigen || 'salud:cero',
        zonesCount,
        npc.ultimoGolpeCausaId || state.ultimoEventoClimaId || state.ultimaCausaPalanca
      );
    }
  }
  if (hungerDamageCount > 0) {
    addLog(
      state,
      'sistema',
      'hambre:critica',
      `Daño por hambre crítica (${hungerDamageCount} habitantes)`,
      `Modificador instantáneo -${ECON_CONSTANTS.coefDanoHambreCritica} salud aplicado a ${hungerDamageCount} NPCs.`,
      state.ultimoEventoClimaId || state.ultimaCausaPalanca
    );
  }

  // Hospital admission
  let medicosActivos = 0;
  let currentInternados = 0;
  const candidatesHospital: Npc[] = [];

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.rol === 'medico' && !npc.hospital.internado && !npc.accionIa?.fueraDePuesto) {
      medicosActivos++;
    }
    if (npc.hospital.internado) {
      currentInternados++;
      npc.hospital.esperandoCama = false;
    } else {
      npc.hospital.esperandoCama = false;
      if (npc.variables.salud < ECON_CONSTANTS.umbralHospital) {
        candidatesHospital.push(npc);
      }
    }
  }

  const camas = Math.max(1, medicosActivos * ECON_CONSTANTS.pacientesPorMedico);
  let freeBeds = Math.max(0, camas - currentInternados);
  candidatesHospital.sort((a, b) => a.variables.salud - b.variables.salud);

  let waitingBeds = 0;
  for (const npc of candidatesHospital) {
    if (freeBeds > 0) {
      freeBeds--;
      currentInternados++;
      npc.hospital.internado = true;
      npc.hospital.esperandoCama = false;
      npc.hospital.diasInternado = 0;
      npc.accionIa = null;
      npc.mapa.accion = 'internado en hospital';
      npc.mapa.destino = getZoneCanvasPosition('centro', state);
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'internacion',
        zona: 'centro',
        npcId: npc.id,
        causa: npc.ultimoGolpeCausaId || npc.ultimoGolpeOrigen || 'salud:baja',
      });
    } else {
      npc.hospital.esperandoCama = true;
      waitingBeds++;
    }
  }

  const ocupacionPct = Number((((currentInternados + waitingBeds) / camas) * 100).toFixed(1));
  if (ocupacionPct > 100 && state.hospitalSaturadoDia !== state.reloj.dia) {
    state.hospitalSaturadoDia = state.reloj.dia;
    emitSimEvent(state, {
      id: nextSeqId(state, `ev_${state.reloj.dia}`),
      dia: state.reloj.dia,
      tipo: 'hospital_saturado',
      zona: 'centro',
      ocupacionPct,
      causa: state.ultimoEventoClimaId || state.ultimaCausaPalanca,
    });
  }

  // Caregivers bonus per zone ('cuida' effect)
  const cuidaBonusByZone: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  for (const npc of vivos) {
    if (!npc.vivo || npc.hospital.internado || !npc.accionIa) continue;
    const cuidaEf = npc.accionIa.efectos.find((e) => e.id === 'cuida');
    if (cuidaEf) {
      const z = getEffectiveZone(npc, zonesCount);
      const spec = EFFECT_CATALOG.cuida[cuidaEf.intensidad ?? 'baja'];
      cuidaBonusByZone[z] = Math.min(6.0, (cuidaBonusByZone[z] || 0) + spec.curaExtra);
    }
  }

  const saludService = state.gobierno.indicadores.salud / 100;
  const curaInternadoDia = ECON_CONSTANTS.curaBaseHospital * (0.5 + 0.5 * saludService);
  let hospitalCuredCount = 0;
  let naturalCuredCount = 0;

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.hospital.internado) {
      applyInstantModifierToNpc(
        npc,
        {
          afecta: { salud: curaInternadoDia },
          origen: 'hospital:cura',
          texto: 'Atención hospitalaria diaria',
          recordOnNpc: false,
        },
        state
      );
      hospitalCuredCount++;
      npc.hospital.diasInternado += 1;
      if (npc.variables.salud >= ECON_CONSTANTS.altaHospital) {
        npc.hospital.internado = false;
        npc.hospital.diasInternado = 0;
        npc.ultimoGolpeOrigen = undefined;
        npc.ultimoGolpeCausaId = undefined;
        npc.mapa.accion =
          npc.rol === 'estudiante' ? 'estudiando' : npc.rol === 'jubilado' || npc.rol === 'desempleado' ? 'paseando' : 'trabajando';
        npc.mapa.destino = getDistrictPosition(npc.rol, state);
        emitSimEvent(state, {
          id: nextSeqId(state, `ev_${state.reloj.dia}`),
          dia: state.reloj.dia,
          tipo: 'alta',
          zona: 'centro',
          npcId: npc.id,
          causa: 'hospital:alta',
        });
      }
    } else if (npc.variables.hambre < 50 && npc.variables.salud < 100) {
      const effZone = getEffectiveZone(npc, zonesCount);
      const careBoost = npc.variables.salud < ECON_CONSTANTS.umbralSaludBaja ? cuidaBonusByZone[effZone] || 0 : 0;
      applyInstantModifierToNpc(
        npc,
        {
          afecta: { salud: ECON_CONSTANTS.curaNaturalSalud + careBoost },
          origen: careBoost > 0 ? 'salud:cuida_vecinos' : 'salud:cura_natural',
          texto: careBoost > 0 ? 'Recuperación natural asistida por vecinos' : 'Recuperación natural diaria',
          recordOnNpc: false,
        },
        state
      );
      naturalCuredCount++;
    }

    if (npc.variables.salud <= 0) {
      killNpc(
        state,
        npc,
        npc.ultimoGolpeOrigen || 'salud:cero',
        zonesCount,
        npc.ultimoGolpeCausaId || state.ultimoEventoClimaId || state.ultimaCausaPalanca
      );
    }
  }
  if (hospitalCuredCount > 0 || naturalCuredCount > 0) {
    addLog(
      state,
      'sistema',
      'salud:cura_diaria',
      `Curas diarias (${hospitalCuredCount} hospital, ${naturalCuredCount} natural)`,
      `Hospital +${curaInternadoDia.toFixed(1)} salud; natural +${ECON_CONSTANTS.curaNaturalSalud} salud.`
    );
  }

  // 10. Fear, Satisfaction & Loyalty for surviving NPCs
  const segService = state.gobierno.indicadores.seguridad / 100;
  const activeZombies = activePhenomena.filter((f) => f.tipo === 'plaga_zombie');
  const policeLowPenalty =
    state.gobierno.coberturas.policia < ECON_CONSTANTS.coberturaBajaUmbral
      ? (ECON_CONSTANTS.coberturaBajaUmbral - state.gobierno.coberturas.policia) *
        ECON_CONSTANTS.penalizacionCoberturaPolicia
      : 0;
  const medicoLowPenalty =
    state.gobierno.coberturas.medico < ECON_CONSTANTS.coberturaBajaUmbral
      ? (ECON_CONSTANTS.coberturaBajaUmbral - state.gobierno.coberturas.medico) *
        ECON_CONSTANTS.penalizacionCoberturaMedico
      : 0;

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    const poder = poderAdquisitivo[npc.id] ?? 50;
    const val = getEffectiveTrait(npc, 'valentia') / 100;
    const res = getEffectiveTrait(npc, 'resiliencia') / 100;
    const reb = getEffectiveTrait(npc, 'rebeldia') / 100;
    const cod = getEffectiveTrait(npc, 'codicia') / 100;

    const modMiedo = getModifierDelta(npc, 'miedo') * 0.15;
    let targetMiedo: number;
    if (activeZombies.length > 0) {
      const effZone = getEffectiveZone(npc, zonesCount);
      const zoneDef = defensa[effZone] ?? state.gobierno.indicadores.seguridad;
      let maxZombieFear = 0;
      for (const fen of activeZombies) {
        const dist =
          fen.origen && zonesCount > 1
            ? shortestZonePath(fen.origen, effZone, preset.zonas).length - 1
            : 0;
        const valFear =
          fen.intensidad *
          Math.pow(ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion, dist) *
          (1 - zoneDef / 100) *
          (1 - 0.5 * val);
        if (valFear > maxZombieFear) maxZombieFear = valFear;
      }
      targetMiedo = clamp(
        maxZombieFear + (npc.variables.hambre > 60 ? 12 : 0) + policeLowPenalty + modMiedo,
        0,
        100
      );
    } else {
      targetMiedo = clamp(
        14 + (npc.variables.hambre > 60 ? 15 : 0) + policeLowPenalty - segService * 18 - val * 12 + modMiedo,
        0,
        100
      );
    }
    npc.variables.miedo = clamp(
      npc.variables.miedo + (targetMiedo - npc.variables.miedo) * 0.25,
      0,
      100
    );

    const taxRate = getTaxRateForNpc(npc, state);
    const taxDrag = (taxRate / 60) * (12 + 12 * cod);
    const inflDrag = mod === 'fiscal' ? Math.max(0, state.gobierno.inflacion - 10) * 0.35 : 0;
    const desempDrag = npc.rol === 'desempleado' ? 16 : 0;
    const modSat = getModifierDelta(npc, 'satisfaccion') * 0.3;
    const ayudaBoost = Math.min(18, (ayudaRecibidaByNpc[npc.id] || 0) * 3.5);

    const targetSat = clamp(
      54.5 +
        (poder - 50) * 0.45 +
        saludService * 10 +
        (state.gobierno.indicadores.infraestructura / 100) * 6 -
        npc.variables.hambre * 0.48 -
        npc.variables.miedo * 0.28 -
        (100 - npc.variables.salud) * 0.25 -
        taxDrag -
        inflDrag -
        desempDrag -
        medicoLowPenalty +
        ayudaBoost +
        modSat,
      0,
      100
    );
    const inertia = 0.12 + 0.08 * (1 - res);
    npc.variables.satisfaccion = clamp(
      npc.variables.satisfaccion + (targetSat - npc.variables.satisfaccion) * inertia,
      0,
      100
    );

    const modLealtad = getModifierDelta(npc, 'lealtad') * 0.25;
    const targetLealtad = clamp(npc.variables.satisfaccion + modLealtad - reb * 10, 0, 100);
    const diffLealtad = targetLealtad - npc.variables.lealtad;
    const lagRate = diffLealtad < 0 ? 0.12 * (1 + reb * 0.8) : 0.08;
    npc.variables.lealtad = clamp(npc.variables.lealtad + diffLealtad * lagRate, 0, 100);
  }
}

function settleEnterpriseAtPayday(
  state: GameState,
  ent: GameState['empresas']['alimento'] | GameState['empresas']['comercio'],
  isFood: boolean,
  vivos: Npc[]
): number {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const popScale = Math.max(0.6, vivos.length / 100);
  const ventas = Math.max(0, ent.ventasAcum);
  const fondoSueldos = ventas * ent.parteSueldos;

  const currentWorkers = isFood
    ? vivos.filter((n) => n.rol === 'agricultor' || n.rol === 'tecnico')
    : vivos.filter((n) => n.rol === 'obrero');
  const workersWithRef = vivos.filter((n) => (ent.refPorEmpleado[n.id] || 0) > 0);
  const sumRef = workersWithRef.reduce((acc, n) => acc + (ent.refPorEmpleado[n.id] || 0), 0);

  // Hiring on boom before raises (ECONOMIA §5)
  if (ent.ultimoTramo !== 'despido' && sumRef > 0 && fondoSueldos > sumRef) {
    const roleCounts: Record<RoleId, number> = {
      estudiante: 0,
      agricultor: 0,
      obrero: 0,
      policia: 0,
      estatal: 0,
      comerciante: 0,
      empresario: 0,
      tecnico: 0,
      docente: 0,
      periodista: 0,
      medico: 0,
      ingeniero: 0,
      desempleado: 0,
      jubilado: 0,
    };
    for (const n of vivos) roleCounts[n.rol]++;

    const hireRoles: PrivateRoleId[] = isFood ? ['tecnico', 'agricultor'] : ['obrero'];
    let hiresLeft = ECON_CONSTANTS.maxContratacionesPorPeriodo;
    let extraRefReserved = 0;

    while (hiresLeft > 0) {
      let hiredOne = false;
      for (const r of hireRoles) {
        const cap = Math.round(preset.topesPrivados[r] * popScale);
        if (roleCounts[r] >= cap) continue;
        const def = ROLE_CATALOG[r];
        const candidates = vivos.filter(
          (n) =>
            n.rol === 'desempleado' &&
            !n.hospital.internado &&
            n.educacion.nivel >= def.educMin &&
            n.edad >= def.edadMin &&
            (def.edadMax === null || n.edad <= def.edadMax)
        );
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => {
          const tA = def.afinidad ? getEffectiveTrait(a, def.afinidad) : 50;
          const tB = def.afinidad ? getEffectiveTrait(b, def.afinidad) : 50;
          return tB - tA;
        });
        const cand = candidates[0];
        const [minI, maxI] = def.ingreso!;
        const candPeriodRef =
          (minI + cand.economia.ingresoPos * (maxI - minI)) *
          Math.max(0.4, getNpcProductivity(cand, state)) *
          PERIOD_DAYS;
        if (fondoSueldos >= sumRef + extraRefReserved + candPeriodRef) {
          cand.rol = r;
          const allowedZones = preset.zonaPorRol[r] || ['centro'];
          if (!allowedZones.includes(cand.zona)) {
            cand.zona = allowedZones[roleCounts[r] % allowedZones.length];
          }
          cand.mapa.destino = getDistrictPosition(r, state);
          cand.mapa.accion = 'trabajando';
          roleCounts.desempleado--;
          roleCounts[r]++;
          extraRefReserved += candPeriodRef;
          hiresLeft--;
          hiredOne = true;
          break;
        }
      }
      if (!hiredOne) break;
    }
  }

  const rawFactor = sumRef > 0 ? fondoSueldos / sumRef : 1;
  const factor = Number(clamp(rawFactor, 0, ECON_CONSTANTS.factorMax).toFixed(3));

  let taxesCollected = 0;
  let totalGrossPaid = 0;

  for (const w of workersWithRef) {
    const ref = ent.refPorEmpleado[w.id] || 0;
    const remainingVentas = Math.max(0, ventas - totalGrossPaid);
    const gross = Math.min(remainingVentas, ref * factor);
    const taxRate = getTaxRateForNpc(w, state);
    const tax = gross * (taxRate / 100);
    const net = gross - tax;
    w.economia.dinero += net;
    w.economia.ultimoIngresoNeto = Number((net / PERIOD_DAYS).toFixed(2));
    state.gobierno.reserva += tax;
    taxesCollected += tax;
    totalGrossPaid += gross;
  }

  const gananciaBruta = Math.max(0, ventas - totalGrossPaid);
  const duenoNpc = isFood
    ? state.empresas.alimento.dueno
      ? vivos.find((n) => n.id === state.empresas.alimento.dueno) || null
      : null
    : null;
  const sociosNpcs = isFood ? [] : vivos.filter((n) => n.rol === 'comerciante');
  const owners = isFood ? (duenoNpc ? [duenoNpc] : []) : sociosNpcs;

  if (owners.length > 0) {
    const share = gananciaBruta / owners.length;
    for (const owner of owners) {
      const taxRate = getTaxRateForNpc(owner, state);
      const tax = share * (taxRate / 100);
      const net = share - tax;
      owner.economia.dinero += net;
      owner.economia.ultimoIngresoNeto = Number((net / PERIOD_DAYS).toFixed(2));
      state.gobierno.reserva += tax;
      taxesCollected += tax;
    }
  } else if (gananciaBruta > 0) {
    // Profit of an ownerless enterprise exits the world (ECONOMIA §9)
    state.auditSalidasDia += gananciaBruta;
  }

  ent.ventasAcum = 0;
  ent.refPorEmpleado = {};
  ent.ultimoIngresoPeriodo = Number(ventas.toFixed(1));
  ent.ultimoSueldosPeriodo = Number(totalGrossPaid.toFixed(1));
  ent.ultimaGanancia = Number(gananciaBruta.toFixed(1));
  ent.factor = factor;

  const prevTramo = ent.ultimoTramo;
  const piso = ECON_CONSTANTS.pisoSueldoPct / 100;
  const repNpc = duenoNpc || sociosNpcs[0] || currentWorkers[0] || null;
  const repZone = repNpc?.zona ?? 'centro';
  const empCausa = state.ultimaCausaPalanca || state.ultimoEventoClimaId;
  const origen = `empresa:${ent.id}/respuesta`;

  if (sumRef > 0 && factor < piso) {
    ent.ultimoTramo = 'despido';
    // Calculate how many current workers exceed the floor payroll capacity
    const orderedForLayoff = isFood
      ? [
          ...currentWorkers.filter((n) => n.rol === 'tecnico'),
          ...currentWorkers.filter((n) => n.rol === 'agricultor'),
        ]
      : [...currentWorkers];
    let remainingRef = sumRef;
    let surplusCount = 0;
    const maxCuts = Math.max(0, orderedForLayoff.length - 1);
    for (const w of orderedForLayoff) {
      if (surplusCount >= maxCuts) break;
      if (remainingRef * piso <= fondoSueldos + 0.01) break;
      const wRef =
        ent.refPorEmpleado[w.id] ??
        sumRef / Math.max(1, orderedForLayoff.length);
      remainingRef = Math.max(0, remainingRef - wRef);
      surplusCount++;
    }
    if (surplusCount === 0 && maxCuts > 0) surplusCount = 1;
    ent.despidosPendientes = surplusCount;

    const evId = nextSeqId(state, `ev_${state.reloj.dia}`);
    state.ultimoEventoEmpresaId = evId;
    ent.ultimaCausa = evId;
    emitSimEvent(state, {
      id: evId,
      dia: state.reloj.dia,
      tipo: 'empresa_despido',
      zona: repZone,
      empresaId: ent.id,
      cantidad: surplusCount,
      factor,
      origen,
      causa: empCausa,
    });
    addLog(
      state,
      'economia',
      origen,
      `Empresa ${ent.id}: despidos programados (${surplusCount})`,
      `El factor salarial cayó a ${Math.round(factor * 100)}% (bajo el piso de ${ECON_CONSTANTS.pisoSueldoPct}%).`,
      empCausa,
      evId
    );
  } else if (sumRef > 0 && factor < 0.995) {
    ent.ultimoTramo = 'recorte';
    ent.despidosPendientes = 0;
    const evId = nextSeqId(state, `ev_${state.reloj.dia}`);
    state.ultimoEventoEmpresaId = evId;
    ent.ultimaCausa = evId;
    emitSimEvent(state, {
      id: evId,
      dia: state.reloj.dia,
      tipo: 'empresa_recorte',
      zona: repZone,
      empresaId: ent.id,
      factor,
      origen,
      causa: empCausa,
    });
    addLog(
      state,
      'economia',
      origen,
      `Empresa ${ent.id}: recorte salarial (${Math.round(factor * 100)}%)`,
      `Las ventas del período redujeron el reparto de sueldos al ${Math.round(factor * 100)}% de referencia.`,
      empCausa,
      evId
    );
  } else if (sumRef > 0 && factor > 1.005) {
    ent.ultimoTramo = 'aumento';
    ent.despidosPendientes = 0;
    if (prevTramo !== 'aumento') {
      const evId = nextSeqId(state, `ev_${state.reloj.dia}`);
      ent.ultimaCausa = evId;
      emitSimEvent(state, {
        id: evId,
        dia: state.reloj.dia,
        tipo: 'empresa_aumento',
        zona: repZone,
        empresaId: ent.id,
        factor,
        origen,
        causa: empCausa,
      });
      addLog(
        state,
        'economia',
        origen,
        `Empresa ${ent.id}: aumento salarial (${Math.round(factor * 100)}%)`,
        `El auge de ventas elevó el factor salarial a ${Math.round(factor * 100)}%.`,
        empCausa,
        evId
      );
    }
  } else {
    ent.ultimoTramo = 'normal';
    ent.despidosPendientes = 0;
  }

  return taxesCollected;
}

function runPaydaySettlement(state: GameState): void {
  const acum = state.gobierno.acumuladoPeriodo;
  const pal = state.gobierno.palancasVigentes;
  const mod = state.config.economiaModulo;
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);

  // Step 1: Private Enterprises (alimento + comercio) settle sales -> wages + profits -> taxes
  let taxesCollected = 0;
  taxesCollected += settleEnterpriseAtPayday(state, state.empresas.alimento, true, vivos);
  taxesCollected += settleEnterpriseAtPayday(state, state.empresas.comercio, false, vivos);

  // Step 2: State Payday Payouts in strict priority order (ECONOMIA §6)
  // Compute living obligations
  const pensNpcs = vivos.filter((n) => (acum.pensionesPorNpc[n.id] || 0) > 0);
  const nomNpcs = vivos.filter((n) => (acum.nominaPorNpc[n.id] || 0) > 0);
  const ayuNpcs = vivos.filter((n) => (acum.ayudaPorNpc[n.id] || 0) > 0);

  const pensReq = pensNpcs.reduce((acc, n) => acc + (acum.pensionesPorNpc[n.id] || 0), 0);
  const nomReq = nomNpcs.reduce((acc, n) => acc + (acum.nominaPorNpc[n.id] || 0), 0);
  const ayuReq = ayuNpcs.reduce((acc, n) => acc + (acum.ayudaPorNpc[n.id] || 0), 0);
  const opReq = acum.operacion;
  const prenReq = state.medios.length > 0 ? acum.prensa : 0;

  const totalBill = pensReq + nomReq + ayuReq + opReq + prenReq;
  let emision = 0;

  if (mod === 'fiscal') {
    if (state.gobierno.reserva < totalBill) {
      const shortfallBeforeEmit = totalBill - state.gobierno.reserva;
      const refIncomeBase = Math.max(
        taxesCollected,
        acum.impuestos,
        state.gobierno.finanzas.ingresos
      );
      const maxEmit = refIncomeBase * (pal.topeEmision / 100);
      emision = Math.min(shortfallBeforeEmit, maxEmit);
      if (emision > 0) {
        state.gobierno.reserva += emision;
        state.auditEntradasDia += emision;
        const inflJump = (emision / Math.max(100, pop * 12)) * 28;
        state.gobierno.inflacion = clamp(
          Number((state.gobierno.inflacion + inflJump).toFixed(1)),
          0,
          300
        );
        addLog(
          state,
          'economia',
          'finanzas:emision',
          `Emisión monetaria de $${emision.toFixed(0)}`,
          `Cubre déficit fiscal pero eleva la inflación a ${state.gobierno.inflacion.toFixed(1)}%.`
        );
      }
    } else {
      state.gobierno.inflacion = Math.max(2, Number((state.gobierno.inflacion * 0.94).toFixed(1)));
    }
  }

  const periodIncomeByNpc: Record<string, number> = {};

  // 2.1 Pensiones
  const paidPens = Math.min(Math.max(0, state.gobierno.reserva), pensReq);
  state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidPens);
  const pensRatio = pensReq > 0 ? paidPens / pensReq : 1;
  for (const n of pensNpcs) {
    const paid = (acum.pensionesPorNpc[n.id] || 0) * pensRatio;
    n.economia.dinero += paid;
    periodIncomeByNpc[n.id] = (periodIncomeByNpc[n.id] || 0) + paid;
  }
  const pensShortfall = Math.max(0, pensReq - paidPens);

  // 2.2 Nómina (gross paid, tax retained back to reserva immediately)
  const paidNomGross = Math.min(Math.max(0, state.gobierno.reserva), nomReq);
  state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidNomGross);
  const nomRatio = nomReq > 0 ? paidNomGross / nomReq : 1;
  let totalNomTax = 0;
  for (const n of nomNpcs) {
    const gross = (acum.nominaPorNpc[n.id] || 0) * nomRatio;
    const tax = gross * (getTaxRateForNpc(n, state) / 100);
    const net = gross - tax;
    n.economia.dinero += net;
    periodIncomeByNpc[n.id] = (periodIncomeByNpc[n.id] || 0) + net;
    totalNomTax += tax;
  }
  state.gobierno.reserva += totalNomTax;
  taxesCollected += totalNomTax;
  const nomShortfall = Math.max(0, nomReq - paidNomGross);

  // 2.3 Ayuda social
  const paidAyu = Math.min(Math.max(0, state.gobierno.reserva), ayuReq);
  state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidAyu);
  const ayuRatio = ayuReq > 0 ? paidAyu / ayuReq : 1;
  for (const n of ayuNpcs) {
    const paid = (acum.ayudaPorNpc[n.id] || 0) * ayuRatio;
    n.economia.dinero += paid;
    periodIncomeByNpc[n.id] = (periodIncomeByNpc[n.id] || 0) + paid;
  }
  const ayuShortfall = Math.max(0, ayuReq - paidAyu);

  // Sync daily net income for pension/public/unemployed recipients
  for (const n of vivos) {
    if (n.id in periodIncomeByNpc) {
      n.economia.ultimoIngresoNeto = Number((periodIncomeByNpc[n.id] / PERIOD_DAYS).toFixed(2));
    } else if (n.rol === 'desempleado' || n.rol === 'estudiante') {
      n.economia.ultimoIngresoNeto = 0;
    }
  }

  // 2.4 Operación de servicios -> exact paid amount goes to empresa de comercio
  const paidOp = Math.min(Math.max(0, state.gobierno.reserva), opReq);
  state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidOp);
  if (paidOp > 0) {
    state.empresas.comercio.ventasAcum += paidOp;
  }
  const opRatio = opReq > 0 ? paidOp / opReq : 1;
  const opShortfall = Math.max(0, opReq - paidOp);

  // Update all 3 service indicators using paid operation * coverage (ESTADOS §12)
  const costoBase = pop * ECON_CONSTANTS.costoBaseServicioPorPoblacion * PERIOD_DAYS;
  const areaToCoverage: Record<ServiceAreaId, number> = {
    salud: state.gobierno.coberturas.medico,
    seguridad: state.gobierno.coberturas.policia,
    infraestructura: state.gobierno.coberturas.ingeniero,
  };
  (['salud', 'seguridad', 'infraestructura'] as ServiceAreaId[]).forEach((area) => {
    const areaPaidOp = acum.operacionPorArea[area] * opRatio;
    const ratio = areaPaidOp / Math.max(1, costoBase);
    const inversion = ratio <= 1 ? ratio : 1 + Math.sqrt(ratio - 1) * 0.55;
    const gain = areaToCoverage[area] * inversion * 6.8;
    const decay = 0.8 + state.gobierno.indicadores[area] * 0.08;
    state.gobierno.indicadores[area] = clamp(
      Number((state.gobierno.indicadores[area] + gain - decay).toFixed(1)),
      0,
      100
    );
  });

  // 2.5 Prensa -> paid amount splits evenly across active media outlets
  const paidPrensa = Math.min(Math.max(0, state.gobierno.reserva), prenReq);
  state.gobierno.reserva = Math.max(0, state.gobierno.reserva - paidPrensa);
  const prenShortfall = Math.max(0, prenReq - paidPrensa);

  // Step 3: Media Outlets pay living columnists & retain surpluses out of world (ECONOMIA §8 & §9)
  const fondosPorMedio = state.medios.length > 0 ? paidPrensa / state.medios.length : 0;
  for (const medio of state.medios) {
    const propios = medio.finanzas.ingresosPropios;
    state.auditEntradasDia += propios;
    const totalFunds = propios + fondosPorMedio;

    const cols = medio.columnistas
      .map((id) => vivos.find((n) => n.id === id))
      .filter((n): n is Npc => Boolean(n));
    const reqCols = cols.reduce((acc, c) => acc + (acum.periodistasPorNpc[c.id] || 0), 0);
    const colPayFactor = reqCols > totalFunds ? totalFunds / reqCols : 1;

    let paidColGross = 0;
    for (const col of cols) {
      const baseRef = acum.periodistasPorNpc[col.id] || 0;
      const gross = baseRef * colPayFactor;
      const tax = gross * (getTaxRateForNpc(col, state) / 100);
      const net = gross - tax;
      col.economia.dinero += net;
      col.economia.ultimoIngresoNeto = Number((net / PERIOD_DAYS).toFixed(2));
      state.gobierno.reserva += tax;
      taxesCollected += tax;
      paidColGross += gross;
    }

    const surplus = Math.max(0, totalFunds - paidColGross);
    if (surplus > 0) {
      state.auditSalidasDia += surplus;
    }

    medio.finanzas.fondosEstado = Number(fondosPorMedio.toFixed(1));
    medio.finanzas.dependenciaPct = Number(
      ((fondosPorMedio / Math.max(1, propios + fondosPorMedio)) * 100).toFixed(1)
    );
    const targetReach = clamp(14 + Math.sqrt(fondosPorMedio) * 11.5, 12, 95);
    medio.alcancePct = Math.round(targetReach);

    const baseAff = medio.afinidadBase ?? 45;
    const targetAff = clamp(baseAff + Math.max(0, medio.finanzas.dependenciaPct - 15) * 0.65, 0, 100);
    medio.lineaEditorial.afinidadGobierno = Math.round(
      medio.lineaEditorial.afinidadGobierno + (targetAff - medio.lineaEditorial.afinidadGobierno) * 0.45
    );

    if (medio.finanzas.dependenciaPct > ECON_CONSTANTS.umbralDependenciaPrensaPct) {
      medio.credibilidad = clamp(
        Number(
          (
            medio.credibilidad -
            (medio.finanzas.dependenciaPct - ECON_CONSTANTS.umbralDependenciaPrensaPct) * 0.12
          ).toFixed(1)
        ),
        15,
        98
      );
    } else {
      medio.credibilidad = clamp(Number((medio.credibilidad + 0.6).toFixed(1)), 15, 98);
    }
  }

  // Step 4: Evaluate Impago & Fiscal Ledger (ECONOMIA §6)
  const wasImpago = state.gobierno.finanzas.impago;
  const totalShortfall =
    acum.garantiaImpaga + pensShortfall + nomShortfall + ayuShortfall + opShortfall + prenShortfall;
  const impago = totalShortfall > 0.5;
  const alcanzaNomina = nomShortfall > 0.01 && nomReq > 0;

  if (impago) {
    if (alcanzaNomina) {
      for (const npc of vivos) {
        if (ROLE_CATALOG[npc.rol].publico) {
          npc.variables.satisfaccion = clamp(npc.variables.satisfaccion - 14, 0, 100);
          npc.variables.lealtad = clamp(npc.variables.lealtad - 12, 0, 100);
        }
      }
    }
    const impEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
    emitSimEvent(state, {
      id: impEvId,
      dia: state.reloj.dia,
      tipo: 'impago',
      zona: 'centro',
      faltante: Number(totalShortfall.toFixed(1)),
      alcanzaNomina,
      causa: state.ultimaCausaPalanca,
    });
    addLog(
      state,
      'economia',
      'finanzas:impago',
      alcanzaNomina ? 'Impago de nómina pública' : 'Impago de gastos del período',
      `Faltaron $${totalShortfall.toFixed(0)} en la liquidación del período.`,
      state.ultimaCausaPalanca,
      impEvId
    );
  } else if (wasImpago) {
    const impFinEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
    emitSimEvent(state, {
      id: impFinEvId,
      dia: state.reloj.dia,
      tipo: 'impago_fin',
      zona: 'centro',
      causa: state.ultimaCausaPalanca,
    });
    addLog(
      state,
      'economia',
      'finanzas:impago_fin',
      'Fin de impago fiscal',
      'La liquidación cubrió los gastos obligatorios sin faltante.',
      state.ultimaCausaPalanca,
      impFinEvId
    );
  }

  const discReq = ayuReq + opReq + prenReq;
  const discPaid = paidAyu + paidOp + paidPrensa;
  const prorrateoDiscrecional = discReq > 0 ? clamp(discPaid / discReq, 0, 1) : 1;
  const prorrateoNomina = nomReq > 0 ? clamp(paidNomGross / nomReq, 0, 1) : 1;
  const garTotalReq = acum.garantiaAlimentaria + acum.garantiaImpaga;
  const secReq = pensReq + garTotalReq;
  const secPaid = paidPens + acum.garantiaAlimentaria;
  const prorrateoPensionGarantia = secReq > 0 ? clamp(secPaid / secReq, 0, 1) : 1;

  const gastosPeriodo =
    paidNomGross +
    paidPens +
    acum.garantiaAlimentaria +
    acum.comidaMenores +
    paidAyu +
    paidOp +
    paidPrensa;
  const saldo = taxesCollected - gastosPeriodo;

  state.gobierno.finanzas = {
    ingresos: Number(taxesCollected.toFixed(1)),
    nomina: Number(paidNomGross.toFixed(1)),
    pensiones: Number(paidPens.toFixed(1)),
    garantiaAlimentaria: Number(acum.garantiaAlimentaria.toFixed(1)),
    garantiaImpaga: Number(acum.garantiaImpaga.toFixed(1)),
    comidaMenores: Number(acum.comidaMenores.toFixed(1)),
    ayudaSocial: Number(paidAyu.toFixed(1)),
    operacion: Number(paidOp.toFixed(1)),
    prensa: Number(paidPrensa.toFixed(1)),
    saldo: Number(saldo.toFixed(1)),
    emision: Number(emision.toFixed(1)),
    importaciones: Number(acum.importaciones.toFixed(1)),
    exportaciones: Number(acum.exportaciones.toFixed(1)),
    impago,
    alcanzaNomina,
    prorrateoDiscrecional: Number(prorrateoDiscrecional.toFixed(4)),
    prorrateoNomina: Number(prorrateoNomina.toFixed(4)),
    prorrateoPensionGarantia: Number(prorrateoPensionGarantia.toFixed(4)),
  };
  state.ultimoSaldoCierre = state.gobierno.finanzas.saldo;

  state.gobierno.acumuladoPeriodo = {
    dias: 0,
    impuestos: 0,
    nominaPorNpc: {},
    pensionesPorNpc: {},
    ayudaPorNpc: {},
    periodistasPorNpc: {},
    nominaDevengada: 0,
    pensionesDevengadas: 0,
    ayudaDevengada: 0,
    garantiaAlimentaria: 0,
    garantiaImpaga: 0,
    comidaMenores: 0,
    operacion: 0,
    operacionPorArea: { seguridad: 0, salud: 0, infraestructura: 0 },
    prensa: 0,
    importaciones: 0,
    exportaciones: 0,
  };
}

function updateClimate(state: GameState): void {
  const dia = state.reloj.dia;
  const remaining: ClimatePhenomenon[] = [];

  for (const fen of state.clima.fenomenos) {
    if (dia < fen.inicioDia + fen.duracionDias) {
      if (fen.crecimientoDia && dia > fen.inicioDia) {
        fen.intensidad = clamp(Number((fen.intensidad + fen.crecimientoDia).toFixed(2)), 0, 100);
      }
      if (
        (fen.avisoDias ?? 0) > 0 &&
        dia >= fen.inicioDia - (fen.avisoDias ?? 0) &&
        dia < fen.inicioDia &&
        !state.avisosEmitidos.includes(fen.id)
      ) {
        state.avisosEmitidos.push(fen.id);
        const avId = nextSeqId(state, `ev_${dia}`);
        emitSimEvent(state, {
          id: avId,
          dia,
          tipo: 'aviso',
          zona: fen.origen ?? 'centro',
          fenomeno: fen.nombre,
          zonaOrigen: fen.origen,
          diasRestantes: fen.inicioDia - dia,
        });
        addLog(
          state,
          'clima',
          `clima:${fen.tipo}`,
          `Aviso: ${fen.nombre} en ${fen.origen ?? 'valle'}`,
          `Faltan ${fen.inicioDia - dia} días para su llegada estimada.`,
          undefined,
          avId
        );
      } else if (dia >= fen.inicioDia && !state.fenomenosIniciadosIds.includes(fen.id)) {
        state.fenomenosIniciadosIds.push(fen.id);
        const startEvId = nextSeqId(state, `ev_${dia}`);
        state.ultimoEventoClimaId = startEvId;
        emitSimEvent(state, {
          id: startEvId,
          dia,
          tipo: 'fenomeno_inicio',
          zona: fen.origen ?? 'centro',
          fenomenoId: fen.id,
          fenomeno: fen.nombre,
          zonaOrigen: fen.origen,
        });
        if (fen.inicioDia > 1) {
          addLog(
            state,
            'clima',
            `clima:${fen.tipo}`,
            `Comienza ${fen.nombre} (intensidad ${Math.round(fen.intensidad)}%)`,
            `Origen: ${fen.origen ?? 'general'} · Duración estimada ${fen.duracionDias} días.`,
            undefined,
            startEvId
          );
        }
      }
      remaining.push(fen);
    } else {
      const endEvId = nextSeqId(state, `ev_${dia}`);
      emitSimEvent(state, {
        id: endEvId,
        dia,
        tipo: 'fenomeno_fin',
        zona: fen.origen ?? 'centro',
        fenomenoId: fen.id,
        fenomeno: fen.nombre,
        zonaOrigen: fen.origen,
      });
      addLog(
        state,
        'clima',
        `clima:${fen.tipo}`,
        `Finaliza ${fen.nombre}`,
        'Las condiciones climáticas regresan a la normalidad.',
        undefined,
        endEvId
      );
    }
  }
  state.clima.fenomenos = remaining;

  if (dia >= state.clima.proximoEventoDia) {
    const pool: PhenomenonType[] =
      state.config.escenarioId === 'zombies' ? ['sequia', 'plaga'] : ['sequia', 'plaga', 'pandemia'];
    const tipo = pool[Math.floor(drawRand(state) * pool.length)];
    const names: Record<PhenomenonType, string> = {
      sequia: 'Sequía Estacional',
      plaga: 'Plaga de Cultivos',
      pandemia: 'Brote Gripal Comunitario',
      plaga_zombie: 'Oleada Zombie',
    };
    const duracion = 14 + randInt(state, 0, 13);
    const intensidad = 35 + randInt(state, 0, 34);
    const newId = `fen_${dia}`;
    state.clima.fenomenos.push({
      id: newId,
      tipo,
      nombre: names[tipo],
      intensidad,
      inicioDia: dia,
      duracionDias: duracion,
    });
    state.fenomenosIniciadosIds.push(newId);
    const startEvId = nextSeqId(state, `ev_${dia}`);
    state.ultimoEventoClimaId = startEvId;
    emitSimEvent(state, {
      id: startEvId,
      dia,
      tipo: 'fenomeno_inicio',
      zona: 'centro',
      fenomenoId: newId,
      fenomeno: names[tipo],
    });
    state.clima.proximoEventoDia = dia + duracion + 18 + randInt(state, 0, 19);
    addLog(
      state,
      'clima',
      `clima:${tipo}`,
      `Comienza ${names[tipo]} (intensidad ${intensidad}%)`,
      `Se estima una duración de ${duracion} días.`,
      undefined,
      startEvId
    );
  }
}

function checkConditionTriggers(state: GameState, preDerived?: CommunityDerived): void {
  const derived = preDerived ?? deriveCommunityStats(state);
  const dia = state.reloj.dia;

  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente' && dia >= win.diaLimite) {
      resolveConditionWindowWithFallback(state, win.id, undefined, 'motor');
    }
  }

  // Trigger: Impago que alcanza la nómina -> Huelga
  if (
    state.gobierno.finanzas.impago &&
    state.gobierno.finanzas.alcanzaNomina &&
    dia >= state.cooldownsCondicion.impago
  ) {
    const huelga = ACTION_TABLE.find((a) => a.id === 'huelga')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, huelga, state)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(1, Math.ceil(elegibles.length * 0.45));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, huelga) - scoreActionAffinity(a, huelga))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_impago_${dia}`,
        disparador: 'impago',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [huelga],
        npcIds: elegidos,
        estado: 'pendiente',
        causaId: state.eventos.find((e) => e.tipo === 'impago')?.id || state.ultimaCausaPalanca,
      });
      state.cooldownsCondicion.impago = dia + 7;
    }
  }

  // Trigger: Descontentos > 30% -> Protesta
  if (derived.descontentosPct > 30 && dia >= state.cooldownsCondicion.descontento) {
    const protesta = ACTION_TABLE.find((a) => a.id === 'protesta')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, protesta, state)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(2, Math.round(elegibles.length * 0.14));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, protesta) - scoreActionAffinity(a, protesta))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_descontento_${dia}`,
        disparador: 'descontento',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [protesta],
        npcIds: elegidos,
        estado: 'pendiente',
        causaId: state.ultimoEventoEmpresaId || state.ultimaCausaPalanca || state.ultimoEventoClimaId,
      });
      state.cooldownsCondicion.descontento = dia + 9;
    }
  }

  // Trigger: Hambre Crítica > 20% -> Saqueo
  if (derived.hambreCriticaPct > 20 && dia >= state.cooldownsCondicion.hambre) {
    const saqueo = ACTION_TABLE.find((a) => a.id === 'saqueo')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, saqueo, state)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(2, Math.round(elegibles.length * 0.12));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, saqueo) - scoreActionAffinity(a, saqueo))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_hambre_${dia}`,
        disparador: 'hambre',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [saqueo],
        npcIds: elegidos,
        estado: 'pendiente',
        causaId: state.ultimoEventoClimaId || state.ultimaCausaPalanca,
      });
      state.cooldownsCondicion.hambre = dia + 8;
    }
  }

  if (state.ventanasCondicion.length > 15) {
    state.ventanasCondicion = state.ventanasCondicion.slice(-10);
  }
}

function evaluateObjective(state: GameState, preDerived?: CommunityDerived): void {
  if (state.resultado.estado !== 'jugando') return;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const derived = preDerived ?? deriveCommunityStats(state);

  const getMetric = (m: ObjectiveCondition['metrica']) => {
    if (m === 'apoyoPct') return derived.apoyoPct;
    if (m === 'hambreCriticaPct') return derived.hambreCriticaPct;
    if (m === 'poblacionPct') return derived.poblacionPct;
    return derived.poblacion;
  };

  const checkCond = (val: number, op: '>=' | '>' | '<' | '<=', threshold: number): boolean => {
    if (op === '>=') return val >= threshold;
    if (op === '>') return val > threshold;
    if (op === '<') return val < threshold;
    return val <= threshold;
  };

  const defeatVal = getMetric(preset.derrota.metrica);
  if (checkCond(defeatVal, preset.derrota.op, preset.derrota.umbral)) {
    const endCause =
      state.eventosDiaActual.find((e) => e.tipo === 'muerte' || e.tipo === 'golpe' || e.tipo === 'impago')?.id ||
      state.ultimoEventoClimaId ||
      state.ultimaCausaPalanca;
    const endEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
    emitSimEvent(state, {
      id: endEvId,
      dia: state.reloj.dia,
      tipo: 'fin_partida',
      zona: 'centro',
      metrica: preset.derrota.metrica,
      valor: defeatVal,
      causa: endCause,
    });
    state.resultado = {
      ...state.resultado,
      estado: 'derrota',
      razon: preset.derrota.descripcion,
      diaFinal: state.reloj.dia,
    };
    addLog(
      state,
      'sistema',
      'objetivo:derrota',
      'Fin de partida: Derrota',
      preset.derrota.descripcion,
      endCause,
      endEvId
    );
    return;
  }

  const plazo = preset.victoria.plazoDia ?? 365;
  const alreadyEvaluatedDeadline =
    Boolean(state.resultado.victoriaCumplida) ||
    state.eventos.some((e) => e.tipo === 'objetivo_perdido');
  if (state.reloj.dia >= plazo && !alreadyEvaluatedDeadline) {
    const vicVal = getMetric(preset.victoria.metrica);
    if (checkCond(vicVal, preset.victoria.op, preset.victoria.umbral)) {
      const vicEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
      emitSimEvent(state, {
        id: vicEvId,
        dia: state.reloj.dia,
        tipo: 'victoria',
        zona: 'centro',
        metrica: preset.victoria.metrica,
        valor: vicVal,
        causa: state.ultimaCausaPalanca,
      });
      state.resultado = {
        ...state.resultado,
        estado: 'jugando',
        victoriaCumplida: true,
        diaVictoria: state.reloj.dia,
        razon: preset.victoria.descripcion,
      };
      addLog(
        state,
        'sistema',
        'objetivo:victoria',
        'Objetivo cumplido (hito)',
        `${preset.victoria.descripcion} La partida continúa.`,
        state.ultimaCausaPalanca,
        vicEvId
      );
    } else {
      const missEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
      emitSimEvent(state, {
        id: missEvId,
        dia: state.reloj.dia,
        tipo: 'objetivo_perdido',
        zona: 'centro',
        metrica: preset.victoria.metrica,
        valor: vicVal,
        causa: state.ultimoEventoClimaId || state.ultimaCausaPalanca,
      });
      state.resultado = {
        ...state.resultado,
        estado: 'jugando',
        victoriaCumplida: false,
        razon: `No se cumplió la meta al día ${plazo}: ${preset.victoria.descripcion}`,
      };
      addLog(
        state,
        'sistema',
        'objetivo:perdido',
        'Objetivo de mandato perdido',
        `No se cumplió la meta al día ${plazo}. La partida continúa.`,
        state.ultimoEventoClimaId || state.ultimaCausaPalanca,
        missEvId
      );
    }
  }
}

function compactHistorialIfNeeded(state: GameState): void {
  while (state.historial.length > ECON_CONSTANTS.historialMaxDias) {
    // Find oldest contiguous 7 daily (non-weekly) entries to compact into 1 weekly average (ESTADOS §10)
    const firstDailyIdx = state.historial.findIndex((p) => !p.semanal);
    if (firstDailyIdx !== -1 && firstDailyIdx + 7 <= state.historial.length - 30) {
      const slice = state.historial.slice(firstDailyIdx, firstDailyIdx + 7);
      const avg = (sel: (p: (typeof slice)[number]) => number) =>
        Number((slice.reduce((acc, p) => acc + sel(p), 0) / slice.length).toFixed(1));
      const compacted = {
        dia: slice[slice.length - 1].dia,
        reserva: Math.round(avg((p) => p.reserva)),
        inflacion: avg((p) => p.inflacion),
        satisfaccion: avg((p) => p.satisfaccion),
        apoyo: avg((p) => p.apoyo),
        hambreCritica: avg((p) => p.hambreCritica),
        stockDias: avg((p) => p.stockDias),
        poblacion: Math.round(avg((p) => p.poblacion)),
        semanal: true,
      };
      state.historial.splice(firstDailyIdx, 7, compacted);
    } else {
      state.historial.shift();
    }
  }
}

function advanceDay(state: GameState): void {
  state.reloj.dia += 1;
  state.reloj.anio = Math.floor((state.reloj.dia - 1) / 365) + 1;
  state.reloj.diasEnPeriodo += 1;
  state.eventosDiaActual = [];
  state.auditEntradasDia = 0;
  state.auditSalidasDia = 0;

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;

  applyLeverChanges(state);

  const minHitKeep = state.reloj.dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;
  for (const z of Object.keys(state.golpesPorZonaHistorial) as ZoneId[]) {
    state.golpesPorZonaHistorial[z] = state.golpesPorZonaHistorial[z].filter((d) => d > minHitKeep);
  }

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    npc.modificadores = npc.modificadores
      .map((m) => ({ ...m, diasRestantes: m.diasRestantes - 1 }))
      .filter((m) => m.diasRestantes > 0);

    if (npc.accionIa) {
      npc.accionIa.diasRestantes -= 1;
      if (npc.accionIa.diasRestantes <= 0) {
        const effZone = getEffectiveZone(npc, zonesCount);
        const ended = npc.accionIa;
        npc.accionIa = null;
        resetNpcIdleLocation(npc, state);
        emitSimEvent(state, {
          id: nextSeqId(state, `ev_${state.reloj.dia}`),
          dia: state.reloj.dia,
          tipo: 'accion_fin',
          zona: effZone,
          accion: ended.id,
          npcIds: [npc.id],
          zonaDestino: ended.zonaDestino ?? npc.zona,
          origen: ended.origen,
          causa: ended.causa,
        });
      }
    }
  }
  pruneOrphanedContagions(state, zonesCount);

  if (state.reloj.dia - state.caosTracker.ventanaInicioDia >= state.config.caos.periodoDias) {
    state.caosTracker.ventanaInicioDia = state.reloj.dia;
    state.caosTracker.accionesEnVentana = 0;
  }

  updateServiceCoverage(state);
  handleRolesAndAging(state);
  updateClimate(state);
  runPoliceRelocation(state);
  runDailyEconomyAndNeeds(state);
  pruneOrphanedContagions(state, zonesCount);
  runDailyActionContagion(state, zonesCount);
  updateZoneIntegrity(state, zonesCount);

  let settledThisDay = false;
  if (state.reloj.diasEnPeriodo >= PERIOD_DAYS) {
    runPaydaySettlement(state);
    state.reloj.diasEnPeriodo = 0;
    state.reloj.periodo += 1;
    settledThisDay = true;
  }

  const derived = deriveCommunityStats(state);
  if (settledThisDay) {
    state.metricasPeriodoAnterior = {
      apoyoPct: derived.apoyoPct,
      hambreCriticaPct: derived.hambreCriticaPct,
      poblacion: derived.poblacion,
      satisfaccionMedia: derived.satisfaccionMedia,
    };
  }
  state.caosTracker.respiroActivo =
    derived.satisfaccionMedia < state.config.caos.respiroSiSatisfaccionMediaMenorA;

  checkConditionTriggers(state, derived);
  evaluateObjective(state, derived);

  collectDailyPressFacts(state, derived);
  state.precioAyer = state.alimento.precio;
  state.hambreAyerPct = derived.hambreCriticaPct;
  state.ultimoDineroTotal = computeTotalWorldMoney(state);

  state.historial.push({
    dia: state.reloj.dia,
    reserva: Math.round(state.gobierno.reserva),
    inflacion: state.gobierno.inflacion,
    satisfaccion: derived.satisfaccionMedia,
    apoyo: derived.apoyoPct,
    hambreCritica: derived.hambreCriticaPct,
    stockDias: state.alimento.diasStock,
    poblacion: derived.poblacion,
  });
  compactHistorialIfNeeded(state);
}

export function stepSimulation(state: GameState, ticksToRun: number): GameState {
  if (state.resultado.estado !== 'jugando' || ticksToRun <= 0) return state;

  const startTick = state.reloj.tick;
  const crossesDay =
    Math.floor((startTick + ticksToRun) / TICKS_PER_DAY) > Math.floor(startTick / TICKS_PER_DAY);

  if (!crossesDay) {
    const nextNpcs = state.npcs.map((npc) =>
      npc.vivo
        ? {
            ...npc,
            mapa: {
              ...npc.mapa,
              destino: { ...npc.mapa.destino },
            },
          }
        : npc
    );
    const next: GameState = {
      ...state,
      reloj: {
        ...state.reloj,
        tick: startTick + ticksToRun,
      },
      npcs: nextNpcs,
    };
    stepNpcPositions(next, ticksToRun);
    return next;
  }

  const next = structuredClone(state);
  let remaining = ticksToRun;
  while (remaining > 0 && next.resultado.estado === 'jugando') {
    const remToBoundary = TICKS_PER_DAY - (next.reloj.tick % TICKS_PER_DAY);
    if (remaining >= remToBoundary) {
      next.reloj.tick += remToBoundary;
      stepNpcPositions(next, remToBoundary);
      remaining -= remToBoundary;
      advanceDay(next);
    } else {
      next.reloj.tick += remaining;
      stepNpcPositions(next, remaining);
      remaining = 0;
    }
  }
  return next;
}

export function stepHeadlessDay(state: GameState): void {
  if (state.resultado.estado !== 'jugando') return;
  state.reloj.tick += TICKS_PER_DAY;
  advanceDay(state);
}

function isCauseFromGovernment(state: GameState, startRef?: string): boolean {
  let cursor = startRef;
  const visited = new Set<string>();
  for (let depth = 0; depth < 6 && cursor; depth++) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    if (cursor.startsWith('palanca:')) return true;
    const ev = state.eventos.find((e) => e.id === cursor);
    if (!ev) break;
    if (ev.tipo === 'palanca') return true;
    cursor = ev.causa;
  }
  return false;
}

export function collectDailyPressFacts(state: GameState, preDerived?: CommunityDerived): void {
  const derived = preDerived ?? deriveCommunityStats(state);
  const dia = state.reloj.dia;
  const facts: PressFact[] = [];
  const relMap = PRESS_CONSTANTS.relevanciaPorTema;

  // 1. Notices / Climate
  for (const ev of state.eventosDiaActual) {
    if (ev.tipo === 'aviso') {
      const fen = state.clima.fenomenos.find(
        (f) =>
          f.nombre === ev.fenomeno &&
          (!ev.zonaOrigen || f.origen === ev.zonaOrigen) &&
          f.inicioDia - dia === ev.diasRestantes
      );
      const zona = ev.zonaOrigen ?? ev.zona;
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'aviso',
        relevancia: relMap.aviso,
        obligatoria: true,
        valencia: 'mala',
        esDelGobierno: false,
        zona,
        origen: `clima:${fen?.tipo ?? 'fenomeno'}`,
        causa: ev.id,
        datos: {
          zona,
          fenomeno: ev.fenomeno,
          fenomenoId: fen?.id,
          dias: ev.diasRestantes,
          esAviso: true,
          vigenteHastaDia: fen ? fen.inicioDia + fen.duracionDias : undefined,
        },
      });
    } else if (ev.tipo === 'fenomeno_inicio' || ev.tipo === 'fenomeno_fin') {
      const fen = state.clima.fenomenos.find((f) => f.id === ev.fenomenoId);
      const zona = ev.zonaOrigen ?? ev.zona;
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'clima',
        relevancia: relMap.clima,
        valencia: ev.tipo === 'fenomeno_fin' ? 'buena' : 'mala',
        esDelGobierno: false,
        zona,
        origen: `clima:${fen?.tipo ?? 'fenomeno'}`,
        causa: ev.id,
        datos: {
          zona,
          fenomeno: ev.fenomeno,
          fenomenoId: ev.fenomenoId,
          dias: fen?.duracionDias ?? 0,
          esAviso: ev.tipo === 'fenomeno_inicio' && Boolean(ev.zonaOrigen),
          vigenteHastaDia: fen ? fen.inicioDia + fen.duracionDias : undefined,
        },
      });
    } else if (ev.tipo === 'impago' || ev.tipo === 'impago_fin') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'impago',
        relevancia: relMap.impago,
        valencia: ev.tipo === 'impago_fin' ? 'buena' : 'mala',
        esDelGobierno: true,
        zona: ev.zona,
        origen: ev.tipo === 'impago_fin' ? 'estado:impago_fin' : 'estado:impago',
        causa: ev.id,
        datos: {
          zona: ev.zona,
          cifra: ev.tipo === 'impago' ? `$${ev.faltante}` : '$0',
        },
      });
    } else if (ev.tipo === 'hospital_saturado') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'salud',
        relevancia: relMap.salud,
        valencia: 'mala',
        esDelGobierno: isCauseFromGovernment(state, ev.causa),
        zona: ev.zona,
        origen: 'estado:hospital_saturado',
        causa: ev.id,
        datos: {
          zona: ev.zona,
          cifra: `${ev.ocupacionPct}%`,
        },
      });
    } else if (
      ev.tipo === 'empresa_despido' ||
      ev.tipo === 'empresa_recorte' ||
      ev.tipo === 'empresa_aumento'
    ) {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'empresas',
        relevancia: relMap.empresas,
        valencia: ev.tipo === 'empresa_aumento' ? 'buena' : 'mala',
        esDelGobierno: isCauseFromGovernment(state, ev.causa),
        zona: ev.zona,
        origen: ev.origen,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          empresa: ev.empresaId === 'alimento' ? 'Productora de Alimento' : 'Empresa de Comercio',
          cifra:
            ev.tipo === 'empresa_despido'
              ? `${ev.cantidad} despidos`
              : `${Math.round(ev.factor * 100)}%`,
        },
      });
    } else if (ev.tipo === 'palanca') {
      const rule = LEVER_VALENCIA[ev.palanca];
      let valencia: PressValence = 'neutra';
      if (rule) {
        if (typeof ev.valorAnterior === 'number' && typeof ev.valorNuevo === 'number') {
          valencia = ev.valorNuevo > ev.valorAnterior ? rule.alSubir : rule.alBajar;
        } else if (ev.palanca === 'precio_maximo') {
          valencia = ev.valorNuevo === 'libre' ? 'buena' : 'neutra';
        }
      }
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'gobierno',
        relevancia: relMap.gobierno,
        valencia,
        esDelGobierno: true,
        zona: ev.zona,
        origen: `palanca:${ev.palanca}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          palanca: ev.palanca,
          valorAnterior: String(ev.valorAnterior),
          valorNuevo: String(ev.valorNuevo),
        },
      });
    } else if (ev.tipo === 'victoria' || ev.tipo === 'objetivo_perdido') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'objetivo',
        relevancia: relMap.objetivo,
        obligatoria: true,
        valencia: ev.tipo === 'victoria' ? 'buena' : 'mala',
        esDelGobierno: true,
        zona: ev.zona,
        origen: `objetivo:${ev.tipo}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          cifra: String(ev.valor),
        },
      });
    }
  }

  // 2. Aggregated Zombie attacks (golpe / muerte) per zone
  const attackHitsByZone = new Map<ZoneId, { count: number; evId: string; isGov: boolean }>();
  let pandemicDeaths = 0;
  let pandemicDeathEvId: string | undefined;

  for (const ev of state.eventosDiaActual) {
    if (ev.tipo === 'golpe' && ev.origen?.includes('plaga_zombie')) {
      const prev = attackHitsByZone.get(ev.zona);
      attackHitsByZone.set(ev.zona, {
        count: (prev?.count || 0) + 1,
        evId: prev?.evId || ev.id,
        isGov: prev?.isGov || isCauseFromGovernment(state, ev.causa),
      });
    } else if (ev.tipo === 'muerte') {
      if (ev.causa?.includes('pandemia')) {
        pandemicDeaths++;
        pandemicDeathEvId = pandemicDeathEvId || ev.id;
      } else if (ev.causa?.includes('plaga_zombie')) {
        const prev = attackHitsByZone.get(ev.zona);
        attackHitsByZone.set(ev.zona, {
          count: (prev?.count || 0) + 1,
          evId: prev?.evId || ev.id,
          isGov: prev?.isGov || isCauseFromGovernment(state, ev.causa),
        });
      }
    }
  }

  for (const [zona, info] of attackHitsByZone.entries()) {
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'ataque',
      relevancia: relMap.ataque,
      valencia: 'mala',
      esDelGobierno: info.isGov,
      zona,
      origen: 'clima:plaga_zombie',
      causa: info.evId,
      datos: {
        zona,
        cifra: `${info.count} afectados`,
      },
    });
  }

  if (pandemicDeaths > 0) {
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'salud',
      relevancia: relMap.salud,
      valencia: 'mala',
      esDelGobierno: isCauseFromGovernment(state, pandemicDeathEvId),
      zona: 'centro',
      origen: 'clima:pandemia',
      causa: pandemicDeathEvId,
      datos: {
        zona: 'centro',
        cifra: `${pandemicDeaths} bajas sanitarias`,
      },
    });
  }

  // 3. Conflicts & Neighbors (accion_inicio)
  const conflictByActionZone = new Map<
    string,
    { count: number; zone: ZoneId; evId: string; isGov: boolean }
  >();
  const neighborByActionZone = new Map<string, { count: number; zone: ZoneId; evId: string }>();

  for (const ev of state.eventosDiaActual) {
    if (ev.tipo !== 'accion_inicio') continue;
    const isCond = ev.accion === 'huelga' || ev.accion === 'protesta' || ev.accion === 'saqueo';
    const zone = ev.zonaDestino ?? ev.zona;
    const key = `${ev.accion}|${zone}`;
    if (isCond) {
      const prev = conflictByActionZone.get(key);
      conflictByActionZone.set(key, {
        count: (prev?.count || 0) + ev.npcIds.length,
        zone,
        evId: prev?.evId || ev.id,
        isGov: prev?.isGov || isCauseFromGovernment(state, ev.causa),
      });
    } else {
      const prev = neighborByActionZone.get(key);
      neighborByActionZone.set(key, {
        count: (prev?.count || 0) + ev.npcIds.length,
        zone,
        evId: prev?.evId || ev.id,
      });
    }
  }

  for (const [key, info] of conflictByActionZone.entries()) {
    const accionId = key.split('|')[0];
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'conflicto',
      relevancia: relMap.conflicto,
      valencia: 'mala',
      esDelGobierno: info.isGov,
      zona: info.zone,
      origen: `accion:${accionId}`,
      causa: info.evId,
      datos: {
        zona: info.zone,
        cifra: `${info.count}`,
      },
    });
  }

  for (const [key, info] of neighborByActionZone.entries()) {
    const accionId = key.split('|')[0];
    const isOdd = [
      'cavar_pozo',
      'coleccionar_piedras',
      'hablar_con_gallinas',
      'sermon_apocaliptico',
    ].includes(accionId);
    if (info.count >= 3 || isOdd) {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'vecinos',
        relevancia: relMap.vecinos,
        valencia: 'neutra',
        esDelGobierno: false,
        zona: info.zone,
        origen: `accion:${accionId}`,
        causa: info.evId,
        datos: {
          zona: info.zone,
          cifra: `${info.count}`,
        },
      });
    }
  }

  // 4. Hunger surge & sharp food price swing
  if (
    derived.hambreCriticaPct >= PRESS_CONSTANTS.hambreSubaUmbralPct &&
    derived.hambreCriticaPct > state.hambreAyerPct + 1.5
  ) {
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'hambre',
      relevancia: relMap.hambre,
      valencia: 'mala',
      esDelGobierno: Boolean(state.ultimaCausaPalanca),
      zona: 'centro',
      origen: 'estado:hambre_critica',
      causa: state.ultimoEventoClimaId || state.ultimaCausaPalanca,
      datos: {
        zona: 'centro',
        cifra: `${derived.hambreCriticaPct.toFixed(1)}%`,
      },
    });
  }

  if (state.precioAyer > 0) {
    const priceDeltaPct = ((state.alimento.precio - state.precioAyer) / state.precioAyer) * 100;
    if (Math.abs(priceDeltaPct) >= PRESS_CONSTANTS.precioCambioFuertePct) {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'precio',
        relevancia: relMap.precio,
        valencia: priceDeltaPct > 0 ? 'mala' : 'buena',
        esDelGobierno: Boolean(state.ultimaCausaPalanca),
        zona: 'centro',
        origen: 'economia:precio',
        causa: state.ultimaCausaPalanca || state.ultimoEventoClimaId,
        datos: {
          zona: 'centro',
          cifra: `$${state.alimento.precio.toFixed(2)}`,
        },
      });
    }
  }

  state.colaHechosDia = facts
    .filter((f) => f.obligatoria || f.relevancia >= PRESS_CONSTANTS.relevanciaMin)
    .sort((a, b) => b.relevancia - a.relevancia)
    .slice(0, 20);
}

export interface PlannedPressPublication {
  medio: GameState['medios'][number];
  autor: Npc;
  fact: PressFact;
  tono: NewsTone;
  templateTitulo: string;
  templateTexto: string;
  zoneNorm: ZoneId;
}

function interpolateTemplate(
  raw: string,
  medioNombre: string,
  autorNombre: string,
  fact: PressFact
): string {
  const d = fact.datos;
  return raw
    .replaceAll('{medio}', medioNombre)
    .replaceAll('{autor}', autorNombre)
    .replaceAll('{zona}', d.zona ?? fact.zona ?? 'centro')
    .replaceAll('{fenomeno}', d.fenomeno ?? 'fenómeno climático')
    .replaceAll('{dias}', d.dias !== undefined ? String(d.dias) : '0')
    .replaceAll('{cifra}', d.cifra ?? '0')
    .replaceAll('{empresa}', d.empresa ?? 'la empresa')
    .replaceAll('{palanca}', d.palanca ?? 'medida')
    .replaceAll('{valor_anterior}', d.valorAnterior ?? '')
    .replaceAll('{valor_nuevo}', d.valorNuevo ?? '');
}

function drawPressToneForFact(
  medio: GameState['medios'][number],
  fact: PressFact,
  rng: { rngState: number }
): NewsTone {
  const aff = medio.lineaEditorial.afinidadGobierno / 100;
  const sens = medio.lineaEditorial.sensacionalismo / 100;
  const base = PRESS_CONSTANTS.pesosTonoBase;

  const weights: Array<{ tone: NewsTone; w: number }> = [
    {
      tone: 'neutral',
      w: base.neutral,
    },
    {
      tone: 'alarmista',
      w: base.alarmista * (1 + sens * 1.6) * (fact.valencia === 'mala' ? 1.8 : 0.2),
    },
    {
      tone: 'critico',
      w:
        base.critico *
        (1 + (1 - aff) * 1.5) *
        (fact.valencia === 'mala' ? 1.5 : 0.3) *
        (fact.esDelGobierno ? 1.6 : 0.7),
    },
    {
      tone: 'favorable',
      w:
        base.favorable *
        (1 + aff * 1.5) *
        (fact.valencia === 'buena' ? 1.7 : fact.valencia === 'neutra' ? 0.8 : 0.2) *
        (fact.esDelGobierno ? 1.4 : 0.9),
    },
  ];

  const availableTemplates = NEWS_TEMPLATES[fact.tema] || {};
  const total = weights.reduce((acc, item) => acc + item.w, 0);
  let r = drawRand(rng) * Math.max(0.001, total);
  let chosen: NewsTone = 'neutral';
  for (const item of weights) {
    r -= item.w;
    if (r <= 0) {
      chosen = item.tone;
      break;
    }
  }
  if (!availableTemplates[chosen] || availableTemplates[chosen]!.length === 0) {
    return 'neutral';
  }
  return chosen;
}

export function planDailyPressPublications(
  state: GameState,
  rng: { rngState: number } = state
): PlannedPressPublication[] {
  if (state.medios.length === 0 || state.colaHechosDia.length === 0) return [];
  const planned: PlannedPressPublication[] = [];
  const sensTopics = new Set<NewsTopic>(['ataque', 'conflicto', 'hambre', 'vecinos']);

  for (const medio of state.medios) {
    const livingCols = medio.columnistas
      .map((id) => state.npcs.find((n) => n.id === id && n.vivo))
      .filter((n): n is Npc => Boolean(n));
    if (livingCols.length === 0) continue;

    const capacity = livingCols.length * PRESS_CONSTANTS.noticiasPorColumnista;
    const mandatory = state.colaHechosDia.filter((f) => f.obligatoria);
    const optionalPool = [...state.colaHechosDia.filter((f) => !f.obligatoria)];
    const chosenFacts: PressFact[] = [...mandatory];

    let slotsLeft = Math.max(0, capacity - mandatory.length);
    while (slotsLeft > 0 && optionalPool.length > 0) {
      const weights = optionalPool.map((f) => {
        const zoneNorm = f.datos.zona ?? f.zona ?? 'centro';
        const sensBoost = sensTopics.has(f.tema)
          ? 1 + (medio.lineaEditorial.sensacionalismo / 100) * 0.85
          : 1;
        const recentlyCovered =
          state.noticias.some(
            (n) =>
              n.tema === f.tema &&
              (n.zonaOrigen ?? n.zona ?? 'centro') === zoneNorm &&
              state.reloj.dia - n.dia <= PRESS_CONSTANTS.ventanaRepeticionDias
          ) ||
          chosenFacts.some((cf) => cf.tema === f.tema && (cf.datos.zona ?? cf.zona) === zoneNorm);
        const repMult = recentlyCovered ? PRESS_CONSTANTS.factorRepeticionPeso : 1;
        return Math.max(1, f.relevancia * sensBoost * repMult);
      });

      const totalW = weights.reduce((acc, w) => acc + w, 0);
      let r = drawRand(rng) * Math.max(0.001, totalW);
      let pickIdx = optionalPool.length - 1;
      for (let i = 0; i < optionalPool.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          pickIdx = i;
          break;
        }
      }
      chosenFacts.push(optionalPool.splice(pickIdx, 1)[0]);
      slotsLeft--;
    }

    for (const fact of chosenFacts) {
      const autor = livingCols[Math.floor(drawRand(rng) * livingCols.length)];
      const tono = drawPressToneForFact(medio, fact, rng);
      const variants =
        NEWS_TEMPLATES[fact.tema]?.[tono] ||
        NEWS_TEMPLATES[fact.tema]?.neutral || [
          {
            titulo: `Actualidad en {zona}`,
            texto: `{autor} reporta desde {medio} las novedades de la jornada.`,
          },
        ];
      const variant = variants[Math.floor(drawRand(rng) * variants.length)];
      const zoneNorm = fact.datos.zona ?? fact.zona ?? 'centro';

      planned.push({
        medio,
        autor,
        fact,
        tono,
        templateTitulo: interpolateTemplate(variant.titulo, medio.nombre, autor.nombre, fact),
        templateTexto: interpolateTemplate(variant.texto, medio.nombre, autor.nombre, fact),
        zoneNorm,
      });
    }
  }

  return planned;
}

function describeSimEvent(ev: SimEvent, state: GameState): CausalStep {
  const npcName = (id?: string) => state.npcs.find((n) => n.id === id)?.nombre || id || 'habitante';
  switch (ev.tipo) {
    case 'palanca':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Decisión del gobernador: ${ev.palanca}`,
        detalle: `Cambió de ${ev.valorAnterior} a ${ev.valorNuevo}.`,
      };
    case 'fenomeno_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Inicio de ${ev.fenomeno}`,
        detalle: ev.zonaOrigen ? `Ingreso por zona ${ev.zonaOrigen}.` : 'Afecta a toda la comunidad.',
      };
    case 'fenomeno_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Fin de ${ev.fenomeno}`,
        detalle: 'Concluye el fenómeno climático.',
      };
    case 'aviso':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Aviso de ${ev.fenomeno}`,
        detalle: `Origen ${ev.zonaOrigen ?? ev.zona} · Faltan ${ev.diasRestantes} días.`,
      };
    case 'ataque':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: ev.resultado === 'repelido' ? `Ataque repelido en ${ev.zona}` : `Ataque atravesó defensa hacia ${ev.zonaDestino}`,
        detalle: ev.npcId ? `Objetivo: ${npcName(ev.npcId)}.` : `Origen ${ev.zonaOrigen ?? ev.zona}.`,
      };
    case 'golpe':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Golpe a ${npcName(ev.npcId)} (-${ev.dano} salud)`,
        detalle: `Zona ${ev.zona} · Origen ${ev.origen ?? 'fenómeno'}.`,
      };
    case 'muerte':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Fallecimiento de ${npcName(ev.npcId)}`,
        detalle: ev.esperandoCama ? 'Esperaba cama en hospital.' : `Zona ${ev.zona}.`,
      };
    case 'internacion':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Internación de ${npcName(ev.npcId)}`,
        detalle: 'Ingresó al hospital del Centro Cívico.',
      };
    case 'alta':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Alta médica de ${npcName(ev.npcId)}`,
        detalle: 'Recuperó salud suficiente para volver a su rutina.',
      };
    case 'hospital_saturado':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Hospital saturado (${ev.ocupacionPct}%)`,
        detalle: 'Demanda de camas superior a la capacidad médica activa.',
      };
    case 'impago':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: ev.alcanzaNomina ? 'Impago de nómina pública' : 'Impago de gastos discrecionales',
        detalle: `Faltante fiscal de $${ev.faltante}.`,
      };
    case 'impago_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Fin de impago fiscal',
        detalle: 'La liquidación cubrió los gastos obligatorios sin faltante.',
      };
    case 'empresa_aumento':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Empresa ${ev.empresaId}: aumento salarial`,
        detalle: `El factor salarial subió a ${Math.round(ev.factor * 100)}%.`,
      };
    case 'empresa_recorte':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Empresa ${ev.empresaId}: recorte salarial`,
        detalle: `Las ventas redujeron el factor salarial a ${Math.round(ev.factor * 100)}%.`,
      };
    case 'empresa_despido':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Empresa ${ev.empresaId}: ${ev.cantidad} despido(s)`,
        detalle: `Factor salarial cayó a ${Math.round(ev.factor * 100)}% bajo el piso.`,
      };
    case 'noticia':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Noticia en ${ev.medio}: ${ev.titulo}`,
        detalle: `Tema: ${ev.tema}.`,
      };
    case 'accion_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcIds[0],
        titulo: `Acción colectiva: ${ev.accion}`,
        detalle: `${ev.npcIds.length} participante(s) en zona ${ev.zonaDestino}.`,
      };
    case 'accion_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Fin de acción: ${ev.accion}`,
        detalle: `Zona ${ev.zona}.`,
      };
    case 'reubicacion':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Reubicación policial (${ev.npcs.length})`,
        detalle: `Desplazados de ${ev.deZona} hacia ${ev.aZona}.`,
      };
    case 'defensa':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Defensa en ${ev.zona}: ${ev.valor}`,
        detalle: 'Ajuste de capacidad defensiva zonal.',
      };
    case 'orden':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Orden en ${ev.zona}: ${ev.valor}%`,
        detalle: 'Capacidad policial dedicada al control del caos espontáneo.',
      };
    case 'integridad':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Integridad en ${ev.zona}: ${ev.valor}%`,
        detalle: 'Estado estructural de la zona.',
      };
    case 'victoria':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Hito de objetivo cumplido',
        detalle: `${ev.metrica} alcanzó ${ev.valor}.`,
      };
    case 'objetivo_perdido':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Objetivo de mandato perdido',
        detalle: `${ev.metrica} cerró el plazo en ${ev.valor}.`,
      };
    case 'fin_partida':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Fin de partida por derrota',
        detalle: `${ev.metrica} = ${ev.valor}.`,
      };
  }
}

export function buildCausalChain(
  state: GameState,
  startRef?: string,
  fallbackText?: string
): CausalStep[] {
  const chain: CausalStep[] = [];
  const visited = new Set<string>();
  let cursor = startRef;

  for (let depth = 0; depth < 5 && cursor; depth++) {
    if (visited.has(cursor)) break;
    visited.add(cursor);

    const matchedEv = state.eventos.find((e) => e.id === cursor);
    if (matchedEv) {
      chain.unshift(describeSimEvent(matchedEv, state));
      cursor = matchedEv.causa;
      continue;
    }

    if (cursor.startsWith('noticia:')) {
      const newsId = cursor.slice('noticia:'.length);
      const art = state.noticias.find((n) => n.id === newsId);
      if (art) {
        chain.unshift({
          id: art.id,
          dia: art.dia,
          tipo: 'noticia',
          zona: art.zonaOrigen,
          titulo: `${art.medioNombre}: "${art.titulo}"`,
          detalle: `${art.tema} (${art.tono}) · Alcance ${Math.round(art.alcance)}%`,
        });
        cursor = art.causa;
        continue;
      }
    }

    if (cursor.startsWith('clima:')) {
      const tipo = cursor.slice('clima:'.length);
      chain.unshift({
        id: cursor,
        dia: state.reloj.dia,
        tipo: 'clima',
        titulo: `Fenómeno climático (${tipo})`,
        detalle: fallbackText || 'Factor ambiental o sanitario del valle.',
      });
      break;
    }

    if (cursor.startsWith('palanca:')) {
      chain.unshift({
        id: cursor,
        dia: state.reloj.dia,
        tipo: 'palanca',
        titulo: `Decisión de gobierno (${cursor.slice('palanca:'.length)})`,
        detalle: fallbackText || 'Ajuste de palancas del despacho.',
      });
      break;
    }

    chain.unshift({
      id: cursor,
      dia: state.reloj.dia,
      tipo: 'origen',
      titulo: cursor,
      detalle: fallbackText || 'Causa registrada por el motor.',
    });
    break;
  }

  if (chain.length === 0 && fallbackText) {
    chain.push({
      id: 'root_fallback',
      dia: state.reloj.dia,
      tipo: 'sistema',
      titulo: 'Hecho registrado',
      detalle: fallbackText,
    });
  }

  return chain;
}
