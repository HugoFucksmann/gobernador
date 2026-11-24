import {
  dispatchConditionJob,
  dispatchPressJob,
  dispatchSpontaneousActionJob,
  requestNpcThought,
} from '../services/aiDirector';
import {
  CommunityDerived,
  GameState,
  GovernorLevers,
  WorldConfig,
} from '../types/game';
import {
  DEFAULT_WORLD_CONFIG,
  rebalanceMediaIntervention,
} from './policies';
import {
  deriveCommunityStats,
  stepSimulation,
  TICKS_PER_DAY,
} from './simulation';
import { createInitialGameState } from './worldGenerator';

export interface GameControllerSnapshot {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiAvailable: boolean;
  aiBusy: boolean;
  thoughtLoading: boolean;
}

const SIMULATION_TICK_MS = 150;

export class GameController {
  private state: GameState;
  private derived: CommunityDerived;
  private paused = false;
  private speed = 1;
  private aiAvailable = false;
  private aiBusy = false;
  private thoughtLoading = false;

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
    this.snapshot = this.buildSnapshot();
  }

  private computeDerivedKey(s: GameState): string {
    return `${s.reloj.dia}|${s.noticias.length}|${s.bitacora.length}|${s.resultado.estado}|${s.gobierno.finanzas.disponible}`;
  }

  private buildSnapshot(): GameControllerSnapshot {
    return {
      state: this.state,
      derived: this.derived,
      paused: this.paused,
      speed: this.speed,
      aiAvailable: this.aiAvailable,
      aiBusy: this.aiBusy,
      thoughtLoading: this.thoughtLoading,
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

    const next = stepSimulation(this.state, ticks);
    this.state = next;
    this.syncDerivedAndGovCheck(next, prevGov);

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
    this.speed = speed;
    if (this.paused) {
      this.paused = false;
    }
    this.syncTimer();
    this.commit();
  }

  startNewGame(newConfig: WorldConfig): void {
    this.lastPressDay = 1;
    this.lastActionCheckDay = 1;
    this.inFlightConditions.clear();
    this.aiInFlight = false;
    this.aiBusy = false;
    this.thoughtLoading = false;
    this.paused = false;

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

  updateMediaIntervention(
    medioId: string,
    field: 'financiamiento' | 'regulacion',
    value: number
  ): void {
    const updatedTarget = rebalanceMediaIntervention(
      this.state.gobierno.prensaObjetivo,
      medioId,
      field,
      value
    );
    if (!updatedTarget) return;

    const next = structuredClone(this.state);
    next.gobierno.prensaObjetivo = updatedTarget;
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

  async fetchThoughtForNpc(npcId: string, onlyIfStale = false): Promise<void> {
    const target = this.state.npcs.find((n) => n.id === npcId && n.vivo);
    if (!target) return;

    if (
      onlyIfStale &&
      target.pensamientoCache &&
      this.state.reloj.dia - target.pensamientoCache.dia < 5
    ) {
      return;
    }

    this.thoughtLoading = true;
    this.commit();

    try {
      const result = await requestNpcThought(target, this.state);
      if (this.destroyed) return;
      this.applyAiMutation((next) => {
        const n = next.npcs.find((x) => x.id === npcId);
        if (n) {
          n.pensamientoCache = {
            texto: result.texto,
            dia: next.reloj.dia,
            fuente: result.fuente,
          };
        }
      });
    } finally {
      if (!this.destroyed) {
        this.thoughtLoading = false;
        this.commit();
      }
    }
  }
}
