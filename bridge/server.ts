// Servidor local del motor para la UI en Godot (UI §9, fase 1).
// Godot lanza este proceso al abrir y lo cierra al salir. Habla JSON por websocket:
//   motor → UI : hello, state (cada día y tras cada orden), reloj (cada tick), events, ficha, por_que, previa, ack, saves
//   UI → motor : { t:'cmd', id, c:'<comando>', ...args }  (CONTROLES §2 y §3 + pausa/velocidad/partida/guardado/dev)
// Uso: node bridge/server.js --puerto 0 --guardados <dir> [--salir-sin-clientes]
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { LEVER_BOUNDS, SCENARIO_PRESETS } from '../src/data/catalogs';
import { GameController } from '../src/engine/gameController';
import { DEFAULT_WORLD_CONFIG, estimatePeriodBudget } from '../src/engine/policies';
import { buildCausalChain, EXTRA_LEVER_BOUNDS, ensureExtras, estimateExtrasCost, forceDemandForDev, TICKS_PER_DAY } from '../src/engine/simulation';
import * as proj from './project';
import { createFileStorage } from './storage';

function argOf(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const PORT = Number(argOf('puerto', '0'));
const SAVES_DIR = path.resolve(argOf('guardados', path.join(process.cwd(), 'saves'))!);
const REC_DIR = path.resolve(argOf('grabaciones', path.join(SAVES_DIR, '..', 'recordings'))!);
const EXIT_WHEN_EMPTY = process.argv.includes('--salir-sin-clientes');

type Cmd = Record<string, unknown> & { t: 'cmd'; id?: number | string; c: string };

const controller = new GameController(structuredClone(DEFAULT_WORLD_CONFIG), {
  storage: createFileStorage(SAVES_DIR),
});
controller.setPaused(true);
controller.start();

let seq = 0;
let focoNpc: string | null = null;
let lastHead = '';
let lastDay = -1;
let lastRosterSig = '';
const clients = new Set<WebSocket>();
let everConnected = false;

// ───────── Grabación (partidas grabadas, UI §9) ─────────
let recStream: fs.WriteStream | null = null;
let recPath = '';
function recWrite(msg: unknown) {
  if (recStream) recStream.write(JSON.stringify(msg) + '\n');
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: unknown) {
  const raw = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(raw);
}

function ctx() {
  const snap = controller.getSnapshot();
  return {
    seq: ++seq,
    pausado: snap.paused,
    vel: snap.speed,
    devMode: snap.devMode,
    focoNpc,
    simMs: snap.simStepMs,
    ia: { activa: snap.state.config.usarIaGemini, ocupada: snap.aiBusy, disponible: snap.aiAvailable },
  };
}

function saveSlots() {
  const s = controller.getSnapshot();
  return { t: 'saves', manual: s.manualSaveMeta, auto: s.autoSaveMeta };
}

const seenEvents = new Map<string, number>();
function newEvents(): unknown[] {
  const st = controller.getState();
  const out: unknown[] = [];
  for (const ev of st.eventos) {
    if (seenEvents.has(ev.id)) break;
    out.push(proj.projectEvent(ev, st));
  }
  for (const e of out as { id: string; dia: number }[]) seenEvents.set(e.id, e.dia);
  if (seenEvents.size > 6000) {
    const cutoff = st.reloj.dia - 3;
    for (const [id, d] of seenEvents) if (d < cutoff) seenEvents.delete(id);
  }
  return out.reverse(); // cronológico
}

function rosterSig(): string {
  const st = controller.getState();
  return `${st.semilla}|${st.npcs.length}|${st.npcs[0]?.id}|${st.npcs[st.npcs.length - 1]?.id}`;
}

function sendNpcMeta(ws?: WebSocket) {
  const msg = { t: 'npcs_meta', lista: proj.npcMeta(controller.getState()) };
  if (ws) send(ws, msg);
  else {
    broadcast(msg);
    recWrite(msg);
  }
}

function pushState(only?: WebSocket, withEvents = true) {
  const snap = controller.getSnapshot();
  if (!only && rosterSig() !== lastRosterSig) {
    lastRosterSig = rosterSig();
    seenEvents.clear();
    sendNpcMeta();
  }
  const state = proj.projectState(snap.state, snap.derived, ctx());
  if (only) {
    send(only, state);
    return;
  }
  if (withEvents) {
    const evs = newEvents();
    if (evs.length > 0) {
      const m = { t: 'events', dia: snap.state.reloj.dia, lista: evs };
      broadcast(m);
      recWrite(m);
    }
  }
  broadcast(state);
  recWrite(state);
  lastHead = snap.state.eventos[0]?.id ?? '';
  lastDay = snap.state.reloj.dia;
}

let lastClockSent = 0;
controller.subscribe(() => {
  const snap = controller.getSnapshot();
  const st = snap.state;
  const head = st.eventos[0]?.id ?? '';
  const dayChanged = st.reloj.dia !== lastDay;
  if (dayChanged || head !== lastHead) {
    pushState();
    return;
  }
  const now = Date.now();
  if (now - lastClockSent >= 90) {
    lastClockSent = now;
    broadcast({
      t: 'reloj', dia: st.reloj.dia, tick: st.reloj.tick, ticksPorDia: TICKS_PER_DAY,
      pausado: snap.paused, vel: snap.speed, simMs: snap.simStepMs, dev: snap.devMode,
    });
  }
});

// ───────── Comandos ─────────
function ack(ws: WebSocket, cmd: Cmd, ok: boolean, extra: Record<string, unknown> = {}) {
  send(ws, { t: 'ack', id: cmd.id ?? null, c: cmd.c, ok, ...extra });
}

function clampLever(key: string, value: unknown): number | string | undefined {
  const b = (LEVER_BOUNDS as Record<string, { min: number; max: number; step: number }>)[key];
  if (key === 'precioMaximo') return ['libre', 'moderado', 'estricto'].includes(String(value)) ? String(value) : undefined;
  if (key === 'nivelObras') return Math.min(5, Math.max(0, Math.round(Number(value))));
  if (key === 'comercioExterior') return [-100, -50, 0, 50, 100].includes(Number(value)) ? Number(value) : undefined;
  if (!b) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(b.max, Math.max(b.min, Math.round(n / b.step) * b.step));
}

function pickNpcRef(npcId: string): string | undefined {
  const npc = controller.getState().npcs.find((n) => n.id === npcId);
  if (!npc) return undefined;
  if (npc.ultimoGolpeCausaId) return npc.ultimoGolpeCausaId;
  if (npc.accionIa?.causa) return npc.accionIa.causa;
  const mod = npc.modificadores.find((m) => m.causa);
  return mod?.causa;
}

function handle(ws: WebSocket, cmd: Cmd) {
  const st = controller.getState();
  const replyResult = (
    r: { ok: boolean; error?: string },
    extra: Record<string, unknown> = {},
    includeEvents = true
  ) => {
    if (r.ok) pushState(undefined, includeEvents);
    return ack(ws, cmd, r.ok, { error: r.error, ...extra });
  };
  switch (cmd.c) {
    case 'ping': return ack(ws, cmd, true, { dia: st.reloj.dia });
    case 'pausa': controller.setPaused(Boolean(cmd.valor ?? true)); return ack(ws, cmd, true);
    case 'reanudar': controller.setPaused(false); return ack(ws, cmd, true);
    case 'velocidad': controller.setSpeed(Number(cmd.v ?? 1)); return ack(ws, cmd, true, { vel: controller.getSnapshot().speed });
    case 'paso_dia': controller.stepDay(); return ack(ws, cmd, true);
    case 'dev_modo': controller.setDevMode(Boolean(cmd.valor)); pushState(); return ack(ws, cmd, true);
    case 'dev_poblacion': controller.setDevPopulation(Number(cmd.n)); pushState(); return ack(ws, cmd, true);
    case 'dev_complejidad':
      controller.setDevComplexity(String(cmd.mundo ?? 'M1') as never, String(cmd.gobernador ?? 'G2') as never);
      pushState(); return ack(ws, cmd, true);
    case 'dev_fenomeno':
      controller.forceClimatePhenomenon(String(cmd.tipo) as never, String(cmd.zona ?? 'este') as never);
      pushState(); return ack(ws, cmd, true);
    case 'dev_demanda': {
      const r = controller.mutateForDev((s) => forceDemandForDev(s, String(cmd.demanda ?? 'bajen_impuestos')));
      pushState(); return ack(ws, cmd, r.ok, { error: r.error });
    }
    case 'palanca': {
      const key = String(cmd.clave);
      const v = clampLever(key, cmd.valor);
      if (v === undefined) return ack(ws, cmd, false, { error: 'Palanca o valor inválido.' });
      controller.updateLevers((prev) => ({ ...prev, [key]: v }) as never);
      pushState(undefined, false);
      return ack(ws, cmd, true, { valor: v });
    }
    case 'previa_palanca': {
      const key = String(cmd.clave);
      const v = clampLever(key, cmd.valor);
      if (v === undefined) return ack(ws, cmd, false, { error: 'Valor inválido.' });
      const levers = { ...st.gobierno.palancasObjetivo, [key]: v } as never;
      const base = estimatePeriodBudget(st, st.gobierno.palancasVigentes);
      const est = estimatePeriodBudget(st, levers);
      send(ws, { t: 'previa', clave: key, valor: v, estimacion: est, base, id: cmd.id ?? null });
      return;
    }
    case 'palanca_extra':
      return replyResult(controller.setExtraLever(String(cmd.clave) as never, Number(cmd.valor)), {}, false);
    case 'previa_extra': {
      const key = String(cmd.clave) as keyof typeof EXTRA_LEVER_BOUNDS;
      const b = EXTRA_LEVER_BOUNDS[key];
      if (!b) return ack(ws, cmd, false, { error: 'Palanca inválida.' });
      const ex = ensureExtras(structuredClone(st));
      const v = Math.min(b.max, Math.max(b.min, Number(cmd.valor)));
      const est = estimateExtrasCost(st, { ...ex.objetivo, [key]: v });
      const base = estimateExtrasCost(st, ex.vigentes);
      send(ws, { t: 'previa', clave: key, valor: v, extra: true, estimacion: est, base, id: cmd.id ?? null });
      return;
    }
    case 'contraoferta': {
      const r = controller.counterOffer(String(cmd.demanda));
      return replyResult(r, { aceptada: r.aceptada, texto: r.texto });
    }
    case 'construir':
      return replyResult(controller.buildInParcela(String(cmd.parcela), String(cmd.tipo) as never));
    case 'construir_via':
      return replyResult(controller.buildVia(String(cmd.tramo)));
    case 'estado_automatico': {
      controller.setEstadoAutomatico(Boolean(cmd.valor));
      pushState(undefined, false);
      return ack(ws, cmd, true);
    }
    case 'demoler':
      return replyResult(controller.demolishParcela(String(cmd.parcela)));
    case 'responder_demanda':
      return replyResult(controller.respondDemand(String(cmd.demanda), Boolean(cmd.aceptar)));
    case 'foco_npc': {
      focoNpc = cmd.npc ? String(cmd.npc) : null;
      pushState(ws);
      return ack(ws, cmd, true);
    }
    case 'por_que': {
      let ref = cmd.ref ? String(cmd.ref) : undefined;
      if (!ref && cmd.npc) ref = pickNpcRef(String(cmd.npc));
      const cadena = buildCausalChain(st, ref, cmd.texto ? String(cmd.texto) : undefined);
      send(ws, { t: 'por_que', id: cmd.id ?? null, ref: ref ?? null, cadena });
      return;
    }
    case 'nueva_partida': {
      const esc = String(cmd.escenario ?? 'elecciones') === 'zombies' ? 'zombies' : 'elecciones';
      const preset = SCENARIO_PRESETS[esc];
      const nivelMundo = cmd.nivelMundo ? String(cmd.nivelMundo) : DEFAULT_WORLD_CONFIG.nivelMundo;
      const cfg = {
        ...structuredClone(DEFAULT_WORLD_CONFIG),
        escenarioId: esc,
        economiaModulo: cmd.economiaModulo
          ? String(cmd.economiaModulo)
          : nivelMundo === 'M4'
          ? 'fiscal'
          : 'base',
        poblacionInicial: Math.min(5000, Math.max(20, Math.round(Number(cmd.poblacion ?? preset.poblacionDefault)))),
        cantidadMedios: Math.min(3, Math.max(1, Math.round(Number(cmd.medios ?? preset.mediosDefault)))),
        semilla: Math.round(Number(cmd.semilla ?? Date.now() % 100000)) || 1,
        caos: structuredClone(preset.caosDefault),
        usarIaGemini: false,
        nivelMundo,
        ...(cmd.nivelGobernador ? { nivelGobernador: String(cmd.nivelGobernador) } : {}),
        ...(cmd.estadoAutomatico !== undefined ? { estadoAutomatico: Boolean(cmd.estadoAutomatico) } : {}),
      };
      controller.startNewGame(cfg as never);
      controller.setPaused(true);
      lastRosterSig = '';
      pushState();
      return ack(ws, cmd, true);
    }
    case 'guardar': {
      const ok = controller.saveManual();
      broadcast(saveSlots());
      return ack(ws, cmd, ok, ok ? {} : { error: 'No se pudo guardar.' });
    }
    case 'cargar': {
      const ok = String(cmd.slot ?? 'manual') === 'auto' ? controller.loadAutoSave() : controller.loadManual();
      if (ok) { controller.setPaused(true); lastRosterSig = ''; pushState(); }
      return ack(ws, cmd, ok, ok ? {} : { error: 'No hay guardado válido.' });
    }
    case 'saves': send(ws, saveSlots()); return ack(ws, cmd, true);
    case 'grabar_inicio': {
      if (recStream) recStream.end();
      fs.mkdirSync(REC_DIR, { recursive: true });
      const name = String(cmd.nombre ?? `partida_${Date.now()}`).replace(/[^\w.-]/g, '_');
      recPath = path.join(REC_DIR, `${name}.jsonl`);
      recStream = fs.createWriteStream(recPath);
      recWrite(proj.buildHello({ grabacion: true }));
      recWrite({ t: 'npcs_meta', lista: proj.npcMeta(controller.getState()) });
      pushState(); // primer cuadro
      return ack(ws, cmd, true, { archivo: recPath });
    }
    case 'grabar_fin': {
      const p = recPath;
      if (recStream) recStream.end();
      recStream = null;
      return ack(ws, cmd, true, { archivo: p });
    }
    default:
      return ack(ws, cmd, false, { error: `Comando desconocido: ${cmd.c}` });
  }
}

// ───────── Servidor ─────────
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT, maxPayload: 8 * 1024 * 1024 });
wss.on('listening', () => {
  const addr = wss.address();
  const port = typeof addr === 'object' && addr ? addr.port : PORT;
  // Línea que Godot espera para conectarse.
  console.log(`LISTO ${port}`);
});
wss.on('connection', (ws) => {
  clients.add(ws);
  everConnected = true;
  send(ws, proj.buildHello());
  sendNpcMeta(ws);
  send(ws, saveSlots());
  pushState(ws);
  ws.on('message', (data) => {
    let cmd: Cmd;
    try {
      cmd = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!cmd || cmd.t !== 'cmd') return;
    try {
      handle(ws, cmd);
    } catch (e) {
      console.error('[cmd]', cmd.c, e);
      ack(ws, cmd, false, { error: String((e as Error).message ?? e) });
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    if (EXIT_WHEN_EMPTY && everConnected && clients.size === 0) {
      setTimeout(() => {
        if (clients.size === 0) shutdown();
      }, 2500);
    }
  });
});

function shutdown() {
  controller.destroy();
  if (recStream) recStream.end();
  wss.close();
  setTimeout(() => process.exit(0), 100);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
