import React from 'react';
import { ArrowDown, Compass, GitBranch, User, X } from 'lucide-react';
import { buildCausalChain } from '../../engine/simulation';
import { CausalStep, DistrictId, GameState, ZoneId } from '../../types/game';
import { RctWindow } from './RctWindow';

const ZONE_TO_DISTRICT: Record<ZoneId, DistrictId | 'all'> = {
  centro: 'civico',
  norte: 'campos',
  este: 'residencial',
  sur: 'taller',
  oeste: 'campos',
};

interface CausalChainListProps {
  state: GameState;
  startRef?: string;
  fallbackText?: string;
  onSelectNpc?: (npcId: string) => void;
  onJumpDistrict?: (district: DistrictId | 'all') => void;
}

export const CausalChainList: React.FC<CausalChainListProps> = ({
  state,
  startRef,
  fallbackText,
  onSelectNpc,
  onJumpDistrict,
}) => {
  const steps: CausalStep[] = buildCausalChain(state, startRef, fallbackText);

  if (steps.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic py-2">
        No hay eslabones previos registrados para este hecho.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <React.Fragment key={`${step.id}_${idx}`}>
            <div className="bg-slate-950/75 border border-slate-700/80 rounded p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-100">{step.titulo}</span>
                <span className="font-mono text-[10px] text-teal-300 tabular-nums shrink-0">
                  Día {step.dia} · {step.tipo}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{step.detalle}</p>
              {(step.npcId || step.zona) && (onSelectNpc || onJumpDistrict) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {step.npcId && onSelectNpc && (
                    <button
                      type="button"
                      onClick={() => onSelectNpc(step.npcId!)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-600 rounded-sm"
                    >
                      <User className="w-3 h-3" />
                      Ver vecino
                    </button>
                  )}
                  {step.zona && onJumpDistrict && (
                    <button
                      type="button"
                      onClick={() => onJumpDistrict(ZONE_TO_DISTRICT[step.zona!] || 'all')}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-sm capitalize"
                    >
                      <Compass className="w-3 h-3" />
                      Ir a zona {step.zona}
                    </button>
                  )}
                </div>
              )}
            </div>
            {!isLast && (
              <div className="flex justify-center text-slate-500">
                <ArrowDown className="w-3.5 h-3.5" />
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
  onJumpDistrict?: (district: DistrictId | 'all') => void;
}

export const CausalInspectModal: React.FC<CausalInspectModalProps> = ({
  state,
  title,
  startRef,
  fallbackText,
  onClose,
  onSelectNpc,
  onJumpDistrict,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <RctWindow
          title="¿Por qué pasó esto?"
          subtitle={title}
          tone="amber"
          icon={<GitBranch className="w-3.5 h-3.5" />}
          onClose={onClose}
          className="w-full"
        >
          <div className="p-3.5 space-y-3 max-h-[75vh] overflow-y-auto">
            <CausalChainList
              state={state}
              startRef={startRef}
              fallbackText={fallbackText}
              onSelectNpc={(id) => {
                onSelectNpc?.(id);
                onClose();
              }}
              onJumpDistrict={(d) => {
                onJumpDistrict?.(d);
                onClose();
              }}
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-sm"
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
