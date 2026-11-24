import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommunityMap } from './components/CommunityMap';
import { EconomyPanel } from './components/EconomyPanel';
import { EventLogPanel } from './components/EventLogPanel';
import { GovernorLevers } from './components/GovernorLevers';
import { NpcInspector } from './components/NpcInspector';
import { OutcomeBanner } from './components/OutcomeBanner';
import { PressPanel } from './components/PressPanel';
import { StatusStrip } from './components/StatusStrip';
import { ActiveTab, TopBar } from './components/TopBar';
import { WorldConfigModal } from './components/WorldConfigModal';
import { SCENARIO_PRESETS } from './data/catalogs';
import { deriveCommunityStats, stepSimulation, TICKS_PER_DAY } from './engine/simulation';
import { createInitialGameState } from './engine/worldGenerator';
import {
  dispatchConditionJob,
  dispatchPressJob,
  dispatchSpontaneousActionJob,
  requestNpcThought,
} from './services/aiDirector';
import { GameState, GovernorLevers as GovernorLeversType, RoleId, WorldConfig } from './types/game';

const DEFAULT_WORLD_CONFIG: WorldConfig = {
  escenarioId: 'elecciones',
  economiaModulo: SCENARIO_PRESETS.elecciones.economiaDefault,
  cantidadMedios: SCENARIO_PRESETS.elecciones.mediosDefault,
  poblacionInicial: SCENARIO_PRESETS.elecciones.poblacionDefault,
  caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
  usarIaGemini: true,
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(DEFAULT_WORLD_CONFIG)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('mapa');
  const [paused, setPaused] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [aiAvailable, setAiAvailable] = useState<boolean>(false);
  const [aiBusy, setAiBusy] = useState<boolean>(false);
  const [thoughtLoading, setThoughtLoading] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const stateRef = useRef<GameState>(gameState);
  stateRef.current = gameState;

  const aiInFlightRef = useRef<boolean>(false);
  const lastPressDayRef = useRef<number>(1);
  const lastActionCheckDayRef = useRef<number>(1);
  const inFlightConditionsRef = useRef<Set<string>>(new Set());

  // Check server Gemini availability on boot
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        setAiAvailable(Boolean(data.aiAvailable));
      })
      .catch(() => {
        setAiAvailable(false);
      });
  }, []);

  const derived = useMemo(() => deriveCommunityStats(gameState), [gameState]);

  const selectedNpc = useMemo(
    () => gameState.npcs.find((n) => n.id === selectedNpcId && n.vivo) || null,
    [gameState.npcs, selectedNpcId]
  );

  // Simulation loop (never blocked by AI)
  useEffect(() => {
    if (paused || gameState.resultado.estado !== 'jugando') return;
    const intervalMs = 150;
    const timer = window.setInterval(() => {
      setGameState((prev) => stepSimulation(prev, speed));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, speed, gameState.resultado.estado]);

  // Asynchronous AI Director loop
  useEffect(() => {
    const current = stateRef.current;
    if (current.resultado.estado !== 'jugando') return;

    // 1. Check pending condition windows immediately
    const pendingWin = current.ventanasCondicion.find(
      (w) => w.estado === 'pendiente' && !inFlightConditionsRef.current.has(w.id)
    );
    if (pendingWin) {
      inFlightConditionsRef.current.add(pendingWin.id);
      setAiBusy(true);
      dispatchConditionJob(current)
        .then((res) => {
          if (res) {
            if (res.error) setAiNotice(`Director de IA (respaldo activo): ${res.error}`);
            setGameState((prev) => {
              const next = structuredClone(prev);
              res.apply(next);
              return next;
            });
          }
        })
        .finally(() => {
          inFlightConditionsRef.current.delete(pendingWin.id);
          setAiBusy(false);
        });
      return;
    }

    if (paused || aiInFlightRef.current) return;

    const dia = current.reloj.dia;
    // 2. Periodic Press Column every 4 game days
    if (dia - lastPressDayRef.current >= 4) {
      lastPressDayRef.current = dia;
      aiInFlightRef.current = true;
      setAiBusy(true);
      dispatchPressJob(current)
        .then((res) => {
          if (res) {
            if (res.error) setAiNotice(`Prensa IA (plantilla activa): ${res.error}`);
            setGameState((prev) => {
              const next = structuredClone(prev);
              res.apply(next);
              return next;
            });
          }
        })
        .finally(() => {
          aiInFlightRef.current = false;
          setAiBusy(false);
        });
      return;
    }

    // 3. Spontaneous AI Action check every 2 game days
    if (dia - lastActionCheckDayRef.current >= 2) {
      lastActionCheckDayRef.current = dia;
      aiInFlightRef.current = true;
      setAiBusy(true);
      dispatchSpontaneousActionJob(current)
        .then((res) => {
          if (res) {
            if (res.error) setAiNotice(`Acciones IA (respaldo activo): ${res.error}`);
            setGameState((prev) => {
              const next = structuredClone(prev);
              res.apply(next);
              return next;
            });
          }
        })
        .finally(() => {
          aiInFlightRef.current = false;
          setAiBusy(false);
        });
    }
  }, [gameState.reloj.dia, gameState.ventanasCondicion.length, paused, gameState.resultado.estado]);

  const fetchThoughtForNpc = useCallback(async (npcId: string) => {
    const target = stateRef.current.npcs.find((n) => n.id === npcId && n.vivo);
    if (!target) return;
    setThoughtLoading(true);
    const result = await requestNpcThought(target, stateRef.current);
    if (result.error) {
      setAiNotice(`Pensamiento IA (plantilla): ${result.error}`);
    }
    setGameState((prev) => {
      const next = structuredClone(prev);
      const n = next.npcs.find((x) => x.id === npcId);
      if (n) {
        n.pensamientoCache = {
          texto: result.texto,
          dia: next.reloj.dia,
          fuente: result.fuente,
        };
      }
      return next;
    });
    setThoughtLoading(false);
  }, []);

  const handleSelectNpc = useCallback(
    (npcId: string) => {
      setSelectedNpcId(npcId);
      const npc = stateRef.current.npcs.find((n) => n.id === npcId);
      if (npc && (!npc.pensamientoCache || stateRef.current.reloj.dia - npc.pensamientoCache.dia >= 5)) {
        void fetchThoughtForNpc(npcId);
      }
    },
    [fetchThoughtForNpc]
  );

  const handleSelectRoleSample = useCallback(
    (role: RoleId) => {
      const candidate = stateRef.current.npcs.find((n) => n.vivo && n.rol === role);
      if (candidate) {
        handleSelectNpc(candidate.id);
      }
    },
    [handleSelectNpc]
  );

  const handleStepDay = () => {
    setGameState((prev) => stepSimulation(prev, TICKS_PER_DAY));
  };

  const handleUpdateLevers = (updater: (prev: GovernorLeversType) => GovernorLeversType) => {
    setGameState((prev) => {
      const next = structuredClone(prev);
      next.gobierno.palancasObjetivo = updater(next.gobierno.palancasObjetivo);
      return next;
    });
  };

  const handleUpdateMediaIntervention = (
    medioId: string,
    field: 'financiamiento' | 'regulacion',
    value: number
  ) => {
    setGameState((prev) => {
      const next = structuredClone(prev);
      const target = next.gobierno.prensaObjetivo;
      if (!target[medioId]) return prev;

      if (field === 'regulacion') {
        target[medioId].regulacion = value;
      } else {
        // Rebalance financing share across other outlets to sum to 100
        const others = Object.keys(target).filter((id) => id !== medioId);
        if (others.length === 0) {
          target[medioId].financiamiento = 100;
        } else {
          target[medioId].financiamiento = value;
          const remaining = 100 - value;
          const currentOtherSum = others.reduce((acc, id) => acc + target[id].financiamiento, 0);
          if (currentOtherSum <= 0) {
            const equal = Math.floor(remaining / others.length);
            others.forEach((id, idx) => {
              target[id].financiamiento = idx === 0 ? remaining - equal * (others.length - 1) : equal;
            });
          } else {
            let assigned = 0;
            others.forEach((id, idx) => {
              if (idx === others.length - 1) {
                target[id].financiamiento = Math.max(0, remaining - assigned);
              } else {
                const share = Math.round((target[id].financiamiento / currentOtherSum) * remaining);
                target[id].financiamiento = share;
                assigned += share;
              }
            });
          }
        }
      }
      return next;
    });
  };

  const handleTriggerPressManual = async () => {
    if (aiInFlightRef.current) return;
    aiInFlightRef.current = true;
    setAiBusy(true);
    try {
      const res = await dispatchPressJob(stateRef.current);
      if (res) {
        if (res.error) setAiNotice(`Prensa IA (plantilla): ${res.error}`);
        setGameState((prev) => {
          const next = structuredClone(prev);
          res.apply(next);
          return next;
        });
      }
    } finally {
      aiInFlightRef.current = false;
      setAiBusy(false);
    }
  };

  const handleStartNewGame = (newConfig: WorldConfig) => {
    const fresh = createInitialGameState(newConfig);
    lastPressDayRef.current = 1;
    lastActionCheckDayRef.current = 1;
    inFlightConditionsRef.current.clear();
    aiInFlightRef.current = false;
    setSelectedNpcId(null);
    setGameState(fresh);
    setShowConfigModal(false);
    setPaused(false);
    setAiNotice(null);
  };

  const latestHeadline = gameState.noticias[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewGame={() => setShowConfigModal(true)}
      />

      <StatusStrip
        state={gameState}
        derived={derived}
        paused={paused}
        speed={speed}
        onTogglePause={() => setPaused((p) => !p)}
        onSetSpeed={(s) => {
          setSpeed(s);
          if (paused) setPaused(false);
        }}
        onStepDay={handleStepDay}
        aiBusy={aiBusy}
      />

      {aiNotice && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900 flex items-center justify-between gap-4">
          <span>{aiNotice}</span>
          <button
            type="button"
            onClick={() => setAiNotice(null)}
            className="font-semibold hover:underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        {activeTab === 'mapa' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 space-y-4">
                <CommunityMap
                  state={gameState}
                  selectedNpcId={selectedNpcId}
                  onSelectNpc={handleSelectNpc}
                />

                {/* Latest Press Dispatches Strip under map */}
                {latestHeadline && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        <strong className="text-slate-800">{latestHeadline.medioNombre}</strong>
                        <span aria-hidden="true"> · </span>
                        <span>Día {latestHeadline.dia}</span>
                        <span aria-hidden="true"> · </span>
                        <span>Por {latestHeadline.autorNombre}</span>
                      </div>
                      <h3 className="font-display text-base font-bold text-slate-900">
                        {latestHeadline.titulo}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-2">{latestHeadline.texto}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('prensa')}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0"
                    >
                      Abrir prensa →
                    </button>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4">
                <NpcInspector
                  state={gameState}
                  derived={derived}
                  selectedNpc={selectedNpc}
                  onClearSelection={() => setSelectedNpcId(null)}
                  onSelectRoleSample={handleSelectRoleSample}
                  onRefreshThought={(id) => void fetchThoughtForNpc(id)}
                  thoughtLoading={thoughtLoading}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'palancas' && (
          <GovernorLevers
            state={gameState}
            derived={derived}
            onUpdateLevers={handleUpdateLevers}
            onUpdateMediaIntervention={handleUpdateMediaIntervention}
          />
        )}

        {activeTab === 'economia' && <EconomyPanel state={gameState} />}

        {activeTab === 'prensa' && (
          <PressPanel
            state={gameState}
            onTriggerPress={() => void handleTriggerPressManual()}
            aiBusy={aiBusy}
          />
        )}

        {activeTab === 'bitacora' && <EventLogPanel state={gameState} />}
      </main>

      {showConfigModal && (
        <WorldConfigModal
          initialConfig={gameState.config}
          aiAvailable={aiAvailable}
          onStartNewGame={handleStartNewGame}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      <OutcomeBanner
        state={gameState}
        derived={derived}
        onOpenNewGame={() => setShowConfigModal(true)}
      />
    </div>
  );
}
