import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Compass,
  Newspaper,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  StepForward,
  Wheat,
} from 'lucide-react';
import { SCENARIO_PRESETS } from '../../data/catalogs';
import { CommunityDerived, GameState } from '../../types/game';
import { DockSection } from '../../types/ui';

interface GameHudTopProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiBusy: boolean;
  activeSection: DockSection | null;
  hasConditionAlert?: boolean;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  onToggleSection: (section: DockSection) => void;
  onOpenNewGame: () => void;
}

const TOOL_BUTTONS: Array<{
  id: DockSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'tesoreria', label: 'Tesorería', icon: Coins },
  { id: 'alimento', label: 'Alimento', icon: Wheat },
  { id: 'servicios', label: 'Servicios', icon: ShieldCheck },
  { id: 'prensa', label: 'Prensa', icon: Newspaper },
  { id: 'ciudad', label: 'Ciudad', icon: Compass },
];

export const GameHudTop: React.FC<GameHudTopProps> = ({
  state,
  derived,
  paused,
  speed,
  aiBusy,
  activeSection,
  hasConditionAlert,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  onToggleSection,
  onOpenNewGame,
}) => {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const objectiveValue =
    preset.victoria.metrica === 'apoyoPct' ? `${derived.apoyoPct}%` : `${derived.poblacion}`;
  const objectiveHealthy =
    preset.victoria.metrica === 'apoyoPct'
      ? derived.apoyoPct >= preset.victoria.umbral
      : derived.poblacion >= preset.victoria.umbral;

  const estDiario = state.ultimaSalidaEconomica.disponibleDiarioEstimado;

  return (
    <header className="pointer-events-auto fixed top-0 inset-x-0 z-30 bg-slate-800/95 backdrop-blur-sm border-b-2 border-slate-950 shadow-lg">
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-x-auto">
        {/* Left: Title + Scenario Goal + Playback */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2.5 pr-2 border-r border-slate-700">
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              El Gobernador
            </span>
            <div className="hidden xl:flex items-center gap-1 text-xs font-mono tabular-nums">
              {objectiveHealthy ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className={objectiveHealthy ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {objectiveValue}
              </span>
              <span className="text-slate-400 text-[11px]">
                /{preset.victoria.umbral}
              </span>
            </div>
          </div>

          {/* Clock / Speed */}
          <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-700/80 rounded p-0.5">
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
              <span className="hidden sm:inline">{paused ? 'Pausa' : 'Activo'}</span>
            </button>
            {[1, 3, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-1.5 py-1 text-[11px] font-mono font-semibold rounded-sm transition-colors whitespace-nowrap ${
                  speed === spd && !paused
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
              className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded-sm whitespace-nowrap"
            >
              <StepForward className="w-3 h-3" />
              +1d
            </button>
          </div>
        </div>

        {/* Center: Classic RCT Toolbar Windows */}
        <nav aria-label="Herramientas de gobierno" className="flex items-center gap-1 shrink-0">
          {TOOL_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const active = activeSection === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onToggleSection(btn.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-sm border-t border-l border-b border-r transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-teal-700 border-t-teal-950 border-l-teal-950 border-b-teal-400/50 border-r-teal-400/50 text-white'
                    : 'bg-slate-700/90 hover:bg-slate-600 border-t-slate-500/50 border-l-slate-500/50 border-b-slate-950 border-r-slate-950 text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                <span>{btn.label}</span>
                {btn.id === 'ciudad' && hasConditionAlert && (
                  <span className="text-[10px] font-bold text-rose-300">!</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Key Vital Readouts + New Game */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <div className="hidden md:flex items-center gap-3 font-mono tabular-nums bg-slate-900/80 border border-slate-700/70 rounded px-2.5 py-1">
            <div>
              <span className="font-sans text-slate-400 mr-1">Caja</span>
              <span className={state.gobierno.reserva < 100 ? 'text-rose-400 font-semibold' : 'text-white font-semibold'}>
                ${Math.round(state.gobierno.reserva)}
              </span>
              <span className={`ml-1 text-[11px] ${estDiario < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ({estDiario >= 0 ? '+' : ''}
                {estDiario.toFixed(0)})
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-400 mr-1">Comida</span>
              <span className={state.alimento.diasStock < 5 ? 'text-rose-400 font-semibold' : 'text-white font-semibold'}>
                {state.alimento.diasStock.toFixed(0)}d
              </span>
            </div>
            <div className="hidden lg:block">
              <span className="font-sans text-slate-400 mr-1">Hab.</span>
              <span className="text-white font-semibold">{derived.poblacion}</span>
            </div>
            {state.config.economiaModulo === 'fiscal' && (
              <div className="hidden xl:block">
                <span className="font-sans text-slate-400 mr-1">Infl.</span>
                <span className={state.gobierno.inflacion > 25 ? 'text-amber-400 font-semibold' : 'text-white font-semibold'}>
                  {state.gobierno.inflacion.toFixed(0)}%
                </span>
              </div>
            )}
            {aiBusy && <span className="text-teal-400 font-sans font-semibold text-[11px]">IA</span>}
          </div>

          <button
            type="button"
            onClick={onOpenNewGame}
            title="Configurar nueva partida"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 border-t border-l border-teal-400/40 border-b border-r border-slate-950 rounded-sm whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Partida</span>
          </button>
        </div>
      </div>
    </header>
  );
};
