import React, { useState } from 'react';
import { GitBranch, Newspaper, SlidersHorizontal } from 'lucide-react';
import { GameState } from '../../types/game';
import { RctWindow } from './RctWindow';

interface GazetteWindowProps {
  state: GameState;
  aiBusy: boolean;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onTriggerPress: () => void;
  onOpenPalancas: () => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

export const GazetteWindow: React.FC<GazetteWindowProps> = ({
  state,
  aiBusy,
  zIndex,
  onFocus,
  onClose,
  onTriggerPress,
  onOpenPalancas,
  onInspectCausal,
}) => {
  const [pressView, setPressView] = useState<'edicion' | 'medios'>('edicion');

  return (
    <div className="pointer-events-none fixed top-14 left-3 md:left-[380px]" style={{ zIndex }}>
      <RctWindow
        title="Gaceta del Valle"
        subtitle={`${state.noticias.length} notas · ${state.medios.length} medio(s) activo(s)`}
        tone="slate"
        icon={<Newspaper className="w-3.5 h-3.5" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[440px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-115px)] overflow-y-auto space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-800/70 p-0.5 rounded border border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => setPressView('edicion')}
                className={`px-2.5 py-1 rounded-sm font-semibold ${
                  pressView === 'edicion' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Edición ({state.noticias.length})
              </button>
              <button
                type="button"
                onClick={() => setPressView('medios')}
                className={`px-2.5 py-1 rounded-sm font-semibold ${
                  pressView === 'medios' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Medios ({state.medios.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onTriggerPress}
              disabled={aiBusy || state.resultado.estado !== 'jugando'}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded disabled:opacity-50 shrink-0"
            >
              <Newspaper className="w-3.5 h-3.5" />
              Publicar hoy
            </button>
          </div>

          {pressView === 'edicion' ? (
            <div className="bg-[#faf6ee] text-slate-900 rounded-md border border-amber-200/40 divide-y divide-stone-300 max-h-[420px] overflow-y-auto">
              {state.noticias.slice(0, 14).map((article) => (
                <article key={article.id} className="p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
                    <span className="font-semibold text-stone-900">
                      {article.medioNombre} · {article.autorNombre} · D{article.dia}
                    </span>
                    <span className="font-mono flex items-center gap-1.5">
                      <span>{article.tono}</span>
                      {article.zonaOrigen && (
                        <span className="text-rose-800 font-sans font-semibold uppercase">
                          {article.zonaOrigen}
                        </span>
                      )}
                    </span>
                  </div>
                  <h3 className="font-display text-sm font-bold text-stone-900 leading-snug">
                    {article.titulo}
                  </h3>
                  <p className="text-xs text-stone-700 leading-relaxed">{article.texto}</p>
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        onInspectCausal(
                          `${article.medioNombre}: ${article.titulo}`,
                          article.causa || `noticia:${article.id}`,
                          article.texto
                        )
                      }
                      className="flex items-center gap-1 text-[11px] font-semibold text-teal-800 hover:underline"
                    >
                      <GitBranch className="w-3 h-3" />
                      ¿Por qué pasó esto?
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 bg-slate-800/45 border border-slate-800 rounded p-2.5 text-xs">
                <div>
                  <div className="text-slate-200 font-medium">
                    Presupuesto prensa estatal:{' '}
                    <strong className="font-mono text-sky-300">
                      ${Math.round(state.gobierno.palancasVigentes.prensa)}/período
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Se reparte en partes iguales entre los medios activos.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenPalancas}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-600 rounded shrink-0"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Ajustar
                </button>
              </div>

              <div className="divide-y divide-slate-800 border-t border-slate-800">
                {state.medios.map((m) => (
                  <div key={m.id} className="py-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-white">{m.nombre}</span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        Cred {Math.round(m.credibilidad)}% · Alc {Math.round(m.alcancePct)}% · Dep {Math.round(m.finanzas.dependenciaPct)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
                      <span>Fondos estatales (último cierre): ${m.finanzas.fondosEstado.toFixed(1)}</span>
                      <span>Ingresos propios: ${m.finanzas.ingresosPropios.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
