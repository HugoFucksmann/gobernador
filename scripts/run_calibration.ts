import fs from 'node:fs';
import path from 'node:path';
import { ECON_CONSTANTS, LEVER_MAX_CHANGE_PCT, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
import { setBudgetShareInLevers } from '../src/engine/policies';
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
  stepSimulation,
  TICKS_PER_DAY,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import { GameState, PrivateRoleId, RoleGroupId, RoleId, WorldConfig } from '../src/types/game';

interface PresetFile {
  id: string;
  ECON_CONSTANTS: typeof ECON_CONSTANTS;
  ROLE_CATALOG_ingresos: Record<PrivateRoleId, [number, number]>;
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
      impuestoUnico: number;
      impuestoGrupo: { agro: number; industria: number; comercio: number; publico: number };
    };
    gasto: {
      salarioPublico: number;
      presupuesto: { salud: number; seguridad: number; infraestructura: number; educacion: number };
      prensa: number;
      subsidios: Record<RoleGroupId, number>;
    };
    alimento: { racion: number; garantiaAlimentaria: number; intercambio: number };
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
    racionRecuperacionSiHambreMayorA5: number;
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

const ORIGINAL_DEFAULTS = {
  ECON_CONSTANTS: {
    salarioBasePublico: 12,
    pensionBase: 6,
    empleadosPorComerciante: 4,
    precioBaseAlimento: 1.0,
    consumoPorNpc: 1.0,
    produccionBaseAgricultor: 4.1,
    perdidaAdminMax: 0.30,
    costoBaseServicioPorPoblacion: 0.42,
    comisionComercioFactor: 0.14,
    coefSubsidioSimple: 3.5,
    coefImpuestoSimple: 0.45,
    fiscalUmbral: 40,
    fiscalPendiente: 0.01,
  },
  ingresos: {
    agricultor: [14, 22] as [number, number],
    obrero: [16, 26] as [number, number],
    comerciante: [20, 34] as [number, number],
    tecnico: [26, 38] as [number, number],
    periodista: [16, 26] as [number, number],
  },
  reservaInicial: 650,
  stockAlimentoInicial: 1700,
  initialLevers: {
    impuestoUnico: 28,
    presupuesto: { salud: 22, seguridad: 18, infraestructura: 20, educacion: 16 },
    prensa: 6,
    subsidios: { agro: 0, industria: 0, comercio: 0, publico: 0, sin_ingreso: 8 },
  },
};

function applyPresetToRuntime(useOriginal: boolean): void {
  if (useOriginal) {
    Object.assign(ECON_CONSTANTS, ORIGINAL_DEFAULTS.ECON_CONSTANTS);
    (Object.keys(ORIGINAL_DEFAULTS.ingresos) as PrivateRoleId[]).forEach((r) => {
      ROLE_CATALOG[r].ingreso = [...ORIGINAL_DEFAULTS.ingresos[r]];
    });
    SCENARIO_PRESETS.elecciones.reservaInicial = ORIGINAL_DEFAULTS.reservaInicial;
    SCENARIO_PRESETS.elecciones.stockAlimentoInicial = ORIGINAL_DEFAULTS.stockAlimentoInicial;
    return;
  }
  Object.assign(ECON_CONSTANTS, PRESET.ECON_CONSTANTS);
  (Object.keys(PRESET.ROLE_CATALOG_ingresos) as PrivateRoleId[]).forEach((r) => {
    ROLE_CATALOG[r].ingreso = [...PRESET.ROLE_CATALOG_ingresos[r]];
  });
  SCENARIO_PRESETS.elecciones.reservaInicial = PRESET.SCENARIO_PRESET.reservaInicial;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = PRESET.SCENARIO_PRESET.stockAlimentoInicial;
  SCENARIO_PRESETS.elecciones.topesPrivados = { ...PRESET.SCENARIO_PRESET.topesPrivados };
  SCENARIO_PRESETS.elecciones.cuposIniciales = { ...PRESET.SCENARIO_PRESET.cuposIniciales };
  SCENARIO_PRESETS.elecciones.caosDefault = { ...PRESET.SCENARIO_PRESET.caosDefault };
}

function withSeed<T>(seed: number, fn: () => T): T {
  let s = seed >>> 0;
  const orig = Math.random;
  Math.random = () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function runRandomDirectorDay(state: GameState): void {
  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente') {
      const chosen = win.candidatas[Math.floor(Math.random() * win.candidatas.length)];
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, 'motor');
    }
  }
  if (state.reloj.dia % 4 === 0 && state.medios.length > 0) {
    const medio = state.medios[Math.floor(Math.random() * state.medios.length)];
    const periodistaId = medio.columnistas[0] || state.npcs.find((n) => n.vivo)?.id;
    if (periodistaId) {
      const periodista = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];
      const topic = pickPressTopicAndTone(state);
      applyPressArticleEffects(state, {
        id: `n_${state.reloj.dia}_${Math.random().toString(36).slice(2, 6)}`,
        dia: state.reloj.dia,
        medioId: medio.id,
        medioNombre: medio.nombre,
        autorId: periodista.id,
        autorNombre: periodista.nombre,
        tema: topic.tema,
        tono: topic.tono,
        alcance: medio.alcancePct,
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
          const chosen = candidatas[Math.floor(Math.random() * candidatas.length)];
          applyActionToNpc(state, npc, chosen, pickActionText(chosen, npc.nombre), 'motor');
          state.caosTracker.accionesEnVentana += 1;
        }
      }
    }
  }
}

function applyHeuristicGovernor(state: GameState): void {
  const hp = PRESET.heuristicPolicy;
  const baseTax = PRESET.initialLevers.recaudacion.impuestoUnico;
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
  lev.alimento.racion = d.hambreCriticaPct > 5 && state.alimento.diasStock >= 12 ? hp.racionRecuperacionSiHambreMayorA5 : 100;

  if (state.gobierno.reserva < dailyPayroll * hp.umbralReservaDiasNomina || lev.alimento.intercambio >= hp.intercambioPreventivo) {
    lev.recaudacion.impuestoUnico = Math.min(hp.impuestoEmergenciaMax, baseTax + 9);
  } else if (lev.alimento.intercambio > 0) {
    lev.recaudacion.impuestoUnico = Math.min(hp.impuestoEmergenciaMax - 1, baseTax + 6);
  } else if (
    (d.apoyoPct < hp.umbralApoyoAlivio || d.descontentosPct > hp.umbralDescontentosPct) &&
    state.gobierno.reserva >= dailyPayroll * hp.umbralReservaDiasNomina
  ) {
    lev.recaudacion.impuestoUnico = Math.max(hp.impuestoAlivioMin, baseTax - 4);
  } else {
    lev.recaudacion.impuestoUnico = baseTax;
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

function makeInitState(useOriginal: boolean): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'simple',
    cantidadMedios: PRESET.SCENARIO_PRESET.mediosDefault,
    poblacionInicial: PRESET.SCENARIO_PRESET.poblacionDefault,
    caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 99999; // Disable unscheduled random climate events in calibration tests
  if (useOriginal) {
    s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = ORIGINAL_DEFAULTS.initialLevers.impuestoUnico;
    s.gobierno.palancasObjetivo.gasto.presupuesto = { ...ORIGINAL_DEFAULTS.initialLevers.presupuesto };
    s.gobierno.palancasObjetivo.gasto.prensa = ORIGINAL_DEFAULTS.initialLevers.prensa;
    s.gobierno.palancasObjetivo.gasto.subsidios = { ...ORIGINAL_DEFAULTS.initialLevers.subsidios };
  } else {
    s.gobierno.palancasObjetivo.recaudacion = structuredClone(PRESET.initialLevers.recaudacion);
    s.gobierno.palancasObjetivo.gasto = structuredClone(PRESET.initialLevers.gasto);
    s.gobierno.palancasObjetivo.alimento = structuredClone(PRESET.initialLevers.alimento);
    s.gobierno.palancasObjetivo.finanzas = structuredClone(PRESET.initialLevers.finanzas);
  }
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
  useOriginal?: boolean;
  chaos: boolean;
  chaosStopDay?: number;
  drought?: { intensidad: number; inicioDia: number; duracionDias: number };
  heur: boolean;
  maxDays?: number;
}

const ALL_ROLES: RoleId[] = [
  'estudiante', 'agricultor', 'obrero', 'policia', 'estatal', 'comerciante',
  'tecnico', 'docente', 'periodista', 'medico', 'ingeniero', 'desempleado', 'jubilado',
];

function runBatch(label: string, opts: BatchOpts) {
  applyPresetToRuntime(Boolean(opts.useOriginal));
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
    withSeed(seed, () => {
      let s = makeInitState(Boolean(opts.useOriginal));
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
        s = stepSimulation(s, TICKS_PER_DAY);
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

        if (!opts.useOriginal) {
          const dsCheck = deriveCommunityStats(s);
          for (const r of ALL_ROLES) {
            if (dsCheck.roles[r] < minAnyRoleCount) minAnyRoleCount = dsCheck.roles[r];
          }
          const obrCap = dsCheck.roles.comerciante * ECON_CONSTANTS.empleadosPorComerciante;
          const over = dsCheck.roles.obrero - obrCap;
          if (over > maxObreroOverCap) maxObreroOverCap = over;
        }
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
    });
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
  applyPresetToRuntime(false);
  const checkpoints = new Set([1, 30, 60, 90, 120, 140, 155, 170, 185, 200, 215, 230, 260, 300, 330, 365]);
  const rows: Array<Record<string, number>> = [];
  withSeed(1, () => {
    let s = makeInitState(false);
    const pushRow = () => {
      const ds = deriveCommunityStats(s);
      rows.push({
        dia: s.reloj.dia,
        reserva: Math.round(s.gobierno.reserva),
        stock: Math.round(s.alimento.stock),
        diasStock: Number(s.alimento.diasStock.toFixed(1)),
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
      s = stepSimulation(s, TICKS_PER_DAY);
      if (opts.chaos) runRandomDirectorDay(s);
      if (checkpoints.has(s.reloj.dia)) pushRow();
      if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) {
        if (!checkpoints.has(s.reloj.dia)) pushRow();
        break;
      }
    }
  });
  return { label, rows };
}

function runSensitivity(n: number) {
  applyPresetToRuntime(false);
  const eval60 = (mutator?: (s: GameState) => void) => {
    const apoyos: number[] = [];
    const reservas: number[] = [];
    for (let seed = 1; seed <= n; seed++) {
      withSeed(seed, () => {
        let s = makeInitState(false);
        if (mutator) mutator(s);
        for (let d = 1; d < 60; d++) {
          s = stepSimulation(s, TICKS_PER_DAY);
        }
        const ds = deriveCommunityStats(s);
        apoyos.push(ds.apoyoPct);
        reservas.push(s.gobierno.reserva);
      });
    }
    return { apoyo: summarize(apoyos), reserva: summarize(reservas) };
  };

  const base = eval60();
  const baseTax = PRESET.initialLevers.recaudacion.impuestoUnico;
  const maxStep = LEVER_MAX_CHANGE_PCT; // 20

  const cases: Array<{ palanca: string; modo: string; up: (s: GameState) => void; dn: (s: GameState) => void }> = [
    {
      palanca: 'recaudacion.impuestoUnico (±12 pp / 20% rango [0..60])',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = baseTax + 12; },
      dn: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = baseTax - 12; },
    },
    {
      palanca: 'recaudacion.impuestoUnico (±5.2 pp / ±20% relativo)',
      modo: '±20% valor',
      up: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = Number((baseTax * 1.2).toFixed(1)); },
      dn: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = Number((baseTax * 0.8).toFixed(1)); },
    },
    {
      palanca: 'gasto.salarioPublico (±20 pp / 20% rango [50..150])',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.salarioPublico = 100 + maxStep; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.salarioPublico = 100 - maxStep; },
    },
    {
      palanca: 'gasto.presupuesto.salud (±18/-18 a +20)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.salud = 18 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.salud = 0; },
    },
    {
      palanca: 'gasto.presupuesto.seguridad (+20/-12)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.seguridad = 12 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.seguridad = 0; },
    },
    {
      palanca: 'gasto.presupuesto.infraestructura (+20/-18)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.infraestructura = 18 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.infraestructura = 0; },
    },
    {
      palanca: 'gasto.presupuesto.educacion (+20/-12)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.educacion = 12 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.presupuesto.educacion = 0; },
    },
    {
      palanca: 'gasto.prensa (+20/-5)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.prensa = 5 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.prensa = 0; },
    },
    {
      palanca: 'gasto.subsidios.agro (+20/-9)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro = 9 + 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro = 0; },
    },
    {
      palanca: 'gasto.subsidios.agro (±1.8 pp / ±20% relativo)',
      modo: '±20% valor',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro = 10.8; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro = 7.2; },
    },
    {
      palanca: 'gasto.subsidios.industria (+20/0)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.industria = 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.industria = 0; },
    },
    {
      palanca: 'gasto.subsidios.comercio (+20/0)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.comercio = 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.comercio = 0; },
    },
    {
      palanca: 'gasto.subsidios.publico (+20/0)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.publico = 20; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.publico = 0; },
    },
    {
      palanca: 'gasto.subsidios.sin_ingreso (+20/-6)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.sin_ingreso = 26; },
      dn: (s) => { s.gobierno.palancasObjetivo.gasto.subsidios.sin_ingreso = 0; },
    },
    {
      palanca: 'alimento.racion (±20 pp / 20% rango [50..150])',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.racion = 120; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.racion = 80; },
    },
    {
      palanca: 'alimento.intercambio (±40 / 20% rango [-100..100])',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.intercambio = 40; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.intercambio = -40; },
    },
    {
      palanca: 'cupos.policia (+6/-4 sobre [0..30], sin vaciar)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.cupos.policia = 11; },
      dn: (s) => { s.gobierno.palancasObjetivo.cupos.policia = 1; },
    },
    {
      palanca: 'cupos.medico (+6/-4 sobre [0..30], sin vaciar)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.cupos.medico = 11; },
      dn: (s) => { s.gobierno.palancasObjetivo.cupos.medico = 1; },
    },
    {
      palanca: 'recaudacion.impuestoGrupo.* (±12 pp)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo.agro += 12; },
      dn: (s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo.agro -= 12; },
    },
    {
      palanca: 'alimento.garantiaAlimentaria (+15/-20)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.alimento.garantiaAlimentaria = 100; },
      dn: (s) => { s.gobierno.palancasObjetivo.alimento.garantiaAlimentaria = 65; },
    },
    {
      palanca: 'finanzas.topeEmision (±6 pp)',
      modo: '±20% rango',
      up: (s) => { s.gobierno.palancasObjetivo.finanzas.topeEmision = 16; },
      dn: (s) => { s.gobierno.palancasObjetivo.finanzas.topeEmision = 4; },
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

console.log('=== 1. BASELINE ANTES (defaults originales, n=40) ===');
const antes = runBatch('antes', { n: 40, useOriginal: true, chaos: false, heur: false });
console.log(JSON.stringify(antes, null, 2));

console.log('=== 2. CRITERIO A & B (sin perturbacion, n=100) ===');
const critB = runBatch('B_no_perturb', { n: 100, chaos: false, heur: false });
console.log(JSON.stringify(critB, null, 2));

console.log('=== 3. CRITERIO C1 PASIVO CON SEQUIA CALIBRADA + CAOS (n=200) ===');
const critC1 = runBatch('C1_passive_drought', { n: 200, chaos: true, drought: PRESET.droughtPrueba, heur: false });
console.log(JSON.stringify(critC1, null, 2));

console.log('=== 4. CRITERIO C2 HEURISTICO CON SEQUIA CALIBRADA + CAOS (n=200) ===');
const critC2 = runBatch('C2_heuristic_drought', { n: 200, chaos: true, drought: PRESET.droughtPrueba, heur: true });
console.log(JSON.stringify(critC2, null, 2));

console.log('=== 5. CRITERIO C3 SOLO CAOS (cesa dia 180) PASIVO (n=100) ===');
const critC3 = runBatch('C3_chaos_only_stop180', { n: 100, chaos: true, chaosStopDay: 180, heur: false });
console.log(JSON.stringify(critC3, null, 2));

console.log('=== 6. DIAGNOSTICO SEQUIA DEL BRIEF (60%, dia 140, 30d) PASIVO (n=40) ===');
const critCbrief = runBatch('C_brief_drought_60_30', { n: 40, chaos: true, drought: { intensidad: 60, inicioDia: 140, duracionDias: 30 }, heur: false });
console.log(JSON.stringify(critCbrief, null, 2));

console.log('=== 7. CRITERIO D SENSIBILIDAD A 60 DIAS (n=50) ===');
const critD = runSensitivity(50);
console.log(JSON.stringify(critD, null, 2));

console.log('=== 8. SERIES TEMPORALES (semilla 1) ===');
const series1 = runSeriesSeed1('pasivo_sin_perturbacion', { chaos: false, heur: false });
const series2 = runSeriesSeed1('pasivo_con_sequia_y_caos', { chaos: true, drought: PRESET.droughtPrueba, heur: false });
const series3 = runSeriesSeed1('heuristico_con_sequia_y_caos', { chaos: true, drought: PRESET.droughtPrueba, heur: true });
console.log(JSON.stringify([series1, series2, series3], null, 2));
