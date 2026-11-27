import {
  ACTION_TABLE,
  ACTOR_CONSTANTS,
  AGENDA_CONSTANTS,
  BUILDING_CATALOG,
  DIRECTOR_CONSTANTS,
  ECON_CONSTANTS,
  EFFECT_CATALOG,
  FIRM_CONSTANTS,
  FOREIGN_TRADE_STEPS,
  HOUSING_CONSTANTS,
  LEVER_BOUNDS,
  LEVER_VALENCIA,
  LEVEL11_CONSTANTS,
  NEWS_TEMPLATES,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  PERIOD_DAYS_DEMOG,
  PRESS_CONSTANTS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  ActionDefinition,
  ActiveDemand,
  ActorMeasure,
  BuildingType,
  Casa,
  CausalStep,
  ClimatePhenomenon,
  CommunityDerived,
  DemandId,
  EventLogEntry,
  Firma,
  ForeignTradeStep,
  GameState,
  GovernmentState,
  GovernorComplexityLevel,
  HitoMetric,
  Hogar,
  LeverKey,
  ModifiableKey,
  Modifier,
  NewsArticle,
  NewsTone,
  NewsTopic,
  Npc,
  NpcVariable,
  ObjectiveCondition,
  Parcela,
  PersonalityTrait,
  PhenomenonType,
  PressFact,
  PressValence,
  PriceCapMode,
  RoleId,
  ServiceLevel,
  ServicePublicRoleId,
  SimEvent,
  SubsystemRngState,
  ZoneId,
} from '../types/game';
import {
  getActiveBuildings,
  getObrasTargetJobs,
} from './policies';
import {
  nextRand,
  nextSeqId,
  nextSubRand,
  subRandInt,
  SubsystemName,
} from './rng';
import {
  getZoneCanvasPosition,
  isTestConfig,
} from './worldGenerator';
import {
  canBuildTypeInParcela,
  checkEngineInvariants,
  clamp,
  compactEvents,
  computeAmenazaPercibida,
  computeDemandaSuelo,
  computeHospitalFacilities as computeHospitalFacilitiesRaw,
  computeTotalWorldMoney,
  deriveCommunityStats,
  emitSimEvent,
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveTrait,
  getEffectiveZone,
  getModifierDelta,
  getNpcDailyAgenda,
  getNpcProductivity,
  getParcelTerrainTiles,
  getRouteWaypointsBetween,
  getStage,
  getTerrainBuildCostInfo,
  getViaTerrainTiles,
  getWorldZones,
  getZoneTravelCost,
  HospitalFacilityInfo as WorldHospitalFacilityInfo,
  isLotIsolated,
  isViaConnectableToNetwork,
  recomputeRoadDistances,
  shortestZonePath as shortestZonePathByZones,
  updateDailyNpcRitmoAndHabits,
} from './worldHelpers';
import {
  pickRandomZoneSub,
  runDailyEconomyV2,
  runPaydayEconomyV2,
} from './economyV2';
import {
  assignRolesAndJobsV2,
  handleNpcDeathV2,
  runDailyLifecycleV2,
  runDemographicPeriodV2,
  runTrainingPeriodV2,
} from './lifecycleV2';
import {
  updateLecturaDaily,
  updateLecturaPayday,
} from './lecturaV2';

export {
  checkEngineInvariants,
  clamp,
  compactEvents,
  computeTotalWorldMoney,
  deriveCommunityStats,
  emitSimEvent,
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveTrait,
  getEffectiveZone,
  getModifierDelta,
  getNpcProductivity,
  getStage,
  getWorldZones,
};
export interface HospitalFacilityInfo extends WorldHospitalFacilityInfo {
  beds: number;
  occupied: number;
  isCampana: boolean;
  parcela: Parcela;
}

export const TICKS_PER_DAY = 120;

function drawSubRand(
  state: { rng?: SubsystemRngState; rngState: number } | undefined,
  sub: SubsystemName
): number {
  return state ? nextSubRand(state, sub) : Math.random();
}

function drawSubInt(
  state: { rng?: SubsystemRngState; rngState: number } | undefined,
  sub: SubsystemName,
  min: number,
  max: number
): number {
  return state ? subRandInt(state, sub, min, max) : min + Math.floor(Math.random() * (max - min + 1));
}

function makeSeqId(state: { idSeq: number } | undefined, prefix: string): string {
  return state ? nextSeqId(state, prefix) : `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

function getZonesMap(state: GameState): GameState['zonas'] {
  return state.zonas && Object.keys(state.zonas).length > 0
    ? state.zonas
    : SCENARIO_PRESETS[state.config.escenarioId].zonas;
}

function shortestZonePath(
  from: ZoneId,
  to: ZoneId,
  zonas: GameState['zonas']
): ZoneId[] {
  return shortestZonePathByZones(zonas, from, to);
}

function computePoliceSplitAndMetrics(state: GameState): {
  defensa: Record<ZoneId, number>;
  orden: Record<ZoneId, number>;
  satMediaZona: Record<ZoneId, number>;
  necesidadTotalZona: Record<ZoneId, number>;
  amenaza: Record<ZoneId, number>;
} {
  const zones = getWorldZones(state);
  const nZones = Math.max(1, zones.length);
  const seguridad = state.gobierno.indicadores.seguridad;
  const c = ECON_CONSTANTS.movilidadDefensa;
  const amenaza = computeAmenazaPercibida(state);

  const policeCounts: Record<ZoneId, number> = {};
  const popZona: Record<ZoneId, number> = {};
  const spontZona: Record<ZoneId, number> = {};
  const descontZona: Record<ZoneId, number> = {};
  const sumSatZona: Record<ZoneId, number> = {};
  for (const z of zones) {
    policeCounts[z] = 0;
    popZona[z] = 0;
    spontZona[z] = 0;
    descontZona[z] = 0;
    sumSatZona[z] = 0;
  }

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

  const defensa: Record<ZoneId, number> = {};
  const orden: Record<ZoneId, number> = {};
  const satMediaZona: Record<ZoneId, number> = {};
  const necesidadTotalZona: Record<ZoneId, number> = {};
  for (const z of zones) {
    defensa[z] = seguridad;
    orden[z] = 0;
    satMediaZona[z] = 50;
    necesidadTotalZona[z] = 0;
  }

  const activeBuildings = getActiveBuildings(state.parcelas);
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
    let buildingDefBonus = 0;
    for (const b of activeBuildings) {
      if (b.zona !== z) continue;
      const bDef = BUILDING_CATALOG[b.tipo];
      if (bDef.bonusDefensa) buildingDefBonus += bDef.bonusDefensa;
      if (bDef.defensaMuralla) buildingDefBonus += bDef.defensaMuralla;
    }
    const integrity = state.gobierno.integridad?.[z] ?? 100;
    const integrityFactor = 1 - ECON_CONSTANTS.kIntegridad * (1 - integrity / 100);
    const baseZoneDef = Math.min(100, seguridad * (1 - c + c * nZones * parte));
    defensa[z] = Number(
      clamp((baseZoneDef + buildingDefBonus) * integrityFactor, 0, 100).toFixed(1)
    );
    orden[z] =
      popZ > 0
        ? Number(clamp((100 * (polZ / popZ)) / ECON_CONSTANTS.objetivoOrden, 0, 100).toFixed(1))
        : 0;
  }

  return { defensa, orden, satMediaZona, necesidadTotalZona, amenaza };
}

function computeZoneDefense(state: GameState): Record<ZoneId, number> {
  return computePoliceSplitAndMetrics(state).defensa;
}

function updateZoneIntegrity(state: GameState, zonesCount: number): void {
  const zones = getWorldZones(state);
  const infraFactor = 0.5 + 0.5 * (state.gobierno.indicadores.infraestructura / 100);

  const repairersByZone: Record<ZoneId, number> = {};
  for (const z of zones) repairersByZone[z] = 0;

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

function getParcelCanvasCenter(p: Parcela): { x: number; y: number } {
  return {
    x: Number((p.wx + p.ww / 2).toFixed(1)),
    y: Number((p.wy + p.wh / 2).toFixed(1)),
  };
}

export function computeHospitalFacilities(
  state: GameState,
  _medicosActivos?: number
): { facilities: HospitalFacilityInfo[]; totalBeds: number; fullCount: number } {
  const parcelById = new Map<string, Parcela>(state.parcelas.map((p) => [p.id, p]));
  const raw = computeHospitalFacilitiesRaw(state.parcelas, state.npcs, state.zonas, state.distanciasZonas);
  const facilities: HospitalFacilityInfo[] = raw
    .map((f) => {
      const parcela = parcelById.get(f.parcelaId);
      if (!parcela) return null;
      return {
        ...f,
        beds: f.camasEfectivas,
        occupied: f.ocupadas,
        isCampana: f.esCampana,
        parcela,
      };
    })
    .filter((f): f is HospitalFacilityInfo => f !== null);
  const totalBeds = facilities.reduce((acc, f) => acc + f.beds, 0);
  const fullCount = facilities.filter((f) => f.beds <= 0 || f.occupied >= f.beds).length;
  return { facilities, totalBeds, fullCount };
}

function getTaxRateForNpc(npc: Npc, state: GameState): number {
  const def = ROLE_CATALOG[npc.rol];
  if (def.grupo === 'sin_ingreso') return 0;
  return state.gobierno.palancasVigentes.impuesto;
}

function recordControlEvent(
  state: GameState,
  control: string,
  prevVal: number | string,
  nextVal: number | string,
  palanca?: string
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
    tipo: 'control',
    zona: 'centro',
    control,
    ...(palanca ? { palanca } : {}),
    valorAnterior: fmt(prevVal),
    valorNuevo: fmt(nextVal),
  });
  state.ultimaCausaPalanca = evId;
  addLog(
    state,
    'gobernador',
    `control:${control}`,
    `Cambio en ${control}`,
    `${fmt(prevVal)} → ${fmt(nextVal)}`,
    undefined,
    evId
  );
}

function isLeverLocked(state: GameState, palanca: LeverKey): boolean {
  const dia = state.reloj.dia;
  return state.bloqueosPalanca.some((b) => b.palanca === palanca && dia < b.hastaDia);
}

function applyLeverChanges(state: GameState): void {
  const cur = state.gobierno.palancasVigentes;
  const tgt = state.gobierno.palancasObjetivo;
  const vivosCount = state.npcs.filter((n) => n.vivo).length;

  const applyNum = (
    control: string,
    palancaKey: LeverKey,
    palancaLabel: string,
    prevVal: number,
    tgtVal: number,
    min: number,
    max: number,
    setter: (v: number) => void
  ) => {
    if (isLeverLocked(state, palancaKey)) return;
    const nextVal = Number(clamp(tgtVal, min, max).toFixed(2));
    if (Math.abs(nextVal - prevVal) >= 0.01) {
      setter(nextVal);
      recordControlEvent(state, control, prevVal, nextVal, palancaLabel);
    }
  };

  applyNum(
    'tasa_impuesto',
    'impuesto',
    'impuesto',
    cur.impuesto,
    tgt.impuesto,
    LEVER_BOUNDS.impuesto.min,
    LEVER_BOUNDS.impuesto.max,
    (v) => {
      cur.impuesto = v;
    }
  );

  applyNum(
    'salario_publico',
    'salarioPublico',
    'salario_publico',
    cur.salarioPublico,
    tgt.salarioPublico,
    LEVER_BOUNDS.salarioPublico.min,
    LEVER_BOUNDS.salarioPublico.max,
    (v) => {
      cur.salarioPublico = v;
    }
  );

  if (!isLeverLocked(state, 'nivelObras')) {
    const nextLvl = clamp(Math.round(tgt.nivelObras), 0, 5) as ServiceLevel;
    const prevLvl = cur.nivelObras;
    if (nextLvl !== prevLvl) {
      const prevJobs = getObrasTargetJobs(vivosCount, prevLvl);
      const nextJobs = getObrasTargetJobs(vivosCount, nextLvl);
      cur.nivelObras = nextLvl;
      recordControlEvent(state, 'puestos.ingeniero', prevJobs, nextJobs, 'nivel_obras');
      recordControlEvent(
        state,
        'operacion.obras',
        OBRAS_LEVEL_TABLE[prevLvl].operacionPeriodo,
        OBRAS_LEVEL_TABLE[nextLvl].operacionPeriodo,
        'nivel_obras'
      );
    }
  }

  applyNum(
    'ayuda_social',
    'ayudaSocial',
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
    'garantia_pct',
    'garantiaAlimentaria',
    'garantia_alimentaria',
    cur.garantiaAlimentaria,
    tgt.garantiaAlimentaria,
    LEVER_BOUNDS.garantiaAlimentaria.min,
    LEVER_BOUNDS.garantiaAlimentaria.max,
    (v) => {
      cur.garantiaAlimentaria = v;
    }
  );

  if (!isLeverLocked(state, 'precioMaximo')) {
    const validCap: PriceCapMode =
      tgt.precioMaximo === 'moderado' || tgt.precioMaximo === 'estricto' ? tgt.precioMaximo : 'libre';
    if (validCap !== cur.precioMaximo) {
      const prev = cur.precioMaximo;
      cur.precioMaximo = validCap;
      recordControlEvent(state, 'tope_precio', prev, validCap, 'precio_maximo');
    }
  }

  if (!isLeverLocked(state, 'comercioExterior')) {
    const validTradeSteps = FOREIGN_TRADE_STEPS.map((s) => s.value);
    const nextTrade: ForeignTradeStep = validTradeSteps.includes(tgt.comercioExterior)
      ? tgt.comercioExterior
      : 0;
    if (nextTrade !== cur.comercioExterior) {
      const prev = cur.comercioExterior;
      cur.comercioExterior = nextTrade;
      recordControlEvent(state, 'flujo_exterior_pct', prev, nextTrade, 'comercio_exterior');
    }
  }

  applyNum(
    'fondos_prensa',
    'prensa',
    'prensa',
    cur.prensa,
    tgt.prensa,
    LEVER_BOUNDS.prensa.min,
    LEVER_BOUNDS.prensa.max,
    (v) => {
      cur.prensa = v;
    }
  );

  if (state.config.economiaModulo === 'fiscal') {
    applyNum(
      'tope_emision_pct',
      'topeEmision',
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
  applyExtraControls(state);
}

export const MAX_BITACORA_ENTRIES = 160;

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
  if (state.bitacora.length > MAX_BITACORA_ENTRIES) {
    state.bitacora.length = MAX_BITACORA_ENTRIES;
  }
}

function getBuildDaysForNivel(baseDays: number, nivelObras: ServiceLevel, infraIndicator: number): number {
  const obrasFactor = OBRAS_LEVEL_TABLE[nivelObras]?.diasObraFactor ?? 1;
  const infraAdj = 1.1 - (clamp(infraIndicator, 0, 100) / 100) * 0.2;
  return Math.max(1, Math.round(baseDays * obrasFactor * infraAdj));
}

function relocateOrDischargePatientsFromBuilding(state: GameState, removedBuildingId: string): void {
  const medicosActivos = state.npcs.filter(
    (n) => n.vivo && n.rol === 'medico' && !n.hospital.internado && !n.accionIa?.fueraDePuesto
  ).length;
  const { facilities } = computeHospitalFacilities(state, medicosActivos);

  for (const npc of state.npcs) {
    if (!npc.vivo || !npc.hospital.internado || npc.hospital.edificioId !== removedBuildingId) continue;
    const fromZone = npc.hospital.zonaHospital || npc.zona;
    const available = facilities
      .filter((f) => f.edificioId !== removedBuildingId && f.occupied < f.beds)
      .sort((a, b) => {
        const dA = getZoneTravelCost(state, fromZone, a.zona);
        const dB = getZoneTravelCost(state, fromZone, b.zona);
        const cA = Number.isFinite(dA) ? dA : Number.MAX_SAFE_INTEGER;
        const cB = Number.isFinite(dB) ? dB : Number.MAX_SAFE_INTEGER;
        if (cA !== cB) return cA - cB;
        return a.parcela.orden - b.parcela.orden;
      });
    if (available.length > 0) {
      const target = available[0];
      target.occupied += 1;
      npc.hospital.edificioId = target.edificioId;
      npc.hospital.zonaHospital = target.zona;
      npc.mapa.destino = getParcelCanvasCenter(target.parcela);
    } else {
      npc.hospital.internado = false;
      npc.hospital.edificioId = undefined;
      npc.hospital.zonaHospital = undefined;
      npc.hospital.esperandoCama = npc.variables.salud < ECON_CONSTANTS.umbralHospital;
      npc.mapa.accion =
        npc.rol === 'estudiante' ? 'estudiando' : npc.rol === 'jubilado' || npc.rol === 'desempleado' ? 'paseando' : 'trabajando';
      npc.mapa.destino = getZoneCanvasPosition(npc.zona, state, state.zonas);
    }
  }
}

export function orderBuildInParcela(
  state: GameState,
  parcelaId: string,
  tipo: BuildingType
): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') {
    return { ok: false, error: 'La partida ya finalizó.' };
  }
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  if (govLevel === 'G0' || state.config.estadoAutomatico) {
    return { ok: false, error: 'En modo sin gobernador o Estado automático no hay órdenes manuales.' };
  }
  const def = BUILDING_CATALOG[tipo];
  if (!def || !def.construibleGobernador) {
    return { ok: false, error: 'Este edificio no es construible por el gobernador.' };
  }
  if (def.requiereG2 && govLevel === 'G1') {
    return { ok: false, error: 'Obra de suceso disponible desde complejidad G2.' };
  }
  const parcela = state.parcelas.find((p) => p.id === parcelaId);
  if (!parcela) {
    return { ok: false, error: 'Parcela inexistente.' };
  }
  if (isLotIsolated(state, parcela)) {
    return { ok: false, error: 'La parcela no tiene vía conectada.' };
  }
  if (parcela.estado !== 'libre') {
    return { ok: false, error: 'La parcela no está libre.' };
  }
  if (!canBuildTypeInParcela(parcela, tipo)) {
    return { ok: false, error: `La parcela (${parcela.tipoParcela}, clase ${parcela.clase ?? 'M'}) no admite ${def.nombre}.` };
  }
  const terrainInfo = getTerrainBuildCostInfo(state.mapaGrid, getParcelTerrainTiles(state, parcela), false);
  if (!terrainInfo.buildable) {
    return { ok: false, error: 'El terreno de la parcela no es edificable (agua o montaña).' };
  }
  const buildCost = Number((def.costoObra * terrainInfo.multiplier).toFixed(2));
  if (state.gobierno.reserva < buildCost) {
    return { ok: false, error: `Reserva insuficiente ($${buildCost} requeridos).` };
  }

  const constructoras = state.firmas.filter((f) => f.activa && f.rubro === 'construccion');
  const payeeFirm =
    constructoras.find((f) => f.zona === parcela.zona) ??
    constructoras[0] ??
    state.firmas.find((f) => f.activa);
  if (!payeeFirm) {
    return { ok: false, error: 'No hay empresa constructora activa disponible.' };
  }

  const dia = state.reloj.dia;
  const diasObra = getBuildDaysForNivel(
    def.diasObra,
    state.gobierno.palancasVigentes.nivelObras,
    state.gobierno.indicadores.infraestructura
  );

  state.gobierno.reserva = Number((state.gobierno.reserva - buildCost).toFixed(2));
  state.gobierno.acumuladoPeriodo.obras = Number(
    (state.gobierno.acumuladoPeriodo.obras + buildCost).toFixed(2)
  );
  // Public construction payment flows ONLY into payeeFirm.ventas to strictly conserve world money
  payeeFirm.ventas = Number((payeeFirm.ventas + buildCost).toFixed(2));

  parcela.estado = 'en_obra';
  parcela.edificio = {
    id: nextSeqId(state, `bld_${tipo}`),
    tipo,
    parcelaId: parcela.id,
    dueno: 'estado',
    duenoRef: { tipo: 'estado', id: 'estado' },
    estado: 'en_obra',
    activo: false,
    estadoSalud: 100,
    diasObraRestantes: diasObra,
    diasObraTotal: diasObra,
    diasRestantesCampana: def.diasCampana,
    zona: parcela.zona,
  };

  const evId = nextSeqId(state, `ev_${dia}`);
  state.ultimaCausaPalanca = evId;
  emitSimEvent(state, {
    id: evId,
    dia,
    tipo: 'obra_inicio',
    zona: parcela.zona,
    parcelaId: parcela.id,
    edificio: tipo,
    dueno: 'estado',
    costo: buildCost,
    diasObra,
  });
  addLog(
    state,
    'gobernador',
    `orden:construir/${tipo}`,
    `Inicio de obra: ${def.nombre}`,
    `En ${parcela.nombre} (${parcela.zona}) · $${buildCost} · ${diasObra} días.`,
    undefined,
    evId
  );

  return { ok: true };
}

export function orderBuildVia(
  state: GameState,
  tramoId: string
): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') {
    return { ok: false, error: 'La partida ya finalizó.' };
  }
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  if (govLevel === 'G0') {
    return { ok: false, error: 'En G0 no hay órdenes del gobernador.' };
  }
  const tramo = (state.tramos ?? []).find((t) => t.id === tramoId);
  if (!tramo) {
    return { ok: false, error: 'Tramo vial inexistente.' };
  }
  if (tramo.construida) {
    return { ok: false, error: 'Ese tramo ya está construido.' };
  }
  if (tramo.enObra) {
    return { ok: false, error: 'Ese tramo ya está en obra.' };
  }
  if (!isViaConnectableToNetwork(state, tramo)) {
    return { ok: false, error: 'El tramo debe conectar con la red vial activa.' };
  }
  const terrainInfo = getTerrainBuildCostInfo(
    state.mapaGrid,
    getViaTerrainTiles(state, tramo),
    tramo.tipo === 'puente'
  );
  if (!terrainInfo.buildable) {
    return { ok: false, error: 'El trazado atraviesa terreno infranqueable sin puente.' };
  }
  const buildCost = Number((tramo.costoObra * terrainInfo.multiplier + terrainInfo.bridgeExtraCost).toFixed(2));
  if (state.gobierno.reserva < buildCost) {
    return { ok: false, error: `Reserva insuficiente ($${buildCost} requeridos).` };
  }

  const constructoras = state.firmas.filter((f) => f.activa && f.rubro === 'construccion');
  const payeeFirm =
    constructoras.find((f) => f.zona === tramo.zonaA || f.zona === tramo.zonaB) ??
    constructoras[0] ??
    state.firmas.find((f) => f.activa);
  if (!payeeFirm) {
    return { ok: false, error: 'No hay empresa constructora activa disponible.' };
  }

  const dia = state.reloj.dia;
  const diasObra = Math.max(
    2,
    Math.round(
      tramo.diasObraTotal *
        (OBRAS_LEVEL_TABLE[state.gobierno.palancasVigentes.nivelObras]?.diasObraFactor ?? 1)
    )
  );

  state.gobierno.reserva = Number((state.gobierno.reserva - buildCost).toFixed(2));
  state.gobierno.acumuladoPeriodo.obras = Number(
    (state.gobierno.acumuladoPeriodo.obras + buildCost).toFixed(2)
  );
  payeeFirm.ventas = Number((payeeFirm.ventas + buildCost).toFixed(2));

  tramo.enObra = true;
  tramo.diasObraRestantes = diasObra;

  const evId = nextSeqId(state, `ev_${dia}`);
  state.ultimaCausaPalanca = evId;
  emitSimEvent(state, {
    id: evId,
    dia,
    tipo: 'via_inicio',
    zona: tramo.zonaA,
    tramoId: tramo.id,
    tramoNombre: tramo.nombre,
    tipoVia: tramo.tipo,
    parcelasAbiertas: [...tramo.parcelasAbiertas],
    costo: buildCost,
    diasObra,
  });
  addLog(
    state,
    'gobernador',
    `orden:construir_via/${tramo.tipo}`,
    `Inicio de obra vial: ${tramo.nombre}`,
    `${tramo.tipo.toUpperCase()} (${tramo.zonaA}–${tramo.zonaB}) · $${buildCost} · ${diasObra} días.`,
    undefined,
    evId
  );

  return { ok: true };
}

export function orderDemolishParcela(
  state: GameState,
  parcelaId: string
): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') {
    return { ok: false, error: 'La partida ya finalizó.' };
  }
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  if (govLevel === 'G0') {
    return { ok: false, error: 'En G0 no hay órdenes del gobernador.' };
  }
  const parcela = state.parcelas.find((p) => p.id === parcelaId);
  if (!parcela || !parcela.edificio) {
    return { ok: false, error: 'No hay edificio en esa parcela.' };
  }
  if (parcela.edificio.dueno !== 'estado') {
    return { ok: false, error: 'Solo se pueden demoler edificios públicos u obras del Estado.' };
  }

  const removed = parcela.edificio;
  const def = BUILDING_CATALOG[removed.tipo];
  parcela.edificio = null;
  parcela.estado = 'libre';

  if (removed.tipo === 'hospital' || removed.tipo === 'hospital_campana') {
    relocateOrDischargePatientsFromBuilding(state, removed.id);
  }
  if (removed.casaId) {
    const casaIdx = state.casas.findIndex((c) => c.id === removed.casaId);
    if (casaIdx !== -1) {
      const removedCasa = state.casas[casaIdx];
      if (removedCasa.hogarId) {
        const h = state.hogares.find((hog) => hog.id === removedCasa.hogarId);
        if (h) {
          h.casaId = null;
          if (h.estado === 'con_casa') {
            h.estado = 'calle';
          }
        }
      }
      state.casas.splice(casaIdx, 1);
    }
  }

  const dia = state.reloj.dia;
  const evId = nextSeqId(state, `ev_${dia}`);
  state.ultimaCausaPalanca = evId;
  emitSimEvent(state, {
    id: evId,
    dia,
    tipo: 'demolicion',
    zona: parcela.zona,
    parcelaId: parcela.id,
    edificio: removed.tipo,
  });
  addLog(
    state,
    'gobernador',
    `orden:demoler/${removed.tipo}`,
    `Demolición: ${def.nombre}`,
    `Liberada la parcela ${parcela.nombre} (${parcela.zona}). Sin reembolso de obra.`,
    undefined,
    evId
  );

  return { ok: true };
}

function stepBuildingsDaily(state: GameState): void {
  const dia = state.reloj.dia;
  for (const parcela of state.parcelas) {
    const b = parcela.edificio;
    if (!b) continue;
    if (parcela.estado === 'en_obra' && b.estado === 'en_obra') {
      b.diasObraRestantes = Math.max(0, b.diasObraRestantes - 1);
      if (b.diasObraRestantes <= 0) {
        parcela.estado = 'ocupada';
        b.estado = 'ocupada';
        b.activo = true;
        b.estadoSalud = b.estadoSalud ?? 100;
        const def = BUILDING_CATALOG[b.tipo];
        const evId = nextSeqId(state, `ev_${dia}`);

        // V2: materialize Casa entry when a residential building finishes construction
        if (
          (b.tipo === 'casa_chica' || b.tipo === 'casa_mediana' || b.tipo === 'casa_grande') &&
          !b.casaId
        ) {
          const zoneDem = state.zonas[parcela.zona]?.demandaAlquilerIndice ?? 1;
          const newCasa: Casa = {
            id: nextSeqId(state, 'casa'),
            tipo: b.tipo,
            parcelaId: parcela.id,
            zona: parcela.zona,
            capacidad: def.capacidadCasa ?? 4,
            estado: b.estadoSalud ?? 100,
            dueno: b.duenoRef ?? { tipo: 'estado', id: 'estado' },
            alquiler: Number(
              Math.max(
                (def.alquilerBase ?? 12) * HOUSING_CONSTANTS.alquilerPisoFactor,
                (def.alquilerBase ?? 12) * ((b.estadoSalud ?? 100) / 100) * zoneDem
              ).toFixed(2)
            ),
            hogarId: null,
            diasVaciaSinMantenimiento: 0,
            alquilerCobradoPeriodo: 0,
          };
          state.casas.push(newCasa);
          b.casaId = newCasa.id;
          emitSimEvent(state, {
            id: nextSeqId(state, `ev_${dia}`),
            dia,
            tipo: 'casa_construida',
            zona: parcela.zona,
            casaId: newCasa.id,
            parcelaId: parcela.id,
            tipoCasa: newCasa.tipo,
            dueno: newCasa.dueno,
            causa: evId,
          });
        }

        emitSimEvent(state, {
          id: evId,
          dia,
          tipo: 'obra_fin',
          zona: parcela.zona,
          parcelaId: parcela.id,
          edificio: b.tipo,
          dueno: b.dueno,
          causa: b.dueno === 'estado' ? state.ultimaCausaPalanca : undefined,
        });
        addLog(
          state,
          b.dueno === 'estado' ? 'gobernador' : 'economia',
          `edificio:${b.tipo}`,
          `Inauguración: ${def.nombre}`,
          `Finalizó la obra en ${parcela.nombre} (${parcela.zona}).`,
          b.dueno === 'estado' ? state.ultimaCausaPalanca : undefined,
          evId
        );
      }
    } else if (
      parcela.estado === 'ocupada' &&
      b.estado === 'ocupada' &&
      b.tipo === 'hospital_campana' &&
      typeof b.diasRestantesCampana === 'number'
    ) {
      b.diasRestantesCampana -= 1;
      if (b.diasRestantesCampana <= 0) {
        parcela.edificio = null;
        parcela.estado = 'libre';
        relocateOrDischargePatientsFromBuilding(state, b.id);
        const evId = nextSeqId(state, `ev_${dia}`);
        emitSimEvent(state, {
          id: evId,
          dia,
          tipo: 'demolicion',
          zona: parcela.zona,
          parcelaId: parcela.id,
          edificio: b.tipo,
        });
        addLog(
          state,
          'sistema',
          'edificio:hospital_campana',
          'Fin de Hospital de Campaña',
          `Se desarmó el hospital temporal en ${parcela.nombre} (${parcela.zona}).`,
          undefined,
          evId
        );
      }
    }
  }

  // Advance road/path/bridge construction (MUNDO_V2 §8)
  let anyViaCompleted = false;
  for (const tramo of state.tramos ?? []) {
    if (!tramo.enObra) continue;
    tramo.diasObraRestantes = Math.max(0, tramo.diasObraRestantes - 1);
    if (tramo.diasObraRestantes <= 0) {
      anyViaCompleted = true;
      tramo.enObra = false;
      tramo.construida = true;
      tramo.estado = 100;

      // Activate expansion zone first if this tramo opens it
      let activatedZone: ZoneId | undefined;
      if (tramo.zonaAbierta && state.zonas[tramo.zonaAbierta]?.estado === 'no_urbanizada') {
        activatedZone = tramo.zonaAbierta;
        state.zonas[activatedZone].estado = 'activa';
        state.gobierno.integridad[activatedZone] ??= 100;
        state.ultimaDefensaZona[activatedZone] ??= 55;
        const ordenMap = (state.ultimaOrdenZona ??= {});
        for (const z of Object.keys(state.zonas)) {
          ordenMap[z] ??= 100;
        }
        ordenMap[activatedZone] ??= 100;
        state.ultimaIntegridadZona[activatedZone] ??= 100;
        state.golpesPorZonaHistorial[activatedZone] ??= [];
      }

      // Open associated sin_calle parcels
      for (const pid of tramo.parcelasAbiertas) {
        const p = state.parcelas.find((x) => x.id === pid);
        if (p && p.estado === 'sin_calle') {
          p.estado = 'libre';
        }
      }

      const viaEvId = nextSeqId(state, `ev_${dia}`);
      emitSimEvent(state, {
        id: viaEvId,
        dia,
        tipo: 'via_fin',
        zona: tramo.zonaA,
        tramoId: tramo.id,
        tramoNombre: tramo.nombre,
        tipoVia: tramo.tipo,
        parcelasAbiertas: [...tramo.parcelasAbiertas],
        causa: state.ultimaCausaPalanca,
      });
      addLog(
        state,
        'gobernador',
        `via:${tramo.tipo}`,
        `Vía habilitada: ${tramo.nombre}`,
        `Se completó ${tramo.tipo} y quedaron disponibles ${tramo.parcelasAbiertas.length} parcela(s).`,
        state.ultimaCausaPalanca,
        viaEvId
      );

      if (activatedZone) {
        const zEvId = nextSeqId(state, `ev_${dia}`);
        emitSimEvent(state, {
          id: zEvId,
          dia,
          tipo: 'zona_abierta',
          zona: activatedZone,
          viaId: tramo.id,
          causa: viaEvId,
        });
        addLog(
          state,
          'gobernador',
          `zona:abierta`,
          `Nueva zona habilitada: ${state.zonas[activatedZone]?.nombre ?? activatedZone}`,
          `Conectada a la red por ${tramo.nombre}.`,
          viaEvId,
          zEvId
        );
      }
    }
  }

  if (anyViaCompleted) {
    recomputeRoadDistances(state);
    state.demandaSuelo = computeDemandaSuelo(state);
  }
}

function getHitoMetricValue(
  metric: HitoMetric,
  state: GameState,
  derived: CommunityDerived
): number {
  switch (metric) {
    case 'satisfaccionMedia':
      return derived.satisfaccionMedia;
    case 'apoyoPct':
      return derived.apoyoPct;
    case 'desempleoPct':
      return derived.desempleoPct;
    case 'hambreCriticaPct':
      return derived.hambreCriticaPct;
    case 'poblacionPct':
      return derived.poblacionPct;
    case 'ingresosEstado':
      return state.gobierno.finanzas.ingresos;
  }
}

function checkHitosAtPayday(state: GameState, derived: CommunityDerived): void {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const dia = state.reloj.dia;
  for (const hito of preset.hitos) {
    if (state.hitosCumplidos.includes(hito.id)) continue;
    const val = getHitoMetricValue(hito.condicion.metrica, state, derived);
    const met =
      hito.condicion.op === '>=' ? val >= hito.condicion.umbral : val <= hito.condicion.umbral;
    if (!met) continue;

    state.hitosCumplidos.push(hito.id);
    const parcela = state.parcelas.find((p) => p.id === hito.parcelaId);
    const zone: ZoneId = parcela?.zona ?? 'centro';
    const hitoEvId = nextSeqId(state, `ev_${dia}`);
    emitSimEvent(state, {
      id: hitoEvId,
      dia,
      tipo: 'hito',
      zona: zone,
      hitoId: hito.id,
      nombre: hito.nombre,
      parcelaId: hito.parcelaId,
    });
    addLog(
      state,
      'gobernador',
      `hito:${hito.id}`,
      `Hito cumplido: ${hito.nombre}`,
      hito.descripcion,
      hitoEvId,
      hitoEvId
    );
  }
}

function setLeverValueImmediate(
  state: GameState,
  palanca: LeverKey,
  val: number | string
): void {
  const vig = state.gobierno.palancasVigentes;
  const tgt = state.gobierno.palancasObjetivo;
  switch (palanca) {
    case 'impuesto': {
      const next = clamp(Number(val), LEVER_BOUNDS.impuesto.min, LEVER_BOUNDS.impuesto.max);
      const prev = vig.impuesto;
      vig.impuesto = next;
      tgt.impuesto = next;
      recordControlEvent(state, 'tasa_impuesto', prev, next, 'impuesto');
      break;
    }
    case 'salarioPublico': {
      const next = clamp(Number(val), LEVER_BOUNDS.salarioPublico.min, LEVER_BOUNDS.salarioPublico.max);
      const prev = vig.salarioPublico;
      vig.salarioPublico = next;
      tgt.salarioPublico = next;
      recordControlEvent(state, 'salario_publico', prev, next, 'salario_publico');
      break;
    }
    case 'nivelObras': {
      const next = clamp(Math.round(Number(val)), 0, 5) as ServiceLevel;
      const prev = vig.nivelObras;
      const vivosCount = state.npcs.filter((n) => n.vivo).length;
      vig.nivelObras = next;
      tgt.nivelObras = next;
      recordControlEvent(
        state,
        'puestos.ingeniero',
        getObrasTargetJobs(vivosCount, prev),
        getObrasTargetJobs(vivosCount, next),
        'nivel_obras'
      );
      break;
    }
    case 'ayudaSocial': {
      const next = clamp(Number(val), LEVER_BOUNDS.ayudaSocial.min, LEVER_BOUNDS.ayudaSocial.max);
      const prev = vig.ayudaSocial;
      vig.ayudaSocial = next;
      tgt.ayudaSocial = next;
      recordControlEvent(state, 'ayuda_social', prev, next, 'ayuda_social');
      break;
    }
    case 'garantiaAlimentaria': {
      const next = clamp(
        Number(val),
        LEVER_BOUNDS.garantiaAlimentaria.min,
        LEVER_BOUNDS.garantiaAlimentaria.max
      );
      const prev = vig.garantiaAlimentaria;
      vig.garantiaAlimentaria = next;
      tgt.garantiaAlimentaria = next;
      recordControlEvent(state, 'garantia_pct', prev, next, 'garantia_alimentaria');
      break;
    }
    case 'precioMaximo': {
      const next: PriceCapMode =
        val === 'moderado' || val === 'estricto' ? val : 'libre';
      const prev = vig.precioMaximo;
      vig.precioMaximo = next;
      tgt.precioMaximo = next;
      recordControlEvent(state, 'tope_precio', prev, next, 'precio_maximo');
      break;
    }
    case 'comercioExterior': {
      const validSteps = FOREIGN_TRADE_STEPS.map((s) => s.value);
      const next = validSteps.includes(Number(val) as ForeignTradeStep)
        ? (Number(val) as ForeignTradeStep)
        : 0;
      const prev = vig.comercioExterior;
      vig.comercioExterior = next;
      tgt.comercioExterior = next;
      recordControlEvent(state, 'flujo_exterior_pct', prev, next, 'comercio_exterior');
      break;
    }
    case 'prensa': {
      const next = clamp(Number(val), LEVER_BOUNDS.prensa.min, LEVER_BOUNDS.prensa.max);
      const prev = vig.prensa;
      vig.prensa = next;
      tgt.prensa = next;
      recordControlEvent(state, 'fondos_prensa', prev, next, 'prensa');
      break;
    }
    case 'topeEmision': {
      const next = clamp(Number(val), LEVER_BOUNDS.topeEmision.min, LEVER_BOUNDS.topeEmision.max);
      const prev = vig.topeEmision;
      vig.topeEmision = next;
      tgt.topeEmision = next;
      recordControlEvent(state, 'tope_emision_pct', prev, next, 'tope_emision');
      break;
    }
  }
}

function rejectDemandInternal(
  state: GameState,
  demand: ActiveDemand,
  porVencimiento: boolean,
  escala = 1
): void {
  const dia = state.reloj.dia;
  const rejEvId = nextSeqId(state, `ev_${dia}`);
  emitSimEvent(state, {
    id: rejEvId,
    dia,
    tipo: 'demanda_rechazada',
    zona: 'centro',
    actorId: demand.actorId,
    demandaId: demand.demandaId,
    porVencimiento,
    causa: demand.causaId,
  });

  const until = dia + Math.max(2, Math.round(ACTOR_CONSTANTS.diasMedida * escala));
  let measure: ActorMeasure;

  if (demand.demandaId === 'bajen_impuestos') {
    const activeFirms = state.firmas.filter((f) => f.activa && f.empleados.length > 0);
    const worstFirm = [...activeFirms].sort((a, b) => a.factor - b.factor)[0];
    if (worstFirm) {
      worstFirm.despidosPendientes += ACTOR_CONSTANTS.despidosMedida;
    }
    const entId = worstFirm ? (worstFirm.rubro === 'agro' ? 'alimento' : worstFirm.id) : 'alimento';
    measure = {
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'despido_forzado',
      descripcion: `${worstFirm?.nombre ?? 'Empresas'} despide ${ACTOR_CONSTANTS.despidosMedida} empleados por rechazo fiscal.`,
      hastaDia: dia + 4,
      empresaId: entId,
      causaId: rejEvId,
    };
  } else if (demand.demandaId === 'liberen_precio') {
    measure = {
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'retencion_stock',
      descripcion: `Alimento retiene parte del stock diario durante ${ACTOR_CONSTANTS.diasMedida} días.`,
      hastaDia: until,
      empresaId: 'alimento',
      causaId: rejEvId,
    };
  } else if (demand.demandaId === 'abran_exportacion') {
    measure = {
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'sin_inversion',
      descripcion: `Empresarios frenan inversión en nuevas obras por ${ACTOR_CONSTANTS.diasMedida} días.`,
      hastaDia: until,
      causaId: rejEvId,
    };
  } else if (demand.demandaId === 'sindicato_salarios' || demand.demandaId === 'vecinos_comida' || demand.demandaId === 'vecinos_obras') {
    const m = extraActorMeasure(state, demand, rejEvId, until);
    if (!m) return;
    measure = m;
  } else if (demand.demandaId === 'mas_pauta') {
    measure = {
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'campana',
      descripcion: `${demand.actorNombre} sostiene campaña crítica contra la gestión (${ACTOR_CONSTANTS.diasMedida}d).`,
      hastaDia: until,
      medioId: demand.actorId,
      tono: 'critico',
      causaId: rejEvId,
    };
  } else {
    measure = {
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'campana',
      descripcion: `${demand.actorNombre} despliega cobertura alarmista sobre el hambre (${ACTOR_CONSTANTS.diasMedida}d).`,
      hastaDia: until,
      medioId: demand.actorId,
      tema: 'hambre',
      tono: 'alarmista',
      causaId: rejEvId,
    };
  }

  state.medidasVigentes.push(measure);
  const medEvId = nextSeqId(state, `ev_${dia}`);
  emitSimEvent(state, {
    id: medEvId,
    dia,
    tipo: 'medida',
    zona: 'centro',
    actorId: demand.actorId,
    medida: measure.tipo,
    hastaDia: measure.hastaDia,
    causa: rejEvId,
  });
  addLog(
    state,
    'gobernador',
    `actor:${demand.actorId}/medida`,
    `${demand.actorNombre}: ${porVencimiento ? 'plazo vencido' : 'demanda rechazada'}`,
    measure.descripcion,
    rejEvId,
    medEvId
  );
}

export function respondToDemand(
  state: GameState,
  demandId: string,
  accept: boolean
): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') {
    return { ok: false, error: 'La partida ya finalizó.' };
  }
  const idx = state.demandasActivas.findIndex((d) => d.id === demandId);
  if (idx === -1) {
    return { ok: false, error: 'La demanda ya no está activa.' };
  }
  const [demand] = state.demandasActivas.splice(idx, 1);
  const dia = state.reloj.dia;
  state.cooldownActorDemanda[demand.actorId] = dia + ACTOR_CONSTANTS.diasEntreDemandas;

  if (!accept) {
    rejectDemandInternal(state, demand, false);
    return { ok: true };
  }

  setLeverValueImmediate(state, demand.pedido.palanca, demand.pedido.nuevoValor);
  state.bloqueosPalanca = state.bloqueosPalanca.filter((b) => b.palanca !== demand.pedido.palanca);
  state.bloqueosPalanca.push({
    palanca: demand.pedido.palanca,
    actorId: demand.actorId,
    actorNombre: demand.actorNombre,
    demandaId: demand.demandaId,
    hastaDia: dia + demand.diasCompromiso,
    motivo: `${demand.actorNombre}: ${demand.pedido.etiqueta}`,
  });

  if (demand.demandaId === 'silencio_pagado') {
    state.medidasVigentes.push({
      id: nextSeqId(state, `med_${dia}`),
      actorId: demand.actorId,
      actorNombre: demand.actorNombre,
      tipo: 'campana',
      descripcion: `Pauta acordada: ${demand.actorNombre} mantiene tono favorable sobre el hambre (${demand.diasCompromiso}d).`,
      hastaDia: dia + demand.diasCompromiso,
      medioId: demand.actorId,
      tema: 'hambre',
      tono: 'favorable',
      causaId: demand.causaId,
    });
  }

  const accEvId = nextSeqId(state, `ev_${dia}`);
  emitSimEvent(state, {
    id: accEvId,
    dia,
    tipo: 'demanda_aceptada',
    zona: 'centro',
    actorId: demand.actorId,
    demandaId: demand.demandaId,
    palanca: demand.pedido.palanca,
    causa: demand.causaId,
  });
  addLog(
    state,
    'gobernador',
    `actor:${demand.actorId}/aceptada`,
    `Acuerdo con ${demand.actorNombre}: ${demand.titulo}`,
    `${demand.pedido.etiqueta}. Palanca bloqueada por ${demand.diasCompromiso} días.`,
    demand.causaId,
    accEvId
  );
  return { ok: true };
}

function stepDemandsAndMeasuresDaily(state: GameState): void {
  const dia = state.reloj.dia;
  state.bloqueosPalanca = state.bloqueosPalanca.filter((b) => dia < b.hastaDia);
  state.medidasVigentes = state.medidasVigentes.filter((m) => dia < m.hastaDia);

  const expired: ActiveDemand[] = [];
  const stillOpen: ActiveDemand[] = [];
  for (const d of state.demandasActivas) {
    d.diasRestantes -= 1;
    if (d.diasRestantes <= 0) expired.push(d);
    else stillOpen.push(d);
  }
  state.demandasActivas = stillOpen;

  for (const d of expired) {
    state.cooldownActorDemanda[d.actorId] = dia + ACTOR_CONSTANTS.diasEntreDemandas;
    rejectDemandInternal(state, d, true);
  }
}

function evaluateActorDemands(state: GameState, derived: CommunityDerived): void {
  const dia = state.reloj.dia;
  if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) return;

  const vig = state.gobierno.palancasVigentes;
  const pushDemand = (
    actorId: string,
    actorNombre: string,
    demandaId: DemandId,
    titulo: string,
    razon: string,
    amenaza: string,
    palanca: LeverKey,
    nuevoValor: number | string,
    etiqueta: string,
    causaId?: string
  ): boolean => {
    if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) return false;
    if (state.demandasActivas.some((d) => d.actorId === actorId)) return false;
    if (dia < (state.cooldownActorDemanda[actorId] ?? 0)) return false;
    if (isLeverLocked(state, palanca)) return false;

    const dObj: ActiveDemand = {
      id: nextSeqId(state, `dem_${dia}`),
      actorId,
      actorNombre,
      demandaId,
      titulo,
      razon,
      amenaza,
      pedido: { palanca, nuevoValor, etiqueta },
      diaCreada: dia,
      diasRestantes: ACTOR_CONSTANTS.diasRespuesta,
      diasCompromiso: ACTOR_CONSTANTS.diasCompromiso,
      causaId,
    };
    state.demandasActivas.push(dObj);
    const evId = nextSeqId(state, `ev_${dia}`);
    emitSimEvent(state, {
      id: evId,
      dia,
      tipo: 'demanda',
      zona: 'centro',
      actorId,
      demandaId,
      diasRespuesta: dObj.diasRestantes,
      causa: causaId,
    });
    addLog(
      state,
      'gobernador',
      `actor:${actorId}/demanda`,
      `Demanda de ${actorNombre}: ${titulo}`,
      `${razon} · Pide: ${etiqueta} (${dObj.diasRestantes}d de plazo).`,
      causaId,
      evId
    );
    return true;
  };

  // 1. Empresarios
  const canEmpresarios =
    !state.demandasActivas.some((d) => d.actorId === 'empresarios') &&
    dia >= (state.cooldownActorDemanda['empresarios'] ?? 0);

  if (canEmpresarios) {
    const lowFactorStreak = state.firmas.some(
      (f) => f.activa && f.periodosFactorBajo >= ACTOR_CONSTANTS.periodosBajoParaDemanda
    );
    const agroUnderOne = state.firmas.some((f) => f.activa && f.rubro === 'agro' && f.factor < 1);
    if (
      (lowFactorStreak || vig.impuesto > ACTOR_CONSTANTS.umbralImpuestoDemanda) &&
      vig.impuesto > LEVER_BOUNDS.impuesto.min
    ) {
      const nextTax = Math.max(LEVER_BOUNDS.impuesto.min, vig.impuesto - 5);
      pushDemand(
        'empresarios',
        'Empresarios',
        'bajen_impuestos',
        'Rebaja impositiva',
        lowFactorStreak
          ? 'Dos períodos seguidos con factor salarial bajo 100%.'
          : `La tasa impositiva supera el umbral de ${ACTOR_CONSTANTS.umbralImpuestoDemanda}%.`,
        `Despido forzado de ${ACTOR_CONSTANTS.despidosMedida} empleados en la empresa más afectada.`,
        'impuesto',
        nextTax,
        `Bajar impuesto a ${nextTax}%`,
        state.ultimaCausaPalanca || state.ultimoEventoEmpresaId
      );
    } else if (
      (vig.precioMaximo === 'estricto' || vig.precioMaximo === 'moderado') &&
      agroUnderOne
    ) {
      const nextCap: PriceCapMode = vig.precioMaximo === 'estricto' ? 'moderado' : 'libre';
      pushDemand(
        'empresarios',
        'Empresarios',
        'liberen_precio',
        'Flexibilizar precio máximo',
        `El tope ${vig.precioMaximo} comprime los ingresos del sector alimento.`,
        `Retención parcial del stock diario de comida durante ${ACTOR_CONSTANTS.diasMedida} días.`,
        'precioMaximo',
        nextCap,
        `Pasar tope a ${nextCap}`,
        state.ultimaCausaPalanca ||
          state.firmas.find((f) => f.activa && f.rubro === 'agro')?.ultimaCausa
      );
    } else if (
      state.alimento.diasStock >= Math.max(10, state.alimento.siloDias - 3) &&
      vig.comercioExterior >= 0
    ) {
      pushDemand(
        'empresarios',
        'Empresarios',
        'abran_exportacion',
        'Habilitar exportación',
        'El silo de alimentos está cerca de su capacidad máxima.',
        `Frenan inversiones privadas en nuevos campos y locales por ${ACTOR_CONSTANTS.diasMedida} días.`,
        'comercioExterior',
        -50,
        'Pasar comercio exterior a Exportar (-50%)',
        state.ultimaCausaPalanca
      );
    }
  }

  // 2. Medios
  for (const medio of state.medios) {
    if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) break;
    if (state.demandasActivas.some((d) => d.actorId === medio.id)) continue;
    if (dia < (state.cooldownActorDemanda[medio.id] ?? 0)) continue;

    const recentBadNews = state.noticias.some(
      (n) =>
        n.medioId === medio.id &&
        dia - n.dia <= 5 &&
        (n.tono === 'critico' || n.tono === 'alarmista')
    );

    if (
      medio.finanzas.dependenciaPct < ACTOR_CONSTANTS.umbralPautaPct &&
      recentBadNews &&
      vig.prensa < LEVER_BOUNDS.prensa.max
    ) {
      const nextPrensa = Math.min(LEVER_BOUNDS.prensa.max, vig.prensa + 10);
      pushDemand(
        medio.id,
        medio.nombre,
        'mas_pauta',
        'Aumento de pauta oficial',
        `Dependencia estatal baja (${medio.finanzas.dependenciaPct.toFixed(0)}%) tras coberturas críticas.`,
        `Campaña sostenida en tono crítico durante ${ACTOR_CONSTANTS.diasMedida} días.`,
        'prensa',
        nextPrensa,
        `Subir fondos de prensa a $${nextPrensa}`,
        state.ultimaCausaPalanca
      );
    } else if (
      medio.lineaEditorial.afinidadGobierno >= 55 &&
      derived.hambreCriticaPct >= PRESS_CONSTANTS.hambreSubaUmbralPct &&
      vig.prensa < LEVER_BOUNDS.prensa.max
    ) {
      const nextPrensa = Math.min(LEVER_BOUNDS.prensa.max, vig.prensa + 10);
      pushDemand(
        medio.id,
        medio.nombre,
        'silencio_pagado',
        'Acuerdo editorial por pauta',
        `El hambre crítica alcanzó ${derived.hambreCriticaPct.toFixed(1)}% y piden pauta adicional.`,
        `Campaña alarmista sobre el hambre durante ${ACTOR_CONSTANTS.diasMedida} días.`,
        'prensa',
        nextPrensa,
        `Subir prensa a $${nextPrensa} (tono favorable en hambre)`,
        state.ultimoEventoClimaId || state.ultimaCausaPalanca
      );
    }
  }
}

function applyModifierToNpc(
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

function applyInstantModifierToNpc(
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
  state?: GameState | { rng?: SubsystemRngState; rngState: number; ultimaVariantePorAccion?: Record<string, number> },
  roleName?: string,
  zoneName?: string,
  sub: SubsystemName = 'caos'
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
    chosenIdx = candidates[Math.floor(drawSubRand(state, sub) * candidates.length)];
  } else {
    chosenIdx = Math.floor(drawSubRand(state, sub) * pool.length);
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

interface EligibilityContext {
  zonesCount: number;
  minCash: number;
  activePhenomTypes: Set<PhenomenonType>;
  announcedPhenomTypes: Set<PhenomenonType>;
  roleTotal: Partial<Record<RoleId, number>>;
  roleOut: Partial<Record<RoleId, number>>;
  lowPantryCountByZone: Partial<Record<ZoneId, number>>;
  lowHealthCountByZone: Partial<Record<ZoneId, number>>;
  hogaresById: Map<string, Hogar>;
  casasById: Map<string, Casa>;
  streetZones: Set<ZoneId>;
  cuttingFirmIds: Set<string>;
  anyFirmUnderOne: boolean;
  focusCounts: Map<string, number>;
  totalFocos: number;
}

function createEligibilityContext(state: GameState): EligibilityContext {
  const zonesCount = getWorldZones(state).length;
  const activePhenomTypes = new Set(getActivePhenomena(state).map((f) => f.tipo));
  const announcedPhenomTypes = new Set(getAnnouncedPhenomena(state).map((f) => f.tipo));
  const roleTotal: Partial<Record<RoleId, number>> = Object.create(null);
  const roleOut: Partial<Record<RoleId, number>> = Object.create(null);
  const lowPantryCountByZone: Partial<Record<ZoneId, number>> = {};
  const lowHealthCountByZone: Partial<Record<ZoneId, number>> = {};
  const hogaresById = new Map<string, Hogar>();
  const streetZones = new Set<ZoneId>();
  for (const h of state.hogares) {
    hogaresById.set(h.id, h);
    if (h.estado === 'calle') streetZones.add(h.zona);
  }
  const casasById = new Map<string, Casa>(state.casas.map((c) => [c.id, c]));
  const cuttingFirmIds = new Set<string>();
  let anyFirmUnderOne = false;
  for (const f of state.firmas) {
    if (!f.activa) continue;
    if (f.factor < 1) anyFirmUnderOne = true;
    if (f.factor < 0.9 || f.ultimoTramo === 'despido' || f.despidosPendientes > 0) {
      cuttingFirmIds.add(f.id);
    }
  }
  const focusCounts = new Map<string, number>();
  let totalFocos = 0;

  for (const n of state.npcs) {
    if (!n.vivo) continue;
    roleTotal[n.rol] = (roleTotal[n.rol] || 0) + 1;
    if (n.accionIa?.fueraDePuesto) {
      roleOut[n.rol] = (roleOut[n.rol] || 0) + 1;
    }
    if (n.accionIa?.tipo === 'espontanea' && n.accionIa.esFoco) {
      totalFocos++;
      focusCounts.set(n.accionIa.id, (focusCounts.get(n.accionIa.id) || 0) + 1);
    }
    if (!n.hospital.internado) {
      const z = getEffectiveZone(n, zonesCount);
      const hog = hogaresById.get(n.hogarId);
      const despensaPP = hog
        ? hog.despensa / Math.max(1, hog.miembros.length)
        : 0;
      if (despensaPP < ECON_CONSTANTS.umbralDespensaBaja) {
        lowPantryCountByZone[z] = (lowPantryCountByZone[z] || 0) + 1;
      }
      if (n.variables.salud < ECON_CONSTANTS.umbralSaludBaja) {
        lowHealthCountByZone[z] = (lowHealthCountByZone[z] || 0) + 1;
      }
    }
  }

  return {
    zonesCount,
    minCash: Math.max(4, state.alimento.precio * 1.5),
    activePhenomTypes,
    announcedPhenomTypes,
    roleTotal,
    roleOut,
    lowPantryCountByZone,
    lowHealthCountByZone,
    hogaresById,
    casasById,
    streetZones,
    cuttingFirmIds,
    anyFirmUnderOne,
    focusCounts,
    totalFocos,
  };
}

export function canRoleLeavePost(
  state: GameState,
  role: RoleId,
  ctx?: EligibilityContext
): boolean {
  if (ctx) {
    const total = ctx.roleTotal[role] || 0;
    if (total === 0) return false;
    const out = ctx.roleOut[role] || 0;
    return ((out + 1) / total) * 100 <= state.config.caos.maxPctRolFueraDePuesto;
  }
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
  state: GameState
): void {
  const targetZone =
    actionId === 'huelga' || actionId === 'protesta'
      ? 'civico'
      : ['saqueo', 'organizar_fiesta', 'cantar_en_plaza', 'organizar_asamblea'].includes(actionId)
      ? 'mercado'
      : npc.zona;
  if (['protesta', 'huelga', 'predicar', 'saqueo', 'organizar_asamblea', 'organizar_fiesta', 'cantar_en_plaza'].includes(actionId)) {
    npc.mapa.destino = getZoneCanvasPosition(state.zonas[targetZone] ? targetZone : npc.zona, state, state.zonas);
  }
  npc.mapa.accion = actionName.toLowerCase();
}

function resetNpcIdleLocation(npc: Npc, state: GameState): void {
  npc.mapa.accion =
    npc.rol === 'estudiante'
      ? 'estudiando'
      : npc.rol === 'jubilado' || npc.rol === 'desempleado'
      ? 'paseando'
      : 'trabajando';
  npc.mapa.destino = getZoneCanvasPosition(npc.zona, state, state.zonas);
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
  const hogar = state.hogares.find((h) => h.id === npc.hogarId);

  for (const ef of action.efectos) {
    if (
      ef.id === 'fuera_de_puesto' ||
      ef.id === 'moviliza' ||
      ef.id === 'decorativa' ||
      ef.id === 'cuida' ||
      ef.id === 'comparte' ||
      ef.id === 'toma'
    ) {
      continue;
    }

    if (ef.id === 'repara') {
      if (ef.alcance === 'hogar' && hogar?.casaId) {
        const casa = state.casas.find((c) => c.id === hogar.casaId);
        if (casa) {
          const spec = EFFECT_CATALOG.repara[ef.intensidad ?? 'media'];
          const prevEstado = casa.estado;
          casa.estado = clamp(Number((casa.estado + spec.pesoReparador * 5).toFixed(1)), 0, 100);
          if (casa.estado !== prevEstado) {
            emitSimEvent(state, {
              id: nextSeqId(state, `ev_${state.reloj.dia}`),
              dia: state.reloj.dia,
              tipo: 'casa_estado',
              zona: casa.zona,
              casaId: casa.id,
              estado: casa.estado,
              causa: causaId || 'vivienda:remodelacion',
            });
          }
        }
      }
      continue;
    }

    if (ef.id === 'ocupa') {
      if (hogar && !hogar.casaId && !hogar.ocupandoCasaId) {
        const emptyCasa =
          state.casas.find(
            (c) => !c.hogarId && !c.ocupadaPorAccion && c.zona === effZone && c.estado > 15
          ) ?? state.casas.find((c) => !c.hogarId && !c.ocupadaPorAccion && c.estado > 15);
        if (emptyCasa) {
          emptyCasa.ocupadaPorAccion = true;
          hogar.ocupandoCasaId = emptyCasa.id;
        }
      }
      continue;
    }

    if (ef.id === 'boicotea') {
      if (npc.accionIa && !npc.accionIa.firmaObjetivoId) {
        const umbralPrecio =
          ECON_CONSTANTS.precioBaseAlimento * FIRM_CONSTANTS.umbralBoicotPrecioFactor;
        const zonePrice =
          state.ultimaSalidaEconomica.precioAlimento[effZone] ?? state.alimento.precio;
        const abusive = [...state.firmas]
          .filter((f) => {
            if (!f.activa) return false;
            const share = f.cuotaZona[effZone] ?? 0;
            if (share < FIRM_CONSTANTS.umbralBoicotCuota) return false;
            const markupAbusive =
              1 + (f.margenPoder ?? 0) >= FIRM_CONSTANTS.umbralBoicotPrecioFactor;
            const foodAbusive =
              (f.rubro === 'comercio' || f.rubro === 'agro') && zonePrice >= umbralPrecio;
            return markupAbusive || foodAbusive;
          })
          .sort(
            (a, b) =>
              (b.cuotaZona[effZone] ?? 0) * (1 + (b.margenPoder ?? 0)) -
              (a.cuotaZona[effZone] ?? 0) * (1 + (a.margenPoder ?? 0))
          )[0];
        const fallbackDom =
          abusive ??
          [...state.firmas]
            .filter((f) => f.activa)
            .sort((a, b) => (b.cuotaZona[effZone] ?? 0) - (a.cuotaZona[effZone] ?? 0))[0];
        if (fallbackDom) npc.accionIa.firmaObjetivoId = fallbackDom.id;
      }
      continue;
    }

    if (ef.id === 'emprendedor') {
      const spec = EFFECT_CATALOG.emprendedor[ef.intensidad ?? 'media'];
      applyModifierToNpc(
        npc,
        {
          afecta: { propensionEmprender: spec.bonusPropension },
          duracionDias: duracion,
          origen,
          causa: causaId,
          texto,
        },
        state
      );
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
      } else if (ef.alcance === 'hogar' && hogar) {
        for (const mid of hogar.miembros) {
          const member = state.npcs.find((n) => n.id === mid && n.vivo);
          if (!member) continue;
          applyModifierToNpc(
            member,
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
      const adultTargets = hogar
        ? hogar.miembros
            .map((mid) => state.npcs.find((n) => n.id === mid && n.vivo && n.edad >= 18))
            .filter((n): n is Npc => Boolean(n))
        : [npc];
      const targets = adultTargets.length > 0 ? adultTargets : [npc];
      for (const target of targets) {
        applyModifierToNpc(
          target,
          {
            afecta: { miedo: spec.miedo },
            duracionDias: duracion,
            origen,
            causa: causaId,
            texto: target.id === npc.id ? texto : `${npc.nombre}: ${action.nombre}`,
          },
          state
        );
      }
    } else if (ef.id === 'gasta') {
      const spec = EFFECT_CATALOG.gasta[ef.intensidad ?? 'media'];
      const adultTargets = hogar
        ? hogar.miembros
            .map((mid) => state.npcs.find((n) => n.id === mid && n.vivo && n.edad >= 18))
            .filter((n): n is Npc => Boolean(n))
        : [npc];
      const targets = adultTargets.length > 0 ? adultTargets : [npc];
      for (const target of targets) {
        applyModifierToNpc(
          target,
          {
            afecta: { propensionGasto: spec.propensionDelta },
            duracionDias: duracion,
            origen,
            causa: causaId,
            texto: target.id === npc.id ? texto : `${npc.nombre}: ${action.nombre}`,
          },
          state
        );
      }
    } else if (ef.id === 'ahorra') {
      const spec = EFFECT_CATALOG.ahorra[ef.intensidad ?? 'media'];
      const adultTargets = hogar
        ? hogar.miembros
            .map((mid) => state.npcs.find((n) => n.id === mid && n.vivo && n.edad >= 18))
            .filter((n): n is Npc => Boolean(n))
        : [npc];
      const targets = adultTargets.length > 0 ? adultTargets : [npc];
      for (const target of targets) {
        applyModifierToNpc(
          target,
          {
            afecta: { propensionGasto: spec.propensionDelta },
            duracionDias: duracion,
            origen,
            causa: causaId,
            texto: target.id === npc.id ? texto : `${npc.nombre}: ${action.nombre}`,
          },
          state
        );
      }
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
  causaId?: string,
  firmaObjetivoId?: string
): void {
  const [minD, maxD] = action.duracionDias;
  const maxAllowed = action.tipo === 'espontanea' ? state.config.caos.duracionMaxDias : maxD;
  const duracion = clamp(
    Math.round(minD + drawSubRand(state, 'caos') * (maxD - minD)),
    1,
    maxAllowed
  );
  const origen = `accion:${action.id}/${fuente}`;
  const zonesCount = getWorldZones(state).length;
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
    firmaObjetivoId,
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
      releaseOcupacionIfUnused(state, npc);
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

  const ctx = createEligibilityContext(state);
  const idleByZone: Partial<Record<ZoneId, Npc[]>> = {};
  for (const n of state.npcs) {
    if (!n.vivo || n.hospital.internado || n.accionIa) continue;
    const z = getEffectiveZone(n, zonesCount);
    const bucket = idleByZone[z];
    if (bucket) bucket.push(n);
    else idleByZone[z] = [n];
  }

  const { orden, satMediaZona } = computePoliceSplitAndMetrics(state);
  const infectedGroups: Array<{
    action: ActionDefinition;
    zone: ZoneId;
    focusEventId?: string;
    npcIds: string[];
  }> = [];

  // Contagion caps for ocupacion & boicot (CASAS_V2 / FIRMAS_V2)
  const occupiedHogaresSet = new Set(
    state.hogares.filter((h) => Boolean(h.ocupandoCasaId)).map((h) => h.id)
  );
  let emptyHabitableCount = state.casas.filter(
    (c) => !c.hogarId && !c.ocupadaPorAccion && c.estado > HOUSING_CONSTANTS.umbralAbandonoCasa
  ).length;
  const boicotHogaresSet = new Set(
    state.npcs
      .filter((n) => n.vivo && n.accionIa?.id === 'boicot')
      .map((n) => n.hogarId)
  );
  const maxBoicotHogares = Math.max(
    2,
    Math.round(state.hogares.length * (FIRM_CONSTANTS.maxPctHogaresBoicot / 100))
  );

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
    const outOfPost = hasOutOfPostEffect(action);
    const movesZone = zonesCount > 1 && action.efectos.some((e) => e.id === 'moviliza');
    const zonaDestino = movesZone ? action.zonaDestino : undefined;
    const newlyInfectedIds: string[] = [];
    const zoneCandidates = idleByZone[zone] || [];

    for (const other of zoneCandidates) {
      if (other.accionIa) continue;
      if (action.id === 'paro_firma' && focusAct.firmaObjetivoId && other.empleadorId !== focusAct.firmaObjetivoId) {
        continue;
      }
      if (action.id === 'ocupacion') {
        if (
          !occupiedHogaresSet.has(other.hogarId) &&
          (occupiedHogaresSet.size >= HOUSING_CONSTANTS.maxOcupacionesPorPeriodo || emptyHabitableCount <= 0)
        ) {
          continue;
        }
      }
      if (action.id === 'boicot') {
        if (!boicotHogaresSet.has(other.hogarId) && boicotHogaresSet.size >= maxBoicotHogares) {
          continue;
        }
      }
      if (!isNpcEligibleForAction(other, action, state, ctx)) continue;
      if (requiresOutOfPostCap && !canRoleLeavePost(state, other.rol, ctx)) continue;

      const affinityFactor = clamp(scoreActionAffinity(other, action) / 100, 0.3, 1.5);
      const prob = clamp(action.contagio * exposure * brake * affinityFactor, 0, 0.95);
      if (drawSubRand(state, 'caos') >= prob) continue;

      const zoneName = other.zona || 'centro';
      const copyText = pickActionText(
        action,
        other.nombre,
        state,
        ROLE_CATALOG[other.rol].nombre.toLowerCase(),
        zoneName,
        'caos'
      );
      other.accionIa = {
        id: action.id,
        nombre: action.nombre,
        tipo: action.tipo,
        efectos: action.efectos,
        fueraDePuesto: outOfPost,
        zonaDestino,
        firmaObjetivoId: focusAct.firmaObjetivoId,
        diasRestantes: focusAct.diasRestantes,
        duracionTotal: focusAct.duracionTotal,
        esFoco: false,
        focoNpcId: focus.id,
        focoEventId: focusAct.focoEventId,
        origen,
        causa: focusAct.focoEventId,
        texto: copyText,
      };
      if (outOfPost) {
        ctx.roleOut[other.rol] = (ctx.roleOut[other.rol] || 0) + 1;
      }
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
      if (action.id === 'ocupacion') {
        const hog = ctx.hogaresById.get(other.hogarId);
        if (hog?.ocupandoCasaId && !occupiedHogaresSet.has(hog.id)) {
          occupiedHogaresSet.add(hog.id);
          emptyHabitableCount = Math.max(0, emptyHabitableCount - 1);
        }
      }
      if (action.id === 'boicot') {
        boicotHogaresSet.add(other.hogarId);
      }
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

function isNpcEligibleForAction(
  npc: Npc,
  action: ActionDefinition,
  state?: GameState,
  eligCtx?: EligibilityContext
): boolean {
  if (!npc.vivo || npc.hospital.internado) return false;
  const req = action.requisitos;
  const stage = getStage(npc.edad);
  if (req.etapa && stage !== req.etapa) return false;
  if (req.publico && !ROLE_CATALOG[npc.rol].publico) return false;
  if (req.rolNoEn && req.rolNoEn.includes(npc.rol)) return false;
  if (req.conEmpleo && ['desempleado', 'jubilado', 'estudiante'].includes(npc.rol)) return false;

  const hogar = eligCtx
    ? eligCtx.hogaresById.get(npc.hogarId)
    : state?.hogares.find((h) => h.id === npc.hogarId);
  const hogCash = hogar ? hogar.dinero : 0;
  const hogPantryPP = hogar
    ? hogar.despensa / Math.max(1, hogar.miembros.length)
    : 0;

  if (req.conDinero) {
    const minCash = eligCtx ? eligCtx.minCash : state ? Math.max(4, state.alimento.precio * 1.5) : 6;
    if (hogCash < minCash) return false;
  }
  if (req.conDespensa && hogPantryPP <= ECON_CONSTANTS.umbralDespensaBaja) {
    return false;
  }
  if (req.conHambre && npc.variables.hambre <= 55) {
    return false;
  }
  if (req.conCasa && (!hogar || hogar.estado !== 'con_casa' || !hogar.casaId)) {
    return false;
  }
  if (req.sinCasa && (!hogar || hogar.estado !== 'calle')) {
    return false;
  }
  if (req.conHogarGrande && (!hogar || hogar.miembros.length < 3)) {
    return false;
  }
  if (req.conJubiladoEnHogar) {
    if (!hogar || !state) return false;
    const hasRetiree = hogar.miembros.some((mid) => {
      const m = state.npcs.find((n) => n.id === mid);
      return Boolean(m && m.vivo && (m.rol === 'jubilado' || m.edad >= 65));
    });
    if (!hasRetiree) return false;
  }
  if (req.casaEnMalEstado) {
    if (!hogar?.casaId) return false;
    const casa = eligCtx
      ? eligCtx.casasById.get(hogar.casaId)
      : state?.casas.find((c) => c.id === hogar.casaId);
    if (!casa || casa.estado >= 60) return false;
  }

  if (state && action.contexto) {
    const ctx = action.contexto;
    const zonesCount = eligCtx ? eligCtx.zonesCount : getWorldZones(state).length;
    const effZone = getEffectiveZone(npc, zonesCount);

    if (ctx.vecinoEnCalle) {
      const hasStreet = eligCtx
        ? eligCtx.streetZones.has(effZone)
        : state.hogares.some((h) => h.estado === 'calle' && h.zona === effZone);
      if (!hasStreet) return false;
    }
    if (ctx.firmaEnRecorte) {
      const anyCut = eligCtx
        ? eligCtx.anyFirmUnderOne || eligCtx.cuttingFirmIds.size > 0
        : state.firmas.some((f) => f.activa && (f.factor < 1 || f.ultimoTramo === 'despido'));
      if (!anyCut) return false;
    }

    if (eligCtx) {
      if (ctx.fenomeno && !eligCtx.activePhenomTypes.has(ctx.fenomeno)) {
        return false;
      }
      if (ctx.fenomenoAnunciadoOActivo) {
        const hasFen =
          eligCtx.activePhenomTypes.has(ctx.fenomenoAnunciadoOActivo) ||
          eligCtx.announcedPhenomTypes.has(ctx.fenomenoAnunciadoOActivo);
        if (!hasFen) return false;
      }
      if (typeof ctx.zonaIntegridadMenorA === 'number') {
        if ((state.gobierno.integridad[effZone] ?? 100) >= ctx.zonaIntegridadMenorA) {
          return false;
        }
      }
      if (ctx.vecinoDespensaBaja) {
        const selfLow = hogPantryPP < ECON_CONSTANTS.umbralDespensaBaja ? 1 : 0;
        if ((eligCtx.lowPantryCountByZone[effZone] || 0) <= selfLow) return false;
      }
      if (ctx.vecinoSaludBaja) {
        const selfSick = npc.variables.salud < ECON_CONSTANTS.umbralSaludBaja ? 1 : 0;
        if ((eligCtx.lowHealthCountByZone[effZone] || 0) <= selfSick) return false;
      }
    } else {
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
        const hogById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
        const hasLowPantry = state.npcs.some((other) => {
          if (!other.vivo || other.id === npc.id || other.hospital.internado) return false;
          if (getEffectiveZone(other, zonesCount) !== effZone) return false;
          const oh = hogById.get(other.hogarId);
          const opp = oh ? oh.despensa / Math.max(1, oh.miembros.length) : 0;
          return opp < ECON_CONSTANTS.umbralDespensaBaja;
        });
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

export function selectCandidateActions(
  npc: Npc,
  state?: GameState,
  eligCtx?: EligibilityContext
): ActionDefinition[] {
  const valid = ACTION_TABLE.filter((a) => {
    if (a.tipo !== 'espontanea') return false;
    if (!isNpcEligibleForAction(npc, a, state, eligCtx)) return false;
    if (state && hasOutOfPostEffect(a) && !canRoleLeavePost(state, npc.rol, eligCtx)) return false;
    return true;
  });
  if (valid.length === 0) return [];

  let filtered = valid;
  if (state) {
    let focusCounts: Map<string, number>;
    let totalFocos: number;
    if (eligCtx) {
      focusCounts = eligCtx.focusCounts;
      totalFocos = eligCtx.totalFocos;
    } else {
      focusCounts = new Map<string, number>();
      totalFocos = 0;
      for (const n of state.npcs) {
        if (n.vivo && n.accionIa?.tipo === 'espontanea' && n.accionIa.esFoco) {
          totalFocos++;
          focusCounts.set(n.accionIa.id, (focusCounts.get(n.accionIa.id) || 0) + 1);
        }
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
      const idx = Math.floor(drawSubRand(state, 'caos') * pool.length);
      picked.push(pool.splice(idx, 1)[0].a);
      continue;
    }
    let r = drawSubRand(state, 'caos') * totalW;
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
  if (state.config.nivelMundo === 'M0') {
    return { allowed: false, reason: 'M0' };
  }
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
  const ctx = createEligibilityContext(state);
  const eligible = state.npcs.filter(
    (n) =>
      n.vivo &&
      !n.hospital.internado &&
      !n.accionIa &&
      getStage(n.edad) === 'adulto' &&
      selectCandidateActions(n, state, ctx).length > 0
  );
  if (eligible.length === 0) return null;

  const dia = state.reloj.dia;
  const recentLimit = dia - DIRECTOR_CONSTANTS.recienteVentanaDias;
  const recentNpcs = new Set<string>();
  const recentHogares = new Set<string>();
  const recentFirmas = new Set<string>();
  for (const ev of state.eventos) {
    if (ev.dia < recentLimit) break;
    if (ev.tipo === 'nacimiento') {
      recentHogares.add(ev.hogarId);
      for (const pid of ev.padresIds) recentNpcs.add(pid);
    } else if (ev.tipo === 'desalojo') {
      recentHogares.add(ev.hogarId);
    } else if (ev.tipo === 'herencia') {
      for (const aid of ev.aIds) recentNpcs.add(aid);
    } else if (ev.tipo === 'firma_quiebra') {
      recentFirmas.add(ev.firmaId);
    } else if (ev.tipo === 'firma_compra') {
      recentNpcs.add(ev.compradorId);
      recentFirmas.add(ev.firmaId);
    }
  }

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
    );
    const hasRecentFamilyOrAsset =
      recentNpcs.has(n.id) ||
      recentHogares.has(n.hogarId) ||
      (n.empleadorId ? recentFirmas.has(n.empleadorId) : false) ||
      n.partes.some((p) => recentFirmas.has(p.firmaId)) ||
      (n.ultimaPerdidaFamiliarDia !== undefined && n.ultimaPerdidaFamiliarDia >= recentLimit);
    const recentScore = hasRecentMod || hasRecentFamilyOrAsset ? 1 : 0;
    const interest =
      1 +
      DIRECTOR_CONSTANTS.kExtremo * extremeTraits +
      DIRECTOR_CONSTANTS.kDescontento * isDiscontent +
      DIRECTOR_CONSTANTS.kReciente * recentScore;
    return { n, interest };
  });

  const totalInterest = weighted.reduce((acc, item) => acc + item.interest, 0);
  if (totalInterest <= 0) {
    return weighted[Math.floor(drawSubRand(state, 'caos') * weighted.length)].n;
  }
  let r = drawSubRand(state, 'caos') * totalInterest;
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
    applyActionToNpc(state, npc, action, text, fuente, fallbackCause, win.firmaObjetivoId);
  }

  win.estado = 'resuelta';
  addLog(
    state,
    'caos',
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
    medio: medio.nombre,
    tema: enrichedArticle.tema,
    tono: enrichedArticle.tono,
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
      const rebeldia = getEffectiveTrait(n, 'rebeldia') / 100;
      const valentia = getEffectiveTrait(n, 'valentia') / 100;
      const rebPref = (1 - medio.lineaEditorial.afinidadGobierno / 100) * rebeldia * 20;
      const sensPref =
        (medio.lineaEditorial.sensacionalismo / 100) * (10 + rebeldia * 10 + (1 - valentia) * 10);
      return { n, score: 100 - affinityDiff + rebPref + sensPref + drawSubRand(state, 'prensa') * 25 };
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
      const satDelta = Math.max(1, Math.round(cappedMag * 0.5));
      const afecta: Partial<Record<NpcVariable, number>> =
        enrichedArticle.tono === 'alarmista'
          ? {
              miedo: cappedMag,
              ...(PRESS_CONSTANTS.noticiasMuevenSatisfaccion ? { satisfaccion: -satDelta } : {}),
            }
          : enrichedArticle.tono === 'critico'
          ? {
              lealtad: -cappedMag,
              ...(PRESS_CONSTANTS.noticiasMuevenSatisfaccion ? { satisfaccion: -satDelta } : {}),
            }
          : enrichedArticle.tono === 'favorable'
          ? {
              lealtad: cappedMag,
              ...(PRESS_CONSTANTS.noticiasMuevenSatisfaccion ? { satisfaccion: satDelta } : {}),
            }
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
  const horasDt = (dtTicks / TICKS_PER_DAY) * 24;
  const gridAncho = state.mapaGrid?.ancho ?? 48;
  const pxPerTile = 1560 / Math.max(24, gridAncho);
  const baseSpeed = AGENDA_CONSTANTS.baldosasPorHora * pxPerTile * horasDt;
  const hourOfDay = ((state.reloj.tick % TICKS_PER_DAY) / TICKS_PER_DAY) * 24;

  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
  const casaById = new Map<string, Casa>(state.casas.map((c) => [c.id, c]));
  const parcelaById = new Map<string, Parcela>(state.parcelas.map((p) => [p.id, p]));
  const firmaById = new Map<string, Firma>(state.firmas.map((f) => [f.id, f]));
  const agendaCtx = { hogarById, casaById, parcelaById, firmaById };

  const marketFallback = state.parcelas.find(
    (p) => p.edificio?.activo && (p.edificio.tipo === 'supermercado' || p.edificio.tipo === 'almacen')
  );

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    const crono = npc.ritmo?.cronotipo ?? 0;
    const npcHour = (((hourOfDay - crono) % 24) + 24) % 24;
    const npcFranja =
      npcHour < 6
        ? 'noche'
        : npcHour < 12
        ? 'manana'
        : npcHour < 14
        ? 'mediodia'
        : npcHour < 19
        ? 'tarde'
        : 'anochecer';

    const isUrgent = Boolean(
      npc.accionIa && ['protesta', 'huelga', 'saqueo'].includes(npc.accionIa.id)
    );
    const speed = isUrgent ? baseSpeed * 1.35 : npc.rol === 'policia' ? baseSpeed * 1.2 : baseSpeed;

    let targetWx = npc.mapa.destino.x;
    let targetWy = npc.mapa.destino.y;
    let targetZone: ZoneId = npc.mapa.zonaDestino ?? npc.zona;
    let targetParcelaId = npc.mapa.parcelaDestinoId;
    let desiredAccion = npc.mapa.accion;

    // Determine authoritative goal: urgent action -> hunger errand -> daily 5-franja agenda (staggered by cronotipo)
    if (
      npc.accionIa &&
      ['protesta', 'huelga', 'predicar', 'saqueo', 'organizar_asamblea', 'organizar_fiesta', 'cantar_en_plaza'].includes(
        npc.accionIa.id
      )
    ) {
      const actZone: ZoneId =
        npc.accionIa.zonaDestino && state.zonas[npc.accionIa.zonaDestino]
          ? npc.accionIa.zonaDestino
          : npc.accionIa.id === 'huelga' || npc.accionIa.id === 'protesta'
          ? state.zonas.civico
            ? 'civico'
            : npc.zona
          : state.zonas.mercado
          ? 'mercado'
          : npc.zona;
      const plazaP = state.parcelas.find((p) => p.zona === actZone && p.edificio?.tipo === 'plaza');
      if (plazaP) {
        targetWx = plazaP.wx + plazaP.ww / 2;
        targetWy = plazaP.wy + plazaP.wh / 2;
        targetParcelaId = plazaP.id;
      } else {
        const zR = state.zonas[actZone]?.rect;
        if (zR) {
          targetWx = zR.wx + zR.ww / 2;
          targetWy = zR.wy + zR.wh / 2;
        }
        targetParcelaId = undefined;
      }
      targetZone = actZone;
      desiredAccion = npc.accionIa.nombre.toLowerCase();
    } else if (npc.variables.hambre > 78 && !npc.hospital.internado && !npc.accionIa) {
      const mParcel = marketFallback;
      if (mParcel) {
        targetWx = mParcel.wx + mParcel.ww / 2;
        targetWy = mParcel.wy + mParcel.wh / 2;
        targetZone = mParcel.zona;
        targetParcelaId = mParcel.id;
      }
      desiredAccion = 'buscando alimento';
    } else if (npc.mapa.franja !== npcFranja || !npc.mapa.ruta) {
      const agenda = getNpcDailyAgenda(state, npc, agendaCtx);
      const slot = agenda.find((s) => s.franja === npcFranja) ?? agenda[0];
      targetWx = slot.wx ?? targetWx;
      targetWy = slot.wy ?? targetWy;
      targetZone = slot.zona;
      targetParcelaId = slot.parcelaId;
      desiredAccion = npc.accionIa ? npc.accionIa.nombre.toLowerCase() : slot.actividad;
    }

    const goalMoved =
      npc.mapa.franja !== npcFranja ||
      Math.hypot(targetWx - npc.mapa.destino.x, targetWy - npc.mapa.destino.y) > 4;

    if (goalMoved) {
      const fromZone = getEffectiveZone(npc, Math.max(1, Object.keys(state.zonas).length));
      npc.mapa.ruta = getRouteWaypointsBetween(
        state,
        npc.mapa.x,
        npc.mapa.y,
        fromZone,
        targetWx,
        targetWy,
        targetZone
      ).map((w) => ({ x: w.wx, y: w.wy }));
      npc.mapa.destino = { x: targetWx, y: targetWy };
      npc.mapa.zonaDestino = targetZone;
      npc.mapa.parcelaDestinoId = targetParcelaId;
      npc.mapa.franja = npcFranja;
    }
    if (!npc.accionIa || desiredAccion) {
      npc.mapa.accion = desiredAccion;
    }

    // Advance along road waypoints
    let budget = speed;
    const ruta = npc.mapa.ruta;
    while (budget > 0.01) {
      const nextWp = ruta && ruta.length > 0 ? ruta[0] : npc.mapa.destino;
      const dx = nextWp.x - npc.mapa.x;
      const dy = nextWp.y - npc.mapa.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget + 1.2) {
        npc.mapa.x += dx;
        npc.mapa.y += dy;
        budget -= dist;
        if (ruta && ruta.length > 0) {
          ruta.shift();
          if (ruta.length === 0) break;
        } else {
          break;
        }
      } else {
        npc.mapa.x += (dx / dist) * budget;
        npc.mapa.y += (dy / dist) * budget;
        budget = 0;
      }
    }
  }
}

function updateServiceCoverage(state: GameState): void {
  const vivos = Math.max(1, state.npcs.filter((n) => n.vivo).length);
  const getTargetCov = (role: ServicePublicRoleId): number =>
    ECON_CONSTANTS.objetivoCobertura[role];

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

function releaseOcupacionIfUnused(state: GameState, npc: Npc): void {
  const hogar = state.hogares.find((h) => h.id === npc.hogarId);
  if (!hogar?.ocupandoCasaId) return;
  const stillOccupied = state.npcs.some(
    (m) =>
      m.vivo &&
      m.id !== npc.id &&
      m.hogarId === hogar.id &&
      Boolean(m.accionIa?.efectos.some((e) => e.id === 'ocupa'))
  );
  if (!stillOccupied) {
    const casa = state.casas.find((c) => c.id === hogar.ocupandoCasaId);
    if (casa) casa.ocupadaPorAccion = false;
    hogar.ocupandoCasaId = null;
  }
}

function applyPantryChaosEffectsV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  if (vivos.length === 0) return;
  const zonesCount = getWorldZones(state).length;
  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
  const agroFirms = state.firmas.filter((f) => f.activa && f.rubro === 'agro' && (f.stock ?? 0) > 0);

  // 1. Action effect 'toma' (saqueo) takes food into NPC's hogar pantry without paying
  for (const npc of vivos) {
    if (!npc.accionIa || npc.hospital.internado) continue;
    const tomaEf = npc.accionIa.efectos.find((e) => e.id === 'toma');
    if (!tomaEf || state.alimento.stock <= 0) continue;
    const h = hogarById.get(npc.hogarId);
    if (!h) continue;
    const hMembers = Math.max(1, h.miembros.length);
    const maxPantry = ECON_CONSTANTS.despensaMaxDias * hMembers;
    const space = Math.max(0, maxPantry - h.despensa);
    const spec = EFFECT_CATALOG.toma[tomaEf.intensidad ?? 'media'];
    const availAgro = agroFirms.reduce((s, f) => s + Math.max(0, f.stock ?? 0), 0);
    const taken = Math.min(spec.topeDiario, space, availAgro);
    if (taken > 0) {
      let rem = taken;
      for (const f of agroFirms) {
        if (rem <= 0) break;
        const takeF = Math.min(rem, Math.max(0, f.stock ?? 0));
        if (takeF > 0) {
          f.stock = Math.max(0, (f.stock ?? 0) - takeF);
          rem -= takeF;
        }
      }
      const actualTaken = taken - rem;
      state.alimento.stock = Math.max(0, state.alimento.stock - actualTaken);
      h.despensa = Number((h.despensa + actualTaken).toFixed(2));
    }
  }

  // 2. Effect 'comparte' transfers pantry between same-zone households
  const givers: Array<{
    giverHogar: Hogar;
    spec: (typeof EFFECT_CATALOG.comparte)[keyof typeof EFFECT_CATALOG.comparte];
    zone: ZoneId;
  }> = [];
  const seenGiverHogares = new Set<string>();
  for (const giver of vivos) {
    if (!giver.accionIa || giver.hospital.internado) continue;
    const compEf = giver.accionIa.efectos.find((e) => e.id === 'comparte');
    if (!compEf) continue;
    const h = hogarById.get(giver.hogarId);
    if (!h || seenGiverHogares.has(h.id)) continue;
    const perCap = h.despensa / Math.max(1, h.miembros.length);
    if (perCap <= ECON_CONSTANTS.umbralDespensaBaja) continue;
    seenGiverHogares.add(h.id);
    givers.push({
      giverHogar: h,
      spec: EFFECT_CATALOG.comparte[compEf.intensidad ?? 'media'],
      zone: getEffectiveZone(giver, zonesCount),
    });
  }

  if (givers.length > 0) {
    const needyByZone: Partial<Record<ZoneId, Hogar[]>> = {};
    for (const h of state.hogares) {
      if (h.miembros.length === 0 || h.estado === 'acogida') continue;
      const perCap = h.despensa / Math.max(1, h.miembros.length);
      if (perCap >= ECON_CONSTANTS.umbralDespensaBaja) continue;
      const list = needyByZone[h.zona] ?? [];
      list.push(h);
      needyByZone[h.zona] = list;
    }
    for (const list of Object.values(needyByZone)) {
      list?.sort((a, b) => a.despensa / Math.max(1, a.miembros.length) - b.despensa / Math.max(1, b.miembros.length));
    }

    for (const { giverHogar, spec, zone: gZone } of givers) {
      const needyList = needyByZone[gZone];
      if (!needyList || needyList.length === 0) continue;
      let budget = giverHogar.despensa * spec.maxPctDespensaCedida;
      for (const recHogar of needyList) {
        if (budget <= 0.05) break;
        if (recHogar.id === giverHogar.id) continue;
        const rLen = Math.max(1, recHogar.miembros.length);
        const recNeed = Math.max(0, ECON_CONSTANTS.umbralDespensaBaja * rLen - recHogar.despensa);
        const giveAmt = Math.min(budget, recNeed);
        if (giveAmt > 0.05) {
          giverHogar.despensa = Number(Math.max(0, giverHogar.despensa - giveAmt).toFixed(2));
          recHogar.despensa = clamp(
            Number((recHogar.despensa + giveAmt).toFixed(2)),
            0,
            ECON_CONSTANTS.despensaMaxDias * rLen
          );
          budget -= giveAmt;
        }
      }
    }
  }
}

function killNpc(
  state: GameState,
  npc: Npc,
  causa: string,
  _zonesCount: number,
  causaId?: string
): void {
  if (!npc.vivo) return;
  releaseOcupacionIfUnused(state, npc);
  const wasWaitingBed = npc.hospital.esperandoCama;
  npc.mapa.accion = 'fallecido';
  handleNpcDeathV2(state, npc, causaId || causa, {
    isNatural: false,
    esperandoCama: wasWaitingBed || undefined,
  });
}

function runPoliceRelocation(state: GameState): void {
  const zones = getWorldZones(state);
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
        Math.floor(exactMove) + (drawSubRand(state, 'caos') < exactMove - Math.floor(exactMove) ? 1 : 0);

      const movedByRoute = new Map<string, string[]>();
      const pool = [...policias];

      for (let i = 0; i < countToMove && pool.length > 0; i++) {
        let r = drawSubRand(state, 'caos') * totalNecesidad;
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

        const pickIdx = candidateIdxs[Math.floor(drawSubRand(state, 'caos') * candidateIdxs.length)];
        const chosen = pool.splice(pickIdx, 1)[0];
        const deZona = chosen.zona;
        chosen.zona = targetZone;
        chosen.mapa.destino = getZoneCanvasPosition(targetZone, state, state.zonas);

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
    state.ultimaOrdenZona = {};
    for (const z of zones) state.ultimaOrdenZona[z] = 100;
  }
  for (const z of zones) {
    if (Math.round(def[z] ?? 0) !== Math.round(state.ultimaDefensaZona[z] ?? 0)) {
      state.ultimaDefensaZona[z] = def[z] ?? 0;
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'defensa',
        zona: z,
        valor: def[z] ?? 0,
        causa: state.ultimaCausaPalanca || 'seguridad:zona',
      });
    }
    if (Math.round(ord[z] ?? 0) !== Math.round(state.ultimaOrdenZona[z] ?? 0)) {
      state.ultimaOrdenZona[z] = ord[z] ?? 0;
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'orden',
        zona: z,
        valor: ord[z] ?? 0,
        causa: state.ultimaCausaPalanca || 'orden:zona',
      });
    }
  }
}


function runClimateAttacksAndHits(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  if (vivos.length === 0) return;

  const zones = getWorldZones(state);
  const zonesCount = zones.length;
  const zonesMap = getZonesMap(state);
  const activePhenomena = getActivePhenomena(state);
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
          ? shortestZonePath(fen.origen, effZone, zonesMap)
          : [effZone];
      const dist = fen.origen && zonesCount > 1 ? path.length - 1 : 0;
      const prob = clamp(
        cfg.exposicionMax * (fen.intensidad / 100) * Math.pow(cfg.atenuacion, dist),
        0,
        1
      );
      if (drawSubRand(state, 'clima') >= prob) continue;

      let repelledZone: ZoneId | null = null;
      if (cfg.usaProteccion) {
        for (const z of path) {
          const repelProb = clamp(
            ECON_CONSTANTS.proteccionMaxZona * ((defensa[z] ?? 0) / 100),
            0,
            0.99
          );
          if (drawSubRand(state, 'clima') < repelProb) {
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
        let dano = Math.round(cfg.danoMin + drawSubRand(state, 'clima') * (cfg.danoMax - cfg.danoMin));
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
        (state.golpesPorZonaHistorial[effZone] ??= []).push(state.reloj.dia);

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
}

function processZeroHealthDeaths(state: GameState): void {
  const zonesCount = getWorldZones(state).length;
  for (const npc of state.npcs) {
    if (!npc.vivo || npc.variables.salud > 0) continue;
    killNpc(
      state,
      npc,
      npc.ultimoGolpeOrigen || 'salud:cero',
      zonesCount,
      npc.ultimoGolpeCausaId || state.ultimoEventoClimaId || state.ultimaCausaPalanca
    );
  }
}

function runDailyHealthV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  if (vivos.length === 0) return;

  const zones = getWorldZones(state);
  const zonesCount = zones.length;
  const defaultZone: ZoneId = zones[0] ?? 'centro';
  const activePhenomena = getActivePhenomena(state);
  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
  const { accesoComida } = state.ultimaSalidaEconomica;

  // 1. Hunger update from household food access (economyV2 outputs keyed by hogarId)
  for (const npc of vivos) {
    const acceso = accesoComida[npc.hogarId] ?? accesoComida[npc.id] ?? 1;
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

  // 2. Critical hunger & actual street-living health drain (squatted casas exempt)
  // Note: fatal hits/hunger deaths & inheritance execute in Step 5 (MOTOR_V2 §2).
  let hungerDamageCount = 0;
  for (const npc of vivos) {
    if (!npc.vivo) continue;
    const hogar = hogarById.get(npc.hogarId);
    if (hogar?.estado === 'calle' && !hogar.ocupandoCasaId && !npc.hospital.internado) {
      applyInstantModifierToNpc(
        npc,
        {
          afecta: { salud: -HOUSING_CONSTANTS.danoSaludCalleDia },
          origen: 'vivienda:calle',
          texto: 'Desgaste de salud por vivir en calle',
          recordOnNpc: false,
        },
        state
      );
      if (npc.variables.salud <= 0 && !npc.ultimoGolpeOrigen) {
        npc.ultimoGolpeOrigen = 'vivienda:calle';
      }
    }
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

  // 3. Hospital admission & care
  let medicosActivos = 0;
  let currentInternados = 0;
  const candidatesHospital: Npc[] = [];

  for (const npc of vivos) {
    if (!npc.vivo || npc.variables.salud <= 0) continue;
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

  const { facilities, totalBeds } = computeHospitalFacilities(state, medicosActivos);
  const campanaIds = new Set(facilities.filter((f) => f.isCampana).map((f) => f.edificioId));

  for (const npc of vivos) {
    if (!npc.vivo || npc.variables.salud <= 0 || !npc.hospital.internado) continue;
    const matched = facilities.find((f) => f.edificioId === npc.hospital.edificioId && f.beds > 0);
    if (!matched) {
      const npcZone = npc.hospital.zonaHospital || getEffectiveZone(npc, zonesCount);
      const alt = facilities
        .filter((f) => f.occupied < f.beds)
        .sort((a, b) => {
          const dA = getZoneTravelCost(state, npcZone, a.zona);
          const dB = getZoneTravelCost(state, npcZone, b.zona);
          const cA = Number.isFinite(dA) ? dA : Number.MAX_SAFE_INTEGER;
          const cB = Number.isFinite(dB) ? dB : Number.MAX_SAFE_INTEGER;
          if (cA !== cB) return cA - cB;
          return a.parcela.orden - b.parcela.orden;
        })[0];
      if (alt) {
        alt.occupied += 1;
        npc.hospital.edificioId = alt.edificioId;
        npc.hospital.zonaHospital = alt.zona;
        npc.mapa.destino = getParcelCanvasCenter(alt.parcela);
      } else {
        npc.hospital.internado = false;
        npc.hospital.edificioId = undefined;
        npc.hospital.zonaHospital = undefined;
        npc.hospital.esperandoCama = npc.variables.salud < ECON_CONSTANTS.umbralHospital;
        currentInternados = Math.max(0, currentInternados - 1);
        if (npc.hospital.esperandoCama) candidatesHospital.push(npc);
      }
    }
  }

  candidatesHospital.sort((a, b) => a.variables.salud - b.variables.salud);

  let waitingBeds = 0;
  for (const npc of candidatesHospital) {
    const npcZone = getEffectiveZone(npc, zonesCount);
    const openFacs = facilities
      .filter((f) => f.occupied < f.beds)
      .sort((a, b) => {
        const dA = getZoneTravelCost(state, npcZone, a.zona);
        const dB = getZoneTravelCost(state, npcZone, b.zona);
        const cA = Number.isFinite(dA) ? dA : Number.MAX_SAFE_INTEGER;
        const cB = Number.isFinite(dB) ? dB : Number.MAX_SAFE_INTEGER;
        if (cA !== cB) return cA - cB;
        return a.parcela.orden - b.parcela.orden;
      });

    if (openFacs.length > 0) {
      const targetFac = openFacs[0];
      targetFac.occupied += 1;
      currentInternados++;
      npc.hospital.internado = true;
      npc.hospital.esperandoCama = false;
      npc.hospital.diasInternado = 0;
      npc.hospital.edificioId = targetFac.edificioId;
      npc.hospital.zonaHospital = targetFac.zona;
      releaseOcupacionIfUnused(state, npc);
      npc.accionIa = null;
      npc.mapa.accion = targetFac.isCampana
        ? 'internado en hospital de campaña'
        : 'internado en hospital';
      npc.mapa.destino = getParcelCanvasCenter(targetFac.parcela);
      emitSimEvent(state, {
        id: nextSeqId(state, `ev_${state.reloj.dia}`),
        dia: state.reloj.dia,
        tipo: 'internacion',
        zona: targetFac.zona,
        npcId: npc.id,
        causa: npc.ultimoGolpeCausaId || npc.ultimoGolpeOrigen || 'salud:baja',
      });
    } else {
      npc.hospital.esperandoCama = true;
      waitingBeds++;
    }
  }

  const camas = Math.max(1, totalBeds);
  const ocupacionPct = Number((((currentInternados + waitingBeds) / camas) * 100).toFixed(1));
  if (ocupacionPct > 100 && state.hospitalSaturadoDia !== state.reloj.dia) {
    state.hospitalSaturadoDia = state.reloj.dia;
    const attackFen = activePhenomena.find(
      (f) => f.tipo === 'plaga_zombie' || f.tipo === 'pandemia'
    );
    const satCausa =
      state.ultimoEventoClimaId ||
      (attackFen ? `clima:${attackFen.tipo}` : undefined) ||
      (hungerDamageCount > 0 ? 'hambre:critica' : undefined) ||
      state.ultimaCausaPalanca;
    emitSimEvent(state, {
      id: nextSeqId(state, `ev_${state.reloj.dia}`),
      dia: state.reloj.dia,
      tipo: 'hospital_saturado',
      zona: defaultZone,
      ocupacionPct,
      causa: satCausa,
    });
  }

  // Caregivers bonus per zone ('cuida' effect)
  const cuidaBonusByZone: Record<ZoneId, number> = {};
  for (const z of zones) cuidaBonusByZone[z] = 0;
  for (const npc of vivos) {
    if (!npc.vivo || npc.variables.salud <= 0 || npc.hospital.internado || !npc.accionIa) continue;
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
    if (!npc.vivo || npc.variables.salud <= 0) continue;
    if (npc.hospital.internado) {
      const isCampana = Boolean(npc.hospital.edificioId && campanaIds.has(npc.hospital.edificioId));
      const curaDia = isCampana ? curaInternadoDia * 0.5 : curaInternadoDia;
      applyInstantModifierToNpc(
        npc,
        {
          afecta: { salud: curaDia },
          origen: 'hospital:cura',
          texto: isCampana ? 'Atención en hospital de campaña' : 'Atención hospitalaria diaria',
          recordOnNpc: false,
        },
        state
      );
      hospitalCuredCount++;
      npc.hospital.diasInternado += 1;
      if (npc.variables.salud >= ECON_CONSTANTS.altaHospital) {
        const altZone = npc.hospital.zonaHospital || defaultZone;
        npc.hospital.internado = false;
        npc.hospital.diasInternado = 0;
        npc.hospital.edificioId = undefined;
        npc.hospital.zonaHospital = undefined;
        npc.ultimoGolpeOrigen = undefined;
        npc.ultimoGolpeCausaId = undefined;
        resetNpcIdleLocation(npc, state);
        emitSimEvent(state, {
          id: nextSeqId(state, `ev_${state.reloj.dia}`),
          dia: state.reloj.dia,
          tipo: 'alta',
          zona: altZone,
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
}

function runDailyVariablesV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  if (vivos.length === 0) return;

  const zonesCount = getWorldZones(state).length;
  const mod = state.config.economiaModulo;
  const pal = state.gobierno.palancasVigentes;
  const zonesMap = getZonesMap(state);
  const activePhenomena = getActivePhenomena(state);
  const hogarById = new Map<string, Hogar>(state.hogares.map((h) => [h.id, h]));
  const casaById = new Map<string, Casa>(state.casas.map((c) => [c.id, c]));
  const { poderAdquisitivo } = state.ultimaSalidaEconomica;
  const defensa = computeZoneDefense(state);
  const segService = state.gobierno.indicadores.seguridad / 100;
  const saludService = state.gobierno.indicadores.salud / 100;
  const activeZombies = activePhenomena.filter((f) => f.tipo === 'plaga_zombie');
  const hospFacilities = computeHospitalFacilitiesRaw(state.parcelas, state.npcs, state.zonas, state.distanciasZonas);
  const totalHospitalBeds = hospFacilities.reduce((s, f) => s + f.camasEfectivas, 0);
  let internadosCount = 0;
  for (const n of vivos) {
    if (n.hospital.internado) internadosCount++;
  }
  const hospitalFull = totalHospitalBeds > 0 && internadosCount >= totalHospitalBeds;

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
    const hogar = hogarById.get(npc.hogarId);
    const casa = hogar?.casaId ? casaById.get(hogar.casaId) : undefined;
    const poder = poderAdquisitivo[npc.hogarId] ?? poderAdquisitivo[npc.id] ?? 50;
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
            ? shortestZonePath(fen.origen, effZone, zonesMap).length - 1
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
    const isActuallyStreet = hogar?.estado === 'calle' && !hogar?.ocupandoCasaId;
    const isOwner =
      Boolean(casa && hogar) &&
      ((casa!.dueno.tipo === 'hogar' && casa!.dueno.id === hogar!.id) ||
        (casa!.dueno.tipo === 'npc' && hogar!.miembros.includes(casa!.dueno.id)));
    const rentBurden =
      hogar && casa && !isOwner && hogar.ultimoIngresoNeto > 0
        ? casa.alquiler / Math.max(1, hogar.ultimoIngresoNeto)
        : 0;
    const viviendaDrag =
      isActuallyStreet
        ? 14
        : casa && hogar
        ? (hogar.miembros.length > casa.capacidad ? 8 : 0) +
          (casa.estado < HOUSING_CONSTANTS.umbralEstadoCasaMalo ? 6 : 0) +
          (rentBurden > 0.4 ? clamp((rentBurden - 0.4) * 14, 0, 7) : 0)
        : 0;
    const viviendaBonus = isOwner ? 3 : 0;
    const familyBonus = (npc.parejaId ? 1.5 : 0) + (hogar && hogar.miembros.length >= 3 ? 1 : 0);
    const recentLossPenalty =
      npc.ultimaPerdidaFamiliarDia && state.reloj.dia - npc.ultimaPerdidaFamiliarDia <= 14
        ? clamp((14 - (state.reloj.dia - npc.ultimaPerdidaFamiliarDia)) * 0.5, 1, 6)
        : 0;
    const hungryKidsPenalty = hogar?.noPudoPagarComida ? 4 : 0;
    const modSat = getModifierDelta(npc, 'satisfaccion') * 0.3;
    const ayudaBoost =
      npc.rol === 'desempleado' || npc.rol === 'jubilado'
        ? Math.min(18, pal.ayudaSocial * 3.5)
        : 0;

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
        viviendaDrag +
        viviendaBonus +
        familyBonus -
        recentLossPenalty -
        hungryKidsPenalty -
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
    const targetLealtad = clamp(
      npc.variables.satisfaccion + modLealtad - reb * 10 - (hospitalFull ? 2 : 0),
      0,
      100
    );
    const diffLealtad = targetLealtad - npc.variables.lealtad;
    const lagRate = diffLealtad < 0 ? 0.12 * (1 + reb * 0.8) : 0.08;
    npc.variables.lealtad = clamp(npc.variables.lealtad + diffLealtad * lagRate, 0, 100);
  }
}



function updateClimate(state: GameState, allowRandom = true): void {
  const dia = state.reloj.dia;
  const remaining: ClimatePhenomenon[] = [];
  const defaultZone: ZoneId = getWorldZones(state)[0] ?? 'centro';

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
          zona: fen.origen ?? defaultZone,
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
          zona: fen.origen ?? defaultZone,
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
        zona: fen.origen ?? defaultZone,
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

  if (allowRandom && dia >= state.clima.proximoEventoDia) {
    const pool: PhenomenonType[] =
      state.config.escenarioId === 'zombies' ? ['sequia', 'plaga'] : ['sequia', 'plaga', 'pandemia'];
    const tipo = pool[Math.floor(drawSubRand(state, 'clima') * pool.length)];
    const names: Record<PhenomenonType, string> = {
      sequia: 'Sequía Estacional',
      plaga: 'Plaga de Cultivos',
      pandemia: 'Brote Gripal Comunitario',
      plaga_zombie: 'Oleada Zombie',
    };
    const duracion = 14 + drawSubInt(state, 'clima', 0, 13);
    const intensidad = 35 + drawSubInt(state, 'clima', 0, 34);
    const origenZona = pickRandomZoneSub(state, 'clima');
    const newId = `fen_${dia}`;
    state.clima.fenomenos.push({
      id: newId,
      tipo,
      nombre: names[tipo],
      intensidad,
      inicioDia: dia,
      duracionDias: duracion,
      origen: origenZona,
    });
    state.fenomenosIniciadosIds.push(newId);
    const startEvId = nextSeqId(state, `ev_${dia}`);
    state.ultimoEventoClimaId = startEvId;
    emitSimEvent(state, {
      id: startEvId,
      dia,
      tipo: 'fenomeno_inicio',
      zona: origenZona,
      fenomenoId: newId,
      fenomeno: names[tipo],
      zonaOrigen: origenZona,
    });
    state.clima.proximoEventoDia = dia + duracion + 18 + drawSubInt(state, 'clima', 0, 19);
    addLog(
      state,
      'clima',
      `clima:${tipo}`,
      `Comienza ${names[tipo]} (intensidad ${intensidad}%)`,
      `Zona ${origenZona} · Se estima una duración de ${duracion} días.`,
      undefined,
      startEvId
    );
  }

  const livePhenomenonIds = new Set(state.clima.fenomenos.map((f) => f.id));
  if (state.fenomenosIniciadosIds.length > livePhenomenonIds.size) {
    state.fenomenosIniciadosIds = state.fenomenosIniciadosIds.filter((id) =>
      livePhenomenonIds.has(id)
    );
  }
  if (state.avisosEmitidos.length > livePhenomenonIds.size) {
    state.avisosEmitidos = state.avisosEmitidos.filter((id) => livePhenomenonIds.has(id));
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

  // Trigger 1: Impago que alcanza la nómina -> Huelga
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

  // Trigger 2: Descontentos > 30% -> Protesta
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

  // Trigger 3: Hambre Crítica > 20% -> Saqueo
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

  // Trigger 4 (V2): Recorte fuerte o despidos en firma -> Paro en firma
  if (dia >= state.cooldownsCondicion.paroFirma) {
    const paroAction = ACTION_TABLE.find((a) => a.id === 'paro_firma');
    const badFirm = state.firmas.find(
      (f) =>
        f.activa &&
        f.empleados.length >= 2 &&
        (f.factor < FIRM_CONSTANTS.umbralRecorteFuerteFactor ||
          f.despidosPendientes > 0 ||
          state.eventosDiaActual.some(
            (e) =>
              (e.tipo === 'empresa_despido' || e.tipo === 'empresa_recorte') &&
              e.empresaId === f.id
          ))
    );
    if (paroAction && badFirm) {
      const ctx = createEligibilityContext(state);
      const elegibles = state.npcs.filter(
        (n) =>
          n.vivo &&
          !n.hospital.internado &&
          !n.accionIa &&
          n.empleadorId === badFirm.id &&
          isNpcEligibleForAction(n, paroAction, state, ctx)
      );
      if (elegibles.length > 0) {
        const cantidad = Math.max(1, Math.ceil(elegibles.length * 0.5));
        const elegidos = [...elegibles]
          .sort((a, b) => scoreActionAffinity(b, paroAction) - scoreActionAffinity(a, paroAction))
          .slice(0, cantidad)
          .map((n) => n.id);
        state.ventanasCondicion.push({
          id: `cond_paro_${dia}`,
          disparador: 'paro_firma',
          diaInicio: dia,
          diaLimite: dia + 1,
          intensidadCantidad: cantidad,
          candidatas: [paroAction],
          npcIds: elegidos,
          firmaObjetivoId: badFirm.id,
          estado: 'pendiente',
          causaId: badFirm.ultimaCausa || state.ultimoEventoEmpresaId || state.ultimaCausaPalanca,
        });
        state.cooldownsCondicion.paroFirma = dia + 10;
      }
    }
  }

  // Trigger 5 (V2): Alta calle + casas vacías habitables -> Ocupación de vivienda
  if (
    derived.callePct >= HOUSING_CONSTANTS.umbralCalleOcupacionPct &&
    dia >= state.cooldownsCondicion.ocupacion
  ) {
    const ocupAction = ACTION_TABLE.find((a) => a.id === 'ocupacion');
    const emptyHabitable = state.casas.filter(
      (c) => !c.hogarId && !c.ocupadaPorAccion && c.estado > HOUSING_CONSTANTS.umbralAbandonoCasa
    );
    if (ocupAction && emptyHabitable.length > 0) {
      const ctx = createEligibilityContext(state);
      const elegibles = state.npcs.filter(
        (n) =>
          n.vivo &&
          !n.hospital.internado &&
          !n.accionIa &&
          isNpcEligibleForAction(n, ocupAction, state, ctx)
      );
      if (elegibles.length > 0) {
        const cantidad = Math.min(
          HOUSING_CONSTANTS.maxOcupacionesPorPeriodo,
          emptyHabitable.length,
          elegibles.length
        );
        const elegidos = [...elegibles]
          .sort((a, b) => scoreActionAffinity(b, ocupAction) - scoreActionAffinity(a, ocupAction))
          .slice(0, cantidad)
          .map((n) => n.id);
        state.ventanasCondicion.push({
          id: `cond_ocupacion_${dia}`,
          disparador: 'ocupacion',
          diaInicio: dia,
          diaLimite: dia + 1,
          intensidadCantidad: cantidad,
          candidatas: [ocupAction],
          npcIds: elegidos,
          estado: 'pendiente',
          causaId:
            state.eventos.find((e) => e.tipo === 'desalojo' || e.tipo === 'calle_inicio')?.id ||
            state.ultimaCausaPalanca,
        });
        state.cooldownsCondicion.ocupacion = dia + 10;
      }
    }
  }

  // Trigger 6 (V2): Firma dominante con precios abusivos -> Boicot (cualquier rubro)
  if (dia >= state.cooldownsCondicion.boicot) {
    const boicotAction = ACTION_TABLE.find((a) => a.id === 'boicot');
    const umbralPrecio =
      ECON_CONSTANTS.precioBaseAlimento * FIRM_CONSTANTS.umbralBoicotPrecioFactor;
    const domFirm = state.firmas.find((f) => {
      if (!f.activa) return false;
      const entries = Object.entries(f.cuotaZona);
      return entries.some(([z, share]) => {
        if (share < FIRM_CONSTANTS.umbralBoicotCuota) return false;
        const markupAbusive =
          1 + (f.margenPoder ?? 0) >= FIRM_CONSTANTS.umbralBoicotPrecioFactor;
        const foodPrice = state.ultimaSalidaEconomica.precioAlimento[z] ?? state.alimento.precio;
        const foodAbusive =
          (f.rubro === 'comercio' || f.rubro === 'agro') && foodPrice >= umbralPrecio;
        return markupAbusive || foodAbusive;
      });
    });
    if (boicotAction && domFirm) {
      const ctx = createEligibilityContext(state);
      const elegibles = state.npcs.filter(
        (n) =>
          n.vivo &&
          !n.hospital.internado &&
          !n.accionIa &&
          isNpcEligibleForAction(n, boicotAction, state, ctx)
      );
      if (elegibles.length > 0) {
        const maxCount = Math.max(
          2,
          Math.round(derived.poblacion * (FIRM_CONSTANTS.maxPctHogaresBoicot / 100))
        );
        const cantidad = Math.min(maxCount, elegibles.length);
        const elegidos = [...elegibles]
          .sort((a, b) => scoreActionAffinity(b, boicotAction) - scoreActionAffinity(a, boicotAction))
          .slice(0, cantidad)
          .map((n) => n.id);
        state.ventanasCondicion.push({
          id: `cond_boicot_${dia}`,
          disparador: 'boicot',
          diaInicio: dia,
          diaLimite: dia + 1,
          intensidadCantidad: cantidad,
          candidatas: [boicotAction],
          npcIds: elegidos,
          firmaObjetivoId: domFirm.id,
          estado: 'pendiente',
          causaId:
            state.eventos.find((e) => e.tipo === 'monopolio' && e.firmaId === domFirm.id)?.id ||
            domFirm.ultimaCausa,
        });
        state.cooldownsCondicion.boicot = dia + 12;
      }
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
  const defaultZone: ZoneId = getWorldZones(state)[0] ?? 'centro';

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

  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const defeatConds: ObjectiveCondition[] = [preset.derrota, ...(preset.derrotasExtra ?? [])];
  const crossed =
    govLevel === 'G0'
      ? undefined
      : defeatConds.find((c) => checkCond(getMetric(c.metrica), c.op, c.umbral));
  const defeat = crossed ?? preset.derrota;
  const defeatVal = getMetric(defeat.metrica);
  if (derived.poblacion === 0 || crossed) {
    const endCause =
      state.eventosDiaActual.find((e) => e.tipo === 'muerte' || e.tipo === 'golpe' || e.tipo === 'impago')?.id ||
      state.ultimoEventoClimaId ||
      state.ultimaCausaPalanca;
    const endEvId = nextSeqId(state, `ev_${state.reloj.dia}`);
    emitSimEvent(state, {
      id: endEvId,
      dia: state.reloj.dia,
      tipo: 'fin_partida',
      zona: defaultZone,
      metrica: defeat.metrica,
      valor: defeatVal,
      causa: endCause,
    });
    state.resultado = {
      ...state.resultado,
      estado: 'derrota',
      razon:
        derived.poblacion === 0
          ? 'La población llegó a cero habitantes.'
          : defeat.descripcion,
      diaFinal: state.reloj.dia,
    };
    addLog(
      state,
      'sistema',
      'objetivo:derrota',
      'Fin de partida: Derrota',
      derived.poblacion === 0 ? 'La población llegó a cero habitantes.' : defeat.descripcion,
      endCause,
      endEvId
    );
    return;
  }

  if (govLevel === 'G0') return;

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
        zona: defaultZone,
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
        zona: defaultZone,
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
        callePct: avg((p) => p.callePct ?? 0),
        edadMedia: avg((p) => p.edadMedia ?? 30),
        cuotaMayorPct: avg((p) => p.cuotaMayorPct ?? 0),
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

  const zonesCount = getWorldZones(state).length;
  const isM0 = state.config.nivelMundo === 'M0';
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const allowGovernorComplex = govLevel === 'G2' || govLevel === 'G3';

  // 1. Controls take effect, buildings & roads advance/activate, daily NPC ritmo/habits update
  applyLeverChanges(state);
  stepBuildingsDaily(state);
  updateDailyNpcRitmoAndHabits(state);

  const minHitKeep = state.reloj.dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;
  for (const z of Object.keys(state.golpesPorZonaHistorial) as ZoneId[]) {
    state.golpesPorZonaHistorial[z] = state.golpesPorZonaHistorial[z].filter((d) => d > minHitKeep);
  }

  // 2. Climate (en M0 solo corren los fenómenos forzados, sin azar) + attacks/hits
  updateClimate(state, !isM0);
  runClimateAttacksAndHits(state);

  // 3. Daily economy V2 + Level 1.1 daily subsidies/media costs
  updateServiceCoverage(state);
  applyPantryChaosEffectsV2(state);
  runDailyEconomyV2(state);
  runLevel11Daily(state);

  // 4. Health & hospital
  runDailyHealthV2(state);

  // 5. Life: deaths (from hits, hunger or age), immediate inheritance, birthdays & stage transitions
  processZeroHealthDeaths(state);
  runDailyLifecycleV2(state);

  // 6. Security: police relocation + zone integrity repair
  runPoliceRelocation(state);
  updateZoneIntegrity(state, zonesCount);

  // 7. Chaos: action expirations, orphaned contagion cleanup, window counter, contagion, condition triggers & director
  for (const npc of state.npcs) {
    if (!npc.vivo || !npc.accionIa) continue;
    npc.accionIa.diasRestantes -= 1;
    if (npc.accionIa.diasRestantes <= 0) {
      const effZone = getEffectiveZone(npc, zonesCount);
      const ended = npc.accionIa;
      releaseOcupacionIfUnused(state, npc);
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
  pruneOrphanedContagions(state, zonesCount);
  if (state.reloj.dia - state.caosTracker.ventanaInicioDia >= state.config.caos.periodoDias) {
    state.caosTracker.ventanaInicioDia = state.reloj.dia;
    state.caosTracker.accionesEnVentana = 0;
  }
  if (!isM0) {
    runDailyActionContagion(state, zonesCount);
    const chaosDerived = deriveCommunityStats(state);
    state.caosTracker.respiroActivo =
      chaosDerived.satisfaccionMedia < state.config.caos.respiroSiSatisfaccionMediaMenorA;
    checkConditionTriggers(state, chaosDerived);

    if (!state.config.usarIaGemini) {
      for (const win of state.ventanasCondicion) {
        if (win.estado === 'pendiente') {
          const chosen = win.candidatas[Math.floor(drawSubRand(state, 'caos') * win.candidatas.length)];
          resolveConditionWindowWithFallback(state, win.id, chosen?.id, 'motor');
        }
      }
      if (state.reloj.dia > 1) {
        for (let i = 0; i < DIRECTOR_CONSTANTS.ofertasPorDia; i++) {
          const gate = canTriggerSpontaneousChaos(state);
          if (!gate.allowed) break;
          const npc = pickChaosCandidateNpc(state);
          if (!npc) break;
          const candidatas = selectCandidateActions(npc, state);
          if (candidatas.length === 0) break;
          const chosen = candidatas[Math.floor(drawSubRand(state, 'caos') * candidatas.length)];
          const roleName = ROLE_CATALOG[npc.rol].nombre.toLowerCase();
          applyActionToNpc(
            state,
            npc,
            chosen,
            pickActionText(chosen, npc.nombre, state, roleName, npc.zona),
            'motor'
          );
          state.caosTracker.accionesEnVentana += 1;
        }
      }
    }
  }

  // 8. Press: collect facts up to Step 7, publish synchronously if !usarIaGemini
  collectDailyPressFacts(state, undefined, {
    fromEventIdx: 0,
    includeDailySummary: true,
    replaceQueue: false,
  });
  const pressEvCutoff = state.eventosDiaActual.length;
  if (!isM0 && !state.config.usarIaGemini && state.colaHechosDia.length > 0 && state.medios.length > 0) {
    const planned = planDailyPressPublications(state, state);
    state.colaHechosDia = [];
    for (const plan of planned) {
      applyPressArticleEffects(state, {
        id: nextSeqId(state, `n_${state.reloj.dia}`),
        dia: state.reloj.dia,
        medioId: plan.medio.id,
        medioNombre: plan.medio.nombre,
        autorId: plan.autor.id,
        autorNombre: plan.autor.nombre,
        tema: plan.fact.tema,
        tono: plan.tono,
        alcance: plan.medio.alcancePct,
        credibilidad: plan.medio.credibilidad,
        titulo: plan.templateTitulo,
        texto: plan.templateTexto,
        origen: plan.fact.origen,
        causa: plan.fact.causa,
        textoOrigen: 'plantilla',
        zona: plan.zoneNorm,
        zonaOrigen: plan.zoneNorm,
        fenomenoId: plan.fact.datos.fenomenoId,
        esAviso: plan.fact.datos.esAviso,
        vigenteHastaDia: plan.fact.datos.vigenteHastaDia,
      });
    }
  }

  // 9. NPC variables & modifier expiration
  runDailyVariablesV2(state);
  for (const npc of state.npcs) {
    if (!npc.vivo || npc.modificadores.length === 0) continue;
    npc.modificadores = npc.modificadores
      .map((m) => ({ ...m, diasRestantes: m.diasRestantes - 1 }))
      .filter((m) => m.diasRestantes > 0);
  }

  // 10. Payday settlement V2 (firms, rent, maintenance, state, housing, M&A, bankruptcies, construction, autopilot, media, training)
  let settledThisDay = false;
  if (state.reloj.diasEnPeriodo >= PERIOD_DAYS) {
    runPaydayEconomyV2(state);
    if (!isM0) {
      runTrainingPeriodV2(state);
    }
    state.reloj.diasEnPeriodo = 0;
    state.reloj.periodo += 1;
    settledThisDay = true;
  }

  // 11. Demographic period (M1+)
  if (!isM0 && state.reloj.dia >= PERIOD_DAYS_DEMOG && state.reloj.dia % PERIOD_DAYS_DEMOG === 0) {
    runDemographicPeriodV2(state);
  }

  // 12. Role changes & job matching
  assignRolesAndJobsV2(state);

  // 13. Derived community stats, period snapshot, lectura & history
  const derived = deriveCommunityStats(state);
  if (state.config.lecturaActiva !== false) {
    updateLecturaDaily(state, derived);
    if (settledThisDay) {
      updateLecturaPayday(state, derived);
    }
  }
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

  // 14. Governor layer: hitos, demands & measures, objective/defeat
  if (allowGovernorComplex) {
    stepDemandsAndMeasuresDaily(state);
    if (settledThisDay) {
      checkHitosAtPayday(state, derived);
    }
    if (!isM0) {
      evaluateActorDemands(state, derived);
      evaluateExtraActors(state, derived);
    }
  }
  evaluateObjective(state, derived);

  // Collect late-day events (Steps 10-14) for next day's Step 8 press queue (or async AI)
  collectDailyPressFacts(state, derived, {
    fromEventIdx: pressEvCutoff,
    includeDailySummary: false,
    replaceQueue: false,
  });
  state.precioAyer = state.alimento.precio;
  state.hambreAyerPct = derived.hambreCriticaPct;

  // Dev / test engine invariants verification BEFORE resetting ultimoDineroTotal
  if (state.devMode || isTestConfig(state.config)) {
    const invErrors = checkEngineInvariants(state);
    if (invErrors.length > 0) {
      const breakingEvId = state.eventosDiaActual[state.eventosDiaActual.length - 1]?.id;
      addLog(
        state,
        'sistema',
        'motor:invariante',
        `Invariante incumplida día ${state.reloj.dia} (${invErrors.length})`,
        invErrors.slice(0, 4).join(' | '),
        breakingEvId,
        breakingEvId
      );
    }
  }
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
    callePct: derived.callePct,
    edadMedia: derived.edadMedia,
    cuotaMayorPct: derived.mercado.cuotaMayorPct,
  });
  compactHistorialIfNeeded(state);
  compactEvents(state);
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
              ...(npc.mapa.ruta ? { ruta: npc.mapa.ruta.map((w) => ({ ...w })) } : {}),
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
    if (cursor.startsWith('control:') || cursor.startsWith('palanca:')) return true;
    const ev = state.eventos.find((e) => e.id === cursor);
    if (!ev) break;
    if (ev.tipo === 'control') return true;
    cursor = ev.causa;
  }
  return false;
}

function collectDailyPressFacts(
  state: GameState,
  preDerived?: CommunityDerived,
  options?: { fromEventIdx?: number; includeDailySummary?: boolean; replaceQueue?: boolean }
): void {
  const fromEventIdx = options?.fromEventIdx ?? 0;
  const includeDailySummary = options?.includeDailySummary ?? true;
  const replaceQueue = options?.replaceQueue ?? true;
  const dailyEvents = state.eventosDiaActual.slice(fromEventIdx);
  const derived = preDerived ?? deriveCommunityStats(state);
  const dia = state.reloj.dia;
  const facts: PressFact[] = [];
  const relMap = PRESS_CONSTANTS.relevanciaPorTema;
  const defaultZone: ZoneId = getWorldZones(state)[0] ?? 'centro';
  const firmaById = new Map<string, Firma>(state.firmas.map((f) => [f.id, f]));
  const npcById = new Map<string, Npc>(state.npcs.map((n) => [n.id, n]));

  // 1. Notices / Climate / Events
  for (const ev of dailyEvents) {
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
      const fName =
        firmaById.get(ev.empresaId)?.nombre ??
        (ev.empresaId === 'alimento' ? 'Productora de Alimento' : 'Empresa de Comercio');
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
          empresa: fName,
          firma: fName,
          cifra:
            ev.tipo === 'empresa_despido'
              ? `${ev.cantidad} despidos`
              : `${Math.round(ev.factor * 100)}%`,
        },
      });
    } else if (ev.tipo === 'control') {
      const controlKey = ev.control;
      const dedupeGroup = ev.palanca || ev.control;
      if (controlKey.startsWith('puestos.') && ev.palanca && facts.some((f) => f.tema === 'gobierno' && f.datos.palanca === dedupeGroup)) {
        continue;
      }
      if (controlKey.startsWith('operacion.') && ev.palanca && facts.some((f) => f.tema === 'gobierno' && f.datos.palanca === dedupeGroup)) {
        continue;
      }
      const rule = LEVER_VALENCIA[controlKey] || (ev.palanca ? LEVER_VALENCIA[ev.palanca] : undefined);
      let valencia: PressValence = 'neutra';
      if (rule) {
        if (typeof ev.valorAnterior === 'number' && typeof ev.valorNuevo === 'number') {
          valencia = ev.valorNuevo > ev.valorAnterior ? rule.alSubir : rule.alBajar;
        } else if (controlKey === 'tope_precio' || controlKey === 'precio_maximo') {
          const capRank: Record<string, number> = { estricto: 0, moderado: 1, libre: 2 };
          const rPrev = capRank[String(ev.valorAnterior)] ?? 2;
          const rNext = capRank[String(ev.valorNuevo)] ?? 2;
          valencia = rNext > rPrev ? rule.alSubir : rNext < rPrev ? rule.alBajar : 'neutra';
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
        origen: `control:${controlKey}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          control: controlKey,
          palanca: dedupeGroup,
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
    } else if (ev.tipo === 'obra_fin' || ev.tipo === 'demolicion') {
      const parcela = state.parcelas.find((p) => p.id === ev.parcelaId);
      const edNombre = BUILDING_CATALOG[ev.edificio].nombre;
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'obras',
        relevancia: relMap.obras,
        valencia: ev.tipo === 'obra_fin' ? 'buena' : 'mala',
        esDelGobierno: ev.tipo === 'demolicion' ? true : ev.dueno === 'estado',
        zona: ev.zona,
        origen: ev.tipo === 'obra_fin' ? `obra:${ev.edificio}` : `demolicion:${ev.edificio}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          edificio: edNombre,
          parcela: parcela?.nombre ?? ev.parcelaId,
        },
      });
    } else if (ev.tipo === 'via_fin' || ev.tipo === 'zona_abierta') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'obras',
        relevancia: relMap.obras,
        valencia: 'buena',
        esDelGobierno: true,
        zona: ev.zona,
        origen: ev.tipo === 'via_fin' ? `via:${ev.tipoVia}` : `zona:${ev.zona}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          edificio: ev.tipo === 'via_fin' ? ev.tramoNombre : `zona ${state.zonas[ev.zona]?.nombre ?? ev.zona}`,
          parcela: ev.tipo === 'via_fin' ? `${ev.parcelasAbiertas.length} parcelas` : ev.zona,
        },
      });
    } else if (
      ev.tipo === 'demanda' ||
      ev.tipo === 'demanda_aceptada' ||
      ev.tipo === 'demanda_rechazada' ||
      ev.tipo === 'medida'
    ) {
      const actorName =
        ev.actorId === 'empresarios'
          ? 'Empresarios'
          : state.medios.find((m) => m.id === ev.actorId)?.nombre ?? ev.actorId;
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'presiones',
        relevancia: relMap.presiones,
        valencia:
          ev.tipo === 'demanda_aceptada'
            ? 'buena'
            : ev.tipo === 'demanda'
            ? 'neutra'
            : 'mala',
        esDelGobierno: ev.tipo !== 'demanda',
        zona: ev.zona,
        origen: `actor:${ev.actorId}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          actor: actorName,
          demanda: 'demandaId' in ev ? ev.demandaId.replaceAll('_', ' ') : 'reclamo sectorial',
          medida: 'medida' in ev ? ev.medida.replaceAll('_', ' ') : 'presión sectorial',
        },
      });
    } else if (ev.tipo === 'desalojo' || ev.tipo === 'casa_construida') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'vivienda',
        relevancia: relMap.vivienda ?? 72,
        valencia: ev.tipo === 'casa_construida' ? 'buena' : 'mala',
        esDelGobierno: ev.tipo === 'casa_construida' && ev.dueno.tipo === 'estado',
        zona: ev.zona,
        origen: `vivienda:${ev.tipo}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          hogar: ev.tipo === 'desalojo' ? `hogar ${ev.hogarId}` : 'familias del barrio',
          cifra: ev.tipo === 'casa_construida' ? BUILDING_CATALOG[ev.tipoCasa].nombre : `${ev.periodosSinPagar} impagos`,
        },
      });
    } else if (
      ev.tipo === 'firma_fundada' ||
      ev.tipo === 'firma_compra' ||
      ev.tipo === 'firma_quiebra' ||
      ev.tipo === 'monopolio'
    ) {
      const fName = firmaById.get(ev.firmaId)?.nombre ?? ev.firmaId;
      const duenoId = ev.tipo === 'firma_fundada' ? ev.duenoId : ev.tipo === 'firma_compra' ? ev.compradorId : undefined;
      const ownerLabel = duenoId
        ? npcById.get(duenoId)?.nombre ?? firmaById.get(duenoId)?.nombre ?? 'Inversor local'
        : 'Grupo local';
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'firmas',
        relevancia: relMap.firmas ?? 66,
        valencia: ev.tipo === 'firma_fundada' ? 'buena' : ev.tipo === 'firma_compra' ? 'neutra' : 'mala',
        esDelGobierno: false,
        zona: ev.zona,
        origen: `mercado:${ev.tipo}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          firma: fName,
          empresa: fName,
          dueno: ownerLabel,
          cifra:
            ev.tipo === 'firma_quiebra'
              ? `${ev.cantidadDespedidos} despedidos`
              : ev.tipo === 'monopolio'
              ? `${Math.round(ev.cuota)}%`
              : ev.tipo === 'firma_compra'
              ? `$${Math.round(ev.precio)}`
              : ev.rubro,
        },
      });
    } else if (ev.tipo === 'nacimiento') {
      const baby = npcById.get(ev.npcId);
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'demografia',
        relevancia: relMap.demografia ?? 58,
        valencia: 'buena',
        esDelGobierno: false,
        zona: ev.zona,
        origen: 'vida:nacimiento',
        causa: ev.id,
        datos: {
          zona: ev.zona,
          familia: baby?.apellido ? `familia ${baby.apellido}` : 'familia vecinal',
          hogar: ev.hogarId,
          cifra: '1 nacimiento',
        },
      });
    } else if (ev.tipo === 'pareja' || ev.tipo === 'herencia') {
      const refNpcId = ev.tipo === 'pareja' ? ev.npcIds[0] : ev.aIds[0] ?? ev.deNpcId;
      const famApellido = npcById.get(refNpcId)?.apellido ?? 'vecinal';
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'familia',
        relevancia: relMap.familia ?? 38,
        valencia: ev.tipo === 'pareja' ? 'buena' : 'neutra',
        esDelGobierno: false,
        zona: ev.zona,
        origen: `vida:${ev.tipo}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          familia: `familia ${famApellido}`,
          hogar: ev.tipo === 'pareja' ? ev.hogarNuevoId : ev.casaId ?? 'patrimonio familiar',
          cifra: ev.tipo === 'herencia' ? `$${Math.round(ev.dinero)}` : 'nuevo hogar',
        },
      });
    } else if (ev.tipo === 'migracion_llegada' || ev.tipo === 'migracion_salida') {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'demografia',
        relevancia: relMap.demografia ?? 58,
        valencia: ev.tipo === 'migracion_llegada' ? 'buena' : 'mala',
        esDelGobierno: false,
        zona: ev.zona,
        origen: `vida:${ev.tipo}`,
        causa: ev.id,
        datos: {
          zona: ev.zona,
          hogar: ev.hogarId,
          cifra:
            ev.tipo === 'migracion_llegada'
              ? `+${ev.cantidad} migrantes`
              : `-${ev.cantidad} emigrantes`,
        },
      });
    } else if (ev.tipo === 'capacitacion_fin') {
      const trained = npcById.get(ev.npcId);
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'empresas',
        relevancia: 52,
        valencia: 'buena',
        esDelGobierno: false,
        zona: ev.zona,
        origen: 'vida:capacitacion',
        causa: ev.id,
        datos: {
          zona: ev.zona,
          persona: trained?.nombre ?? ev.npcId,
          cifra: ROLE_CATALOG[ev.rolObjetivo]?.nombre ?? ev.rolObjetivo,
        },
      });
    }
  }

  // 2. Aggregated Zombie attacks (golpe / muerte) & non-attack deaths per zone
  const attackHitsByZone = new Map<ZoneId, { count: number; evId: string; isGov: boolean }>();
  const normalDeathsByZone = new Map<ZoneId, { count: number; evId: string }>();
  let pandemicDeaths = 0;
  let pandemicDeathEvId: string | undefined;

  for (const ev of dailyEvents) {
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
      } else {
        const prev = normalDeathsByZone.get(ev.zona);
        normalDeathsByZone.set(ev.zona, {
          count: (prev?.count || 0) + 1,
          evId: prev?.evId || ev.id,
        });
      }
    }
  }

  for (const [zona, info] of normalDeathsByZone.entries()) {
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'demografia',
      relevancia: relMap.demografia ?? 58,
      valencia: 'mala',
      esDelGobierno: false,
      zona,
      origen: 'vida:mortalidad',
      causa: info.evId,
      datos: {
        zona,
        cifra: `${info.count} fallecimiento(s)`,
      },
    });
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
      zona: defaultZone,
      origen: 'clima:pandemia',
      causa: pandemicDeathEvId,
      datos: {
        zona: defaultZone,
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

  for (const ev of dailyEvents) {
    if (ev.tipo !== 'accion_inicio') continue;
    const isCond =
      ev.accion === 'huelga' ||
      ev.accion === 'protesta' ||
      ev.accion === 'saqueo' ||
      ev.accion === 'paro_firma' ||
      ev.accion === 'ocupacion' ||
      ev.accion === 'boicot';
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
      'ver_nubes',
      'cantar_en_plaza',
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

  // 4. Hunger surge, high homelessness & sharp food price swing
  if (includeDailySummary && derived.callePct >= (PRESS_CONSTANTS.calleSubaUmbralPct ?? 12)) {
    facts.push({
      id: nextSeqId(state, `pf_${dia}`),
      dia,
      tema: 'vivienda',
      relevancia: relMap.vivienda ?? 72,
      valencia: 'mala',
      esDelGobierno: Boolean(state.ultimaCausaPalanca),
      zona: defaultZone,
      origen: 'vivienda:calle',
      causa: state.ultimaCausaPalanca,
      datos: {
        zona: defaultZone,
        hogar: 'familias en situación de calle',
        cifra: `${derived.callePct.toFixed(1)}%`,
      },
    });
  }

  if (
    includeDailySummary &&
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
      zona: defaultZone,
      origen: 'estado:hambre_critica',
      causa: state.ultimoEventoClimaId || state.ultimaCausaPalanca,
      datos: {
        zona: defaultZone,
        cifra: `${derived.hambreCriticaPct.toFixed(1)}%`,
      },
    });
  }

  if (includeDailySummary && state.precioAyer > 0) {
    const priceDeltaPct = ((state.alimento.precio - state.precioAyer) / state.precioAyer) * 100;
    if (Math.abs(priceDeltaPct) >= PRESS_CONSTANTS.precioCambioFuertePct) {
      facts.push({
        id: nextSeqId(state, `pf_${dia}`),
        dia,
        tema: 'precio',
        relevancia: relMap.precio,
        valencia: priceDeltaPct > 0 ? 'mala' : 'buena',
        esDelGobierno: Boolean(state.ultimaCausaPalanca),
        zona: defaultZone,
        origen: 'economia:precio',
        causa: state.ultimaCausaPalanca || state.ultimoEventoClimaId,
        datos: {
          zona: defaultZone,
          cifra: `$${state.alimento.precio.toFixed(2)}`,
        },
      });
    }
  }

  const combined = replaceQueue ? facts : [...state.colaHechosDia, ...facts];
  const seenIds = new Set<string>();
  const deduped: PressFact[] = [];
  for (const f of combined) {
    if (seenIds.has(f.id)) continue;
    seenIds.add(f.id);
    deduped.push(f);
  }
  state.colaHechosDia = deduped
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
    .replaceAll('{empresa}', d.empresa ?? d.firma ?? 'la empresa')
    .replaceAll('{firma}', d.firma ?? d.empresa ?? 'la firma')
    .replaceAll('{dueno}', d.dueno ?? 'un emprendedor')
    .replaceAll('{hogar}', d.hogar ?? 'los hogares')
    .replaceAll('{familia}', d.familia ?? 'la familia')
    .replaceAll('{control}', d.control ?? d.palanca ?? 'medida')
    .replaceAll('{palanca}', d.control ?? d.palanca ?? 'medida')
    .replaceAll('{valor_anterior}', d.valorAnterior ?? '')
    .replaceAll('{valor_nuevo}', d.valorNuevo ?? '')
    .replaceAll('{edificio}', d.edificio ?? 'obra pública')
    .replaceAll('{parcela}', d.parcela ?? 'parcela')
    .replaceAll('{actor}', d.actor ?? 'sector local')
    .replaceAll('{demanda}', d.demanda ?? 'demanda')
    .replaceAll('{medida}', d.medida ?? 'medida de presión');
}

function drawPressToneForFact(
  state: GameState,
  medio: GameState['medios'][number],
  fact: PressFact,
  rng: { rng?: SubsystemRngState; rngState: number }
): NewsTone {
  const availableTemplates = NEWS_TEMPLATES[fact.tema] || {};
  const activeCampana = state.medidasVigentes.find(
    (m) =>
      m.tipo === 'campana' &&
      m.medioId === medio.id &&
      state.reloj.dia < m.hastaDia &&
      m.tono &&
      (!m.tema || m.tema === fact.tema)
  );
  if (
    activeCampana?.tono &&
    availableTemplates[activeCampana.tono] &&
    availableTemplates[activeCampana.tono]!.length > 0
  ) {
    return activeCampana.tono;
  }

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

  const total = weights.reduce((acc, item) => acc + item.w, 0);
  let r = drawSubRand(rng, 'prensa') * Math.max(0.001, total);
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
  rng: { rng?: SubsystemRngState; rngState: number } = state
): PlannedPressPublication[] {
  if (state.medios.length === 0 || state.colaHechosDia.length === 0) return [];
  const planned: PlannedPressPublication[] = [];
  const sensTopics = new Set<NewsTopic>(['ataque', 'conflicto', 'hambre', 'vecinos', 'vivienda']);
  const livingById = new Map<string, Npc>();
  for (const n of state.npcs) {
    if (n.vivo) livingById.set(n.id, n);
  }

  for (const medio of state.medios) {
    if (medio.activa === false) continue;
    const livingCols = medio.columnistas
      .map((id) => livingById.get(id))
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
      let r = drawSubRand(rng, 'prensa') * Math.max(0.001, totalW);
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
      const autor = livingCols[Math.floor(drawSubRand(rng, 'prensa') * livingCols.length)];
      const tono = drawPressToneForFact(state, medio, fact, rng);
      const variants =
        NEWS_TEMPLATES[fact.tema]?.[tono] ||
        NEWS_TEMPLATES[fact.tema]?.neutral || [
          {
            titulo: `Actualidad en {zona}`,
            texto: `{autor} reporta desde {medio} las novedades de la jornada.`,
          },
        ];
      const variant = variants[Math.floor(drawSubRand(rng, 'prensa') * variants.length)];
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

export function describeSimEvent(ev: SimEvent, state: GameState): CausalStep {
  const npcName = (id?: string) => state.npcs.find((n) => n.id === id)?.nombre || id || 'habitante';
  switch (ev.tipo) {
    case 'contraoferta':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: ev.aceptada ? `Contraoferta aceptada (${ev.actorId})` : `Contraoferta rechazada (${ev.actorId})`,
        detalle: ev.aceptada ? 'Acuerdo parcial: la mitad del cambio, la mitad del compromiso.' : 'Se aplica su medida con la mitad de duración.',
      };
    case 'agregado':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Hechos del día (resumen)',
        detalle: Object.entries(ev.conteos).map(([k, v]) => v + ' ' + k).join(', '),
      };
    case 'control':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Decisión del gobernador: ${ev.control}`,
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
    case 'obra_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Inicio de obra: ${BUILDING_CATALOG[ev.edificio].nombre}`,
        detalle: `Parcela ${ev.parcelaId} · Dueño ${ev.dueno} · $${ev.costo} (${ev.diasObra}d).`,
      };
    case 'obra_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Obra terminada: ${BUILDING_CATALOG[ev.edificio].nombre}`,
        detalle: `Edificio activo en parcela ${ev.parcelaId} (${ev.dueno}).`,
      };
    case 'demolicion':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Demolición de ${BUILDING_CATALOG[ev.edificio].nombre}`,
        detalle: `Se liberó la parcela ${ev.parcelaId}.`,
      };
    case 'hito':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Hito de prosperidad: ${ev.nombre}`,
        detalle: `Meta cumplida en ${ev.zona}.`,
      };
    case 'demanda':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Demanda de ${ev.actorId}: ${ev.demandaId}`,
        detalle: `Plazo de ${ev.diasRespuesta} días para responder.`,
      };
    case 'demanda_aceptada':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Demanda aceptada (${ev.actorId})`,
        detalle: `Compromiso sobre ${ev.palanca}.`,
      };
    case 'demanda_rechazada':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: ev.porVencimiento
          ? `Demanda vencida (${ev.actorId})`
          : `Demanda rechazada (${ev.actorId})`,
        detalle: `Desencadena medida de presión por ${ev.demandaId}.`,
      };
    case 'medida':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Medida de ${ev.actorId}: ${ev.medida}`,
        detalle: `Vigente hasta el día ${ev.hastaDia}.`,
      };
    case 'nacimiento':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Nacimiento: ${npcName(ev.npcId)}`,
        detalle: `Nuevo integrante en el hogar ${ev.hogarId}.`,
      };
    case 'pareja':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Unión familiar',
        detalle: `Se conformó el hogar ${ev.hogarNuevoId}.`,
      };
    case 'separacion':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: 'Separación de hogar',
        detalle: `El grupo familiar se dividió en ${ev.hogarIds.join(', ')}.`,
      };
    case 'hogar_nuevo':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Nuevo hogar (${ev.motivo})`,
        detalle: `Hogar ${ev.hogarId} con ${ev.miembros.length} miembro(s).`,
      };
    case 'hogar_disuelto':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Hogar disuelto (${ev.hogarId})`,
        detalle: ev.herederos.length > 0 ? `Bienes transferidos a ${ev.herederos.length} heredero(s).` : 'Sin herederos activos.',
      };
    case 'herencia':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Herencia de ${npcName(ev.deNpcId)}`,
        detalle: `Traspaso de $${Math.round(ev.dinero)}${ev.casaId ? ` y vivienda ${ev.casaId}` : ''}.`,
      };
    case 'mudanza':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Mudanza de hogar ${ev.hogarId}`,
        detalle: `Se trasladó a la vivienda ${ev.aCasaId} en ${ev.zona}.`,
      };
    case 'desalojo':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Desalojo en ${ev.zona}`,
        detalle: `Hogar ${ev.hogarId} perdió la vivienda ${ev.casaId} tras ${ev.periodosSinPagar} impago(s).`,
      };
    case 'calle_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Hogar en calle (${ev.hogarId})`,
        detalle: `Quedó sin techo en ${ev.zona}.`,
      };
    case 'calle_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Hogar ${ev.hogarId} salió de la calle`,
        detalle: `Consiguió alojamiento en ${ev.zona}.`,
      };
    case 'casa_construida':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Vivienda construida: ${BUILDING_CATALOG[ev.tipoCasa].nombre}`,
        detalle: `Casa ${ev.casaId} habilitada en ${ev.zona}.`,
      };
    case 'casa_estado':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Deterioro de vivienda ${ev.casaId}`,
        detalle: `Estado estructural en ${Math.round(ev.estado)}%.`,
      };
    case 'firma_fundada':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Nueva firma fundada (${ev.rubro})`,
        detalle: `${npcName(ev.duenoId)} creó la firma ${ev.firmaId} en ${ev.zona}.`,
      };
    case 'firma_compra':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Compra societaria (${ev.modo})`,
        detalle: `Firma ${ev.firmaId} adquirida por $${Math.round(ev.precio)}.`,
      };
    case 'firma_quiebra':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Quiebra de firma ${ev.firmaId}`,
        detalle: `Cerró sus locales en ${ev.zona} (${ev.cantidadDespedidos} despedidos).`,
      };
    case 'monopolio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Posición dominante en ${ev.rubro}`,
        detalle: `Firma ${ev.firmaId} alcanzó ${Math.round(ev.cuota)}% de cuota en ${ev.zona}.`,
      };
    case 'medio_cambio_linea':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Cambio editorial en ${ev.medioId}`,
        detalle: `Afinidad ajustada de ${ev.lineaAnterior.afinidadGobierno} a ${ev.lineaNueva.afinidadGobierno}.`,
      };
    case 'medio_cierre':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Cierre de medio (${ev.medioId})`,
        detalle: `Dejó de operar en ${ev.zona}.`,
      };
    case 'via_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Obra vial iniciada: ${ev.tramoNombre}`,
        detalle: `${ev.tipoVia.toUpperCase()} (${ev.diasObra ?? 0}d) · Abre ${ev.parcelasAbiertas.length} parcela(s).`,
      };
    case 'via_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Vía habilitada: ${ev.tramoNombre}`,
        detalle: `${ev.tipoVia.toUpperCase()} operativa · Habilitó ${ev.parcelasAbiertas.length} parcela(s).`,
      };
    case 'via_estado':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Deterioro de vía (${ev.tramoId})`,
        detalle: `Estado estructural en ${Math.round(ev.estado)}%.`,
      };
    case 'ruta_cortada':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Ruta cortada (${ev.tramoId})`,
        detalle: `Tramo intransitable · ${ev.parcelasAisladas.length} parcela(s) afectadas.`,
      };
    case 'zona_abierta':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Nueva zona habilitada: ${state.zonas[ev.zona]?.nombre ?? ev.zona}`,
        detalle: `Conectada por la vía ${ev.viaId}.`,
      };
    case 'migracion_llegada':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Llegada migratoria (+${ev.cantidad})`,
        detalle: `Hogar ${ev.hogarId} se instaló en ${ev.zona} ($${Math.round(ev.dinero)}).`,
      };
    case 'migracion_salida':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        titulo: `Emigración de hogar (-${ev.cantidad})`,
        detalle: `Hogar ${ev.hogarId} dejó la ciudad por ${ev.motivo}.`,
      };
    case 'capacitacion_inicio':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Inicio de capacitación (${ev.rolObjetivo})`,
        detalle: `${npcName(ev.npcId)} comenzó a formarse ($${ev.costo ?? 0}).`,
      };
    case 'capacitacion_fin':
      return {
        id: ev.id,
        dia: ev.dia,
        tipo: ev.tipo,
        zona: ev.zona,
        npcId: ev.npcId,
        titulo: `Capacitación completada (${ev.rolObjetivo})`,
        detalle: `${npcName(ev.npcId)} alcanzó nivel educativo ${ev.educNivel}.`,
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

    if (cursor.startsWith('control:') || cursor.startsWith('palanca:')) {
      const label = cursor.startsWith('control:')
        ? cursor.slice('control:'.length)
        : cursor.slice('palanca:'.length);
      chain.unshift({
        id: cursor,
        dia: state.reloj.dia,
        tipo: 'control',
        titulo: `Decisión de gobierno (${label})`,
        detalle: fallbackText || 'Ajuste de controles del despacho.',
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

/** Modo desarrollador (UI §10): fuerza una demanda de la tabla cerrada, ignorando umbrales y enfriamientos. */
export function forceDemandForDev(state: GameState, demandaId: string): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') return { ok: false, error: 'La partida ya finalizó.' };
  if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) {
    return { ok: false, error: 'Ya hay demandas simultáneas al máximo.' };
  }
  const dia = state.reloj.dia;
  const vig = state.gobierno.palancasVigentes;
  const medio = state.medios[0];
  type Spec = { actorId: string; actorNombre: string; titulo: string; razon: string; amenaza: string; palanca: LeverKey; nuevoValor: number | string; etiqueta: string };
  const nextTax = Math.max(LEVER_BOUNDS.impuesto.min, vig.impuesto - 5);
  const nextPrensa = Math.min(LEVER_BOUNDS.prensa.max, vig.prensa + 10);
  const specs: Record<string, Spec | undefined> = {
    bajen_impuestos: {
      actorId: 'empresarios', actorNombre: 'Empresarios', titulo: 'Rebaja impositiva',
      razon: 'Demanda forzada (modo desarrollador).',
      amenaza: `Despido forzado de ${ACTOR_CONSTANTS.despidosMedida} empleados en la empresa más afectada.`,
      palanca: 'impuesto', nuevoValor: nextTax, etiqueta: `Bajar impuesto a ${nextTax}%`,
    },
    liberen_precio: {
      actorId: 'empresarios', actorNombre: 'Empresarios', titulo: 'Flexibilizar precio máximo',
      razon: 'Demanda forzada (modo desarrollador).',
      amenaza: `Retención parcial del stock diario de comida durante ${ACTOR_CONSTANTS.diasMedida} días.`,
      palanca: 'precioMaximo', nuevoValor: 'libre', etiqueta: 'Pasar tope a libre',
    },
    abran_exportacion: {
      actorId: 'empresarios', actorNombre: 'Empresarios', titulo: 'Habilitar exportación',
      razon: 'Demanda forzada (modo desarrollador).',
      amenaza: `Frenan inversiones privadas por ${ACTOR_CONSTANTS.diasMedida} días.`,
      palanca: 'comercioExterior', nuevoValor: -50, etiqueta: 'Pasar comercio exterior a Exportar (-50%)',
    },
    mas_pauta: medio
      ? {
          actorId: medio.id, actorNombre: medio.nombre, titulo: 'Aumento de pauta oficial',
          razon: 'Demanda forzada (modo desarrollador).',
          amenaza: `Campaña sostenida en tono crítico durante ${ACTOR_CONSTANTS.diasMedida} días.`,
          palanca: 'prensa', nuevoValor: nextPrensa, etiqueta: `Subir fondos de prensa a $${nextPrensa}`,
        }
      : undefined,
    silencio_pagado: medio
      ? {
          actorId: medio.id, actorNombre: medio.nombre, titulo: 'Acuerdo editorial por pauta',
          razon: 'Demanda forzada (modo desarrollador).',
          amenaza: `Campaña alarmista sobre el hambre durante ${ACTOR_CONSTANTS.diasMedida} días.`,
          palanca: 'prensa', nuevoValor: nextPrensa, etiqueta: `Subir prensa a $${nextPrensa}`,
        }
      : undefined,
  };
  const spec = specs[demandaId];
  if (!spec) return { ok: false, error: 'Demanda desconocida.' };
  if (state.demandasActivas.some((d) => d.actorId === spec.actorId)) return { ok: false, error: 'Ese actor ya tiene una demanda abierta.' };
  const dObj: ActiveDemand = {
    id: nextSeqId(state, `dem_${dia}`), actorId: spec.actorId, actorNombre: spec.actorNombre, demandaId: demandaId as DemandId,
    titulo: spec.titulo, razon: spec.razon, amenaza: spec.amenaza,
    pedido: { palanca: spec.palanca, nuevoValor: spec.nuevoValor, etiqueta: spec.etiqueta },
    diaCreada: dia, diasRestantes: ACTOR_CONSTANTS.diasRespuesta, diasCompromiso: ACTOR_CONSTANTS.diasCompromiso,
  };
  state.demandasActivas.push(dObj);
  const evId = nextSeqId(state, `ev_${dia}`);
  emitSimEvent(state, { id: evId, dia, tipo: 'demanda', zona: getWorldZones(state)[0] ?? 'centro', actorId: spec.actorId, demandaId: demandaId as DemandId, diasRespuesta: dObj.diasRestantes });
  return { ok: true };
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Nivel 1.1: profundidad (HOJA_DE_RUTA §3). Todo se activa solo con gobernador G3.
// - Extensión `fiscal`: emisión e inflación dinámica y `tope_emision` (ya viven en runPaydaySettlement).
// - Palancas de prensa `presion` y `acceso`, subsidio a la producción de alimento y educación como servicio con nivel.
// - Contraofertas a las demandas y más actores (sindicato de públicos, vecinos de una zona).
// Los valores están en LEVEL11_CONSTANTS (catalogs.ts) y en CALIBRACION §8. Las reglas que los docs no fijan quedan marcadas [propuesta].
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type ExtraLeverKey = 'subsidioAlimento' | 'presion' | 'acceso' | 'nivelEducacion';
export const EXTRA_LEVER_KEYS: ExtraLeverKey[] = ['subsidioAlimento', 'presion', 'acceso', 'nivelEducacion'];
export const EXTRA_LEVER_BOUNDS: Record<ExtraLeverKey, { min: number; max: number; step: number }> = {
  subsidioAlimento: { min: 0, max: 30, step: 1 },
  presion: { min: 0, max: 100, step: 5 },
  acceso: { min: 0, max: 100, step: 5 },
  nivelEducacion: { min: 0, max: 5, step: 1 },
};
const EXTRA_CONTROL: Record<ExtraLeverKey, string> = {
  subsidioAlimento: 'subsidio_alimento_pct',
  presion: 'presion_prensa',
  acceso: 'acceso_prensa',
  nivelEducacion: 'nivel_educacion',
};

export function ensureExtras(state: GameState): NonNullable<GovernmentState['extras']> {
  const g = state.gobierno;
  if (!g.extras) {
    g.extras = {
      vigentes: { subsidioAlimento: 0, presion: 0, acceso: 0, nivelEducacion: 0 },
      objetivo: { subsidioAlimento: 0, presion: 0, acceso: 0, nivelEducacion: 0 },
    };
  }
  return g.extras;
}

function governorLevel(state: GameState): GovernorComplexityLevel {
  return state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
}

/** Fija el objetivo de una palanca de nivel 1.1; entra en vigencia al día siguiente y emite `control` (CONTROLES §1). */
export function setExtraLever(state: GameState, key: ExtraLeverKey, value: number): { ok: boolean; error?: string } {
  if (state.resultado.estado !== 'jugando') return { ok: false, error: 'La partida ya finalizó.' };
  if (governorLevel(state) !== 'G3') return { ok: false, error: 'Esta palanca está disponible desde el nivel de gobernador G3.' };
  const b = EXTRA_LEVER_BOUNDS[key];
  if (!b || !Number.isFinite(value)) return { ok: false, error: 'Palanca o valor inválido.' };
  const v = clamp(Math.round(value / b.step) * b.step, b.min, b.max);
  ensureExtras(state).objetivo[key] = v;
  return { ok: true };
}

function applyExtraControls(state: GameState): void {
  const ex = state.gobierno.extras;
  if (!ex || governorLevel(state) !== 'G3') return;
  for (const key of EXTRA_LEVER_KEYS) {
    const prev = ex.vigentes[key];
    const next = ex.objetivo[key];
    if (Math.abs(next - prev) >= 0.01) {
      ex.vigentes[key] = next;
      recordControlEvent(state, EXTRA_CONTROL[key], prev, next, key);
    }
  }
}

/** Costo estimado por período de las palancas 1.1 (para la vista previa antes de confirmar). */
export function estimateExtrasCost(state: GameState, ex: { subsidioAlimento: number; presion: number; acceso: number; nivelEducacion: number }) {
  const refDia = referenciaSueldosAlimento(state);
  return {
    subsidio: Number((refDia * (ex.subsidioAlimento / 100) * PERIOD_DAYS).toFixed(1)),
    educacion: Number((ex.nivelEducacion * 18).toFixed(1)),
    acceso: state.medios.length > 0 ? Number((ex.acceso * LEVEL11_CONSTANTS.accesoCostoPorPunto).toFixed(1)) : 0,
    presion: 0,
  };
}

function referenciaSueldosAlimento(state: GameState): number {
  const activeAgro = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  const ult = activeAgro.reduce((s, f) => s + f.ultimoSueldosPeriodo, 0);
  if (ult > 0) return ult / PERIOD_DAYS;
  const agro = state.npcs.filter((n) => n.vivo && (n.rol === 'agricultor' || n.rol === 'tecnico')).length;
  return agro * ECON_CONSTANTS.salarioBasePublico * 1.2;
}

/** Costos y efectos diarios de las palancas 1.1 (después de la economía diaria). */
function runLevel11Daily(state: GameState): void {
  const ex = state.gobierno.extras;
  if (!ex || governorLevel(state) !== 'G3') return;
  const v = ex.vigentes;
  const acum = state.gobierno.acumuladoPeriodo;

  // Subsidio a la producción de alimento: el Estado paga un % del costo diario de sueldos del sector; el dinero va a las firmas agro.
  const activeAgro = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  if (v.subsidioAlimento > 0 && activeAgro.length > 0) {
    const pago = Math.min(
      Math.max(0, state.gobierno.reserva),
      referenciaSueldosAlimento(state) * (v.subsidioAlimento / 100)
    );
    if (pago > 0.001) {
      state.gobierno.reserva = Math.max(0, state.gobierno.reserva - pago);
      const perAgro = pago / activeAgro.length;
      for (const af of activeAgro) af.ventas += perAgro;
      acum.subsidios = Number(((acum.subsidios ?? 0) + pago).toFixed(2));
    }
  }
  // Acceso a la prensa: la oficina de prensa cuesta y se paga como fondos a los medios (conserva el dinero).
  if (v.acceso > 0 && state.medios.some((m) => m.activa !== false)) {
    acum.prensa += (v.acceso * LEVEL11_CONSTANTS.accesoCostoPorPunto) / PERIOD_DAYS;
  }
}

// ───────── Contraofertas (ACTORES §4) ─────────
function midValue(palanca: LeverKey, actual: number | string, pedido: number | string): number | string {
  if (palanca === 'comercioExterior') return pedido; // escalones fijos: sin punto medio, se recorta solo el compromiso
  if (typeof actual === 'number' && typeof pedido === 'number') {
    const bounds = (LEVER_BOUNDS as Record<string, { min: number; max: number; step: number }>)[palanca];
    const mid = actual + (pedido - actual) / 2;
    if (!bounds) return Math.round(mid);
    return clamp(Math.round(mid / bounds.step) * bounds.step, bounds.min, bounds.max);
  }
  if (palanca === 'precioMaximo') {
    const order: PriceCapMode[] = ['estricto', 'moderado', 'libre'];
    const a = order.indexOf(actual as PriceCapMode), p = order.indexOf(pedido as PriceCapMode);
    if (a >= 0 && p >= 0 && Math.abs(p - a) >= 2) return order[a + Math.sign(p - a)];
  }
  return pedido;
}

function actorDisposition(state: GameState, actorId: string): number {
  if (actorId === 'empresarios') {
    const priv = state.firmas.filter((f) => f.activa && (f.rubro === 'agro' || f.rubro === 'comercio'));
    const f =
      priv.length > 0
        ? priv.reduce((s, fi) => s + fi.factor, 0) / priv.length
        : 1;
    return clamp((f - 0.8) / 0.4, 0, 1);
  }
  const medio = state.medios.find((m) => m.id === actorId);
  if (medio) return clamp(medio.lineaEditorial.afinidadGobierno / 100, 0, 1);
  const sat = state.npcs.filter((n) => n.vivo).reduce((a, n) => a + n.variables.satisfaccion, 0) / Math.max(1, state.npcs.filter((n) => n.vivo).length);
  return clamp(sat / 100, 0, 1);
}

/**
 * Responder con condiciones: se ofrece la mitad del cambio pedido y la mitad del compromiso. El actor acepta con una
 * probabilidad que depende de su disposición (tirada del azar de la partida: determinista por semilla). Si rechaza,
 * se aplica su medida con la mitad de duración. [propuesta: los docs solo nombran las contraofertas]
 */
export function counterOfferDemand(state: GameState, demandId: string): { ok: boolean; aceptada?: boolean; error?: string; texto?: string } {
  if (state.resultado.estado !== 'jugando') return { ok: false, error: 'La partida ya finalizó.' };
  if (governorLevel(state) !== 'G3') return { ok: false, error: 'Las contraofertas están disponibles desde G3.' };
  const idx = state.demandasActivas.findIndex((d) => d.id === demandId);
  if (idx === -1) return { ok: false, error: 'La demanda ya no está activa.' };
  const [demand] = state.demandasActivas.splice(idx, 1);
  const dia = state.reloj.dia;
  state.cooldownActorDemanda[demand.actorId] = dia + ACTOR_CONSTANTS.diasEntreDemandas;
  const vig = state.gobierno.palancasVigentes;
  const mid = midValue(demand.pedido.palanca, vig[demand.pedido.palanca], demand.pedido.nuevoValor);
  const compromiso = Math.max(7, Math.round(demand.diasCompromiso / 2));
  const p = clamp(LEVEL11_CONSTANTS.contraofertaBase + LEVEL11_CONSTANTS.contraofertaPeso * actorDisposition(state, demand.actorId), 0.15, 0.92);
  const aceptada = nextRand(state) < p;
  const evId = nextSeqId(state, `ev_${dia}`);
  emitSimEvent(state, { id: evId, dia, tipo: 'contraoferta', zona: getWorldZones(state)[0] ?? 'centro', actorId: demand.actorId, demandaId: demand.demandaId, aceptada, palanca: demand.pedido.palanca, causa: demand.causaId });
  if (!aceptada) {
    rejectDemandInternal(state, { ...demand, causaId: evId }, false, 0.5);
    addLog(state, 'gobernador', `actor:${demand.actorId}/contraoferta`, `${demand.actorNombre} rechazó tu contraoferta`, `Aplica su medida con la mitad de duración.`, demand.causaId, evId);
    return { ok: true, aceptada: false, texto: `${demand.actorNombre} rechazó la contraoferta.` };
  }
  setLeverValueImmediate(state, demand.pedido.palanca, mid);
  state.bloqueosPalanca = state.bloqueosPalanca.filter((b) => b.palanca !== demand.pedido.palanca);
  state.bloqueosPalanca.push({
    palanca: demand.pedido.palanca,
    actorId: demand.actorId,
    actorNombre: demand.actorNombre,
    demandaId: demand.demandaId,
    hastaDia: dia + compromiso,
    motivo: `${demand.actorNombre}: contraoferta (${demand.pedido.etiqueta}, a medias)`,
  });
  addLog(state, 'gobernador', `actor:${demand.actorId}/contraoferta`, `Acuerdo parcial con ${demand.actorNombre}`, `Se fijó ${String(mid)} por ${compromiso} días en lugar de ${String(demand.pedido.nuevoValor)}.`, demand.causaId, evId);
  return { ok: true, aceptada: true, texto: `${demand.actorNombre} aceptó la contraoferta: ${String(mid)} por ${compromiso} días.` };
}

// ───────── Más actores (ACTORES §4): sindicato de públicos y vecinos de una zona ─────────
function pickOutletId(state: GameState): string | undefined {
  const sorted = [...state.medios].filter((m) => m.activa !== false).sort((a, b) => a.lineaEditorial.afinidadGobierno - b.lineaEditorial.afinidadGobierno);
  return sorted[0]?.id;
}

function evaluateExtraActors(state: GameState, derived: CommunityDerived): void {
  if (governorLevel(state) !== 'G3') return;
  const dia = state.reloj.dia;
  if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) return;
  const vig = state.gobierno.palancasVigentes;
  const defaultZone: ZoneId = getWorldZones(state)[0] ?? 'centro';
  const push = (
    actorId: string, actorNombre: string, demandaId: DemandId, titulo: string, razon: string, amenaza: string,
    palanca: LeverKey, nuevoValor: number | string, etiqueta: string, causaId?: string
  ) => {
    if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) return;
    if (state.demandasActivas.some((d) => d.actorId === actorId)) return;
    if (dia < (state.cooldownActorDemanda[actorId] ?? 0)) return;
    if (isLeverLocked(state, palanca)) return;
    const d: ActiveDemand = {
      id: nextSeqId(state, `dem_${dia}`), actorId, actorNombre, demandaId, titulo, razon, amenaza,
      pedido: { palanca, nuevoValor, etiqueta }, diaCreada: dia, diasRestantes: ACTOR_CONSTANTS.diasRespuesta,
      diasCompromiso: ACTOR_CONSTANTS.diasCompromiso, causaId,
    };
    state.demandasActivas.push(d);
    const evId = nextSeqId(state, `ev_${dia}`);
    emitSimEvent(state, { id: evId, dia, tipo: 'demanda', zona: defaultZone, actorId, demandaId, diasRespuesta: d.diasRestantes, causa: causaId });
    addLog(state, 'gobernador', `actor:${actorId}/demanda`, `Demanda de ${actorNombre}: ${titulo}`, `${razon} · Pide: ${etiqueta} (${d.diasRestantes}d de plazo).`, causaId, evId);
  };

  // Sindicato de públicos: salarios por debajo del valor normal o impago de nómina
  if (vig.salarioPublico < LEVEL11_CONSTANTS.sindicatoUmbralSalario || (state.gobierno.finanzas.impago && state.gobierno.finanzas.alcanzaNomina)) {
    const nuevo = Math.min(LEVER_BOUNDS.salarioPublico.max, Math.max(100, vig.salarioPublico + 15));
    if (nuevo > vig.salarioPublico) {
      push('sindicato', 'Sindicato de públicos', 'sindicato_salarios', 'Recomposición salarial',
        state.gobierno.finanzas.alcanzaNomina ? 'No se pagó la nómina pública completa.' : `El salario público está en ${vig.salarioPublico}% del valor normal.`,
        `Campaña crítica contra la gestión por ${ACTOR_CONSTANTS.diasMedida} días.`,
        'salarioPublico', nuevo, `Subir salario público a ${nuevo}%`, state.ultimaCausaPalanca);
    }
  }
  // Vecinos de una zona: hambre crítica o integridad baja (O(N) pre-bucketed)
  const zonas = getWorldZones(state);
  const popByZone: Partial<Record<ZoneId, number>> = {};
  const hungryByZone: Partial<Record<ZoneId, number>> = {};
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    const ez = getEffectiveZone(n, zonas.length);
    popByZone[ez] = (popByZone[ez] ?? 0) + 1;
    if (n.variables.hambre > 80) {
      hungryByZone[ez] = (hungryByZone[ez] ?? 0) + 1;
    }
  }
  for (const z of zonas) {
    if (state.demandasActivas.length >= ACTOR_CONSTANTS.maxDemandasSimultaneas) break;
    const habCount = popByZone[z] ?? 0;
    if (habCount < 3) continue;
    const hambre = ((hungryByZone[z] ?? 0) / habCount) * 100;
    if (hambre >= LEVEL11_CONSTANTS.vecinosUmbralHambrePct && vig.garantiaAlimentaria < 100) {
      const nuevo = Math.min(100, vig.garantiaAlimentaria + 15);
      push(`vecinos_${z}`, `Vecinos de ${z}`, 'vecinos_comida', 'Más comida para el barrio',
        `En ${z} el ${hambre.toFixed(0)}% pasa hambre crítica.`, `Cobertura alarmista sobre el hambre en ${z} por ${ACTOR_CONSTANTS.diasMedida} días.`,
        'garantiaAlimentaria', nuevo, `Subir garantía alimentaria a ${nuevo}%`, state.ultimoEventoClimaId || state.ultimaCausaPalanca);
    } else if ((state.gobierno.integridad[z] ?? 100) < LEVEL11_CONSTANTS.vecinosUmbralIntegridad && vig.nivelObras < 5) {
      const nuevo = (vig.nivelObras + 1) as ServiceLevel;
      push(`vecinos_${z}`, `Vecinos de ${z}`, 'vecinos_obras', 'Reparar el barrio',
        `La integridad de ${z} bajó a ${Math.round(state.gobierno.integridad[z] ?? 100)}.`, `Campaña crítica por el abandono de ${z} por ${ACTOR_CONSTANTS.diasMedida} días.`,
        'nivelObras', nuevo, `Subir nivel de obras a ${nuevo}`, state.ultimoEventoClimaId || state.ultimaCausaPalanca);
    }
  }
  void derived;
}

/** Medida por rechazo para los actores nuevos: usan una campaña de prensa con el medio más crítico. */
function extraActorMeasure(state: GameState, demand: ActiveDemand, rejEvId: string, until: number): ActorMeasure | null {
  const medioId = pickOutletId(state);
  if (!medioId) return null;
  const base = { id: nextSeqId(state, `med_${state.reloj.dia}`), actorId: demand.actorId, actorNombre: demand.actorNombre, tipo: 'campana' as const, hastaDia: until, medioId, causaId: rejEvId };
  if (demand.demandaId === 'sindicato_salarios') return { ...base, descripcion: `${demand.actorNombre} impulsa una campaña crítica por los salarios.`, tema: 'gobierno', tono: 'critico' };
  if (demand.demandaId === 'vecinos_comida') return { ...base, descripcion: `${demand.actorNombre} denuncia el hambre en su zona.`, tema: 'hambre', tono: 'alarmista' };
  if (demand.demandaId === 'vecinos_obras') return { ...base, descripcion: `${demand.actorNombre} reclama por el abandono de su zona.`, tema: 'obras', tono: 'critico' };
  return null;
}
