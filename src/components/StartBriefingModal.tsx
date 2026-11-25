import React, { useState } from 'react';
import { FolderOpen, Play, Settings2, ShieldAlert, Vote } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/catalogs';
import { SaveSlotMeta } from '../engine/gameController';

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
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-slate-900 text-slate-100 border border-slate-700/90 rounded-xl max-w-3xl w-full p-6 space-y-5 shadow-2xl my-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 id="start-briefing-title" className="font-display text-3xl font-bold text-white tracking-tight">
              El Gobernador
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Gobierna una ciudad viva de ciudadanos autónomos. Ajusta todas tus políticas en{' '}
              <strong className="text-teal-300">Palancas</strong>, vigila la{' '}
              <strong className="text-amber-300">Economía</strong> y responde a la prensa y crisis en{' '}
              <strong className="text-sky-300">Ciudad</strong>.
            </p>
          </div>
          {(manualSaveMeta || autoSaveMeta) && (
            <div className="flex flex-wrap gap-2">
              {manualSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadManual}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                  Continuar (D{manualSaveMeta.dia})
                </button>
              )}
              {autoSaveMeta && (
                <button
                  type="button"
                  onClick={onLoadAutoSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
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
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-teal-400 bg-teal-950/45'
                    : 'border-slate-700/80 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold text-white">{p.nombre}</span>
                  <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-teal-300' : 'text-slate-400'}`} />
                </div>
                <div className="text-xs font-medium text-teal-300 mt-0.5">{p.subtitulo}</div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{p.historia}</p>
                <div className="mt-3 pt-2.5 border-t border-slate-700/80 text-[11px] space-y-1">
                  <div className="text-emerald-300">
                    <span className="text-slate-400">Meta: </span>
                    {p.victoria.descripcion}
                  </div>
                  <div className="text-rose-300">
                    <span className="text-slate-400">Colapso: </span>
                    {p.derrota.descripcion}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/45 border border-slate-800 rounded-lg p-3 text-xs text-slate-300">
          <div>
            <div className="font-semibold text-white mb-0.5">1. Ajusta tus Palancas</div>
            <p className="text-[11px] text-slate-400">
              Impuestos, servicios, ayuda social y comida aplican al día siguiente, sin esperas semanales.
            </p>
          </div>
          <div>
            <div className="font-semibold text-white mb-0.5">2. Vigila Caja y Comida</div>
            <p className="text-[11px] text-slate-400">
              Si falta caja habrá impago y huelgas; si falta comida o sube mucho el precio habrá saqueos.
            </p>
          </div>
          <div>
            <div className="font-semibold text-white mb-0.5">3. Explora el Valle</div>
            <p className="text-[11px] text-slate-400">
              Haz clic en edificios o vecinos para inspeccionarlos y usa las capas del mapa abajo.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenAdvancedConfig}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg"
          >
            <Settings2 className="w-4 h-4 text-teal-400" />
            Configuración avanzada
          </button>

          <button
            type="button"
            onClick={() => onStartScenario(selected)}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg shadow-lg"
          >
            <Play className="w-4 h-4" />
            Comenzar partida
          </button>
        </div>
      </div>
    </div>
  );
};
