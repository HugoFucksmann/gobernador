import { ECON_CONSTANTS, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
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
import { GameState, SimEvent, WorldConfig } from '../src/types/game';

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
  if (state.reloj.dia % 3 === 0 && state.medios.length > 0) {
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
          const chosen = candidatas[Math.floor(Math.random() * candidatas.length)];
          applyActionToNpc(state, npc, chosen, pickActionText(chosen, npc.nombre), 'motor');
          state.caosTracker.accionesEnVentana += 1;
        }
      }
    }
  }
}

ECON_CONSTANTS.salarioBasePublico = 9.5;
ECON_CONSTANTS.produccionBaseAgricultor = 5.6;
ECON_CONSTANTS.costoBaseServicioPorPoblacion = 0.06;
ECON_CONSTANTS.coefSubsidioSimple = 5.5;
ECON_CONSTANTS.coefImpuestoSimple = 1.05;
ECON_CONSTANTS.coefSatisfaccionSubsidioSimple = 0.75;
ECON_CONSTANTS.topeSatisfaccionSubsidioSimple = 5;
ECON_CONSTANTS.coefHambreSubida = 4.0;
ROLE_CATALOG.agricultor.ingreso = [18, 28];
ROLE_CATALOG.obrero.ingreso = [20, 30];
ROLE_CATALOG.comerciante.ingreso = [24, 38];
ROLE_CATALOG.tecnico.ingreso = [30, 44];
ROLE_CATALOG.periodista.ingreso = [20, 30];
SCENARIO_PRESETS.zombies.reservaInicial = 4000;
SCENARIO_PRESETS.zombies.stockAlimentoInicial = 1600;
SCENARIO_PRESETS.zombies.cuposIniciales = {
  policia: 5,
  estatal: 4,
  docente: 3,
  medico: 5,
  ingeniero: 3,
};

function makeZState(opts: { tax?: number; pressShare?: number; noPlague?: boolean; h1Int?: number; h2Int?: number; hDur?: number; medicos?: number } = {}): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'zombies',
    economiaModulo: 'simple',
    cantidadMedios: 2,
    poblacionInicial: 100,
    caos: { ...SCENARIO_PRESETS.zombies.caosDefault },
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 99999;
  if (opts.noPlague) {
    s.clima.fenomenos = [];
  } else {
    s.clima.fenomenos[1].intensidad = opts.h1Int ?? 88;
    s.clima.fenomenos[1].duracionDias = opts.hDur ?? 18;
    s.clima.fenomenos[2].intensidad = opts.h2Int ?? 95;
    s.clima.fenomenos[2].duracionDias = opts.hDur ?? 20;
  }
  const tax = opts.tax ?? 22;
  s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = tax;
  s.gobierno.palancasObjetivo.gasto.presupuesto = {
    salud: 18,
    seguridad: 22,
    infraestructura: 14,
    educacion: 10,
  };
  s.gobierno.palancasObjetivo.gasto.prensa = opts.pressShare ?? 12;
  s.gobierno.palancasObjetivo.gasto.subsidios = {
    agro: 6,
    industria: 0,
    comercio: 0,
    publico: 0,
    sin_ingreso: 4,
  };
  if (opts.medicos !== undefined) {
    s.gobierno.palancasObjetivo.cupos.medico = opts.medicos;
  }
  s.gobierno.palancasVigentes = structuredClone(s.gobierno.palancasObjetivo);
  return s;
}

function applyZHeur(s: GameState, baseTax: number, pressShare = 12) {
  const lev = s.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(s);
  const maxInt = s.clima.fenomenos
    .filter((f) => f.tipo === 'plaga_zombie' && s.reloj.dia >= f.inicioDia - (f.avisoDias ?? 0))
    .reduce((m, f) => Math.max(m, f.intensidad), 0);

  lev.cupos.policia = maxInt >= 55 ? 15 : maxInt >= 25 ? 12 : 9;
  lev.cupos.medico = d.hospitalOcupacionPct > 80 || maxInt >= 65 ? 9 : maxInt >= 35 ? 7 : 6;
  lev.gasto.presupuesto.seguridad = maxInt >= 40 ? 40 : 32;
  lev.gasto.presupuesto.salud = d.hospitalOcupacionPct > 65 || maxInt >= 35 ? 28 : 22;
  lev.gasto.presupuesto.infraestructura = 10;
  lev.gasto.presupuesto.educacion = 5;
  lev.gasto.prensa = pressShare;

  if ((s.alimento.diasStock < 14 && s.alimento.produccionDiaria < s.alimento.consumoDiario) || s.alimento.diasStock < 9) {
    lev.alimento.intercambio = 100;
  } else {
    lev.alimento.intercambio = 0;
  }

  const pubCount = Math.max(
    d.roles.policia + d.roles.estatal + d.roles.docente + d.roles.medico + d.roles.ingeniero,
    lev.cupos.policia + lev.cupos.estatal + lev.cupos.docente + lev.cupos.medico + lev.cupos.ingeniero
  );
  if (s.gobierno.reserva < 1500 || s.ultimaSalidaEconomica.disponibleDiarioEstimado < 2) {
    lev.gasto.salarioPublico = 84;
    lev.recaudacion.impuestoUnico = Math.min(40, baseTax + 15);
  } else if (pubCount >= 30 || lev.alimento.intercambio > 40) {
    lev.gasto.salarioPublico = 88;
    lev.recaudacion.impuestoUnico = Math.min(38, baseTax + 13);
  } else if (pubCount >= 24) {
    lev.gasto.salarioPublico = 94;
    lev.recaudacion.impuestoUnico = Math.min(34, baseTax + 9);
  } else {
    lev.gasto.salarioPublico = 100;
    lev.recaudacion.impuestoUnico = baseTax;
  }
}

function runZ(label: string, n: number, opts: { noPlague?: boolean; heur?: boolean; pressShare?: number; mob?: number; aten?: number; h1Int?: number; h2Int?: number; hDur?: number; medicos?: number } = {}) {
  ECON_CONSTANTS.movilidadDefensa = opts.mob ?? 0.6;
  ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion = opts.aten ?? 0.7;
  let wins = 0;
  let imp = 0;
  let r7 = 0;
  let popSum = 0;
  let hamSum = 0;
  let peakOccSum = 0;
  let deathsTotal = 0;
  let deathsWaiting = 0;
  let totalHits = 0;
  let undefHits = 0;

  for (let seed = 1; seed <= n; seed++) {
    withSeed(seed, () => {
      const s = makeZState({
        tax: 22,
        pressShare: opts.pressShare ?? 12,
        noPlague: opts.noPlague,
        h1Int: opts.h1Int,
        h2Int: opts.h2Int,
        hDur: opts.hDur,
        medicos: opts.medicos,
      });
      let peakOcc = 0;
      for (let d = 1; d < 180; d++) {
        if (opts.heur && s.reloj.dia % 7 === 0) applyZHeur(s, 22, opts.pressShare ?? 12);
        stepHeadlessDay(s);
        runRandomDirectorDay(s);
        if (d === 7) {
          const f = s.gobierno.finanzas;
          r7 += f.ingresos / Math.max(1, f.nomina + f.pensiones + f.garantiaAlimentaria + f.comprasAlimento);
        }
        if (s.gobierno.finanzas.impago) imp++;
        const st = deriveCommunityStats(s);
        if (st.hospitalOcupacionPct > peakOcc) peakOcc = st.hospitalOcupacionPct;
        for (const ev of s.eventosDiaActual) {
          if (ev.tipo === 'muerte') {
            deathsTotal++;
            if (ev.esperandoCama) deathsWaiting++;
          }
          if (ev.tipo === 'golpe') {
            totalHits++;
            if ((st.defensa[ev.zona] ?? 0) < 35) undefHits++;
          }
        }
        if (s.resultado.estado !== 'jugando') break;
      }
      const de = deriveCommunityStats(s);
      if (s.resultado.estado === 'victoria') wins++;
      popSum += de.poblacion;
      hamSum += de.hambreCriticaPct;
      peakOccSum += peakOcc;
    });
  }
  console.log(label, {
    winPct: Number(((wins / n) * 100).toFixed(1)),
    r7: Number((r7 / n).toFixed(3)),
    pop: Number((popSum / n).toFixed(1)),
    ham: Number((hamSum / n).toFixed(2)),
    imp,
    peakOcc: Number((peakOccSum / n).toFixed(1)),
    waitDeathPct: deathsTotal ? Number(((deathsWaiting / deathsTotal) * 100).toFixed(1)) : 0,
    undefHitPct: totalHits ? Number(((undefHits / totalHits) * 100).toFixed(1)) : 0,
  });
}

runZ('A_no_plague', 25, { noPlague: true });
runZ('B_passive_mob0.6_aten0.7', 30, { mob: 0.6, aten: 0.7 });
runZ('C_heur_mob0.6_aten0.7_press12', 30, { heur: true, pressShare: 12, mob: 0.6, aten: 0.7 });
runZ('D_heur_mob0.6_aten0.7_press0', 30, { heur: true, pressShare: 0, mob: 0.6, aten: 0.7 });
runZ('B_passive_mob0.4_aten0.7', 30, { mob: 0.4, aten: 0.7 });
runZ('C_heur_mob0.4_aten0.7_press12', 30, { heur: true, pressShare: 12, mob: 0.4, aten: 0.7 });
runZ('D_heur_mob0.4_aten0.7_press0', 30, { heur: true, pressShare: 0, mob: 0.4, aten: 0.7 });
