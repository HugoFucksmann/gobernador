import React, { useState } from 'react';
import { Eye, FolderOpen, Landmark, Play, Settings2, ShieldAlert, Vote } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/catalogs';
import { SaveSlotMeta } from '../engine/gameController';
import { HintIcon } from './hud/UiTooltip';

interface StartBriefingModalProps {
  initialScenario: 'elecciones' | 'zombies';
  manualSaveMeta: SaveSlotMeta | null;
  autoSaveMeta: SaveSlotMeta | null;
  onStartScenario: (
    escenarioId: 'elecciones' | 'zombies',
    options?: { mode?: 'observador' | 'gobernador'; poblacion?: number }
  ) => void;
  onOpenAdvancedConfig: () => void;
  onLoadManual: () => boolean;
  onLoadAutoSave: () => boolean;
}

const SCALE_PRESETS = [100, 500, 5000] as const;

export const StartBriefingModal: React.FC<StartBriefingModalProps> = ({
  initialScenario,
  manualSaveMeta,
  autoSaveMeta,
  onStartScenario,
  onOpenAdvancedConfig,
  onLoadManual,
  onLoadAutoSave,
}) => {
  const [selected, setSelected] = useState<'elecciones' | 'zombies'>(initialScenario);
  const [mode, setMode] = useState<'observador' | 'gobernador'>('observador');
  const [poblacion, setPoblacion] = useState<number>(SCENARIO_PRESETS[initialScenario].poblacionDefault);

  const handleSelectScenario = (id: 'elecciones' | 'zombies') => {
    setSelected(id);
    setPoblacion(SCENARIO_PRESETS[id].poblacionDefault);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-briefing-title"
      className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-zinc-900 text-zinc-100 border border-zinc-700/80 rounded-2xl max-w-2xl w-full p-7 space-y-6 shadow-2xl my-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 id="start-briefing-title" className="font-display text-3xl font-bold text-white tracking-tight">
              El Gobernador
            </h1>
            <p className="text-sm text-zinc-400">
              {mode === 'observador'
                ? 'Modo observador (v0.1): seguí la vida, la economía, la prensa y los hogares sin intervención manual.'
                : 'Modo gobernador: conducí presupuesto, obras públicas, vías y palancas de gobierno.'}
            </p>
          </div>
          {(manualSaveMeta || autoSaveMeta) && (
            <div className="flex flex-wrap gap-2">
              {manualSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadManual}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-100 whitespace-nowrap"
                >
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  Continuar (D{manualSaveMeta.dia})
                </button>
              )}
              {autoSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadAutoSave}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-100 whitespace-nowrap"
                >
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  Auto (D{autoSaveMeta.dia})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mode & Scale Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-800/45 border border-zinc-700/70 rounded-2xl p-3.5 text-xs">
          <div className="space-y-1.5">
            <span className="text-zinc-400 font-semibold block">Modo de inicio</span>
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-900/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('observador')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  mode === 'observador' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Observador (G0)
              </button>
              <button
                type="button"
                onClick={() => setMode('gobernador')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  mode === 'gobernador' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                Gobernador (G2)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-zinc-400 font-semibold block">Escala de población</span>
            <div className="grid grid-cols-3 gap-1.5 bg-zinc-900/70 p-1 rounded-xl font-mono tabular-nums">
              {SCALE_PRESETS.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setPoblacion(sc)}
                  className={`py-2 px-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    poblacion === sc ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {sc.toLocaleString('es-AR')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['elecciones', 'zombies'] as const).map((id) => {
            const p = SCENARIO_PRESETS[id];
            const isSelected = selected === id;
            const Icon = id === 'elecciones' ? Vote : ShieldAlert;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectScenario(id)}
                className={`text-left p-5 rounded-2xl border transition-colors space-y-3 ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-950/35'
                    : 'border-zinc-700/80 bg-zinc-800/50 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl font-bold text-white">{p.nombre}</span>
                  <div className="flex items-center gap-2">
                    <HintIcon text={p.historia} placement="top" />
                    <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  </div>
                </div>
                <div className="text-xs font-medium text-emerald-400">{p.subtitulo}</div>
                {mode === 'gobernador' && (
                  <div className="pt-2 border-t border-zinc-800 text-xs space-y-1.5">
                    <div className="text-emerald-300">
                      <span className="text-zinc-400">Meta: </span>
                      {p.victoria.descripcion}
                    </div>
                    <div className="text-rose-300">
                      <span className="text-zinc-400">Derrota: </span>
                      {p.derrota.descripcion}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenAdvancedConfig}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors whitespace-nowrap"
          >
            <Settings2 className="w-4 h-4 text-zinc-400" />
            Opciones
          </button>

          <button
            type="button"
            onClick={() => onStartScenario(selected, { mode, poblacion })}
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg transition-colors whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            Comenzar ({mode === 'observador' ? 'Observador' : 'Gobernador'})
          </button>
        </div>
      </div>
    </div>
  );
};
