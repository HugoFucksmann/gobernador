import React, { useState } from 'react';
import { AlertCircle, FolderOpen, Save, X } from 'lucide-react';
import { DEFAULT_CHAOS_LIMITS, SCENARIO_PRESETS } from '../data/catalogs';
import { SaveSlotMeta } from '../engine/gameController';
import { isTestConfig, resolveComplexityConfig } from '../engine/worldGenerator';
import {
  EconomyModule,
  GovernorComplexityLevel,
  WorldComplexityLevel,
  WorldConfig,
} from '../types/game';
import { HintIcon } from './hud/UiTooltip';

interface WorldConfigModalProps {
  initialConfig: WorldConfig;
  aiAvailable: boolean;
  currentDay: number;
  manualSaveMeta: SaveSlotMeta | null;
  autoSaveMeta: SaveSlotMeta | null;
  onSaveManual: () => boolean;
  onLoadManual: () => boolean;
  onLoadAutoSave: () => boolean;
  onStartNewGame: (config: WorldConfig) => void;
  onClose: () => void;
}

const WORLD_LEVEL_BUTTONS: Array<{ id: WorldComplexityLevel; label: string }> = [
  { id: 'M0', label: 'M0 · Base' },
  { id: 'M1', label: 'M1 · Mundo' },
  { id: 'M2', label: 'M2 · Hogares' },
  { id: 'M3', label: 'M3 · Vial' },
  { id: 'M4', label: 'M4 · Fiscal' },
];

export const WorldConfigModal: React.FC<WorldConfigModalProps> = ({
  initialConfig,
  aiAvailable,
  currentDay,
  manualSaveMeta,
  autoSaveMeta,
  onSaveManual,
  onLoadManual,
  onLoadAutoSave,
  onStartNewGame,
  onClose,
}) => {
  const [config, setConfig] = useState<WorldConfig>(() => {
    const cloned = structuredClone(initialConfig);
    const resolved = resolveComplexityConfig(cloned);
    return { ...cloned, ...resolved };
  });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const testMode = isTestConfig(config);
  const worldLevel: WorldComplexityLevel = config.nivelMundo ?? 'M3';
  const govLevel: GovernorComplexityLevel = config.nivelGobernador ?? 'G0';
  const estadoAuto = Boolean(config.estadoAutomatico ?? govLevel === 'G0');

  const handleSelectScenario = (id: 'elecciones' | 'zombies') => {
    const nextPreset = SCENARIO_PRESETS[id];
    const resolved = resolveComplexityConfig({
      nivelMundo: config.nivelMundo ?? 'M3',
      nivelGobernador: config.nivelGobernador ?? 'G0',
      estadoAutomatico: config.estadoAutomatico ?? true,
    });
    setConfig({
      escenarioId: id,
      economiaModulo: resolved.economiaModulo,
      nivelMundo: resolved.nivelMundo,
      nivelGobernador: resolved.nivelGobernador,
      estadoAutomatico: resolved.estadoAutomatico,
      cantidadMedios: nextPreset.mediosDefault,
      poblacionInicial: config.poblacionInicial || nextPreset.poblacionDefault,
      caos: { ...nextPreset.caosDefault },
      semilla: config.semilla,
      usarIaGemini: config.usarIaGemini,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-config-title"
      className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-zinc-900 text-zinc-100 border border-zinc-700/80 rounded-2xl max-w-3xl w-full p-6 space-y-6 my-8 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 id="world-config-title" className="font-display text-2xl font-bold text-white">
            Partida y Reglas
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Save & Load Slots */}
        <div className="bg-zinc-800/60 border border-zinc-700/70 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm space-y-0.5">
            <div className="font-semibold text-white">Guardado · Día {currentDay}</div>
            {saveFeedback && (
              <div className="text-xs font-medium text-emerald-400">{saveFeedback}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const ok = onSaveManual();
                setSaveFeedback(ok ? `Guardado en día ${currentDay}.` : 'No se pudo guardar.');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
            <button
              type="button"
              disabled={!manualSaveMeta}
              onClick={() => {
                if (!onLoadManual()) setSaveFeedback('Sin guardado válido.');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-4 h-4 text-emerald-400" />
              {manualSaveMeta ? `Manual D${manualSaveMeta.dia}` : 'Manual vacío'}
            </button>
            <button
              type="button"
              disabled={!autoSaveMeta}
              onClick={() => {
                if (!onLoadAutoSave()) setSaveFeedback('Sin autoguardado válido.');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-4 h-4 text-amber-400" />
              {autoSaveMeta ? `Auto D${autoSaveMeta.dia}` : 'Auto vacío'}
            </button>
          </div>
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['elecciones', 'zombies'] as const).map((id) => {
            const p = SCENARIO_PRESETS[id];
            const selected = config.escenarioId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectScenario(id)}
                className={`text-left p-4 rounded-2xl border transition-colors space-y-2 ${
                  selected
                    ? 'border-emerald-500 bg-emerald-950/35'
                    : 'border-zinc-700/80 hover:border-zinc-500 bg-zinc-800/45'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold text-white">{p.nombre}</span>
                  <HintIcon text={p.historia} placement="top" />
                </div>
                <div className="text-xs font-medium text-emerald-400">{p.subtitulo}</div>
                <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-300 space-y-1">
                  <div className="text-emerald-300">Meta: {p.victoria.descripcion}</div>
                  <div className="text-rose-300">Derrota: {p.derrota.descripcion}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-zinc-800 text-sm">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Mundo</h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <span>Nivel de mundo (M0–M4)</span>
                <HintIcon
                  text="M0: 1 zona sin clima ni caos · M1: 9 zonas, clima, prensa y caos · M2: M1 + hogares y viviendas · M3: M2 + red vial y suelo · M4: M3 + emisión e inflación."
                  placement="top"
                />
              </div>
              <div className="grid grid-cols-5 gap-1 p-1 bg-zinc-800 rounded-xl">
                {WORLD_LEVEL_BUTTONS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        nivelMundo: m.id,
                        economiaModulo: m.id === 'M4' ? 'fiscal' : 'base',
                      })
                    }
                    className={`py-2 px-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      worldLevel === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
              <div className="text-xs text-zinc-400">
                {WORLD_LEVEL_BUTTONS.find((w) => w.id === worldLevel)?.label}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <span>Nivel de gobernador (G0–G3)</span>
                <HintIcon
                  text="G0: sin intervención manual · G1: parcelas + 3 palancas · G2: palancas completas + obras y vías · G3: G2 + emisión, subsidio, educación, prensa y contraofertas."
                  placement="top"
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-800 rounded-xl">
                {(
                  [
                    { id: 'G0', label: 'G0' },
                    { id: 'G1', label: 'G1' },
                    { id: 'G2', label: 'G2' },
                    { id: 'G3', label: 'G3' },
                  ] as Array<{ id: GovernorComplexityLevel; label: string }>
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setConfig({ ...config, nivelGobernador: g.id })}
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      govLevel === g.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-zinc-300">Economía</span>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-800 rounded-xl">
                {(
                  [
                    { id: 'base', label: 'Base (M0–M3)' },
                    { id: 'fiscal', label: 'Fiscal (M4)' },
                  ] as Array<{ id: EconomyModule; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        economiaModulo: m.id,
                        nivelMundo: m.id === 'fiscal' ? 'M4' : worldLevel === 'M4' ? 'M3' : worldLevel,
                      })
                    }
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      config.economiaModulo === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-zinc-300">Medios</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {config.cantidadMedios}
                </span>
              </div>
              <input
                type="range"
                aria-label="Medios de prensa"
                min={0}
                max={3}
                value={config.cantidadMedios}
                onChange={(e) => setConfig({ ...config, cantidadMedios: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-300">Población inicial</span>
                <div className="flex items-center gap-1">
                  {[100, 500, 5000].map((pop) => (
                    <button
                      key={pop}
                      type="button"
                      onClick={() => setConfig({ ...config, poblacionInicial: pop })}
                      className={`px-2 py-1 font-mono font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        config.poblacionInicial === pop
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {pop.toLocaleString('es-AR')}
                    </button>
                  ))}
                  <input
                    id="world-pop-input"
                    type="number"
                    aria-label="Población inicial personalizada"
                    min={20}
                    max={5000}
                    value={config.poblacionInicial}
                    onChange={(e) => {
                      const val = Math.min(5000, Math.max(20, Math.floor(Number(e.target.value) || 20)));
                      setConfig({ ...config, poblacionInicial: val });
                    }}
                    className="w-16 px-2 py-1 text-right font-mono font-semibold text-white bg-zinc-800 border border-zinc-700 rounded-lg tabular-nums"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="world-seed-input" className="text-zinc-300 font-medium">
                  Semilla
                </label>
                <input
                  id="world-seed-input"
                  type="number"
                  min={1}
                  max={999999999}
                  value={config.semilla}
                  onChange={(e) => {
                    const val = Math.min(999999999, Math.max(1, Math.floor(Number(e.target.value) || 1)));
                    setConfig({ ...config, semilla: val });
                  }}
                  className="w-28 px-2.5 py-1.5 text-right font-mono font-semibold text-white bg-zinc-800 border border-zinc-700 rounded-xl tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs pt-1">
              <input
                type="checkbox"
                checked={estadoAuto}
                onChange={(e) => setConfig({ ...config, estadoAutomatico: e.target.checked })}
                className="rounded border-zinc-600"
              />
              <span className="text-zinc-200 font-medium">Estado automático</span>
              <HintIcon
                text="Si está activo, el gobierno ajusta palancas, obras y vías de forma autónoma (como modo observador o asistencia)."
                placement="top"
              />
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={config.usarIaGemini}
                disabled={!aiAvailable && !config.usarIaGemini}
                onChange={(e) => setConfig({ ...config, usarIaGemini: e.target.checked })}
                className="rounded border-zinc-600"
              />
              <span className="text-zinc-200 font-medium">IA opcional en prensa y acciones</span>
              <HintIcon
                text={
                  aiAvailable
                    ? 'Usa el modelo en servidor sin bloquear la simulación.'
                    : 'Sin clave configurada: usa plantillas automáticamente.'
                }
                placement="top"
              />
            </label>
          </div>

          {/* Chaos Limits */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Caos</h3>
              <button
                type="button"
                onClick={() => setConfig({ ...config, caos: { ...DEFAULT_CHAOS_LIMITS } })}
                className="text-xs text-emerald-400 hover:underline"
              >
                Restaurar
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Acciones máx./período</span>
                <span className="font-mono font-bold tabular-nums">{config.caos.maxAccionesPorPeriodo}</span>
              </div>
              <input
                type="range"
                aria-label="Acciones máximas por período"
                min={0}
                max={10}
                value={config.caos.maxAccionesPorPeriodo}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    caos: { ...config.caos, maxAccionesPorPeriodo: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Período caos</span>
                <span className="font-mono font-bold tabular-nums">{config.caos.periodoDias}d</span>
              </div>
              <input
                type="range"
                aria-label="Duración del período de caos"
                min={2}
                max={15}
                value={config.caos.periodoDias}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    caos: { ...config.caos, periodoDias: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Tope fuera de puesto</span>
                <span className="font-mono font-bold tabular-nums">{config.caos.maxPctRolFueraDePuesto}%</span>
              </div>
              <input
                type="range"
                aria-label="Tope de rol fuera de puesto"
                min={5}
                max={50}
                step={5}
                value={config.caos.maxPctRolFueraDePuesto}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    caos: { ...config.caos, maxPctRolFueraDePuesto: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Duración máx. acciones</span>
                <span className="font-mono font-bold tabular-nums">{config.caos.duracionMaxDias}d</span>
              </div>
              <input
                type="range"
                aria-label="Duración máxima de acciones"
                min={3}
                max={20}
                value={config.caos.duracionMaxDias}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    caos: { ...config.caos, duracionMaxDias: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Respiro si ánimo &lt;</span>
                <span className="font-mono font-bold tabular-nums">
                  {config.caos.respiroSiSatisfaccionMediaMenorA}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Respiro si satisfacción media menor a"
                min={10}
                max={60}
                step={5}
                value={config.caos.respiroSiSatisfaccionMediaMenorA}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    caos: { ...config.caos, respiroSiSatisfaccionMediaMenorA: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            {testMode ? (
              <span className="flex items-center gap-1.5 text-amber-300 font-medium">
                <AlertCircle className="w-4 h-4" />
                Configuración personalizada
              </span>
            ) : (
              <span className="text-zinc-400">Preset estándar ({worldLevel}/{govLevel})</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onStartNewGame(config)}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Iniciar partida
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
