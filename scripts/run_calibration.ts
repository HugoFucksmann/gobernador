import fs from 'node:fs';
import path from 'node:path';
import {
  DIRECTOR_CONSTANTS,
  ECON_CONSTANTS,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../src/data/catalogs';
import { getBuildingJobCaps } from '../src/engine/policies';
import { nextRand, nextSeqId } from '../src/engine/rng';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canTriggerSpontaneousChaos,
  computeTotalWorldMoney,
  deriveCommunityStats,
  getActivePhenomena,
  getAnnouncedPhenomena,
  orderBuildInParcela,
  orderDemolishParcela,
  pickActionText,
  pickChaosCandidateNpc,
  planDailyPressPublications,
  resolveConditionWindowWithFallback,
  respondToDemand,
  selectCandidateActions,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import { canBuildTypeInParcela } from '../src/engine/worldHelpers';
import {
  BuildingType,
  FixedPublicRoleId,
  ForeignTradeStep,
  GameState,
  GovernorComplexityLevel,
  GovernorLevers,
  PriceCapMode,
  PrivateRoleId,
  RoleId,
  ServiceLevel,
  WorldComplexityLevel,
  WorldConfig,
} from '../src/types/game';

interface PresetFile {
  id: string;
  ECON_CONSTANTS: Partial<typeof ECON_CONSTANTS>;
  ROLE_CATALOG_ingresos: Partial<Record<PrivateRoleId, [number, number]>>;
  SCENARIO_PRESET: {
    poblacionDefault: number;
    mediosDefault: number;
    inflacionInicial: number;
    reservaInicial: number;
    stockAlimentoInicial: number;
    topesPrivados: Record<PrivateRoleId, number>;
    cuposFijos: Record<FixedPublicRoleId, number>;
    nivelObrasInicial: ServiceLevel;
    caosDefault: typeof SCENARIO_PRESETS.elecciones.caosDefault;
  };
  initialLevers: GovernorLevers;
  droughtPrueba: {
    intensidad: number;
    inicioDia: number;
    duracionDias: number;
  };
  heuristicPolicy: {
    evaluacionCadaDias: number;
    stockCriticoDias: number;
    intercambioCritico: ForeignTradeStep;
    stockAlertaDeficitDias: number;
    intercambioPreventivo: ForeignTradeStep;
    umbralReservaDiasNomina: number;
    impuestoEmergenciaMax: number;
    impuestoAlivioMin: number;
    umbralApoyoAlivio: number;
    umbralDescontentosPct: number;
    incrementoAyudaSocial: number;
    topeAyudaSocial: number;
  };
}

type SuiteName = 'all' | 'verify' | 'm0' | 'collapse' | 'sensitivity' | 'nondom';
type PolicyMode = 'pasivo' | 'heuristico' | 'estratega';

interface CliArgs {
  suite: SuiteName;
  quick: boolean;
  nOverride: number | null;
}

function parseCliArgs(): CliArgs {
  let suite: SuiteName = 'all';
  let quick = false;
  let nOverride: number | null = null;

  for (const arg of process.argv.slice(2)) {
    if (arg === '--quick') {
      quick = true;
    } else if (arg.startsWith('--suite=')) {
      const val = arg.split('=')[1] as SuiteName;
      if (['all', 'verify', 'm0', 'collapse', 'sensitivity', 'nondom'].includes(val)) {
        suite = val;
      }
    } else if (arg.startsWith('--n=')) {
      const parsed = Number(arg.split('=')[1]);
      if (Number.isFinite(parsed) && parsed >= 1) {
        nOverride = Math.round(parsed);
      }
    }
  }
  return { suite, quick, nOverride };
}

const CLI = parseCliArgs();
const presetPath = path.resolve(process.cwd(), 'presets/elecciones_simple.json');
const PRESET: PresetFile = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));

function applyPresetToRuntime(): void {
  Object.assign(ECON_CONSTANTS, PRESET.ECON_CONSTANTS);
  (Object.keys(PRESET.ROLE_CATALOG_ingresos) as PrivateRoleId[]).forEach((r) => {
    const rng = PRESET.ROLE_CATALOG_ingresos[r];
    if (rng) ROLE_CATALOG[r].ingreso = [...rng];
  });
  SCENARIO_PRESETS.elecciones.reservaInicial = PRESET.SCENARIO_PRESET.reservaInicial;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = PRESET.SCENARIO_PRESET.stockAlimentoInicial;
  SCENARIO_PRESETS.elecciones.topesPrivados = { ...PRESET.SCENARIO_PRESET.topesPrivados };
  SCENARIO_PRESETS.elecciones.cuposFijos = { ...PRESET.SCENARIO_PRESET.cuposFijos };
  SCENARIO_PRESETS.elecciones.nivelObrasInicial = PRESET.SCENARIO_PRESET.nivelObrasInicial;
  SCENARIO_PRESETS.elecciones.initialLevers = structuredClone(PRESET.initialLevers);
  SCENARIO_PRESETS.elecciones.caosDefault = { ...PRESET.SCENARIO_PRESET.caosDefault };
}

function buildOnFreeParcels(state: GameState, tipos: BuildingType[]): number {
  let built = 0;
  for (const tipo of tipos) {
    const free = state.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, tipo));
    if (!free) continue;
    const res = orderBuildInParcela(state, free.id, tipo);
    if (res.ok) built += 1;
  }
  return built;
}

function runRandomDirectorDay(state: GameState): void {
  if (state.config.nivelMundo === 'M0' || !state.config.usarIaGemini) return;

  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente') {
      const chosen = win.candidatas[Math.floor(nextRand(state) * win.candidatas.length)];
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, 'motor');
    }
  }
  if (state.colaHechosDia.length > 0 && state.medios.length > 0) {
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
  for (let i = 0; i < DIRECTOR_CONSTANTS.ofertasPorDia; i++) {
    const gate = canTriggerSpontaneousChaos(state);
    if (!gate.allowed) break;
    const npc = pickChaosCandidateNpc(state);
    if (!npc) break;
    const candidatas = selectCandidateActions(npc, state);
    if (candidatas.length === 0) break;
    const chosen = candidatas[Math.floor(nextRand(state) * candidatas.length)];
    const roleName = ROLE_CATALOG[npc.rol].nombre.toLowerCase();
    applyActionToNpc(state, npc, chosen, pickActionText(chosen, npc.nombre, state, roleName, npc.zona), 'motor');
    state.caosTracker.accionesEnVentana += 1;
  }
}

function applyHeuristicGovernor(state: GameState): void {
  const hp = PRESET.heuristicPolicy;
  const baseTax = SCENARIO_PRESETS[state.config.escenarioId].initialLevers.impuesto;
  const lev = state.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(state);
  const publicCount =
    d.roles.policia + d.roles.estatal + d.roles.docente + d.roles.medico + d.roles.ingeniero;
  const dailyPayroll = publicCount * ECON_CONSTANTS.salarioBasePublico * (lev.salarioPublico / 100);

  if (state.alimento.diasStock < hp.stockCriticoDias) {
    lev.comercioExterior = hp.intercambioCritico;
  } else if (
    state.alimento.diasStock < hp.stockAlertaDeficitDias &&
    state.alimento.produccionDiaria < state.alimento.consumoDiario
  ) {
    lev.comercioExterior = hp.intercambioPreventivo;
  } else if (state.alimento.diasStock >= state.alimento.siloDias - 3 && state.gobierno.reserva < dailyPayroll * 18) {
    lev.comercioExterior = -50;
  } else {
    lev.comercioExterior = 0;
  }

  lev.garantiaAlimentaria = d.hambreCriticaPct > 5 ? 100 : 85;
  lev.precioMaximo =
    state.alimento.precioMercado > ECON_CONSTANTS.precioBaseAlimento * 1.45 ? 'moderado' : 'libre';

  if (state.gobierno.reserva < dailyPayroll * hp.umbralReservaDiasNomina || lev.comercioExterior >= hp.intercambioPreventivo) {
    lev.impuesto = Math.min(hp.impuestoEmergenciaMax, baseTax + 6);
  } else if (lev.comercioExterior > 0) {
    lev.impuesto = Math.min(hp.impuestoEmergenciaMax - 2, baseTax + 3);
  } else if (
    (d.apoyoPct < hp.umbralApoyoAlivio || d.descontentosPct > hp.umbralDescontentosPct) &&
    state.gobierno.reserva >= dailyPayroll * hp.umbralReservaDiasNomina
  ) {
    lev.impuesto = Math.max(hp.impuestoAlivioMin, baseTax - 4);
  } else {
    lev.impuesto = baseTax;
  }

  if (
    d.descontentosPct > hp.umbralDescontentosPct &&
    state.gobierno.finanzas.saldo > 20 &&
    lev.comercioExterior <= 0 &&
    state.gobierno.reserva >= dailyPayroll * hp.umbralReservaDiasNomina
  ) {
    lev.ayudaSocial = Math.min(hp.topeAyudaSocial, lev.ayudaSocial + hp.incrementoAyudaSocial);
  } else if (state.gobierno.finanzas.impago || state.gobierno.reserva < dailyPayroll * 18) {
    lev.ayudaSocial = Math.max(0, lev.ayudaSocial - 0.5);
  }
}

function applyFullStrategistPolicy(state: GameState): void {
  applyHeuristicGovernor(state);
  const d = deriveCommunityStats(state);
  const govLevel = state.config.nivelGobernador ?? 'G2';
  const active = getActivePhenomena(state);
  const announced = getAnnouncedPhenomena(state);
  const allFen = [...active, ...announced];

  // 1. Handle active actor demands selectively (G2+)
  if (govLevel === 'G2' || govLevel === 'G3') {
    for (const dem of [...state.demandasActivas]) {
      const accept =
        dem.demandaId === 'abran_exportacion' ||
        (dem.demandaId === 'liberen_precio' && state.alimento.diasStock >= 5) ||
        (dem.demandaId === 'bajen_impuestos' && state.gobierno.reserva > 2400 && state.gobierno.palancasVigentes.impuesto >= 40) ||
        (dem.demandaId === 'mas_pauta' && state.gobierno.reserva > 2800 && state.gobierno.palancasVigentes.prensa <= 18);
      respondToDemand(state, dem.id, accept);
    }
  }

  // 2. Build services & suceso works when budget permits
  const inConstruction = state.parcelas.filter((p) => p.estado === 'en_obra').length;
  const findFreeFor = (tipo: BuildingType) =>
    state.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, tipo));
  if (inConstruction === 0 && state.gobierno.reserva >= 1800) {
    const activeTypes = new Set(
      state.parcelas
        .filter((p) => p.edificio && p.edificio.estado === 'ocupada')
        .map((p) => p.edificio!.tipo)
    );
    const comisarias = state.parcelas.filter((p) => p.edificio?.tipo === 'comisaria').length;
    const hospitales = state.parcelas.filter((p) => p.edificio?.tipo === 'hospital').length;
    const hasDrought = allFen.some((f) => f.tipo === 'sequia');
    const hasPandemic = allFen.some((f) => f.tipo === 'pandemia');
    const hasZombie = allFen.some((f) => f.tipo === 'plaga_zombie');

    let chosenBuild: BuildingType | null = null;
    if (state.config.escenarioId === 'zombies' && comisarias < 2 && state.gobierno.reserva >= 1800) {
      chosenBuild = 'comisaria';
    } else if ((govLevel === 'G2' || govLevel === 'G3') && hasDrought && !activeTypes.has('riego') && state.gobierno.reserva >= 1900) {
      chosenBuild = 'riego';
    } else if ((govLevel === 'G2' || govLevel === 'G3') && hasDrought && !activeTypes.has('silo') && state.gobierno.reserva >= 2100) {
      chosenBuild = 'silo';
    } else if ((govLevel === 'G2' || govLevel === 'G3') && hasZombie && !activeTypes.has('muralla') && state.gobierno.reserva >= 2200) {
      chosenBuild = 'muralla';
    } else if ((govLevel === 'G2' || govLevel === 'G3') && hasPandemic && !activeTypes.has('hospital_campana') && state.gobierno.reserva >= 1700) {
      chosenBuild = 'hospital_campana';
    } else if ((d.hospitalOcupacionPct > 95 || d.esperandoCama > 1) && hospitales < 2 && state.gobierno.reserva >= 2400) {
      chosenBuild = 'hospital';
    } else if (state.config.escenarioId === 'elecciones' && state.gobierno.indicadores.seguridad < 45 && comisarias < 2 && state.gobierno.reserva >= 2600) {
      chosenBuild = 'comisaria';
    }
    if (chosenBuild) {
      const target = findFreeFor(chosenBuild);
      if (target) orderBuildInParcela(state, target.id, chosenBuild);
    }
  }
}

interface InitStateOpts {
  nivelMundo?: WorldComplexityLevel;
  nivelGobernador?: GovernorComplexityLevel;
  disableRandomWeather?: boolean;
}

function makeInitState(
  seed: number,
  scenarioId: 'elecciones' | 'zombies' = 'elecciones',
  opts: InitStateOpts = {}
): GameState {
  if (scenarioId === 'elecciones') {
    applyPresetToRuntime();
  }
  const preset = SCENARIO_PRESETS[scenarioId];
  const nivelMundo = opts.nivelMundo ?? 'M1';
  const nivelGobernador = opts.nivelGobernador ?? 'G2';
  const cfg: WorldConfig = {
    escenarioId: scenarioId,
    economiaModulo: nivelMundo === 'M4' ? 'fiscal' : 'base',
    nivelMundo,
    nivelGobernador,
    cantidadMedios: preset.mediosDefault,
    poblacionInicial: preset.poblacionDefault,
    caos: { ...preset.caosDefault },
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  if (opts.disableRandomWeather || nivelMundo === 'M0') {
    s.clima.proximoEventoDia = 999999;
    if (opts.disableRandomWeather && scenarioId === 'elecciones') {
      s.clima.fenomenos = [];
    }
  }
  return s;
}

function summarize(arr: number[]): { mean: number; sd: number; min: number; max: number } {
  if (arr.length === 0) return { mean: 0, sd: 0, min: 0, max: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return {
    mean: Number(mean.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: Number(Math.min(...arr).toFixed(2)),
    max: Number(Math.max(...arr).toFixed(2)),
  };
}

interface BatchOpts {
  scenarioId?: 'elecciones' | 'zombies';
  nivelMundo?: WorldComplexityLevel;
  nivelGobernador?: GovernorComplexityLevel;
  disableRandomWeather?: boolean;
  n: number;
  chaos: boolean;
  chaosStopDay?: number;
  drought?: { intensidad: number; inicioDia: number; duracionDias: number; avisoDias?: number };
  policy?: PolicyMode;
  mutator?: (s: GameState) => void;
  dailyMutator?: (s: GameState, day: number) => void;
  maxDays?: number;
  checkpoints?: number[];
}

interface MilestoneRecord {
  primerRecorteEmpresa: number | null;
  primerImpago: number | null;
  primerImpagoNomina: number | null;
  primerConflicto: number | null;
  primeraDemanda: number | null;
  primeraMedidaActor: number | null;
  primeraMuerte: number | null;
  derrota: number | null;
}

interface CheckpointMetrics {
  apoyoPct: number;
  satisfaccion: number;
  hambrePct: number;
  descontentosPct: number;
  poblacionPct: number;
  reserva: number;
  diasStock: number;
  precio: number;
  integridadMin: number;
}

const ALL_ROLES: RoleId[] = [
  'estudiante', 'agricultor', 'obrero', 'policia', 'estatal', 'comerciante',
  'empresario', 'tecnico', 'docente', 'periodista', 'medico', 'ingeniero',
  'constructor', 'inmobiliario', 'desempleado', 'jubilado',
];

function summarizeMilestones(records: MilestoneRecord[]) {
  const keys: Array<keyof MilestoneRecord> = [
    'primerRecorteEmpresa',
    'primerImpago',
    'primerImpagoNomina',
    'primerConflicto',
    'primeraDemanda',
    'primeraMedidaActor',
    'primeraMuerte',
    'derrota',
  ];
  const out: Record<string, { count: number; meanDay: number | null; minDay: number | null; maxDay: number | null }> = {};
  for (const k of keys) {
    const vals = records.map((r) => r[k]).filter((v): v is number => v !== null);
    if (vals.length === 0) {
      out[k] = { count: 0, meanDay: null, minDay: null, maxDay: null };
    } else {
      const s = summarize(vals);
      out[k] = { count: vals.length, meanDay: s.mean, minDay: s.min, maxDay: s.max };
    }
  }
  return out;
}

function runBatch(label: string, opts: BatchOpts) {
  const scenarioId = opts.scenarioId ?? 'elecciones';
  const maxDays = opts.maxDays ?? (scenarioId === 'zombies' ? 180 : 365);
  const checkpointsList =
    opts.checkpoints ??
    (maxDays <= 40
      ? [15, maxDays]
      : maxDays <= 100
      ? [30, 60, maxDays]
      : scenarioId === 'zombies'
      ? [30, 60, 90, 120, 150, 180]
      : [30, 60, 90, 120, 180, 270, 365]);

  let wins = 0;
  let lostObjNoDefeat = 0;
  let defeats = 0;
  let totalImpagos = 0;
  let seedsWithImpago = 0;
  let totalNominaImpagos = 0;
  let totalEnterpriseResponses = 0;
  let minAnyRoleCount = 999;
  let invariantViolations = 0;

  const prod1: number[] = [];
  const cons1: number[] = [];
  const ing7: number[] = [];
  const gastos7: number[] = [];
  const saldo7: number[] = [];
  const ingRatio7: number[] = [];
  const sat0: number[] = [];
  const satEnd: number[] = [];
  const deltaSat: number[] = [];
  const apoyoEnd: number[] = [];
  const hambreEnd: number[] = [];
  const popPctEnd: number[] = [];
  const reservaEnd: number[] = [];
  const minStock: number[] = [];
  const initFoodProfit: number[] = [];
  const initComProfit: number[] = [];
  const milestoneRecords: MilestoneRecord[] = [];
  const checkpointBuckets = new Map<number, CheckpointMetrics[]>();
  for (const cp of checkpointsList) checkpointBuckets.set(cp, []);

  for (let seed = 1; seed <= opts.n; seed++) {
    const s = makeInitState(seed, scenarioId, {
      nivelMundo: opts.nivelMundo,
      nivelGobernador: opts.nivelGobernador,
      disableRandomWeather: opts.disableRandomWeather,
    });
    if (opts.drought) {
      s.clima.fenomenos.push({
        id: 'seq_prueba',
        tipo: 'sequia',
        nombre: 'Sequía de prueba',
        intensidad: opts.drought.intensidad,
        inicioDia: opts.drought.inicioDia,
        duracionDias: opts.drought.duracionDias,
        avisoDias: opts.drought.avisoDias ?? 0,
      });
    }
    if (opts.mutator) opts.mutator(s);
    initFoodProfit.push(
      s.firmas.filter((f) => f.activa && f.rubro === 'agro').reduce((a, f) => a + f.ultimaGanancia, 0)
    );
    initComProfit.push(
      s.firmas.filter((f) => f.activa && f.rubro === 'comercio').reduce((a, f) => a + f.ultimaGanancia, 0)
    );
    const d0 = deriveCommunityStats(s);
    sat0.push(d0.satisfaccionMedia);

    let hadImp = false;
    let minS = s.alimento.stock;
    let prevEvCount = s.eventos.length;
    const ms: MilestoneRecord = {
      primerRecorteEmpresa: null,
      primerImpago: null,
      primerImpagoNomina: null,
      primerConflicto: null,
      primeraDemanda: null,
      primeraMedidaActor: null,
      primeraMuerte: null,
      derrota: null,
    };

    const recordCheckpoint = (day: number) => {
      if (!checkpointBuckets.has(day)) return;
      const ds = deriveCommunityStats(s);
      const integVals = Object.values(s.gobierno.integridad);
      checkpointBuckets.get(day)!.push({
        apoyoPct: ds.apoyoPct,
        satisfaccion: ds.satisfaccionMedia,
        hambrePct: ds.hambreCriticaPct,
        descontentosPct: ds.descontentosPct,
        poblacionPct: ds.poblacionPct,
        reserva: s.gobierno.reserva,
        diasStock: s.alimento.diasStock,
        precio: s.alimento.precio,
        integridadMin: integVals.length > 0 ? Math.min(...integVals) : 100,
      });
    };

    for (let d = 1; d < maxDays; d++) {
      if (opts.policy && opts.policy !== 'pasivo' && s.reloj.dia % PRESET.heuristicPolicy.evaluacionCadaDias === 0) {
        if (opts.policy === 'heuristico') applyHeuristicGovernor(s);
        else if (opts.policy === 'estratega') applyFullStrategistPolicy(s);
      }
      if (opts.dailyMutator) {
        opts.dailyMutator(s, s.reloj.dia);
      }

      const prevTotalMoney = computeTotalWorldMoney(s);
      stepHeadlessDay(s);
      const curTotalMoney = computeTotalWorldMoney(s);
      if (Math.abs(curTotalMoney - (prevTotalMoney + s.auditEntradasDia - s.auditSalidasDia)) > 0.05) {
        invariantViolations++;
      }

      if (d === 1) {
        prod1.push(s.alimento.produccionDiaria);
        cons1.push(s.alimento.consumoDiario);
      }
      if (d === PERIOD_DAYS) {
        const fin = s.gobierno.finanzas;
        const gastos =
          fin.nomina +
          fin.pensiones +
          fin.comidaMenores +
          fin.garantiaAlimentaria +
          fin.ayudaSocial +
          fin.operacion +
          (fin.obras ?? 0) +
          fin.prensa;
        ing7.push(fin.ingresos);
        gastos7.push(gastos);
        saldo7.push(fin.saldo);
        ingRatio7.push(fin.ingresos / Math.max(1, gastos));
      }

      if (opts.chaos && (!opts.chaosStopDay || s.reloj.dia <= opts.chaosStopDay)) {
        runRandomDirectorDay(s);
      }

      if (s.gobierno.finanzas.impago && s.reloj.diasEnPeriodo === 0) {
        totalImpagos++;
        hadImp = true;
      }
      if (s.alimento.stock < minS) minS = s.alimento.stock;

      // Scan newly emitted events (s.eventos is unshifted)
      const newCount = Math.max(0, s.eventos.length - prevEvCount);
      for (let idx = 0; idx < newCount; idx++) {
        const ev = s.eventos[idx];
        if (!ev) continue;
        if ((ev.tipo === 'empresa_recorte' || ev.tipo === 'empresa_despido') && ms.primerRecorteEmpresa === null) {
          ms.primerRecorteEmpresa = ev.dia;
        } else if (ev.tipo === 'impago') {
          if (ms.primerImpago === null) ms.primerImpago = ev.dia;
          if (ev.alcanzaNomina && ms.primerImpagoNomina === null) ms.primerImpagoNomina = ev.dia;
        } else if (
          ev.tipo === 'accion_inicio' &&
          (ev.accion === 'huelga' || ev.accion === 'protesta' || ev.accion === 'saqueo') &&
          ms.primerConflicto === null
        ) {
          ms.primerConflicto = ev.dia;
        } else if (ev.tipo === 'demanda' && ms.primeraDemanda === null) {
          ms.primeraDemanda = ev.dia;
        } else if (ev.tipo === 'medida' && ms.primeraMedidaActor === null) {
          ms.primeraMedidaActor = ev.dia;
        } else if (ev.tipo === 'muerte' && ms.primeraMuerte === null) {
          ms.primeraMuerte = ev.dia;
        }
      }
      prevEvCount = s.eventos.length;

      if (d % PERIOD_DAYS === 0) {
        if (s.gobierno.reserva < -0.01 || s.alimento.stock < -0.01) {
          invariantViolations++;
        }
        for (const npc of s.npcs) {
          if (
            npc.variables.salud < 0 || npc.variables.salud > 100 ||
            npc.variables.hambre < 0 || npc.variables.hambre > 100 ||
            npc.variables.miedo < 0 || npc.variables.miedo > 100 ||
            npc.variables.satisfaccion < 0 || npc.variables.satisfaccion > 100 ||
            npc.variables.lealtad < 0 || npc.variables.lealtad > 100
          ) {
            invariantViolations++;
          }
        }
        const dsCheck = deriveCommunityStats(s);
        for (const r of ALL_ROLES) {
          if (dsCheck.roles[r] < minAnyRoleCount) minAnyRoleCount = dsCheck.roles[r];
        }
      }

      recordCheckpoint(s.reloj.dia);

      if (s.resultado.estado === 'derrota') {
        if (ms.derrota === null) ms.derrota = s.reloj.dia;
        break;
      }
    }

    milestoneRecords.push(ms);
    totalNominaImpagos += s.eventos.filter((e) => e.tipo === 'impago' && e.alcanzaNomina).length;
    totalEnterpriseResponses += s.eventos.filter(
      (e) => e.tipo === 'empresa_recorte' || e.tipo === 'empresa_despido'
    ).length;
    const de = deriveCommunityStats(s);
    if (s.resultado.estado === 'derrota') {
      defeats++;
    } else if (s.resultado.victoriaCumplida) {
      wins++;
    } else if (s.eventos.some((e) => e.tipo === 'objetivo_perdido')) {
      lostObjNoDefeat++;
    }
    if (hadImp) seedsWithImpago++;
    satEnd.push(de.satisfaccionMedia);
    deltaSat.push(de.satisfaccionMedia - d0.satisfaccionMedia);
    apoyoEnd.push(de.apoyoPct);
    hambreEnd.push(de.hambreCriticaPct);
    popPctEnd.push(de.poblacionPct);
    reservaEnd.push(s.gobierno.reserva);
    minStock.push(minS);
  }

  const timeline: Record<string, Record<string, number>> = {};
  for (const [day, rows] of checkpointBuckets.entries()) {
    if (rows.length === 0) continue;
    timeline[`d${day}`] = {
      nAlive: rows.length,
      popPct: summarize(rows.map((r) => r.poblacionPct)).mean,
      apoyo: summarize(rows.map((r) => r.apoyoPct)).mean,
      sat: summarize(rows.map((r) => r.satisfaccion)).mean,
      hambre: summarize(rows.map((r) => r.hambrePct)).mean,
      descont: summarize(rows.map((r) => r.descontentosPct)).mean,
      res: summarize(rows.map((r) => r.reserva)).mean,
      stockDias: summarize(rows.map((r) => r.diasStock)).mean,
      precio: summarize(rows.map((r) => r.precio)).mean,
      integMin: summarize(rows.map((r) => r.integridadMin)).mean,
    };
  }

  return {
    label,
    scenarioId,
    nivelMundo: opts.nivelMundo ?? 'M1',
    nivelGobernador: opts.nivelGobernador ?? 'G2',
    n: opts.n,
    winPct: Number(((wins / opts.n) * 100).toFixed(2)),
    lostObjNoDefeatPct: Number(((lostObjNoDefeat / opts.n) * 100).toFixed(2)),
    defeatPct: Number(((defeats / opts.n) * 100).toFixed(2)),
    seedsWithImpago,
    totalImpagos,
    totalNominaImpagos,
    totalEnterpriseResponses,
    minAnyRoleCount,
    invariantViolations,
    initFoodProfit: summarize(initFoodProfit),
    initComProfit: summarize(initComProfit),
    prod1: summarize(prod1),
    cons1: summarize(cons1),
    ing7: summarize(ing7),
    gastos7: summarize(gastos7),
    saldo7: summarize(saldo7),
    ingRatio7: summarize(ingRatio7),
    sat0: summarize(sat0),
    satEnd: summarize(satEnd),
    deltaSat: summarize(deltaSat),
    apoyoEnd: summarize(apoyoEnd),
    hambreEnd: summarize(hambreEnd),
    popPctEnd: summarize(popPctEnd),
    reservaEnd: summarize(reservaEnd),
    minStock: summarize(minStock),
    milestones: summarizeMilestones(milestoneRecords),
    timeline,
  };
}

function runM0AndG1Suites(n: number) {
  const m0g0Elecciones30d = runBatch('M0_G0_elecciones_30d', {
    scenarioId: 'elecciones',
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 30,
  });

  const m0g0Elecciones90d = runBatch('M0_G0_elecciones_90d', {
    scenarioId: 'elecciones',
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 90,
  });

  const m0g0Zombies30d = runBatch('M0_G0_zombies_30d', {
    scenarioId: 'zombies',
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 30,
  });

  const m0g1Pasivo = runBatch('M0_G1_pasivo_90d', {
    scenarioId: 'elecciones',
    nivelMundo: 'M0',
    nivelGobernador: 'G1',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 90,
  });

  const m0g1Equilibrado = runBatch('M0_G1_1hosp_alivio_90d', {
    scenarioId: 'elecciones',
    nivelMundo: 'M0',
    nivelGobernador: 'G1',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 90,
    mutator: (s) => {
      buildOnFreeParcels(s, ['hospital']);
      s.gobierno.palancasObjetivo.impuesto = 35;
      s.gobierno.palancasObjetivo.ayudaSocial = 1.0;
      s.gobierno.palancasObjetivo.garantiaAlimentaria = 100;
    },
  });

  const m0g1Sobreconstruccion = runBatch('M0_G1_sobreconstruccion_90d', {
    scenarioId: 'elecciones',
    nivelMundo: 'M0',
    nivelGobernador: 'G1',
    disableRandomWeather: true,
    n,
    chaos: false,
    maxDays: 90,
    mutator: (s) => {
      buildOnFreeParcels(s, ['hospital', 'hospital', 'comisaria', 'comisaria']);
      s.gobierno.palancasObjetivo.impuesto = 32;
      s.gobierno.palancasObjetivo.ayudaSocial = 3.0;
    },
  });

  return {
    m0g0Elecciones30d,
    m0g0Elecciones90d,
    m0g0Zombies30d,
    m0g1Pasivo,
    m0g1Equilibrado,
    m0g1Sobreconstruccion,
  };
}

function runCollapseAndDifficultySuite(n: number) {
  // 1. Elecciones en M1 real (clima aleatorio + caos, sin sequia inyectada)
  const elecRealPasivo = runBatch('E_M1_real_pasivo', {
    scenarioId: 'elecciones',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: false,
    n,
    chaos: true,
    policy: 'pasivo',
  });

  const elecRealEstratega = runBatch('E_M1_real_estratega', {
    scenarioId: 'elecciones',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: false,
    n,
    chaos: true,
    policy: 'estratega',
  });

  // 2. Elecciones controlado con sequia calibrada (con aviso previo de 10d)
  const elecSequiaPasivo = runBatch('E_sequia_pasivo', {
    scenarioId: 'elecciones',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
    n,
    chaos: true,
    drought: { ...PRESET.droughtPrueba, avisoDias: 10 },
    policy: 'pasivo',
  });

  const elecSequiaHeuristico = runBatch('E_sequia_heuristico', {
    scenarioId: 'elecciones',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
    n,
    chaos: true,
    drought: { ...PRESET.droughtPrueba, avisoDias: 10 },
    policy: 'heuristico',
  });

  const elecSequiaEstratega = runBatch('E_sequia_estratega', {
    scenarioId: 'elecciones',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
    n,
    chaos: true,
    drought: { ...PRESET.droughtPrueba, avisoDias: 10 },
    policy: 'estratega',
  });

  // 3. Zombies en M1 real: pasivo vs heuristico (solo palancas) vs estratega (comisarias/muralla + demandas)
  const zombRealPasivo = runBatch('Z_M1_real_pasivo', {
    scenarioId: 'zombies',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: false,
    n,
    chaos: true,
    policy: 'pasivo',
  });

  const zombRealSoloPalancas = runBatch('Z_M1_real_solo_palancas', {
    scenarioId: 'zombies',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: false,
    n,
    chaos: true,
    policy: 'heuristico',
  });

  const zombRealEstratega = runBatch('Z_M1_real_estratega', {
    scenarioId: 'zombies',
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: false,
    n,
    chaos: true,
    policy: 'estratega',
  });

  return {
    elecRealPasivo,
    elecRealEstratega,
    elecSequiaPasivo,
    elecSequiaHeuristico,
    elecSequiaEstratega,
    zombRealPasivo,
    zombRealSoloPalancas,
    zombRealEstratega,
  };
}

function runAllLeversAndBuildingsSensitivity(n: number) {
  const evalRun = (opts: {
    days: number;
    drought?: { intensidad: number; inicioDia: number; duracionDias: number };
    mutator?: (s: GameState) => void;
  }) => {
    const apoyos: number[] = [];
    const reservas: number[] = [];
    const hambres: number[] = [];
    const stocks: number[] = [];
    const precios: number[] = [];
    const empResps: number[] = [];
    const segInd: number[] = [];
    const salInd: number[] = [];
    const infInd: number[] = [];
    const medAlc: number[] = [];
    const medCred: number[] = [];
    const medDep: number[] = [];
    const foodProf: number[] = [];

    for (let seed = 1; seed <= n; seed++) {
      const s = makeInitState(seed, 'elecciones', {
        nivelMundo: 'M1',
        nivelGobernador: 'G2',
        disableRandomWeather: true,
      });
      if (opts.mutator) opts.mutator(s);
      for (let d = 1; d < opts.days; d++) {
        if (opts.drought && s.reloj.dia === opts.drought.inicioDia) {
          s.clima.fenomenos.push({
            id: 'seq_sens',
            tipo: 'sequia',
            nombre: 'Sequía sensibilidad',
            intensidad: opts.drought.intensidad,
            inicioDia: opts.drought.inicioDia,
            duracionDias: opts.drought.duracionDias,
          });
        }
        stepHeadlessDay(s);
      }
      const ds = deriveCommunityStats(s);
      apoyos.push(ds.apoyoPct);
      reservas.push(s.gobierno.reserva);
      hambres.push(ds.hambreCriticaPct);
      stocks.push(s.alimento.stock);
      precios.push(s.alimento.precio);
      empResps.push(
        s.eventos.filter((e) => e.tipo === 'empresa_recorte' || e.tipo === 'empresa_despido').length
      );
      segInd.push(s.gobierno.indicadores.seguridad);
      salInd.push(s.gobierno.indicadores.salud);
      infInd.push(s.gobierno.indicadores.infraestructura);
      medAlc.push(s.medios[0]?.alcancePct ?? 0);
      medCred.push(s.medios[0]?.credibilidad ?? 0);
      medDep.push(s.medios[0]?.finanzas.dependenciaPct ?? 0);
      foodProf.push(
        s.firmas.filter((f) => f.activa && f.rubro === 'agro').reduce((a, f) => a + f.ultimaGanancia, 0)
      );
    }
    return {
      apoyo: summarize(apoyos).mean,
      reserva: summarize(reservas).mean,
      hambre: summarize(hambres).mean,
      stock: summarize(stocks).mean,
      precio: summarize(precios).mean,
      empResp: Number((empResps.reduce((a, b) => a + b, 0) / empResps.length).toFixed(2)),
      seg: summarize(segInd).mean,
      sal: summarize(salInd).mean,
      infra: summarize(infInd).mean,
      medAlc: summarize(medAlc).mean,
      medCred: summarize(medCred).mean,
      medDep: summarize(medDep).mean,
      foodProf: summarize(foodProf).mean,
    };
  };

  const cases: Array<{
    palanca: string;
    days: number;
    drought?: { intensidad: number; inicioDia: number; duracionDias: number };
    highLabel: string;
    lowLabel: string;
    high: (s: GameState) => void;
    low: (s: GameState) => void;
    metricKeys: Array<keyof ReturnType<typeof evalRun>>;
  }> = [
    {
      palanca: '1. impuesto',
      days: 60,
      highLabel: '48%',
      lowLabel: '28%',
      high: (s) => { s.gobierno.palancasObjetivo.impuesto = 48; },
      low: (s) => { s.gobierno.palancasObjetivo.impuesto = 28; },
      metricKeys: ['apoyo', 'reserva'],
    },
    {
      palanca: '2. salario_publico',
      days: 60,
      highLabel: '120%',
      lowLabel: '80%',
      high: (s) => { s.gobierno.palancasObjetivo.salarioPublico = 120; },
      low: (s) => { s.gobierno.palancasObjetivo.salarioPublico = 80; },
      metricKeys: ['apoyo', 'reserva'],
    },
    {
      palanca: '3. nivel_obras',
      days: 60,
      highLabel: 'nivel 5',
      lowLabel: 'nivel 0',
      high: (s) => { s.gobierno.palancasObjetivo.nivelObras = 5; },
      low: (s) => { s.gobierno.palancasObjetivo.nivelObras = 0; },
      metricKeys: ['infra', 'stock', 'reserva'],
    },
    {
      palanca: '4. ayuda_social',
      days: 60,
      highLabel: '4.0 $/día',
      lowLabel: '0.0 $/día',
      high: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 4.0; },
      low: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 0.0; },
      metricKeys: ['apoyo', 'reserva'],
    },
    {
      palanca: '5. garantia_alimentaria (liquidez baja)',
      days: 90,
      highLabel: '100%',
      lowLabel: '0%',
      high: (s) => {
        s.gobierno.palancasObjetivo.garantiaAlimentaria = 100;
        s.gobierno.palancasObjetivo.impuesto = 52;
        s.gobierno.palancasObjetivo.ayudaSocial = 0;
      },
      low: (s) => {
        s.gobierno.palancasObjetivo.garantiaAlimentaria = 0;
        s.gobierno.palancasObjetivo.impuesto = 52;
        s.gobierno.palancasObjetivo.ayudaSocial = 0;
      },
      metricKeys: ['hambre', 'apoyo', 'reserva'],
    },
    {
      palanca: '6. precio_maximo (con sequía)',
      days: 120,
      drought: { intensidad: 85, inicioDia: 20, duracionDias: 90 },
      highLabel: 'libre',
      lowLabel: 'estricto',
      high: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'libre' as PriceCapMode; },
      low: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'estricto' as PriceCapMode; },
      metricKeys: ['precio', 'stock', 'hambre', 'empResp', 'apoyo'],
    },
    {
      palanca: '7. comercio_exterior',
      days: 60,
      highLabel: '+100%',
      lowLabel: '-100%',
      high: (s) => { s.gobierno.palancasObjetivo.comercioExterior = 100; },
      low: (s) => { s.gobierno.palancasObjetivo.comercioExterior = -100; },
      metricKeys: ['stock', 'reserva', 'foodProf', 'precio'],
    },
    {
      palanca: '8. prensa',
      days: 60,
      highLabel: '45 $/per',
      lowLabel: '0 $/per',
      high: (s) => { s.gobierno.palancasObjetivo.prensa = 45; },
      low: (s) => { s.gobierno.palancasObjetivo.prensa = 0; },
      metricKeys: ['medAlc', 'medCred', 'medDep', 'reserva'],
    },
    {
      palanca: '9. obra.comisaria',
      days: 60,
      highLabel: '+2 comisarías',
      lowLabel: 'sin obra',
      high: (s) => { buildOnFreeParcels(s, ['comisaria', 'comisaria']); },
      low: () => {},
      metricKeys: ['seg', 'apoyo', 'reserva'],
    },
    {
      palanca: '10. obra.hospital',
      days: 60,
      highLabel: '+2 hospitales',
      lowLabel: 'sin obra',
      high: (s) => { buildOnFreeParcels(s, ['hospital', 'hospital']); },
      low: () => {},
      metricKeys: ['sal', 'apoyo', 'reserva'],
    },
  ];

  return cases.map((c) => {
    const hi = evalRun({ days: c.days, drought: c.drought, mutator: c.high });
    const lo = evalRun({ days: c.days, drought: c.drought, mutator: c.low });
    const diffs: Record<string, { hi: number; lo: number; delta: number }> = {};
    for (const k of c.metricKeys) {
      diffs[k] = {
        hi: hi[k],
        lo: lo[k],
        delta: Number((hi[k] - lo[k]).toFixed(2)),
      };
    }
    return {
      palanca: c.palanca,
      comparacion: `${c.highLabel} vs ${c.lowLabel}`,
      diffs,
    };
  });
}

function runNonDominanceSweeps(n: number) {
  const levels: ServiceLevel[] = [0, 1, 2, 3, 4, 5];

  const sweepNivelObrasElecciones = () =>
    levels.map((lvl) => {
      const b = runBatch(`elecciones_obras_${lvl}`, {
        scenarioId: 'elecciones',
        nivelMundo: 'M1',
        nivelGobernador: 'G2',
        disableRandomWeather: true,
        n,
        chaos: true,
        drought: { intensidad: 75, inicioDia: 140, duracionDias: 70 },
        mutator: (s) => {
          s.gobierno.palancasObjetivo.nivelObras = lvl;
          s.gobierno.palancasVigentes.nivelObras = lvl;
        },
      });
      return {
        nivel: lvl,
        winPct: b.winPct,
        lostObjPct: b.lostObjNoDefeatPct,
        defeatPct: b.defeatPct,
        impagos: b.totalImpagos,
        nomImpagos: b.totalNominaImpagos,
        apoyoEnd: b.apoyoEnd.mean,
        reservaEnd: b.reservaEnd.mean,
        hambreEnd: b.hambreEnd.mean,
      };
    });

  const sweepZombiesDefensa = () =>
    ([
      { tag: 'base', builds: [] as BuildingType[] },
      { tag: '1_comisaria', builds: ['comisaria'] as BuildingType[] },
      { tag: '2_comisarias', builds: ['comisaria', 'comisaria'] as BuildingType[] },
      { tag: '2_com_1_muralla', builds: ['comisaria', 'comisaria', 'muralla'] as BuildingType[] },
    ]).map((cfg) => {
      const b = runBatch(`zombies_${cfg.tag}`, {
        scenarioId: 'zombies',
        nivelMundo: 'M1',
        nivelGobernador: 'G2',
        disableRandomWeather: false,
        n,
        chaos: true,
        mutator: (s) => {
          buildOnFreeParcels(s, cfg.builds);
        },
      });
      return {
        despliegue: cfg.tag,
        winPct: b.winPct,
        lostObjPct: b.lostObjNoDefeatPct,
        defeatPct: b.defeatPct,
        impagos: b.totalImpagos,
        nomImpagos: b.totalNominaImpagos,
        popPctEnd: b.popPctEnd.mean,
        reservaEnd: b.reservaEnd.mean,
        hambreEnd: b.hambreEnd.mean,
      };
    });

  const sweepPriceModes = () =>
    (['libre', 'moderado', 'estricto'] as PriceCapMode[]).map((mode) => {
      const b = runBatch(`precio_${mode}`, {
        scenarioId: 'elecciones',
        nivelMundo: 'M1',
        nivelGobernador: 'G2',
        disableRandomWeather: true,
        n,
        chaos: true,
        drought: { intensidad: 80, inicioDia: 90, duracionDias: 90 },
        mutator: (s) => {
          s.gobierno.palancasObjetivo.precioMaximo = mode;
          s.gobierno.palancasVigentes.precioMaximo = mode;
        },
      });
      return {
        modo: mode,
        winPct: b.winPct,
        lostObjPct: b.lostObjNoDefeatPct,
        defeatPct: b.defeatPct,
        apoyoEnd: b.apoyoEnd.mean,
        hambreEnd: b.hambreEnd.mean,
        minStock: b.minStock.mean,
        empResponses: b.totalEnterpriseResponses,
      };
    });

  const sweepTradeSteps = () =>
    ([-100, -50, 0, 50, 100] as ForeignTradeStep[]).map((step) => {
      const b = runBatch(`trade_${step}`, {
        scenarioId: 'elecciones',
        nivelMundo: 'M1',
        nivelGobernador: 'G2',
        disableRandomWeather: true,
        n,
        chaos: false,
        maxDays: 90,
        mutator: (s) => {
          s.gobierno.palancasObjetivo.comercioExterior = step;
          s.gobierno.palancasVigentes.comercioExterior = step;
        },
      });
      return {
        escalon: step,
        apoyoEnd: b.apoyoEnd.mean,
        reservaEnd: b.reservaEnd.mean,
        minStock: b.minStock.mean,
        impagos: b.totalImpagos,
      };
    });

  return {
    eleccionesNivelObras: sweepNivelObrasElecciones(),
    zombiesDefensa: sweepZombiesDefensa(),
    precioMaximoConSequia: sweepPriceModes(),
    comercioExterior90d: sweepTradeSteps(),
  };
}

function checkDeterminism(): boolean {
  const runOnce = () => {
    const s = makeInitState(42, 'elecciones', { nivelMundo: 'M1', nivelGobernador: 'G2' });
    for (let d = 1; d < 90; d++) {
      stepHeadlessDay(s);
      runRandomDirectorDay(s);
    }
    const ds = deriveCommunityStats(s);
    return JSON.stringify({
      reserva: s.gobierno.reserva,
      stock: s.alimento.stock,
      apoyo: ds.apoyoPct,
      pop: ds.poblacionPct,
      eventos: s.eventos.length,
    });
  };
  return runOnce() === runOnce();
}

function verifyNewSystems() {
  const failures: string[] = [];
  const assert = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  // 1. M0 + G0 isolation check (1 zone, 0 weather, 0 chaos, 0 demands, 30d money conservation)
  const m0 = makeInitState(5, 'elecciones', { nivelMundo: 'M0', nivelGobernador: 'G0' });
  for (let d = 1; d < 30; d++) {
    const prevM = computeTotalWorldMoney(m0);
    stepHeadlessDay(m0);
    const curM = computeTotalWorldMoney(m0);
    assert(
      Math.abs(curM - (prevM + m0.auditEntradasDia - m0.auditSalidasDia)) <= 0.05,
      `M0+G0 money mismatch at day ${m0.reloj.dia}`
    );
  }
  assert(m0.clima.fenomenos.length === 0, 'M0 must not spawn climate phenomena');
  assert(m0.demandasActivas.length === 0, 'G0 must not trigger actor demands');
  assert(m0.npcs.every((n) => !n.accionIa), 'M0 must not trigger chaos actions');
  assert(!m0.gobierno.finanzas.impago, 'M0+G0 30d must finish with zero impagos');
  assert(
    m0.eventos.filter((e) => e.tipo === 'empresa_recorte' || e.tipo === 'empresa_despido').length === 0,
    'M0+G0 30d must finish with zero enterprise cuts/layoffs'
  );

  // 2. G1 vs G2 building gating + build/demolish lifecycle + hospital patient relocation
  const g1 = makeInitState(7, 'elecciones', { nivelMundo: 'M0', nivelGobernador: 'G1' });
  const free1 = g1.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, 'hospital'));
  assert(Boolean(free1), 'Expected free public L parcela in G1');
  if (free1) {
    const blockedSuceso = orderBuildInParcela(g1, free1.id, 'muralla');
    assert(!blockedSuceso.ok, 'Muralla (suceso) should be blocked in G1');
    const okHosp = orderBuildInParcela(g1, free1.id, 'hospital');
    assert(okHosp.ok, 'Hospital should be buildable in G1');
    for (let i = 0; i < 6; i++) stepHeadlessDay(g1);
    assert(free1.estado === 'ocupada' && free1.edificio?.activo === true, 'Hospital should finish construction');
    assert(g1.demandasActivas.length === 0 && g1.hitosCumplidos.length === 0, 'G1 should not activate G2 demands/hitos');
    const capsAfterBuild = getBuildingJobCaps(
      g1.parcelas,
      g1.npcs.filter((n) => n.vivo).length,
      g1.gobierno.palancasVigentes.nivelObras,
      g1.config.poblacionInicial,
      g1.gobierno.cuposFijos
    );
    assert(capsAfterBuild.medico >= 8, `Expected >= 8 doctor slots after 2nd hospital, got ${capsAfterBuild.medico}`);
    const sickNpc = g1.npcs.find((n) => n.vivo && !n.hospital.internado);
    const removedHospitalId = free1.edificio?.id;
    if (sickNpc && free1.edificio) {
      sickNpc.hospital.internado = true;
      sickNpc.hospital.edificioId = free1.edificio.id;
      sickNpc.hospital.zonaHospital = free1.zona;
    }
    const dem = orderDemolishParcela(g1, free1.id);
    assert(dem.ok && free1.estado === 'libre' && free1.edificio === null, 'Demolish should free parcela');
    assert(
      !sickNpc || sickNpc.hospital.edificioId !== removedHospitalId,
      'Patient reference should be relocated or discharged on demolish'
    );
  }

  // 3. Suceso works in G2: silo, riego, hospital_campana (25-day expiry) + drought aviso detection
  const g2 = makeInitState(11, 'elecciones', {
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
  });
  g2.clima.fenomenos.push({
    id: 'fen_aviso_test',
    tipo: 'sequia',
    nombre: 'Sequía anunciada',
    intensidad: 70,
    inicioDia: 10,
    duracionDias: 20,
    avisoDias: 8,
  });
  stepHeadlessDay(g2);
  stepHeadlessDay(g2);
  assert(getAnnouncedPhenomena(g2).length >= 1, 'Expected announced drought to appear during aviso window');

  const freePublicParcels = g2.parcelas.filter(
    (p) => p.estado === 'libre' && canBuildTypeInParcela(p, 'silo')
  );
  assert(freePublicParcels.length >= 3, `Expected at least 3 free public parcels, got ${freePublicParcels.length}`);
  if (freePublicParcels.length >= 3) {
    const pSilo = freePublicParcels[0];
    const pRiego = freePublicParcels[1];
    const pCamp = freePublicParcels[2];
    assert(orderBuildInParcela(g2, pSilo.id, 'silo').ok, 'Silo build order should succeed in G2');
    assert(orderBuildInParcela(g2, pRiego.id, 'riego').ok, 'Riego build order should succeed in G2');
    assert(orderBuildInParcela(g2, pCamp.id, 'hospital_campana').ok, 'Hospital campana build should succeed in G2');
    for (let i = 0; i < 5; i++) stepHeadlessDay(g2);
    assert(g2.alimento.siloDias > 25, `Expected siloDias > 25 after Silo completes, got ${g2.alimento.siloDias}`);
    assert(pCamp.estado === 'ocupada' && pCamp.edificio?.tipo === 'hospital_campana', 'Hospital de campana should be active');
    for (let i = 0; i < 27; i++) stepHeadlessDay(g2);
    const campDismantled = g2.eventos.some(
      (e) => e.tipo === 'demolicion' && e.parcelaId === pCamp.id && e.edificio === 'hospital_campana'
    );
    assert(
      campDismantled && pCamp.edificio?.tipo !== 'hospital_campana',
      'Hospital de campana should auto-dismantle after 25 days'
    );
  }

  // 4. Hito unlocking a bloqueada parcela
  const hState = makeInitState(15, 'elecciones', {
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
  });
  const lockedBefore = hState.parcelas.filter((p) => p.estado === 'bloqueada').length;
  for (let i = 0; i < 28; i++) stepHeadlessDay(hState);
  const lockedAfter = hState.parcelas.filter((p) => p.estado === 'bloqueada').length;
  assert(
    hState.hitosCumplidos.length >= 1 && lockedAfter < lockedBefore,
    `Expected hito to unlock at least 1 parcela (cumplidos=${hState.hitosCumplidos.length}, lockedBefore=${lockedBefore}, lockedAfter=${lockedAfter})`
  );

  // 5. Actor demand creation + accept (lock) + reject (measure)
  const dState = makeInitState(21, 'elecciones', {
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
  });
  dState.gobierno.palancasObjetivo.impuesto = 52;
  dState.gobierno.palancasVigentes.impuesto = 52;
  for (let i = 0; i < 3; i++) stepHeadlessDay(dState);
  const demandGenerated = dState.demandasActivas[0];
  assert(Boolean(demandGenerated), 'Expected actor demand when tax > 42%');
  if (demandGenerated) {
    const resAcc = respondToDemand(dState, demandGenerated.id, true);
    assert(resAcc.ok, 'Accepting active demand should succeed');
    assert(
      dState.bloqueosPalanca.some((b) => b.palanca === demandGenerated.pedido.palanca),
      'Accepting demand should lock the negotiated lever'
    );
  }

  const dReject = makeInitState(22, 'elecciones', {
    nivelMundo: 'M1',
    nivelGobernador: 'G2',
    disableRandomWeather: true,
  });
  dReject.gobierno.palancasObjetivo.precioMaximo = 'estricto';
  dReject.gobierno.palancasVigentes.precioMaximo = 'estricto';
  for (const f of dReject.firmas) {
    if (f.activa && f.rubro === 'agro') f.factor = 0.85;
  }
  dReject.gobierno.palancasObjetivo.impuesto = 50;
  dReject.gobierno.palancasVigentes.impuesto = 50;
  for (let i = 0; i < 3; i++) stepHeadlessDay(dReject);
  if (dReject.demandasActivas.length > 0) {
    const first = dReject.demandasActivas[0];
    const resRej = respondToDemand(dReject, first.id, false);
    assert(resRej.ok && dReject.medidasVigentes.length >= 1, 'Rejecting demand should trigger active actor measure');
  } else {
    failures.push('Expected demand before testing rejection measure');
  }

  // 6. Minor food payment priority strictly before adult garantiaAlimentaria
  const minorPriorityState = makeInitState(31, 'elecciones', {
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
  });
  minorPriorityState.reloj.diasEnPeriodo = 0; // avoid payday settlement interfering on day 2
  const firstAdult = minorPriorityState.npcs.find((n) => n.vivo && n.edad >= 18 && n.edad < 65);
  const lastMinor = [...minorPriorityState.npcs].reverse().find((n) => n.vivo && n.edad < 18 && n.hogarId !== firstAdult?.hogarId);
  if (firstAdult && lastMinor) {
    for (const h of minorPriorityState.hogares) {
      if (h.id !== lastMinor.hogarId) h.despensa = 10;
    }
    const adultHogar = minorPriorityState.hogares.find((h) => h.id === firstAdult.hogarId);
    const minorHogar = minorPriorityState.hogares.find((h) => h.id === lastMinor.hogarId);
    if (adultHogar) {
      adultHogar.dinero = 0;
      adultHogar.despensa = 1.0;
    }
    if (minorHogar) {
      minorHogar.despensa = 1.0;
    }
    minorPriorityState.gobierno.palancasVigentes.garantiaAlimentaria = 100;
    minorPriorityState.gobierno.reserva = minorPriorityState.alimento.precio * 2.5;
    stepHeadlessDay(minorPriorityState);
    assert(
      minorPriorityState.gobierno.acumuladoPeriodo.comidaMenores > 0,
      'Minor food should be funded before adult garantiaAlimentaria even when adult appears first'
    );
  }

  // 7. M4 fiscal module: emission -> inflation rise -> nominal devaluation & exact money audit
  const m2State = makeInitState(41, 'elecciones', {
    nivelMundo: 'M4',
    nivelGobernador: 'G3',
    disableRandomWeather: true,
  });
  m2State.gobierno.reserva = 50;
  m2State.gobierno.palancasObjetivo.impuesto = 10;
  m2State.gobierno.palancasVigentes.impuesto = 10;
  m2State.gobierno.palancasObjetivo.salarioPublico = 180;
  m2State.gobierno.palancasVigentes.salarioPublico = 180;
  m2State.gobierno.palancasObjetivo.ayudaSocial = 6;
  m2State.gobierno.palancasVigentes.ayudaSocial = 6;
  m2State.gobierno.palancasObjetivo.topeEmision = 30;
  m2State.gobierno.palancasVigentes.topeEmision = 30;
  let maxInflObserved = m2State.gobierno.inflacion;
  for (let d = 1; d < 22; d++) {
    const prevM = computeTotalWorldMoney(m2State);
    stepHeadlessDay(m2State);
    const curM = computeTotalWorldMoney(m2State);
    assert(
      Math.abs(curM - (prevM + m2State.auditEntradasDia - m2State.auditSalidasDia)) <= 0.25,
      `M4+G3 money mismatch at day ${m2State.reloj.dia}`
    );
    if (m2State.gobierno.inflacion > maxInflObserved) {
      maxInflObserved = m2State.gobierno.inflacion;
    }
  }
  assert(maxInflObserved > 0, 'M4 fiscal emission under deficit should raise inflation');

  return { passed: failures.length === 0, failures };
}

const compactView = (b: ReturnType<typeof runBatch>) => ({
  label: b.label,
  capa: `${b.nivelMundo}+${b.nivelGobernador}`,
  n: b.n,
  win: b.winPct,
  lostObj: b.lostObjNoDefeatPct,
  defeat: b.defeatPct,
  impagos: b.totalImpagos,
  nomImpagos: b.totalNominaImpagos,
  empResps: b.totalEnterpriseResponses,
  minRole: b.minAnyRoleCount,
  invViol: b.invariantViolations,
  initProf: [b.initFoodProfit.mean, b.initComProfit.mean],
  prodCons1: [b.prod1.mean, b.cons1.mean],
  ingRatio7: b.ingRatio7.mean,
  apoyoEnd: b.apoyoEnd.mean,
  hambreEnd: b.hambreEnd.mean,
  popEnd: b.popPctEnd.mean,
  resEnd: b.reservaEnd.mean,
  minStock: b.minStock.mean,
  milestones: b.milestones,
  timeline: b.timeline,
});

function main() {
  const nMain = CLI.nOverride ?? (CLI.quick ? 2 : 6);
  const nSens = CLI.nOverride ?? (CLI.quick ? 2 : 5);
  const nSweep = CLI.nOverride ?? (CLI.quick ? 2 : 4);
  const runSuite = (target: SuiteName) => CLI.suite === 'all' || CLI.suite === target;

  console.log(
    JSON.stringify({
      mode: { suite: CLI.suite, quick: CLI.quick, nMain, nSens, nSweep },
    })
  );

  if (runSuite('verify')) {
    console.log('=== 0. DETERMINISMO Y SISTEMAS ===');
    const det = checkDeterminism();
    const sys = verifyNewSystems();
    console.log(JSON.stringify({ deterministic: det, systems: sys }));
    if (!det || !sys.passed) {
      process.exitCode = 1;
    }
  }

  if (runSuite('m0')) {
    console.log('=== 1. M0 + G0 y M0 + G1 (HOJA_DE_RUTA §2 pasos 1 y 2) ===');
    const m0Suites = runM0AndG1Suites(nMain);
    for (const batch of Object.values(m0Suites)) {
      console.log(JSON.stringify(compactView(batch)));
      if (batch.invariantViolations > 0) process.exitCode = 1;
    }
  }

  if (runSuite('collapse')) {
    console.log('=== 2. COLAPSO PASIVO, EXIGENCIA TEMPORAL Y ESTRATEGIAS (M1 + G2) ===');
    const collapseSuites = runCollapseAndDifficultySuite(nMain);
    for (const batch of Object.values(collapseSuites)) {
      console.log(JSON.stringify(compactView(batch)));
      if (batch.invariantViolations > 0) process.exitCode = 1;
    }
  }

  if (runSuite('sensitivity')) {
    console.log('=== 3. SENSIBILIDAD DE PALANCAS Y EDIFICIOS ===');
    console.log(JSON.stringify(runAllLeversAndBuildingsSensitivity(nSens)));
  }

  if (runSuite('nondom')) {
    console.log('=== 4. BARRIDO NO-DOMINANCIA ===');
    console.log(JSON.stringify(runNonDominanceSweeps(nSweep)));
  }
}

main();
