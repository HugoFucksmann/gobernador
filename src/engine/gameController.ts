import {
  dispatchConditionJob,
  dispatchPressJob,
  dispatchSpontaneousActionJob,
  getAiRuntimeStatus,
  resetAiSessionError,
} from '../services/aiDirector';
import {
  ACTION_TABLE,
  ECON_CONSTANTS,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  ActionEffectSpec,
  ClimatePhenomenon,
  CommunityDerived,
  GameState,
  GovernorLevers,
  PhenomenonType,
  WorldConfig,
  ZoneId,
} from '../types/game';
import { AiStatus } from '../types/ui';
import { DEFAULT_WORLD_CONFIG } from './policies';
import { nextSeqId, normalizeSeed } from './rng';
import {
  deriveCommunityStats,
  emitSimEvent,
  stepSimulation,
  TICKS_PER_DAY,
} from './simulation';
import { createInitialGameState } from './worldGenerator';

export interface SaveSlotMeta {
  dia: number;
  escenarioNombre: string;
  savedAt: string;
}

export interface GameControllerSnapshot {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiAvailable: boolean;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
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

function readSaveMeta(key: string): SaveSlotMeta | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSavePayload>;
    if (!parsed?.meta || typeof parsed.meta.dia !== 'number' || !parsed?.state?.reloj) {
      return null;
    }
    return parsed.meta;
  } catch {
    return null;
  }
}

function writeSave(key: string, state: GameState): SaveSlotMeta | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const meta: SaveSlotMeta = {
      dia: state.reloj.dia,
      escenarioNombre:
        state.config.escenarioId === 'zombies' ? 'Apocalipsis Zombie' : 'Año Electoral',
      savedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    const payload: StoredSavePayload = { meta, state };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return meta;
  } catch {
    return null;
  }
}

function readSavedState(key: string): GameState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSavePayload>;
    if (!parsed?.state || !parsed.state.reloj || !Array.isArray(parsed.state.npcs)) {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

function migrateLegacyLevers(rawLevers: unknown, scenarioId: 'elecciones' | 'zombies'): GovernorLevers {
  const fallback = structuredClone(SCENARIO_PRESETS[scenarioId].initialLevers);
  if (!rawLevers || typeof rawLevers !== 'object') return fallback;
  const obj = rawLevers as Record<string, unknown>;
  if (typeof obj.impuesto === 'number' && typeof obj.salarioPublico === 'number' && obj.servicios && typeof obj.ayudaSocial === 'number') {
    return rawLevers as GovernorLevers;
  }
  const legacyRec = obj.recaudacion as { impuestoGrupo?: Record<string, number> } | undefined;
  const legacyGasto = obj.gasto as { salarioPublico?: number } | undefined;
  const legacyAlim = obj.alimento as { garantiaAlimentaria?: number; intercambio?: number } | undefined;
  const legacyFin = obj.finanzas as { topeEmision?: number } | undefined;

  if (legacyRec?.impuestoGrupo) {
    const vals = Object.values(legacyRec.impuestoGrupo).filter((v) => typeof v === 'number');
    if (vals.length > 0) {
      fallback.impuesto = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }
  if (typeof legacyGasto?.salarioPublico === 'number') {
    fallback.salarioPublico = legacyGasto.salarioPublico;
  }
  if (typeof legacyAlim?.garantiaAlimentaria === 'number') {
    fallback.garantiaAlimentaria = legacyAlim.garantiaAlimentaria;
  }
  if (typeof legacyAlim?.intercambio === 'number') {
    const x = legacyAlim.intercambio;
    fallback.comercioExterior = x <= -75 ? -100 : x <= -25 ? -50 : x >= 75 ? 100 : x >= 25 ? 50 : 0;
  }
  if (typeof legacyFin?.topeEmision === 'number') {
    fallback.topeEmision = legacyFin.topeEmision;
  }
  return fallback;
}

export class GameController {
  private state: GameState;
  private derived: CommunityDerived;
  private paused = false;
  private speed = 1;
  private aiAvailable = false;
  private aiBusy = false;
  private devMode = false;
  private simStepMs = 0;
  private manualSaveMeta: SaveSlotMeta | null = null;
  private autoSaveMeta: SaveSlotMeta | null = null;

  private lastDerivedKey = '';
  private timerId: ReturnType<typeof setInterval> | null = null;
  private aiInFlight = false;
  private lastPressDay = 1;
  private lastActionCheckDay = 1;
  private inFlightConditions = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshot: GameControllerSnapshot;
  private destroyed = false;

  constructor(initialConfig: WorldConfig = DEFAULT_WORLD_CONFIG) {
    this.state = createInitialGameState(initialConfig);
    this.derived = deriveCommunityStats(this.state);
    this.lastDerivedKey = this.computeDerivedKey(this.state);
    this.manualSaveMeta = readSaveMeta(MANUAL_SAVE_KEY);
    this.autoSaveMeta = readSaveMeta(AUTO_SAVE_KEY);
    this.snapshot = this.buildSnapshot();
  }

  private computeDerivedKey(s: GameState): string {
    const objetivoPerdido = s.eventos.some((e) => e.tipo === 'objetivo_perdido') ? 1 : 0;
    return `${s.reloj.dia}|${s.noticias.length}|${s.bitacora.length}|${s.resultado.estado}|${s.resultado.victoriaCumplida ? 1 : 0}|${objetivoPerdido}|${s.gobierno.finanzas.saldo}`;
  }

  private buildSnapshot(): GameControllerSnapshot {
    return {
      state: this.state,
      derived: this.derived,
      paused: this.paused,
      speed: this.speed,
      aiAvailable: this.aiAvailable,
      aiBusy: this.aiBusy,
      aiStatus: getAiRuntimeStatus(this.state.config.usarIaGemini, this.aiAvailable),
      devMode: this.devMode,
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
    this.stopTimer();
    this.listeners.clear();
  }

  private checkAiHealth(): void {
    if (typeof fetch !== 'function') return;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (this.destroyed) return;
        const available = Boolean(data.aiAvailable);
        if (available !== this.aiAvailable) {
          this.aiAvailable = available;
          this.commit();
        }
      })
      .catch(() => {
        if (this.destroyed) return;
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
    this.timerId = setInterval(() => {
      this.tick(this.speed);
    }, SIMULATION_TICK_MS);
  }

  tick(ticks: number = this.speed): void {
    if (this.state.resultado.estado !== 'jugando') {
      this.stopTimer();
      return;
    }
    const prevGov = this.state.gobierno;
    const prevDay = this.state.reloj.dia;
    const prevCondCount = this.state.ventanasCondicion.length;

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const next = stepSimulation(this.state, ticks);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.simStepMs = Number((t1 - t0).toFixed(2));

    this.state = next;
    this.syncDerivedAndGovCheck(next, prevGov);

    if (next.reloj.dia !== prevDay && next.reloj.dia % 7 === 0) {
      const saved = writeSave(AUTO_SAVE_KEY, next);
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
    const maxSpeed = this.devMode ? 10 : 2;
    this.speed = Math.min(maxSpeed, Math.max(1, speed));
    if (this.paused) {
      this.paused = false;
    }
    this.syncTimer();
    this.commit();
  }

  setDevMode(enabled: boolean): void {
    if (this.devMode === enabled) return;
    this.devMode = enabled;
    if (!enabled && this.speed > 2) {
      this.speed = 2;
    }
    this.syncTimer();
    this.commit();
  }

  setDevPopulation(poblacionInicial: number): void {
    if (!this.devMode) return;
    const clampedPop = Math.min(1000, Math.max(20, Math.round(poblacionInicial)));
    this.startNewGame({
      ...this.state.config,
      poblacionInicial: clampedPop,
    });
  }

  saveManual(): boolean {
    const meta = writeSave(MANUAL_SAVE_KEY, this.state);
    if (!meta) return false;
    this.manualSaveMeta = meta;
    this.commit();
    return true;
  }

  loadManual(): boolean {
    const loaded = readSavedState(MANUAL_SAVE_KEY);
    if (!loaded) return false;
    this.applyLoadedState(loaded);
    return true;
  }

  loadAutoSave(): boolean {
    const loaded = readSavedState(AUTO_SAVE_KEY);
    if (!loaded) return false;
    this.applyLoadedState(loaded);
    return true;
  }

  private applyLoadedState(loaded: GameState): void {
    this.lastPressDay = loaded.reloj.dia;
    this.lastActionCheckDay = loaded.reloj.dia;
    this.inFlightConditions.clear();
    this.aiInFlight = false;
    this.aiBusy = false;
    this.paused = false;
    resetAiSessionError();

    // Migrate v1 saves cleanly to v2 schema (ESTADOS §13)
    const preset = SCENARIO_PRESETS[loaded.config.escenarioId] || SCENARIO_PRESETS.elecciones;
    loaded.versionFormato = SAVE_FORMAT_VERSION;
    const legacyEcon = loaded.config.economiaModulo as string;
    if (legacyEcon === 'simple' || legacyEcon === 'individual') {
      loaded.config.economiaModulo = 'base';
    }
    if ('disturbiosActivos' in (loaded.config as unknown as Record<string, unknown>)) {
      delete (loaded.config as unknown as Record<string, unknown>).disturbiosActivos;
    }
    loaded.semilla = normalizeSeed(loaded.semilla ?? loaded.config.semilla ?? 1);
    loaded.config.semilla = loaded.semilla;
    loaded.rngState = normalizeSeed(loaded.rngState ?? loaded.semilla);
    if (typeof loaded.idSeq !== 'number') {
      loaded.idSeq = 0;
    }

    loaded.gobierno.palancasVigentes = migrateLegacyLevers(loaded.gobierno.palancasVigentes, preset.id);
    loaded.gobierno.palancasObjetivo = migrateLegacyLevers(loaded.gobierno.palancasObjetivo, preset.id);
    if ('palancasInicioPeriodo' in (loaded.gobierno as unknown as Record<string, unknown>)) {
      delete (loaded.gobierno as unknown as Record<string, unknown>).palancasInicioPeriodo;
    }
    if ('prensaObjetivo' in (loaded.gobierno as unknown as Record<string, unknown>)) {
      delete (loaded.gobierno as unknown as Record<string, unknown>).prensaObjetivo;
    }
    if ('prensaInicioPeriodo' in (loaded.gobierno as unknown as Record<string, unknown>)) {
      delete (loaded.gobierno as unknown as Record<string, unknown>).prensaInicioPeriodo;
    }
    if (!loaded.gobierno.cuposFijos) {
      loaded.gobierno.cuposFijos = { ...preset.cuposFijos };
    }
    if ('educacion' in (loaded.gobierno.indicadores as unknown as Record<string, unknown>)) {
      delete (loaded.gobierno.indicadores as unknown as Record<string, unknown>).educacion;
    }
    loaded.gobierno.coberturas = {
      policia: loaded.gobierno.coberturas?.policia ?? 1,
      medico: loaded.gobierno.coberturas?.medico ?? 1,
      ingeniero: loaded.gobierno.coberturas?.ingeniero ?? 1,
    };

    const legacyFin = loaded.gobierno.finanzas as unknown as Record<string, unknown>;
    loaded.gobierno.finanzas = {
      ingresos: Number(legacyFin.ingresos ?? 0),
      nomina: Number(legacyFin.nomina ?? 0),
      pensiones: Number(legacyFin.pensiones ?? 0),
      garantiaAlimentaria: Number(legacyFin.garantiaAlimentaria ?? 0),
      ayudaSocial: Number(legacyFin.ayudaSocial ?? 0),
      operacion: Number(legacyFin.operacion ?? legacyFin.presupuestoAsignado ?? 0),
      prensa: Number(legacyFin.prensa ?? legacyFin.prensaAsignada ?? 0),
      saldo: Number(legacyFin.saldo ?? legacyFin.disponible ?? 0),
      emision: Number(legacyFin.emision ?? 0),
      importaciones: Number(legacyFin.importaciones ?? legacyFin.comprasAlimento ?? 0),
      exportaciones: Number(legacyFin.exportaciones ?? legacyFin.ventasAlimento ?? 0),
      impago: Boolean(legacyFin.impago),
      alcanzaNomina: Boolean(legacyFin.alcanzaNomina ?? legacyFin.impago),
      prorrateoDiscrecional: Number(legacyFin.prorrateoDiscrecional ?? 1),
      prorrateoNomina: Number(legacyFin.prorrateoNomina ?? (legacyFin.impago ? 0 : 1)),
      prorrateoPensionGarantia: Number(legacyFin.prorrateoPensionGarantia ?? 1),
    };

    const legacyAcum = loaded.gobierno.acumuladoPeriodo as unknown as Record<string, unknown>;
    loaded.gobierno.acumuladoPeriodo = {
      dias: Number(legacyAcum?.dias ?? 0),
      impuestos: Number(legacyAcum?.impuestos ?? 0),
      nomina: Number(legacyAcum?.nomina ?? 0),
      pensiones: Number(legacyAcum?.pensiones ?? 0),
      garantiaAlimentaria: Number(legacyAcum?.garantiaAlimentaria ?? 0),
      ayudaSocial: Number(legacyAcum?.ayudaSocial ?? 0),
      operacion: Number(legacyAcum?.operacion ?? 0),
      operacionPorArea: (legacyAcum?.operacionPorArea as GameState['gobierno']['acumuladoPeriodo']['operacionPorArea']) ?? {
        seguridad: 0,
        salud: 0,
        infraestructura: 0,
      },
      prensa: Number(legacyAcum?.prensa ?? 0),
      importaciones: Number(legacyAcum?.importaciones ?? legacyAcum?.comprasAlimento ?? 0),
      exportaciones: Number(legacyAcum?.exportaciones ?? legacyAcum?.ventasAlimento ?? 0),
    };

    const legacyOut = loaded.ultimaSalidaEconomica as unknown as Record<string, unknown>;
    if (typeof legacyOut.saldoDiarioEstimado !== 'number') {
      loaded.ultimaSalidaEconomica.saldoDiarioEstimado = Number(legacyOut.disponibleDiarioEstimado ?? 0);
      delete legacyOut.disponibleDiarioEstimado;
    }

    if (!loaded.ultimaOrdenZona) {
      loaded.ultimaOrdenZona = { centro: 100, norte: 100, este: 100, sur: 100, oeste: 100 };
    }
    loaded.cooldownsCondicion = {
      impago: loaded.cooldownsCondicion?.impago ?? 0,
      descontento: loaded.cooldownsCondicion?.descontento ?? 0,
      hambre: loaded.cooldownsCondicion?.hambre ?? 0,
    };
    if (typeof loaded.alimento.precioMercado !== 'number') {
      loaded.alimento.precioMercado = loaded.alimento.precio;
    }

    for (const medio of loaded.medios) {
      if (typeof medio.afinidadBase !== 'number') {
        medio.afinidadBase = medio.lineaEditorial.afinidadGobierno;
      }
      if ('intervencion' in (medio as unknown as Record<string, unknown>)) {
        delete (medio as unknown as Record<string, unknown>).intervencion;
      }
    }

    for (const art of loaded.noticias) {
      if (!art.textoOrigen) {
        const legacyFuente = (art as unknown as { fuente?: string }).fuente;
        art.textoOrigen = legacyFuente === 'ia' ? 'generativo' : 'plantilla';
      }
    }

    for (const npc of loaded.npcs) {
      if ('progreso' in (npc.educacion as unknown as Record<string, unknown>)) {
        delete (npc.educacion as unknown as Record<string, unknown>).progreso;
      }
      if (typeof npc.economia.despensa !== 'number') {
        npc.economia.despensa = ECON_CONSTANTS.objetivoBaseDias;
      }
      if (typeof npc.economia.propensionGasto !== 'number') {
        npc.economia.propensionGasto = ECON_CONSTANTS.propensionGastoBase;
      }
      if (npc.accionIa) {
        const legacy = npc.accionIa as unknown as {
          reemplazaTrabajo?: boolean;
          fueraDePuesto?: boolean;
          efectos?: ActionEffectSpec[];
          esFoco?: boolean;
        };
        const def = ACTION_TABLE.find((a) => a.id === npc.accionIa!.id);
        if (legacy.fueraDePuesto === undefined) {
          legacy.fueraDePuesto = def
            ? def.efectos.some((e) => e.id === 'fuera_de_puesto')
            : Boolean(legacy.reemplazaTrabajo);
        }
        if (!Array.isArray(legacy.efectos)) {
          legacy.efectos = def
            ? def.efectos
            : legacy.fueraDePuesto
            ? [{ id: 'fuera_de_puesto' }]
            : [{ id: 'decorativa' }];
        }
        if (legacy.esFoco === undefined) {
          legacy.esFoco = !npc.accionIa.origen?.endsWith('/contagio');
        }
      }
    }

    const emp = loaded.npcs.find((n) => n.vivo && n.rol === 'empresario') || null;
    const liveComerciantes = loaded.npcs.filter((n) => n.vivo && n.rol === 'comerciante').map((c) => c.id);
    if (!loaded.empresas || !loaded.empresas.comercio) {
      loaded.empresas = {
        alimento: loaded.empresas?.alimento ?? {
          id: 'alimento',
          dueno: emp ? emp.id : null,
          stock: loaded.alimento.stock,
          diasStock: loaded.alimento.diasStock,
          siloDias: loaded.alimento.siloDias,
          ingresosAcum: 0,
          sueldosAcum: 0,
          sueldosReferenciaAcum: 0,
          diasPeriodo: 0,
          ultimaGanancia: 0,
          ultimoIngresoPeriodo: 0,
          ultimoSueldosPeriodo: 0,
          respuesta: null,
        },
        comercio: {
          id: 'comercio',
          socios: liveComerciantes,
          ingresosAcum: 0,
          sueldosAcum: 0,
          sueldosReferenciaAcum: 0,
          diasPeriodo: 0,
          ultimaGanancia: 0,
          ultimoIngresoPeriodo: 0,
          ultimoSueldosPeriodo: 0,
          respuesta: null,
        },
      };
    } else {
      loaded.empresas.comercio.socios = liveComerciantes;
      loaded.empresas.alimento.sueldosReferenciaAcum = loaded.empresas.alimento.sueldosReferenciaAcum ?? 0;
      loaded.empresas.comercio.sueldosReferenciaAcum = loaded.empresas.comercio.sueldosReferenciaAcum ?? 0;
    }

    this.state = loaded;
    this.derived = deriveCommunityStats(loaded);
    this.lastDerivedKey = this.computeDerivedKey(loaded);
    this.syncTimer();
    this.commit();
  }

  forceClimatePhenomenon(tipo: PhenomenonType, zona: ZoneId = 'este'): void {
    if (this.state.resultado.estado !== 'jugando') return;
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
    if (next.bitacora.length > 100) next.bitacora.length = 100;

    this.state = next;
    this.derived = deriveCommunityStats(next);
    this.lastDerivedKey = this.computeDerivedKey(next);
    this.commit();
  }

  startNewGame(newConfig: WorldConfig): void {
    this.lastPressDay = 1;
    this.lastActionCheckDay = 1;
    this.inFlightConditions.clear();
    this.aiInFlight = false;
    this.aiBusy = false;
    this.paused = false;
    resetAiSessionError();

    const fresh = createInitialGameState(newConfig);
    this.state = fresh;
    this.derived = deriveCommunityStats(fresh);
    this.lastDerivedKey = this.computeDerivedKey(fresh);
    this.syncTimer();
    this.commit();
  }

  updateLevers(updater: (prev: GovernorLevers) => GovernorLevers): void {
    const next = structuredClone(this.state);
    next.gobierno.palancasObjetivo = updater(next.gobierno.palancasObjetivo);
    this.state = next;
    this.derived = deriveCommunityStats(next);
    this.lastDerivedKey = this.computeDerivedKey(next);
    this.commit();
  }

  private applyAiMutation(applyFn: (s: GameState) => void): void {
    if (this.destroyed) return;
    const prevGov = this.state.gobierno;
    const next = structuredClone(this.state);
    applyFn(next);
    this.state = next;
    this.syncDerivedAndGovCheck(next, prevGov);
    this.commit();
  }

  private scheduleAiJobs(): void {
    const current = this.state;
    if (current.resultado.estado !== 'jugando') return;

    const pendingWin = current.ventanasCondicion.find(
      (w) => w.estado === 'pendiente' && !this.inFlightConditions.has(w.id)
    );
    if (pendingWin) {
      this.inFlightConditions.add(pendingWin.id);
      this.aiBusy = true;
      this.commit();
      dispatchConditionJob(current)
        .then((res) => {
          if (res) {
            this.applyAiMutation(res.apply);
          }
        })
        .finally(() => {
          this.inFlightConditions.delete(pendingWin.id);
          if (!this.destroyed) {
            this.aiBusy = false;
            this.commit();
          }
        });
      return;
    }

    if (this.paused || this.aiInFlight) return;

    const dia = current.reloj.dia;
    if (dia - this.lastPressDay >= 4) {
      this.lastPressDay = dia;
      this.aiInFlight = true;
      this.aiBusy = true;
      this.commit();
      dispatchPressJob(current)
        .then((res) => {
          if (res) {
            this.applyAiMutation(res.apply);
          }
        })
        .finally(() => {
          this.aiInFlight = false;
          if (!this.destroyed) {
            this.aiBusy = false;
            this.commit();
          }
        });
      return;
    }

    if (dia - this.lastActionCheckDay >= 2) {
      this.lastActionCheckDay = dia;
      this.aiInFlight = true;
      this.aiBusy = true;
      this.commit();
      dispatchSpontaneousActionJob(current)
        .then((res) => {
          if (res) {
            this.applyAiMutation(res.apply);
          }
        })
        .finally(() => {
          this.aiInFlight = false;
          if (!this.destroyed) {
            this.aiBusy = false;
            this.commit();
          }
        });
    }
  }

  async triggerPressManual(): Promise<void> {
    if (this.aiInFlight || this.state.resultado.estado !== 'jugando') return;
    this.aiInFlight = true;
    this.aiBusy = true;
    this.commit();
    try {
      const res = await dispatchPressJob(this.state);
      if (res) {
        this.applyAiMutation(res.apply);
      }
    } finally {
      this.aiInFlight = false;
      if (!this.destroyed) {
        this.aiBusy = false;
        this.commit();
      }
    }
  }
}
