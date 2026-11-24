import React from 'react';
import { GameState, HistoryPoint, ServiceAreaId } from '../types/game';

interface EconomyPanelProps {
  state: GameState;
}

const MiniLineChart: React.FC<{
  data: HistoryPoint[];
  getVal: (p: HistoryPoint) => number;
  title: string;
  unit?: string;
  color: string;
  minZero?: boolean;
}> = ({ data, getVal, title, unit = '', color, minZero = true }) => {
  const values = data.map(getVal);
  const min = minZero ? 0 : Math.min(...values, 0);
  const max = Math.max(...values, min + 1);
  const w = 360;
  const h = 110;
  const pad = 12;

  const points = values
    .map((v, idx) => {
      const x = pad + (idx / Math.max(1, values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / Math.max(0.001, max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latest = values[values.length - 1] ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
          {latest.toFixed(unit === '%' ? 1 : 0)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 overflow-visible">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="#f1f5f9" strokeWidth="1" />
        {values.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        )}
      </svg>
    </div>
  );
};

export const EconomyPanel: React.FC<EconomyPanelProps> = ({ state }) => {
  const fin = state.gobierno.finanzas;
  const cov = state.gobierno.coberturas;
  const ind = state.gobierno.indicadores;

  const services: Array<{ area: ServiceAreaId; label: string; coverageKey: keyof typeof cov }> = [
    { area: 'salud', label: 'Salud', coverageKey: 'medico' },
    { area: 'seguridad', label: 'Seguridad', coverageKey: 'policia' },
    { area: 'infraestructura', label: 'Infraestructura', coverageKey: 'ingeniero' },
    { area: 'educacion', label: 'Educación', coverageKey: 'docente' },
  ];

  return (
    <div className="space-y-6">
      {/* Trend Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniLineChart
          data={state.historial}
          getVal={(p) => p.reserva}
          title="Reserva estatal"
          unit=""
          color="#0f766e"
        />
        <MiniLineChart
          data={state.historial}
          getVal={(p) => p.apoyo}
          title="Apoyo electoral"
          unit="%"
          color="#1d4ed8"
        />
        <MiniLineChart
          data={state.historial}
          getVal={(p) => p.stockDias}
          title="Stock de alimento (días)"
          unit="d"
          color="#16a34a"
        />
        <MiniLineChart
          data={state.historial}
          getVal={(p) => p.inflacion}
          title="Inflación"
          unit="%"
          color="#d97706"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fiscal Ledger */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Balance del último período fiscal</h2>
              <p className="text-xs text-slate-500">
                Liquidación cada 7 días. Acumulado parcial actual: {state.gobierno.acumuladoPeriodo.dias}/7 días.
              </p>
            </div>
            {fin.impago && (
              <span className="text-xs font-semibold text-rose-700">Impago registrado</span>
            )}
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {[
              { label: 'Recaudación impositiva neta', val: fin.impuestos, sign: '+' },
              { label: 'Ventas externas de alimento', val: fin.ventasAlimento, sign: '+' },
              { label: 'Nómina empleados públicos', val: -fin.nomina, sign: '-' },
              { label: 'Pensiones (jubilados)', val: -fin.pensiones, sign: '-' },
              { label: 'Garantía alimentaria y menores', val: -fin.garantiaAlimentaria, sign: '-' },
              { label: 'Compras externas de alimento', val: -fin.comprasAlimento, sign: '-' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5">
                <span className="text-slate-600">{row.label}</span>
                <span
                  className={`font-mono font-medium tabular-nums ${
                    row.val > 0 ? 'text-emerald-700' : row.val < 0 ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {row.val >= 0 ? `+$${row.val.toFixed(1)}` : `-$${Math.abs(row.val).toFixed(1)}`}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between py-3 font-semibold text-sm">
              <span className="text-slate-900">Disponible del período</span>
              <span className={`font-mono tabular-nums ${fin.disponible >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {fin.disponible >= 0 ? `+$${fin.disponible.toFixed(1)}` : `-$${Math.abs(fin.disponible).toFixed(1)}`}
              </span>
            </div>

            <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="font-sans text-slate-500">Presupuesto áreas</div>
                <div className="font-semibold text-slate-900">${fin.presupuestoAsignado.toFixed(0)}</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Subsidios</div>
                <div className="font-semibold text-slate-900">${fin.subsidiosAsignados.toFixed(0)}</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Prensa</div>
                <div className="font-semibold text-slate-900">${fin.prensaAsignada.toFixed(0)}</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">A reserva / Emisión</div>
                <div className="font-semibold text-slate-900">
                  +${fin.aReserva.toFixed(0)} / ${fin.emision.toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Services & Food Market */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Servicios y cobertura de personal</h2>
            <div className="space-y-3">
              {services.map((s) => (
                <div key={s.area} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-800">{s.label}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      Indicador {ind[s.area].toFixed(0)}/100 · Cobertura {Math.round(cov[s.coverageKey] * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ind[s.area] < 35 ? 'bg-rose-600' : 'bg-teal-600'}`}
                      style={{ width: `${ind[s.area]}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Cobertura estatal (admin.): </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {Math.round(cov.estatal * 100)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Cobertura comercio ext.: </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {Math.round(cov.comercio * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Mercado y stock de alimento</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
              <div>
                <div className="font-sans text-slate-500">Stock actual</div>
                <div className="text-base font-semibold text-slate-900">{Math.round(state.alimento.stock)} u.</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Producción / día</div>
                <div className="text-base font-semibold text-emerald-700">+{state.alimento.produccionDiaria} u.</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Consumo / día</div>
                <div className="text-base font-semibold text-slate-900">-{state.alimento.consumoDiario} u.</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Precio alimento</div>
                <div className="text-base font-semibold text-slate-900">${state.alimento.precio.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
