import {
  ACTION_TABLE,
  DEFAULT_TRAMOS,
  DEFAULT_ZONAS,
  DIRECTOR_CONSTANTS,
  ECON_CONSTANTS,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  AiStatus,
  BuildingType,
  ClimatePhenomenon,
  CommunityDerived,
  GameState,
  GovernorComplexityLevel,
  GovernorLevers,
  LeverKey,
  PhenomenonType,
  ServiceLevel,
  WorldComplexityLevel,
  WorldConfig,
  ZoneId,
} from '../types/game';
import { DEFAULT_WORLD_CONFIG, getGovernorLevel } from './policies';
import { initSubsystemRng, nextSeqId, normalizeSeed } from './rng';
import {
  computeTotalWorldMoney,
  counterOfferDemand,
  deriveCommunityStats,
  ExtraLeverKey,
  setExtraLever as setExtraLeverState,
  emitSimEvent,
  MAX_BITACORA_ENTRIES,
  orderBuildInParcela,
  orderBuildVia,
  orderDemolishParcela,
  respondToDemand,
  stepSimulation,
  TICKS_PER_DAY,
} from './simulation';
import {
  buildInitialParcelas,
  createInitialGameState,
  resolveComplexityConfig,
} from './worldGenerator';
import {
  buildSeededNpcRitmo,
  buildTileGridAndSyncMap,
  computeDemandaSuelo,
  recomputeRoadDistances,
} from './worldHelpers';
import { initLecturaState } from './lecturaV2';

export type { ExtraLeverKey };

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AiDirectorResult {
  type: 'press' | 'action' | 'condition';
  apply: (state: GameState) => boolean | void;
  source: 'ia' | 'plantilla';
  status: AiStatus;
}

export interface AiDirectorPort {
  checkHealth(signal?: AbortSignal): Promise<boolean>;
  getRuntimeStatus(usarIaGemini: boolean, serverAvailable: boolean): AiStatus;
  resetSessionError(): void;
  dispatchPressJob(
    state: GameState,
    options?: { allowManualFallback?: boolean; signal?: AbortSignal }
  ): Promise<AiDirectorResult | null>;
  dispatchSpontaneousActionJob(
    state: GameState,
    options?: { signal?: AbortSignal }
  ): Promise<AiDirectorResult | null>;
  dispatchConditionJob(
    state: GameState,
    options?: { signal?: AbortSignal }
  ): Promise<AiDirectorResult | null>;
}

interface GameControllerOptions {
  storage?: StorageAdapter;
  aiDirector?: AiDirectorPort;
}

const NULL_AI_DIRECTOR: AiDirectorPort = {
  checkHealth: async () => false,
  getRuntimeStatus: () => 'plantilla',
  resetSessionError: () => {},
  dispatchPressJob: async () => null,
  dispatchSpontaneousActionJob: async () => null,
  dispatchConditionJob: async () => null,
};

function getDefaultStorage(): StorageAdapter | null {
  try {
    const ls = (globalThis as { localStorage?: StorageAdapter }).localStorage;
    return ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

export interface SaveSlotMeta {
  dia: number;
  escenarioNombre: string;
  savedAt: string;
}

interface GameControllerSnapshot {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiAvailable: boolean;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
  noRender: boolean;
  simStepMs: number;
  manualSaveMeta: SaveSlotMeta | null;
  autoSaveMeta: SaveSlotMeta | null;
}

const SIMULATION_TICK_MS = 167;
const MANUAL_SAVE_KEY = 'el_gobernador_manual_v1';
const AUTO_SAVE_KEY = 'el_gobernador_autosave_v1';

interface StoredSavePayload {
  meta: SaveSlotMeta;
  state: GameState;
}

function isValidSavedGameState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Record<string, unknown>;
  if (!s.reloj || typeof s.reloj !== 'object') return false;
  if (!s.config || typeof s.config !== 'object') return false;
  if (!s.gobierno || typeof s.gobierno !== 'object') return false;
  const gov = s.gobierno as Record<string, unknown>;
  if (!gov.finanzas || typeof gov.finanzas !== 'object') return false;
  if (!gov.indicadores || typeof gov.indicadores !== 'object') return false;
  if (!s.alimento || typeof s.alimento !== 'object') return false;
  if (!s.clima || typeof s.clima !== 'object') return false;
  if (!Array.isArray(s.npcs) || s.npcs.length === 0) return false;
  if (!Array.isArray(s.medios) || !Array.isArray(s.noticias)) return false;
  const sampleNpc = s.npcs[0] as Record<string, unknown> | undefined;
  if (!sampleNpc || !sampleNpc.variables || !sampleNpc.economia || !sampleNpc.hospital || !sampleNpc.mapa) {
    return false;
  }
  return true;
}

function readSaveMeta(storage: StorageAdapter | null, key: string): SaveSlotMeta | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSavePayload>;
    if (!parsed?.meta || typeof parsed.meta.dia !== 'number' || !isValidSavedGameState(parsed.state)) {
      return null;
    }
    return parsed.meta;
  } catch {
    return null;
  }
}

function writeSave(storage: StorageAdapter | null, key: string, state: GameState): SaveSlotMeta | null {
  try {
    if (!storage) return null;
    const meta: SaveSlotMeta = {
      dia: state.reloj.dia,
      escenarioNombre: SCENARIO_PRESETS[state.config.escenarioId].nombre,
      savedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    const payload: StoredSavePayload = { meta, state };
    storage.setItem(key, JSON.stringify(payload));
    return meta;
  } catch {
    return null;
  }
}

function readSavedState(storage: StorageAdapter | null, key: string): GameState | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSavePayload>;
    if (!isValidSavedGameState(parsed?.state)) {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

function normalizeLevers(rawLevers: unknown, scenarioId: 'elecciones' | 'zombies'): GovernorLevers {
  const fallback = structuredClone(SCENARIO_PRESETS[scenarioId].initialLevers);
  if (!rawLevers || typeof rawLevers !== 'object') return fallback;
  const obj = rawLevers as Partial<GovernorLevers>;
  const nivelRaw = typeof obj.nivelObras === 'number' ? obj.nivelObras : fallback.nivelObras;
  const clampedNivel = Math.min(5, Math.max(0, Math.round(nivelRaw))) as ServiceLevel;
  return {
    impuesto: Number(obj.impuesto ?? fallback.impuesto),
    salarioPublico: Number(obj.salarioPublico ?? fallback.salarioPublico),
    nivelObras: clampedNivel,
    ayudaSocial: Number(obj.ayudaSocial ?? fallback.ayudaSocial),
    garantiaAlimentaria: Number(obj.garantiaAlimentaria ?? fallback.garantiaAlimentaria),
    precioMaximo: obj.precioMaximo ?? fallback.precioMaximo,
    comercioExterior: obj.comercioExterior ?? fallback.comercioExterior,
    prensa: Number(obj.prensa ?? fallback.prensa),
    topeEmision: Number(obj.topeEmision ?? fallback.topeEmision),
  };
}

export class GameController {
  private state: GameState;
  private derived: CommunityDerived;
  private readonly storage: StorageAdapter | null;
  private readonly aiDirector: AiDirectorPort;
  private paused = false;
  private speed = 1;
  private aiAvailable = false;
  private aiBusy = false;
  private devMode = false;
  private noRender = false;
  private simStepMs = 0;
  private manualSaveMeta: SaveSlotMeta | null = null;
  private autoSaveMeta: SaveSlotMeta | null = null;

  private lastDerivedKey = '';
  private timerId: ReturnType<typeof setInterval> | null = null;
  private aiInFlight = false;
  private lastPressDay = 1;
  private actionOffersDay = 1;
  private actionOffersCount = 0;
  private inFlightConditions = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshot: GameControllerSnapshot;
  private destroyed = false;
  private sessionEpoch = 0;
  private aiAbortController: AbortController | null = null;

  constructor(
    initialConfig: WorldConfig = DEFAULT_WORLD_CONFIG,
    options?: GameControllerOptions
  ) {
    this.storage = options?.storage ?? getDefaultStorage();
    this.aiDirector = options?.aiDirector ?? NULL_AI_DIRECTOR;
    this.state = createInitialGameState(initialConfig);
    this.derived = deriveCommunityStats(this.state);
    this.lastDerivedKey = this.computeDerivedKey(this.state);
    this.manualSaveMeta = readSaveMeta(this.storage, MANUAL_SAVE_KEY);
    this.autoSaveMeta = readSaveMeta(this.storage, AUTO_SAVE_KEY);
    this.snapshot = this.buildSnapshot();
  }

  private computeDerivedKey(s: GameState): string {
    const objetivoPerdido = s.eventos.some((e) => e.tipo === 'objetivo_perdido') ? 1 : 0;
    const parcelSig = s.parcelas.map((p) => `${p.estado}:${p.edificio?.tipo ?? '-'}:${p.edificio?.activo ? 1 : 0}`).join(',');
    const tramoSig = (s.tramos ?? []).map((t) => `${t.construida ? 1 : 0}:${t.enObra ? 1 : 0}:${Math.round(t.estado)}`).join(',');
    return `${s.reloj.dia}|${s.noticias.length}|${s.bitacora.length}|${s.resultado.estado}|${s.resultado.victoriaCumplida ? 1 : 0}|${objetivoPerdido}|${s.gobierno.finanzas.saldo}|${s.demandasActivas.length}|${s.bloqueosPalanca.length}|${s.medidasVigentes.length}|${parcelSig}|${tramoSig}`;
  }

  private buildSnapshot(): GameControllerSnapshot {
    return {
      state: this.state,
      derived: this.derived,
      paused: this.paused,
      speed: this.speed,
      aiAvailable: this.aiAvailable,
      aiBusy: this.aiBusy,
      aiStatus: this.aiDirector.getRuntimeStatus(this.state.config.usarIaGemini, this.aiAvailable),
      devMode: this.devMode,
      noRender: this.noRender,
      simStepMs: this.simStepMs,
      manualSaveMeta: this.manualSaveMeta,
      autoSaveMeta: this.autoSaveMeta,
    };
  }

  private syncDerivedAndGovCheck(nextState: GameState, prevGov: GameState['gobierno']) {
    const key = this.computeDerivedKey(nextState);
    if (key !== this.lastDerivedKey || nextState.gobierno !== prevGov) {
      this.derived = deriveCommunityStats(nextState);
      this.lastDerivedKey = key;
    }
  }

  private commit(forceNotify = true) {
    this.snapshot = this.buildSnapshot();
    if (forceNotify) {
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): GameControllerSnapshot => {
    return this.snapshot;
  };

  getState(): GameState {
    return this.state;
  }

  start(): void {
    this.checkAiHealth();
    this.syncTimer();
  }

  destroy(): void {
    this.destroyed = true;
    this.resetAiLifecycle();
    this.stopTimer();
    this.listeners.clear();
  }

  private resetAiLifecycle(): void {
    this.sessionEpoch += 1;
    if (this.aiAbortController) {
      this.aiAbortController.abort();
      this.aiAbortController = null;
    }
    this.inFlightConditions.clear();
    this.aiInFlight = false;
    this.aiBusy = false;
    this.aiDirector.resetSessionError();
  }

  private ensureAiSignal(): AbortSignal | undefined {
    if (typeof AbortController === 'undefined') return undefined;
    if (!this.aiAbortController) {
      this.aiAbortController = new AbortController();
    }
    return this.aiAbortController.signal;
  }

  private checkAiHealth(): void {
    const epoch = this.sessionEpoch;
    this.aiDirector
      .checkHealth(this.ensureAiSignal())
      .then((available) => {
        if (this.destroyed || epoch !== this.sessionEpoch) return;
        if (available !== this.aiAvailable) {
          this.aiAvailable = available;
          this.commit();
        }
      })
      .catch(() => {
        if (this.destroyed || epoch !== this.sessionEpoch) return;
        if (this.aiAvailable) {
          this.aiAvailable = false;
          this.commit();
        }
      });
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private syncTimer(): void {
    this.stopTimer();
    if (this.paused || this.state.resultado.estado !== 'jugando') return;
    const intervalMs = this.noRender && this.speed >= 20 ? 32 : SIMULATION_TICK_MS;
    this.timerId = setInterval(() => {
      const stepTicks = this.noRender && this.speed >= 20 ? TICKS_PER_DAY : this.speed;
      this.tick(stepTicks);
    }, intervalMs);
  }

  tick(ticks: number = this.speed): void {
    if (this.state.resultado.estado !== 'jugando') {
      this.stopTimer();
      return;
    }
    const prevGov = this.state.gobierno;
    const prevDay = this.state.reloj.dia;
    const prevPeriodo = this.state.reloj.periodo;
    const prevCondCount = this.state.ventanasCondicion.length;

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const next = stepSimulation(this.state, ticks);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.simStepMs = Number((t1 - t0).toFixed(2));

    this.state = next;
    this.syncDerivedAndGovCheck(next, prevGov);

    if (next.reloj.periodo !== prevPeriodo) {
      const saved = writeSave(this.storage, AUTO_SAVE_KEY, next);
      if (saved) this.autoSaveMeta = saved;
    }

    if (next.resultado.estado !== 'jugando') {
      this.stopTimer();
    }

    this.commit();

    if (
      next.reloj.dia !== prevDay ||
      next.ventanasCondicion.length !== prevCondCount
    ) {
      this.scheduleAiJobs();
    }
  }

  stepDay(): void {
    this.tick(TICKS_PER_DAY);
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.syncTimer();
    this.commit();
    if (!paused) {
      this.scheduleAiJobs();
    }
  }

  setSpeed(speed: number): void {
    const allowed = [1, 2, 5, 20] as const;
    const nearest = allowed.reduce((prev, cur) =>
      Math.abs(cur - speed) < Math.abs(prev - speed) ? cur : prev
    );
    this.speed = nearest;
    this.state = {
      ...this.state,
      reloj: {
        ...this.state.reloj,
        velocidad: nearest,
      },
    };
    if (this.paused) {
      this.paused = false;
    }
    this.syncTimer();
    this.commit();
  }

  setNoRender(enabled: boolean): void {
    if (this.noRender === enabled) return;
    this.noRender = enabled;
    this.syncTimer();
    this.commit();
  }

  setDevMode(enabled: boolean): void {
    if (this.devMode === enabled) return;
    this.devMode = enabled;
    this.state = {
      ...this.state,
      devMode: enabled,
    };
    if (!enabled) {
      this.noRender = false;
    }
    this.syncTimer();
    this.commit();
  }

  exportSaveJson(): string {
    return JSON.stringify(
      {
        meta: {
          dia: this.state.reloj.dia,
          escenarioNombre: SCENARIO_PRESETS[this.state.config.escenarioId].nombre,
          savedAt: new Date().toISOString(),
        },
        state: this.state,
      },
      null,
      2
    );
  }

  importSaveJson(raw: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidate =
        parsed && typeof parsed === 'object' && 'state' in parsed
          ? (parsed as { state: unknown }).state
          : parsed;
      if (!isValidSavedGameState(candidate)) {
        return { ok: false, error: 'El JSON no corresponde a una partida válida.' };
      }
      this.applyLoadedState(structuredClone(candidate));
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo parsear el JSON de partida.' };
    }
  }

  exportMetricsJson(): string {
    return JSON.stringify(
      {
        dia: this.state.reloj.dia,
        anio: this.state.reloj.anio,
        semilla: this.state.semilla,
        config: this.state.config,
        derived: this.derived,
        mercadoStats: this.state.mercadoStats,
        ultimaSalidaEconomica: this.state.ultimaSalidaEconomica,
        historial: this.state.historial,
        simStepMs: this.simStepMs,
      },
      null,
      2
    );
  }

  setDevPopulation(poblacionInicial: number): void {
    if (!this.devMode) return;
    const clampedPop = Math.min(5000, Math.max(20, Math.round(poblacionInicial)));
    this.startNewGame({
      ...this.state.config,
      poblacionInicial: clampedPop,
    });
  }

  setEstadoAutomatico(enabled: boolean): void {
    this.state = {
      ...this.state,
      config: {
        ...this.state.config,
        estadoAutomatico: enabled,
      },
    };
    this.commit();
  }

  setLecturaActiva(enabled: boolean): void {
    const nextLectura =
      enabled && !this.state.lectura
        ? initLecturaState(this.state, this.derived)
        : this.state.lectura;
    this.state = {
      ...this.state,
      config: {
        ...this.state.config,
        lecturaActiva: enabled,
      },
      lectura: nextLectura,
    };
    this.commit();
  }

  setDevSeed(semilla: number): void {
    if (!this.devMode) return;
    const norm = normalizeSeed(semilla);
    this.startNewGame({
      ...this.state.config,
      semilla: norm,
    });
  }

  setDevComplexity(nivelMundo: WorldComplexityLevel, nivelGobernador: GovernorComplexityLevel): void {
    if (!this.devMode) return;
    const resolved = resolveComplexityConfig({
      ...this.state.config,
      nivelMundo,
      nivelGobernador,
    });
    this.startNewGame({
      ...this.state.config,
      ...resolved,
    });
  }

  saveManual(): boolean {
    const meta = writeSave(this.storage, MANUAL_SAVE_KEY, this.state);
    if (!meta) return false;
    this.manualSaveMeta = meta;
    this.commit();
    return true;
  }

  loadManual(): boolean {
    const loaded = readSavedState(this.storage, MANUAL_SAVE_KEY);
    if (!loaded) return false;
    try {
      this.applyLoadedState(loaded);
      return true;
    } catch {
      return false;
    }
  }

  loadAutoSave(): boolean {
    const loaded = readSavedState(this.storage, AUTO_SAVE_KEY);
    if (!loaded) return false;
    try {
      this.applyLoadedState(loaded);
      return true;
    } catch {
      return false;
    }
  }

  private applyLoadedState(loaded: GameState): void {
    this.lastPressDay = loaded.reloj.dia;
    this.actionOffersDay = loaded.reloj.dia;
    this.actionOffersCount = 0;
    this.paused = false;
    this.resetAiLifecycle();

    // Normalize loaded saves to current V2 schema defaults
    const preset = SCENARIO_PRESETS[loaded.config.escenarioId] || SCENARIO_PRESETS.elecciones;
    loaded.config.escenarioId = preset.id;
    loaded.versionFormato = SAVE_FORMAT_VERSION;
    const resolvedComplexity = resolveComplexityConfig(loaded.config);
    loaded.config.nivelMundo = resolvedComplexity.nivelMundo;
    loaded.config.nivelGobernador = resolvedComplexity.nivelGobernador;
    loaded.config.economiaModulo = resolvedComplexity.economiaModulo;
    loaded.config.estadoAutomatico = Boolean(
      loaded.config.estadoAutomatico ?? resolvedComplexity.estadoAutomatico
    );
    loaded.semilla = normalizeSeed(loaded.semilla ?? loaded.config.semilla ?? 1);
    loaded.config.semilla = loaded.semilla;
    loaded.rngState = normalizeSeed(loaded.rngState ?? loaded.semilla);
    if (!loaded.rng) {
      loaded.rng = initSubsystemRng(loaded.rngState || loaded.semilla || 1);
    } else {
      const fallbackRng = initSubsystemRng(loaded.rngState || loaded.semilla || 1);
      loaded.rng = {
        ...fallbackRng,
        ...loaded.rng,
      };
    }
    if (typeof loaded.idSeq !== 'number') {
      loaded.idSeq = 0;
    }

    const rawClock = loaded.reloj;
    loaded.reloj = {
      tick: Number(rawClock.tick ?? 0),
      dia: Number(rawClock.dia ?? 1),
      anio: Number(rawClock.anio ?? 1),
      periodo: Number(rawClock.periodo ?? 1),
      diasEnPeriodo: Number(rawClock.diasEnPeriodo ?? 0),
      ticksPorDia: Number(rawClock.ticksPorDia ?? TICKS_PER_DAY),
      velocidad: rawClock.velocidad ?? 1,
      pausado: Boolean(rawClock.pausado ?? false),
    };

    if (!loaded.zonas || Object.keys(loaded.zonas).length === 0) {
      loaded.zonas = structuredClone(DEFAULT_ZONAS);
    }
    if (!Array.isArray(loaded.tramos) || loaded.tramos.length === 0) {
      loaded.tramos = structuredClone(DEFAULT_TRAMOS);
    }
    if (!loaded.mapaGrid) {
      loaded.mapaGrid = buildTileGridAndSyncMap(
        loaded.zonas,
        loaded.parcelas ?? [],
        loaded.tramos,
        loaded.npcs.length,
        loaded.semilla
      );
    }
    if (
      !loaded.distanciasZonas ||
      Object.keys(loaded.distanciasZonas).length < Object.keys(loaded.zonas).length ||
      !loaded.distanciasLotes
    ) {
      recomputeRoadDistances(loaded);
    }
    if (!Array.isArray(loaded.hogares)) {
      loaded.hogares = [];
    }
    if (!Array.isArray(loaded.casas)) {
      loaded.casas = [];
    }
    if (!Array.isArray(loaded.firmas)) {
      loaded.firmas = [];
    }
    loaded.mercadoStats = {
      quiebrasPeriodo: loaded.mercadoStats?.quiebrasPeriodo ?? 0,
      fundacionesPeriodo: loaded.mercadoStats?.fundacionesPeriodo ?? 0,
      comprasPeriodo: loaded.mercadoStats?.comprasPeriodo ?? 0,
      construccionesPeriodo: loaded.mercadoStats?.construccionesPeriodo ?? 0,
      nacimientosAcum: loaded.mercadoStats?.nacimientosAcum ?? 0,
      muertesAcum: loaded.mercadoStats?.muertesAcum ?? 0,
      hogaresEnAcogida:
        loaded.mercadoStats?.hogaresEnAcogida ??
        loaded.hogares.filter((h) => h.estado === 'acogida').length,
      ultimaActualizacionDemogDia: loaded.mercadoStats?.ultimaActualizacionDemogDia ?? 0,
    };
    if (!loaded.demandaSuelo) {
      loaded.demandaSuelo = computeDemandaSuelo(loaded);
    }
    if (!loaded.demandaSueloRachas) {
      loaded.demandaSueloRachas = {};
    }
    if (!loaded.vacantesCriticasRachas) {
      loaded.vacantesCriticasRachas = {};
    }

    loaded.gobierno.palancasVigentes = normalizeLevers(loaded.gobierno.palancasVigentes, preset.id);
    loaded.gobierno.palancasObjetivo = normalizeLevers(loaded.gobierno.palancasObjetivo, preset.id);
    if (!loaded.gobierno.cuposFijos) {
      loaded.gobierno.cuposFijos = { ...preset.cuposFijos };
    }
    loaded.gobierno.coberturas = {
      policia: loaded.gobierno.coberturas?.policia ?? 1,
      medico: loaded.gobierno.coberturas?.medico ?? 1,
      ingeniero: loaded.gobierno.coberturas?.ingeniero ?? 1,
    };
    if (!loaded.gobierno.integridad) {
      loaded.gobierno.integridad = {};
      for (const z of Object.keys(loaded.zonas)) loaded.gobierno.integridad[z] = 100;
    }

    const fin = loaded.gobierno.finanzas;
    loaded.gobierno.finanzas = {
      ingresos: Number(fin.ingresos ?? 0),
      nomina: Number(fin.nomina ?? 0),
      pensiones: Number(fin.pensiones ?? 0),
      garantiaAlimentaria: Number(fin.garantiaAlimentaria ?? 0),
      garantiaImpaga: Number(fin.garantiaImpaga ?? 0),
      comidaMenores: Number(fin.comidaMenores ?? 0),
      acogidaMenores: Number(fin.acogidaMenores ?? 0),
      ayudaSocial: Number(fin.ayudaSocial ?? 0),
      mantenimiento: Number(fin.mantenimiento ?? 0),
      mantenimientoVias: Number(fin.mantenimientoVias ?? 0),
      mantenimientoEdificios: Number(fin.mantenimientoEdificios ?? 0),
      operacionObras: Number(fin.operacionObras ?? 0),
      operacion: Number(fin.operacion ?? 0),
      obras: Number(fin.obras ?? 0),
      prensa: Number(fin.prensa ?? 0),
      subsidios: Number(fin.subsidios ?? 0),
      saldo: Number(fin.saldo ?? 0),
      emision: Number(fin.emision ?? 0),
      importaciones: Number(fin.importaciones ?? 0),
      exportaciones: Number(fin.exportaciones ?? 0),
      impago: Boolean(fin.impago),
      alcanzaNomina: Boolean(fin.alcanzaNomina ?? !fin.impago),
      prorrateoDiscrecional: Number(fin.prorrateoDiscrecional ?? 1),
      prorrateoNomina: Number(fin.prorrateoNomina ?? (fin.impago ? 0 : 1)),
      prorrateoPensionGarantia: Number(fin.prorrateoPensionGarantia ?? 1),
    };

    const acum = loaded.gobierno.acumuladoPeriodo;
    loaded.gobierno.acumuladoPeriodo = {
      dias: Number(acum?.dias ?? 0),
      impuestos: Number(acum?.impuestos ?? 0),
      nominaPorNpc: acum?.nominaPorNpc ?? {},
      pensionesPorNpc: acum?.pensionesPorNpc ?? {},
      ayudaPorNpc: acum?.ayudaPorNpc ?? {},
      nominaDevengada: Number(acum?.nominaDevengada ?? 0),
      pensionesDevengadas: Number(acum?.pensionesDevengadas ?? 0),
      ayudaDevengada: Number(acum?.ayudaDevengada ?? 0),
      garantiaAlimentaria: Number(acum?.garantiaAlimentaria ?? 0),
      garantiaImpaga: Number(acum?.garantiaImpaga ?? 0),
      comidaMenores: Number(acum?.comidaMenores ?? 0),
      acogidaMenores: Number(acum?.acogidaMenores ?? 0),
      mantenimiento: Number(acum?.mantenimiento ?? 0),
      mantenimientoVias: Number(acum?.mantenimientoVias ?? 0),
      operacionObras: Number(acum?.operacionObras ?? 0),
      operacion: Number(acum?.operacion ?? 0),
      obras: Number(acum?.obras ?? 0),
      prensa: Number(acum?.prensa ?? 0),
      subsidios: Number(acum?.subsidios ?? 0),
      importaciones: Number(acum?.importaciones ?? 0),
      exportaciones: Number(acum?.exportaciones ?? 0),
    };

    const fallbackPrices: Record<ZoneId, number> = {};
    const fallbackRent: Record<ZoneId, number> = {};
    for (const z of Object.keys(loaded.zonas)) {
      fallbackPrices[z] = loaded.alimento.precio;
      fallbackRent[z] = 12;
    }
    if (!loaded.ultimaSalidaEconomica) {
      loaded.ultimaSalidaEconomica = {
        accesoComida: {},
        poderAdquisitivo: {},
        saldoDiarioEstimado: 0,
        precioAlimento: fallbackPrices,
        alquilerMedio: fallbackRent,
        cuotaMercado: {},
        inflacion: loaded.gobierno.inflacion ?? 0,
        precioGlobal: loaded.alimento.precio,
        bienesImportadosDia: 0,
        industriaExportDia: 0,
      };
    } else {
      loaded.ultimaSalidaEconomica.saldoDiarioEstimado ??= 0;
      loaded.ultimaSalidaEconomica.precioAlimento ??= fallbackPrices;
      loaded.ultimaSalidaEconomica.alquilerMedio ??= fallbackRent;
      loaded.ultimaSalidaEconomica.cuotaMercado ??= {};
      loaded.ultimaSalidaEconomica.precioGlobal ??= loaded.alimento.precio;
      loaded.ultimaSalidaEconomica.bienesImportadosDia ??= 0;
      loaded.ultimaSalidaEconomica.industriaExportDia ??= 0;
    }

    if (!loaded.ultimaOrdenZona) {
      loaded.ultimaOrdenZona = {};
      for (const z of Object.keys(loaded.zonas)) loaded.ultimaOrdenZona[z] = 100;
    }
    if (!loaded.ultimaDefensaZona) {
      loaded.ultimaDefensaZona = {};
      for (const z of Object.keys(loaded.zonas)) loaded.ultimaDefensaZona[z] = 55;
    }
    if (!loaded.ultimaIntegridadZona) {
      loaded.ultimaIntegridadZona = {};
      for (const z of Object.keys(loaded.zonas)) loaded.ultimaIntegridadZona[z] = 100;
    }
    if (!loaded.golpesPorZonaHistorial) {
      loaded.golpesPorZonaHistorial = {};
      for (const z of Object.keys(loaded.zonas)) loaded.golpesPorZonaHistorial[z] = [];
    }
    if (!Array.isArray(loaded.fenomenosIniciadosIds)) {
      loaded.fenomenosIniciadosIds = [];
    }
    if (!Array.isArray(loaded.avisosEmitidos)) {
      loaded.avisosEmitidos = [];
    }
    if (!Array.isArray(loaded.ventanasCondicion)) {
      loaded.ventanasCondicion = [];
    }
    if (!Array.isArray(loaded.bitacora)) {
      loaded.bitacora = [];
    }
    loaded.config.perfilEstabilidad ??= 'normal';
    loaded.actoresEstado ??= {};
    loaded.colapsoDiasConsecutivos ??= 0;
    loaded.obraDirectaSinCapacidadPeriodos ??= 0;
    loaded.obrasSinCapacidadEnPeriodo ??= 0;
    loaded.ultimoAjusteFiscalPeriodo ??= -99;
    loaded.coberturaServiciosPorZona ??= {};
    if (loaded.caosTracker) {
      loaded.caosTracker.rarezasEnVentana ??= 0;
    }
    if (!Array.isArray(loaded.historial)) {
      loaded.historial = [];
    }
    if (!loaded.resultado) {
      loaded.resultado = { estado: 'jugando', victoriaCumplida: false };
    }
    loaded.cooldownsCondicion = {
      impago: loaded.cooldownsCondicion?.impago ?? 0,
      descontento: loaded.cooldownsCondicion?.descontento ?? 0,
      hambre: loaded.cooldownsCondicion?.hambre ?? 0,
      paroFirma: loaded.cooldownsCondicion?.paroFirma ?? 0,
      ocupacion: loaded.cooldownsCondicion?.ocupacion ?? 0,
      boicot: loaded.cooldownsCondicion?.boicot ?? 0,
    };
    if (typeof loaded.alimento.siloDias !== 'number') {
      loaded.alimento.siloDias = ECON_CONSTANTS.siloDias;
    }
    if (typeof loaded.alimento.precioMercado !== 'number') {
      loaded.alimento.precioMercado = loaded.alimento.precio;
    }

    for (const medio of loaded.medios) {
      const legacyIngresos = (
        medio as (typeof loaded.medios)[number] & {
          ingresos?: { publicidad?: number; fondosEstado?: number; dependenciaPct?: number };
        }
      ).ingresos;
      if (legacyIngresos) {
        if (
          !medio.finanzas ||
          (medio.finanzas.ingresosPropios === 0 &&
            medio.finanzas.fondosEstado === 0 &&
            ((legacyIngresos.publicidad ?? 0) > 0 || (legacyIngresos.fondosEstado ?? 0) > 0))
        ) {
          medio.finanzas = {
            ingresosPropios: Number(legacyIngresos.publicidad ?? 0),
            fondosEstado: Number(legacyIngresos.fondosEstado ?? 0),
            dependenciaPct: Number(legacyIngresos.dependenciaPct ?? 0),
          };
        }
        delete (medio as { ingresos?: unknown }).ingresos;
      }
      if (typeof medio.afinidadBase !== 'number') {
        medio.afinidadBase = medio.lineaEditorial.afinidadGobierno;
      }
    }

    for (const art of loaded.noticias) {
      if (!art.textoOrigen) {
        art.textoOrigen = 'plantilla';
      }
      if (!art.zona) {
        art.zona = art.zonaOrigen ?? 'centro';
      }
    }

    for (const npc of loaded.npcs) {
      if (!npc.extra) npc.extra = {};
      if (typeof npc.personalidad.sociabilidad !== 'number') {
        npc.personalidad.sociabilidad = 50;
      }
      if (!npc.ritmo) {
        npc.ritmo = buildSeededNpcRitmo(npc.id, npc.edad, loaded.semilla);
      }
      if (npc.capacitacion === undefined) {
        npc.capacitacion = null;
      }
      if (typeof npc.economia.propensionGasto !== 'number') {
        npc.economia.propensionGasto = ECON_CONSTANTS.propensionGastoBase;
      }
      if (npc.accionIa) {
        const action = npc.accionIa;
        const def = ACTION_TABLE.find((a) => a.id === action.id);
        if (action.fueraDePuesto === undefined) {
          action.fueraDePuesto = def
            ? def.efectos.some((e) => e.id === 'fuera_de_puesto')
            : false;
        }
        if (!Array.isArray(action.efectos)) {
          action.efectos = def
            ? def.efectos
            : action.fueraDePuesto
            ? [{ id: 'fuera_de_puesto' }]
            : [{ id: 'decorativa' }];
        }
        if (action.esFoco === undefined) {
          action.esFoco = !action.origen?.endsWith('/contagio');
        }
      }
    }

    if (!Array.isArray(loaded.parcelas) || loaded.parcelas.length === 0) {
      loaded.parcelas = buildInitialParcelas(preset.id, resolvedComplexity.nivelMundo);
    }
    if (!Array.isArray(loaded.hitosCumplidos)) {
      loaded.hitosCumplidos = [];
    }
    if (!Array.isArray(loaded.demandasActivas)) {
      loaded.demandasActivas = [];
    }
    if (!Array.isArray(loaded.compromisosObra)) {
      loaded.compromisosObra = [];
    }
    if (!Array.isArray(loaded.bloqueosPalanca)) {
      loaded.bloqueosPalanca = [];
    }
    if (!Array.isArray(loaded.medidasVigentes)) {
      loaded.medidasVigentes = [];
    }
    if (!loaded.cooldownActorDemanda || typeof loaded.cooldownActorDemanda !== 'object') {
      loaded.cooldownActorDemanda = {};
    }

    loaded.auditEntradasDia = 0;
    loaded.auditSalidasDia = 0;
    loaded.ultimoDineroTotal = computeTotalWorldMoney(loaded);
    if (typeof loaded.precioAyer !== 'number') {
      loaded.precioAyer = loaded.alimento.precio;
    }
    if (typeof loaded.hambreAyerPct !== 'number') {
      loaded.hambreAyerPct = 0;
    }
    if (typeof loaded.ultimoSaldoCierre !== 'number') {
      loaded.ultimoSaldoCierre = loaded.gobierno.finanzas.saldo;
    }
    if (!Array.isArray(loaded.colaHechosDia)) {
      loaded.colaHechosDia = [];
    }
    if (!loaded.ultimaVariantePorAccion) {
      loaded.ultimaVariantePorAccion = {};
    }
    if (!Array.isArray(loaded.clasificadorRegistro)) {
      loaded.clasificadorRegistro = [];
    }
    if (!Array.isArray(loaded.eventos)) {
      loaded.eventos = [];
    }

    const tempDerived = deriveCommunityStats(loaded);
    if (!loaded.metricasPeriodoAnterior) {
      loaded.metricasPeriodoAnterior = {
        apoyoPct: tempDerived.apoyoPct,
        hambreCriticaPct: tempDerived.hambreCriticaPct,
        poblacion: tempDerived.poblacion,
        satisfaccionMedia: tempDerived.satisfaccionMedia,
      };
    }

    if (!loaded.lectura && loaded.config.lecturaActiva !== false) {
      loaded.lectura = initLecturaState(loaded, tempDerived);
    }

    this.state = loaded;
    this.derived = tempDerived;
    this.lastDerivedKey = this.computeDerivedKey(loaded);
    this.syncTimer();
    this.commit();
  }

  forceClimatePhenomenon(tipo: PhenomenonType, zona: ZoneId = 'este'): void {
    if (this.state.resultado.estado !== 'jugando') return;
    if (this.state.config.nivelMundo === 'M0') return;
    const next = structuredClone(this.state);
    const dia = next.reloj.dia;
    const names: Record<PhenomenonType, string> = {
      sequia: 'Sequía forzada',
      plaga: 'Plaga agrícola forzada',
      pandemia: 'Pandemia forzada',
      plaga_zombie: 'Brote zombie forzado',
    };
    const phenomenon: ClimatePhenomenon = {
      id: nextSeqId(next, `clim_dev_${dia}`),
      tipo,
      nombre: names[tipo],
      intensidad: 65,
      inicioDia: dia,
      duracionDias: 18,
      origen: zona,
    };
    next.clima.fenomenos.push(phenomenon);
    next.fenomenosIniciadosIds.push(phenomenon.id);

    const startEvId = nextSeqId(next, `ev_${dia}_dev`);
    next.ultimoEventoClimaId = startEvId;
    emitSimEvent(next, {
      id: startEvId,
      dia,
      tipo: 'fenomeno_inicio',
      zona,
      fenomenoId: phenomenon.id,
      fenomeno: phenomenon.nombre,
      zonaOrigen: zona,
      causa: `clima:${tipo}`,
    });
    next.bitacora.unshift({
      id: nextSeqId(next, `log_dev_clim_${dia}`),
      dia,
      categoria: 'clima',
      origen: `dev:${tipo}`,
      causa: startEvId,
      simEventId: startEvId,
      titulo: `${phenomenon.nombre} (Dev)`,
      detalle: `Fenómeno activado en zona ${zona} durante ${phenomenon.duracionDias} días.`,
    });
    if (next.bitacora.length > MAX_BITACORA_ENTRIES) next.bitacora.length = MAX_BITACORA_ENTRIES;

    this.state = next;
    this.derived = deriveCommunityStats(next);
    this.lastDerivedKey = this.computeDerivedKey(next);
    this.commit();
  }

  private applyStateCommand<R extends { ok: boolean }>(
    fn: (s: GameState) => R,
    syncDerived = true
  ): R {
    const prevGov = this.state.gobierno;
    const next = structuredClone(this.state);
    const res = fn(next);
    if (!res.ok) return res;
    this.state = next;
    if (syncDerived) {
      this.syncDerivedAndGovCheck(next, prevGov);
    }
    this.commit();
    return res;
  }

  /** Modo desarrollador: aplica una mutación puntual al estado (forzar demandas, etc.). */
  mutateForDev(fn: (s: GameState) => { ok: boolean; error?: string }): { ok: boolean; error?: string } {
    if (!this.devMode) return { ok: false, error: 'Requiere modo desarrollador.' };
    return this.applyStateCommand(fn);
  }

  startNewGame(newConfig: WorldConfig): void {
    this.lastPressDay = 1;
    this.actionOffersDay = 1;
    this.actionOffersCount = 0;
    this.paused = false;
    this.resetAiLifecycle();

    const fresh = createInitialGameState(newConfig);
    this.state = fresh;
    this.derived = deriveCommunityStats(fresh);
    this.lastDerivedKey = this.computeDerivedKey(fresh);
    this.syncTimer();
    this.commit();
  }

  updateLevers(updater: (prev: GovernorLevers) => GovernorLevers): void {
    const govLevel = getGovernorLevel(this.state.config);
    if (govLevel === 'G0') return;
    const prev = this.state.gobierno.palancasObjetivo;
    const updated = updater({ ...prev });

    let nextObjetivo: GovernorLevers;
    if (govLevel === 'G1') {
      nextObjetivo = {
        ...prev,
        impuesto: updated.impuesto,
        salarioPublico: updated.salarioPublico,
        nivelObras: updated.nivelObras,
      };
    } else if (govLevel === 'G2') {
      nextObjetivo = {
        ...prev,
        impuesto: updated.impuesto,
        salarioPublico: updated.salarioPublico,
        nivelObras: updated.nivelObras,
        ayudaSocial: updated.ayudaSocial,
        garantiaAlimentaria: updated.garantiaAlimentaria,
      };
    } else if (govLevel === 'G3' || this.state.config.economiaModulo !== 'fiscal') {
      nextObjetivo = {
        ...updated,
        topeEmision: prev.topeEmision,
      };
    } else {
      nextObjetivo = { ...updated };
    }

    const dia = this.state.reloj.dia;
    for (const lock of this.state.bloqueosPalanca) {
      if (dia < lock.hastaDia) {
        const key: LeverKey = lock.palanca;
        nextObjetivo = {
          ...nextObjetivo,
          [key]: prev[key],
        };
      }
    }

    // palancasObjetivo only governs future day transitions; derived metrics depend solely on palancasVigentes
    this.state = {
      ...this.state,
      gobierno: {
        ...this.state.gobierno,
        palancasObjetivo: nextObjetivo,
      },
    };
    this.commit();
  }

  buildInParcela(parcelaId: string, tipo: BuildingType): { ok: boolean; error?: string } {
    return this.applyStateCommand((s) => orderBuildInParcela(s, parcelaId, tipo));
  }

  buildVia(tramoId: string): { ok: boolean; error?: string } {
    return this.applyStateCommand((s) => orderBuildVia(s, tramoId));
  }

  demolishParcela(parcelaId: string): { ok: boolean; error?: string } {
    return this.applyStateCommand((s) => orderDemolishParcela(s, parcelaId));
  }

  respondDemand(demandId: string, accept: boolean): { ok: boolean; error?: string } {
    return this.applyStateCommand((s) => respondToDemand(s, demandId, accept));
  }

  /** Palancas del nivel 1.1 (G3): entran en vigencia al día siguiente, como el resto de los controles. */
  setExtraLever(key: ExtraLeverKey, value: number): { ok: boolean; error?: string } {
    return this.applyStateCommand((s) => setExtraLeverState(s, key, value), false);
  }

  counterOffer(demandId: string): { ok: boolean; aceptada?: boolean; error?: string; texto?: string } {
    return this.applyStateCommand((s) => counterOfferDemand(s, demandId));
  }

  private applyAiMutation(applyFn: (s: GameState) => boolean | void): void {
    if (this.destroyed) return;
    const prevGov = this.state.gobierno;
    const next = structuredClone(this.state);
    if (applyFn(next) === false) return;
    this.state = next;
    this.syncDerivedAndGovCheck(next, prevGov);
    this.commit();
  }

  private scheduleAiJobs(): void {
    if (this.destroyed) return;
    const current = this.state;
    if (current.resultado.estado !== 'jugando') return;
    if (!current.config.usarIaGemini) return;

    const jobEpoch = this.sessionEpoch;
    const signal = this.ensureAiSignal();

    const pendingWin = current.ventanasCondicion.find(
      (w) => w.estado === 'pendiente' && !this.inFlightConditions.has(w.id)
    );
    if (pendingWin) {
      this.inFlightConditions.add(pendingWin.id);
      this.aiBusy = true;
      this.commit();
      this.aiDirector.dispatchConditionJob(current, { signal })
        .then((res) => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          if (res) {
            this.applyAiMutation(res.apply);
          }
        })
        .finally(() => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          this.inFlightConditions.delete(pendingWin.id);
          this.aiBusy = false;
          this.commit();
          this.scheduleAiJobs();
        });
      return;
    }

    if (this.paused || this.aiInFlight) return;

    const dia = current.reloj.dia;
    if (this.actionOffersDay !== dia) {
      this.actionOffersDay = dia;
      this.actionOffersCount = 0;
    }

    if (dia > this.lastPressDay && current.colaHechosDia.length > 0) {
      this.lastPressDay = dia;
      this.aiInFlight = true;
      this.aiBusy = true;
      this.commit();
      this.aiDirector.dispatchPressJob(current, { signal })
        .then((res) => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          if (res) {
            this.applyAiMutation(res.apply);
          }
        })
        .finally(() => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          this.aiInFlight = false;
          this.aiBusy = false;
          this.commit();
          this.scheduleAiJobs();
        });
      return;
    }

    if (dia > 1 && this.actionOffersCount < DIRECTOR_CONSTANTS.ofertasPorDia) {
      this.actionOffersCount += 1;
      this.aiInFlight = true;
      this.aiBusy = true;
      this.commit();
      this.aiDirector.dispatchSpontaneousActionJob(current, { signal })
        .then((res) => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          if (res) {
            this.applyAiMutation(res.apply);
          } else {
            this.actionOffersCount = DIRECTOR_CONSTANTS.ofertasPorDia;
          }
        })
        .finally(() => {
          if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
          this.aiInFlight = false;
          this.aiBusy = false;
          this.commit();
          if (this.actionOffersCount < DIRECTOR_CONSTANTS.ofertasPorDia) {
            this.scheduleAiJobs();
          }
        });
    }
  }

  async triggerPressManual(): Promise<void> {
    if (this.destroyed || this.aiInFlight || this.state.resultado.estado !== 'jugando') return;
    const jobEpoch = this.sessionEpoch;
    const signal = this.ensureAiSignal();
    this.aiInFlight = true;
    this.aiBusy = true;
    this.commit();
    try {
      const res = await this.aiDirector.dispatchPressJob(this.state, { allowManualFallback: true, signal });
      if (this.destroyed || jobEpoch !== this.sessionEpoch) return;
      if (res) {
        this.applyAiMutation(res.apply);
      }
    } finally {
      if (!this.destroyed && jobEpoch === this.sessionEpoch) {
        this.aiInFlight = false;
        this.aiBusy = false;
        this.commit();
      }
    }
  }
}
