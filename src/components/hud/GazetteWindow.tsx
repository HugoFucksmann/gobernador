import React, { useState } from 'react';
import { GitBranch, Newspaper, SlidersHorizontal } from 'lucide-react';
import { GameState } from '../../types/game';
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
    <div className="pointer-events-none fixed top-20 left-4 md:left-[380px]" style={{ zIndex }}>
      <RctWindow
        title="Gaceta"
        subtitle={`${state.noticias.length} notas · ${state.medios.length} medio(s)`}
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
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  pressView === 'edicion' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Edición
              </button>
              <button
                type="button"
                onClick={() => setPressView('medios')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  pressView === 'medios' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Medios ({state.medios.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onTriggerPress}
              disabled={aiBusy || state.resultado.estado !== 'jugando'}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl disabled:opacity-45 shrink-0 transition-colors"
            >
              <Newspaper className="w-3.5 h-3.5" />
              Publicar
            </button>
          </div>

          {pressView === 'edicion' ? (
            <div className="bg-[#f6f4ef] text-zinc-900 rounded-xl divide-y divide-zinc-300 max-h-[430px] overflow-y-auto">
              {state.noticias.slice(0, 14).map((article) => (
                <article key={article.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-900">
                      {article.medioNombre} · D{article.dia}
                    </span>
                    <UiTooltip text={`Autor: ${article.autorNombre} · Tono: ${article.tono}`}>
                      <span className="font-mono text-zinc-600 cursor-help">
                        {article.tono}
                        {article.zonaOrigen ? ` · ${article.zonaOrigen}` : ''}
                      </span>
                    </UiTooltip>
                  </div>
                  <h3 className="font-display text-base font-bold text-zinc-900 leading-snug">
                    {article.titulo}
                  </h3>
                  <p className="text-sm text-zinc-700 leading-relaxed">{article.texto}</p>
                  <div className="flex justify-end pt-1">
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
              ))}
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
                <button
                  type="button"
                  onClick={onOpenPalancas}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Ajustar
                </button>
              </div>

              <div className="divide-y divide-zinc-800 border-t border-zinc-800">
                {state.medios.map((m) => (
                  <div key={m.id} className="py-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-white">{m.nombre}</span>
                      <UiTooltip
                        text={`Pauta recibida: $${m.finanzas.fondosEstado.toFixed(1)} · Ingresos propios: $${m.finanzas.ingresosPropios.toFixed(0)}`}
                      >
                        <span className="font-mono text-xs text-zinc-400 tabular-nums cursor-help">
                          Cred {Math.round(m.credibilidad)}% · Alc {Math.round(m.alcancePct)}% · Dep {Math.round(m.finanzas.dependenciaPct)}%
                        </span>
                      </UiTooltip>
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
