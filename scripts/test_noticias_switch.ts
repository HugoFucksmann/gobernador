// Prueba pendiente de CAOS_PRENSA §10: interruptor noticias_mueven_satisfaccion.
// Regla: se activa si la prensa no se siente; se apaga si duplica el efecto del hambre o del precio.
import { PRESS_CONSTANTS, SCENARIO_PRESETS } from '../src/data/catalogs';
import { DEFAULT_WORLD_CONFIG } from '../src/engine/policies';
import { deriveCommunityStats, stepSimulation, TICKS_PER_DAY } from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';

function run(seed: number, on: boolean, garantia: number, dias = 120) {
  (PRESS_CONSTANTS as { noticiasMuevenSatisfaccion: boolean }).noticiasMuevenSatisfaccion = on;
  const p = SCENARIO_PRESETS.elecciones;
  let s = createInitialGameState({ ...structuredClone(DEFAULT_WORLD_CONFIG), escenarioId: 'elecciones', economiaModulo: 'base', nivelMundo: 'M1', nivelGobernador: 'G2', poblacionInicial: 100, cantidadMedios: 2, semilla: seed, caos: structuredClone(p.caosDefault), usarIaGemini: false } as never);
  s.gobierno.palancasObjetivo.garantiaAlimentaria = garantia;
  s.gobierno.palancasObjetivo.precioMaximo = 'libre';
  // una sequía fuerte para que haya hambre y noticias alarmistas
  s.clima.fenomenos.push({ id: 'seq_test', tipo: 'sequia', nombre: 'Sequía de prueba', intensidad: 80, inicioDia: 20, duracionDias: 60, avisoDias: 5 } as never);
  let sat = 0, n = 0;
  for (let d = 0; d < dias && s.resultado.estado === 'jugando'; d++) {
    s = stepSimulation(s, TICKS_PER_DAY);
    if (d >= 20) { sat += deriveCommunityStats(s).satisfaccionMedia; n++; }
  }
  const dv = deriveCommunityStats(s);
  return { sat: sat / Math.max(1, n), hambre: dv.hambreCriticaPct, miedo: s.npcs.filter((x) => x.vivo).reduce((a, x) => a + x.variables.miedo, 0) / Math.max(1, dv.vivos) };
}
const seeds = [1, 2, 3, 4, 5, 6];
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const off = seeds.map((sd) => run(sd, false, 85));
const on = seeds.map((sd) => run(sd, true, 85));
const hungerOff = seeds.map((sd) => run(sd, false, 0));
const dNews = avg(on.map((r) => r.sat)) - avg(off.map((r) => r.sat));
const dHunger = avg(hungerOff.map((r) => r.sat)) - avg(off.map((r) => r.sat));
console.log(JSON.stringify({
  satSinInterruptor: Number(avg(off.map((r) => r.sat)).toFixed(2)),
  satConInterruptor: Number(avg(on.map((r) => r.sat)).toFixed(2)),
  efectoNoticiasSobreSatisfaccion: Number(dNews.toFixed(2)),
  satSinGarantia: Number(avg(hungerOff.map((r) => r.sat)).toFixed(2)),
  efectoHambreSobreSatisfaccion: Number(dHunger.toFixed(2)),
  razon: Number((Math.abs(dNews) / Math.max(0.01, Math.abs(dHunger))).toFixed(2)),
}, null, 1));
