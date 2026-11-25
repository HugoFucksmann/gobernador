import React from 'react';
import {
  CloudRain,
  Eye,
  Filter,
  Maximize2,
  Newspaper,
  Skull,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DISTRICTS, PERIOD_DAYS, ROLE_CATALOG, SCENARIO_PRESETS } from '../../data/catalogs';
import { DistrictId, GameState } from '../../types/game';
import { MapFilter, MapLens } from '../../types/ui';

interface RctStatusBarProps {
  state: GameState;
  hoverInfo: string | null;
  mapLens: MapLens;
  mapFilter: MapFilter;
  onChangeLens: (lens: MapLens) => void;
  onChangeFilter: (filter: MapFilter) => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onZoom: (delta: number) => void;
  onOpenPress: () => void;
}

function getLensLegend(lens: MapLens): Array<{ color: string; label: string }> {
  if (lens === 'roles') {
    return [
      { color: ROLE_CATALOG.agricultor.color, label: 'Agro' },
      { color: ROLE_CATALOG.obrero.color, label: 'Obrero' },
      { color: ROLE_CATALOG.comerciante.color, label: 'Comercio' },
      { color: ROLE_CATALOG.medico.color, label: 'Salud' },
      { color: ROLE_CATALOG.policia.color, label: 'Policía' },
      { color: ROLE_CATALOG.desempleado.color, label: 'Sin emp.' },
    ];
  }
  if (lens === 'acciones') {
    return [
      { color: '#cbd5e1', label: 'Normal' },
      { color: '#a855f7', label: 'Foco' },
      { color: '#f59e0b', label: 'Espontánea' },
      { color: '#ef4444', label: 'Condición' },
    ];
  }
  if (lens === 'satisfaccion') {
    return [
      { color: '#10b981', label: 'Bien (≥65%)' },
      { color: '#f59e0b', label: 'Media' },
      { color: '#ef4444', label: 'Baja (<40%)' },
    ];
  }
  if (lens === 'hambre') {
    return [
      { color: '#14b8a6', label: 'Saciedad' },
      { color: '#f59e0b', label: 'Alerta (>45%)' },
      { color: '#ef4444', label: 'Crítica (>75%)' },
    ];
  }
  if (lens === 'lealtad') {
    return [
      { color: '#0ea5e9', label: 'Apoya (≥55%)' },
      { color: '#f59e0b', label: 'Indeciso' },
      { color: '#e11d48', label: 'En contra (<35%)' },
    ];
  }
  if (lens === 'hospital') {
    return [
      { color: '#10b981', label: 'Médico' },
      { color: '#0ea5e9', label: 'Internado' },
      { color: '#f59e0b', label: 'Salud <65%' },
      { color: '#ef4444', label: 'Sin cama' },
    ];
  }
  if (lens === 'amenaza') {
    return [
      { color: '#10b981', label: 'Baja (<20%)' },
      { color: '#f59e0b', label: 'Media' },
      { color: '#ef4444', label: 'Alta (≥50%)' },
    ];
  }
  return [
    { color: '#10b981', label: 'Fuerte (≥60%)' },
    { color: '#f59e0b', label: 'Media' },
    { color: '#ef4444', label: 'Baja (<35%)' },
  ];
}

export const RctStatusBar: React.FC<RctStatusBarProps> = ({
  state,
  hoverInfo,
  mapLens,
  mapFilter,
  onChangeLens,
  onChangeFilter,
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
  const legendItems = getLensLegend(mapLens);

  return (
    <>
      {/* Compact floating map color legend */}
      <div className="pointer-events-none fixed bottom-9 left-3 z-20 hidden sm:flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-sm border border-slate-700/70 rounded px-2.5 py-1 text-[10px] text-slate-300 shadow">
        {legendItems.map((item) => (
          <span key={item.label} className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-xs shrink-0" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      <footer className="pointer-events-auto fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/80 px-3 py-1 flex items-center justify-between gap-3 text-[11px] text-slate-200">
        {/* Left: Camera, District Jump, Lens, Filter & Hover Ticker */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-0.5 bg-slate-800 border border-slate-700 rounded p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onZoom(0.28)}
              title="Acercar cámara"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-sm"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onZoom(-0.28)}
              title="Alejar cámara"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-sm"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onZoom(0)}
              title="Centrar cámara"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-sm"
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
            className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none cursor-pointer shrink-0"
          >
            <option value="" disabled>
              Ir a zona…
            </option>
            <option value="all">Todo el valle</option>
            {DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>

          <div className="hidden sm:flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 shrink-0">
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
              <option value="acciones" className="bg-slate-900">
                Acciones activas
              </option>
              <option value="satisfaccion" className="bg-slate-900">
                Humor social
              </option>
              <option value="hambre" className="bg-slate-900">
                Hambre
              </option>
              <option value="lealtad" className="bg-slate-900">
                Apoyo electoral
              </option>
              <option value="defensa" className="bg-slate-900">
                Defensa zona
              </option>
              <option value="orden" className="bg-slate-900">
                Orden zona
              </option>
              <option value="integridad" className="bg-slate-900">
                Integridad zona
              </option>
              <option value="amenaza" className="bg-slate-900">
                Amenaza zona
              </option>
              <option value="hospital" className="bg-slate-900">
                Hospital y salud
              </option>
            </select>
          </div>

          <div className="hidden md:flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 shrink-0">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Filtrar vecinos"
              value={mapFilter}
              onChange={(e) => onChangeFilter(e.target.value as MapFilter)}
              className="bg-transparent text-[11px] text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todos" className="bg-slate-900">
                Todos
              </option>
              <option value="acciones" className="bg-slate-900">
                En acción
              </option>
              <option value="descontentos" className="bg-slate-900">
                Descontentos
              </option>
              <option value="hambre" className="bg-slate-900">
                Hambre crítica
              </option>
            </select>
          </div>

          <span className="hidden xl:inline truncate text-slate-400">
            {hoverInfo || 'Arrastrá o usá WASD para mover · Rueda para zoom · Clic en edificios o vecinos'}
          </span>
        </div>

        {/* Right: Newspaper Ticker + Weather + Day */}
        <div className="flex items-center gap-2.5 shrink-0">
          {latestHeadline && (
            <button
              type="button"
              onClick={onOpenPress}
              title="Abrir Gaceta"
              className="hidden md:flex items-center gap-1.5 max-w-[300px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition-colors"
            >
              <Newspaper className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate text-slate-200 font-medium">
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
                <span className="text-rose-300 font-medium">
                  {activeFen.nombre}
                  {activeFen.origen ? ` (${activeFen.origen})` : ''}
                </span>
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

          <div className="font-mono tabular-nums text-white font-semibold bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
            Día {state.reloj.dia}/{plazo} · {state.reloj.diasEnPeriodo}/{PERIOD_DAYS}d
          </div>
        </div>
      </footer>
    </>
  );
};
