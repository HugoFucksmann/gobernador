import React from 'react';
import { Trophy, AlertOctagon, GitBranch, Play } from 'lucide-react';
import { buildCausalChain } from '../engine/simulation';
import { CommunityDerived, GameState } from '../types/game';

interface OutcomeBannerProps {
  state: GameState;
  derived: CommunityDerived;
  milestoneBannerDismissed: boolean;
  onDismissMilestone: () => void;
  onOpenNewGame: () => void;
}

export const OutcomeBanner: React.FC<OutcomeBannerProps> = ({
  state,
  derived,
  milestoneBannerDismissed,
  onDismissMilestone,
  onOpenNewGame,
}) => {
  const missedEvent = state.eventos.find((e) => e.tipo === 'objetivo_perdido');
  const victoryCumplida = Boolean(state.resultado.victoriaCumplida);
  const showMilestone =
    state.resultado.estado === 'jugando' &&
    (victoryCumplida || Boolean(missedEvent)) &&
    !milestoneBannerDismissed;
  const isDefeat = state.resultado.estado === 'derrota';

  if (!showMilestone && !isDefeat) return null;

  if (showMilestone) {
    const isVictory = victoryCumplida;
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4"
      >
        <div
          className={`bg-white text-slate-900 border ${
            isVictory ? 'border-emerald-200' : 'border-amber-200'
          } rounded-xl max-w-md w-full p-6 space-y-5 shadow-xl`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                isVictory ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {isVictory ? <Trophy className="w-6 h-6" /> : <AlertOctagon className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                {isVictory ? '¡Objetivo de mandato cumplido!' : 'Objetivo de mandato perdido'}
              </h2>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                {isVictory
                  ? `Hito alcanzado en el día ${state.resultado.diaVictoria ?? state.reloj.dia}`
                  : `Evaluado al cierre del plazo (día ${missedEvent?.dia ?? state.reloj.dia})`}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed">
            {isVictory
              ? state.resultado.razon ||
                'Alcanzaste la meta del escenario. Podés seguir gobernando de manera continua para ver cómo evoluciona la comunidad o iniciar una nueva partida.'
              : state.resultado.razon ||
                'No se alcanzó la meta al cumplirse el plazo, pero la comunidad sigue adelante y podés continuar gobernando.'}
          </p>

          <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs font-mono tabular-nums">
            <div>
              <span className="font-sans text-slate-500 block">Población</span>
              <span className="text-base font-semibold text-slate-900">
                {derived.poblacion} ({derived.poblacionPct}%)
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 block">Apoyo electoral</span>
              <span
                className={`text-base font-semibold ${
                  isVictory ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {derived.apoyoPct}%
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 block">Reserva estatal</span>
              <span className="text-base font-semibold text-slate-900">${Math.round(state.gobierno.reserva)}</span>
            </div>
            <div>
              <span className="font-sans text-slate-500 block">Hambre crítica</span>
              <span className="text-base font-semibold text-slate-900">{derived.hambreCriticaPct}%</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={onOpenNewGame}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg"
            >
              Nueva partida
            </button>
            <button
              type="button"
              onClick={onDismissMilestone}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white rounded-lg ${
                isVictory ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-amber-700 hover:bg-amber-800'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Seguir jugando
            </button>
          </div>
        </div>
      </div>
    );
  }

  const endEvent = state.eventos.find((e) => e.tipo === 'fin_partida');
  const causalChain = buildCausalChain(
    state,
    endEvent?.id || endEvent?.causa,
    state.resultado.razon
  );
  const keyTimeline = state.bitacora
    .filter((b) =>
      ['economia', 'clima', 'condicion', 'sistema'].includes(b.categoria)
    )
    .slice(0, 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white text-slate-900 border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-xl my-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Colapso del mandato
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Finalizado en el día {state.resultado.diaFinal ?? state.reloj.dia}
              {state.resultado.victoriaCumplida
                ? ` (meta cumplida previamente en día ${state.resultado.diaVictoria})`
                : ''}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{state.resultado.razon}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-slate-100 text-xs font-mono tabular-nums">
          <div>
            <span className="font-sans text-slate-500 block">Población</span>
            <span className="text-base font-semibold text-slate-900">{derived.poblacion}</span>
          </div>
          <div>
            <span className="font-sans text-slate-500 block">Apoyo</span>
            <span className="text-base font-semibold text-slate-900">{derived.apoyoPct}%</span>
          </div>
          <div>
            <span className="font-sans text-slate-500 block">Reserva</span>
            <span className="text-base font-semibold text-slate-900">${Math.round(state.gobierno.reserva)}</span>
          </div>
          <div>
            <span className="font-sans text-slate-500 block">Hambre crít.</span>
            <span className="text-base font-semibold text-rose-700">{derived.hambreCriticaPct}%</span>
          </div>
        </div>

        {causalChain.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <GitBranch className="w-3.5 h-3.5 text-rose-600" />
              Cadena causal del desenlace
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {causalChain.map((step, i) => (
                <div
                  key={`${step.id}_${i}`}
                  className="bg-slate-50 border border-slate-200 rounded-md p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{step.titulo}</span>
                    <span className="font-mono text-[10px] text-slate-500">Día {step.dia}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{step.detalle}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {keyTimeline.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-800">Últimos hitos previos</div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-32 overflow-y-auto">
              {keyTimeline.map((item) => (
                <div key={item.id} className="px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2">
                  <span className="text-slate-700 truncate">{item.titulo}</span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">D{item.dia}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenNewGame}
            className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
          >
            Configurar nueva partida
          </button>
        </div>
      </div>
    </div>
  );
};

