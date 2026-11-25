import {
  ACTION_TABLE,
  DISTRICTS,
  ECON_CONSTANTS,
  EFFECT_CATALOG,
  FISCAL_PERIOD_DAYS,
  FOREIGN_TRADE_STEPS,
  LEVER_BOUNDS,
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
  EnterpriseResponseType,
  EventLogEntry,
  ForeignTradeStep,
  GameState,
  ModifiableKey,
  Modifier,
  NewsArticle,
  NewsTone,
  Npc,
  NpcVariable,
  ObjectiveCondition,
  PersonalityTrait,
  PhenomenonType,
  PriceCapMode,
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
  state?: { rngState: number }
): string {
  const pool = action.textos && action.textos.length > 0 ? action.textos : [`{nombre}: ${action.nombre}`];
  const tpl = pool[Math.floor(drawRand(state) * pool.length)];
  return tpl.replace('{nombre}', npcName);
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

      const copyText = pickActionText(action, other.nombre, state);
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
  let score = 50;
  for (const [trait, dir] of Object.entries(action.afinidad)) {
    const val = getEffectiveTrait(npc, trait as PersonalityTrait);
    score += dir === '+' ? val * 0.5 : (100 - val) * 0.5;
  }
  return Math.max(5, score);
}

export function selectCandidateActions(npc: Npc, state?: GameState): ActionDefinition[] {
  const valid = ACTION_TABLE.filter((a) => {
    if (a.tipo !== 'espontanea') return false;
    if (!isNpcEligibleForAction(npc, a, state)) return false;
    if (state && hasOutOfPostEffect(a) && !canRoleLeavePost(state, npc.rol)) return false;
    return true;
  });
  return valid
    .map((a) => ({ a, w: scoreActionAffinity(npc, a) + drawRand(state) * 25 }))
    .sort((x, y) => y.w - x.w)
    .slice(0, ECON_CONSTANTS.candidatasPorDecision)
    .map((x) => x.a);
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

  const scored = eligible.map((n) => {
    const interest =
      getEffectiveTrait(n, 'rebeldia') * 0.6 +
      (100 - n.variables.satisfaccion) * 0.4 +
      n.modificadores.length * 12 +
      drawRand(state) * 35;
    return { n, interest };
  });
  scored.sort((a, b) => b.interest - a.interest);
  const topPool = scored.slice(0, Math.min(6, scored.length));
  return topPool[Math.floor(drawRand(state) * topPool.length)].n;
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
    const text = pickActionText(action, npc.nombre, state);
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

  const enrichedArticle: NewsArticle = {
    ...article,
    credibilidad: article.credibilidad ?? medio.credibilidad,
    causa: inferredCause,
  };

  const newsEvId = nextSeqId(state, `ev_n_${state.reloj.dia}`);
  emitSimEvent(state, {
    id: newsEvId,
    dia: state.reloj.dia,
    tipo: 'noticia',
    zona: enrichedArticle.zonaOrigen ?? 'centro',
    noticiaId: enrichedArticle.id,
    medio: medio.nombre,
    tema: enrichedArticle.tema,
    titulo: enrichedArticle.titulo,
    causa: inferredCause,
  });

  const recentSameTopic = state.noticias.filter(
    (n) => n.tema === enrichedArticle.tema && state.reloj.dia - n.dia <= 10
  ).length;
  const repetitionDamp = Math.max(0.3, 1 - recentSameTopic * 0.25);
  const impactScale = (medio.alcancePct / 100) * (medio.credibilidad / 100) * repetitionDamp;

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

  const afecta: Partial<Record<PersonalityTrait | NpcVariable, number>> = {};
  if (enrichedArticle.tono === 'alarmista') {
    afecta.miedo = Math.round(10 * impactScale);
    afecta.lealtad = -Math.round(5 * impactScale);
  } else if (enrichedArticle.tono === 'critico') {
    afecta.lealtad = -Math.round(9 * impactScale);
    afecta.rebeldia = Math.round(6 * impactScale);
  } else if (enrichedArticle.tono === 'favorable') {
    afecta.lealtad = Math.round(8 * impactScale);
    afecta.miedo = -Math.round(4 * impactScale);
  } else {
    afecta.miedo = Math.round(2 * impactScale);
  }

  for (const npc of sortedConsumers) {
    applyModifierToNpc(
      npc,
      {
        afecta,
        duracionDias: 4,
        origen: `noticia:${enrichedArticle.id}`,
        causa: newsEvId,
        texto: `Leyó "${enrichedArticle.titulo}" en ${medio.nombre}`,
      },
      state
    );
  }

  state.noticias.unshift(enrichedArticle);
  if (state.noticias.length > 50) state.noticias.length = 50;
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

function estimateWorkerFloorPeriodCost(workers: Npc[], state: GameState): number {
  const piso = ECON_CONSTANTS.pisoSueldoPct / 100;
  let sumBaseDia = 0;
  for (const w of workers) {
    const def = ROLE_CATALOG[w.rol];
    if (!def.ingreso) continue;
    const [minI, maxI] = def.ingreso;
    const prod = Math.max(0.2, getNpcProductivity(w, state));
    sumBaseDia += (minI + w.economia.ingresoPos * (maxI - minI)) * prod;
  }
  return sumBaseDia * piso * ECON_CONSTANTS.periodoPagoDias;
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

  const effectiveObreroCap = Math.round(preset.topesPrivados.obrero * popScale);

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

  // Enterprise gradual layoffs while respuesta === 'despedir' (ESTADOS §4)
  if (state.empresas.alimento.respuesta?.tipo === 'despedir') {
    const ent = state.empresas.alimento;
    const workers = state.npcs.filter(
      (n) => n.vivo && (n.rol === 'agricultor' || n.rol === 'tecnico')
    );
    const estFloorPayroll = estimateWorkerFloorPeriodCost(workers, state);
    if (estFloorPayroll > ent.ultimoIngresoPeriodo + 0.5 && workers.length > 0) {
      let cutsLeft = ECON_CONSTANTS.maxPaseDesempleoPorDia;
      const pool = [...workers];
      while (cutsLeft > 0 && pool.length > 0) {
        const currentCost = estimateWorkerFloorPeriodCost(pool, state);
        if (currentCost <= ent.ultimoIngresoPeriodo + 0.5) break;
        const idx = Math.floor(drawRand(state) * pool.length);
        const target = pool.splice(idx, 1)[0];
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
            causa: ent.respuesta?.causa,
            texto: 'Despedido por déficit de alimento',
            recordOnNpc: true,
          },
          state
        );
        cutsLeft--;
      }
    }
  }

  if (state.empresas.comercio.respuesta?.tipo === 'despedir') {
    const ent = state.empresas.comercio;
    const workers = state.npcs.filter((n) => n.vivo && n.rol === 'obrero');
    const estFloorPayroll = estimateWorkerFloorPeriodCost(workers, state);
    if (estFloorPayroll > ent.ultimoIngresoPeriodo + 0.5 && workers.length > 0) {
      let cutsLeft = ECON_CONSTANTS.maxPaseDesempleoPorDia;
      const pool = [...workers];
      while (cutsLeft > 0 && pool.length > 0) {
        const currentCost = estimateWorkerFloorPeriodCost(pool, state);
        if (currentCost <= ent.ultimoIngresoPeriodo + 0.5) break;
        const idx = Math.floor(drawRand(state) * pool.length);
        const target = pool.splice(idx, 1)[0];
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
            causa: ent.respuesta?.causa,
            texto: 'Despedido por déficit de comercio',
            recordOnNpc: true,
          },
          state
        );
        cutsLeft--;
      }
    }
  }

  const foodFrozen = state.empresas.alimento.respuesta !== null;
  const comFrozen = state.empresas.comercio.respuesta !== null;

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

    if (npc.rol === 'desempleado' && state.reloj.dia % 3 === 0) {
      const candidateRoles: Array<{ rol: RoleId; score: number }> = [];

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

      for (const privRole of PRIVATE_ROLES) {
        if (foodFrozen && (privRole === 'agricultor' || privRole === 'tecnico' || privRole === 'empresario')) {
          continue;
        }
        if (comFrozen && (privRole === 'obrero' || privRole === 'comerciante')) {
          continue;
        }
        const cap =
          privRole === 'obrero'
            ? effectiveObreroCap
            : privRole === 'empresario'
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

  // Adults fill vacant public roles and vacant critical private roles (e.g. empresario) by affinity
  if (state.reloj.dia % 3 === 0) {
    let transfersLeft = 2;
    const targetRoles: RoleId[] = [
      ...PUBLIC_ROLES,
      ...(!foodFrozen && counts.empresario < Math.max(1, preset.topesPrivados.empresario)
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

function settleSingleEnterprise(
  state: GameState,
  ent: {
    id: string;
    ingresosAcum: number;
    sueldosAcum: number;
    diasPeriodo: number;
    ultimaGanancia: number;
    ultimoIngresoPeriodo: number;
    ultimoSueldosPeriodo: number;
    respuesta: GameState['empresas']['alimento']['respuesta'];
  },
  isFoodEnterprise: boolean,
  vivos: Npc[],
  taxRate: number
): number {
  const gananciaBruta = ent.ingresosAcum - ent.sueldosAcum;
  ent.ultimoIngresoPeriodo = Number(ent.ingresosAcum.toFixed(1));
  ent.ultimoSueldosPeriodo = Number(ent.sueldosAcum.toFixed(1));
  ent.ingresosAcum = 0;
  ent.sueldosAcum = 0;
  ent.diasPeriodo = 0;

  const duenoNpc = isFoodEnterprise
    ? state.empresas.alimento.dueno
      ? vivos.find((n) => n.id === state.empresas.alimento.dueno) || null
      : null
    : null;
  const sociosNpcs = isFoodEnterprise ? [] : vivos.filter((n) => n.rol === 'comerciante');

  if (gananciaBruta >= 0) {
    ent.ultimaGanancia = Number(gananciaBruta.toFixed(1));
    const tax = gananciaBruta * (taxRate / 100);
    const netProfit = gananciaBruta - tax;
    if (isFoodEnterprise) {
      if (duenoNpc) {
        duenoNpc.economia.dinero += netProfit;
        duenoNpc.economia.ultimoIngresoNeto = Number(
          (netProfit / ECON_CONSTANTS.periodoPagoDias).toFixed(2)
        );
      }
    } else if (sociosNpcs.length > 0) {
      const share = netProfit / sociosNpcs.length;
      const dailyShare = Number((share / ECON_CONSTANTS.periodoPagoDias).toFixed(2));
      for (const socio of sociosNpcs) {
        socio.economia.dinero += share;
        socio.economia.ultimoIngresoNeto = dailyShare;
      }
    }
    return tax;
  }

  // Negative profit -> deterministic response rule (ESTADOS §4)
  const deficit = Math.abs(gananciaBruta);
  const employees = isFoodEnterprise
    ? vivos.filter((n) => n.rol === 'agricultor' || n.rol === 'tecnico')
    : vivos.filter((n) => n.rol === 'obrero');

  const piso = ECON_CONSTANTS.pisoSueldoPct / 100;
  const neededFactor =
    ent.ultimoSueldosPeriodo > 0.01 ? ent.ultimoIngresoPeriodo / ent.ultimoSueldosPeriodo : 0;
  const chosen: EnterpriseResponseType =
    neededFactor >= piso || employees.length === 0 ? 'recortar_sueldos' : 'despedir';
  const factorSueldo = clamp(neededFactor, piso, 1);

  const origen = `empresa:${ent.id}/respuesta`;
  const causa = state.ultimaCausaPalanca || state.ultimoEventoClimaId;
  const evId = nextSeqId(state, `ev_${state.reloj.dia}`);
  state.ultimoEventoEmpresaId = evId;

  const repNpc = duenoNpc || sociosNpcs[0] || null;

  emitSimEvent(state, {
    id: evId,
    dia: state.reloj.dia,
    tipo: 'empresa_respuesta',
    zona: repNpc?.zona ?? 'centro',
    empresaId: ent.id,
    duenoId: duenoNpc ? duenoNpc.id : sociosNpcs[0]?.id ?? null,
    respuesta: chosen,
    deficit: Number(deficit.toFixed(1)),
    origen,
    causa,
  });

  ent.ultimaGanancia = 0;
  if (duenoNpc) duenoNpc.economia.ultimoIngresoNeto = 0;
  for (const socio of sociosNpcs) socio.economia.ultimoIngresoNeto = 0;

  if (chosen === 'recortar_sueldos') {
    ent.respuesta = {
      tipo: 'recortar_sueldos',
      diasRestantes: ECON_CONSTANTS.diasRespuestaEmpresa,
      duracionTotal: ECON_CONSTANTS.diasRespuestaEmpresa,
      factorSueldo: Number(factorSueldo.toFixed(3)),
      origen,
      causa: evId,
    };
  } else {
    const pool = [...employees];
    let cutsLeft = ECON_CONSTANTS.maxPaseDesempleoPorDia;
    while (cutsLeft > 0 && pool.length > 0) {
      const currentCost = estimateWorkerFloorPeriodCost(pool, state);
      if (currentCost <= ent.ultimoIngresoPeriodo + 0.5) break;
      const idx = Math.floor(drawRand(state) * pool.length);
      const target = pool.splice(idx, 1)[0];
      target.rol = 'desempleado';
      target.mapa.accion = 'buscando trabajo';
      target.mapa.destino = getDistrictPosition('desempleado', state);
      applyInstantModifierToNpc(
        target,
        {
          afecta: { satisfaccion: -8 },
          origen,
          causa: evId,
          texto: `Despedido por déficit de ${ent.id}`,
          recordOnNpc: true,
        },
        state
      );
      cutsLeft--;
    }
    ent.respuesta = {
      tipo: 'despedir',
      diasRestantes: ECON_CONSTANTS.diasRespuestaEmpresa,
      duracionTotal: ECON_CONSTANTS.diasRespuestaEmpresa,
      factorSueldo: piso,
      origen,
      causa: evId,
    };
  }

  addLog(
    state,
    'economia',
    origen,
    `Empresa ${ent.id}: ${chosen.replace('_', ' ')}`,
    `Déficit de $${deficit.toFixed(1)} en el cierre semanal; responde con ${chosen.replace('_', ' ')}.`,
    causa,
    evId
  );

  return 0;
}

function settleEnterprises(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const taxRate = state.gobierno.palancasVigentes.impuesto;

  const foodEnt = state.empresas.alimento;
  foodEnt.diasPeriodo += 1;
  if (foodEnt.respuesta) {
    foodEnt.respuesta.diasRestantes -= 1;
    if (foodEnt.respuesta.diasRestantes <= 0) {
      foodEnt.respuesta = null;
    }
  }
  if (foodEnt.diasPeriodo >= ECON_CONSTANTS.periodoPagoDias) {
    const netTax = settleSingleEnterprise(state, foodEnt, true, vivos, taxRate);
    state.gobierno.acumuladoPeriodo.impuestos += netTax;
  }

  const comEnt = state.empresas.comercio;
  comEnt.diasPeriodo += 1;
  if (comEnt.respuesta) {
    comEnt.respuesta.diasRestantes -= 1;
    if (comEnt.respuesta.diasRestantes <= 0) {
      comEnt.respuesta = null;
    }
  }
  if (comEnt.diasPeriodo >= ECON_CONSTANTS.periodoPagoDias) {
    const netTax = settleSingleEnterprise(state, comEnt, false, vivos, taxRate);
    state.gobierno.acumuladoPeriodo.impuestos += netTax;
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

  // Enforce warehouse silo cap after production (ESTADOS §4)
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

  // 2. Foreign Trade (comercioExterior, ESTADOS §12)
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
      state.alimento.stock = Math.min(maxSiloStock, state.alimento.stock + units);
      importacionesDia = units * purchaseUnitPrice;
      state.gobierno.reserva = Number(Math.max(0, state.gobierno.reserva - importacionesDia).toFixed(1));
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
        state.empresas.alimento.ingresosAcum += exportRevenue;
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

  // 4. Pantry rebuy & Payment (ESTADOS §4 & §12)
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
    const objetivo = clamp(
      ECON_CONSTANTS.objetivoBaseDias *
        (1 + ECON_CONSTANTS.kPrudenciaDespensa * (1 - valNorm) + ECON_CONSTANTS.kMiedoDespensa * miedoNorm) +
        acaparaExtra,
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

  let garantiaAlimentariaDia = 0;
  let paidFoodMoney = 0;
  const garantiaPct = pal.garantiaAlimentaria / 100;
  const prorrateoSec = state.gobierno.finanzas.impago
    ? clamp(state.gobierno.finanzas.prorrateoPensionGarantia ?? 1, 0, 1)
    : 1;

  for (const npc of vivos) {
    const desired = desiredMap.get(npc.id) || 0;
    if (desired <= 0) continue;
    const allocated = desired * stockShareRatio;
    const cost = allocated * precioAlimento;
    const stage = getStage(npc.edad);
    let paidUnits = 0;

    if (stage === 'menor') {
      // Minors food is ALWAYS 100% covered by the state (ESTADOS §12)
      garantiaAlimentariaDia += cost;
      paidUnits = allocated;
      paidFoodMoney += cost;
    } else if (npc.economia.dinero >= cost) {
      npc.economia.dinero -= cost;
      paidUnits = allocated;
      paidFoodMoney += cost;
    } else {
      npc.economia.noPudoPagarComida = true;
      const faltante = Math.max(0, cost - npc.economia.dinero);
      const cubiertoFull = faltante * garantiaPct;
      const cubiertoPaid = cubiertoFull * prorrateoSec;
      garantiaAlimentariaDia += cubiertoFull;
      const pagoTotal = npc.economia.dinero + cubiertoPaid;
      npc.economia.dinero = 0;
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

  // Credit paid food revenue to comercio (margin) and food enterprise (rest) (ESTADOS §4)
  if (paidFoodMoney > 0) {
    const toComercio = paidFoodMoney * (ECON_CONSTANTS.margenComercialPct / 100);
    state.empresas.comercio.ingresosAcum += toComercio;
    state.empresas.alimento.ingresosAcum += paidFoodMoney - toComercio;
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

  // 7. Incomes, Taxes, Wages to Enterprises, Ayuda Social & Living Expenses
  const salarioPublicoDia = ECON_CONSTANTS.salarioBasePublico * (pal.salarioPublico / 100);
  const pisoSueldo = ECON_CONSTANTS.pisoSueldoPct / 100;
  const foodWageFactor = state.empresas.alimento.respuesta
    ? clamp(state.empresas.alimento.respuesta.factorSueldo, pisoSueldo, 1)
    : 1;
  const comWageFactor = state.empresas.comercio.respuesta
    ? clamp(state.empresas.comercio.respuesta.factorSueldo, pisoSueldo, 1)
    : 1;

  let impuestosDia = 0;
  let nominaDia = 0;
  let pensionesDia = 0;
  let ayudaSocialDia = 0;
  let livingPoolDomestico = 0;
  const inflDiaria = mod === 'fiscal' ? state.gobierno.inflacion / 100 / 365 : 0;
  const poderAdquisitivo: Record<string, number> = {};
  const ayudaRecibidaByNpc: Record<string, number> = {};

  const prorrateoNomina = state.gobierno.finanzas.impago
    ? clamp(state.gobierno.finanzas.prorrateoNomina ?? 1, 0, 1)
    : 1;
  const prorrateoDisc = state.gobierno.finanzas.impago
    ? clamp(state.gobierno.finanzas.prorrateoDiscrecional ?? 1, 0, 1)
    : 1;

  for (const npc of vivos) {
    const def = ROLE_CATALOG[npc.rol];
    const taxRate = getTaxRateForNpc(npc, state);
    let bruto = 0;
    const isOwner = npc.rol === 'empresario' || npc.rol === 'comerciante';

    if (def.publico) {
      nominaDia += salarioPublicoDia;
      bruto = salarioPublicoDia * prorrateoNomina;
    } else if (npc.rol === 'jubilado') {
      pensionesDia += ECON_CONSTANTS.pensionBase;
      bruto = ECON_CONSTANTS.pensionBase * prorrateoSec;
    } else if (!isOwner && def.ingreso && !npc.hospital.internado) {
      const prod = getNpcProductivity(npc, state);
      const [minI, maxI] = def.ingreso;
      const baseWage = (minI + npc.economia.ingresoPos * (maxI - minI)) * prod;

      if (npc.rol === 'agricultor' || npc.rol === 'tecnico') {
        bruto = baseWage * foodWageFactor;
        state.empresas.alimento.sueldosAcum += bruto;
      } else if (npc.rol === 'obrero') {
        bruto = baseWage * comWageFactor;
        state.empresas.comercio.sueldosAcum += bruto;
      } else {
        // periodista (simplified private media model)
        bruto = baseWage;
      }
    }

    if (!isOwner) {
      const impuesto = bruto * (taxRate / 100);
      const neto = bruto - impuesto;
      impuestosDia += impuesto;
      npc.economia.ultimoIngresoNeto = Number(neto.toFixed(2));
      npc.economia.dinero = Math.max(0, npc.economia.dinero * (1 - inflDiaria) + neto);
    } else {
      npc.economia.dinero = Math.max(0, npc.economia.dinero * (1 - inflDiaria));
    }

    // Ayuda social -> desempleados y jubilados (GOBERNADOR §4, ESTADOS §12)
    if ((npc.rol === 'desempleado' || npc.rol === 'jubilado') && pal.ayudaSocial > 0) {
      ayudaSocialDia += pal.ayudaSocial;
      const paidAyuda = pal.ayudaSocial * prorrateoDisc;
      npc.economia.dinero += paidAyuda;
      npc.economia.ultimoIngresoNeto = Number((npc.economia.ultimoIngresoNeto + paidAyuda).toFixed(2));
      ayudaRecibidaByNpc[npc.id] = paidAyuda;
    }

    // Gasto de vida -> 100% goes to empresa de comercio (ESTADOS §4 & §12)
    if (getStage(npc.edad) !== 'menor') {
      const propMod = getModifierDelta(npc, 'propensionGasto');
      const effProp = clamp(npc.economia.propensionGasto + propMod, 0.05, 0.9);
      const baseNet = Math.max(0, npc.economia.ultimoIngresoNeto - precioAlimento);
      const desiredLiving = baseNet * effProp;
      const actualLiving = Math.min(npc.economia.dinero, desiredLiving);
      if (actualLiving > 0) {
        npc.economia.dinero -= actualLiving;
        livingPoolDomestico += actualLiving;
      }
    }

    const dineroTarget = precioAlimento * 20;
    const wealthScore = clamp(
      (npc.economia.dinero / Math.max(1, dineroTarget)) * 60 +
        (Math.max(0, npc.economia.ultimoIngresoNeto) / Math.max(1, precioAlimento * 2.5)) * 40,
      0,
      100
    );
    poderAdquisitivo[npc.id] = npc.rol === 'desempleado' ? Math.min(wealthScore, 35) : wealthScore;
  }

  if (livingPoolDomestico > 0) {
    state.empresas.comercio.ingresosAcum += livingPoolDomestico;
  }

  const areaOpDia: Record<ServiceAreaId, number> = {
    seguridad: SERVICE_LEVEL_TABLE.seguridad[pal.servicios.seguridad].operacionPeriodo / FISCAL_PERIOD_DAYS,
    salud: SERVICE_LEVEL_TABLE.salud[pal.servicios.salud].operacionPeriodo / FISCAL_PERIOD_DAYS,
    infraestructura: SERVICE_LEVEL_TABLE.obras[pal.servicios.obras].operacionPeriodo / FISCAL_PERIOD_DAYS,
  };
  const operacionDia = areaOpDia.seguridad + areaOpDia.salud + areaOpDia.infraestructura;
  const prensaDia = pal.prensa / FISCAL_PERIOD_DAYS;

  const acum = state.gobierno.acumuladoPeriodo;
  acum.dias += 1;
  acum.impuestos += impuestosDia;
  acum.nomina += nominaDia;
  acum.pensiones += pensionesDia;
  acum.garantiaAlimentaria += garantiaAlimentariaDia;
  acum.ayudaSocial += ayudaSocialDia;
  acum.operacion += operacionDia;
  acum.operacionPorArea.seguridad += areaOpDia.seguridad;
  acum.operacionPorArea.salud += areaOpDia.salud;
  acum.operacionPorArea.infraestructura += areaOpDia.infraestructura;
  acum.prensa += prensaDia;
  acum.importaciones += importacionesDia;
  acum.exportaciones += exportacionesDia;

  const estSaldoDia =
    impuestosDia -
    (nominaDia + pensionesDia + garantiaAlimentariaDia + ayudaSocialDia + operacionDia + prensaDia);

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
    const ayudaBoost = Math.min(12, (ayudaRecibidaByNpc[npc.id] || 0) * 2.2);

    const targetSat = clamp(
      52 +
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

function settleFiscalPeriod(state: GameState): void {
  const acum = state.gobierno.acumuladoPeriodo;
  const pal = state.gobierno.palancasVigentes;
  const mod = state.config.economiaModulo;
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);

  if (mod === 'fiscal' && state.gobierno.inflacion > 0) {
    const erosion = state.gobierno.inflacion / 100 / 52;
    state.gobierno.reserva = Math.max(0, state.gobierno.reserva * (1 - erosion));
  }

  const ingresos = acum.impuestos;
  const gastos =
    acum.nomina +
    acum.pensiones +
    acum.garantiaAlimentaria +
    acum.ayudaSocial +
    acum.operacion +
    acum.prensa;
  const saldo = ingresos - gastos;

  const wasImpago = state.gobierno.finanzas.impago;
  let emision = 0;
  let impago = false;
  let alcanzaNomina = false;
  let prorrateoDiscrecional = 1;
  let prorrateoNomina = 1;
  let prorrateoPensionGarantia = 1;

  if (saldo >= 0) {
    state.gobierno.reserva = Number((state.gobierno.reserva + saldo).toFixed(1));
    if (mod === 'fiscal') {
      state.gobierno.inflacion = Math.max(2, Number((state.gobierno.inflacion * 0.94).toFixed(1)));
    }
  } else {
    let remaining = Math.abs(saldo);

    if (state.gobierno.reserva > 0) {
      const used = Math.min(state.gobierno.reserva, remaining);
      state.gobierno.reserva = Number((state.gobierno.reserva - used).toFixed(1));
      remaining -= used;
    }

    if (remaining > 0 && mod === 'fiscal') {
      const maxEmit = Math.max(0, ingresos) * (pal.topeEmision / 100);
      emision = Math.min(remaining, maxEmit);
      remaining -= emision;
      if (emision > 0) {
        const inflJump = (emision / Math.max(100, pop * 12)) * 28;
        state.gobierno.inflacion = clamp(Number((state.gobierno.inflacion + inflJump).toFixed(1)), 0, 300);
        addLog(
          state,
          'economia',
          'finanzas:emision',
          `Emisión monetaria de $${emision.toFixed(0)}`,
          `Cubre déficit fiscal pero eleva la inflación a ${state.gobierno.inflacion.toFixed(1)}%.`
        );
      }
    }

    if (remaining > 0.5) {
      impago = true;
      const discTotal = acum.prensa + acum.operacion + acum.ayudaSocial;
      const discShortfall = Math.min(discTotal, remaining);
      prorrateoDiscrecional = discTotal > 0 ? clamp(1 - discShortfall / discTotal, 0, 1) : 1;

      const rem1 = Math.max(0, remaining - discTotal);
      alcanzaNomina = rem1 > 0.01 && acum.nomina > 0;
      const nominaShortfall = Math.min(acum.nomina, rem1);
      prorrateoNomina = acum.nomina > 0 ? clamp(1 - nominaShortfall / acum.nomina, 0, 1) : 1;

      const rem2 = Math.max(0, rem1 - acum.nomina);
      const secTotal = acum.pensiones + acum.garantiaAlimentaria;
      const secShortfall = Math.min(secTotal, rem2);
      prorrateoPensionGarantia = secTotal > 0 ? clamp(1 - secShortfall / secTotal, 0, 1) : 1;

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
        faltante: Number(remaining.toFixed(1)),
        alcanzaNomina,
        causa: state.ultimaCausaPalanca,
      });
      addLog(
        state,
        'economia',
        'finanzas:impago',
        alcanzaNomina ? 'Impago de nómina pública' : 'Impago de gastos discrecionales',
        `Faltaron $${remaining.toFixed(0)} en la liquidación del período.`,
        state.ultimaCausaPalanca,
        impEvId
      );
    }
  }

  // Update all 3 service indicators every settlement using paid operation * coverage (ESTADOS §12)
  const costoBase = pop * ECON_CONSTANTS.costoBaseServicioPorPoblacion * FISCAL_PERIOD_DAYS;
  const areaToCoverage: Record<ServiceAreaId, number> = {
    salud: state.gobierno.coberturas.medico,
    seguridad: state.gobierno.coberturas.policia,
    infraestructura: state.gobierno.coberturas.ingeniero,
  };
  (['salud', 'seguridad', 'infraestructura'] as ServiceAreaId[]).forEach((area) => {
    const paidOp = acum.operacionPorArea[area] * prorrateoDiscrecional;
    const ratio = paidOp / Math.max(1, costoBase);
    const inversion = ratio <= 1 ? ratio : 1 + Math.sqrt(ratio - 1) * 0.55;
    const gain = areaToCoverage[area] * inversion * 6.8;
    const decay = 0.8 + state.gobierno.indicadores[area] * 0.08;
    state.gobierno.indicadores[area] = clamp(
      Number((state.gobierno.indicadores[area] + gain - decay).toFixed(1)),
      0,
      100
    );
  });

  if (wasImpago && !impago) {
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

  const paidPrensa = acum.prensa * prorrateoDiscrecional;
  const fondosPorMedio = state.medios.length > 0 ? paidPrensa / state.medios.length : 0;
  for (const medio of state.medios) {
    medio.finanzas.fondosEstado = Number(fondosPorMedio.toFixed(1));
    medio.finanzas.dependenciaPct = Number(
      ((fondosPorMedio / Math.max(1, medio.finanzas.ingresosPropios + fondosPorMedio)) * 100).toFixed(1)
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

  state.gobierno.finanzas = {
    ingresos: Number(ingresos.toFixed(1)),
    nomina: Number(acum.nomina.toFixed(1)),
    pensiones: Number(acum.pensiones.toFixed(1)),
    garantiaAlimentaria: Number(acum.garantiaAlimentaria.toFixed(1)),
    ayudaSocial: Number(acum.ayudaSocial.toFixed(1)),
    operacion: Number(acum.operacion.toFixed(1)),
    prensa: Number(acum.prensa.toFixed(1)),
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

  state.gobierno.acumuladoPeriodo = {
    dias: 0,
    impuestos: 0,
    nomina: 0,
    pensiones: 0,
    garantiaAlimentaria: 0,
    ayudaSocial: 0,
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
  state.reloj.diasEnPeriodoFiscal += 1;
  state.eventosDiaActual = [];

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
  settleEnterprises(state);
  pruneOrphanedContagions(state, zonesCount);
  runDailyActionContagion(state, zonesCount);
  updateZoneIntegrity(state, zonesCount);

  let settledThisDay = false;
  if (state.reloj.diasEnPeriodoFiscal >= FISCAL_PERIOD_DAYS) {
    settleFiscalPeriod(state);
    state.reloj.diasEnPeriodoFiscal = 0;
    state.reloj.periodoFiscal += 1;
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

export function pickPressTopicAndTone(state: GameState): {
  tema: string;
  tono: NewsTone;
  origen: string;
  detalle: string;
  zonaOrigen?: ZoneId;
  fenomenoId?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
} {
  const derived = deriveCommunityStats(state);
  const dia = state.reloj.dia;

  const announced = getAnnouncedPhenomena(state).filter((f) => f.origen);
  for (const fen of announced) {
    const alreadyCoveredRecently = state.noticias.some(
      (n) => n.esAviso && n.fenomenoId === fen.id && dia - n.dia <= 3
    );
    if (!alreadyCoveredRecently) {
      const daysLeft = fen.inicioDia - dia;
      return {
        tema: fen.tipo,
        tono: 'alarmista',
        origen: `clima:${fen.tipo}`,
        detalle: `Alerta temprana: ${fen.nombre} se aproxima por la zona ${fen.origen} en ${daysLeft} días (intensidad estimada ${Math.round(fen.intensidad)}%).`,
        zonaOrigen: fen.origen,
        fenomenoId: fen.id,
        esAviso: true,
        vigenteHastaDia: fen.inicioDia + fen.duracionDias,
      };
    }
  }

  if (state.gobierno.finanzas.impago) {
    return {
      tema: 'impago',
      tono: state.gobierno.finanzas.alcanzaNomina ? 'alarmista' : 'critico',
      origen: 'estado:impago_nomina',
      detalle: state.gobierno.finanzas.alcanzaNomina
        ? 'El estado no pudo cubrir la nómina de los trabajadores públicos en el último cierre fiscal.'
        : 'El estado recortó gastos discrecionales por déficit en el último cierre fiscal.',
    };
  }
  if (derived.hambreCriticaPct > 15) {
    return {
      tema: 'hambre',
      tono: 'alarmista',
      origen: 'estado:hambre_critica',
      detalle: `El ${derived.hambreCriticaPct}% de la población padece hambre crítica y quedan ${state.alimento.diasStock} días de reserva alimentaria.`,
    };
  }

  const active = getActivePhenomena(state);
  if (active.length > 0) {
    const fen =
      active.find(
        (f) => f.origen && !state.noticias.some((n) => n.esAviso && n.fenomenoId === f.id && dia - n.dia <= 5)
      ) || active[0];
    return {
      tema: fen.tipo,
      tono: fen.intensidad > 50 ? 'alarmista' : 'critico',
      origen: `clima:${fen.tipo}`,
      detalle: `Persiste ${fen.nombre}${fen.origen ? ` desde ${fen.origen}` : ''} con una intensidad del ${Math.round(fen.intensidad)}%.`,
      zonaOrigen: fen.origen,
      fenomenoId: fen.id,
      esAviso: Boolean(fen.origen),
      vigenteHastaDia: fen.origen ? fen.inicioDia + fen.duracionDias : undefined,
    };
  }

  if (derived.descontentosPct > 25) {
    return {
      tema: 'malestar_social',
      tono: 'critico',
      origen: 'estado:descontento_alto',
      detalle: `Un ${derived.descontentosPct}% de los vecinos expresa fuerte malestar con la situación actual.`,
    };
  }
  if (state.config.economiaModulo === 'fiscal' && state.gobierno.inflacion > 25) {
    return {
      tema: 'inflacion',
      tono: 'critico',
      origen: 'economia:inflacion_alta',
      detalle: `La inflación alcanza ${state.gobierno.inflacion.toFixed(1)}% y encarece el costo de la comida ($${state.alimento.precio.toFixed(2)}).`,
    };
  }
  const latestActionNpc = state.npcs.find((n) => n.vivo && n.accionIa);
  if (latestActionNpc && latestActionNpc.accionIa) {
    return {
      tema: 'vida_comunitaria',
      tono: 'informativo',
      origen: latestActionNpc.accionIa.origen,
      detalle: latestActionNpc.accionIa.texto,
    };
  }
  if (derived.apoyoPct >= 60) {
    return {
      tema: 'gestion_y_clima_social',
      tono: 'favorable',
      origen: 'estado:consenso_social',
      detalle: `El apoyo al gobernador se sostiene en ${derived.apoyoPct}% con una satisfacción media de ${derived.satisfaccionMedia}%.`,
    };
  }
  return {
    tema: 'coyuntura_local',
    tono: 'informativo',
    origen: 'estado:rutina',
    detalle: `La comunidad cierra la jornada con ${derived.poblacion} habitantes y ${state.alimento.diasStock} días de alimento en stock.`,
  };
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
    case 'empresa_respuesta':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.duenoId ?? undefined,
        titulo: `Empresa ${ev.empresaId}: ${ev.respuesta.replace('_', ' ')}`,
        detalle: `Déficit de $${ev.deficit} al cierre semanal.`,
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
