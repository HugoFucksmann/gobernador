import fs from 'node:fs';
import path from 'node:path';
import {
  DIRECTOR_CONSTANTS,
  ECON_CONSTANTS,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../src/data/catalogs';
import { nextRand, nextSeqId } from '../src/engine/rng';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canTriggerSpontaneousChaos,
  computeTotalWorldMoney,
  deriveCommunityStats,
  pickActionText,
  pickChaosCandidateNpc,
  planDailyPressPublications,
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
  heur?: boolean;
  mutator?: (s: GameState) => void;
  dailyMutator?: (s: GameState, day: number) => void;
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

  for (let seed = 1; seed <= opts.n; seed++) {
    const s = makeInitState(seed, scenarioId);
    if (opts.mutator) opts.mutator(s);
    initFoodProfit.push(s.empresas.alimento.ultimaGanancia);
    initComProfit.push(s.empresas.comercio.ultimaGanancia);
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

      if (s.resultado.estado === 'derrota') break;
    }

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

  return {
    label,
    scenarioId,
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
  };
}

function runAll10LeversSensitivity(n: number) {
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
      const s = makeInitState(seed, 'elecciones');
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
      foodProf.push(s.empresas.alimento.ultimaGanancia);
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
      palanca: '3. servicios.seguridad',
      days: 60,
      highLabel: 'nivel 5',
      lowLabel: 'nivel 0',
      high: (s) => { s.gobierno.palancasObjetivo.servicios.seguridad = 5; },
      low: (s) => { s.gobierno.palancasObjetivo.servicios.seguridad = 0; },
      metricKeys: ['seg', 'apoyo', 'reserva'],
    },
    {
      palanca: '4. servicios.salud',
      days: 60,
      highLabel: 'nivel 5',
      lowLabel: 'nivel 0',
      high: (s) => { s.gobierno.palancasObjetivo.servicios.salud = 5; },
      low: (s) => { s.gobierno.palancasObjetivo.servicios.salud = 0; },
      metricKeys: ['sal', 'apoyo', 'reserva'],
    },
    {
      palanca: '5. servicios.obras',
      days: 60,
      highLabel: 'nivel 5',
      lowLabel: 'nivel 0',
      high: (s) => { s.gobierno.palancasObjetivo.servicios.obras = 5; },
      low: (s) => { s.gobierno.palancasObjetivo.servicios.obras = 0; },
      metricKeys: ['infra', 'stock', 'reserva'],
    },
    {
      palanca: '6. ayuda_social',
      days: 60,
      highLabel: '4.0 $/día',
      lowLabel: '0.0 $/día',
      high: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 4.0; },
      low: (s) => { s.gobierno.palancasObjetivo.ayudaSocial = 0.0; },
      metricKeys: ['apoyo', 'reserva'],
    },
    {
      palanca: '7. garantia_alimentaria (liquidez baja, stock disponible)',
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
      palanca: '8. precio_maximo (con sequía)',
      days: 120,
      drought: { intensidad: 85, inicioDia: 20, duracionDias: 90 },
      highLabel: 'libre',
      lowLabel: 'estricto',
      high: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'libre' as PriceCapMode; },
      low: (s) => { s.gobierno.palancasObjetivo.precioMaximo = 'estricto' as PriceCapMode; },
      metricKeys: ['precio', 'stock', 'hambre', 'empResp', 'apoyo'],
    },
    {
      palanca: '9. comercio_exterior',
      days: 60,
      highLabel: '+100%',
      lowLabel: '-100%',
      high: (s) => { s.gobierno.palancasObjetivo.comercioExterior = 100; },
      low: (s) => { s.gobierno.palancasObjetivo.comercioExterior = -100; },
      metricKeys: ['stock', 'reserva', 'foodProf', 'precio'],
    },
    {
      palanca: '10. prensa',
      days: 60,
      highLabel: '45 $/per',
      lowLabel: '0 $/per',
      high: (s) => { s.gobierno.palancasObjetivo.prensa = 45; },
      low: (s) => { s.gobierno.palancasObjetivo.prensa = 0; },
      metricKeys: ['medAlc', 'medCred', 'medDep', 'reserva'],
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

  const sweepServiceElecciones = (lever: ServiceLeverId) =>
    levels.map((lvl) => {
      const b = runBatch(`elecciones_${lever}_${lvl}`, {
        scenarioId: 'elecciones',
        n,
        chaos: true,
        drought: { intensidad: 75, inicioDia: 140, duracionDias: 70 },
        heur: false,
        mutator: (s) => {
          s.gobierno.palancasObjetivo.servicios[lever] = lvl;
          s.gobierno.palancasVigentes.servicios[lever] = lvl;
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

  const sweepZombiesSeguridad = () =>
    levels.map((lvl) => {
      const b = runBatch(`zombies_seg_${lvl}`, {
        scenarioId: 'zombies',
        n,
        chaos: true,
        mutator: (s) => {
          s.gobierno.palancasObjetivo.servicios.seguridad = lvl;
          s.gobierno.palancasVigentes.servicios.seguridad = lvl;
        },
      });
      return {
        nivelSeguridad: lvl,
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
    eleccionesSeguridad: sweepServiceElecciones('seguridad'),
    eleccionesSalud: sweepServiceElecciones('salud'),
    eleccionesObras: sweepServiceElecciones('obras'),
    zombiesSeguridad: sweepZombiesSeguridad(),
    precioMaximoConSequia: sweepPriceModes(),
    comercioExterior90d: sweepTradeSteps(),
  };
}

function checkDeterminism(): boolean {
  const runOnce = () => {
    const s = makeInitState(42, 'elecciones');
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

const compactView = (b: ReturnType<typeof runBatch>) => ({
  label: b.label,
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
});

console.log('=== 0. DETERMINISMO ===');
console.log(JSON.stringify({ deterministic: checkDeterminism() }));

console.log('=== 1. ELECCIONES: BASE SIN PERTURBACION (n=10) ===');
console.log(JSON.stringify(compactView(runBatch('B_no_perturb', { n: 10, chaos: false, heur: false }))));

console.log('=== 2. ELECCIONES: SEQUIA + CAOS PASIVO vs HEURISTICO vs BALANCEADO (n=10) ===');
console.log(JSON.stringify(compactView(runBatch('C1_passive_drought', { n: 10, chaos: true, drought: PRESET.droughtPrueba, heur: false }))));
console.log(JSON.stringify(compactView(runBatch('C2_heuristic_drought', { n: 10, chaos: true, drought: PRESET.droughtPrueba, heur: true }))));
console.log(
  JSON.stringify(
    compactView(
      runBatch('C3_active_balanced', {
        n: 10,
        chaos: true,
        drought: PRESET.droughtPrueba,
        dailyMutator: (s) => {
          if (s.alimento.diasStock < 7) s.gobierno.palancasObjetivo.comercioExterior = 50;
          else s.gobierno.palancasObjetivo.comercioExterior = 0;
          if (s.alimento.precioMercado > ECON_CONSTANTS.precioBaseAlimento * 1.45) {
            s.gobierno.palancasObjetivo.precioMaximo = 'moderado';
          } else {
            s.gobierno.palancasObjetivo.precioMaximo = 'libre';
          }
          const ds = deriveCommunityStats(s);
          if (ds.apoyoPct < 52 && s.gobierno.reserva > 2500) {
            s.gobierno.palancasObjetivo.impuesto = 34;
            s.gobierno.palancasObjetivo.ayudaSocial = 1.5;
          } else if (s.gobierno.reserva < 1500) {
            s.gobierno.palancasObjetivo.impuesto = 42;
            s.gobierno.palancasObjetivo.ayudaSocial = 0;
          }
        },
      })
    )
  )
);

console.log('=== 3. SENSIBILIDAD DE LAS 10 PALANCAS (n=8) ===');
console.log(JSON.stringify(runAll10LeversSensitivity(8)));

console.log('=== 4. ZOMBIES: PASIVO vs SEG 3 vs SEG 4 (n=10) ===');
console.log(JSON.stringify(compactView(runBatch('Z_passive', { scenarioId: 'zombies', n: 10, chaos: true }))));
console.log(
  JSON.stringify(
    compactView(
      runBatch('Z_seg3', {
        scenarioId: 'zombies',
        n: 10,
        chaos: true,
        mutator: (s) => {
          s.gobierno.palancasObjetivo.servicios.seguridad = 3;
        },
      })
    )
  )
);
console.log(
  JSON.stringify(
    compactView(
      runBatch('Z_seg4_tax43', {
        scenarioId: 'zombies',
        n: 10,
        chaos: true,
        mutator: (s) => {
          s.gobierno.palancasObjetivo.servicios.seguridad = 4;
          s.gobierno.palancasObjetivo.impuesto = 43;
        },
      })
    )
  )
);

console.log('=== 5. BARRIDO NO-DOMINANCIA (n=5 por punto) ===');
console.log(JSON.stringify(runNonDominanceSweeps(5)));
