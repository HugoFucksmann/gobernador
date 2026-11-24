import React from 'react';

export type ActiveTab = 'mapa' | 'palancas' | 'economia' | 'prensa' | 'bitacora';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenNewGame: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'mapa', label: 'Mapa y Comunidad' },
  { id: 'palancas', label: 'Palancas' },
  { id: 'economia', label: 'Economía' },
  { id: 'prensa', label: 'Prensa' },
  { id: 'bitacora', label: 'Bitácora' },
];

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onSelectTab, onOpenNewGame }) => {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
        <span className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          El Gobernador
        </span>

        <nav aria-label="Navegación principal" className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                  active
                    ? 'border-teal-700 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenNewGame}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            Nueva Partida
          </button>
        </div>
      </div>
    </header>
  );
};
