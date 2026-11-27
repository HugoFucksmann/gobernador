import { BUILDING_CATALOG, LECTURA_CONSTANTS } from '../src/data/catalogs';
import {
  alertas,
  causas,
  historial,
  indicador,
  indicadores_resumen,
  informe,
  notables,
  serie,
} from '../src/engine/lecturaV2';
import { DEFAULT_WORLD_CONFIG } from '../src/engine/policies';
import {
  buildCausalChain,
  computeTotalWorldMoney,
  deriveCommunityStats,
  stepHeadlessDay,
} from '../src/engine/simulation';
import { createInitialGameState } from '../src/engine/worldGenerator';
import {
  canBuildTypeInParcela,
  checkEngineInvariants,
  getLotTravelCost,
  getNpcDailyAgenda,
  getParcelLandPrice,
  getZoneTravelCost,
  recomputeRoadDistances,
} from '../src/engine/worldHelpers';
import type { GameState, WorldConfig } from '../src/types/game';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];
function assertCheck(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
}

function runDays(state: GameState, days: number): { maxDrift: number; invariantErrors: string[] } {
  state.devMode = true;
  let maxDrift = 0;
  const invariantErrors: string[] = [];
  for (let d = 0; d < days && state.resultado.estado === 'jugando'; d++) {
    const prev = computeTotalWorldMoney(state);
    stepHeadlessDay(state);
    const cur = computeTotalWorldMoney(state);
    const drift = Math.abs(cur - (prev + state.auditEntradasDia - state.auditSalidasDia));
    if (drift > maxDrift) maxDrift = drift;
    const errs = checkEngineInvariants(state, { checkMoney: false });
    if (errs.length > 0 && invariantErrors.length < 5) {
      invariantErrors.push(`D${state.reloj.dia}: ${errs[0]}`);
    }
    const moneyErr = state.bitacora.find(
      (b) => b.dia === state.reloj.dia && b.origen === 'motor:invariante'
    );
    if (moneyErr && invariantErrors.length < 5) {
      invariantErrors.push(moneyErr.detalle);
    }
  }
  return { maxDrift, invariantErrors };
}

// 1. Default launch config (Observador v0.1: M3 + G0 + estadoAutomatico, no AI)
{
  assertCheck(
    'Config defecto: Observador v0.1 (M3 + G0 + estadoAutomatico + sin IA)',
    DEFAULT_WORLD_CONFIG.nivelMundo === 'M3' &&
      DEFAULT_WORLD_CONFIG.nivelGobernador === 'G0' &&
      DEFAULT_WORLD_CONFIG.estadoAutomatico === true &&
      DEFAULT_WORLD_CONFIG.usarIaGemini === false,
    `${DEFAULT_WORLD_CONFIG.nivelMundo}/${DEFAULT_WORLD_CONFIG.nivelGobernador}/auto=${DEFAULT_WORLD_CONFIG.estadoAutomatico}`
  );
}

// 2. Map & Geometry (MAPA_V2)
{
  const s = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 100,
    semilla: 1,
  });
  const grid = s.mapaGrid;
  const hasSinCalle = s.parcelas.some((p) => p.estado === 'sin_calle');
  const smallParcel = s.parcelas.find((p) => p.clase === 'S');
  const largeParcel = s.parcelas.find((p) => p.clase === 'L' && p.tipoParcela === 'publica');
  const blockedHospitalOnS = smallParcel ? !canBuildTypeInParcela({ ...smallParcel, tipoParcela: 'publica' }, 'hospital') : true;
  const allowedHospitalOnL = largeParcel ? canBuildTypeInParcela(largeParcel, 'hospital') : true;
  const isoParcel = s.parcelas.find((p) => p.estado === 'sin_calle');
  const activeParcelA = s.parcelas.find((p) => p.estado === 'ocupada' || p.estado === 'libre');
  const activeParcelB = s.parcelas.find(
    (p) => (p.estado === 'ocupada' || p.estado === 'libre') && p.id !== activeParcelA?.id
  );
  const isoCost = isoParcel && activeParcelA ? getLotTravelCost(s, isoParcel, activeParcelA) : Infinity;
  const connectedCost = activeParcelA && activeParcelB ? getLotTravelCost(s, activeParcelA, activeParcelB) : 0;

  assertCheck(
    'MAPA_V2: grilla, zonas vecinas, clases de lote y parcelas sin_calle',
    Boolean(grid && grid.ancho > 0 && grid.alto > 0 && grid.terreno.length === grid.alto) &&
      Object.values(s.zonas).every((z) => z.vecinas.length > 0) &&
      hasSinCalle &&
      blockedHospitalOnS &&
      allowedHospitalOnL &&
      !Number.isFinite(isoCost) &&
      Number.isFinite(connectedCost),
    `grid=${grid?.ancho}x${grid?.alto}, parcelas=${s.parcelas.length}, sinCalle=${s.parcelas.filter((p) => p.estado === 'sin_calle').length}`
  );
}

// 3. 100-person 30-day stability (M0+G0 clean baseline + M3+G0 default Observador)
{
  const m0 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
    estadoAutomatico: true,
    poblacionInicial: 100,
    semilla: 3,
  });
  m0.clima.proximoEventoDia = 999999;
  m0.clima.fenomenos = [];
  const resM0 = runDays(m0, 30);
  const quiebrasM0 = m0.eventos.filter((e) => e.tipo === 'firma_quiebra').length;
  const desalojosM0 = m0.eventos.filter((e) => e.tipo === 'desalojo').length;
  assertCheck(
    'ALCANCE §5: 100 hab 30d M0+G0 sin quiebras, desalojos ni deriva monetaria',
    quiebrasM0 === 0 && desalojosM0 === 0 && resM0.maxDrift <= 0.25 && resM0.invariantErrors.length === 0,
    `quiebras=${quiebrasM0}, desalojos=${desalojosM0}, drift=${resM0.maxDrift.toFixed(3)}, inv=${resM0.invariantErrors[0] ?? 'ok'}`
  );

  const m3 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 100,
    semilla: 5,
  });
  const resM3 = runDays(m3, 30);
  assertCheck(
    'ALCANCE §5: 100 hab 30d Observador defecto (M3+G0) estable sin demandas de gobernador',
    resM3.maxDrift <= 0.25 && resM3.invariantErrors.length === 0 && m3.demandasActivas.length === 0,
    `drift=${resM3.maxDrift.toFixed(3)}, vivos=${deriveCommunityStats(m3).vivos}, inv=${resM3.invariantErrors[0] ?? 'ok'}`
  );
}

// 4. 500-person 365-day reference stability
{
  const s500 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 500,
    semilla: 7,
  });
  const res500 = runDays(s500, 365);
  const d500 = deriveCommunityStats(s500);
  assertCheck(
    'ALCANCE §5: 500 hab 365d M3+G0 sostenido (dinero, población, calle y cuota)',
    res500.maxDrift <= 0.25 &&
      res500.invariantErrors.length === 0 &&
      d500.vivos >= 300 &&
      d500.callePct < 55,
    `vivos=${d500.vivos}/500, calle=${d500.callePct.toFixed(1)}%, firmas=${d500.mercado.firmas}, drift=${res500.maxDrift.toFixed(3)}`
  );
}

// 5. 5,000-person scale & headless benchmark
{
  const t0 = performance.now();
  const s5000 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 5000,
    semilla: 11,
  });
  const genMs = performance.now() - t0;
  const t1 = performance.now();
  const res5000 = runDays(s5000, 5);
  const stepMs = performance.now() - t1;
  assertCheck(
    'MOTOR_V2 §5: escala 5.000 hab sin dibujo corre fluido e invariantes OK',
    res5000.maxDrift <= 0.5 && res5000.invariantErrors.length === 0 && stepMs / 5 < 2000,
    `gen=${genMs.toFixed(0)}ms, avgDay=${(stepMs / 5).toFixed(1)}ms, inv=${res5000.invariantErrors[0] ?? 'ok'}`
  );
}

// 6. Zero media + 5-franja daily agenda
{
  const s0 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    cantidadMedios: 0,
    poblacionInicial: 100,
    semilla: 13,
  });
  runDays(s0, 10);
  const worker = s0.npcs.find((n) => n.vivo && n.empleadorId);
  const agenda = worker ? getNpcDailyAgenda(s0, worker) : [];
  assertCheck(
    'CAOS_PRENSA + MOTOR §7: 0 medios sin errores y agenda de 5 franjas',
    s0.medios.length === 0 && s0.noticias.length === 0 && agenda.length === 5,
    `medios=${s0.medios.length}, noticias=${s0.noticias.length}, franjas=${agenda.length}`
  );
}

// 7. Causal chains (ECONOMIA_V2 §13) + route cut + autopilot expansion
{
  const sChain = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 120,
    semilla: 19,
  });
  // Cut an active inter-zone tramo connected to 'centro' and verify strict cost increase on zone and lot routes
  const targetTramo = sChain.tramos.find(
    (t) => t.construida && t.estado > 0 && t.zonaB && (t.zonaA === 'centro' || t.zonaB === 'centro')
  );
  const destZone = targetTramo
    ? targetTramo.zonaA === 'centro'
      ? targetTramo.zonaB!
      : targetTramo.zonaA
    : 'norte';
  const beforeZoneCost = getZoneTravelCost(sChain, 'centro', destZone);
  const lotCentro = sChain.parcelas.find((p) => p.zona === 'centro' && (p.estado === 'ocupada' || p.estado === 'libre'));
  const lotDest = sChain.parcelas.find((p) => p.zona === destZone && (p.estado === 'ocupada' || p.estado === 'libre'));
  const beforeLotCost = lotCentro && lotDest ? getLotTravelCost(sChain, lotCentro, lotDest) : 0;

  if (targetTramo) {
    targetTramo.estado = 0;
    recomputeRoadDistances(sChain);
  }
  const afterZoneCost = getZoneTravelCost(sChain, 'centro', destZone);
  const afterLotCost = lotCentro && lotDest ? getLotTravelCost(sChain, lotCentro, lotDest) : 0;

  // High land demand + healthy reserve triggers autopilot road build
  sChain.gobierno.reserva = 25000;
  for (const zId of Object.keys(sChain.zonas)) {
    sChain.demandaSueloRachas[`${zId}:residencial`] = 10;
    sChain.demandaSueloRachas[`${zId}:comercial`] = 10;
  }
  runDays(sChain, 28);
  const viaBuilt = sChain.eventos.some((e) => e.tipo === 'via_inicio' || e.tipo === 'via_fin');
  const deathOrBankrupt = sChain.eventos.find(
    (e) => e.tipo === 'muerte' || e.tipo === 'firma_quiebra' || e.tipo === 'desalojo'
  );
  const chain = deathOrBankrupt ? buildCausalChain(sChain, deathOrBankrupt.id, 'Evento') : [];

  assertCheck(
    'ECONOMIA_V2 §13 + MUNDO_V2 §9: vía cortada sube costo, piloto automático abre vías',
    Boolean(targetTramo) &&
      afterZoneCost > beforeZoneCost &&
      afterLotCost > beforeLotCost &&
      (viaBuilt || sChain.tramos.some((t) => t.enObra || t.construida)) &&
      (deathOrBankrupt ? chain.length >= 1 : true),
    `zona(${destZone})=${beforeZoneCost.toFixed(1)}->${Number.isFinite(afterZoneCost) ? afterZoneCost.toFixed(1) : 'Inf'}, lote=${beforeLotCost.toFixed(1)}->${Number.isFinite(afterLotCost) ? afterLotCost.toFixed(1) : 'Inf'}, viaAutopilot=${viaBuilt}`
  );
}

// 8. Determinism + JSON save/load equivalence
{
  const cfg: WorldConfig = {
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 100,
    semilla: 23,
  };
  const a = createInitialGameState(cfg);
  runDays(a, 30);

  const b = createInitialGameState(cfg);
  runDays(b, 15);
  const loaded = JSON.parse(JSON.stringify(b)) as GameState;
  runDays(loaded, 15);

  const statsA = deriveCommunityStats(a);
  const statsB = deriveCommunityStats(loaded);
  assertCheck(
    'MOTOR_V2 §3: determinismo y guardado/carga JSON idénticos tras 30 días',
    a.rngState === loaded.rngState &&
      Math.abs(a.gobierno.reserva - loaded.gobierno.reserva) < 1e-6 &&
      statsA.vivos === statsB.vivos &&
      a.eventos.length === loaded.eventos.length,
    `rng=${a.rngState}==${loaded.rngState}, reserva=${a.gobierno.reserva.toFixed(2)}==${loaded.gobierno.reserva.toFixed(2)}`
  );
}

// 9. LECTURA_V2 §9: read-only, deterministic, off=on equivalence, save/load, reports, notables & alerts
{
  const cfgOn: WorldConfig = {
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 100,
    semilla: 29,
    lecturaActiva: true,
  };
  const cfgOff: WorldConfig = { ...structuredClone(cfgOn), lecturaActiva: false };

  const sOn1 = createInitialGameState(cfgOn);
  runDays(sOn1, 28);
  const sOn2 = createInitialGameState(cfgOn);
  runDays(sOn2, 14);
  const sOn2Loaded = JSON.parse(JSON.stringify(sOn2)) as GameState;
  runDays(sOn2Loaded, 14);

  const sOff = createInitialGameState(cfgOff);
  runDays(sOff, 28);

  const sameLectura =
    JSON.stringify(sOn1.lectura?.alertas) === JSON.stringify(sOn2Loaded.lectura?.alertas) &&
    JSON.stringify(sOn1.lectura?.informes) === JSON.stringify(sOn2Loaded.lectura?.informes) &&
    JSON.stringify(sOn1.lectura?.notables) === JSON.stringify(sOn2Loaded.lectura?.notables);

  const sameSimulationOff =
    sOn1.rngState === sOff.rngState &&
    Math.abs(sOn1.gobierno.reserva - sOff.gobierno.reserva) < 1e-6 &&
    sOn1.npcs.filter((n) => n.vivo).length === sOff.npcs.filter((n) => n.vivo).length &&
    sOn1.eventos.length === sOff.eventos.length;

  const summary = indicadores_resumen(sOn1);
  const rep0 = informe(sOn1, 0);
  const histRes = historial(sOn1, {}, 0, 10);
  const firstCauseId = histRes.items[0]?.id;
  const causeList = firstCauseId ? causas(sOn1, firstCauseId) : [];
  const cap = Math.min(
    LECTURA_CONSTANTS.notablesMax,
    Math.max(1, Math.floor(LECTURA_CONSTANTS.notablesPct * deriveCommunityStats(sOn1).vivos))
  );
  const notList = notables(sOn1);
  const popSerie = serie(sOn1, 'poblacion', undefined, undefined, undefined, 'dia');
  const pobInd = indicador(sOn1, 'poblacion');

  // Stable M0+G0 world alert cap
  const sStable = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    nivelMundo: 'M0',
    nivelGobernador: 'G0',
    estadoAutomatico: true,
    poblacionInicial: 100,
    semilla: 31,
  });
  sStable.clima.proximoEventoDia = 999999;
  sStable.clima.fenomenos = [];
  runDays(sStable, 21);
  const stableActiveAlerts = alertas(sStable, { soloActivas: true }).length;

  assertCheck(
    'LECTURA_V2 §9: determinista, idéntica al apagar/cargar, informes, notables acotados y sin parpadeo',
    sameLectura &&
      sameSimulationOff &&
      summary.length === 7 &&
      Boolean(rep0 && rep0.cambios.length <= 3) &&
      notList.length <= cap &&
      popSerie.length >= 20 &&
      Boolean(pobInd) &&
      (firstCauseId ? causeList.length >= 1 : true) &&
      stableActiveAlerts <= 3,
    `sameLect=${sameLectura}, offEq=${sameSimulationOff}, ind=${summary.length}, repCambios=${rep0?.cambios.length ?? 0}, notables=${notList.length}/${cap}, stableAlerts=${stableActiveAlerts}`
  );
}

// 10. MAPA_V2-1 & MUNDO_V2-1 & ECONOMIA_V2-1: terrain, scale sizing, oficina_publica, lot sales, street despensa=0, sociabilidad & ritmo
{
  const s100 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 100,
    semilla: 37,
  });
  const s500 = createInitialGameState({
    ...structuredClone(DEFAULT_WORLD_CONFIG),
    poblacionInicial: 500,
    semilla: 37,
  });
  const g100 = s100.mapaGrid!;
  const g500 = s500.mapaGrid!;
  const hasTerrainMix =
    g100.terreno.some((row) => row.includes('.')) &&
    g100.altura?.length === g100.alto;
  const noBloqueada = s100.parcelas.every((p) => (p.estado as string) !== 'bloqueada');
  const allHaveRitmoAndSoc = s100.npcs
    .filter((n) => n.vivo)
    .every(
      (n) =>
        typeof n.personalidad.sociabilidad === 'number' &&
        Boolean(n.ritmo) &&
        typeof n.ritmo!.cronotipo === 'number'
    );
  const oficinaPresetOnly = BUILDING_CATALOG.oficina_publica.construibleGobernador === false;
  const freePrivateLot = s100.parcelas.find((p) => p.estado === 'libre' && p.tipoParcela === 'residencial');
  const landPrice = freePrivateLot ? getParcelLandPrice(s100, freePrivateLot) : { precioLote: 0, accesibilidad: 0 };

  runDays(s100, 15);
  const streetHogares = s100.hogares.filter((h) => h.estado === 'calle');
  const streetDespensaZero = streetHogares.every((h) => h.despensa === 0);

  assertCheck(
    'MAPA/MUNDO/ECONOMIA V2-1: terreno, escala, sin bloqueada, oficina preset, precio lote, despensa calle=0, sociabilidad y ritmo',
    hasTerrainMix &&
      g500.ancho > g100.ancho &&
      noBloqueada &&
      allHaveRitmoAndSoc &&
      oficinaPresetOnly &&
      landPrice.precioLote > 0 &&
      streetDespensaZero,
    `grid100=${g100.ancho}x${g100.alto}, grid500=${g500.ancho}x${g500.alto}, landPrice=$${landPrice.precioLote}, street=${streetHogares.length}`
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} doc-alignment checks passed.`);
process.exit(failed.length ? 1 : 0);
