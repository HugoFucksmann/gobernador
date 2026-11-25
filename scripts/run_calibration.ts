import fs from 'node:fs';
import path from 'node:path';
import { ECON_CONSTANTS, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
import { setBudgetShareInLevers } from '../src/engine/policies';
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
import { GameState, PrivateRoleId, RoleGroupId, RoleId, TaxableGroupId, WorldConfig } from '../src/types/game';

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
    cuposIniciales: Record<'policia' | 'estatal' | 'docente' | 'medico' | 'ingeniero', number>;
    caosDefault: typeof SCENARIO_PRESETS.elecciones.caosDefault;
  };
  initialLevers: {
    recaudacion: {
      impuestoGrupo: Record<TaxableGroupId, number>;
    };
    gasto: {
      salarioPublico: number;
      presupuesto: { salud: number; seguridad: number; infraestructura: number; educacion: number };
      prensa: number;
      subsidios: Record<RoleGroupId, number>;
    };
    alimento: { precioMaximo: number; garantiaAlimentaria: number; intercambio: number };
    finanzas: { topeEmision: number };
  };
  droughtPrueba: {
    intensidad: number;
    inicioDia: number;
    duracionDias: number;
  };
  heuristicPolicy: {
    evaluacionCadaDias: number;
    stockCriticoDias: number;
    intercambioCritico: number;
    stockAlertaDeficitDias: number;
    intercambioPreventivo: number;
    umbralReservaDiasNomina: number;
    impuestoEmergenciaMax: number;
    impuestoAlivioMin: number;
    umbralApoyoAlivio: number;
    umbralDescontentosPct: number;
    incrementoSubsidioGrupo: number;
    topeSubsidioGrupo: number;
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
  SCENARIO_PRESETS.elecciones.cuposIniciales = { ...PRESET.SCENARIO_PRESET.cuposIniciales };
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
  const baseTaxes = PRESET.initialLevers.recaudacion.impuestoGrupo;
  const lev = state.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(state);
  const dailyPayroll = 21 * ECON_CONSTANTS.salarioBasePublico * (lev.gasto.salarioPublico / 100);

  if (state.alimento.diasStock < hp.stockCriticoDias) {
    lev.alimento.intercambio = hp.intercambioCritico;
  } else if (state.alimento.diasStock < hp.stockAlertaDeficitDias && state.alimento.produccionDiaria < state.alimento.consumoDiario) {
    lev.alimento.intercambio = hp.intercambioPreventivo;
  } else {
    lev.alimento.intercambio = 0;
  }

  lev.alimento.garantiaAlimentaria = d.hambreCriticaPct > 5 ? 100 : 85;
  lev.alimento.precioMaximo =
    state.alimento.precioMercado > ECON_CONSTANTS.precioBaseAlimento * 1.4 ? 140 : 250;

  const shiftTax = (delta: number, floor = 0, ceil = 60) => {
    (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
      lev.recaudacion.impuestoGrupo[g] = Math.max(floor, Math.min(ceil, baseTaxes[g] + delta));
    });
  };

  if (state.gobierno.reserva < dailyPayroll * hp.umbralReservaDiasNomina || lev.alimento.intercambio >= hp.intercambioPreventivo) {
    shiftTax(8, 0, hp.impuestoEmergenciaMax);
  } else if (lev.alimento.intercambio > 0) {
    shiftTax(5, 0, hp.impuestoEmergenciaMax - 1);
  } else if (
    (d.apoyoPct < hp.umbralApoyoAlivio || d.descontentosPct > hp.umbralDescontentosPct) &&
    state.gobierno.reserva >= dailyPayroll * hp.umbralReservaDiasNomina
  ) {
    shiftTax(-4, hp.impuestoAlivioMin, 60);
  } else {
    shiftTax(0);
  }

  if (d.descontentosPct > hp.umbralDescontentosPct) {
    const groupSat: Record<RoleGroupId, { sum: number; n: number }> = {
      agro: { sum: 0, n: 0 },
      industria: { sum: 0, n: 0 },
      comercio: { sum: 0, n: 0 },
      publico: { sum: 0, n: 0 },
      sin_ingreso: { sum: 0, n: 0 },
    };
    for (const npc of state.npcs) {
      if (!npc.vivo) continue;
      const grp = ROLE_CATALOG[npc.rol].grupo;
      groupSat[grp].sum += npc.variables.satisfaccion;
      groupSat[grp].n += 1;
    }
    let worstGrp: RoleGroupId = 'industria';
    let worstAvg = 999;
    (['agro', 'industria', 'comercio', 'publico', 'sin_ingreso'] as RoleGroupId[]).forEach((g) => {
      if (groupSat[g].n > 0) {
        const avg = groupSat[g].sum / groupSat[g].n;
        if (avg < worstAvg) {
          worstAvg = avg;
          worstGrp = g;
        }
      }
    });
    state.gobierno.palancasObjetivo = setBudgetShareInLevers(
      lev,
      (draft, val) => {
        draft.gasto.subsidios[worstGrp] = val;
      },
      Math.min(hp.topeSubsidioGrupo, lev.gasto.subsidios[worstGrp] + hp.incrementoSubsidioGrupo),
      lev.gasto.subsidios[worstGrp]
    );
  }
}

function makeInitState(seed: number): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'base',
    cantidadMedios: PRESET.SCENARIO_PRESET.mediosDefault,
    poblacionInicial: PRESET.SCENARIO_PRESET.poblacionDefault,
    caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
    disturbiosActivos: false,
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 99999;
  s.gobierno.palancasObjetivo.recaudacion = structuredClone(PRESET.initialLevers.recaudacion);
  s.gobierno.palancasObjetivo.gasto = structuredClone(PRESET.initialLevers.gasto);
  s.gobierno.palancasObjetivo.alimento = structuredClone(PRESET.initialLevers.alimento);
  s.gobierno.palancasObjetivo.finanzas = structuredClone(PRESET.initialLevers.finanzas);
  s.gobierno.palancasVigentes = structuredClone(s.gobierno.palancasObjetivo);
  s.gobierno.palancasInicioPeriodo = structuredClone(s.gobierno.palancasObjetivo);
  return s;
}

function summarize(arr: number[]): { mean: number; sd: number; min: number; max: number } {
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
  applyPresetToRuntime();
  const maxDays = opts.maxDays ?? 365;
  let wins = 0;
  let totalImpagos = 0;
  let seedsWithImpago = 0;
  let minAnyRoleCount = 999;
  let maxObreroOverCap = -999;

  const prod1: number[] = [];
  const cons1: number[] = [];
  const ing7: number[] = [];
  const oblig7: number[] = [];
  const disp7: number[] = [];
  const ingRatio7: number[] = [];
  const sat0: number[] = [];
  const satEnd: number[] = [];
  const deltaSat: number[] = [];
  const apoyoEnd: number[] = [];
  const hambreEnd: number[] = [];
  const reservaEnd: number[] = [];
  const minStock: number[] = [];
  const satAtStop: number[] = [];
  const apoyoAtStop: number[] = [];

  for (let seed = 1; seed <= opts.n; seed++) {
    let s = makeInitState(seed);
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
      if (d === 7) {
        const fin = s.gobierno.finanzas;
        const oblig = fin.nomina + fin.pensiones + fin.garantiaAlimentaria;
        ing7.push(fin.ingresos);
        oblig7.push(oblig);
        disp7.push(fin.disponible);
        ingRatio7.push(fin.ingresos / Math.max(1, oblig));
      }
      if (opts.chaos && (!opts.chaosStopDay || s.reloj.dia <= opts.chaosStopDay)) {
        runRandomDirectorDay(s);
      }
      if (opts.chaosStopDay && s.reloj.dia === opts.chaosStopDay) {
        const ds = deriveCommunityStats(s);
        satAtStop.push(ds.satisfaccionMedia);
        apoyoAtStop.push(ds.apoyoPct);
      }
      if (s.gobierno.finanzas.impago) {
        totalImpagos++;
        hadImp = true;
      }
      if (s.alimento.stock < minS) minS = s.alimento.stock;

      const dsCheck = deriveCommunityStats(s);
      for (const r of ALL_ROLES) {
        if (dsCheck.roles[r] < minAnyRoleCount) minAnyRoleCount = dsCheck.roles[r];
      }
      const obrCap = dsCheck.roles.comerciante * ECON_CONSTANTS.empleadosPorComerciante;
      const over = dsCheck.roles.obrero - obrCap;
      if (over > maxObreroOverCap) maxObreroOverCap = over;

      if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) break;
    }

    const de = deriveCommunityStats(s);
    if (s.resultado.victoriaCumplida || s.resultado.estado === 'victoria') wins++;
    if (hadImp) seedsWithImpago++;
    satEnd.push(de.satisfaccionMedia);
    deltaSat.push(de.satisfaccionMedia - d0.satisfaccionMedia);
    apoyoEnd.push(de.apoyoPct);
    hambreEnd.push(de.hambreCriticaPct);
    reservaEnd.push(s.gobierno.reserva);
    minStock.push(minS);
  }

  return {
    label,
    n: opts.n,
    winPct: Number(((wins / opts.n) * 100).toFixed(2)),
    seedsWithImpago,
    totalImpagos,
    minAnyRoleCount,
    maxObreroOverCap,
    prod1: summarize(prod1),
    cons1: summarize(cons1),
    ing7: summarize(ing7),
    oblig7: summarize(oblig7),
    disp7: summarize(disp7),
    ingRatio7: summarize(ingRatio7),
    sat0: summarize(sat0),
    satEnd: summarize(satEnd),
    deltaSat: summarize(deltaSat),
    apoyoEnd: summarize(apoyoEnd),
    hambreEnd: summarize(hambreEnd),
    reservaEnd: summarize(reservaEnd),
    minStock: summarize(minStock),
    satAtStop: satAtStop.length > 0 ? summarize(satAtStop) : null,
    apoyoAtStop: apoyoAtStop.length > 0 ? summarize(apoyoAtStop) : null,
  };
}

function runSeriesSeed1(label: string, opts: { chaos: boolean; drought?: PresetFile['droughtPrueba']; heur: boolean }) {
  applyPresetToRuntime();
  const checkpoints = new Set([1, 7, 14, 30, 60, 90, 120, 140, 155, 170, 185, 200, 215, 230, 260, 300, 330, 365]);
  const rows: Array<Record<string, number>> = [];
  let s = makeInitState(1);
  const pushRow = () => {
    const ds = deriveCommunityStats(s);
    rows.push({
      dia: s.reloj.dia,
      reserva: Math.round(s.gobierno.reserva),
      stock: Math.round(s.alimento.stock),
      diasStock: Number(s.alimento.diasStock.toFixed(1)),
      precio: Number(s.alimento.precio.toFixed(2)),
      despensaMed: Number(ds.despensaMediaDias.toFixed(1)),
      apoyo: ds.apoyoPct,
      hambreCritica: ds.hambreCriticaPct,
      satisfaccion: ds.satisfaccionMedia,
    });
  };
  pushRow();
  for (let d = 1; d < 365; d++) {
    if (opts.drought && s.reloj.dia === opts.drought.inicioDia) {
      s.clima.fenomenos.push({
        id: 'seq_series',
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
    if (opts.chaos) runRandomDirectorDay(s);
    if (checkpoints.has(s.reloj.dia)) pushRow();
    if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) {
      if (!checkpoints.has(s.reloj.dia)) pushRow();
      break;
    }
  }
  return { label, rows };
}

function runSensitivity(n: number) {
  applyPresetToRuntime();
  const eval60 = (mutator?: (s: GameState) => void) => {
    const apoyos: number[] = [];
    const reservas: number[] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = makeInitState(seed);
      if (mutator) mutator(s);
      for (let d = 1; d < 60; d++) {
        stepHeadlessDay(s);
      }
      const ds = deriveCommunityStats(s);
      apoyos.push(ds.apoyoPct);
      reservas.push(s.gobierno.reserva);
    }
    return { apoyo: summarize(apoyos), reserva: summarize(reservas) };
  };

  const base = eval60();
  const cases: Array<{ palanca: string; modo: string; up: (s: GameState) => void; dn: (s: GameState) => void }> = [
    {
      palanca: 'recaudacion.impuestoGrupo.* (±12 pp)',
      modo: '±20% rango',
      up: (s) => {
        (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
          s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo[g] += 12;
        });
      },
      dn: (s) => {
        (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
          s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo[g] -= 12;
        });
      },
    },
    {
      palanca: 'gasto.salarioPublico (±20 pp)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.salarioPublico = 120; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.salarioPublico = 80; },
    },
    {
      palanca: 'alimento.precioMaximo (110 vs 250)',
      modo: 'tope vs sin tope',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.precioMaximo = 250; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.precioMaximo = 110; },
    },
    {
      palanca: 'alimento.garantiaAlimentaria (100 vs 50)',
      modo: 'garantía',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.garantiaAlimentaria = 100; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.garantiaAlimentaria = 50; },
    },
    {
      palanca: 'alimento.intercambio (±40)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.intercambio = 40; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.intercambio = -40; },
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
    };
  });

  return { n, base, rows };
}

console.log('=== 1. CRITERIO A & B (sin perturbacion, n=40) ===');
console.log(JSON.stringify(runBatch('B_no_perturb', { n: 40, chaos: false, heur: false }), null, 2));

console.log('=== 2. CRITERIO C1 PASIVO CON SEQUIA + CAOS (n=40) ===');
console.log(JSON.stringify(runBatch('C1_passive_drought', { n: 40, chaos: true, drought: PRESET.droughtPrueba, heur: false }), null, 2));

console.log('=== 3. CRITERIO C2 HEURISTICO CON SEQUIA + CAOS (n=40) ===');
console.log(JSON.stringify(runBatch('C2_heuristic_drought', { n: 40, chaos: true, drought: PRESET.droughtPrueba, heur: true }), null, 2));

console.log('=== 4. CRITERIO C3 SOLO CAOS (cesa dia 180) PASIVO (n=30) ===');
console.log(JSON.stringify(runBatch('C3_chaos_only_stop180', { n: 30, chaos: true, chaosStopDay: 180, heur: false }), null, 2));

console.log('=== 5. CRITERIO D SENSIBILIDAD A 60 DIAS (n=25) ===');
console.log(JSON.stringify(runSensitivity(25), null, 2));

console.log('=== 6. SERIES TEMPORALES (semilla 1) ===');
const series1 = runSeriesSeed1('pasivo_sin_perturbacion', { chaos: false, heur: false });
const series2 = runSeriesSeed1('pasivo_con_sequia_y_caos', { chaos: true, drought: PRESET.droughtPrueba, heur: false });
const series3 = runSeriesSeed1('heuristico_con_sequia_y_caos', { chaos: true, drought: PRESET.droughtPrueba, heur: true });
console.log(JSON.stringify([series1, series2, series3], null, 2));
