import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';

export type RctWindowTone = 'teal' | 'amber' | 'blue' | 'rose' | 'slate';

const TONE_CLASSES: Record<RctWindowTone, string> = {
  teal: 'bg-teal-800 border-teal-600/50 text-white',
  amber: 'bg-amber-800 border-amber-500/50 text-white',
  blue: 'bg-sky-800 border-sky-500/50 text-white',
  rose: 'bg-rose-900 border-rose-500/50 text-white',
  slate: 'bg-slate-700 border-slate-500/50 text-white',
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
      x: Math.max(-500, Math.min(500, dragState.current.origX + dx)),
      y: Math.max(-220, Math.min(340, dragState.current.origY + dy)),
    });
  };

  const onPointerUpTitle = () => {
    dragState.current.active = false;
  };

  return (
    <section
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className={`pointer-events-auto bg-slate-800/95 backdrop-blur-sm border-t border-l border-slate-500/50 border-b-2 border-r-2 border-slate-950 rounded shadow-2xl overflow-hidden text-slate-100 ${className}`}
    >
      {/* Classic RCT Draggable Title Bar */}
      <div
        onPointerDown={onPointerDownTitle}
        onPointerMove={onPointerMoveTitle}
        onPointerUp={onPointerUpTitle}
        className={`flex items-center justify-between gap-3 px-2.5 py-1.5 border-b border-slate-950 cursor-grab active:cursor-grabbing select-none ${TONE_CLASSES[tone]}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 opacity-90">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-xs font-bold leading-tight truncate">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-white/80 font-mono tabular-nums truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar ventana"
          className="w-5 h-5 flex items-center justify-center rounded-sm bg-slate-900/50 hover:bg-rose-700 border border-white/25 text-white shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Window Content */}
      <div className="bg-slate-900/95">{children}</div>
    </section>
  );
};
