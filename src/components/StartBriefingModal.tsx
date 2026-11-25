import React, { useState } from 'react';
import { FolderOpen, Play, Settings2, ShieldAlert, Vote } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/catalogs';
import { SaveSlotMeta } from '../engine/gameController';
import { HintIcon } from './hud/UiTooltip';

interface StartBriefingModalProps {
  initialScenario: 'elecciones' | 'zombies';
  manualSaveMeta: SaveSlotMeta | null;
  autoSaveMeta: SaveSlotMeta | null;
  onStartScenario: (escenarioId: 'elecciones' | 'zombies') => void;
  onOpenAdvancedConfig: () => void;
  onLoadManual: () => boolean;
  onLoadAutoSave: () => boolean;
}

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
              Elegí escenario para empezar.
            </p>
          </div>
          {(manualSaveMeta || autoSaveMeta) && (
            <div className="flex flex-wrap gap-2">
              {manualSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadManual}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-100"
                >
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  Continuar (D{manualSaveMeta.dia})
                </button>
              )}
              {autoSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadAutoSave}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-100"
                >
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  Auto (D{autoSaveMeta.dia})
                </button>
              )}
            </div>
          )}
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
                onClick={() => setSelected(id)}
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
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenAdvancedConfig}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors"
          >
            <Settings2 className="w-4 h-4 text-zinc-400" />
            Opciones
          </button>

          <button
            type="button"
            onClick={() => onStartScenario(selected)}
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            Comenzar
          </button>
        </div>
      </div>
    </div>
  );
};
