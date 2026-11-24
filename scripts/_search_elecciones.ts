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

interface Params {
  tax: number;
  salBase: number;
  prodBase: number;
  costoServ: number;
  reserva: number;
  stock: number;
  coefSeqProd: number;
  coefSub: number;
  coefImp: number;
  coefSatSub: number;
  topeSatSub: number;
  coefHambreUp: number;
  coefHambreDown: number;
  agroSub: number;
  sinIngSub: number;
  prensaShare: number;
  satRange: [number, number];
  lealRange: [number, number];
}

function applyParams(p: Params) {
  ECON_CONSTANTS.salarioBasePublico = p.salBase;
  ECON_CONSTANTS.produccionBaseAgricultor = p.prodBase;
  ECON_CONSTANTS.costoBaseServicioPorPoblacion = p.costoServ;
  ECON_CONSTANTS.coefSequiaProduccion = p.coefSeqProd;
  ECON_CONSTANTS.coefSubsidioSimple = p.coefSub;
  ECON_CONSTANTS.coefImpuestoSimple = p.coefImp;
  ECON_CONSTANTS.coefSatisfaccionSubsidioSimple = p.coefSatSub;
  ECON_CONSTANTS.topeSatisfaccionSubsidioSimple = p.topeSatSub;
  ECON_CONSTANTS.coefHambreSubida = p.coefHambreUp;
  ECON_CONSTANTS.coefHambreBaja = p.coefHambreDown;

  ROLE_CATALOG.agricultor.ingreso = [18, 28];
  ROLE_CATALOG.obrero.ingreso = [20, 30];
  ROLE_CATALOG.comerciante.ingreso = [24, 38];
  ROLE_CATALOG.tecnico.ingreso = [30, 44];
  ROLE_CATALOG.periodista.ingreso = [20, 30];

  SCENARIO_PRESETS.elecciones.reservaInicial = p.reserva;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = p.stock;
}

function makeState(p: Params): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'simple',
    cantidadMedios: 2,
    poblacionInicial: 100,
    caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  for (const n of s.npcs) {
    n.variables.satisfaccion = p.satRange[0] + Math.floor(Math.random() * (p.satRange[1] - p.satRange[0] + 1));
    n.variables.lealtad = p.lealRange[0] + Math.floor(Math.random() * (p.lealRange[1] - p.lealRange[0] + 1));
  }
  s.clima.proximoEventoDia = 99999;
  s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = p.tax;
  s.gobierno.palancasObjetivo.gasto.presupuesto = {
    salud: 18,
    seguridad: 14,
    infraestructura: 18,
    educacion: 14,
  };
  s.gobierno.palancasObjetivo.gasto.prensa = p.prensaShare;
  s.gobierno.palancasObjetivo.gasto.subsidios = {
    agro: p.agroSub,
    industria: 0,
    comercio: 0,
    publico: 0,
    sin_ingreso: p.sinIngSub,
  };
  s.gobierno.palancasVigentes = structuredClone(s.gobierno.palancasObjetivo);
  return s;
}

function applyHeur(state: GameState, baseTax: number): void {
  const lev = state.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(state);
  const dailyPayroll = 21 * ECON_CONSTANTS.salarioBasePublico * (lev.gasto.salarioPublico / 100);
  const deficitAlim = state.alimento.produccionDiaria < state.alimento.consumoDiario * 0.96;

  if (state.alimento.diasStock < 11 || (state.alimento.diasStock < 15 && deficitAlim)) {
    lev.alimento.intercambio = 100;
  } else if (state.alimento.diasStock < 18 && deficitAlim) {
    lev.alimento.intercambio = 60;
  } else {
    lev.alimento.intercambio = 0;
  }

  if (d.hambreCriticaPct > 4 && state.alimento.diasStock >= 4) {
    lev.alimento.racion = 115;
  } else if (state.alimento.diasStock < 3 && deficitAlim) {
    lev.alimento.racion = 85;
  } else {
    lev.alimento.racion = 100;
  }

  if (state.gobierno.reserva < dailyPayroll * 10 || state.ultimaSalidaEconomica.disponibleDiarioEstimado < 0) {
    lev.recaudacion.impuestoUnico = Math.min(36, baseTax + 13);
  } else if (state.gobierno.reserva < dailyPayroll * 15 && lev.alimento.intercambio >= 80) {
    lev.recaudacion.impuestoUnico = Math.min(34, baseTax + 10);
  } else if (d.apoyoPct < 54 || d.descontentosPct > 25) {
    lev.recaudacion.impuestoUnico = Math.max(18, baseTax - 4);
  } else {
    lev.recaudacion.impuestoUnico = baseTax;
  }

  if (d.descontentosPct > 22 || d.apoyoPct < 54) {
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
        Math.min(12, lev.gasto.subsidios[worstGrp] + 2),
        lev.gasto.subsidios[worstGrp]
      );
    }
  }
}

function evalConfig(label: string, p: Params, n = 40) {
  applyParams(p);

  const runBatch = (opts: {
    chaos?: boolean;
    chaosStop?: number;
    drought?: { i: number; d: number; dur: number };
    heur?: boolean;
    recovery?: boolean;
    leverMut?: (s: GameState) => void;
  }) => {
    let wins = 0;
    let imp = 0;
    let r7 = 0;
    let apEnd = 0;
    let satD = 0;
    let ham = 0;
    let prod1 = 0;
    let recOk = 0;
    let recDays = 0;

    for (let seed = 1; seed <= n; seed++) {
      withSeed(seed, () => {
        let baseSeries: number[] | undefined;
        if (opts.recovery) {
          baseSeries = [];
          const sb = makeState(p);
          for (let d = 1; d < 365; d++) {
            stepHeadlessDay(sb);
            baseSeries[sb.reloj.dia] = deriveCommunityStats(sb).apoyoPct;
          }
        }
        const s = makeState(p);
        if (opts.leverMut) {
          opts.leverMut(s);
          s.gobierno.palancasVigentes = structuredClone(s.gobierno.palancasObjetivo);
        }
        const d0 = deriveCommunityStats(s);
        let recDay: number | null = null;
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
          if (opts.heur && s.reloj.dia % 7 === 0) applyHeur(s, p.tax);
          stepHeadlessDay(s);
          if (d === 1) prod1 += s.alimento.produccionDiaria;
          if (d === 7) {
            const f = s.gobierno.finanzas;
            r7 += f.ingresos / Math.max(1, f.nomina + f.pensiones + f.garantiaAlimentaria + f.comprasAlimento);
          }
          if (opts.chaos && (!opts.chaosStop || s.reloj.dia <= opts.chaosStop)) runRandomDirectorDay(s);
          if (opts.recovery && baseSeries && s.reloj.dia >= 180 && s.reloj.dia <= 240 && recDay === null) {
            const ap = deriveCommunityStats(s).apoyoPct;
            if (Math.abs(ap - baseSeries[s.reloj.dia]) <= 3) recDay = s.reloj.dia - 180;
          }
          if (s.gobierno.finanzas.impago) imp++;
          if (s.resultado.estado !== 'jugando') break;
        }
        const de = deriveCommunityStats(s);
        if (s.resultado.estado === 'victoria') wins++;
        apEnd += de.apoyoPct;
        satD += de.satisfaccionMedia - d0.satisfaccionMedia;
        ham += de.hambreCriticaPct;
        if (opts.recovery && recDay !== null) {
          recOk++;
          recDays += recDay;
        }
      });
    }
    return {
      win: Number(((wins / n) * 100).toFixed(1)),
      r7: Number((r7 / n).toFixed(3)),
      prod1: Number((prod1 / n).toFixed(1)),
      ap: Number((apEnd / n).toFixed(1)),
      dSat: Number((satD / n).toFixed(2)),
      ham: Number((ham / n).toFixed(1)),
      imp,
      ...(opts.recovery ? { recPct: Number(((recOk / n) * 100).toFixed(1)), recDays: recOk ? Number((recDays / recOk).toFixed(1)) : -1 } : {}),
    };
  };

  console.log(`\n=== ${label} ===`);
  console.log('B_base:', runBatch({}));
  console.log('Mod_pas:', runBatch({ chaos: true, drought: { i: 60, d: 140, dur: 30 } }));
  console.log('Mod_heur:', runBatch({ chaos: true, drought: { i: 60, d: 140, dur: 30 }, heur: true }));
  console.log('Sev_pas:', runBatch({ chaos: true, drought: { i: 95, d: 140, dur: 90 } }));
  console.log('Sev_heur:', runBatch({ chaos: true, drought: { i: 95, d: 140, dur: 90 }, heur: true }));
  console.log('Rec_180:', runBatch({ chaos: true, chaosStop: 180, recovery: true }));

  // Check 60d sensitivity max delta on key levers
  const eval60 = (mut?: (s: GameState) => void) => {
    let sum = 0;
    for (let seed = 1; seed <= 30; seed++) {
      withSeed(seed, () => {
        const s = makeState(p);
        if (mut) mut(s);
        for (let d = 1; d < 60; d++) stepHeadlessDay(s);
        sum += deriveCommunityStats(s).apoyoPct;
      });
    }
    return sum / 30;
  };
  const b60 = eval60();
  const sens: Record<string, number> = {
    racDn: Number((eval60((s) => { s.gobierno.palancasObjetivo.alimento.racion = 80; }) - b60).toFixed(1)),
    subAgroUp: Number((eval60((s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro += 20; }) - b60).toFixed(1)),
    subAgroDn: Number((eval60((s) => { s.gobierno.palancasObjetivo.gasto.subsidios.agro = 0; }) - b60).toFixed(1)),
    subPubUp: Number((eval60((s) => { s.gobierno.palancasObjetivo.gasto.subsidios.publico = 20; }) - b60).toFixed(1)),
    subIndUp: Number((eval60((s) => { s.gobierno.palancasObjetivo.gasto.subsidios.industria = 20; }) - b60).toFixed(1)),
    taxUp: Number((eval60((s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico += 12; }) - b60).toFixed(1)),
    taxDn: Number((eval60((s) => { s.gobierno.palancasObjetivo.recaudacion.impuestoUnico -= 12; }) - b60).toFixed(1)),
  };
  console.log('Sens60d:', sens);
}

evalConfig('C1_seq0.75_ham4', {
  tax: 22, salBase: 9.5, prodBase: 5.58, costoServ: 0.06, reserva: 4000, stock: 1500,
  coefSeqProd: 0.75, coefSub: 5.5, coefImp: 1.05, coefSatSub: 0.75, topeSatSub: 5,
  coefHambreUp: 4.0, coefHambreDown: 14, agroSub: 9, sinIngSub: 5, prensaShare: 4,
  satRange: [54, 68], lealRange: [44, 66],
});

evalConfig('C2_seq0.80_ham4.5', {
  tax: 22, salBase: 9.5, prodBase: 5.65, costoServ: 0.06, reserva: 4000, stock: 1500,
  coefSeqProd: 0.80, coefSub: 5.0, coefImp: 1.05, coefSatSub: 0.70, topeSatSub: 4.5,
  coefHambreUp: 4.5, coefHambreDown: 14, agroSub: 9, sinIngSub: 5, prensaShare: 4,
  satRange: [54, 68], lealRange: [44, 66],
});
