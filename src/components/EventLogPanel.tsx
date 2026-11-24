import React, { useState } from 'react';
import { EventLogEntry, GameState } from '../types/game';

interface EventLogPanelProps {
  state: GameState;
}

const CAT_LABELS: Record<EventLogEntry['categoria'], string> = {
  ia: 'Acción IA',
  condicion: 'Condición',
  economia: 'Economía',
  clima: 'Clima',
  prensa: 'Prensa',
  gobernador: 'Gobernador',
  sistema: 'Sistema',
};

export const EventLogPanel: React.FC<EventLogPanelProps> = ({ state }) => {
  const [filter, setFilter] = useState<EventLogEntry['categoria'] | 'todas'>('todas');

  const entries =
    filter === 'todas'
      ? state.bitacora
      : state.bitacora.filter((e) => e.categoria === filter);

  const activeActions = state.npcs.filter((n) => n.vivo && n.accionIa);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chaos Limits Monitor */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Límites del caos y condiciones</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            El motor regula cuánto caos espontáneo entra. Huelgas, protestas y saqueos corren fuera de estos límites.
          </p>
        </div>

        <div className="space-y-2.5 text-xs pt-2 border-t border-slate-100 font-mono tabular-nums">
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">Acciones en ventana actual</span>
            <span className="font-semibold text-slate-900">
              {state.caosTracker.accionesEnVentana} / {state.config.caos.maxAccionesPorPeriodo} (cada{' '}
              {state.config.caos.periodoDias}d)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">Estado de respiro</span>
            <span className={`font-semibold ${state.caosTracker.respiroActivo ? 'text-amber-700' : 'text-emerald-700'}`}>
              {state.caosTracker.respiroActivo
                ? `Activo (sat. < ${state.config.caos.respiroSiSatisfaccionMediaMenorA}%)`
                : 'Normal'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">Tope fuera de puesto por rol</span>
            <span className="font-semibold text-slate-900">{state.config.caos.maxPctRolFueraDePuesto}%</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">Habitantes en acción ahora</span>
            <span className="font-semibold text-slate-900">{activeActions.length}</span>
          </div>
        </div>

        {activeActions.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">Acciones en curso</h3>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
              {activeActions.map((n) => (
                <div key={n.id} className="text-xs border border-slate-100 rounded-md p-2 bg-slate-50">
                  <div className="font-medium text-slate-900">
                    {n.nombre} — {n.accionIa!.nombre} ({n.accionIa!.diasRestantes}d)
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">{n.accionIa!.origen}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Causal Audit Log */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Bitácora de causas y sucesos</h2>
            <p className="text-xs text-slate-500">
              Cada consecuencia registra su origen exacto para rastrear por qué ocurrió.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['todas', 'ia', 'condicion', 'economia', 'clima', 'gobernador'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'todas' ? 'Todas' : CAT_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No hay registros en esta categoría todavía.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="py-3 flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">{entry.titulo}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
                    <span>Día {entry.dia}</span>
                    <span aria-hidden="true">·</span>
                    <span>{CAT_LABELS[entry.categoria]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.origen}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600">{entry.detalle}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
