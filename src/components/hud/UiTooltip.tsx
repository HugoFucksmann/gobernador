import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface UiTooltipProps {
  text?: string | null;
  placement?: 'top' | 'bottom' | 'left';
  children: React.ReactNode;
  className?: string;
}

export const UiTooltip: React.FC<UiTooltipProps> = ({
  text,
  placement = 'bottom',
  children,
  className = '',
}) => {
  const [open, setOpen] = useState(false);

  if (!text) {
    return <>{children}</>;
  }

  const posClass =
    placement === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-2.5'
      : placement === 'left'
      ? 'right-full top-1/2 -translate-y-1/2 mr-2.5'
      : 'top-full left-1/2 -translate-x-1/2 mt-2.5';

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 ${posClass} w-max max-w-[260px] px-3 py-2 rounded-xl bg-zinc-950/95 border border-zinc-700/90 text-xs font-sans font-normal text-zinc-100 leading-relaxed shadow-2xl whitespace-normal text-left`}
        >
          {text}
        </span>
      )}
    </span>
  );
};

export const HintIcon: React.FC<{
  text: string;
  placement?: 'top' | 'bottom' | 'left';
}> = ({ text, placement = 'top' }) => (
  <UiTooltip text={text} placement={placement}>
    <span
      tabIndex={0}
      aria-label={text}
      className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-200 cursor-help focus:outline-none"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </span>
  </UiTooltip>
);
