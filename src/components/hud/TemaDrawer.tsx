import React, { useState } from 'react';
import { Flame, GitBranch, MapPin, TrendingDown, TrendingUp, Minus, X } from 'lucide-react';
import {
  alertas,
  formatLecturaTexto,
  indicador,
  serie,
} from '../../engine/lecturaV2';
import { getWorldZones } from '../../engine/simulation';
import {
  GameState,
  LecturaEstado,
  LecturaIndicadorId,
  ZoneId,
} from '../../types/game';

interface TemaDrawerProps {
  state: GameState;
  indicatorId: LecturaIndicadorId;
  heatmapActive: boolean;
  onToggleHeatmap: (id: LecturaIndicadorId) => void;
  onJumpZone: (z: ZoneId) => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
  onClose: () => void;
}

export const INDICATOR_LABELS: Record<LecturaIndicadorId, string> = {
  poblacion: 'Población',
  vivienda: 'Vivienda (calle %)',
  comida: 'Comida (días)',
  empleo: 'Desempleo (%)',
  estado: 'Estado (reserva d.)',
  animo: 'Ánimo (%)',
  orden: 'Orden y seguridad',
};

export function stateBadgeTone(estado: LecturaEstado): {
  text: string;
  bg: string;
  label: string;
} {
  if (estado === 'mal') {
    return {
      text: 'text-rose-300',
      bg: 'bg-rose-950/60 border-rose-500/40',
      label: 'Mal',
    };
  }
  if (estado === 'atencion') {
    return {
      text: 'text-amber-300',
      bg: 'bg-amber-950/60 border-amber-500/40',
      label: 'Atención',
    };
  }
  return {
    text: 'text-emerald-300',
    bg: 'bg-emerald-950/60 border-emerald-500/40',
    label: 'Bien',
  };
}

export const SparklineSvg: React.FC<{
  values: number[];
  stroke?: string;
  width?: number;
  height?: number;
}> = ({ values, stroke = '#10b981', width = 60, height = 18 }) => {
  const pts = values.slice(-21);
  if (pts.length < 2) {
    return (
      <svg width={width} height={height} className="shrink-0 opacity-50" aria-hidden="true">
        <line x1="2" y1={height / 2} x2={width - 2} y2={height / 2} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = Math.max(1e-6, max - min);
  const coords = pts.map((v, idx) => {
    const x = 2 + (idx / Math.max(1, pts.length - 1)) * (width - 4);
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
    </svg>
  );
};

export const TemaDrawer: React.FC<TemaDrawerProps> = ({
  state,
  indicatorId,
  heatmapActive,
  onToggleHeatmap,
  onJumpZone,
  onInspectCausal,
  onClose,
}) => {
  const [resolucion, setResolucion] = useState<'dia' | 'periodo' | 'anio'>('dia');
  const [zonaFiltro, setZonaFiltro] = useState<ZoneId | 'ciudad'>('ciudad');

  const ind = indicador(state, indicatorId);
  if (!ind) return null;

  const badge = stateBadgeTone(ind.estado);
  const zoneIds = getWorldZones(state);
  const seriesData = serie(
    state,
    indicatorId,
    zonaFiltro === 'ciudad' ? undefined : zonaFiltro,
    undefined,
    undefined,
    resolucion
  );
  const indAlerts = alertas(state, { soloActivas: true, indicador: indicatorId });

  const strokeColor =
    ind.estado === 'mal' ? '#fb7185' : ind.estado === 'atencion' ? '#fbbf24' : '#10b981';

  return (
    <div className="pointer-events-auto fixed top-24 left-4 z-35 w-[430px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-180px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">
              {INDICATOR_LABELS[indicatorId]}
            </h3>
            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-lg border ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-zinc-400 truncate mt-0.5">{formatLecturaTexto(ind.texto)}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar tema"
          className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto space-y-4 text-xs">
        {/* Context metrics & Heatmap toggle */}
        <div className="bg-zinc-800/60 rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 font-mono tabular-nums">
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Actual</span>
              <span className="text-base font-bold text-white">{ind.valor}</span>
            </div>
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Ref. (21d)</span>
              <span className="text-sm font-semibold text-zinc-300">{ind.referencia}</span>
            </div>
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Tendencia</span>
              <span className="flex items-center gap-1 text-sm font-semibold text-zinc-200">
                {ind.tendencia.dir > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : ind.tendencia.dir < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-zinc-400" />
                )}
                {Math.round(ind.tendencia.magnitud * 100)}%
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleHeatmap(indicatorId)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold border transition-colors shrink-0 ${
              heatmapActive
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-zinc-900/80 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Mapa calor
          </button>
        </div>

        {/* Series Chart */}
        <div className="bg-zinc-800/45 border border-zinc-800 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-zinc-900/70 p-0.5 rounded-lg">
              {(
                [
                  { id: 'dia', label: 'Días' },
                  { id: 'periodo', label: 'Períodos' },
                  { id: 'anio', label: 'Años' },
                ] as const
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setResolucion(r.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
                    resolucion === r.id ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {resolucion === 'dia' && (
              <select
                aria-label="Zona de la serie"
                value={zonaFiltro}
                onChange={(e) => setZonaFiltro(e.target.value as ZoneId | 'ciudad')}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-200"
              >
                <option value="ciudad">Toda la ciudad</option>
                {zoneIds.map((z) => (
                  <option key={z} value={z}>
                    {state.zonas[z]?.nombre ?? z}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-center py-1">
            <SparklineSvg values={seriesData} stroke={strokeColor} width={370} height={74} />
          </div>

          {seriesData.length > 0 && (
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>Mín: {Math.min(...seriesData).toFixed(1)}</span>
              <span>{seriesData.length} muestras</span>
              <span>Máx: {Math.max(...seriesData).toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Causes Top 3 */}
        <div className="space-y-2">
          <div className="font-semibold text-zinc-300">Causas principales</div>
          {ind.causasTop.length === 0 ? (
            <div className="text-zinc-500 bg-zinc-800/35 rounded-xl p-3">
              Sin causas recientes registradas en esta ventana.
            </div>
          ) : (
            <div className="space-y-1.5">
              {ind.causasTop.map((c, idx) => (
                <div
                  key={`${c.causa}-${idx}`}
                  className="bg-zinc-800/55 rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-100 truncate">{c.causa}</span>
                      <span className="font-mono text-zinc-400 shrink-0">
                        {Math.round(c.peso * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-900 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, Math.round(c.peso * 100))}%` }}
                      />
                    </div>
                  </div>
                  {c.eventoRaizId && (
                    <button
                      type="button"
                      onClick={() =>
                        onInspectCausal(
                          `Causa en ${INDICATOR_LABELS[indicatorId]}`,
                          c.eventoRaizId,
                          c.causa
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shrink-0"
                    >
                      <GitBranch className="w-3 h-3" />
                      ¿Por qué?
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zone breakdown */}
        <div className="space-y-2">
          <div className="font-semibold text-zinc-300">Por zona</div>
          <div className="grid grid-cols-3 gap-1.5">
            {zoneIds.map((z) => {
              const arr = ind.seriesPorZona[z] ?? [];
              const zVal = arr.length > 0 ? arr[arr.length - 1] : ind.valor;
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => onJumpZone(z)}
                  className="bg-zinc-800/55 hover:bg-zinc-800 rounded-xl px-2.5 py-2 text-left transition-colors"
                >
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                    <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{state.zonas[z]?.nombre ?? z}</span>
                  </div>
                  <div className="font-mono font-bold text-white mt-0.5">{zVal}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active alerts for this indicator */}
        {indAlerts.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-semibold text-amber-300">Alertas de este tema</div>
            {indAlerts.map((al) => (
              <div
                key={al.id}
                className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-2.5 flex items-center justify-between gap-2"
              >
                <span className="text-zinc-100">{formatLecturaTexto(al.texto)}</span>
                <span className="font-mono text-zinc-400 shrink-0">D{al.dia}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
