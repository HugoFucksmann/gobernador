import React from 'react';
import { Newspaper, Sparkles } from 'lucide-react';
import { GameState } from '../types/game';

interface PressPanelProps {
  state: GameState;
  onTriggerPress: () => void;
  aiBusy: boolean;
}

const TONE_LABELS: Record<string, { text: string; cls: string }> = {
  alarmista: { text: 'Tono alarmista', cls: 'text-rose-700' },
  critico: { text: 'Tono crítico', cls: 'text-amber-700' },
  favorable: { text: 'Tono favorable', cls: 'text-emerald-700' },
  informativo: { text: 'Informativo', cls: 'text-slate-600' },
};

export const PressPanel: React.FC<PressPanelProps> = ({ state, onTriggerPress, aiBusy }) => {
  return (
    <div className="space-y-6">
      {/* Media Outlets Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Medios de prensa activos ({state.medios.length})
          </h2>
          <p className="text-xs text-slate-500">
            Todos los medios son privados. La IA redacta columnas según la personalidad del periodista y la línea editorial.
          </p>
        </div>

        <button
          type="button"
          onClick={onTriggerPress}
          disabled={aiBusy || state.resultado.estado !== 'jugando'}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Newspaper className="w-3.5 h-3.5" />
          Publicar edición ahora
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.medios.map((medio) => {
          const columnistas = state.npcs
            .filter((n) => medio.columnistas.includes(n.id))
            .map((n) => n.nombre)
            .join(', ');

          return (
            <div key={medio.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">{medio.nombre}</h3>
                <div className="text-xs text-slate-500">Columnistas: {columnistas || 'Redacción'}</div>
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-xs font-mono tabular-nums pt-2 border-t border-slate-100">
                <div>
                  <span className="font-sans text-slate-500 block">Alcance</span>
                  <span className="font-semibold text-slate-900">{Math.round(medio.alcancePct)}%</span>
                </div>
                <div>
                  <span className="font-sans text-slate-500 block">Credibilidad</span>
                  <span className="font-semibold text-slate-900">{Math.round(medio.credibilidad)}%</span>
                </div>
                <div>
                  <span className="font-sans text-slate-500 block">Afinidad gob.</span>
                  <span className="font-semibold text-slate-900">
                    {Math.round(medio.lineaEditorial.afinidadGobierno)}/100
                  </span>
                </div>
                <div>
                  <span className="font-sans text-slate-500 block">Dep. estatal</span>
                  <span className="font-semibold text-slate-900">{Math.round(medio.finanzas.dependenciaPct)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Broadsheet Feed */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {state.noticias.map((article) => {
          const toneInfo = TONE_LABELS[article.tono] || TONE_LABELS.informativo;
          return (
            <article key={article.id} className="p-5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{article.medioNombre}</span>
                  <span aria-hidden="true">·</span>
                  <span>Por {article.autorNombre}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Día {article.dia}</span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-medium ${toneInfo.cls}`}>{toneInfo.text}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  {article.fuente === 'ia' && (
                    <span className="flex items-center gap-1 text-teal-700 font-sans font-medium">
                      <Sparkles className="w-3 h-3" />
                      IA
                    </span>
                  )}
                  <span>alcance {article.alcance}%</span>
                  <span aria-hidden="true">·</span>
                  <span>{article.origen}</span>
                </div>
              </div>

              <h3 className="font-display text-xl font-bold text-slate-900 leading-snug text-balance">
                {article.titulo}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">{article.texto}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
};
