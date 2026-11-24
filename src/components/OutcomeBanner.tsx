import React from 'react';
import { Trophy, AlertOctagon } from 'lucide-react';
import { CommunityDerived, GameState } from '../types/game';

interface OutcomeBannerProps {
  state: GameState;
  derived: CommunityDerived;
  onOpenNewGame: () => void;
}

export const OutcomeBanner: React.FC<OutcomeBannerProps> = ({
  state,
  derived,
  onOpenNewGame,
}) => {
  if (state.resultado.estado === 'jugando') return null;

  const isWin = state.resultado.estado === 'victoria';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5 shadow-xl">
        <div className="flex items-center gap-3">
          {isWin ? (
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Trophy className="w-6 h-6" />
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700">
              <AlertOctagon className="w-6 h-6" />
            </div>
          )}
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {isWin ? 'Mandato exitoso' : 'Colapso del mandato'}
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Finalizado en el día {state.resultado.diaFinal ?? state.reloj.dia}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{state.resultado.razon}</p>

        <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs font-mono tabular-nums">
          <div>
            <span className="font-sans text-slate-500 block">Población final</span>
            <span className="text-base font-semibold text-slate-900">{derived.poblacion}</span>
          </div>
          <div>
            <span className="font-sans text-slate-500 block">Apoyo electoral</span>
            <span className="text-base font-semibold text-slate-900">{derived.apoyoPct}%</span>
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
