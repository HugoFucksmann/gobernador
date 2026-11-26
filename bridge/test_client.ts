// Cliente de prueba del puente: arranca el servidor, juega unos días y verifica el contrato.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const proc = spawn(process.execPath, ['--import', 'tsx', 'bridge/server.ts', '--puerto', '0', '--guardados', 'saves_test'], { stdio: ['ignore', 'pipe', 'inherit'] });
let port = 0;
proc.stdout.on('data', (d) => {
  const m = /LISTO (\d+)/.exec(String(d));
  if (m && !port) { port = Number(m[1]); run(); }
});
const fail = (m: string) => { console.error('FALLA:', m); proc.kill(); process.exit(1); };
setTimeout(() => fail('timeout'), 90000);

function run() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const got: Record<string, number> = {};
  let state: any = null;
  let cmdId = 0;
  const cmd = (c: string, extra: object = {}) => ws.send(JSON.stringify({ t: 'cmd', id: ++cmdId, c, ...extra }));
  const acks: any[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    got[m.t] = (got[m.t] ?? 0) + 1;
    if (m.t === 'state') state = m;
    if (m.t === 'ack') acks.push(m);
    if (m.t === 'hello') console.log('hello ok · parcelas', m.mapa.parcelas.length, 'edificios', m.edificios.length);
  });
  ws.on('open', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await wait(800);
    if (!state) return fail('sin state inicial');
    console.log('día', state.dia, 'npcs', state.npcs.length, 'reserva', state.finanzas.reserva, 'apoyo', state.comunidad.apoyoPct);
    cmd('palanca', { clave: 'impuesto', valor: 30 });
    cmd('construir', { parcela: 'p_centro_libre', tipo: 'comisaria' });
    cmd('dev_modo', { valor: true });
    cmd('velocidad', { v: 8 });
    cmd('reanudar');
    await wait(15000);
    cmd('por_que', { npc: state.npcs[0] ? 'npc_001' : '' });
    await wait(500);
    console.log('mensajes', JSON.stringify(got));
    console.log('día final', state.dia, 'simMs', state.simMs, 'acks', acks.map((a) => `${a.c}:${a.ok}${a.error ? '(' + a.error + ')' : ''}`).join(' '));
    const p = state.parcelas.find((x: any) => x.id === 'p_centro_libre');
    console.log('parcela', JSON.stringify(p));
    if (!(state.dia > 2)) return fail('no avanzó el día');
    proc.kill();
    process.exit(0);
  });
}
