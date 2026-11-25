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
import { GameState, RoleGroupId, TaxableGroupId, WorldConfig } from '../src/types/game';

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

interface Params {
  tax: number;
  salBase: number;
  prodBase: number;
  costoServ: number;
  reserva: number;
  stock: number;
  coefSeqProd: number;
  agroSub: number;
  sinIngSub: number;
  prensaShare: number;
}

function applyParams(p: Params) {
  ECON_CONSTANTS.salarioBasePublico = p.salBase;
  ECON_CONSTANTS.produccionBaseAgricultor = p.prodBase;
  ECON_CONSTANTS.costoBaseServicioPorPoblacion = p.costoServ;
  ECON_CONSTANTS.coefSequiaProduccion = p.coefSeqProd;
  SCENARIO_PRESETS.elecciones.reservaInicial = p.reserva;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = p.stock;
}

function makeState(p: Params, seed: number): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'base',
    cantidadMedios: 2,
    poblacionInicial: 100,
    caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
    disturbiosActivos: false,
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 99999;
  (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
    s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo[g] = p.tax;
  });
  s.gobierno.palancasObjetivo.gasto.presupuesto = {
    salud: 20,
    seguridad: 15,
    infraestructura: 18,
    educacion: 15,
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
  s.gobierno.palancasInicioPeriodo = structuredClone(s.gobierno.palancasObjetivo);
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

  lev.alimento.garantiaAlimentaria = d.hambreCriticaPct > 4 ? 100 : 85;
  lev.alimento.precioMaximo =
    state.alimento.precioMercado > ECON_CONSTANTS.precioBaseAlimento * 1.35 ? 135 : 250;

  const setTax = (v: number) => {
    (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
      lev.recaudacion.impuestoGrupo[g] = v;
    });
  };

  if (state.gobierno.reserva < dailyPayroll * 10 || state.ultimaSalidaEconomica.disponibleDiarioEstimado < 0) {
    setTax(Math.min(36, baseTax + 10));
  } else if (state.gobierno.reserva < dailyPayroll * 15 && lev.alimento.intercambio >= 80) {
    setTax(Math.min(34, baseTax + 8));
  } else if (d.apoyoPct < 54 || d.descontentosPct > 25) {
    setTax(Math.max(18, baseTax - 4));
  } else {
    setTax(baseTax);
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

function evalConfig(label: string, p: Params, n = 25) {
  applyParams(p);

  const runBatch = (opts: {
    chaos?: boolean;
    chaosStop?: number;
    drought?: { i: number; d: number; dur: number };
    heur?: boolean;
    recovery?: boolean;
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
      let baseSeries: number[] | undefined;
      if (opts.recovery) {
        baseSeries = [];
        const sb = makeState(p, seed);
        for (let d = 1; d < 365; d++) {
          stepHeadlessDay(sb);
          baseSeries[sb.reloj.dia] = deriveCommunityStats(sb).apoyoPct;
        }
      }
      const s = makeState(p, seed);
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
}

evalConfig('Base_Default', {
  tax: 24,
  salBase: ECON_CONSTANTS.salarioBasePublico,
  prodBase: ECON_CONSTANTS.produccionBaseAgricultor,
  costoServ: ECON_CONSTANTS.costoBaseServicioPorPoblacion,
  reserva: 4000,
  stock: 1600,
  coefSeqProd: ECON_CONSTANTS.coefSequiaProduccion,
  agroSub: 5,
  sinIngSub: 5,
  prensaShare: 5,
});
