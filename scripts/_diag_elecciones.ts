import { ECON_CONSTANTS, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
import { setBudgetShareInLevers } from '../src/engine/policies';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canTriggerSpontaneousChaos,
  deriveCommunityStats,
  pickChaosCandidateNpc,
  pickPressTopicAndTone,
  resolveConditionWindowWithFallback,
  selectCandidateActions,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import { GameState, RoleGroupId, WorldConfig } from '../src/types/game';

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
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, undefined, 'respaldo');
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
        credibilidad: medio.credibilidad,
        titulo: `Nota ${topic.tema}`,
        texto: topic.detalle,
        origen: topic.origen,
        fuente: 'plantilla',
        zonaOrigen: topic.zonaOrigen,
        fenomenoId: topic.fenomenoId,
        esAviso: topic.esAviso,
        vigenteHastaDia: topic.vigenteHastaDia,
      });
    }
  }
  if (state.reloj.dia % 2 === 0) {
    const gate = canTriggerSpontaneousChaos(state);
    if (gate.allowed) {
      const npc = pickChaosCandidateNpc(state);
      if (npc) {
        const candidatas = selectCandidateActions(npc);
        if (candidatas.length > 0) {
          const chosen = candidatas[Math.floor(Math.random() * candidatas.length)];
          applyActionToNpc(state, npc, chosen, chosen.textoBase.replace('{nombre}', npc.nombre), 'respaldo');
          state.caosTracker.accionesEnVentana += 1;
        }
      }
    }
  }
}

interface CalParams {
  tax: number;
  salBase: number;
  prodBase: number;
  costoServ: number;
  reserva: number;
  stock: number;
  coefSub: number;
  coefImp: number;
  coefSatSub: number;
  topeSatSub: number;
  coefHambreUp: number;
  coefHambreDown: number;
  agroSub: number;
  sinIngSub: number;
  prensaShare: number;
  initSatShift: number;
  initLealShift: number;
}

function applyConfig(params: CalParams) {
  ECON_CONSTANTS.salarioBasePublico = params.salBase;
  ECON_CONSTANTS.produccionBaseAgricultor = params.prodBase;
  ECON_CONSTANTS.costoBaseServicioPorPoblacion = params.costoServ;
  ECON_CONSTANTS.coefSubsidioSimple = params.coefSub;
  ECON_CONSTANTS.coefImpuestoSimple = params.coefImp;
  ECON_CONSTANTS.coefSatisfaccionSubsidioSimple = params.coefSatSub;
  ECON_CONSTANTS.topeSatisfaccionSubsidioSimple = params.topeSatSub;
  ECON_CONSTANTS.coefHambreSubida = params.coefHambreUp;
  ECON_CONSTANTS.coefHambreBaja = params.coefHambreDown;

  ROLE_CATALOG.agricultor.ingreso = [18, 28];
  ROLE_CATALOG.obrero.ingreso = [20, 30];
  ROLE_CATALOG.comerciante.ingreso = [24, 38];
  ROLE_CATALOG.tecnico.ingreso = [30, 44];
  ROLE_CATALOG.periodista.ingreso = [20, 30];

  SCENARIO_PRESETS.elecciones.reservaInicial = params.reserva;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = params.stock;
}

function makeState(params: CalParams): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'simple',
    cantidadMedios: 2,
    poblacionInicial: 100,
    caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  if (params.initSatShift !== 0 || params.initLealShift !== 0) {
    for (const n of s.npcs) {
      n.variables.satisfaccion = Math.max(0, Math.min(100, n.variables.satisfaccion + params.initSatShift));
      n.variables.lealtad = Math.max(0, Math.min(100, n.variables.lealtad + params.initLealShift));
    }
  }
  s.clima.proximoEventoDia = 99999;
  s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = params.tax;
  s.gobierno.palancasObjetivo.gasto.presupuesto = {
    salud: 18,
    seguridad: 14,
    infraestructura: 18,
    educacion: 14,
  };
  s.gobierno.palancasObjetivo.gasto.prensa = params.prensaShare;
  s.gobierno.palancasObjetivo.gasto.subsidios = {
    agro: params.agroSub,
    industria: 0,
    comercio: 0,
    publico: 0,
    sin_ingreso: params.sinIngSub,
  };
  s.gobierno.palancasVigentes = structuredClone(s.gobierno.palancasObjetivo);
  return s;
}

function applyHeur(state: GameState, baseTax: number): void {
  const lev = state.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(state);
  const dailyPayroll = 21 * ECON_CONSTANTS.salarioBasePublico * (lev.gasto.salarioPublico / 100);
  const deficitAlim = state.alimento.produccionDiaria < state.alimento.consumoDiario * 0.96;

  if (state.alimento.diasStock < 10 || (state.alimento.diasStock < 14 && deficitAlim)) {
    lev.alimento.intercambio = 100;
  } else if (state.alimento.diasStock < 17 && deficitAlim) {
    lev.alimento.intercambio = 55;
  } else {
    lev.alimento.intercambio = 0;
  }

  if (d.hambreCriticaPct > 4 && state.alimento.diasStock >= 4) {
    lev.alimento.racion = 115;
  } else if (state.alimento.diasStock < 2) {
    lev.alimento.racion = 85;
  } else {
    lev.alimento.racion = 100;
  }

  if (state.gobierno.reserva < dailyPayroll * 10 || state.ultimaSalidaEconomica.disponibleDiarioEstimado < 0) {
    lev.recaudacion.impuestoUnico = Math.min(36, baseTax + 14);
  } else if (state.gobierno.reserva < dailyPayroll * 14 && lev.alimento.intercambio >= 80) {
    lev.recaudacion.impuestoUnico = Math.min(33, baseTax + 10);
  } else if (d.apoyoPct < 54 || d.descontentosPct > 25) {
    lev.recaudacion.impuestoUnico = Math.max(19, baseTax - 3);
  } else {
    lev.recaudacion.impuestoUnico = baseTax;
  }

  if (d.descontentosPct > 24 || d.apoyoPct < 54) {
    const groupSat: Record<RoleGroupId, { sum: number; n: number }> = {
      agro: { sum: 0, n: 0 },
      industria: { sum: 0, n: 0 },
      comercio: { sum: 0, n: 0 },
      publico: { sum: 0, n: 0 },
      sin_ingreso: { sum: 0, n: 0 },
    };
    for (const npc of state.npcs) {
      if (!npc.vivo) continue;
      const g = ROLE_CATALOG[npc.rol].grupo;
      groupSat[g].sum += npc.variables.satisfaccion;
      groupSat[g].n += 1;
    }
    let worstGrp: RoleGroupId = 'industria';
    let worstAvg = 999;
    (['agro', 'industria', 'comercio', 'publico', 'sin_ingreso'] as RoleGroupId[]).forEach((g) => {
      if (groupSat[g].n > 0 && groupSat[g].sum / groupSat[g].n < worstAvg) {
        worstAvg = groupSat[g].sum / groupSat[g].n;
        worstGrp = g;
      }
    });
    const totalSub = Object.values(lev.gasto.subsidios).reduce((a, b) => a + b, 0);
    if (totalSub < 20) {
      state.gobierno.palancasObjetivo = setBudgetShareInLevers(
        lev,
        (draft, val) => {
          draft.gasto.subsidios[worstGrp] = val;
        },
        Math.min(10, lev.gasto.subsidios[worstGrp] + 2),
        lev.gasto.subsidios[worstGrp]
      );
    }
  }
}

function sim(
  params: CalParams,
  label: string,
  n: number,
  opts: {
    chaos?: boolean;
    chaosStop?: number;
    drought?: { i: number; d: number; dur: number };
    pandemia?: { i: number; d: number; dur: number; expo: number };
    heur?: boolean;
    checkRecovery?: boolean;
  }
) {
  let wins = 0;
  let imp = 0;
  let ratio7 = 0;
  let apEnd = 0;
  let satD = 0;
  let ham = 0;
  let p1 = 0;
  let c1 = 0;
  let popEnd = 0;
  let recOk = 0;
  let recDaysSum = 0;

  if (opts.pandemia) {
    ECON_CONSTANTS.fenomenosSalud.pandemia.exposicionMax = opts.pandemia.expo;
  }

  for (let seed = 1; seed <= n; seed++) {
    withSeed(seed, () => {
      let baseApSeries: number[] | undefined;
      if (opts.checkRecovery) {
        baseApSeries = [];
        const sb = makeState(params);
        for (let d = 1; d < 365; d++) {
          stepHeadlessDay(sb);
          baseApSeries[sb.reloj.dia] = deriveCommunityStats(sb).apoyoPct;
          if (sb.resultado.estado !== 'jugando') break;
        }
      }

      const s = makeState(params);
      const d0 = deriveCommunityStats(s);
      let recoveredDay: number | null = null;

      for (let d = 1; d < 365; d++) {
        if (opts.drought && s.reloj.dia === opts.drought.d) {
          s.clima.fenomenos.push({
            id: 'seq',
            tipo: 'sequia',
            nombre: 'Sequía',
            intensidad: opts.drought.i,
            inicioDia: opts.drought.d,
            duracionDias: opts.drought.dur,
          });
        }
        if (opts.pandemia && s.reloj.dia === opts.pandemia.d) {
          s.clima.fenomenos.push({
            id: 'pand',
            tipo: 'pandemia',
            nombre: 'Pandemia',
            intensidad: opts.pandemia.i,
            inicioDia: opts.pandemia.d,
            duracionDias: opts.pandemia.dur,
          });
        }
        if (opts.heur && s.reloj.dia % 7 === 0) {
          applyHeur(s, params.tax);
          if (opts.pandemia && s.clima.fenomenos.some((f) => f.tipo === 'pandemia')) {
            s.gobierno.palancasObjetivo.cupos.medico = 10;
            s.gobierno.palancasObjetivo.gasto.presupuesto.salud = 34;
            s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = 28;
          }
        }
        stepHeadlessDay(s);
        if (d === 1) { p1 += s.alimento.produccionDiaria; c1 += s.alimento.consumoDiario; }
        if (d === 7) {
          const f = s.gobierno.finanzas;
          ratio7 += f.ingresos / Math.max(1, f.nomina + f.pensiones + f.garantiaAlimentaria + f.comprasAlimento);
        }
        if (opts.chaos && (!opts.chaosStop || s.reloj.dia <= opts.chaosStop)) runRandomDirectorDay(s);
        if (opts.checkRecovery && baseApSeries && s.reloj.dia >= 180 && s.reloj.dia <= 240 && recoveredDay === null) {
          const curAp = deriveCommunityStats(s).apoyoPct;
          if (Math.abs(curAp - (baseApSeries[s.reloj.dia] ?? curAp)) <= 3) {
            recoveredDay = s.reloj.dia - 180;
          }
        }
        if (s.gobierno.finanzas.impago) imp++;
        if (s.resultado.estado !== 'jugando') break;
      }
      const de = deriveCommunityStats(s);
      if (s.resultado.estado === 'victoria') wins++;
      apEnd += de.apoyoPct;
      satD += de.satisfaccionMedia - d0.satisfaccionMedia;
      ham += de.hambreCriticaPct;
      popEnd += de.poblacion;
      if (opts.checkRecovery && recoveredDay !== null) {
        recOk++;
        recDaysSum += recoveredDay;
      }
    });
  }

  const out: Record<string, number> = {
    winPct: Number(((wins / n) * 100).toFixed(1)),
    ratio7: Number((ratio7 / n).toFixed(3)),
    prod1: Number((p1 / n).toFixed(1)),
    cons1: Number((c1 / n).toFixed(1)),
    apEnd: Number((apEnd / n).toFixed(1)),
    satDelta: Number((satD / n).toFixed(2)),
    hamEnd: Number((ham / n).toFixed(2)),
    popEnd: Number((popEnd / n).toFixed(1)),
    imp,
  };
  if (opts.checkRecovery) {
    out.recPct = Number(((recOk / n) * 100).toFixed(1));
    out.recDays = recOk > 0 ? Number((recDaysSum / recOk).toFixed(1)) : -1;
  }
  console.log(label, out);
}

const candidates: Array<[string, CalParams]> = [
  ['L1_sweet', {
    tax: 22, salBase: 9.5, prodBase: 5.52, costoServ: 0.06, reserva: 4000, stock: 1500,
    coefSub: 9.8, coefImp: 1.40, coefSatSub: 1.2, topeSatSub: 8.5, coefHambreUp: 24, coefHambreDown: 14,
    agroSub: 9, sinIngSub: 5, prensaShare: 4, initSatShift: -4, initLealShift: -5,
  }],
  ['L2_sweet2', {
    tax: 22, salBase: 9.5, prodBase: 5.52, costoServ: 0.06, reserva: 4000, stock: 1500,
    coefSub: 10.2, coefImp: 1.38, coefSatSub: 1.25, topeSatSub: 8.5, coefHambreUp: 24, coefHambreDown: 14,
    agroSub: 9, sinIngSub: 5, prensaShare: 4, initSatShift: -4, initLealShift: -5,
  }],
];

for (const [name, cp] of candidates) {
  console.log('=== ' + name + ' ===');
  applyConfig(cp);
  sim(cp, 'B_no_perturb', 30, {});
  sim(cp, 'Mod_passive', 30, { chaos: true, drought: { i: 60, d: 140, dur: 30 } });
  sim(cp, 'Mod_heur', 30, { chaos: true, drought: { i: 60, d: 140, dur: 30 }, heur: true });
  sim(cp, 'Sev_passive', 30, { chaos: true, drought: { i: 95, d: 140, dur: 90 } });
  sim(cp, 'Sev_heur', 30, { chaos: true, drought: { i: 95, d: 140, dur: 90 }, heur: true });
  sim(cp, 'Recovery_180', 30, { chaos: true, chaosStop: 180, checkRecovery: true });
}

console.log('=== Criterion G: Pandemia on L2 ===');
applyConfig(candidates[1][1]);
sim(candidates[1][1], 'Pand_passive_0.30', 25, { pandemia: { i: 60, d: 140, dur: 60, expo: 0.30 } });
sim(candidates[1][1], 'Pand_heur_0.30', 25, { pandemia: { i: 60, d: 140, dur: 60, expo: 0.30 }, heur: true });
