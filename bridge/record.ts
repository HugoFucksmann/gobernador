// Exporta una partida grabada (.jsonl) sin interfaz: estado diario y eventos, listos para que Godot la reproduzca sin motor
// (UI §9: sirve para probar la vista y el rendimiento con 1.000 NPCs).
// Uso: npm run record -- --escenario elecciones --dias 120 --npcs 1000 --semilla 1 --salida recordings/prueba_1000.jsonl [--decisiones]
import fs from 'node:fs';
import path from 'node:path';
import { SCENARIO_PRESETS } from '../src/data/catalogs';
import { DEFAULT_WORLD_CONFIG } from '../src/engine/policies';
import {
  deriveCommunityStats,
  orderBuildInParcela,
  respondToDemand,
  stepSimulation,
  TICKS_PER_DAY,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import { buildHello, npcMeta, projectEvent, projectState } from './project';
import type { BuildingType, WorldConfig } from '../src/types/game';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const esc = arg('escenario', 'elecciones') === 'zombies' ? 'zombies' : 'elecciones';
const dias = Number(arg('dias', '120'));
const npcs = Number(arg('npcs', '100'));
const semilla = Number(arg('semilla', '1'));
const salida = arg('salida', `recordings/${esc}_${npcs}npc_${dias}d.jsonl`);
const decisiones = process.argv.includes('--decisiones');

const preset = SCENARIO_PRESETS[esc];
const cfg: WorldConfig = {
  ...structuredClone(DEFAULT_WORLD_CONFIG),
  escenarioId: esc,
  economiaModulo: preset.economiaDefault,
  poblacionInicial: npcs,
  cantidadMedios: preset.mediosDefault,
  semilla,
  caos: structuredClone(preset.caosDefault),
  usarIaGemini: false,
};
let state = createInitialGameState(cfg);

fs.mkdirSync(path.dirname(salida), { recursive: true });
const out = fs.createWriteStream(salida);
const w = (m: unknown) => out.write(JSON.stringify(m) + '\n');
w(buildHello({ grabacion: true }));
w({ t: 'npcs_meta', lista: npcMeta(state) });

let seq = 0;
const seen = new Set<string>();
const ctx = () => ({ seq: ++seq, pausado: false, vel: 1, devMode: true, focoNpc: null, simMs: 0, ia: { activa: false, ocupada: false, disponible: false } });

function frame(simMs: number) {
  const derived = deriveCommunityStats(state);
  const evs: unknown[] = [];
  for (const ev of state.eventos) {
    if (seen.has(ev.id)) break;
    evs.push(projectEvent(ev, state));
  }
  for (const e of evs as { id: string }[]) seen.add(e.id);
  if (evs.length > 0) w({ t: 'events', dia: state.reloj.dia, lista: evs.reverse() });
  const c = ctx();
  c.simMs = simMs;
  w(projectState(state, derived, c));
}

// Decisiones de ejemplo para que la grabación tenga cosas que ver (construir, responder demandas)
const buildPlan: Array<[number, string, BuildingType]> = [
  [3, 'p_centro_libre', 'comisaria'], [10, 'p_sur_libre', 'hospital'], [30, 'p_norte_libre', 'silo'], [45, 'p_oeste_libre', 'muralla'], [60, 'p_este_libre', 'hospital_campana'],
];

frame(0);
let worst = 0, total = 0;
for (let d = 0; d < dias && state.resultado.estado === 'jugando'; d++) {
  if (decisiones) {
    for (const [day, pid, tipo] of buildPlan) if (state.reloj.dia === day) orderBuildInParcela(state, pid, tipo);
    for (const dem of [...state.demandasActivas]) if (dem.diasRestantes <= 3) respondToDemand(state, dem.id, state.reloj.dia % 2 === 0);
  }
  const t0 = performance.now();
  state = stepSimulation(state, TICKS_PER_DAY);
  const ms = performance.now() - t0;
  worst = Math.max(worst, ms); total += ms;
  frame(ms);
}
out.end();
console.log(JSON.stringify({ salida, dias: state.reloj.dia, npcs, resultado: state.resultado.estado, msPorDiaPromedio: Number((total / Math.max(1, state.reloj.dia)).toFixed(1)), msPeorDia: Number(worst.toFixed(1)) }));
