import React, { useState } from 'react';
import { FolderOpen, Play, Settings2 } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/catalogs';
import { SaveSlotMeta } from '../engine/gameController';
import { GovernorComplexityLevel } from '../types/game';

interface StartBriefingModalProps {
  initialScenario: 'elecciones' | 'zombies';
  manualSaveMeta: SaveSlotMeta | null;
  autoSaveMeta: SaveSlotMeta | null;
  onStartScenario: (
    escenarioId: 'elecciones' | 'zombies',
    options?: {
      mode?: 'observador' | 'gobernador';
      nivelGobernador?: GovernorComplexityLevel;
      poblacion?: number;
    }
  ) => void;
  onOpenAdvancedConfig: () => void;
  onLoadManual: () => boolean;
  onLoadAutoSave: () => boolean;
}

const SCALE_PRESETS = [100, 500, 5000] as const;
type StartPresetId = 'observador_g0' | 'elecciones_g1';

export const StartBriefingModal: React.FC<StartBriefingModalProps> = ({
  initialScenario,
  manualSaveMeta,
  autoSaveMeta,
  onStartScenario,
  onOpenAdvancedConfig,
  onLoadManual,
  onLoadAutoSave,
}) => {
  const [presetId, setPresetId] = useState<StartPresetId>('observador_g0');
  const [poblacion, setPoblacion] = useState<number>(SCENARIO_PRESETS[initialScenario].poblacionDefault);

  const isEleccionesG1 = presetId === 'elecciones_g1';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-briefing-title"
      className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-zinc-900 text-zinc-100 border border-zinc-700/80 rounded-2xl max-w-lg w-full p-7 space-y-6 shadow-2xl my-6">
        <div className="space-y-1.5">
          <h1 id="start-briefing-title" className="font-display text-3xl font-bold text-white tracking-tight">
            El Gobernador
          </h1>
          <p className="text-sm text-zinc-400">
            {isEleccionesG1
              ? 'Elecciones (G1): gestioná obra pública, vías, impuestos, salario público y nivel de obras hasta el día 365.'
              : 'Observador del mundo (G0): seguí el clima, los hogares, las firmas y la prensa con piloto automático.'}
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

        <div className="bg-zinc-800/45 border border-zinc-700/70 rounded-2xl p-4 space-y-2.5 text-xs">
          <span className="text-zinc-400 font-semibold block">Preset de partida</span>
          <div className="grid grid-cols-2 gap-1.5 bg-zinc-900/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPresetId('observador_g0')}
              className={`py-2 px-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                presetId === 'observador_g0' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Observador (G0)
            </button>
            <button
              type="button"
              onClick={() => setPresetId('elecciones_g1')}
              className={`py-2 px-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                presetId === 'elecciones_g1' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Elecciones G1
            </button>
          </div>
        </div>

        <div className="bg-zinc-800/45 border border-zinc-700/70 rounded-2xl p-4 space-y-2 text-xs">
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenAdvancedConfig}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors whitespace-nowrap"
          >
            <Settings2 className="w-4 h-4 text-zinc-400" />
            Opciones avanzadas
          </button>

          <button
            type="button"
            onClick={() =>
              isEleccionesG1
                ? onStartScenario('elecciones', {
                    mode: 'gobernador',
                    nivelGobernador: 'G1',
                    poblacion,
                  })
                : onStartScenario(initialScenario, {
                    mode: 'observador',
                    nivelGobernador: 'G0',
                    poblacion,
                  })
            }
            className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg transition-colors whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            Comenzar
          </button>
        </div>
      </div>
    </div>
  );
};
