import { ECON_CONSTANTS, ROLE_CATALOG, SCENARIO_PRESETS } from '../src/data/catalogs';
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

function runRandomDirectorDay(state: GameState, publishPress = true): void {
  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente') {
      const chosen = win.candidatas[Math.floor(Math.random() * win.candidatas.length)];
      resolveConditionWindowWithFallback(state, win.id, chosen?.id, undefined, 'respaldo');
    }
  }
  if (publishPress && state.reloj.dia % 3 === 0 && state.medios.length > 0) {
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

  if (state.gobierno.reserva < 1500 || state.ultimaSalidaEconomica.disponibleDiarioEstimado < 2) {
    lev.gasto.salarioPublico = 82;
    lev.recaudacion.impuestoUnico = Math.min(40, Math.max(baseTax + 13, lev.recaudacion.impuestoUnico + 5));
  } else if (effPub >= 30 || lev.alimento.intercambio > 40) {
    lev.gasto.salarioPublico = 86;
    lev.recaudacion.impuestoUnico = Math.min(38, baseTax + 12);
  } else if (effPub >= 25) {
    lev.gasto.salarioPublico = 92;
    lev.recaudacion.impuestoUnico = Math.min(34, baseTax + 8);
  } else {
    lev.gasto.salarioPublico = 100;
    lev.recaudacion.impuestoUnico = baseTax;
  }
}

function makeState(tax = 23): GameState {
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
  s.clima.fenomenos[1].intensidad = 92;
  s.clima.fenomenos[1].duracionDias = 21;
  s.clima.fenomenos[2].intensidad = 97;
  s.clima.fenomenos[2].duracionDias = 21;
  s.gobierno.palancasObjetivo.recaudacion.impuestoUnico = tax;
  s.gobierno.palancasVigentes.recaudacion.impuestoUnico = tax;
  return s;
}

ECON_CONSTANTS.salarioBasePublico = 9.5;
ECON_CONSTANTS.produccionBaseAgricultor = 5.45;
ECON_CONSTANTS.costoBaseServicioPorPoblacion = 0.06;
ROLE_CATALOG.agricultor.ingreso = [18, 28];
ROLE_CATALOG.obrero.ingreso = [20, 30];
ROLE_CATALOG.comerciante.ingreso = [24, 38];
ROLE_CATALOG.tecnico.ingreso = [30, 44];
ROLE_CATALOG.periodista.ingreso = [20, 30];
SCENARIO_PRESETS.zombies.reservaInicial = 4000;

console.log('=== Criterion E: Sweep movilidadDefensa x atenuacion (n=20 each) ===');
for (const mob of [0, 0.2, 0.4, 0.6]) {
  for (const aten of [0.5, 0.7, 0.9]) {
    ECON_CONSTANTS.movilidadDefensa = mob;
    ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion = aten;
    let wins = 0;
    let totalHits = 0;
    let undefHits = 0;
    let relocSum = 0;
    let relocN = 0;
    const n = 20;
    for (let seed = 1; seed <= n; seed++) {
      withSeed(seed, () => {
        const s = makeState(23);
        const noticeStart: Record<string, number> = {};
        const relocDone: Record<string, boolean> = {};
        for (let d = 1; d < 180; d++) {
          if (s.reloj.dia % 7 === 0) applyZombiesHeuristic(s, 23);
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
          if (s.resultado.estado !== 'jugando') break;
        }
        if (s.resultado.estado === 'victoria') wins++;
      });
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

console.log('=== Criterion H: Peak daily events (mob=0.6, aten=0.7, n=30) ===');
ECON_CONSTANTS.movilidadDefensa = 0.6;
ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion = 0.7;
const eventTypes: SimEvent['tipo'][] = ['ataque', 'golpe', 'muerte', 'internacion', 'alta', 'accion_inicio', 'accion_fin', 'aviso', 'reubicacion', 'defensa'];
const dailyCounts: Record<string, number[]> = Object.fromEntries(eventTypes.map((t) => [t, []]));
const condCounts: Record<string, number> = { huelga: 0, protesta: 0, saqueo: 0 };

for (let seed = 1; seed <= 30; seed++) {
  withSeed(seed, () => {
    const s = makeState(23);
    for (let d = 1; d < 180; d++) {
      if (s.reloj.dia % 7 === 0) applyZombiesHeuristic(s, 23);
      stepHeadlessDay(s);
      runRandomDirectorDay(s, true);
      for (const ev of s.eventosDiaActual) {
        if (ev.tipo === 'accion_inicio' && ev.accion in condCounts) condCounts[ev.accion]++;
      }
      // Plague peak window around horda 2 (days 115..135) or horda 1 (55..75)
      if ((s.reloj.dia >= 55 && s.reloj.dia <= 75) || (s.reloj.dia >= 115 && s.reloj.dia <= 135)) {
        const dayMap: Record<string, number> = {};
        for (const ev of s.eventosDiaActual) dayMap[ev.tipo] = (dayMap[ev.tipo] || 0) + 1;
        for (const t of eventTypes) dailyCounts[t].push(dayMap[t] || 0);
      }
      if (s.resultado.estado !== 'jugando') break;
    }
  });
}

for (const t of eventTypes) {
  const arr = [...dailyCounts[t]].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))] ?? 0;
  console.log('Event', t, { mean: Number(mean.toFixed(2)), p95 });
}
console.log('CondTriggersTotal30Seeds', condCounts);
