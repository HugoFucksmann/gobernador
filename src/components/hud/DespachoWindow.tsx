import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileBarChart2,
  Flame,
  GitBranch,
  Newspaper,
} from 'lucide-react';
import {
  alertas_visibles,
  formatLecturaTexto,
  historial,
  indicadores_resumen,
  informe,
  interlocutor,
  notables,
} from '../../engine/lecturaV2';
import { getWorldZones } from '../../engine/simulation';
import {
  GameState,
  LecturaIndicadorId,
  SimEvent,
  ZoneId,
} from '../../types/game';
import { DespachoTab } from '../../types/ui';
import { RctWindow } from './RctWindow';
import { INDICATOR_LABELS, SparklineSvg, stateBadgeTone } from './TemaDrawer';

interface DespachoWindowProps {
  state: GameState;
  zIndex: number;
  initialTab?: DespachoTab;
  tabRequest?: { tab: DespachoTab; seq: number } | null;
  heatmapIndicatorId?: LecturaIndicadorId | null;
  onFocus: () => void;
  onClose: () => void;
  onOpenTema: (id: LecturaIndicadorId) => void;
  onToggleHeatmap: (id: LecturaIndicadorId) => void;
  onJumpZone: (z: ZoneId) => void;
  onSelectNpc: (npcId: string) => void;
  onFollowNpc: (npcId: string) => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

const EVENT_TYPE_LABELS: Partial<Record<SimEvent['tipo'], string>> = {
  nacimiento: 'Nacimiento',
  muerte: 'Fallecimiento',
  migracion_llegada: 'Inmigración',
  migracion_salida: 'Emigración',
  casa_construida: 'Vivienda construida',
  desalojo: 'Desalojo',
  firma_fundada: 'Firma fundada',
  firma_quiebra: 'Quiebra',
  via_fin: 'Vía habilitada',
  ruta_cortada: 'Ruta cortada',
  fenomeno_inicio: 'Fenómeno climático',
  noticia: 'Noticia',
  golpe: 'Ataque',
  capacitacion_fin: 'Capacitación',
};

export const DespachoWindow: React.FC<DespachoWindowProps> = ({
  state,
  zIndex,
  initialTab = 'resumen',
  tabRequest = null,
  heatmapIndicatorId = null,
  onFocus,
  onClose,
  onOpenTema,
  onToggleHeatmap,
  onJumpZone,
  onSelectNpc,
  onFollowNpc,
  onInspectCausal,
}) => {
  const [tab, setTab] = useState<DespachoTab>(tabRequest?.tab ?? initialTab);

  useEffect(() => {
    if (tabRequest?.tab) {
      setTab(tabRequest.tab);
    }
  }, [tabRequest]);
  const [histZone, setHistZone] = useState<ZoneId | 'todas'>('todas');
  const [histTipo, setHistTipo] = useState<SimEvent['tipo'] | 'todos'>('todos');
  const [soloNotables, setSoloNotables] = useState<boolean>(false);
  const [histPage, setHistPage] = useState<number>(0);
  const [reportIndex, setReportIndex] = useState<number>(0);
  const [notablesFiltro, setNotablesFiltro] = useState<'todos' | 'empresario' | 'medio'>('todos');

  const summaryIndicators = indicadores_resumen(state);
  const visibleAlerts = alertas_visibles(state);
  const latestReport = informe(state, reportIndex);
  const totalReports = state.lectura?.informes.length ?? 0;
  const zoneIds = getWorldZones(state);

  const histData = historial(
    state,
    {
      zona: histZone === 'todas' ? undefined : histZone,
      tipo: histTipo === 'todos' ? undefined : histTipo,
      soloNotables: soloNotables || undefined,
    },
    histPage,
    18
  );

  const notablesList = notables(
    state,
    notablesFiltro === 'todos' ? undefined : notablesFiltro
  );

  return (
    <div className="pointer-events-none fixed top-20 right-4 md:right-[395px]" style={{ zIndex }}>
      <RctWindow
        title="Despacho de lectura"
        subtitle={`Día ${state.reloj.dia} · Solo lectura`}
        tone="green"
        icon={<BookOpen className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[560px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="grid grid-cols-4 gap-1 bg-zinc-800/80 p-1.5 rounded-xl text-xs">
            {(
              [
                { id: 'resumen', label: 'Resumen' },
                { id: 'historial', label: 'Historial y porqués' },
                { id: 'informe', label: 'Informe' },
                { id: 'notables', label: `Clave (${state.lectura?.notables.length ?? 0})` },
              ] as Array<{ id: DespachoTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`py-2 px-1.5 rounded-lg font-semibold transition-colors truncate ${
                  tab === t.id ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {state.config.lecturaActiva === false && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200">
              La capa de lectura está desactivada en modo desarrollador.
            </div>
          )}

          {/* TAB 1: RESUMEN */}
          {tab === 'resumen' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                {summaryIndicators.map((ind) => {
                  const badge = stateBadgeTone(ind.estado);
                  const stroke =
                    ind.estado === 'mal'
                      ? '#fb7185'
                      : ind.estado === 'atencion'
                      ? '#fbbf24'
                      : '#10b981';
                  const heatOn = heatmapIndicatorId === ind.id;
                  return (
                    <div
                      key={ind.id}
                      className="bg-zinc-800/55 border border-zinc-700/70 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenTema(ind.id)}
                          className="font-semibold text-white hover:text-emerald-300 truncate text-left"
                        >
                          {INDICATOR_LABELS[ind.id]}
                        </button>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono tabular-nums">
                          <span className="text-base font-bold text-white">{ind.valor}</span>
                          <span className="text-zinc-400 ml-1.5 text-[11px]">
                            (ref {ind.referencia})
                          </span>
                        </div>
                        <SparklineSvg values={ind.serie} stroke={stroke} width={68} height={20} />
                      </div>

                      <div className="text-[11px] text-zinc-300 truncate">
                        {formatLecturaTexto(ind.texto)}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenTema(ind.id)}
                          className="text-[11px] font-semibold text-emerald-400 hover:underline"
                        >
                          Ver tema y causas
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleHeatmap(ind.id)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                            heatOn
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <Flame className="w-3 h-3" />
                          Mapa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {visibleAlerts.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Alertas activas ({visibleAlerts.length})
                  </div>
                  {visibleAlerts.map((al) => (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => onOpenTema(al.indicador)}
                      className="w-full text-left bg-amber-950/35 hover:bg-amber-950/55 border border-amber-500/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-zinc-100 font-medium">
                        {formatLecturaTexto(al.texto)}
                      </span>
                      <span className="font-mono text-zinc-400 shrink-0">
                        N{al.severidad} · D{al.dia}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {latestReport && (
                <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <FileBarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                      Último informe · Período {latestReport.periodo} (D{latestReport.dia})
                    </span>
                    <button
                      type="button"
                      onClick={() => setTab('informe')}
                      className="text-emerald-400 hover:underline font-semibold"
                    >
                      Abrir completo
                    </button>
                  </div>
                  <div className="space-y-1">
                    {latestReport.cambios.map((c) => (
                      <div key={c.indicador} className="flex items-center justify-between text-zinc-300">
                        <span>{INDICATOR_LABELS[c.indicador]}</span>
                        <span className="font-mono tabular-nums">
                          {c.antes} → <strong className="text-white">{c.despues}</strong> ({c.estadoDespues})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HISTORIAL Y PORQUÉS */}
          {tab === 'historial' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar historial por zona"
                  value={histZone}
                  onChange={(e) => {
                    setHistZone(e.target.value as ZoneId | 'todas');
                    setHistPage(0);
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-zinc-100"
                >
                  <option value="todas">Todas las zonas</option>
                  {zoneIds.map((z) => (
                    <option key={z} value={z}>
                      {state.zonas[z]?.nombre ?? z}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar historial por tipo"
                  value={histTipo}
                  onChange={(e) => {
                    setHistTipo(e.target.value as SimEvent['tipo'] | 'todos');
                    setHistPage(0);
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-zinc-100"
                >
                  <option value="todos">Todos los hechos</option>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200 ml-auto">
                  <input
                    type="checkbox"
                    checked={soloNotables}
                    onChange={(e) => {
                      setSoloNotables(e.target.checked);
                      setHistPage(0);
                    }}
                    className="rounded border-zinc-600"
                  />
                  <span>Solo notables</span>
                </label>
              </div>

              <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl max-h-[340px] overflow-y-auto">
                {histData.items.length === 0 ? (
                  <div className="py-6 text-center text-zinc-400">
                    Sin eventos para estos filtros.
                  </div>
                ) : (
                  histData.items.map((ev) => (
                    <div key={ev.id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {ev.notable && (
                            <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="font-semibold text-zinc-100 truncate">
                            {EVENT_TYPE_LABELS[ev.tipo] ?? ev.tipo}
                          </span>
                          <span className="text-zinc-400 truncate">
                            · {state.zonas[ev.zona]?.nombre ?? ev.zona}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          Día {ev.dia}
                          {'causa' in ev && ev.causa ? ` · causa: ${ev.causa}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onJumpZone(ev.zona)}
                          className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
                        >
                          Ir
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onInspectCausal(
                              `${EVENT_TYPE_LABELS[ev.tipo] ?? ev.tipo} (D${ev.dia})`,
                              ev.id
                            )
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                        >
                          <GitBranch className="w-3 h-3" />
                          ¿Por qué?
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span>Total: {histData.total}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={histPage <= 0}
                    onClick={() => setHistPage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono px-1">Pág. {histPage + 1}</span>
                  <button
                    type="button"
                    disabled={(histPage + 1) * 18 >= histData.total}
                    onClick={() => setHistPage((p) => p + 1)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INFORME DEL PERÍODO */}
          {tab === 'informe' && (
            <div className="space-y-4 text-xs">
              {!latestReport ? (
                <div className="py-8 text-center text-zinc-400 bg-zinc-800/40 rounded-xl">
                  El primer informe periódico se genera al cierre del período (cada 7 días).
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-zinc-800/60 rounded-xl p-3">
                    <div>
                      <div className="font-bold text-white text-sm">
                        Informe · Período {latestReport.periodo}
                      </div>
                      <div className="text-zinc-400">Cierre en día {latestReport.dia}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={reportIndex + 1 >= totalReports}
                        onClick={() => setReportIndex((i) => i + 1)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={reportIndex <= 0}
                        onClick={() => setReportIndex((i) => Math.max(0, i - 1))}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
                      >
                        Más reciente
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold text-zinc-300">3 cambios principales</div>
                    {latestReport.cambios.map((c) => {
                      const badge = stateBadgeTone(c.estadoDespues);
                      return (
                        <div
                          key={c.indicador}
                          className="bg-zinc-800/55 border border-zinc-700/70 rounded-xl p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenTema(c.indicador)}
                              className="font-semibold text-white hover:text-emerald-300"
                            >
                              {INDICATOR_LABELS[c.indicador]}
                            </button>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${badge.bg} ${badge.text}`}
                            >
                              {c.estadoAntes} → {c.estadoDespues}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-300">
                            <span className="font-mono">
                              {c.antes} → <strong className="text-white">{c.despues}</strong>
                            </span>
                            {c.entidades.length > 0 && (
                              <span className="text-zinc-400">
                                Zonas: {c.entidades.join(', ')}
                              </span>
                            )}
                          </div>
                          {c.causaPrincipal && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-zinc-400 truncate">
                                Causa: {c.causaPrincipal}
                              </span>
                              {c.eventoRaizId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectCausal(
                                      `Cambio en ${INDICATOR_LABELS[c.indicador]}`,
                                      c.eventoRaizId,
                                      c.causaPrincipal
                                    )
                                  }
                                  className="text-emerald-400 hover:underline font-semibold shrink-0"
                                >
                                  ¿Por qué?
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold text-zinc-300">
                      Hechos de personas clave ({latestReport.hechosNotables.length})
                    </div>
                    {latestReport.hechosNotables.length === 0 ? (
                      <div className="text-zinc-500 bg-zinc-800/40 rounded-xl p-3">
                        Sin hechos notables en este período.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                        {latestReport.hechosNotables.map((hn) => (
                          <div
                            key={hn.eventoId}
                            className="bg-zinc-800/50 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                          >
                            <span className="text-zinc-200 truncate">
                              {formatLecturaTexto(hn.texto)} · D{hn.dia}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {hn.npcId && (
                                <button
                                  type="button"
                                  onClick={() => onSelectNpc(hn.npcId!)}
                                  className="text-amber-300 hover:underline font-semibold"
                                >
                                  Persona
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectCausal('Hecho notable', hn.eventoId, hn.tipo)
                                }
                                className="text-emerald-400 hover:underline font-semibold"
                              >
                                ¿Por qué?
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: PERSONAS CLAVE */}
          {tab === 'notables' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-1.5 bg-zinc-800/70 p-1 rounded-xl">
                {(
                  [
                    { id: 'todos', label: 'Todos' },
                    { id: 'empresario', label: 'Empresarios' },
                    { id: 'medio', label: 'Medios' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setNotablesFiltro(f.id)}
                    className={`flex-1 py-1.5 rounded-lg font-semibold ${
                      notablesFiltro === f.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {notablesList.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 bg-zinc-800/40 rounded-xl">
                  Todavía no hay personas destacadas (se actualizan en cada cierre semanal).
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {notablesList.map((n) => {
                    const inter = interlocutor(state, n.npcId);
                    return (
                      <div
                        key={n.npcId}
                        className="bg-zinc-800/55 border border-zinc-700/70 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {n.tipo === 'empresario' ? (
                              <Briefcase className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <Newspaper className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-bold text-white truncate">{n.nombre}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-900 text-zinc-300 capitalize">
                              {n.tipo}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-amber-300 shrink-0">
                            Peso {Math.round(n.peso)}
                          </span>
                        </div>

                        <div className="text-zinc-300 flex items-center justify-between">
                          <span>{n.motivo}</span>
                          <span className="text-zinc-400">
                            {state.zonas[n.zona]?.nombre ?? n.zona} · desde D{n.diaIngreso}
                          </span>
                        </div>

                        {inter && (
                          <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                            <span>Intereses: {inter.intereses.join(', ')}</span>
                            <span className="font-mono">
                              Postura: {inter.posturaHaciaEstado > 0 ? '+' : ''}
                              {inter.posturaHaciaEstado}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectNpc(n.npcId);
                              onJumpZone(n.zona);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
                          >
                            Ver ficha
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onFollowNpc(n.npcId);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            <Crosshair className="w-3 h-3" />
                            Seguir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
