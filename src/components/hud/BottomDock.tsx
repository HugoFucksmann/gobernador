import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Hammer,
  Layers,
  Maximize2,
  MoreHorizontal,
  Newspaper,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ROLE_CATALOG } from '../../data/catalogs';
import { GameState, ZoneId } from '../../types/game';
import { MapFilter, MapLens, WindowId } from '../../types/ui';
import { UiTooltip } from './UiTooltip';

interface BottomDockProps {
  state: GameState;
  sideBuildOpen: boolean;
  openWindows: WindowId[];
  mapLens: MapLens;
  mapFilter: MapFilter;
  devMode: boolean;
  hasConditionAlert?: boolean;
  onToggleBuild: () => void;
  onToggleWindow: (win: WindowId) => void;
  onChangeLens: (lens: MapLens) => void;
  onChangeFilter: (filter: MapFilter) => void;
  onJumpZone: (z: ZoneId | 'all') => void;
  onZoom: (delta: number) => void;
  onOpenNewGame: () => void;
  onToggleDevMode: () => void;
}

const LENS_OPTIONS: Array<{ id: MapLens; label: string }> = [
  { id: 'ninguna', label: 'Normal' },
  { id: 'roles', label: 'Oficios' },
  { id: 'acciones', label: 'Acciones' },
  { id: 'vivienda', label: 'Vivienda' },
  { id: 'satisfaccion', label: 'Ánimo' },
  { id: 'hambre', label: 'Hambre' },
  { id: 'lealtad', label: 'Apoyo' },
  { id: 'defensa', label: 'Defensa' },
  { id: 'orden', label: 'Orden' },
  { id: 'integridad', label: 'Integridad' },
  { id: 'amenaza', label: 'Amenaza' },
  { id: 'hospital', label: 'Salud' },
];

const FILTER_OPTIONS: Array<{ id: MapFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'acciones', label: 'En acción' },
  { id: 'descontentos', label: 'Descontentos' },
  { id: 'hambre', label: 'Hambre' },
  { id: 'calle', label: 'En calle' },
];

function getLensLegend(lens: MapLens): Array<{ color: string; label: string }> {
  if (lens === 'ninguna') return [];
  if (lens === 'roles') {
    return [
      { color: ROLE_CATALOG.agricultor.color, label: 'Agro' },
      { color: ROLE_CATALOG.obrero.color, label: 'Obrero' },
      { color: ROLE_CATALOG.comerciante.color, label: 'Comercio' },
      { color: ROLE_CATALOG.constructor.color, label: 'Obra' },
      { color: ROLE_CATALOG.medico.color, label: 'Salud' },
      { color: ROLE_CATALOG.policia.color, label: 'Policía' },
      { color: ROLE_CATALOG.desempleado.color, label: 'Sin emp.' },
    ];
  }
  if (lens === 'vivienda') {
    return [
      { color: '#10b981', label: 'Propia' },
      { color: '#38bdf8', label: 'Alquiler' },
      { color: '#f59e0b', label: 'Hacinada / mora' },
      { color: '#ef4444', label: 'En calle' },
    ];
  }
  if (lens === 'acciones') {
    return [
      { color: '#d4d4d8', label: 'Normal' },
      { color: '#10b981', label: 'Foco' },
      { color: '#f59e0b', label: 'Espontánea' },
      { color: '#f43f5e', label: 'Condición' },
    ];
  }
  if (lens === 'satisfaccion' || lens === 'lealtad') {
    return [
      { color: '#10b981', label: 'Alto' },
      { color: '#f59e0b', label: 'Medio' },
      { color: '#f43f5e', label: 'Bajo' },
    ];
  }
  if (lens === 'hambre' || lens === 'amenaza') {
    return [
      { color: '#10b981', label: 'Bajo' },
      { color: '#f59e0b', label: 'Alerta' },
      { color: '#f43f5e', label: 'Crítico' },
    ];
  }
  if (lens === 'hospital') {
    return [
      { color: '#10b981', label: 'Atendido' },
      { color: '#f59e0b', label: 'En riesgo' },
      { color: '#f43f5e', label: 'Sin cama' },
    ];
  }
  return [
    { color: '#10b981', label: 'Fuerte' },
    { color: '#f59e0b', label: 'Media' },
    { color: '#f43f5e', label: 'Baja' },
  ];
}

export const BottomDock: React.FC<BottomDockProps> = ({
  state,
  sideBuildOpen,
  openWindows,
  mapLens,
  mapFilter,
  devMode,
  hasConditionAlert,
  onToggleBuild,
  onToggleWindow,
  onChangeLens,
  onChangeFilter,
  onJumpZone,
  onZoom,
  onOpenNewGame,
  onToggleDevMode,
}) => {
  const [popover, setPopover] = useState<'capas' | 'mas' | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const legendItems = getLensLegend(mapLens);
  const allZones = Object.values(state.zonas);
  const availableZones =
    state.config.nivelMundo === 'M0' ? allZones.filter((z) => z.id === 'centro') : allZones;

  const palancasActive = openWindows.includes('palancas');
  const capasActive = popover === 'capas' || mapLens !== 'ninguna' || mapFilter !== 'todos';
  const moreBadgeCount = state.demandasActivas.length;
  const moreWindowActive =
    openWindows.includes('economia') ||
    openWindows.includes('ciudad') ||
    openWindows.includes('gaceta');

  return (
    <div
      ref={dockRef}
      className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3"
    >
      {/* Popover: Capas & Cámara */}
      {popover === 'capas' && (
        <div className="pointer-events-auto w-[360px] max-w-[calc(100vw-24px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl p-4 shadow-2xl space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Capas del mapa</span>
              {mapLens !== 'ninguna' && (
                <button
                  type="button"
                  onClick={() => onChangeLens('ninguna')}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {LENS_OPTIONS.map((opt) => {
                const active = mapLens === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeLens(opt.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <span className="text-xs font-semibold text-zinc-400 block">Mostrar vecinos</span>
            <div className="grid grid-cols-3 gap-1.5">
              {FILTER_OPTIONS.map((f) => {
                const active = mapFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChangeFilter(f.id)}
                    className={`px-2 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-400">Cámara y zonas ({availableZones.length})</span>
              <div className="flex items-center gap-1">
                <UiTooltip text="Alejar" placement="top">
                  <button
                    type="button"
                    onClick={() => onZoom(-0.28)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                </UiTooltip>
                <UiTooltip text="Centrar" placement="top">
                  <button
                    type="button"
                    onClick={() => onZoom(0)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </UiTooltip>
                <UiTooltip text="Acercar" placement="top">
                  <button
                    type="button"
                    onClick={() => onZoom(0.28)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </UiTooltip>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
              <button
                type="button"
                onClick={() => onJumpZone('all')}
                className="px-2.5 py-1 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 whitespace-nowrap"
              >
                Todo el valle
              </button>
              {availableZones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => onJumpZone(z.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    z.estado === 'no_urbanizada'
                      ? 'bg-zinc-900 border border-dashed border-zinc-600 text-zinc-400 hover:text-zinc-200'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                >
                  {z.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Popover: Más */}
      {popover === 'mas' && (
        <div className="pointer-events-auto w-[260px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl p-3 shadow-2xl space-y-1.5">
          <button
            type="button"
            onClick={() => {
              onToggleWindow('economia');
              setPopover(null);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              openWindows.includes('economia')
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Economía y Firmas
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleWindow('gaceta');
              setPopover(null);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              openWindows.includes('gaceta')
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Newspaper className="w-4 h-4 text-zinc-300" />
              Prensa
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleWindow('ciudad');
              setPopover(null);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              openWindows.includes('ciudad')
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              Ciudad y Vías
            </span>
            {(moreBadgeCount > 0 || hasConditionAlert) && (
              <span
                className={`font-mono text-xs font-bold ${
                  hasConditionAlert ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                {moreBadgeCount > 0 ? moreBadgeCount : '!'}
              </span>
            )}
          </button>

          <div className="my-1.5 border-t border-zinc-800" />

          <button
            type="button"
            onClick={() => {
              onOpenNewGame();
              setPopover(null);
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Settings2 className="w-4 h-4 text-zinc-400" />
            Partida
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleDevMode();
              setPopover(null);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              devMode ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Wrench className="w-4 h-4" />
              Modo dev
            </span>
            {devMode && <span className="text-xs font-mono">ON</span>}
          </button>
        </div>
      )}

      {/* Active Lens Legend (only when a layer is active) */}
      {legendItems.length > 0 && popover !== 'capas' && (
        <div className="pointer-events-none flex flex-wrap items-center justify-center gap-3 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/70 rounded-xl px-3.5 py-1.5 text-xs text-zinc-200 shadow-lg">
          {legendItems.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Main Centered 4-Button Game Dock */}
      <nav
        aria-label="Accesos principales"
        className="pointer-events-auto flex items-center gap-2 bg-zinc-900/92 backdrop-blur-md border border-zinc-700/80 rounded-2xl p-2 shadow-2xl"
      >
        <UiTooltip text="Parcelas, obras públicas y vías" placement="top">
          <button
            type="button"
            onClick={() => {
              setPopover(null);
              onToggleBuild();
            }}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              sideBuildOpen
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <Hammer className="w-4 h-4 shrink-0" />
            <span>Construir</span>
          </button>
        </UiTooltip>

        <UiTooltip text="Impuestos, salarios, ayuda y alimento" placement="top">
          <button
            type="button"
            onClick={() => {
              setPopover(null);
              onToggleWindow('palancas');
            }}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              palancasActive
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span>Palancas</span>
          </button>
        </UiTooltip>

        <UiTooltip text="Capas del mapa, filtros y zonas" placement="top">
          <button
            type="button"
            onClick={() => setPopover((p) => (p === 'capas' ? null : 'capas'))}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              capasActive
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Capas</span>
          </button>
        </UiTooltip>

        <UiTooltip text="Economía, Prensa, Ciudad y Partida" placement="top">
          <button
            type="button"
            onClick={() => setPopover((p) => (p === 'mas' ? null : 'mas'))}
            className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              popover === 'mas' || moreWindowActive
                ? 'bg-emerald-600 text-white shadow-md'
                : hasConditionAlert || moreBadgeCount > 0
                ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" />
            <span>Más</span>
            {(moreBadgeCount > 0 || hasConditionAlert) && (
              <span
                className={`font-mono text-xs font-bold ${
                  hasConditionAlert ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                {moreBadgeCount > 0 ? moreBadgeCount : '!'}
              </span>
            )}
          </button>
        </UiTooltip>
      </nav>
    </div>
  );
};
