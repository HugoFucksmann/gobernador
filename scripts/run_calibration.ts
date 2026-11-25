import fs from 'node:fs';
import path from 'node:path';
import { ECON_CONSTANTS, FISCAL_PERIOD_DAYS, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
import { nextRand, nextSeqId } from '../src/engine/rng';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canTriggerSpontaneousChaos,
  deriveCommunityStats,
  pickActionText,
  pickChaosCandidateNpc,
  pickPressTopicAndTone,
  resolveConditionWindowWithFallback,
  selectCandidateActions,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import {
  FixedPublicRoleId,
  ForeignTradeStep,
  GameState,
  GovernorLevers,
  PriceCapMode,
  PrivateRoleId,
  RoleId,
  ServiceLeverId,
  ServiceLevel,
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
    serviciosIniciales: Record<ServiceLeverId, ServiceLevel>;
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
  SCENARIO_PRESETS.elecciones.serviciosIniciales = { ...PRESET.SCENARIO_PRESET.serviciosIniciales };
  SCENARIO_PRESETS.elecciones.initialLevers = structuredClone(PRESET.initialLevers);
  SCENARIO_PRESETS.elecciones.caosDefault = { ...PRESET.SCENARIO_PRESET.caosDefault };
}

function runRandomDirectorDay(state: GameState): void {
  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente') {
      const chosen = win.candidatas[Math.floor(nextRand(state) * win.candidatas.length)];
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, 'motor');
    }
  }
  if (state.reloj.dia % 4 === 0 && state.medios.length > 0) {
    const medio = state.medios[Math.floor(nextRand(state) * state.medios.length)];
    const periodistaId = medio.columnistas[0] || state.npcs.find((n) => n.vivo)?.id;
    if (periodistaId) {
      const periodista = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];
      const topic = pickPressTopicAndTone(state);
      applyPressArticleEffects(state, {
        id: nextSeqId(state, `n_${state.reloj.dia}`),
        dia: state.reloj.dia,
        medioId: medio.id,
        medioNombre: medio.nombre,
        autorId: periodista.id,
        autorNombre: periodista.nombre,
        tema: topic.tema,
        tono: topic.tono,
        alcance: medio.alcancePct,
        credibilidad: medio.credibilidad,
        titulo: `Nota ${topic.tema}`,
        texto: topic.detalle,
        origen: topic.origen,
        textoOrigen: 'plantilla',
      });
    }
  }
  if (state.reloj.dia % 2 === 0) {
    const gate = canTriggerSpontaneousChaos(state);
    if (gate.allowed) {
      const npc = pickChaosCandidateNpc(state);
      if (npc) {
        const candidatas = selectCandidateActions(npc, state);
        if (candidatas.length > 0) {
          const chosen = candidatas[Math.floor(nextRand(state) * candidatas.length)];
          applyActionToNpc(state, npc, chosen, pickActionText(chosen, npc.nombre, state), 'motor');
          state.caosTracker.accionesEnVentana += 1;
        }
      }
    }
  }
}

function applyHeuristicGovernor(state: GameState): void {
  const hp = PRESET.heuristicPolicy;
  const baseTax = PRESET.initialLevers.impuesto;
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
  } else {
    lev.comercioExterior = 0;
  }

  lev.garantiaAlimentaria = d.hambreCriticaPct > 5 ? 100 : 85;
  lev.precioMaximo =
    state.alimento.precioMercado > ECON_CONSTANTS.precioBaseAlimento * 1.45 ? 'moderado' : 'libre';

  if (state.gobierno.reserva < dailyPayroll * hp.umbralReservaDiasNomina || lev.comercioExterior >= hp.intercambioPreventivo) {
    lev.impuesto = Math.min(hp.impuestoEmergenciaMax, baseTax + 8);
  } else if (lev.comercioExterior > 0) {
    lev.impuesto = Math.min(hp.impuestoEmergenciaMax - 2, baseTax + 4);
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

function makeInitState(seed: number, scenarioId: 'elecciones' | 'zombies' = 'elecciones'): GameState {
  if (scenarioId === 'elecciones') {
    applyPresetToRuntime();
  }
  const preset = SCENARIO_PRESETS[scenarioId];
  const cfg: WorldConfig = {
    escenarioId: scenarioId,
    economiaModulo: 'base',
    cantidadMedios: preset.mediosDefault,
    poblacionInicial: preset.poblacionDefault,
    caos: { ...preset.caosDefault },
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  if (scenarioId === 'elecciones') {
    s.clima.proximoEventoDia = 99999;
    s.gobierno.palancasObjetivo = structuredClone(PRESET.initialLevers);
    s.gobierno.palancasVigentes = structuredClone(PRESET.initialLevers);
  }
  return s;
}

function summarize(arr: number[]): { mean: number; sd: number; min: number; max: number } {
  const mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, arr.length));
  return {
    mean: Number(mean.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: Number(Math.min(...arr).toFixed(2)),
    max: Number(Math.max(...arr).toFixed(2)),
  };
}

interface BatchOpts {
  scenarioId?: 'elecciones' | 'zombies';
  n: number;
  chaos: boolean;
  chaosStopDay?: number;
  drought?: { intensidad: number; inicioDia: number; duracionDias: number };
  heur: boolean;
  maxDays?: number;
}

const ALL_ROLES: RoleId[] = [
  'estudiante', 'agricultor', 'obrero', 'policia', 'estatal', 'comerciante',
  'empresario', 'tecnico', 'docente', 'periodista', 'medico', 'ingeniero',
  'desempleado', 'jubilado',
];

function runBatch(label: string, opts: BatchOpts) {
  const scenarioId = opts.scenarioId ?? 'elecciones';
  const maxDays = opts.maxDays ?? (scenarioId === 'zombies' ? 180 : 365);
  let wins = 0;
  let totalImpagos = 0;
  let seedsWithImpago = 0;
  let totalEnterpriseResponses = 0;
  let minAnyRoleCount = 999;

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

  for (let seed = 1; seed <= opts.n; seed++) {
    const s = makeInitState(seed, scenarioId);
    const d0 = deriveCommunityStats(s);
    sat0.push(d0.satisfaccionMedia);
    let hadImp = false;
    let minS = s.alimento.stock;

    for (let d = 1; d < maxDays; d++) {
      if (opts.drought && s.reloj.dia === opts.drought.inicioDia) {
        s.clima.fenomenos.push({
          id: 'seq_prueba',
          tipo: 'sequia',
          nombre: 'Sequía de prueba',
          intensidad: opts.drought.intensidad,
          inicioDia: opts.drought.inicioDia,
          duracionDias: opts.drought.duracionDias,
        });
      }
      if (opts.heur && s.reloj.dia % PRESET.heuristicPolicy.evaluacionCadaDias === 0) {
        applyHeuristicGovernor(s);
      }
      stepHeadlessDay(s);
      if (d === 1) {
        prod1.push(s.alimento.produccionDiaria);
        cons1.push(s.alimento.consumoDiario);
      }
      if (d === FISCAL_PERIOD_DAYS) {
        const fin = s.gobierno.finanzas;
        const gastos =
          fin.nomina +
          fin.pensiones +
          fin.garantiaAlimentaria +
          fin.ayudaSocial +
          fin.operacion +
          fin.prensa;
        ing7.push(fin.ingresos);
        gastos7.push(gastos);
        saldo7.push(fin.saldo);
        ingRatio7.push(fin.ingresos / Math.max(1, gastos));
      }
      if (opts.chaos && (!opts.chaosStopDay || s.reloj.dia <= opts.chaosStopDay)) {
        runRandomDirectorDay(s);
      }
      if (s.gobierno.finanzas.impago && s.reloj.diasEnPeriodoFiscal === 0) {
        totalImpagos++;
        hadImp = true;
      }
      if (s.alimento.stock < minS) minS = s.alimento.stock;

      const dsCheck = deriveCommunityStats(s);
      for (const r of ALL_ROLES) {
        if (dsCheck.roles[r] < minAnyRoleCount) minAnyRoleCount = dsCheck.roles[r];
      }

      if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) break;
    }

    totalEnterpriseResponses += s.eventos.filter((e) => e.tipo === 'empresa_respuesta').length;
    const de = deriveCommunityStats(s);
    if (s.resultado.victoriaCumplida || s.resultado.estado === 'victoria') wins++;
    if (hadImp) seedsWithImpago++;
    satEnd.push(de.satisfaccionMedia);
    deltaSat.push(de.satisfaccionMedia - d0.satisfaccionMedia);
    apoyoEnd.push(de.apoyoPct);
    hambreEnd.push(de.hambreCriticaPct);
    popPctEnd.push(de.poblacionPct);
    reservaEnd.push(s.gobierno.reserva);
    minStock.push(minS);
  }

  return {
    label,
    scenarioId,
    n: opts.n,
    winPct: Number(((wins / opts.n) * 100).toFixed(2)),
    seedsWithImpago,
    totalImpagos,
    totalEnterpriseResponses,
    minAnyRoleCount,
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
  };
}

function runSensitivity(n: number) {
  const eval60 = (mutator?: (s: GameState) => void) => {
    const apoyos: number[] = [];
    const reservas: number[] = [];
    const empResps: number[] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = makeInitState(seed, 'elecciones');
      if (mutator) mutator(s);
      for (let d = 1; d < 60; d++) {
        stepHeadlessDay(s);
      }
      const ds = deriveCommunityStats(s);
      apoyos.push(ds.apoyoPct);
      reservas.push(s.gobierno.reserva);
      empResps.push(s.eventos.filter((e) => e.tipo === 'empresa_respuesta').length);
    }
    return {
      apoyo: summarize(apoyos),
      reserva: summarize(reservas),
      empRespMean: Number((empResps.reduce((a, b) => a + b, 0) / empResps.length).toFixed(2)),
    };
  };

  const base = eval60();
  const cases: Array<{ palanca: string; modo: string; up: (s: GameState) => void; dn: (s: GameState) => void }> = [
    {
      palanca: 'impuesto (48 vs 28)',
      modo: '±10 pp',
      up: (s) => { s.gobierno.palancasObjetivo.impuesto = 48; },
      dn: (s) => { s.gobierno.palancasObjetivo.impuesto = 28; },
    },
    {
      palanca: 'salarioPublico (120 vs 80)',
      modo: '±20 pp',
      up: (s) => { s.gobierno.palancasObjetivo.salarioPublico = 120; },
      dn: (s) => { s.gobierno.palancasObjetivo.salarioPublico = 80; },
    },
    {
      palanca: 'ayudaSocial (3.0 vs 0.0)',
      modo: 'monto diario',
      up: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 3.0; },
      dn: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 0.0; },
    },
    {
      palanca: 'servicios.* (4 vs 1)',
      modo: 'nivel alto vs bajo',
      up: (s) => { s.gobierno.palancasObjetivo.servicios = { seguridad: 4, salud: 4, obras: 4 }; },
      dn: (s) => { s.gobierno.palancasObjetivo.servicios = { seguridad: 1, salud: 1, obras: 1 }; },
    },
    {
      palanca: 'precioMaximo (libre vs estricto)',
      modo: 'libre vs estricto',
      up: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'libre' as PriceCapMode; },
      dn: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'estricto' as PriceCapMode; },
    },
    {
      palanca: 'garantiaAlimentaria (100 vs 50)',
      modo: 'garantía',
      up: (s) => { s.gobierno.palancasObjetivo.garantiaAlimentaria = 100; },
      dn: (s) => { s.gobierno.palancasObjetivo.garantiaAlimentaria = 50; },
    },
    {
      palanca: 'comercioExterior (+50 vs -50)',
      modo: 'importar vs exportar',
      up: (s) => { s.gobierno.palancasObjetivo.comercioExterior = 50; },
      dn: (s) => { s.gobierno.palancasObjetivo.comercioExterior = -50; },
    },
  ];

  const rows = cases.map((c) => {
    const up = eval60(c.up);
    const dn = eval60(c.dn);
    return {
      palanca: c.palanca,
      modo: c.modo,
      dApoyoUp: Number((up.apoyo.mean - base.apoyo.mean).toFixed(2)),
      dApoyoDn: Number((dn.apoyo.mean - base.apoyo.mean).toFixed(2)),
      dResUp: Number((up.reserva.mean - base.reserva.mean).toFixed(1)),
      dResDn: Number((dn.reserva.mean - base.reserva.mean).toFixed(1)),
      empRespUp: up.empRespMean,
      empRespDn: dn.empRespMean,
    };
  });

  return { n, base, rows };
}

console.log('=== 1. ELECCIONES: CRITERIO A & B (sin perturbacion, n=30) ===');
console.log(JSON.stringify(runBatch('B_no_perturb', { n: 30, chaos: false, heur: false }), null, 2));

console.log('=== 2. ELECCIONES: CRITERIO C1 PASIVO CON SEQUIA + CAOS (n=30) ===');
console.log(JSON.stringify(runBatch('C1_passive_drought', { n: 30, chaos: true, drought: PRESET.droughtPrueba, heur: false }), null, 2));

console.log('=== 3. ELECCIONES: CRITERIO C2 HEURISTICO CON SEQUIA + CAOS (n=30) ===');
console.log(JSON.stringify(runBatch('C2_heuristic_drought', { n: 30, chaos: true, drought: PRESET.droughtPrueba, heur: true }), null, 2));

console.log('=== 4. ELECCIONES: CRITERIO D SENSIBILIDAD A 60 DIAS (n=15) ===');
console.log(JSON.stringify(runSensitivity(15), null, 2));

console.log('=== 5. ZOMBIES: PASIVO CON PLAGA + HORDAS + CAOS (n=20) ===');
console.log(JSON.stringify(runBatch('Z_passive_chaos', { scenarioId: 'zombies', n: 20, chaos: true, heur: false }), null, 2));

console.log('=== 6. ZOMBIES: SEGURIDAD NIVEL 4 DESDE DIA 1 (n=20) ===');
function runZombiesDefended(n: number) {
  let wins = 0;
  let totalImpagos = 0;
  const popEnd: number[] = [];
  const resEnd: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const s = makeInitState(seed, 'zombies');
    s.gobierno.palancasObjetivo.servicios.seguridad = 4;
    s.gobierno.palancasObjetivo.impuesto = 43;
    for (let d = 1; d < 180; d++) {
      stepHeadlessDay(s);
      runRandomDirectorDay(s);
      if (s.gobierno.finanzas.impago && s.reloj.diasEnPeriodoFiscal === 0) totalImpagos++;
      if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) break;
    }
    const de = deriveCommunityStats(s);
    if (s.resultado.victoriaCumplida) wins++;
    popEnd.push(de.poblacionPct);
    resEnd.push(s.gobierno.reserva);
  }
  return {
    n,
    winPct: Number(((wins / n) * 100).toFixed(2)),
    totalImpagos,
    popEnd: summarize(popEnd),
    resEnd: summarize(resEnd),
  };
}
console.log(JSON.stringify(runZombiesDefended(20), null, 2));
