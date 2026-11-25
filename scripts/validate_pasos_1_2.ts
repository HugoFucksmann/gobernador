import fs from 'node:fs';
import path from 'node:path';
import {
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../src/data/catalogs';
import {
  buildCausalChain,
  computeTotalWorldMoney,
  deriveCommunityStats,
  orderBuildInParcela,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import { BuildingType, GameState, PrivateRoleId, SimEvent, WorldConfig } from '../src/types/game';

const presetPath = path.resolve(process.cwd(), 'presets/elecciones_simple.json');
const PRESET = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));

function applyPreset() {
  Object.assign(ECON_CONSTANTS, PRESET.ECON_CONSTANTS);
  (Object.keys(PRESET.ROLE_CATALOG_ingresos) as PrivateRoleId[]).forEach((r) => {
    const rng = PRESET.ROLE_CATALOG_ingresos[r];
    if (rng) ROLE_CATALOG[r].ingreso = [...rng];
  });
  SCENARIO_PRESETS.elecciones.reservaInicial = PRESET.SCENARIO_PRESET.reservaInicial;
  SCENARIO_PRESETS.elecciones.stockAlimentoInicial = PRESET.SCENARIO_PRESET.stockAlimentoInicial;
  SCENARIO_PRESETS.elecciones.topesPrivados = { ...PRESET.SCENARIO_PRESET.topesPrivados };
  SCENARIO_PRESETS.elecciones.cuposFijos = { ...PRESET.SCENARIO_PRESET.cuposFijos };
  SCENARIO_PRESETS.elecciones.nivelObrasInicial = PRESET.SCENARIO_PRESET.nivelObrasInicial;
  SCENARIO_PRESETS.elecciones.initialLevers = structuredClone(PRESET.initialLevers);
  SCENARIO_PRESETS.elecciones.caosDefault = { ...PRESET.SCENARIO_PRESET.caosDefault };
}

function makeM0State(seed: number, gov: 'G0' | 'G1'): GameState {
  applyPreset();
  const preset = SCENARIO_PRESETS.elecciones;
  const cfg: WorldConfig = {
    escenarioId: 'elecciones',
    economiaModulo: 'base',
    nivelMundo: 'M0',
    nivelGobernador: gov,
    cantidadMedios: preset.mediosDefault,
    poblacionInicial: preset.poblacionDefault,
    caos: { ...preset.caosDefault },
    semilla: seed,
    usarIaGemini: false,
  };
  const s = createInitialGameState(cfg);
  s.clima.proximoEventoDia = 999999;
  s.clima.fenomenos = [];
  return s;
}

function stats(arr: number[]) {
  if (arr.length === 0) return { mean: 0, sd: 0, min: 0, max: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return {
    mean: Number(mean.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: Number(Math.min(...arr).toFixed(2)),
    max: Number(Math.max(...arr).toFixed(2)),
  };
}

function isPandemicDeath(ev: SimEvent, eventById: Map<string, SimEvent>): boolean {
  let cursor = ev.causa;
  const seen = new Set<string>();
  for (let i = 0; i < 5 && cursor; i++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    if (cursor.includes('pandemia')) return true;
    const parent = eventById.get(cursor);
    if (!parent) break;
    cursor = parent.causa;
  }
  return false;
}

type StrategyId = 'pasiva' | 'constructora' | 'ahorradora';

function runCorridaB(pandemicIntensity: number, pandemicDuration: number, maxBuilds = 5) {
  const SEEDS = 10;
  const DAYS = 180;
  const strategies: StrategyId[] = ['pasiva', 'constructora', 'ahorradora'];
  const out: Record<string, any> = {};

  for (const strat of strategies) {
    const rows: any[] = [];
    const allEventCounts: Record<string, number> = {};
    const eventsWithoutCause: Record<string, number> = {};
    let sampleChain: any = null;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = makeM0State(seed, 'G1');
      s.clima.fenomenos.push({
        id: 'pandemia_forzada',
        tipo: 'pandemia',
        nombre: 'Pandemia forzada',
        intensidad: pandemicIntensity,
        inicioDia: 30,
        duracionDias: pandemicDuration,
        avisoDias: 0,
      });

      let minReserva = s.gobierno.reserva;
      let minReservaDay = 1;
      let daysWithImpago = 0;
      let buildingsBuilt = 0;
      let nextBuildType: BuildingType = 'hospital';
      const allEventsForSeed: SimEvent[] = [];
      const eventById = new Map<string, SimEvent>();

      const applyStrategy = (day: number) => {
        if (strat === 'pasiva') return;
        if (strat === 'ahorradora') {
          if (day === 1) {
            s.gobierno.palancasObjetivo.impuesto = 52;
            s.gobierno.palancasObjetivo.garantiaAlimentaria = 50;
          }
          return;
        }
        if (strat === 'constructora') {
          if (buildingsBuilt >= maxBuilds) return;
          const hasConstruction = s.parcelas.some((p) => p.estado === 'en_obra');
          if (!hasConstruction) {
            const free = s.parcelas.find((p) => p.estado === 'libre');
            if (free) {
              const cost = BUILDING_CATALOG[nextBuildType].costoObra;
              if (s.gobierno.reserva >= cost) {
                const res = orderBuildInParcela(s, free.id, nextBuildType);
                if (res.ok) {
                  buildingsBuilt++;
                  nextBuildType = nextBuildType === 'hospital' ? 'comisaria' : 'hospital';
                }
              }
            }
          }
        }
      };

      applyStrategy(1);
      for (let d = 1; d < DAYS; d++) {
        stepHeadlessDay(s);
        for (const ev of s.eventosDiaActual) {
          allEventsForSeed.push(ev);
          eventById.set(ev.id, ev);
          allEventCounts[ev.tipo] = (allEventCounts[ev.tipo] ?? 0) + 1;
          if (
            !ev.causa &&
            !['construccion_inicio', 'construccion_fin', 'demolicion', 'hito', 'control', 'impago_fin'].includes(
              ev.tipo
            )
          ) {
            eventsWithoutCause[ev.tipo] = (eventsWithoutCause[ev.tipo] ?? 0) + 1;
          }
        }
        applyStrategy(s.reloj.dia);
        if (s.gobierno.reserva < minReserva) {
          minReserva = s.gobierno.reserva;
          minReservaDay = s.reloj.dia;
        }
        if (s.gobierno.finanzas.impago) {
          daysWithImpago++;
        }
        if (s.resultado.estado === 'derrota') break;
      }

      const ds = deriveCommunityStats(s);
      const deathEvents = allEventsForSeed.filter((e) => e.tipo === 'muerte');
      const pandemicDeaths = deathEvents.filter((e) => isPandemicDeath(e, eventById)).length;

      if (!sampleChain) {
        const deathEv = s.eventos.find((e) => e.tipo === 'muerte');
        const impagoEv = s.eventos.find((e) => e.tipo === 'impago');
        const targetEv = deathEv || impagoEv || s.eventos[s.eventos.length - 1];
        if (targetEv) {
          sampleChain = {
            seed,
            event: targetEv,
            chain: buildCausalChain(s, targetEv.id, `Evento ${targetEv.tipo} día ${targetEv.dia}`),
          };
        }
      }

      rows.push({
        seed,
        estado: s.resultado.estado,
        victoriaCumplida: Boolean(s.resultado.victoriaCumplida),
        finalDay: s.reloj.dia,
        poblacionPct: ds.poblacionPct,
        apoyoPct: ds.apoyoPct,
        satisfaccionMedia: ds.satisfaccionMedia,
        hambreCriticaPct: ds.hambreCriticaPct,
        desempleoPct: ds.desempleoPct,
        reservaEnd: Number(s.gobierno.reserva.toFixed(2)),
        minReserva: Number(minReserva.toFixed(2)),
        minReservaDay,
        daysWithImpago,
        buildingsBuilt,
        pandemicDeaths,
        totalDeaths: deathEvents.length,
        aliveEnd: s.npcs.filter((n) => n.vivo).length,
      });
    }

    const sortedEvents = Object.entries(allEventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    out[strat] = {
      params: { inicioDia: 30, duracionDias: pandemicDuration, intensidad: pandemicIntensity, maxBuilds },
      summary: {
        winPct: Number(((rows.filter((r) => r.victoriaCumplida).length / SEEDS) * 100).toFixed(1)),
        defeatPct: Number(((rows.filter((r) => r.estado === 'derrota').length / SEEDS) * 100).toFixed(1)),
        poblacionPct: stats(rows.map((r) => r.poblacionPct)),
        apoyoPct: stats(rows.map((r) => r.apoyoPct)),
        satisfaccionMedia: stats(rows.map((r) => r.satisfaccionMedia)),
        hambreCriticaPct: stats(rows.map((r) => r.hambreCriticaPct)),
        desempleoPct: stats(rows.map((r) => r.desempleoPct)),
        minReserva: stats(rows.map((r) => r.minReserva)),
        minReservaDay: stats(rows.map((r) => r.minReservaDay)),
        daysWithImpago: stats(rows.map((r) => r.daysWithImpago)),
        buildingsBuilt: stats(rows.map((r) => r.buildingsBuilt)),
        pandemicDeaths: stats(rows.map((r) => r.pandemicDeaths)),
        totalDeaths: stats(rows.map((r) => r.totalDeaths)),
      },
      top5Events: sortedEvents,
      eventsWithoutCause,
      sampleCausalChain: sampleChain,
    };
  }

  return out;
}

console.log('--- B1: intensity=75, dur=150, maxBuilds=5 ---');
console.log(JSON.stringify(runCorridaB(75, 150, 5)));
console.log('--- B2: intensity=65, dur=90, maxBuilds=2 ---');
console.log(JSON.stringify(runCorridaB(65, 90, 2)));
