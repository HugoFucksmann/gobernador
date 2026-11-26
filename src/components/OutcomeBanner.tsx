import React from 'react';
import { AlertOctagon, GitBranch, Play, Trophy } from 'lucide-react';
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
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const isG0 = govLevel === 'G0' || Boolean(state.config.estadoAutomatico);
  const missedEvent = state.eventos.find((e) => e.tipo === 'objetivo_perdido');
  const victoryCumplida = Boolean(state.resultado.victoriaCumplida);
  const showMilestone =
    !isG0 &&
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
        className="fixed inset-0 z-40 bg-zinc-950/65 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div
          className={`bg-zinc-900 text-zinc-100 border ${
            isVictory ? 'border-emerald-500/50' : 'border-amber-500/50'
          } rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-xl ${
                isVictory ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
              }`}
            >
              {isVictory ? <Trophy className="w-6 h-6" /> : <AlertOctagon className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                {isVictory ? 'Objetivo cumplido' : 'Objetivo perdido'}
              </h2>
              <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                Día {isVictory ? state.resultado.diaVictoria ?? state.reloj.dia : missedEvent?.dia ?? state.reloj.dia}
              </p>
            </div>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed">
            {state.resultado.razon ||
              (isVictory
                ? 'Alcanzaste la meta del escenario. Podés seguir jugando.'
                : 'No se alcanzó la meta al cierre, pero la comunidad continúa.')}
          </p>

          <div className="grid grid-cols-2 gap-4 py-3.5 border-y border-zinc-800 text-xs font-mono tabular-nums">
            <div>
              <span className="font-sans text-zinc-400 block">Población</span>
              <span className="text-base font-bold text-white">
                {derived.poblacion} ({derived.poblacionPct}%)
              </span>
            </div>
            <div>
              <span className="font-sans text-zinc-400 block">Apoyo</span>
              <span className={`text-base font-bold ${isVictory ? 'text-emerald-400' : 'text-amber-300'}`}>
                {derived.apoyoPct}%
              </span>
            </div>
            <div>
              <span className="font-sans text-zinc-400 block">Reserva</span>
              <span className="text-base font-bold text-white">${Math.round(state.gobierno.reserva)}</span>
            </div>
            <div>
              <span className="font-sans text-zinc-400 block">Hambre</span>
              <span className="text-base font-bold text-white">{derived.hambreCriticaPct}%</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onOpenNewGame}
              className="px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 border border-zinc-700 rounded-xl"
            >
              Nueva partida
            </button>
            <button
              type="button"
              onClick={onDismissMilestone}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl ${
                isVictory ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              Seguir
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
    .filter((b) => ['economia', 'clima', 'condicion', 'sistema'].includes(b.categoria))
    .slice(0, 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-zinc-900 text-zinc-100 border border-rose-500/50 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-rose-950 text-rose-400">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Fin del mandato</h2>
            <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
              Día {state.resultado.diaFinal ?? state.reloj.dia}
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">{state.resultado.razon}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3.5 border-y border-zinc-800 text-xs font-mono tabular-nums">
          <div>
            <span className="font-sans text-zinc-400 block">Población</span>
            <span className="text-base font-bold text-white">{derived.poblacion}</span>
          </div>
          <div>
            <span className="font-sans text-zinc-400 block">Apoyo</span>
            <span className="text-base font-bold text-white">{derived.apoyoPct}%</span>
          </div>
          <div>
            <span className="font-sans text-zinc-400 block">Reserva</span>
            <span className="text-base font-bold text-white">${Math.round(state.gobierno.reserva)}</span>
          </div>
          <div>
            <span className="font-sans text-zinc-400 block">Hambre</span>
            <span className="text-base font-bold text-rose-400">{derived.hambreCriticaPct}%</span>
          </div>
        </div>

        {causalChain.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <GitBranch className="w-4 h-4 text-rose-400" />
              Causas
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {causalChain.map((step, i) => (
                <div
                  key={`${step.id}_${i}`}
                  className="bg-zinc-800/65 rounded-xl p-3 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{step.titulo}</span>
                    <span className="font-mono text-zinc-400">D{step.dia}</span>
                  </div>
                  <p className="text-zinc-300">{step.detalle}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {keyTimeline.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-300">Hitos</div>
            <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl max-h-32 overflow-y-auto">
              {keyTimeline.map((item) => (
                <div key={item.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <span className="text-zinc-200 truncate">{item.titulo}</span>
                  <span className="font-mono text-zinc-400 shrink-0">D{item.dia}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenNewGame}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
          >
            Nueva partida
          </button>
        </div>
      </div>
    </div>
  );
};
