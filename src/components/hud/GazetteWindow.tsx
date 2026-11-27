import React, { useState } from 'react';
import { Compass, GitBranch, Newspaper, SlidersHorizontal } from 'lucide-react';
import { isObserverMode } from '../../engine/policies';
import { GameState, ZoneId } from '../../types/game';
import { focusSimEventCamera } from '../../utils/eventFocus';
import { RctWindow } from './RctWindow';
import { UiTooltip } from './UiTooltip';

interface GazetteWindowProps {
  state: GameState;
  aiBusy: boolean;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onTriggerPress: () => void;
  onOpenPalancas: () => void;
  onSelectMedio?: (medioId: string) => void;
  onJumpZone?: (zone: ZoneId | 'all') => void;
  onSelectNpc?: (npcId: string) => void;
  onFollowNpc?: (npcId: string) => void;
  onSelectParcela?: (parcelaId: string) => void;
  onSelectZona?: (zona: ZoneId) => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

type GazetteTopicFilter =
  | 'todas'
  | 'alimento'
  | 'economia'
  | 'orden'
  | 'vivienda'
  | 'clima'
  | 'presiones'
  | 'vecinos';

const GAZETTE_TOPIC_FILTERS: Array<{ id: GazetteTopicFilter; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'alimento', label: 'Alimento' },
  { id: 'economia', label: 'Economía' },
  { id: 'orden', label: 'Orden' },
  { id: 'vivienda', label: 'Vivienda' },
  { id: 'clima', label: 'Clima' },
  { id: 'presiones', label: 'Presiones' },
  { id: 'vecinos', label: 'Vecinos' },
];

function matchesGazetteTopic(tema: string, filter: GazetteTopicFilter): boolean {
  if (filter === 'todas') return true;
  if (filter === 'alimento') return tema === 'hambre' || tema === 'precio';
  if (filter === 'economia') return tema === 'empresas' || tema === 'firmas' || tema === 'impago';
  if (filter === 'orden') return tema === 'conflicto' || tema === 'ataque' || tema === 'salud';
  if (filter === 'vivienda') return tema === 'vivienda' || tema === 'demografia' || tema === 'familia';
  if (filter === 'clima') return tema === 'clima' || tema === 'aviso';
  if (filter === 'presiones') {
    return tema === 'presiones' || tema === 'gobierno' || tema === 'obras' || tema === 'objetivo';
  }
  return tema === 'vecinos';
}

export const GazetteWindow: React.FC<GazetteWindowProps> = ({
  state,
  aiBusy,
  zIndex,
  onFocus,
  onClose,
  onTriggerPress,
  onOpenPalancas,
  onSelectMedio,
  onJumpZone,
  onSelectNpc,
  onFollowNpc,
  onSelectParcela,
  onSelectZona,
  onInspectCausal,
}) => {
  const [pressView, setPressView] = useState<'edicion' | 'medios'>('edicion');
  const [topicFilter, setTopicFilter] = useState<GazetteTopicFilter>('todas');
  const isG0 = isObserverMode(state.config);
  const filteredArticles = state.noticias
    .filter((a) => matchesGazetteTopic(a.tema, topicFilter))
    .slice(0, 30);

  return (
    <div className="pointer-events-none fixed top-20 left-4 md:left-[380px]" style={{ zIndex }}>
      <RctWindow
        title="Gaceta"
        subtitle={`${state.noticias.length} notas · ${state.medios.filter((m) => m.activa !== false).length}/${state.medios.length} medio(s)`}
        tone="neutral"
        icon={<Newspaper className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[460px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setPressView('edicion')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  pressView === 'edicion' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Edición
              </button>
              <button
                type="button"
                onClick={() => setPressView('medios')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  pressView === 'medios' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Medios ({state.medios.length})
              </button>
            </div>

            {!isG0 && (
              <button
                type="button"
                onClick={onTriggerPress}
                disabled={aiBusy || state.resultado.estado !== 'jugando'}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl disabled:opacity-45 shrink-0 transition-colors whitespace-nowrap"
              >
                <Newspaper className="w-3.5 h-3.5" />
                Publicar
              </button>
            )}
          </div>

          {pressView === 'edicion' ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1 bg-zinc-800/70 p-1.5 rounded-xl text-[11px]">
                {GAZETTE_TOPIC_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTopicFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                      topicFilter === f.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="bg-[#f6f4ef] text-zinc-900 rounded-xl divide-y divide-zinc-300 max-h-[395px] overflow-y-auto">
                {state.noticias.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-600">
                    Sin noticias publicadas (sin medios activos).
                  </div>
                ) : filteredArticles.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-600">
                    Sin noticias en este filtro temático.
                  </div>
                ) : (
                  filteredArticles.map((article) => (
                    <article key={article.id} className="p-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-zinc-600">
                        <span className="font-semibold text-zinc-900">
                          {article.medioNombre} · D{article.dia}
                        </span>
                        <span className="font-mono text-zinc-600 tabular-nums">
                          {article.autorNombre} · {article.tema}
                          {article.origen?.includes('rareza') ? ' (rareza)' : ''} · {article.tono} · {Math.round(article.alcance)}%
                          {article.zonaOrigen ? ` · ${article.zonaOrigen}` : ''}
                        </span>
                      </div>
                      <h3 className="font-display text-base font-bold text-zinc-900 leading-snug">
                        {article.titulo}
                      </h3>
                      <p className="text-sm text-zinc-700 leading-relaxed">{article.texto}</p>
                      <div className="flex items-center justify-end gap-3 pt-1">
                        {(() => {
                          const simEv = article.causa
                            ? state.eventos.find((ev) => ev.id === article.causa)
                            : undefined;
                          const targetZone = article.zonaOrigen ?? article.zona ?? simEv?.zona;
                          if (!simEv && !targetZone) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (simEv) {
                                  focusSimEventCamera(simEv, state, {
                                    onFollowNpc,
                                    onSelectNpc,
                                    onSelectParcela,
                                    onSelectZona,
                                    onJumpZone,
                                  });
                                } else if (targetZone) {
                                  onSelectZona?.(targetZone);
                                  onJumpZone?.(targetZone);
                                }
                              }}
                              className="flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-950 hover:underline"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              {simEv ? 'Ver foco' : `Ir (${state.zonas[targetZone!]?.nombre ?? targetZone})`}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() =>
                            onInspectCausal(
                              `${article.medioNombre}: ${article.titulo}`,
                              article.causa || `noticia:${article.id}`,
                              article.texto
                            )
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          ¿Por qué?
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-zinc-800/55 rounded-xl p-3.5 text-sm">
                <div>
                  <div className="text-zinc-300 text-xs">Pauta estatal</div>
                  <div className="font-mono font-bold text-amber-300">
                    ${Math.round(state.gobierno.palancasVigentes.prensa)}/per
                  </div>
                </div>
                {!isG0 && (
                  <button
                    type="button"
                    onClick={onOpenPalancas}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl shrink-0 whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Ajustar
                  </button>
                )}
              </div>

              {state.medios.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400 bg-zinc-800/40 rounded-xl">
                  No hay medios de prensa operando en la comunidad.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 border-t border-zinc-800">
                  {state.medios.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectMedio?.(m.id)}
                      className="w-full py-3 px-2 -mx-2 rounded-xl hover:bg-zinc-800/60 transition-colors text-left space-y-1 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-white flex items-center gap-2">
                          <span>{m.nombre}</span>
                          {m.activa === false && (
                            <span className="text-[11px] font-sans font-semibold text-rose-400">
                              (Cerrado)
                            </span>
                          )}
                        </span>
                        <UiTooltip
                          text={`Pauta recibida: $${m.finanzas.fondosEstado.toFixed(1)} · Ingresos propios: $${m.finanzas.ingresosPropios.toFixed(0)}`}
                        >
                          <span className="font-mono text-xs text-zinc-400 tabular-nums cursor-help">
                            Cred {Math.round(m.credibilidad)}% · Alc {Math.round(m.alcancePct)}% · Dep {Math.round(m.finanzas.dependenciaPct)}%
                          </span>
                        </UiTooltip>
                      </div>
                      <div className="text-xs text-zinc-400 capitalize">
                        Línea:{' '}
                        {m.lineaEditorial.afinidadGobierno >= 60
                          ? 'Oficialista'
                          : m.lineaEditorial.afinidadGobierno <= 40
                          ? 'Crítica'
                          : 'Independiente'}{' '}
                        · Sensac. {Math.round(m.lineaEditorial.sensacionalismo)}% · Zona{' '}
                        {m.zona ? (state.zonas[m.zona]?.nombre ?? m.zona) : 'Comunidad'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
