import React from 'react';
import { Pause, Play, StepForward, AlertTriangle, CloudRain, Skull, CheckCircle2 } from 'lucide-react';
import { FISCAL_PERIOD_DAYS, SCENARIO_PRESETS } from '../data/catalogs';
import { CommunityDerived, GameState } from '../types/game';

interface StatusStripProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  aiBusy: boolean;
}

export const StatusStrip: React.FC<StatusStripProps> = ({
  state,
  derived,
  paused,
  speed,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  aiBusy,
}) => {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const plazo = preset.victoria.plazoDia ?? 365;
  const objectiveValue =
    preset.victoria.metrica === 'apoyoPct' ? `${derived.apoyoPct}%` : `${derived.poblacion} hab.`;
  const objectiveHealthy =
    preset.victoria.metrica === 'apoyoPct'
      ? derived.apoyoPct >= preset.victoria.umbral
      : derived.poblacion >= preset.victoria.umbral;

  const estDiario = state.ultimaSalidaEconomica.disponibleDiarioEstimado;
  const activeFen = state.clima.fenomenos[0];

  return (
    <section
      aria-label="Estado del gobierno y reloj de simulación"
      className="bg-white border-b border-slate-200 px-6 py-3"
    >
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Playback & Clock */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={state.resultado.estado !== 'jugando'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-white text-slate-900 shadow-xs hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
            {[1, 3, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  speed === spd
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {spd}×
              </button>
            ))}
            <button
              type="button"
              onClick={onStepDay}
              disabled={state.resultado.estado !== 'jugando'}
              title="Avanzar 1 día de juego"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 rounded-md hover:bg-white/70 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <StepForward className="w-3.5 h-3.5" />
              +1 Día
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span className="font-semibold text-slate-900">
              Año {state.reloj.anio} · Día {state.reloj.dia}/{plazo}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Período fiscal {state.reloj.periodoFiscal} ({state.reloj.diasEnPeriodoFiscal}/{FISCAL_PERIOD_DAYS}d)
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-sans">
              Módulo: <strong className="font-semibold text-slate-800">{state.config.economiaModulo}</strong>
            </span>
            {state.esConfigDePrueba && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-amber-700 font-medium">Configuración de prueba</span>
              </>
            )}
          </div>
        </div>

        {/* Exact Governor Metrics + Objective + Climate */}
        <div className="flex items-center gap-6 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            {objectiveHealthy ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            )}
            <span className="text-slate-500">{preset.nombre}:</span>
            <span className={`font-mono font-semibold tabular-nums ${objectiveHealthy ? 'text-emerald-700' : 'text-amber-700'}`}>
              {objectiveValue}
            </span>
            <span className="text-slate-400 font-mono">
              (meta {preset.victoria.op} {preset.victoria.umbral})
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          <div className="flex items-center gap-5 font-mono tabular-nums">
            <div>
              <span className="font-sans text-slate-500 mr-1.5">Reserva</span>
              <span className={`font-semibold ${state.gobierno.reserva < 100 ? 'text-rose-700' : 'text-slate-900'}`}>
                ${Math.round(state.gobierno.reserva)}
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 mr-1.5">Balance/día</span>
              <span className={`font-semibold ${estDiario < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {estDiario >= 0 ? '+' : ''}${estDiario.toFixed(0)}
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 mr-1.5">Inflación</span>
              <span className={`font-semibold ${state.gobierno.inflacion > 25 ? 'text-amber-700' : 'text-slate-900'}`}>
                {state.gobierno.inflacion.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 mr-1.5">Alimento</span>
              <span className={`font-semibold ${state.alimento.diasStock < 5 ? 'text-rose-700' : 'text-slate-900'}`}>
                {state.alimento.diasStock.toFixed(1)} días
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          <div className="flex items-center gap-1.5 text-slate-600">
            {activeFen ? (
              <>
                {activeFen.tipo === 'plaga_zombie' ? (
                  <Skull className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                ) : (
                  <CloudRain className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
                <span className="font-medium text-rose-700">
                  {activeFen.nombre} ({Math.round(activeFen.intensidad)}%)
                </span>
              </>
            ) : (
              <span>Clima estable</span>
            )}
            {state.gobierno.finanzas.impago && (
              <span className="ml-2 font-semibold text-rose-700">· Impago activo</span>
            )}
            {aiBusy && (
              <span className="ml-2 text-teal-700 font-medium">· IA redactando</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
