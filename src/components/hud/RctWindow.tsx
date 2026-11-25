import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';

type RctWindowTone = 'green' | 'amber' | 'red' | 'neutral';

const HEADER_TONE_CLASSES: Record<RctWindowTone, string> = {
  green: 'border-zinc-800 text-zinc-100',
  amber: 'border-zinc-800 text-zinc-100',
  red: 'border-rose-900/60 text-zinc-100',
  neutral: 'border-zinc-800 text-zinc-100',
};

const ICON_TONE_CLASSES: Record<RctWindowTone, string> = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-rose-400',
  neutral: 'text-zinc-300',
};

interface RctWindowProps {
  title: string;
  subtitle?: string;
  tone?: RctWindowTone;
  icon?: React.ReactNode;
  zIndex?: number;
  defaultOffset?: { x: number; y: number };
  onFocus?: () => void;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

export const RctWindow: React.FC<RctWindowProps> = ({
  title,
  subtitle,
  tone = 'green',
  icon,
  zIndex,
  defaultOffset,
  onFocus,
  onClose,
  className = '',
  children,
}) => {
  const [offset, setOffset] = useState(defaultOffset ?? { x: 0, y: 0 });
  const dragState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const onPointerDownTitle = (e: React.PointerEvent<HTMLDivElement>) => {
    onFocus?.();
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
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const minX = -Math.max(240, vw - 360);
    const maxX = Math.max(240, vw - 220);
    const maxY = Math.max(180, vh - 140);
    setOffset({
      x: Math.max(minX, Math.min(maxX, dragState.current.origX + dx)),
      y: Math.max(-40, Math.min(maxY, dragState.current.origY + dy)),
    });
  };

  const onPointerUpTitle = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current.active && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current.active = false;
  };

  return (
    <section
      onPointerDown={() => onFocus?.()}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        zIndex,
      }}
      className={`pointer-events-auto bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden text-zinc-100 ${className}`}
    >
      <div
        onPointerDown={onPointerDownTitle}
        onPointerMove={onPointerMoveTitle}
        onPointerUp={onPointerUpTitle}
        onPointerCancel={onPointerUpTitle}
        className={`flex items-center justify-between gap-3 px-5 py-3.5 bg-zinc-900/95 border-b cursor-grab active:cursor-grabbing select-none ${HEADER_TONE_CLASSES[tone]}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className={`shrink-0 ${ICON_TONE_CLASSES[tone]}`}>{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight truncate text-white">{title}</h2>
            {subtitle && (
              <p className="text-xs text-zinc-400 font-mono tabular-nums truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-zinc-900/95">{children}</div>
    </section>
  );
};
