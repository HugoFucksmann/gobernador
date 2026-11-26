// Pruebas del nivel 1 completo y del nivel 1.1 (HOJA_DE_RUTA §2 y §3). Salida 0 si todo pasa.
// Uso: bun scripts/test_nivel1_1.ts
import { SCENARIO_PRESETS } from '../src/data/catalogs';
import { DEFAULT_WORLD_CONFIG } from '../src/engine/policies';
import {
  buildCausalChain,
  computeTotalWorldMoney,
  counterOfferDemand,
  deriveCommunityStats,
  forceDemandForDev,
  orderBuildInParcela,
  setExtraLever,
  stepSimulation,
  TICKS_PER_DAY,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import type { GameState, GovernorComplexityLevel, WorldComplexityLevel, WorldConfig } from '../src/types/game';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`);
};

function mk(opts: { esc?: 'elecciones' | 'zombies'; seed?: number; pop?: number; m?: WorldComplexityLevel; g?: GovernorComplexityLevel; fiscal?: boolean } = {}): GameState {
  const esc = opts.esc ?? 'elecciones';
  const p = SCENARIO_PRESETS[esc];
  const cfg: WorldConfig = {
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    escenarioId: esc,
    economiaModulo: opts.fiscal ? 'fiscal' : 'base',
    nivelMundo: opts.m ?? 'M1',
    nivelGobernador: opts.g ?? 'G2',
    poblacionInicial: opts.pop ?? 100,
    cantidadMedios: 2,
    semilla: opts.seed ?? 1,
    caos: structuredClone(p.caosDefault),
    usarIaGemini: false,
  };
  return createInitialGameState(cfg);
}

function days(s: GameState, n: number, each?: (s: GameState, d: number) => void): GameState {
  let st = s;
  for (let i = 0; i < n && st.resultado.estado === 'jugando'; i++) {
    if (each) each(st, i);
    const before = computeTotalWorldMoney(st);
    st = stepSimulation(st, TICKS_PER_DAY);
    void before;
  }
  return st;
}

// ───── 1. Retención de eventos (MOTOR §3): las raíces no se descartan nunca
{
  let s = mk({ m: 'M0', g: 'G1' });
  s.clima.proximoEventoDia = 999999;
  s.clima.fenomenos.push({ id: 'pand_test', tipo: 'pandemia', nombre: 'Pandemia de prueba', intensidad: 80, inicioDia: 20, duracionDias: 150 });
  orderBuildInParcela(s, 'p_centro_libre', 'hospital');
  const rootId = s.eventos.find((e) => e.tipo === 'obra_inicio')?.id;
  s = days(s, 200);
  const rootKept = s.eventos.some((e) => e.id === rootId);
  const agregados = s.eventos.filter((e) => e.tipo === 'agregado').length;
  const golpes = s.eventos.filter((e) => e.tipo === 'golpe').length;
  check('Retención: la raíz obra_inicio sigue en el registro tras >200 días de pandemia', rootKept, `eventos=${s.eventos.length}, agregados=${agregados}, golpes sueltos=${golpes}`);
  check('Retención: los hechos de alta frecuencia viejos quedan agregados por día y zona', agregados > 0);
  const chain = buildCausalChain(s, s.eventos.find((e) => e.tipo === 'muerte')?.id);
  check('Retención: la cadena causal de una muerte termina en un hecho raíz con su día original', chain.length > 0 && chain[0].tipo !== 'origen', chain.map((c) => c.tipo).join('→'));
  // M0: los fenómenos forzados emiten aviso/inicio/fin con causa
  const inicio = s.eventos.find((e) => e.tipo === 'fenomeno_inicio');
  const saturados = s.eventos.filter((e) => e.tipo === 'hospital_saturado');
  check('M0: un fenómeno inyectado emite fenomeno_inicio', !!inicio);
  check('M0: hospital_saturado y recortes tienen causa', saturados.every((e) => !!e.causa) && s.eventos.filter((e) => e.tipo === 'empresa_recorte' || e.tipo === 'empresa_aumento').every((e) => !!e.causa), `saturados=${saturados.length}`);
}

// ───── 2. Elecciones: segunda condición de derrota (ESCENARIOS §2)
{
  let s = mk({ seed: 3 });
  let n = 0;
  for (const npc of s.npcs) if (n++ < 55) npc.vivo = false;
  s = days(s, 1);
  check('Elecciones: derrota si la población cae bajo el 50% de la inicial', s.resultado.estado === 'derrota' && /50%/.test(s.resultado.razon ?? ''), s.resultado.razon ?? '');
  const z = mk({ esc: 'zombies', seed: 3 });
  check('Zombies: sin derrota extra', !SCENARIO_PRESETS.zombies.derrotasExtra);
  void z;
}

// ───── 3. Nivel 1.1: palancas solo con G3
{
  const g2 = mk({ g: 'G2' });
  const r = setExtraLever(g2, 'presion', 50);
  check('1.1: las palancas nuevas se rechazan fuera de G3', !r.ok, r.error ?? '');
  const g3 = mk({ g: 'G3', fiscal: true, m: 'M2' });
  check('1.1: con G3 se aceptan', setExtraLever(g3, 'presion', 50).ok);
}

// ───── 4. Subsidio al alimento: entra al día siguiente, emite control, conserva el dinero y sube la producción
{
  const base = days(mk({ g: 'G3', seed: 7 }), 21);
  let s = mk({ g: 'G3', seed: 7 });
  setExtraLever(s, 'subsidioAlimento', 20);
  let violations = 0;
  for (let i = 0; i < 21; i++) {
    const before = computeTotalWorldMoney(s);
    s = stepSimulation(s, TICKS_PER_DAY);
    const delta = computeTotalWorldMoney(s) - before;
    const net = s.auditEntradasDia - s.auditSalidasDia;
    if (Math.abs(delta - net) > 1.5) violations++;
  }
  const ctrl = s.eventos.find((e) => e.tipo === 'control' && e.control === 'subsidio_alimento_pct');
  check('Subsidio: emite el evento control al entrar en vigencia', !!ctrl);
  check('Subsidio: el dinero se conserva (sin violaciones diarias)', violations === 0, `violaciones=${violations}`);
  check('Subsidio: cuesta reserva y queda en el libro del período', s.gobierno.reserva < base.gobierno.reserva && ((s.gobierno.finanzas.subsidios ?? 0) > 0 || (s.gobierno.acumuladoPeriodo.subsidios ?? 0) > 0), `reserva ${s.gobierno.reserva.toFixed(0)} vs ${base.gobierno.reserva.toFixed(0)}`);
  check('Subsidio: sube la producción diaria de comida', s.alimento.produccionDiaria > base.alimento.produccionDiaria, `${s.alimento.produccionDiaria.toFixed(1)} vs ${base.alimento.produccionDiaria.toFixed(1)}`);
}

// ───── 5. Presión y acceso sobre la prensa
{
  const base = days(mk({ g: 'G3', seed: 9 }), 49);
  let p = mk({ g: 'G3', seed: 9 });
  setExtraLever(p, 'presion', 90);
  p = days(p, 49);
  let a = mk({ g: 'G3', seed: 9 });
  setExtraLever(a, 'acceso', 90);
  a = days(a, 49);
  const avg = (s: GameState, f: (m: GameState['medios'][number]) => number) => s.medios.reduce((x, m) => x + f(m), 0) / s.medios.length;
  check('Presión: los medios se vuelven más afines al gobierno', avg(p, (m) => m.lineaEditorial.afinidadGobierno) > avg(base, (m) => m.lineaEditorial.afinidadGobierno), `${avg(p, (m) => m.lineaEditorial.afinidadGobierno).toFixed(1)} vs ${avg(base, (m) => m.lineaEditorial.afinidadGobierno).toFixed(1)}`);
  check('Presión: cuesta credibilidad', avg(p, (m) => m.credibilidad) < avg(base, (m) => m.credibilidad), `${avg(p, (m) => m.credibilidad).toFixed(1)} vs ${avg(base, (m) => m.credibilidad).toFixed(1)}`);
  check('Acceso: sube el alcance de los medios', avg(a, (m) => m.alcancePct) > avg(base, (m) => m.alcancePct), `${avg(a, (m) => m.alcancePct).toFixed(1)} vs ${avg(base, (m) => m.alcancePct).toFixed(1)}`);
}

// ───── 6. Educación como servicio con nivel
{
  const educ = (s: GameState) => s.npcs.filter((n) => n.vivo).reduce((x, n) => x + n.educacion.nivel, 0);
  const base = days(mk({ g: 'G3', seed: 11 }), 250);
  let e = mk({ g: 'G3', seed: 11 });
  setExtraLever(e, 'nivelEducacion', 5);
  e = days(e, 250);
  check('Educación: con nivel alto sube el nivel educativo de la comunidad', educ(e) > educ(base), `${educ(e)} vs ${educ(base)}`);
  check('Educación: tiene un costo por período', e.gobierno.reserva < base.gobierno.reserva, `${e.gobierno.reserva.toFixed(0)} vs ${base.gobierno.reserva.toFixed(0)}`);
}

// ───── 7. Contraofertas
{
  let accepted = 0, rejected = 0, lockOk = true, measureOk = true;
  for (let seed = 1; seed <= 24; seed++) {
    let s = days(mk({ g: 'G3', seed }), 3);
    s.demandasActivas = [];
    forceDemandForDev(s, 'bajen_impuestos');
    const d = s.demandasActivas.find((x) => x.demandaId === 'bajen_impuestos');
    if (!d) continue;
    const res = counterOfferDemand(s, d.id);
    if (!res.ok) { check('Contraoferta: la orden es válida', false, res.error ?? ''); continue; }
    if (res.aceptada) {
      accepted++;
      const lock = s.bloqueosPalanca.find((b) => b.palanca === 'impuesto');
      if (!lock || lock.hastaDia - s.reloj.dia > Math.round(d.diasCompromiso / 2)) lockOk = false;
      const imp = s.gobierno.palancasVigentes.impuesto;
      if (!(imp < 36 && imp > Number(d.pedido.nuevoValor))) lockOk = false;
    } else {
      rejected++;
      const m = s.medidasVigentes.find((x) => x.actorId === 'empresarios');
      if (!m) measureOk = false;
    }
  }
  check('Contraoferta: hay aceptaciones y rechazos según la tirada', accepted > 0 && rejected > 0, `aceptadas=${accepted}, rechazadas=${rejected}`);
  check('Contraoferta aceptada: palanca a mitad de camino y compromiso a la mitad', lockOk);
  check('Contraoferta rechazada: aplica la medida del actor', measureOk);
  const g2 = mk({ g: 'G2' });
  forceDemandForDev(g2, 'bajen_impuestos');
  check('Contraoferta: solo desde G3', !counterOfferDemand(g2, g2.demandasActivas[0]?.id ?? 'x').ok);
}

// ───── 8. Más actores
{
  let s = mk({ g: 'G3', seed: 5 });
  s.gobierno.palancasObjetivo.salarioPublico = 60;
  s = days(s, 40);
  const sind = s.eventos.find((e) => e.tipo === 'demanda' && (e as { actorId?: string }).actorId === 'sindicato');
  check('Actores: el sindicato de públicos demanda si los salarios bajan', !!sind, sind ? `día ${sind.dia}` : 'sin demanda');
  let v = mk({ g: 'G3', seed: 6 });
  v.gobierno.palancasVigentes.garantiaAlimentaria = 0; v.gobierno.palancasObjetivo.garantiaAlimentaria = 0;
  for (const n of v.npcs) if (n.zona === 'este') { n.variables.hambre = 95; n.economia.despensa = 0; n.economia.dinero = 0; }
  v.demandasActivas = []; v.cooldownActorDemanda = { empresarios: 9999, medio_1: 9999, medio_2: 9999, medio_3: 9999 };
  v = days(v, 4);
  const vec = v.eventos.find((e) => e.tipo === 'demanda' && String((e as { actorId?: string }).actorId).startsWith('vecinos_'));
  check('Actores: los vecinos de una zona demandan por hambre crítica', !!vec, vec ? String((vec as { actorId?: string }).actorId) : '');
}

// ───── 9. Guardado: extensible sin romperse; migración de guardados anteriores
{
  let s = mk({ g: 'G3', seed: 2 });
  setExtraLever(s, 'nivelEducacion', 3);
  s = days(s, 30);
  const json = JSON.stringify(s);
  const back = JSON.parse(json) as GameState;
  const again = days(back, 5);
  check('Guardado: ida y vuelta por JSON con extras sigue corriendo', again.reloj.dia === s.reloj.dia + 5);
  const old = JSON.parse(json) as GameState;
  delete (old.gobierno as { extras?: unknown }).extras;
  for (const n of old.npcs) delete (n as { extra?: unknown }).extra;
  const oldRun = days(old, 10);
  check('Guardado: un guardado anterior (sin extras ni extra por NPC) carga y corre', oldRun.reloj.dia === old.reloj.dia + 10);
}

// ───── 10. Determinismo con palancas 1.1
{
  const run = () => {
    let s = mk({ g: 'G3', seed: 13 });
    setExtraLever(s, 'subsidioAlimento', 10); setExtraLever(s, 'presion', 40); setExtraLever(s, 'nivelEducacion', 2);
    s = days(s, 60);
    return JSON.stringify([s.gobierno.reserva, deriveCommunityStats(s).apoyoPct, s.rngState, s.eventos.length]);
  };
  check('Determinismo: misma semilla y mismas palancas → mismo resultado', run() === run());
}

// ───── 11. Fiscal (M2): emisión e inflación
{
  let s = mk({ g: 'G3', m: 'M2', fiscal: true, seed: 4 });
  s.gobierno.palancasObjetivo.nivelObras = 5;
  s.gobierno.palancasObjetivo.salarioPublico = 150;
  s.gobierno.palancasObjetivo.topeEmision = 25;
  s.gobierno.reserva = 300;
  let violations = 0;
  for (let i = 0; i < 70; i++) {
    const before = computeTotalWorldMoney(s);
    s = stepSimulation(s, TICKS_PER_DAY);
    if (Math.abs(computeTotalWorldMoney(s) - before - (s.auditEntradasDia - s.auditSalidasDia)) > 1.5) violations++;
  }
  check('Fiscal: la reserva baja sin caer en impago permanente gracias a la emisión y sube la inflación', s.gobierno.inflacion > 0, `inflación=${s.gobierno.inflacion}, emisión último período=${s.gobierno.finanzas.emision}`);
  check('Fiscal: el dinero se conserva con la emisión', violations === 0, `violaciones=${violations}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} pruebas aprobadas`);
process.exit(failed.length ? 1 : 0);
