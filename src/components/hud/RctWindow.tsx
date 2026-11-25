import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';

export type RctWindowTone = 'teal' | 'amber' | 'blue' | 'rose' | 'slate';

const TONE_CLASSES: Record<RctWindowTone, string> = {
  teal: 'bg-slate-800/95 border-teal-500/30 text-white',
  amber: 'bg-slate-800/95 border-amber-500/30 text-white',
  blue: 'bg-slate-800/95 border-sky-500/30 text-white',
  rose: 'bg-slate-800/95 border-rose-500/35 text-white',
  slate: 'bg-slate-800/95 border-slate-600/40 text-white',
};

const ICON_TONE_CLASSES: Record<RctWindowTone, string> = {
  teal: 'text-teal-400',
  amber: 'text-amber-400',
  blue: 'text-sky-400',
  rose: 'text-rose-400',
  slate: 'text-slate-300',
};

interface RctWindowProps {
  title: string;
  subtitle?: string;
  tone?: RctWindowTone;
  icon?: React.ReactNode;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

export const RctWindow: React.FC<RctWindowProps> = ({
  title,
  subtitle,
  tone = 'teal',
  icon,
  onClose,
  className = '',
  children,
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const onPointerDownTitle = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const onPointerMoveTitle = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({
      x: Math.max(-420, Math.min(420, dragState.current.origX + dx)),
      y: Math.max(-40, Math.min(320, dragState.current.origY + dy)),
    });
  };

  const onPointerUpTitle = () => {
    dragState.current.active = false;
  };

  return (
    <section
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className={`pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden text-slate-100 ${className}`}
    >
      <div
        onPointerDown={onPointerDownTitle}
        onPointerMove={onPointerMoveTitle}
        onPointerUp={onPointerUpTitle}
        className={`flex items-center justify-between gap-3 px-3.5 py-2 border-b cursor-grab active:cursor-grabbing select-none ${TONE_CLASSES[tone]}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className={`shrink-0 ${ICON_TONE_CLASSES[tone]}`}>{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-xs font-bold leading-tight truncate text-white">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar ventana"
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700/80 shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="bg-slate-900/95">{children}</div>
    </section>
  );
};
