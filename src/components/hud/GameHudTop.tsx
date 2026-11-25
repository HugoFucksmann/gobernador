import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Compass,
  Landmark,
  Pause,
  Play,
  Settings2,
  StepForward,
  Wheat,
  Wrench,
} from 'lucide-react';
import { ECON_CONSTANTS, SCENARIO_PRESETS } from '../../data/catalogs';
import { CommunityDerived, GameState, PhenomenonType, ZoneId } from '../../types/game';
import { AiStatus, DockSection } from '../../types/ui';

interface GameHudTopProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
  simStepMs: number;
  activeSection: DockSection | null;
  hasConditionAlert?: boolean;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  onToggleDevMode: () => void;
  onForceClimate: (tipo: PhenomenonType, zona: ZoneId) => void;
  onToggleSection: (section: DockSection) => void;
  onOpenAlerts: () => void;
  onOpenObjetivo: () => void;
  onOpenNewGame: () => void;
}

const TOOL_BUTTONS: Array<{
  id: DockSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { id: 'gobierno', label: 'Gobierno', icon: Landmark, accent: 'text-teal-300' },
  { id: 'alimento', label: 'Alimento', icon: Wheat, accent: 'text-amber-300' },
  { id: 'ciudad', label: 'Ciudad', icon: Compass, accent: 'text-sky-300' },
];

function formatTrend(current: number, previous: number, higherIsBetter: boolean): {
  arrow: string;
  tone: string;
} {
  const diff = current - previous;
  if (Math.abs(diff) < 0.8) return { arrow: '→', tone: 'text-slate-400' };
  const up = diff > 0;
  const good = higherIsBetter ? up : !up;
  return {
    arrow: up ? '↑' : '↓',
    tone: good ? 'text-emerald-400' : 'text-rose-400',
  };
}

export const GameHudTop: React.FC<GameHudTopProps> = ({
  state,
  derived,
  paused,
  speed,
  aiBusy,
  aiStatus,
  devMode,
  simStepMs,
  activeSection,
  hasConditionAlert,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  onToggleDevMode,
  onForceClimate,
  onToggleSection,
  onOpenAlerts,
  onOpenObjetivo,
  onOpenNewGame,
}) => {
  const [devFenom, setDevFenom] = useState<PhenomenonType>('sequia');
  const [devZona, setDevZona] = useState<ZoneId>('este');

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const plazo = preset.victoria.plazoDia ?? 365;
  const daysLeft = Math.max(0, plazo - state.reloj.dia);
  const victoryCumplida = Boolean(state.resultado.victoriaCumplida);

  const vicCurrent =
    preset.victoria.metrica === 'apoyoPct' ? derived.apoyoPct : derived.poblacion;
  const vicPrev =
    preset.victoria.metrica === 'apoyoPct'
      ? state.metricasPeriodoAnterior.apoyoPct
      : state.metricasPeriodoAnterior.poblacion;
  const vicTrend = formatTrend(vicCurrent, vicPrev, true);
  const objectiveHealthy = vicCurrent >= preset.victoria.umbral;

  const defCurrent =
    preset.derrota.metrica === 'hambreCriticaPct'
      ? derived.hambreCriticaPct
      : derived.poblacion;
  const defInit = state.metricasBaseObjetivo?.derrotaInicial ?? defCurrent;
  const defLimit = preset.derrota.umbral;
  const defProgress =
    preset.derrota.op === '>'
      ? Math.max(0, (defCurrent - defInit) / Math.max(1, defLimit - defInit))
      : Math.max(0, (defInit - defCurrent) / Math.max(1, defInit - defLimit));
  const defeatDanger = defProgress >= ECON_CONSTANTS.umbralAlertaDerrota;

  const estDiario = state.ultimaSalidaEconomica.disponibleDiarioEstimado;
  const normalSpeeds = devMode ? [1, 2, 10] : [1, 2];

  const aiLabel =
    aiStatus === 'activa' ? 'IA activa' : aiStatus === 'lenta' ? 'IA lenta' : 'IA sin respuesta';
  const aiTone =
    aiStatus === 'activa'
      ? 'text-teal-300'
      : aiStatus === 'lenta'
      ? 'text-amber-300'
      : 'text-slate-400';

  return (
    <header className="pointer-events-auto fixed top-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-700/80 shadow-lg">
      <div className="px-3 py-1.5 flex items-center justify-between gap-3">
        {/* Left: Brand + Visible Goal + Playback */}
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          <div className="flex items-center gap-2 pr-2.5 border-r border-slate-700/80">
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap hidden sm:inline">
              El Gobernador
            </span>
            <button
              type="button"
              onClick={onOpenObjetivo}
              title={`Meta (día ${plazo}): ${preset.victoria.descripcion} · Derrota: ${preset.derrota.descripcion}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono tabular-nums transition-colors whitespace-nowrap"
            >
              {victoryCumplida || objectiveHealthy ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="font-sans text-slate-400 hidden md:inline">Meta</span>
              <span
                className={
                  objectiveHealthy || victoryCumplida
                    ? 'text-emerald-400 font-semibold'
                    : 'text-amber-300 font-semibold'
                }
              >
                {preset.victoria.metrica === 'apoyoPct' ? `${vicCurrent}%` : vicCurrent}
              </span>
              <span className="text-slate-500">
                /{preset.victoria.umbral}
                {preset.victoria.metrica === 'apoyoPct' ? '%' : ''}
              </span>
              <span className={vicTrend.tone}>{vicTrend.arrow}</span>
              <span className="text-slate-600">·</span>
              {victoryCumplida ? (
                <span className="text-emerald-300 font-sans font-semibold">Cumplida</span>
              ) : (
                <span className="text-slate-300">{daysLeft}d</span>
              )}
              {defeatDanger && (
                <span className="text-rose-400 font-sans font-semibold ml-0.5">
                  · Riesgo {preset.derrota.metrica === 'hambreCriticaPct' ? `${defCurrent}%` : defCurrent}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-800/90 border border-slate-700/80 rounded p-0.5">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={state.resultado.estado !== 'jugando'}
              title={paused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)'}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-sm transition-colors whitespace-nowrap ${
                paused
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span className="hidden md:inline">{paused ? 'Pausa' : 'Activo'}</span>
            </button>
            {normalSpeeds.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-1.5 py-1 text-[11px] font-mono font-semibold rounded-sm transition-colors whitespace-nowrap ${
                  speed === spd && !paused
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                }`}
              >
                {spd}×
              </button>
            ))}
            <button
              type="button"
              onClick={onStepDay}
              disabled={state.resultado.estado !== 'jugando'}
              title="Avanzar 1 día"
              className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-700/70 rounded-sm whitespace-nowrap"
            >
              <StepForward className="w-3 h-3" />
              +1d
            </button>
          </div>
        </div>

        {/* Center: 3 Centralized Governance Pillars + Alerts */}
        <nav aria-label="Herramientas de gobierno" className="flex items-center gap-1.5 shrink-0">
          {TOOL_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const active = activeSection === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onToggleSection(btn.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-teal-700 border-teal-400/60 text-white shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : btn.accent}`} />
                <span>{btn.label}</span>
              </button>
            );
          })}
          {hasConditionAlert && (
            <button
              type="button"
              onClick={onOpenAlerts}
              title="Ver alertas activas de la ciudad"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded bg-rose-700 hover:bg-rose-600 border border-rose-400/50 text-white whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Alertas</span>
            </button>
          )}
        </nav>

        {/* Right: Vital Readouts + Dev + Partida */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <div className="hidden sm:flex items-center gap-3 font-mono tabular-nums bg-slate-800/80 border border-slate-700/80 rounded px-2.5 py-1">
            <div title="Reserva estatal y flujo diario estimado">
              <span className="font-sans text-slate-400 mr-1">Caja</span>
              <span
                className={
                  state.gobierno.reserva < 100
                    ? 'text-rose-400 font-semibold'
                    : 'text-white font-semibold'
                }
              >
                ${Math.round(state.gobierno.reserva)}
              </span>
              <span className={`ml-1 text-[11px] ${estDiario < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ({estDiario >= 0 ? '+' : ''}
                {estDiario.toFixed(0)})
              </span>
            </div>
            <div title="Días de alimento en almacén">
              <span className="font-sans text-slate-400 mr-1">Comida</span>
              <span
                className={
                  state.alimento.diasStock < 5
                    ? 'text-rose-400 font-semibold'
                    : 'text-white font-semibold'
                }
              >
                {state.alimento.diasStock.toFixed(0)}d
              </span>
            </div>
            <div className="hidden lg:block" title="Población viva">
              <span className="font-sans text-slate-400 mr-1">Hab.</span>
              <span className="text-white font-semibold">{derived.poblacion}</span>
            </div>
            {state.config.economiaModulo === 'fiscal' && (
              <div className="hidden xl:block">
                <span className="font-sans text-slate-400 mr-1">Infl.</span>
                <span
                  className={
                    state.gobierno.inflacion > 25
                      ? 'text-amber-400 font-semibold'
                      : 'text-white font-semibold'
                  }
                >
                  {state.gobierno.inflacion.toFixed(0)}%
                </span>
              </div>
            )}
            {state.config.usarIaGemini && (
              <span
                title={
                  aiBusy
                    ? 'IA procesando consulta en segundo plano'
                    : aiStatus === 'plantilla'
                    ? 'IA sin respuesta: decide el motor y se usan plantillas'
                    : `Estado de IA opcional: ${aiLabel}`
                }
                className={`hidden xl:inline font-sans text-[11px] font-medium ${aiTone}`}
              >
                {aiBusy ? `${aiLabel}…` : aiLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleDevMode}
            title="Modo desarrollador"
            className={`p-1.5 rounded border transition-colors ${
              devMode
                ? 'bg-amber-700 border-amber-400 text-white'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenNewGame}
            title="Partida, guardado y escenario"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5 text-teal-300" />
            <span className="hidden md:inline">Partida</span>
          </button>
        </div>
      </div>

      {/* Opt-in Developer Mode Strip */}
      {devMode && (
        <div className="px-3 py-1 bg-slate-950/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-3 font-mono tabular-nums text-slate-300">
            <span className="text-amber-300 font-sans font-semibold">Modo Desarrollador</span>
            <span>Sim step: {simStepMs.toFixed(2)} ms</span>
            <span>Tick: {state.reloj.tick}</span>
            <span>
              Hosp: {derived.hospitalOcupacionPct}% ({derived.internados}/{derived.camasHospital})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Forzar evento:</span>
            <select
              value={devFenom}
              onChange={(e) => setDevFenom(e.target.value as PhenomenonType)}
              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
            >
              <option value="sequia">Sequía</option>
              <option value="plaga">Plaga agrícola</option>
              <option value="pandemia">Pandemia</option>
              <option value="plaga_zombie">Plaga zombie</option>
            </select>
            <select
              value={devZona}
              onChange={(e) => setDevZona(e.target.value as ZoneId)}
              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
            >
              <option value="centro">centro</option>
              <option value="norte">norte</option>
              <option value="este">este</option>
              <option value="sur">sur</option>
              <option value="oeste">oeste</option>
            </select>
            <button
              type="button"
              onClick={() => onForceClimate(devFenom, devZona)}
              className="px-2 py-0.5 font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded"
            >
              Lanzar
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
