import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { DEFAULT_CHAOS_LIMITS, SCENARIO_PRESETS } from '../data/catalogs';
import { isTestConfig } from '../engine/worldGenerator';
import { EconomyModule, WorldConfig } from '../types/game';

interface WorldConfigModalProps {
  initialConfig: WorldConfig;
  aiAvailable: boolean;
  onStartNewGame: (config: WorldConfig) => void;
  onClose: () => void;
}

export const WorldConfigModal: React.FC<WorldConfigModalProps> = ({
  initialConfig,
  aiAvailable,
  onStartNewGame,
  onClose,
}) => {
  const [config, setConfig] = useState<WorldConfig>(structuredClone(initialConfig));
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const testMode = isTestConfig(config);

  const handleSelectScenario = (id: 'elecciones' | 'zombies') => {
    const nextPreset = SCENARIO_PRESETS[id];
    setConfig({
      escenarioId: id,
      economiaModulo: nextPreset.economiaDefault,
      cantidadMedios: nextPreset.mediosDefault,
      poblacionInicial: nextPreset.poblacionDefault,
      caos: { ...nextPreset.caosDefault },
      usarIaGemini: config.usarIaGemini,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-config-title"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 space-y-6 my-8 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="world-config-title" className="font-display text-2xl font-bold text-slate-900">
              Configuración del mundo
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Elige un escenario preconfigurado o ajusta las reglas y capas económicas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
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
                className={`text-left p-4 rounded-xl border transition-colors ${
                  selected
                    ? 'border-teal-700 bg-teal-50/40 ring-1 ring-teal-700'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-display text-lg font-bold text-slate-900">{p.nombre}</div>
                <div className="text-xs font-medium text-teal-800 mt-0.5">{p.subtitulo}</div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">{p.historia}</p>
                <div className="mt-3 pt-2 border-t border-slate-200/70 text-[11px] text-slate-500 space-y-0.5">
                  <div>
                    <strong className="text-slate-700">Victoria:</strong> {p.victoria.descripcion}
                  </div>
                  <div>
                    <strong className="text-slate-700">Derrota:</strong> {p.derrota.descripcion}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Core Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-800">Reglas del mundo y prensa</h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Módulo de economía (preset: {preset.economiaDefault})
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'simple', label: 'Simple' },
                    { id: 'individual', label: 'Individual' },
                    { id: 'fiscal', label: 'Fiscal' },
                  ] as Array<{ id: EconomyModule; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setConfig({ ...config, economiaModulo: m.id })}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                      config.economiaModulo === m.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {config.economiaModulo === 'simple' &&
                  'Almacén común estatal, ración global, impuesto único y subsidios directos.'}
                {config.economiaModulo === 'individual' &&
                  'Mercado con precio dinámico, ahorros propios, impuestos por grupo, pensiones y garantía alimentaria.'}
                {config.economiaModulo === 'fiscal' &&
                  'Incluye economía individual + emisión monetaria e inflación dinámica.'}
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Medios de prensa</label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {config.cantidadMedios === 1 ? '1 (Monopolio)' : `${config.cantidadMedios} medios`}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                value={config.cantidadMedios}
                onChange={(e) => setConfig({ ...config, cantidadMedios: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-medium text-slate-700">Población inicial</label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {config.poblacionInicial} NPCs
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={140}
                step={10}
                value={config.poblacionInicial}
                onChange={(e) => setConfig({ ...config, poblacionInicial: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={config.usarIaGemini}
                  disabled={!aiAvailable}
                  onChange={(e) => setConfig({ ...config, usarIaGemini: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-teal-700"
                />
                <span>
                  <strong className="text-slate-800 block">Activar Director de IA (Gemini asíncrono)</strong>
                  <span className="text-slate-500">
                    {aiAvailable
                      ? 'Redacta columnas de prensa, pensamientos y elige acciones sin bloquear la simulación.'
                      : 'Sin clave de Gemini configurada en servidor; correrá con plantillas y respaldo.'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Chaos Limits */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-800">Límites del caos de la IA</h3>
              <button
                type="button"
                onClick={() => setConfig({ ...config, caos: { ...DEFAULT_CHAOS_LIMITS } })}
                className="text-[11px] text-teal-700 hover:underline"
              >
                Restaurar balance
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-600">Acciones máximas por período</span>
                <span className="font-mono font-semibold tabular-nums">{config.caos.maxAccionesPorPeriodo}</span>
              </div>
              <input
                type="range"
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
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-600">Duración del período de caos</span>
                <span className="font-mono font-semibold tabular-nums">{config.caos.periodoDias} días</span>
              </div>
              <input
                type="range"
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
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-600">Tope de rol fuera de puesto</span>
                <span className="font-mono font-semibold tabular-nums">{config.caos.maxPctRolFueraDePuesto}%</span>
              </div>
              <input
                type="range"
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
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-600">Respiro si satisfacción media menor a</span>
                <span className="font-mono font-semibold tabular-nums">
                  {config.caos.respiroSiSatisfaccionMediaMenorA}%
                </span>
              </div>
              <input
                type="range"
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
        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            {testMode ? (
              <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                <AlertCircle className="w-4 h-4" />
                Configuración de prueba (difiere del preset balanceado)
              </span>
            ) : (
              <span className="text-slate-500">Valores estándar del escenario</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onStartNewGame(config)}
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              Iniciar partida
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
