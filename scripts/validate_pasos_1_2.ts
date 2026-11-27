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
  orderBuildVia,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import type {
  BuildingType,
  GameState,
  PrivateRoleId,
  SimEvent,
  WorldConfig,
} from '../src/types/game';

type SimEventType = SimEvent['tipo'];

const presetPath = path.resolve(process.cwd(), 'presets/elecciones_simple.json');
const PRESET = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));

function applyPreset() {
  Object.assign(ECON_CONSTANTS, PRESET.ECON_CONSTANTS);
  (Object.keys(PRESET.ROLE_CATALOG_ingresos) as PrivateRoleId[]).forEach((r) => {
    const rng = PRESET.ROLE_CATALOG_ingresos[r] as [number, number] | undefined;
    if (rng) ROLE_CATALOG[r].ingreso = [rng[0], rng[1]];
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
  for (let i = 0; i < 6 && cursor; i++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    if (cursor.includes('pandemia')) return true;
    const parent = eventById.get(cursor);
    if (!parent) break;
    cursor = parent.causa;
  }
  return false;
}

const ALL_ENGINE_EVENT_TYPES: SimEventType[] = [
  'ataque',
  'golpe',
  'muerte',
  'internacion',
  'alta',
  'hospital_saturado',
  'accion_inicio',
  'accion_fin',
  'reubicacion',
  'defensa',
  'integridad',
  'orden',
  'aviso',
  'fenomeno_inicio',
  'fenomeno_fin',
  'impago',
  'impago_fin',
  'empresa_aumento',
  'empresa_recorte',
  'empresa_despido',
  'obra_inicio',
  'obra_fin',
  'demolicion',
  'via_inicio',
  'via_fin',
  'noticia',
  'control',
  'hito',
  'victoria',
  'objetivo_perdido',
  'fin_partida',
  'demanda',
  'demanda_aceptada',
  'demanda_rechazada',
  'medida',
];

const ROOT_EVENTS = new Set<SimEventType>(['control', 'obra_inicio', 'demolicion', 'hito', 'impago_fin']);

function runCorridaA() {
  const SEEDS = 10;
  const DAYS = 120;
  const rows: any[] = [];
  const allEventCounts: Record<string, number> = {};
  const eventsWithoutCause: Record<string, number> = {};
  let maxInvViolation = 0;

  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = makeM0State(seed, 'G0');
    const m0 = computeTotalWorldMoney(s);
    const stock0 = s.alimento.stock;
    const prod1 = s.alimento.produccionDiaria;
    const cons1 = s.alimento.consumoDiario;

    const getAgroFactor = () => s.firmas.find((f) => f.activa && f.rubro === 'agro')?.factor ?? 1;
    const getComFactor = () => s.firmas.find((f) => f.activa && f.rubro === 'comercio')?.factor ?? 1;
    let minFFood = getAgroFactor();
    let maxFFood = getAgroFactor();
    let minFCom = getComFactor();
    let maxFCom = getComFactor();
    let minStockRatio = 1;
    let maxStockRatio = 1;
    let maxHambreCritica = deriveCommunityStats(s).hambreCriticaPct;
    let daysWithImpago = 0;
    let npcSum64 = 0;
    const npcWeek9: number[] = [];
    const npcWeek17: number[] = [];
    let ingRatio7 = 0;
    let minEmployedNetDay8 = 999;

    for (let d = 1; d < DAYS; d++) {
      const prevM = computeTotalWorldMoney(s);
      stepHeadlessDay(s);
      const curM = computeTotalWorldMoney(s);
      const diff = Math.abs(curM - (prevM + s.auditEntradasDia - s.auditSalidasDia));
      if (diff > maxInvViolation) maxInvViolation = diff;

      for (const ev of s.eventosDiaActual) {
        allEventCounts[ev.tipo] = (allEventCounts[ev.tipo] ?? 0) + 1;
        if (!ev.causa && !ROOT_EVENTS.has(ev.tipo)) {
          eventsWithoutCause[ev.tipo] = (eventsWithoutCause[ev.tipo] ?? 0) + 1;
        }
      }

      minFFood = Math.min(minFFood, getAgroFactor());
      maxFFood = Math.max(maxFFood, getAgroFactor());
      minFCom = Math.min(minFCom, getComFactor());
      maxFCom = Math.max(maxFCom, getComFactor());
      const sr = s.alimento.stock / stock0;
      minStockRatio = Math.min(minStockRatio, sr);
      maxStockRatio = Math.max(maxStockRatio, sr);
      const dsNow = deriveCommunityStats(s);
      maxHambreCritica = Math.max(maxHambreCritica, dsNow.hambreCriticaPct);
      if (s.gobierno.finanzas.impago) daysWithImpago++;

      const hogarSum = s.hogares.reduce((acc, h) => acc + h.dinero, 0);
      if (s.reloj.dia === 64) npcSum64 = hogarSum;
      if (s.reloj.dia >= 57 && s.reloj.dia <= 63) npcWeek9.push(hogarSum);
      if (s.reloj.dia >= 113 && s.reloj.dia <= 119) npcWeek17.push(hogarSum);
      if (s.reloj.dia === 8) {
        const fin = s.gobierno.finanzas;
        const gastos =
          fin.nomina +
          fin.pensiones +
          fin.comidaMenores +
          fin.garantiaAlimentaria +
          fin.ayudaSocial +
          fin.operacion +
          fin.prensa;
        ingRatio7 = gastos > 0 ? fin.ingresos / gastos : 1;
        for (const n of s.npcs) {
          if (n.vivo && n.edad >= 18 && !['desempleado', 'jubilado', 'estudiante'].includes(n.rol)) {
            minEmployedNetDay8 = Math.min(minEmployedNetDay8, n.economia.ultimoIngresoNeto);
          }
        }
      }
    }

    const mEnd = computeTotalWorldMoney(s);
    const driftPct = ((mEnd - m0) / m0) * 100;
    const npcSum120 = s.hogares.reduce((acc, h) => acc + h.dinero, 0);
    const npcDelta64to120Pct = npcSum64 > 0 ? ((npcSum120 - npcSum64) / npcSum64) * 100 : 0;
    const meanW9 = npcWeek9.reduce((a, b) => a + b, 0) / Math.max(1, npcWeek9.length);
    const meanW17 = npcWeek17.reduce((a, b) => a + b, 0) / Math.max(1, npcWeek17.length);
    const npcWeeklyDeltaPct = meanW9 > 0 ? ((meanW17 - meanW9) / meanW9) * 100 : 0;

    const dsEnd = deriveCommunityStats(s);
    const passed =
      Math.abs(driftPct) < 2 &&
      minFFood >= 0.95 &&
      maxFFood <= 1.05 &&
      minFCom >= 0.95 &&
      maxFCom <= 1.05 &&
      daysWithImpago === 0 &&
      minStockRatio >= 0.8 &&
      maxStockRatio <= 1.2 &&
      maxHambreCritica === 0 &&
      Math.abs(npcDelta64to120Pct) < 2;

    rows.push({
      seed,
      passed,
      driftPct: Number(driftPct.toFixed(2)),
      fFoodMin: Number(minFFood.toFixed(3)),
      fFoodMax: Number(maxFFood.toFixed(3)),
      fComMin: Number(minFCom.toFixed(3)),
      fComMax: Number(maxFCom.toFixed(3)),
      stockRatioMin: Number(minStockRatio.toFixed(3)),
      stockRatioMax: Number(maxStockRatio.toFixed(3)),
      daysWithImpago,
      maxHambreCritica,
      npcDelta64to120Pct: Number(npcDelta64to120Pct.toFixed(2)),
      npcWeeklyDeltaPct: Number(npcWeeklyDeltaPct.toFixed(2)),
      prod1,
      cons1,
      ingRatio7: Number(ingRatio7.toFixed(3)),
      minEmployedNetDay8: Number(minEmployedNetDay8.toFixed(2)),
      reservaEnd: Number(s.gobierno.reserva.toFixed(2)),
      apoyoEnd: dsEnd.apoyoPct,
      satisfaccionEnd: dsEnd.satisfaccionMedia,
      desempleoEnd: dsEnd.desempleoPct,
    });
  }

  return {
    config: { scenario: 'elecciones', capa: 'M0+G0', seeds: SEEDS, days: DAYS },
    passedCount: rows.filter((r) => r.passed).length,
    maxInvariantViolation: Number(maxInvViolation.toFixed(4)),
    summary: {
      driftPct: stats(rows.map((r) => r.driftPct)),
      absDriftMax: Number(Math.max(...rows.map((r) => Math.abs(r.driftPct))).toFixed(2)),
      fFoodMin: Math.min(...rows.map((r) => r.fFoodMin)),
      fFoodMax: Math.max(...rows.map((r) => r.fFoodMax)),
      fComMin: Math.min(...rows.map((r) => r.fComMin)),
      fComMax: Math.max(...rows.map((r) => r.fComMax)),
      stockRatioMin: Math.min(...rows.map((r) => r.stockRatioMin)),
      stockRatioMax: Math.max(...rows.map((r) => r.stockRatioMax)),
      totalImpagos: rows.reduce((a, r) => a + r.daysWithImpago, 0),
      maxHambreCritica: Math.max(...rows.map((r) => r.maxHambreCritica)),
      npcDelta64to120Pct: stats(rows.map((r) => r.npcDelta64to120Pct)),
      npcWeeklyDeltaPct: stats(rows.map((r) => r.npcWeeklyDeltaPct)),
      ingRatio7: stats(rows.map((r) => r.ingRatio7)),
      reservaEnd: stats(rows.map((r) => r.reservaEnd)),
      apoyoEnd: stats(rows.map((r) => r.apoyoEnd)),
      satisfaccionEnd: stats(rows.map((r) => r.satisfaccionEnd)),
    },
    seeds: rows,
    eventCounts: allEventCounts,
    eventsWithoutCause,
    neverTriggeredEvents: ALL_ENGINE_EVENT_TYPES.filter((t) => !allEventCounts[t]),
  };
}

type StrategyId = 'pasiva' | 'constructora' | 'ahorradora';

function runCorridaB(pandemicIntensity: number, pandemicDuration: number, ahorradoraTax = 46) {
  const SEEDS = 10;
  const DAYS = 180;
  const strategies: StrategyId[] = ['pasiva', 'constructora', 'ahorradora'];
  const out: Record<string, any> = {};

  for (const strat of strategies) {
    const rows: any[] = [];
    const allEventCounts: Record<string, number> = {};
    const endLogEventCounts: Record<string, number> = {};
    const eventsWithoutCause: Record<string, number> = {};
    let sampleChainAtMoment: any = null;
    let sampleChainAtEnd: any = null;
    let maxEventsLen = 0;

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
            s.gobierno.palancasObjetivo.impuesto = ahorradoraTax;
          }
          return;
        }
        if (strat === 'constructora') {
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

      const seenEventIds = new Set<string>();
      const recordDayEvents = () => {
        for (const ev of s.eventosDiaActual) {
          if (seenEventIds.has(ev.id)) continue;
          seenEventIds.add(ev.id);
          allEventsForSeed.push(ev);
          eventById.set(ev.id, ev);
          allEventCounts[ev.tipo] = (allEventCounts[ev.tipo] ?? 0) + 1;
          if (!ev.causa && !ROOT_EVENTS.has(ev.tipo)) {
            eventsWithoutCause[ev.tipo] = (eventsWithoutCause[ev.tipo] ?? 0) + 1;
          }
          if (
            !sampleChainAtMoment &&
            (ev.tipo === 'muerte' || ev.tipo === 'impago')
          ) {
            sampleChainAtMoment = {
              seed,
              capturedAtDay: s.reloj.dia,
              event: ev,
              chain: buildCausalChain(s, ev.id, `Evento ${ev.tipo} día ${ev.dia}`),
            };
          }
        }
      };

      applyStrategy(1);
      recordDayEvents();
      for (let d = 1; d < DAYS; d++) {
        stepHeadlessDay(s);
        recordDayEvents();
        applyStrategy(s.reloj.dia);
        recordDayEvents();
        if (s.gobierno.reserva < minReserva) {
          minReserva = s.gobierno.reserva;
          minReservaDay = s.reloj.dia;
        }
        if (s.gobierno.finanzas.impago) {
          daysWithImpago++;
        }
        if (s.resultado.estado === 'derrota') break;
      }

      maxEventsLen = Math.max(maxEventsLen, s.eventos.length);
      for (const ev of s.eventos) {
        endLogEventCounts[ev.tipo] = (endLogEventCounts[ev.tipo] ?? 0) + 1;
      }

      if (!sampleChainAtEnd) {
        const refEv = allEventsForSeed.find((e) => e.tipo === 'muerte' || e.tipo === 'impago');
        if (refEv) {
          const stillInLog = s.eventos.some((e) => e.id === refEv.id);
          sampleChainAtEnd = {
            seed,
            eventStillIn2500CapLog: stillInLog,
            chainAtEnd: buildCausalChain(
              s,
              refEv.id,
              `Evento ${refEv.tipo} día ${refEv.dia}`
            ),
          };
        }
      }

      const ds = deriveCommunityStats(s);
      const deathEvents = allEventsForSeed.filter((e) => e.tipo === 'muerte');
      const pandemicDeaths = deathEvents.filter((e) => isPandemicDeath(e, eventById)).length;

      rows.push({
        seed,
        estado: s.resultado.estado,
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
        hospitalOcupacionMaxPct: ds.hospitalOcupacionPct,
      });
    }

    const top5AllEmitted = Object.entries(allEventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const top5RetainedLog = Object.entries(endLogEventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    out[strat] = {
      params: {
        inicioDia: 30,
        duracionDias: pandemicDuration,
        intensidad: pandemicIntensity,
        ...(strat === 'ahorradora' ? { ahorradoraTax } : {}),
      },
      summary: {
        defeatPct: Number(((rows.filter((r) => r.estado === 'derrota').length / SEEDS) * 100).toFixed(1)),
        poblacionPct: stats(rows.map((r) => r.poblacionPct)),
        apoyoPct: stats(rows.map((r) => r.apoyoPct)),
        satisfaccionMedia: stats(rows.map((r) => r.satisfaccionMedia)),
        hambreCriticaPct: stats(rows.map((r) => r.hambreCriticaPct)),
        minReserva: stats(rows.map((r) => r.minReserva)),
        minReservaDay: stats(rows.map((r) => r.minReservaDay)),
        reservaEnd: stats(rows.map((r) => r.reservaEnd)),
        daysWithImpago: stats(rows.map((r) => r.daysWithImpago)),
        buildingsBuilt: stats(rows.map((r) => r.buildingsBuilt)),
        pandemicDeaths: stats(rows.map((r) => r.pandemicDeaths)),
        desempleoPct: stats(rows.map((r) => r.desempleoPct)),
      },
      top5EmittedEvents: top5AllEmitted,
      top5RetainedEvents: top5RetainedLog,
      maxRetainedEventsLength: maxEventsLen,
      eventsWithoutCause,
      neverTriggeredEvents: ALL_ENGINE_EVENT_TYPES.filter((t) => !allEventCounts[t]),
      sampleCausalChain: sampleChainAtMoment,
      sampleCausalChainAtEnd: sampleChainAtEnd,
    };
  }

  return out;
}

function runV2SmokeChecks() {
  applyPreset();
  const preset = SCENARIO_PRESETS.elecciones;
  const s = createInitialGameState({
    escenarioId: 'elecciones',
    economiaModulo: 'base',
    nivelMundo: 'M3',
    nivelGobernador: 'G2',
    cantidadMedios: preset.mediosDefault,
    poblacionInicial: preset.poblacionDefault,
    caos: { ...preset.caosDefault },
    semilla: 1,
    usarIaGemini: false,
  });
  s.gobierno.reserva = 6000;
  let maxDrift = 0;
  const sinCalleAntes = s.parcelas.filter((p) => p.estado === 'sin_calle').length;
  const viaCalle = orderBuildVia(s, 'via_calle_norte_ext');
  const viaPol = orderBuildVia(s, 'via_camino_poligono');
  for (let d = 1; d <= 30; d++) {
    const prev = computeTotalWorldMoney(s);
    stepHeadlessDay(s);
    const cur = computeTotalWorldMoney(s);
    maxDrift = Math.max(maxDrift, Math.abs(cur - (prev + s.auditEntradasDia - s.auditSalidasDia)));
  }
  const sinCalleDespues = s.parcelas.filter((p) => p.estado === 'sin_calle').length;
  const industriaActiva = s.firmas.some((f) => f.activa && f.rubro === 'industria');
  const poligonoActiva = s.zonas.poligono?.estado === 'activa';
  return {
    viaCalleOk: viaCalle.ok,
    viaPolOk: viaPol.ok,
    poligonoActiva,
    sinCalleAntes,
    sinCalleDespues,
    industriaActiva,
    maxMoneyDrift: Number(maxDrift.toFixed(4)),
    passed: viaCalle.ok && viaPol.ok && poligonoActiva && sinCalleDespues < sinCalleAntes && industriaActiva && maxDrift <= 0.25,
  };
}

console.log('=== CORRIDA A: M0 + G0 (10 semillas, 120 dias) ===');
console.log(JSON.stringify(runCorridaA(), null, 2));
console.log('=== CORRIDA B: M0 + G1 con pandemia forzada desde dia 30 (intensidad=65, duracion=90, 10 semillas, 180 dias) ===');
console.log(JSON.stringify(runCorridaB(65, 90, 46), null, 2));
console.log('=== CORRIDA V2: VIAS + ZONAS + INDUSTRIA + CONSERVACION ===');
console.log(JSON.stringify(runV2SmokeChecks(), null, 2));
