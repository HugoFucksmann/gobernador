import { ECON_CONSTANTS, SCENARIO_PRESETS } from '../src/data/catalogs';
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
import { GameState, SimEvent, TaxableGroupId, WorldConfig } from '../src/types/game';

function runRandomDirectorDay(state: GameState, publishPress = true): void {
  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente') {
      const chosen = win.candidatas[Math.floor(nextRand(state) * win.candidatas.length)];
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, 'motor');
    }
  }
  if (publishPress && state.reloj.dia % 3 === 0 && state.medios.length > 0) {
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

function applyZombiesHeuristic(state: GameState, baseTax: number): void {
  const lev = state.gobierno.palancasObjetivo;
  const d = deriveCommunityStats(state);
  const maxIntensity = state.clima.fenomenos
    .filter((f) => f.tipo === 'plaga_zombie' && state.reloj.dia >= f.inicioDia - (f.avisoDias ?? 0))
    .reduce((m, f) => Math.max(m, f.intensidad), 0);

  const targetPolice = maxIntensity >= 55 ? 14 : maxIntensity >= 25 ? 11 : 9;
  const targetMedico = d.hospitalOcupacionPct > 85 || maxIntensity >= 65 ? 9 : maxIntensity >= 35 ? 7 : 6;
  lev.cupos.policia = Math.min(15, targetPolice);
  lev.cupos.medico = Math.min(10, targetMedico);

  lev.gasto.presupuesto.seguridad = maxIntensity >= 40 ? 40 : 32;
  lev.gasto.presupuesto.salud = d.hospitalOcupacionPct > 70 || maxIntensity >= 35 ? 30 : 22;
  lev.gasto.presupuesto.infraestructura = 12;
  lev.gasto.presupuesto.educacion = 6;
  lev.gasto.prensa = lev.gasto.prensa > 0 ? Math.min(12, Math.max(8, lev.gasto.prensa)) : 0;

  if ((state.alimento.diasStock < 15 && state.alimento.produccionDiaria < state.alimento.consumoDiario) || state.alimento.diasStock < 10) {
    lev.alimento.intercambio = 100;
  } else {
    lev.alimento.intercambio = 0;
  }

  const publicHeadcount =
    d.roles.policia + d.roles.estatal + d.roles.docente + d.roles.medico + d.roles.ingeniero;
  const targetPublic =
    lev.cupos.policia + lev.cupos.estatal + lev.cupos.docente + lev.cupos.medico + lev.cupos.ingeniero;
  const effPub = Math.max(publicHeadcount, targetPublic);

  const setTax = (v: number) => {
    (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
      lev.recaudacion.impuestoGrupo[g] = v;
    });
  };

  if (state.gobierno.reserva < 1500 || state.ultimaSalidaEconomica.disponibleDiarioEstimado < 2) {
    lev.gasto.salarioPublico = 84;
    setTax(Math.min(40, baseTax + 4));
  } else if (effPub >= 30 || lev.alimento.intercambio > 40) {
    lev.gasto.salarioPublico = 90;
    setTax(Math.min(40, baseTax + 3));
  } else if (effPub >= 25) {
    lev.gasto.salarioPublico = 94;
    setTax(Math.min(39, baseTax + 2));
  } else {
    lev.gasto.salarioPublico = 100;
    setTax(baseTax);
  }
}

function makeState(tax = 37, seed = 1): GameState {
  const cfg: WorldConfig = {
    escenarioId: 'zombies',
    economiaModulo: 'base',
    cantidadMedios: 2,
    poblacionInicial: 100,
    caos: { ...SCENARIO_PRESETS.zombies.caosDefault },
    disturbiosActivos: false,
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 99999;
  if (s.clima.fenomenos[1]) {
    s.clima.fenomenos[1].intensidad = 92;
    s.clima.fenomenos[1].duracionDias = 21;
  }
  if (s.clima.fenomenos[2]) {
    s.clima.fenomenos[2].intensidad = 97;
    s.clima.fenomenos[2].duracionDias = 21;
  }
  (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
    s.gobierno.palancasObjetivo.recaudacion.impuestoGrupo[g] = tax;
    s.gobierno.palancasVigentes.recaudacion.impuestoGrupo[g] = tax;
    s.gobierno.palancasInicioPeriodo.recaudacion.impuestoGrupo[g] = tax;
  });
  return s;
}

console.log('=== Criterion E: Sweep movilidadDefensa x atenuacion (n=15 each) ===');
for (const mob of [0.2, 0.4, 0.6]) {
  for (const aten of [0.5, 0.7, 0.9]) {
    ECON_CONSTANTS.movilidadDefensa = mob;
    ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion = aten;
    let wins = 0;
    let totalHits = 0;
    let undefHits = 0;
    let relocSum = 0;
    let relocN = 0;
    const n = 15;
    for (let seed = 1; seed <= n; seed++) {
      const s = makeState(37, seed);
      const noticeStart: Record<string, number> = {};
      const relocDone: Record<string, boolean> = {};
      for (let d = 1; d < 180; d++) {
        if (s.reloj.dia % 7 === 0) applyZombiesHeuristic(s, 37);
        stepHeadlessDay(s);
        runRandomDirectorDay(s, true);
        const st = deriveCommunityStats(s);
        for (const ev of s.eventosDiaActual) {
          if (ev.tipo === 'aviso' && ev.zona !== 'este') {
            noticeStart[ev.zona] = s.reloj.dia;
          }
          if (ev.tipo === 'reubicacion' && noticeStart[ev.aZona] && !relocDone[ev.aZona]) {
            relocDone[ev.aZona] = true;
            relocSum += s.reloj.dia - noticeStart[ev.aZona];
            relocN++;
          }
          if (ev.tipo === 'golpe') {
            totalHits++;
            if ((st.defensa[ev.zona] ?? 0) < 35) undefHits++;
          }
        }
        if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) break;
      }
      if (s.resultado.victoriaCumplida || s.resultado.estado === 'victoria') wins++;
    }
    console.log({
      mob,
      aten,
      winPct: Number(((wins / n) * 100).toFixed(1)),
      undefHitPct: totalHits > 0 ? Number(((undefHits / totalHits) * 100).toFixed(1)) : 0,
      meanRelocDays: relocN > 0 ? Number((relocSum / relocN).toFixed(2)) : -1,
    });
  }
}

console.log('=== Criterion H: Peak daily events (mob=0.4, aten=0.7, n=20) ===');
ECON_CONSTANTS.movilidadDefensa = 0.4;
ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion = 0.7;
const eventTypes: SimEvent['tipo'][] = ['ataque', 'golpe', 'muerte', 'internacion', 'alta', 'accion_inicio', 'accion_fin', 'aviso', 'reubicacion', 'defensa'];
const dailyCounts: Record<string, number[]> = Object.fromEntries(eventTypes.map((t) => [t, []]));
const condCounts: Record<string, number> = { huelga: 0, protesta: 0, saqueo: 0, disturbios: 0 };

for (let seed = 1; seed <= 20; seed++) {
  const s = makeState(37, seed);
  for (let d = 1; d < 180; d++) {
    if (s.reloj.dia % 7 === 0) applyZombiesHeuristic(s, 37);
    stepHeadlessDay(s);
    runRandomDirectorDay(s, true);
    for (const ev of s.eventosDiaActual) {
      if (ev.tipo === 'accion_inicio' && ev.accion in condCounts) condCounts[ev.accion]++;
    }
    if ((s.reloj.dia >= 55 && s.reloj.dia <= 75) || (s.reloj.dia >= 115 && s.reloj.dia <= 135)) {
      const dayMap: Record<string, number> = {};
      for (const ev of s.eventosDiaActual) dayMap[ev.tipo] = (dayMap[ev.tipo] || 0) + 1;
      for (const t of eventTypes) dailyCounts[t].push(dayMap[t] || 0);
    }
    if (s.resultado.estado !== 'jugando' || s.resultado.victoriaCumplida) break;
  }
}

for (const t of eventTypes) {
  const arr = [...dailyCounts[t]].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] ?? 0;
  console.log('Event', t, { mean: Number(mean.toFixed(2)), p95 });
}
console.log('CondTriggersTotal20Seeds', condCounts);
