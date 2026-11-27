import React from 'react';
import { ArrowDown, Compass, GitBranch, User, X } from 'lucide-react';
import { buildCausalChain } from '../../engine/simulation';
import { CausalStep, GameState, ZoneId } from '../../types/game';
import { RctWindow } from './RctWindow';

interface CausalChainListProps {
  state: GameState;
  startRef?: string;
  fallbackText?: string;
  onSelectNpc?: (npcId: string) => void;
  onJumpZone?: (zone: ZoneId) => void;
}

const CausalChainList: React.FC<CausalChainListProps> = ({
  state,
  startRef,
  fallbackText,
  onSelectNpc,
  onJumpZone,
}) => {
  const steps: CausalStep[] = buildCausalChain(state, startRef, fallbackText);

  if (steps.length === 0) {
    return (
      <div className="text-sm text-zinc-400 py-3">
        Sin eslabones previos registrados.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <React.Fragment key={`${step.id}_${idx}`}>
            <div className="bg-zinc-800/70 border border-zinc-700/70 rounded-xl p-3.5 text-sm space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{step.titulo}</span>
                <span className="font-mono text-xs text-amber-300 tabular-nums shrink-0">
                  D{step.dia}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{step.detalle}</p>
              {(step.npcId || step.zona) && (onSelectNpc || onJumpZone) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {step.npcId && onSelectNpc && (
                    <button
                      type="button"
                      onClick={() => onSelectNpc(step.npcId!)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-700 text-emerald-400 rounded-lg whitespace-nowrap"
                    >
                      <User className="w-3.5 h-3.5" />
                      Ver vecino
                    </button>
                  )}
                  {step.zona && onJumpZone && (
                    <button
                      type="button"
                      onClick={() => onJumpZone(step.zona!)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-700 text-zinc-200 rounded-lg capitalize whitespace-nowrap"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      Zona {state.zonas[step.zona]?.nombre ?? step.zona}
                    </button>
                  )}
                </div>
              )}
            </div>
            {!isLast && (
              <div className="flex justify-center text-zinc-500">
                <ArrowDown className="w-4 h-4" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

interface CausalInspectModalProps {
  state: GameState;
  title: string;
  startRef?: string;
  fallbackText?: string;
  onClose: () => void;
  onSelectNpc?: (npcId: string) => void;
  onJumpZone?: (zone: ZoneId) => void;
}

export const CausalInspectModal: React.FC<CausalInspectModalProps> = ({
  state,
  title,
  startRef,
  fallbackText,
  onClose,
  onSelectNpc,
  onJumpZone,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <RctWindow
          title="¿Por qué pasó?"
          subtitle={title}
          tone="amber"
          icon={<GitBranch className="w-4 h-4" />}
          onClose={onClose}
          className="w-full"
        >
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <CausalChainList
              state={state}
              startRef={startRef}
              fallbackText={fallbackText}
              onSelectNpc={(id) => {
                onSelectNpc?.(id);
                onClose();
              }}
              onJumpZone={
                onJumpZone
                  ? (z) => {
                      onJumpZone(z);
                      onClose();
                    }
                  : undefined
              }
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl"
              >
                <X className="w-3.5 h-3.5" />
                Cerrar
              </button>
            </div>
          </div>
        </RctWindow>
      </div>
    </div>
  );
};
