import {
  AUTOPILOT_CONSTANTS,
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  PERIOD_DAYS,
  SCENARIO_PRESETS,
} from '../src/data/catalogs';
import {
  computeMaintenanceBreakdown,
  DEFAULT_WORLD_CONFIG,
  estimatePeriodBudget,
} from '../src/engine/policies';
import {
  deriveCommunityStats,
  orderBuildInParcela,
  orderBuildVia,
  orderDemolishParcela,
  setGovernorLeverObjetivo,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import {
  canBuildTypeInParcela,
  computeDemandaSuelo,
  computeZoneServiceCoverage,
  getWorldZones,
} from '../src/engine/worldHelpers';
import { BuildingType, GameState, ServiceLevel } from '../src/types/game';

type BotId = 'pasivo' | 'equilibrado' | 'compulsivo' | 'austero' | 'aleatorio';

interface BotRunResult {
  bot: BotId;
  seed: number;
  outcome: 'victoria' | 'objetivo_perdido' | 'derrota';
  dia: number;
  causa: string;
  apoyoFin: number;
  satFin: number;
  hambreMax: number;
  reservaMin: number;
  reservaFin: number;
  impagoPeriodos: number;
  huelgas: number;
  obrasOrdenadas: number;
  viasOrdenadas: number;
  trabas: number;
}

function parseSeeds(): number[] {
  let n = 10;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--seeds=')) n = Math.max(1, Number(arg.split('=')[1]) || 10);
  }
  return Array.from({ length: n }, (_, i) => i + 1);
}

function mkBotRng(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function runBotDay(
  bot: BotId,
  s: GameState,
  d: number,
  botRand: () => number,
  counters: { obras: number; vias: number }
): void {
  if (bot === 'pasivo') return;

  if (bot === 'austero') {
    if (d === 1) {
      setGovernorLeverObjetivo(s, 'impuesto', 50);
      setGovernorLeverObjetivo(s, 'salarioPublico', 80);
      setGovernorLeverObjetivo(s, 'nivelObras', 0);
    }
    return;
  }

  if (bot === 'compulsivo') {
    if (d === 1) {
      setGovernorLeverObjetivo(s, 'impuesto', 28);
      setGovernorLeverObjetivo(s, 'salarioPublico', 120);
      setGovernorLeverObjetivo(s, 'nivelObras', 5);
    }
    if (d % 3 === 0) {
      const orderPriority: BuildingType[] = ['universidad', 'hospital', 'comisaria', 'escuela'];
      for (const tipo of orderPriority) {
        const lot = s.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, tipo));
        if (lot && s.gobierno.reserva >= BUILDING_CATALOG[tipo].costoObra) {
          if (orderBuildInParcela(s, lot.id, tipo).ok) {
            counters.obras++;
            break;
          }
        }
      }
      const tr = s.tramos.find((t) => !t.construida && !t.enObra);
      if (tr && s.gobierno.reserva >= tr.costoObra) {
        if (orderBuildVia(s, tr.id).ok) counters.vias++;
      }
    }
    return;
  }

  if (bot === 'aleatorio') {
    if (d % 7 === 1) {
      const r = botRand();
      if (r < 0.25) {
        const tax = 20 + Math.floor(botRand() * 36);
        setGovernorLeverObjetivo(s, 'impuesto', tax);
      } else if (r < 0.45) {
        const sal = 70 + Math.floor(botRand() * 13) * 5;
        setGovernorLeverObjetivo(s, 'salarioPublico', sal);
      } else if (r < 0.6) {
        const niv = Math.floor(botRand() * 6) as ServiceLevel;
        setGovernorLeverObjetivo(s, 'nivelObras', niv);
      } else if (r < 0.8) {
        const tipos: BuildingType[] = ['hospital', 'comisaria', 'escuela', 'universidad'];
        const t = tipos[Math.floor(botRand() * tipos.length)];
        const freeLots = s.parcelas.filter((p) => p.estado === 'libre' && canBuildTypeInParcela(p, t));
        if (freeLots.length > 0) {
          const pick = freeLots[Math.floor(botRand() * freeLots.length)];
          if (orderBuildInParcela(s, pick.id, t).ok) counters.obras++;
        }
      } else if (r < 0.92) {
        const trs = s.tramos.filter((t) => !t.construida && !t.enObra);
        if (trs.length > 0) {
          const pick = trs[Math.floor(botRand() * trs.length)];
          if (orderBuildVia(s, pick.id).ok) counters.vias++;
        }
      } else {
        const built = s.parcelas.filter((p) => p.estado === 'ocupada' && p.edificio?.dueno === 'estado' && p.zona !== 'centro');
        if (built.length > 0) {
          const pick = built[Math.floor(botRand() * built.length)];
          orderDemolishParcela(s, pick.id);
        }
      }
    }
    return;
  }

  // Equilibrado: evalúa cada día de pago (cada 7 días) respetando reserva_min_dias y pct_mant_max
  if (d % PERIOD_DAYS !== 1 && d !== 1) return;

  const dv = deriveCommunityStats(s);
  const est = estimatePeriodBudget(s, s.gobierno.palancasVigentes);
  const dailyExp = Math.max(25, est.gastosEst / PERIOD_DAYS);
  const floorRes = dailyExp * AUTOPILOT_CONSTANTS.reservaMinDias;
  const curTax = s.gobierno.palancasVigentes.impuesto;
  const curSal = s.gobierno.palancasVigentes.salarioPublico;

  // Ajuste fiscal prudente en G1
  if (s.gobierno.finanzas.impago || s.gobierno.reserva < floorRes) {
    setGovernorLeverObjetivo(s, 'impuesto', Math.min(46, curTax + 3));
    setGovernorLeverObjetivo(s, 'salarioPublico', Math.max(90, curSal - 5));
    setGovernorLeverObjetivo(s, 'nivelObras', 1);
    return;
  }
  if (s.gobierno.reserva > dailyExp * 42 && dv.apoyoPct < 58) {
    setGovernorLeverObjetivo(s, 'impuesto', Math.max(28, curTax - 2));
    if (dv.apoyoPct < 52) {
      setGovernorLeverObjetivo(s, 'salarioPublico', Math.min(115, curSal + 5));
    }
  } else if (s.gobierno.reserva > dailyExp * 34 && curTax > 36) {
    setGovernorLeverObjetivo(s, 'impuesto', Math.max(32, curTax - 2));
  }

  // Nivel de obras según holgura
  setGovernorLeverObjetivo(s, 'nivelObras', s.gobierno.reserva > floorRes * 1.4 ? 2 : 1);

  const vivosCount = Math.max(1, dv.vivos);
  const op = computeMaintenanceBreakdown(s.parcelas, s.gobierno.palancasVigentes.nivelObras, vivosCount, s.tramos);
  const periodIng = Math.max(est.ingresosEst, s.gobierno.finanzas.ingresos, 1);

  const canAffordSafe = (cost: number, addedMaint: number) =>
    s.gobierno.reserva - cost >= floorRes &&
    op.mantenimientoTotal + addedMaint <= periodIng * (AUTOPILOT_CONSTANTS.pctMantMax / 100);

  const cov = computeZoneServiceCoverage(s);
  const activeZones = getWorldZones(s);
  const inObra = new Set(s.parcelas.filter((p) => p.estado === 'en_obra' && p.edificio).map((p) => p.edificio!.tipo));

  // Cobertura por radio: prioriza salud -> policia -> escuela si hay déficit y holgura segura
  const checks: Array<{ tipo: 'hospital' | 'comisaria' | 'escuela'; key: 'salud' | 'policia' | 'escuela' }> = [
    { tipo: 'hospital', key: 'salud' },
    { tipo: 'comisaria', key: 'policia' },
    { tipo: 'escuela', key: 'escuela' },
  ];
  for (const ch of checks) {
    if (inObra.has(ch.tipo)) continue;
    const lowZ = activeZones.filter((z) => (cov[z]?.[ch.key] ?? 0) < SERVICE_RADIUS_CONSTANTS.coberturaMin);
    if (lowZ.length === 0) continue;
    const def = BUILDING_CATALOG[ch.tipo];
    if (!canAffordSafe(def.costoObra, def.mantenimientoPeriodo)) continue;
    const lot =
      s.parcelas.find((p) => p.estado === 'libre' && lowZ.includes(p.zona) && canBuildTypeInParcela(p, ch.tipo)) ??
      s.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, ch.tipo));
    if (lot && orderBuildInParcela(s, lot.id, ch.tipo).ok) {
      counters.obras++;
      return;
    }
  }

  // Vías solo si demanda de suelo supera umbral y reserva está holgada
  const dem = computeDemandaSuelo(s);
  const maxDem = Math.max(0, ...Object.values(dem));
  if (maxDem >= 1.2 && s.gobierno.reserva > floorRes * 1.35) {
    const tr = s.tramos
      .filter((t) => !t.construida && !t.enObra)
      .sort((a, b) => a.costoObra - b.costoObra)[0];
    if (tr && canAffordSafe(tr.costoObra, tr.mantenimientoPeriodo)) {
      if (orderBuildVia(s, tr.id).ok) counters.vias++;
    }
  }
}

function simulateBot(bot: BotId, seed: number): BotRunResult {
  const p = SCENARIO_PRESETS.elecciones;
  const s = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    escenarioId: 'elecciones',
    economiaModulo: 'base',
    nivelMundo: 'M3',
    nivelGobernador: 'G1',
    estadoAutomatico: false,
    poblacionInicial: p.poblacionDefault,
    cantidadMedios: p.mediosDefault,
    caos: structuredClone(p.caosDefault),
    semilla: seed,
    usarIaGemini: false,
  });

  const rand = mkBotRng(seed * 101 + bot.length);
  const counters = { obras: 0, vias: 0 };
  let reservaMin = s.gobierno.reserva;
  let hambreMax = 0;
  let impagoPeriodos = 0;
  let huelgas = 0;
  let trabas = 0;
  let prevDay = 0;
  let outcome: BotRunResult['outcome'] = 'objetivo_perdido';
  let milestoneDay = 365;
  let milestoneCause = '';

  for (let d = 1; d <= 365; d++) {
    runBotDay(bot, s, d, rand, counters);
    stepHeadlessDay(s);

    if (s.reloj.dia <= prevDay) trabas++;
    prevDay = s.reloj.dia;

    const dv = deriveCommunityStats(s);
    if (!Number.isFinite(dv.apoyoPct) || !Number.isFinite(s.gobierno.reserva)) trabas++;
    if (s.gobierno.reserva < reservaMin) reservaMin = s.gobierno.reserva;
    if (dv.hambreCriticaPct > hambreMax) hambreMax = dv.hambreCriticaPct;
    if (s.reloj.diasEnPeriodo === 0 && s.gobierno.finanzas.impago) impagoPeriodos++;
    huelgas += s.eventosDiaActual.filter((e) => e.tipo === 'accion_inicio' && e.accion === 'huelga').length;

    if (s.resultado.estado === 'derrota') {
      outcome = 'derrota';
      milestoneDay = s.resultado.diaFinal ?? d;
      milestoneCause = s.resultado.razon;
      break;
    }
    if (d === 365) {
      outcome = s.resultado.victoriaCumplida ? 'victoria' : 'objetivo_perdido';
      milestoneDay = 365;
      milestoneCause = s.resultado.victoriaCumplida
        ? `apoyo=${dv.apoyoPct.toFixed(1)}% >= 50%`
        : `apoyo=${dv.apoyoPct.toFixed(1)}% < 50%`;
    }
  }

  const finalDv = deriveCommunityStats(s);
  return {
    bot,
    seed,
    outcome,
    dia: milestoneDay,
    causa: milestoneCause,
    apoyoFin: Number(finalDv.apoyoPct.toFixed(1)),
    satFin: Number(finalDv.satisfaccionMedia.toFixed(1)),
    hambreMax: Number(hambreMax.toFixed(1)),
    reservaMin: Math.round(reservaMin),
    reservaFin: Math.round(s.gobierno.reserva),
    impagoPeriodos,
    huelgas,
    obrasOrdenadas: counters.obras,
    viasOrdenadas: counters.vias,
    trabas,
  };
}

const seeds = parseSeeds();
const bots: BotId[] = ['pasivo', 'equilibrado', 'compulsivo', 'austero', 'aleatorio'];
const allResults: BotRunResult[] = [];

console.log(`\n=== BOTS G1 ELECCIONES (${seeds.length} semillas × 365 días) ===`);
for (const bot of bots) {
  const rows = seeds.map((sd) => simulateBot(bot, sd));
  allResults.push(...rows);
  const wins = rows.filter((r) => r.outcome === 'victoria').length;
  const lostObj = rows.filter((r) => r.outcome === 'objetivo_perdido').length;
  const defeats = rows.filter((r) => r.outcome === 'derrota').length;
  const impagos = rows.filter((r) => r.impagoPeriodos > 0 || r.huelgas > 0).length;
  const trabas = rows.reduce((a, r) => a + r.trabas, 0);
  const avgApoyo = rows.reduce((a, r) => a + r.apoyoFin, 0) / rows.length;
  const minRes = Math.min(...rows.map((r) => r.reservaMin));
  console.log(
    `Bot=${bot.padEnd(11)} | victorias=${wins}/${seeds.length} objPerd=${lostObj} derrotas=${defeats} | impago/huelga=${impagos}/${seeds.length} | apoyoMed=${avgApoyo.toFixed(1)}% | resMin=${minRes} | trabas=${trabas}`
  );
}

console.log('\n--- DETALLE POR SEMILLA ---');
for (const r of allResults) {
  console.log(
    `${r.bot.padEnd(11)} s=${String(r.seed).padStart(2)} | ${r.outcome.padEnd(16)} D${String(r.dia).padStart(3)} | apoyo=${String(r.apoyoFin).padStart(5)}% resMin=${String(r.reservaMin).padStart(5)} imp=${r.impagoPeriodos} huelg=${r.huelgas} obr=${r.obrasOrdenadas}+${r.viasOrdenadas} trab=${r.trabas} | ${r.causa}`
  );
}
