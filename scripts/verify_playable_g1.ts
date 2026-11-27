import {
  ACTION_TABLE,
  AUTOPILOT_CONSTANTS,
  CHAOS_THRESHOLDS,
  DIRECTOR_CONSTANTS,
  MIGRATION_CONSTANTS,
  SERVICE_RADIUS_CONSTANTS,
  STABILITY_PROFILES,
} from '../src/data/catalogs';
import { DEFAULT_WORLD_CONFIG } from '../src/engine/policies';
import {
  buildCausalChain,
  canTriggerSpontaneousChaos,
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
  checkEngineInvariants,
  computeZoneServiceCoverage,
  getEffectiveZone,
  getWorldZones,
} from '../src/engine/worldHelpers';
import { GameState, RoleId, StabilityProfileId, WorldConfig } from '../src/types/game';

interface Args {
  section: string;
  seeds: number;
  years50: number;
}

function parseArgs(): Args {
  let section = 'all';
  let seeds = 10;
  let years50 = 50;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--section=')) section = arg.split('=')[1] || 'all';
    else if (arg.startsWith('--seeds=')) seeds = Math.max(1, Number(arg.split('=')[1]) || 10);
    else if (arg.startsWith('--years=')) years50 = Math.max(1, Number(arg.split('=')[1]) || 50);
  }
  return { section, seeds, years50 };
}

const ARGS = parseArgs();
const SEEDS = Array.from({ length: ARGS.seeds }, (_, i) => i + 1);
const RAREZA_IDS = new Set(
  ACTION_TABLE.filter(
    (a) =>
      a.tipo === 'espontanea' &&
      a.efectos.every((e) => e.id === 'decorativa' || (e.id === 'anima' && (e.intensidad ?? 'baja') === 'baja'))
  ).map((a) => a.id)
);

function mkConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    usarIaGemini: false,
    ...overrides,
  };
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function runDays(state: GameState, days: number, onDay?: (d: number, s: GameState) => void): void {
  for (let d = 1; d <= days; d++) {
    stepHeadlessDay(state);
    onDay?.(d, state);
    if (state.resultado.estado !== 'jugando') break;
  }
}

// ---------------------------------------------------------------------------
// 2a. Perfiles de estabilidad (G0) + perillas MUNDO §14
// ---------------------------------------------------------------------------
function runSection2a(): void {
  console.log('\n=== [2a] PERFILES DE ESTABILIDAD (sin gobernador, G0) ===');
  for (const profile of ['estable', 'normal', 'fragil', 'extremo'] as StabilityProfileId[]) {
    const days = 365 * 2;
    let collapses = 0;
    let hadCrisisAndRecovered = 0;
    let totalCrises = 0;
    let invFails = 0;
    let chainSample = '';
    const vivosEnd: number[] = [];
    const resEnd: number[] = [];

    for (const seed of SEEDS) {
      const s = createInitialGameState(
        mkConfig({ perfilEstabilidad: profile, nivelGobernador: 'G0', estadoAutomatico: true, semilla: seed })
      );
      s.devMode = true;
      let inCrisis = false;
      let recoveredHere = false;
      let crisisCount = 0;
      let maxInv = 0;

      runDays(s, days, (_d, st) => {
        const dv = deriveCommunityStats(st);
        const crisisNow =
          dv.hambreCriticaPct > 15 ||
          dv.descontentosPct > 35 ||
          dv.callePct > 8 ||
          st.gobierno.finanzas.impago;
        if (crisisNow && !inCrisis) {
          inCrisis = true;
          crisisCount++;
        } else if (!crisisNow && inCrisis) {
          inCrisis = false;
          recoveredHere = true;
        }
        const inv = checkEngineInvariants(st, { checkMoney: false });
        if (inv.length > maxInv) maxInv = inv.length;
      });

      const colEv = s.eventos.find((e) => e.tipo === 'colapso');
      if (colEv) {
        collapses++;
        if (!chainSample) {
          const ch = buildCausalChain(s, colEv.id, `Colapso (${colEv.causaColapso})`);
          chainSample = `seed=${seed} D${colEv.dia} causa=${colEv.causaColapso} val=${colEv.valor} pasos=${ch.length}: ${ch
            .map((c) => c.titulo)
            .join(' <- ')}`;
        }
      }
      if (recoveredHere) hadCrisisAndRecovered++;
      totalCrises += crisisCount;
      if (maxInv > 0) invFails++;
      vivosEnd.push(deriveCommunityStats(s).vivos);
      resEnd.push(s.gobierno.reserva);
    }

    console.log(
      `Perfil=${profile.padEnd(7)} (2y × ${SEEDS.length} seeds): colapsos=${collapses}/${SEEDS.length}, crisisTotal=${totalCrises}, recuperados=${hadCrisisAndRecovered}/${SEEDS.length}, vivosMed=${avg(vivosEnd).toFixed(1)}, resMed=$${Math.round(avg(resEnd))}, invFails=${invFails}${chainSample ? ` | ${chainSample}` : ''}`
    );
  }
}

// ---------------------------------------------------------------------------
// 2a-knobs. Perillas de estabilidad (MUNDO §14) movidas de a una
// ---------------------------------------------------------------------------
function runSectionKnobs(): void {
  console.log('\n=== [2a-knobs] SENSIBILIDAD INDIVIDUAL PERILLAS MUNDO §14 (10 seeds × 180d) ===');

  const testPair = (
    label: string,
    metricName: string,
    runOne: (seed: number, high: boolean) => number,
    expectedDir: 'up' | 'down'
  ) => {
    const lowVals = SEEDS.map((sd) => runOne(sd, false));
    const highVals = SEEDS.map((sd) => runOne(sd, true));
    const mLow = avg(lowVals);
    const mHigh = avg(highVals);
    const ok = expectedDir === 'up' ? mHigh > mLow : mHigh < mLow;
    console.log(
      `${ok ? 'OK  ' : 'WARN'} ${label.padEnd(32)} | ${metricName}: bajo=${mLow.toFixed(2)} -> alto=${mHigh.toFixed(2)} (esperado: ${expectedDir})`
    );
  };

  testPair(
    'Caos: ofertasPorDia (0 vs 5)',
    'accionesEspontaneas',
    (seed, high) => {
      const orig = DIRECTOR_CONSTANTS.ofertasPorDia;
      (DIRECTOR_CONSTANTS as { ofertasPorDia: number }).ofertasPorDia = high ? 5 : 0;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        runDays(s, 120);
        return s.eventos.filter((e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/motor')).length;
      } finally {
        (DIRECTOR_CONSTANTS as { ofertasPorDia: number }).ofertasPorDia = orig;
      }
    },
    'up'
  );

  testPair(
    'Caos: maxAccionesPorPeriodo (1 vs 8)',
    'focosEspontaneos',
    (seed, high) => {
      const s = createInitialGameState(
        mkConfig({
          semilla: seed,
          caos: { ...DEFAULT_WORLD_CONFIG.caos, maxAccionesPorPeriodo: high ? 8 : 1 },
        })
      );
      runDays(s, 120);
      return s.eventos.filter(
        (e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/motor') && !RAREZA_IDS.has(e.accion)
      ).length;
    },
    'up'
  );

  testPair(
    'Caos: kContagioGlobal (0 vs 2.5)',
    'contagios',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.kContagioGlobal;
      STABILITY_PROFILES.normal.kContagioGlobal = high ? 2.5 : 0;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        runDays(s, 120);
        return s.eventos.filter((e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/contagio')).length;
      } finally {
        STABILITY_PROFILES.normal.kContagioGlobal = orig;
      }
    },
    'up'
  );

  testPair(
    'Caos: respiroUmbral (0 vs 65)',
    'focosNoRareza',
    (seed, high) => {
      const s = createInitialGameState(
        mkConfig({
          semilla: seed,
          caos: { ...DEFAULT_WORLD_CONFIG.caos, respiroSiSatisfaccionMediaMenorA: high ? 65 : 0 },
        })
      );
      runDays(s, 120);
      return s.eventos.filter(
        (e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/motor') && !RAREZA_IDS.has(e.accion)
      ).length;
    },
    'down'
  );

  testPair(
    'Clima: escalaFenomenos (0.5 vs 1.8)',
    'satisfaccionFinal',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.escalaFenomenos;
      STABILITY_PROFILES.normal.escalaFenomenos = high ? 1.8 : 0.5;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed, escenarioId: 'zombies', nivelGobernador: 'G0', estadoAutomatico: true }));
        runDays(s, 120);
        return deriveCommunityStats(s).satisfaccionMedia;
      } finally {
        STABILITY_PROFILES.normal.escalaFenomenos = orig;
      }
    },
    'down'
  );

  testPair(
    'Clima: avisoDias (0 vs 10)',
    'amenazaEnInicio',
    (seed, high) => {
      const s = createInitialGameState(mkConfig({ semilla: seed, cantidadMedios: 2 }));
      s.clima.fenomenos = [
        {
          id: 'fen_aviso_test',
          tipo: 'plaga_zombie',
          nombre: 'Brote Prueba',
          intensidad: 55,
          inicioDia: 25,
          duracionDias: 20,
          avisoDias: high ? 10 : 0,
          origen: 'norte',
        },
      ];
      runDays(s, 24);
      return deriveCommunityStats(s).amenaza.norte ?? 0;
    },
    'up'
  );

  testPair(
    'Holgura: holguraInicial (0.6 vs 1.5)',
    'reservaD90',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.holguraInicial;
      STABILITY_PROFILES.normal.holguraInicial = high ? 1.5 : 0.6;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        runDays(s, 90);
        return s.gobierno.reserva;
      } finally {
        STABILITY_PROFILES.normal.holguraInicial = orig;
      }
    },
    'up'
  );

  testPair(
    'Servicios: coberturaInicial (0.3 vs 1.0)',
    'salud+policiaInit',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.coberturaInicial;
      STABILITY_PROFILES.normal.coberturaInicial = high ? 1.0 : 0.3;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        const dv = deriveCommunityStats(s);
        return dv.roles.policia + dv.roles.medico;
      } finally {
        STABILITY_PROFILES.normal.coberturaInicial = orig;
      }
    },
    'up'
  );

  testPair(
    'Demografía: maxLlegadas (0 vs 6)',
    'vivosD180',
    (seed, high) => {
      const orig = MIGRATION_CONSTANTS.maxLlegadas;
      (MIGRATION_CONSTANTS as { maxLlegadas: number }).maxLlegadas = high ? 6 : 0;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        runDays(s, 180);
        return deriveCommunityStats(s).vivos;
      } finally {
        (MIGRATION_CONSTANTS as { maxLlegadas: number }).maxLlegadas = orig;
      }
    },
    'up'
  );

  testPair(
    'Demografía: pctMenores (12 vs 32)',
    'pctMenoresD1',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.pctMenores;
      STABILITY_PROFILES.normal.pctMenores = high ? 32 : 12;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        return deriveCommunityStats(s).pctMenores;
      } finally {
        STABILITY_PROFILES.normal.pctMenores = orig;
      }
    },
    'up'
  );

  testPair(
    'Demografía: pctJubilados (6 vs 22)',
    'pctJubiladosD1',
    (seed, high) => {
      const orig = STABILITY_PROFILES.normal.pctJubilados;
      STABILITY_PROFILES.normal.pctJubilados = high ? 22 : 6;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        return deriveCommunityStats(s).pctJubilados;
      } finally {
        STABILITY_PROFILES.normal.pctJubilados = orig;
      }
    },
    'up'
  );

  testPair(
    'Territorio: nRios + nivelAgua (bajo vs alto)',
    'baldosasAgua',
    (seed, high) => {
      const oR = STABILITY_PROFILES.normal.nRios;
      const oA = STABILITY_PROFILES.normal.nivelAgua;
      STABILITY_PROFILES.normal.nRios = high ? 4 : 0;
      STABILITY_PROFILES.normal.nivelAgua = high ? 0.30 : 0.12;
      try {
        const s = createInitialGameState(mkConfig({ semilla: seed }));
        let water = 0;
        for (const row of s.mapaGrid.terreno) for (const t of row) if (t === 'agua') water++;
        return water;
      } finally {
        STABILITY_PROFILES.normal.nRios = oR;
        STABILITY_PROFILES.normal.nivelAgua = oA;
      }
    },
    'up'
  );
}

// ---------------------------------------------------------------------------
// 50y tests (2a estable 50y + 2d autopilot 50y)
// ---------------------------------------------------------------------------
function runSection50y(): void {
  const days = ARGS.years50 * 365;
  console.log(`\n=== [2a/2d-50y] ${ARGS.years50} AÑOS (${days} días) ===`);
  for (const profile of ['estable', 'normal'] as StabilityProfileId[]) {
    const t0 = Date.now();
    const s = createInitialGameState(
      mkConfig({ perfilEstabilidad: profile, nivelGobernador: 'G0', estadoAutomatico: true, semilla: 1 })
    );
    let collapses = 0;
    runDays(s, days, (_d, st) => {
      if (st.eventosDiaActual.some((e) => e.tipo === 'colapso')) collapses++;
    });
    const dv = deriveCommunityStats(s);
    console.log(
      `50y G0 ${profile}: ${(Date.now() - t0)}ms | dia=${s.reloj.dia}, vivos=${dv.vivos}, reserva=$${Math.round(s.gobierno.reserva)}, colapsos=${collapses}, inv=${checkEngineInvariants(s, { checkMoney: false }).length}`
    );
  }
}

// ---------------------------------------------------------------------------
// 2b. Contagio: k=0 apaga, ola nace y muere con foco, topes por rol
// ---------------------------------------------------------------------------
function runSection2b(): void {
  console.log('\n=== [2b] CONTAGIO (10 seeds × 365d) ===');
  let k0Contagios = 0;
  const origK = STABILITY_PROFILES.normal.kContagioGlobal;
  STABILITY_PROFILES.normal.kContagioGlobal = 0;
  try {
    for (const seed of SEEDS) {
      const s = createInitialGameState(mkConfig({ semilla: seed }));
      runDays(s, 365);
      k0Contagios += s.eventos.filter((e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/contagio')).length;
    }
  } finally {
    STABILITY_PROFILES.normal.kContagioGlobal = origK;
  }

  let wavesStarted = 0;
  let orphanedContagions = 0;
  let capViolations = 0;
  let maxSimultaneousWave = 0;
  let totalContagionEvents = 0;

  for (const seed of SEEDS) {
    const s = createInitialGameState(mkConfig({ semilla: seed }));
    runDays(s, 365, (_d, st) => {
      const activeZones = getWorldZones(st).length;
      const focosByKey = new Map<string, Set<string>>();
      const roleTotal: Partial<Record<RoleId, number>> = {};
      const roleSpontOut: Partial<Record<RoleId, number>> = {};

      for (const n of st.npcs) {
        if (!n.vivo) continue;
        roleTotal[n.rol] = (roleTotal[n.rol] ?? 0) + 1;
        if (n.accionIa) {
          const ez = getEffectiveZone(n, activeZones);
          if (n.accionIa.esFoco) {
            const key = `${ez}|${n.accionIa.id}`;
            if (!focosByKey.has(key)) focosByKey.set(key, new Set());
            focosByKey.get(key)!.add(n.id);
          }
          if (n.accionIa.tipo === 'espontanea' && n.accionIa.fueraDePuesto) {
            roleSpontOut[n.rol] = (roleSpontOut[n.rol] ?? 0) + 1;
          }
        }
      }

      const waveCounts = new Map<string, number>();
      for (const n of st.npcs) {
        if (!n.vivo || !n.accionIa || n.accionIa.esFoco) continue;
        const ez = getEffectiveZone(n, activeZones);
        const key = `${ez}|${n.accionIa.id}`;
        const fSet = focosByKey.get(key);
        if (!fSet || (n.accionIa.focoNpcId && !fSet.has(n.accionIa.focoNpcId))) {
          orphanedContagions++;
        }
        waveCounts.set(key, (waveCounts.get(key) ?? 0) + 1);
      }
      for (const c of waveCounts.values()) {
        if (c > maxSimultaneousWave) maxSimultaneousWave = c;
      }
      for (const [r, out] of Object.entries(roleSpontOut)) {
        const tot = roleTotal[r as RoleId] ?? 1;
        // Solo cuenta focos + contagios de acciones espontáneas antes de cambios de rol de paso 12
        const pct = ((out ?? 0) / tot) * 100;
        if (pct > st.config.caos.maxPctRolFueraDePuesto + 5) capViolations++;
      }
    });
    const evCont = s.eventos.filter((e) => e.tipo === 'accion_inicio' && e.origen?.endsWith('/contagio')).length;
    totalContagionEvents += evCont;
    if (evCont > 0) wavesStarted++;
  }

  console.log(
    `k_contagio_global=0 -> contagios=${k0Contagios} (esperado 0) | k=1.0 -> olasEnSemillas=${wavesStarted}/${SEEDS.length}, eventosContagio=${totalContagionEvents}, maxOlaSimultanea=${maxSimultaneousWave}, huerfanos=${orphanedContagions}, violacionesTopeRol=${capViolations}`
  );
}

// ---------------------------------------------------------------------------
// 2c. Rarezas: continuas y sin consumir cupo de max_acciones_por_periodo
// ---------------------------------------------------------------------------
function runSection2c(): void {
  console.log('\n=== [2c] RAREZAS (10 seeds × 365d) ===');
  let seedsWithEarlyMidLate = 0;
  let totalRarezas = 0;
  let consumedMainCapViolations = 0;
  let respiroBlockedRareza = 0;

  for (const seed of SEEDS) {
    const s = createInitialGameState(mkConfig({ semilla: seed }));
    let early = 0, mid = 0, late = 0;
    runDays(s, 365, (d, st) => {
      const dayRarezas = st.eventosDiaActual.filter(
        (e) => e.tipo === 'accion_inicio' && RAREZA_IDS.has(e.accion)
      ).length;
      if (d <= 120) early += dayRarezas;
      else if (d <= 240) mid += dayRarezas;
      else late += dayRarezas;
      if (st.caosTracker.accionesEnVentana > st.config.caos.maxAccionesPorPeriodo) {
        consumedMainCapViolations++;
      }
    });
    if (early > 0 && mid > 0 && late > 0) seedsWithEarlyMidLate++;
    totalRarezas += early + mid + late;

    // Prueba directa: tope principal lleno + respiro activo NO bloquean rarezas
    const sCap = createInitialGameState(mkConfig({ semilla: seed }));
    runDays(sCap, 10);
    sCap.caosTracker.accionesEnVentana = sCap.config.caos.maxAccionesPorPeriodo;
    sCap.caosTracker.rarezasEnVentana = 0;
    for (const n of sCap.npcs) if (n.vivo) n.variables.satisfaccion = 20;
    const gate = canTriggerSpontaneousChaos(sCap);
    stepHeadlessDay(sCap);
    const accionesDespues = sCap.caosTracker.accionesEnVentana;
    if (gate.allowed || accionesDespues > sCap.config.caos.maxAccionesPorPeriodo) {
      respiroBlockedRareza++;
    }
  }

  console.log(
    `Rarezas en las 3 etapas (1-120/121-240/241-365): ${seedsWithEarlyMidLate}/${SEEDS.length} semillas, totalRarezas=${totalRarezas} (prom=${(totalRarezas / SEEDS.length).toFixed(1)}/año), violacionesCupo=${consumedMainCapViolations}, pruebaRespiro/Tope=${respiroBlockedRareza}`
  );
}

// ---------------------------------------------------------------------------
// 2d. Quiebra de constructoras -> obra directa + nacen constructoras nuevas
// ---------------------------------------------------------------------------
function runSection2d(): void {
  console.log('\n=== [2d] QUIEBRA DE CONSTRUCTORAS Y OBRA DIRECTA (10 seeds × 240d) ===');
  let seedsDirectWork = 0;
  let seedsNewConstructora = 0;
  let totalDirectWorks = 0;
  let totalNewConstr = 0;

  for (const seed of SEEDS) {
    const s = createInitialGameState(mkConfig({ semilla: seed }));
    s.gobierno.reserva = 18000;
    runDays(s, 14);
    // Quebrar todas las constructoras activas y dar fondos + demanda de servicio/vía
    for (const f of s.firmas) {
      if (f.rubro === 'construccion') {
        f.activa = false;
        f.caja = -500;
        f.empleados = [];
      }
    }
    for (const n of s.npcs) {
      if (n.vivo && n.rol === 'constructor') {
        n.rol = 'desempleado';
        n.empleadorId = null;
      }
    }
    for (const z of Object.keys(s.zonas)) {
      s.demandaSueloRachas[`${z}:residencial`] = 4;
    }
    // Asegurar al menos un par de emprendedores con ahorro para verificar nacimiento posterior
    for (const n of s.npcs.filter((x) => x.vivo && x.edad >= 18 && x.edad < 65).slice(0, 6)) {
      n.personalidad.codicia = 90;
      n.economia.propensionEmprender = 88;
      const hog = s.hogares.find((h) => h.id === n.hogarId);
      if (hog) hog.dinero = Math.max(hog.dinero, 500);
    }

    runDays(s, 210);
    const directEvents = s.eventos.filter(
      (e) => (e.tipo === 'obra_inicio' || e.tipo === 'via_inicio') && e.causa === 'estado:obra_directa'
    ).length;
    const newConstr = s.firmas.filter(
      (f) => f.rubro === 'construccion' && f.activa && f.diaFundacion && f.diaFundacion > 14
    ).length;
    if (directEvents > 0) seedsDirectWork++;
    if (newConstr > 0) seedsNewConstructora++;
    totalDirectWorks += directEvents;
    totalNewConstr += newConstr;
  }

  console.log(
    `Obra directa ejecutada: ${seedsDirectWork}/${SEEDS.length} semillas (total=${totalDirectWorks} obras) | Nuevas constructoras fundadas: ${seedsNewConstr}/${SEEDS.length} semillas (total=${totalNewConstr})`
  );
}

// ---------------------------------------------------------------------------
// 2e. Escala 100 / 500 / 5000
// ---------------------------------------------------------------------------
function runSection2e(): void {
  console.log('\n=== [2e] ESCALA 100 / 500 / 5000 ===');
  for (const pop of [100, 500, 5000]) {
    const testSeeds = pop === 5000 ? [1, 2, 3] : [1, 2, 3, 4, 5];
    let okCount = 0;
    let formulaDesc = '';
    for (const seed of testSeeds) {
      const s = createInitialGameState(mkConfig({ poblacionInicial: pop, semilla: seed }));
      const activeZones = getWorldZones(s);
      const urbanInPreset = 9; // mapa_elecciones.json tiene 9 activas + 2 no_urbanizada
      const expected = Math.max(4, Math.min(Math.min(12, urbanInPreset), Math.round(pop / AUTOPILOT_CONSTANTS.personasPorZona)));
      const counts = new Map<string, number>();
      for (const z of activeZones) counts.set(z, 0);
      for (const n of s.npcs) {
        if (n.vivo) counts.set(n.zona, (counts.get(n.zona) ?? 0) + 1);
      }
      const emptyActive = [...counts.values()].filter((c) => c === 0).length;
      const centroBlds = new Set(
        s.parcelas
          .filter((p) => p.zona === 'centro' && p.edificio?.activo)
          .map((p) => p.edificio!.tipo)
      );
      const hasCore4 =
        centroBlds.has('hospital') &&
        centroBlds.has('comisaria') &&
        centroBlds.has('escuela') &&
        centroBlds.has('universidad');
      if (activeZones.length === expected && emptyActive === 0 && hasCore4) okCount++;
      formulaDesc = `zonas=${activeZones.length} (fórmula=${Math.round(pop / AUTOPILOT_CONSTANTS.personasPorZona)}, topePreset=${urbanInPreset}), vacías=${emptyActive}, core4Centro=${hasCore4}, popReal=${s.npcs.length}`;
    }
    console.log(`Pop=${String(pop).padEnd(4)}: ${okCount}/${testSeeds.length} OK · ${formulaDesc}`);
  }
}

// ---------------------------------------------------------------------------
// 2f. Determinismo y guardado/carga (10 seeds Elecciones G1)
// ---------------------------------------------------------------------------
function runSection2f(): void {
  console.log('\n=== [2f] DETERMINISMO Y GUARDADO/CARGA JSON EN ELECCIONES G1 (10 seeds × 365d) ===');
  let exactDet = 0;
  let exactSaveLoad = 0;

  const applyFixedPlan = (d: number, st: GameState) => {
    if (d === 15) {
      setGovernorLeverObjetivo(st, 'impuesto', 34);
      setGovernorLeverObjetivo(st, 'nivelObras', 3);
      const freeEsc = st.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, 'escuela'));
      if (freeEsc) orderBuildInParcela(st, freeEsc.id, 'escuela');
    } else if (d === 60) {
      const closed = st.tramos.find((t) => !t.construida && !t.enObra);
      if (closed) orderBuildVia(st, closed.id);
    } else if (d === 150) {
      setGovernorLeverObjetivo(st, 'salarioPublico', 105);
      const builtState = st.parcelas.find((p) => p.estado === 'ocupada' && p.edificio?.dueno === 'estado' && p.edificio.tipo === 'escuela' && p.zona !== 'centro');
      if (builtState) orderDemolishParcela(st, builtState.id);
    }
  };

  for (const seed of SEEDS) {
    const cfg = mkConfig({
      escenarioId: 'elecciones',
      nivelMundo: 'M3',
      nivelGobernador: 'G1',
      estadoAutomatico: false,
      semilla: seed,
    });
    const a = createInitialGameState(cfg);
    const b = createInitialGameState(cfg);
    let midLoaded: GameState | null = null;

    runDays(a, 365, applyFixedPlan);
    for (let d = 1; d <= 365; d++) {
      if (b.resultado.estado === 'jugando') {
        stepHeadlessDay(b);
        applyFixedPlan(d, b);
      }
      if (d === 120) {
        midLoaded = JSON.parse(JSON.stringify(b)) as GameState;
      } else if (midLoaded && midLoaded.resultado.estado === 'jugando') {
        stepHeadlessDay(midLoaded);
        applyFixedPlan(d, midLoaded);
      }
    }

    const dA = deriveCommunityStats(a);
    const dB = deriveCommunityStats(b);
    const dL = midLoaded ? deriveCommunityStats(midLoaded) : dA;

    const detOk =
      a.rngState === b.rngState &&
      a.gobierno.reserva === b.gobierno.reserva &&
      dA.apoyoPct === dB.apoyoPct &&
      dA.vivos === dB.vivos &&
      a.eventos.length === b.eventos.length;
    const loadOk =
      Boolean(midLoaded) &&
      midLoaded!.rngState === b.rngState &&
      midLoaded!.gobierno.reserva === b.gobierno.reserva &&
      dL.apoyoPct === dB.apoyoPct &&
      dL.vivos === dB.vivos &&
      midLoaded!.eventos.length === b.eventos.length;
    if (detOk) exactDet++;
    if (loadOk) exactSaveLoad++;
  }
  console.log(`Determinismo idéntico=${exactDet}/${SEEDS.length} | Save/Load D120->D365 idéntico=${exactSaveLoad}/${SEEDS.length}`);
}

// ---------------------------------------------------------------------------
// 2g. Verificaciones MOTOR §6 (minimo, economia, completo, fiscal, modulos off)
// ---------------------------------------------------------------------------
function runSection2g(): void {
  console.log('\n=== [2g] INVARIANTES MOTOR §6 POR PERFIL Y MÓDULO APAGADO (180d) ===');
  const variants: Array<{ name: string; patch: (cfg: WorldConfig, st: GameState) => void }> = [
    { name: 'minimo (M0)', patch: () => {} },
    { name: 'economia (M1)', patch: () => {} },
    { name: 'intermedio (M2)', patch: () => {} },
    { name: 'completo (M3)', patch: () => {} },
    { name: 'fiscal (M4)', patch: () => {} },
    { name: 'sin lectura', patch: (c) => { c.lecturaActiva = false; } },
    { name: 'sin medios (0)', patch: (c) => { c.cantidadMedios = 0; } },
    { name: 'sin IA', patch: (c) => { c.usarIaGemini = false; } },
    { name: 'sin clima', patch: (_c, s) => { s.clima.fenomenos = []; s.clima.proximoEventoDia = 99999; } },
    { name: 'sin migracion', patch: () => {} },
  ];

  for (const v of variants) {
    const level =
      v.name.includes('M0')
        ? 'M0'
        : v.name.includes('M1')
        ? 'M1'
        : v.name.includes('M2')
        ? 'M2'
        : v.name.includes('M4')
        ? 'M4'
        : 'M3';
    const origMig = MIGRATION_CONSTANTS.maxLlegadas;
    if (v.name === 'sin migracion') {
      (MIGRATION_CONSTANTS as { maxLlegadas: number }).maxLlegadas = 0;
    }
    let fails = 0;
    let firstErr = '';
    try {
      for (const seed of [1, 2, 3, 4, 5]) {
        const cfg = mkConfig({ nivelMundo: level, economiaModulo: level === 'M4' ? 'fiscal' : 'base', semilla: seed });
        const s = createInitialGameState(cfg);
        v.patch(s.config, s);
        runDays(s, 180, (_d, st) => {
          if (v.name === 'sin clima') {
            st.clima.fenomenos = [];
            st.clima.proximoEventoDia = 99999;
          }
          const errs = checkEngineInvariants(st, { checkMoney: true });
          if (errs.length > 0) {
            fails++;
            if (!firstErr) firstErr = errs[0];
          }
        });
      }
    } finally {
      (MIGRATION_CONSTANTS as { maxLlegadas: number }).maxLlegadas = origMig;
    }
    console.log(`${fails === 0 ? 'OK  ' : 'FAIL'} ${v.name.padEnd(18)}: violaciones=${fails}${firstErr ? ` (${firstErr})` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Causalidad de construir (escuela, hospital, comisaria, via, 1y sin construir)
// ---------------------------------------------------------------------------
function runSection3(): void {
  console.log('\n=== [3] CAUSALIDAD DE CONSTRUIR (10 seeds antes/después) ===');

  // Escuela (pop=200 => 8 zonas, periferia sin radio de escuela de centro)
  let escDeltaEstudian: number[] = [];
  let hospDeltaInternados: number[] = [];
  let hospDeltaEspera: number[] = [];
  let comDeltaMiedo: number[] = [];
  let comDeltaOrden: number[] = [];
  let viaDeltaLibres: number[] = [];
  let zeroBuildCovEnd: number[] = [];
  let activeBuildCovEnd: number[] = [];
  let zeroBuildInvs = 0;

  for (const seed of SEEDS) {
    // 1) Escuela en noroeste (pop=200 activa noroeste a distancia 2 de centro)
    {
      const cfg = mkConfig({ poblacionInicial: 200, nivelGobernador: 'G1', estadoAutomatico: false, semilla: seed });
      const sCtrl = createInitialGameState(cfg);
      const sTrt = createInitialGameState(cfg);
      const targetP = sTrt.parcelas.find(
        (p) => p.zona === 'noroeste' && p.estado === 'libre' && canBuildTypeInParcela(p, 'escuela')
      ) ?? sTrt.parcelas.find((p) => p.zona !== 'centro' && p.estado === 'libre' && canBuildTypeInParcela(p, 'escuela'));
      if (targetP) orderBuildInParcela(sTrt, targetP.id, 'escuela');
      runDays(sCtrl, 35);
      runDays(sTrt, 35);
      const stCtrl = sCtrl.npcs.filter((n) => n.vivo && n.edad < 18 && n.educacion.estudiando).length;
      const stTrt = sTrt.npcs.filter((n) => n.vivo && n.edad < 18 && n.educacion.estudiando).length;
      escDeltaEstudian.push(stTrt - stCtrl);
    }

    // 2) Hospital adicional bajo pandemia
    {
      const cfg = mkConfig({ poblacionInicial: 200, nivelGobernador: 'G1', estadoAutomatico: false, semilla: seed });
      const sCtrl = createInitialGameState(cfg);
      const sTrt = createInitialGameState(cfg);
      const fen = { id: 'pan_test', tipo: 'pandemia' as const, nombre: 'Gripe', intensidad: 75, inicioDia: 6, duracionDias: 30, avisoDias: 2 };
      sCtrl.clima.fenomenos.push(structuredClone(fen));
      sTrt.clima.fenomenos.push(structuredClone(fen));
      const pH = sTrt.parcelas.find((p) => p.estado === 'libre' && canBuildTypeInParcela(p, 'hospital'));
      if (pH) orderBuildInParcela(sTrt, pH.id, 'hospital');
      let intC = 0, intT = 0, espC = 0, espT = 0;
      for (let d = 1; d <= 36; d++) {
        stepHeadlessDay(sCtrl);
        stepHeadlessDay(sTrt);
        if (d >= 12) {
          const dc = deriveCommunityStats(sCtrl);
          const dt = deriveCommunityStats(sTrt);
          intC += dc.internados;
          intT += dt.internados;
          espC += dc.esperandoCama;
          espT += dt.esperandoCama;
        }
      }
      hospDeltaInternados.push((intT - intC) / 25);
      hospDeltaEspera.push((espT - espC) / 25);
    }

    // 3) Comisaría en zona fuera de radio (noroeste a pop=200)
    {
      const cfg = mkConfig({ poblacionInicial: 200, nivelGobernador: 'G1', estadoAutomatico: false, semilla: seed });
      const sCtrl = createInitialGameState(cfg);
      const sTrt = createInitialGameState(cfg);
      const pC = sTrt.parcelas.find(
        (p) => p.zona === 'noroeste' && p.estado === 'libre' && canBuildTypeInParcela(p, 'comisaria')
      ) ?? sTrt.parcelas.find((p) => p.zona !== 'centro' && p.estado === 'libre' && canBuildTypeInParcela(p, 'comisaria'));
      const targetZ = pC?.zona ?? 'noroeste';
      if (pC) orderBuildInParcela(sTrt, pC.id, 'comisaria');
      runDays(sCtrl, 35);
      runDays(sTrt, 35);
      const fearAvg = (st: GameState) => {
        const list = st.npcs.filter((n) => n.vivo && n.zona === targetZ);
        return list.length === 0 ? 0 : list.reduce((a, n) => a + n.variables.miedo, 0) / list.length;
      };
      const ordC = deriveCommunityStats(sCtrl).orden[targetZ] ?? 0;
      const ordT = deriveCommunityStats(sTrt).orden[targetZ] ?? 0;
      comDeltaMiedo.push(fearAvg(sTrt) - fearAvg(sCtrl));
      comDeltaOrden.push(ordT - ordC);
    }

    // 4) Camino o puente -> aparecen lotes libres
    {
      const cfg = mkConfig({ poblacionInicial: 100, nivelGobernador: 'G1', estadoAutomatico: false, semilla: seed });
      const sCtrl = createInitialGameState(cfg);
      const sTrt = createInitialGameState(cfg);
      const tramo = sTrt.tramos.find((t) => !t.construida && !t.enObra && (t.parcelasAbiertas?.length ?? 0) > 0) ??
        sTrt.tramos.find((t) => !t.construida && !t.enObra);
      if (tramo) orderBuildVia(sTrt, tramo.id);
      runDays(sCtrl, 20);
      runDays(sTrt, 20);
      const libresC = sCtrl.parcelas.filter((p) => p.estado === 'libre').length;
      const libresT = sTrt.parcelas.filter((p) => p.estado === 'libre').length;
      viaDeltaLibres.push(libresT - libresC);
    }

    // 5) 1 año sin construir vs construyendo en G1
    {
      const cfg = mkConfig({ poblacionInicial: 100, nivelGobernador: 'G1', estadoAutomatico: false, semilla: seed });
      const sZero = createInitialGameState(cfg);
      const sBuild = createInitialGameState(cfg);
      sZero.devMode = true;
      for (const tipo of ['hospital', 'comisaria', 'escuela'] as const) {
        const p = sBuild.parcelas.find((x) => x.estado === 'libre' && canBuildTypeInParcela(x, tipo));
        if (p) orderBuildInParcela(sBuild, p.id, tipo);
      }
      const tr = sBuild.tramos.find((t) => !t.construida && !t.enObra);
      if (tr) orderBuildVia(sBuild, tr.id);
      runDays(sZero, 365, (_d, st) => {
        zeroBuildInvs += checkEngineInvariants(st, { checkMoney: false }).length;
      });
      runDays(sBuild, 365);
      const covZ = computeZoneServiceCoverage(sZero);
      const covB = computeZoneServiceCoverage(sBuild);
      const meanCov = (c: Record<string, { salud: number; policia: number; escuela: number }>) => {
        const vals = Object.values(c);
        return avg(vals.map((v) => (v.salud + v.policia + v.escuela) / 3));
      };
      zeroBuildCovEnd.push(meanCov(covZ));
      activeBuildCovEnd.push(meanCov(covB));
    }
  }

  console.log(`Escuela    -> Δ menores estudiando (trt-ctrl): ${avg(escDeltaEstudian).toFixed(2)} (min=${Math.min(...escDeltaEstudian)})`);
  console.log(`Hospital   -> Δ internados/día: +${avg(hospDeltaInternados).toFixed(2)} | Δ esperandoCama: ${avg(hospDeltaEspera).toFixed(2)}`);
  console.log(`Comisaría  -> Δ miedo zona: ${avg(comDeltaMiedo).toFixed(2)} | Δ orden zona: +${avg(comDeltaOrden).toFixed(1)}`);
  console.log(`Vía/Puente -> Δ parcelas libres: +${avg(viaDeltaLibres).toFixed(1)}`);
  console.log(`1 año sin construir vs construir -> covMedia=${(avg(zeroBuildCovEnd)*100).toFixed(1)}% vs ${(avg(activeBuildCovEnd)*100).toFixed(1)}%, invFails=${zeroBuildInvs}`);
}

const sec = ARGS.section;
if (sec === 'all' || sec === '2a') runSection2a();
if (sec === 'all' || sec === 'knobs') runSectionKnobs();
if (sec === 'all' || sec === '2b') runSection2b();
if (sec === 'all' || sec === '2c') runSection2c();
if (sec === 'all' || sec === '2d') runSection2d();
if (sec === 'all' || sec === '2e') runSection2e();
if (sec === 'all' || sec === '2f') runSection2f();
if (sec === 'all' || sec === '2g') runSection2g();
if (sec === 'all' || sec === '3') runSection3();
if (sec === '50y') runSection50y();
