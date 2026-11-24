import React from 'react';
import {
  CloudRain,
  Eye,
  Maximize2,
  Newspaper,
  Skull,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DISTRICTS, FISCAL_PERIOD_DAYS, SCENARIO_PRESETS } from '../../data/catalogs';
import { DistrictId, GameState } from '../../types/game';
import { MapLens } from '../../types/ui';

interface RctStatusBarProps {
  state: GameState;
  hoverInfo: string | null;
  mapLens: MapLens;
  onChangeLens: (lens: MapLens) => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onZoom: (delta: number) => void;
  onOpenPress: () => void;
}

export const RctStatusBar: React.FC<RctStatusBarProps> = ({
  state,
  hoverInfo,
  mapLens,
  onChangeLens,
  onJumpDistrict,
  onZoom,
  onOpenPress,
}) => {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const plazo = preset.victoria.plazoDia ?? 365;
  const latestHeadline = state.noticias[0];
  const activeFen = state.clima.fenomenos.find(
    (f) => state.reloj.dia >= f.inicioDia && state.reloj.dia < f.inicioDia + f.duracionDias
  );

  return (
    <footer className="pointer-events-auto fixed bottom-0 inset-x-0 z-30 bg-slate-800/95 backdrop-blur-sm border-t border-slate-600/60 px-2.5 py-1 flex items-center justify-between gap-3 text-[11px] text-slate-200">
      {/* Left: Camera & Lens Quick Controls + Hover Ticker */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-700 rounded-sm p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onZoom(0.28)}
            title="Acercar cámara"
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-sm"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onZoom(-0.28)}
            title="Alejar cámara"
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-sm"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onZoom(0)}
            title="Centrar cámara"
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-sm"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        <select
          aria-label="Ir al distrito"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onJumpDistrict(e.target.value as DistrictId | 'all');
              e.target.value = '';
            }
          }}
          className="bg-slate-900 border border-slate-700 rounded-sm px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none cursor-pointer shrink-0"
        >
          <option value="" disabled>
            Ir a zona...
          </option>
          <option value="all">Todo el valle</option>
          {DISTRICTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>

        <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-sm px-1.5 py-0.5 shrink-0">
          <Eye className="w-3 h-3 text-teal-400" />
          <select
            aria-label="Lente visual"
            value={mapLens}
            onChange={(e) => onChangeLens(e.target.value as MapLens)}
            className="bg-transparent text-[11px] text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="roles" className="bg-slate-900">
              Profesiones
            </option>
            <option value="satisfaccion" className="bg-slate-900">
              Humor social
            </option>
            <option value="hambre" className="bg-slate-900">
              Hambre
            </option>
            <option value="lealtad" className="bg-slate-900">
              Apoyo
            </option>
          </select>
        </div>

        <span className="hidden lg:inline truncate text-slate-300">
          {hoverInfo || 'Arrastrá o usá WASD para recorrer el valle · Rueda para zoom · Clic en edificios o vecinos'}
        </span>
      </div>

      {/* Right: Newspaper Ticker + Date & Weather */}
      <div className="flex items-center gap-3 shrink-0">
        {latestHeadline && (
          <button
            type="button"
            onClick={onOpenPress}
            title="Leer en Gaceta"
            className="hidden md:flex items-center gap-1.5 max-w-[340px] px-2 py-0.5 rounded-sm bg-slate-900/90 hover:bg-slate-700 border border-slate-700 text-left transition-colors"
          >
            <Newspaper className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate text-slate-100 font-medium">
              {latestHeadline.medioNombre}: {latestHeadline.titulo}
            </span>
          </button>
        )}

        <div className="hidden sm:flex items-center gap-1 text-slate-300">
          {activeFen ? (
            <>
              {activeFen.tipo === 'plaga_zombie' ? (
                <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              ) : (
                <CloudRain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="text-rose-300 font-medium">{activeFen.nombre}</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Estable</span>
            </>
          )}
          {state.gobierno.finanzas.impago && (
            <span className="text-rose-400 font-semibold ml-1">· Impago</span>
          )}
        </div>

        <div className="font-mono tabular-nums text-white font-semibold bg-slate-900 border border-slate-700 rounded-sm px-2 py-0.5">
          Día {state.reloj.dia}/{plazo} · {state.reloj.diasEnPeriodoFiscal}/{FISCAL_PERIOD_DAYS}d
        </div>
      </div>
    </footer>
  );
};
