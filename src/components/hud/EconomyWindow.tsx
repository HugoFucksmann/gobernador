import React, { useState } from 'react';
import { SlidersHorizontal, TrendingUp } from 'lucide-react';
import { FISCAL_PERIOD_DAYS, SCENARIO_PRESETS } from '../../data/catalogs';
import { CommunityDerived, GameState, HistoryPoint } from '../../types/game';
import { RctWindow } from './RctWindow';

interface EconomyWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onOpenPalancas: () => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

const SparklineCard: React.FC<{
  data: HistoryPoint[];
  getVal: (p: HistoryPoint) => number;
  title: string;
  unit?: string;
  color: string;
}> = ({ data, getVal, title, unit = '', color }) => {
  const values = data.map(getVal);
  const min = 0;
  const max = Math.max(...values, 1);
  const w = 200;
  const h = 44;
  const pad = 4;
  const points = values
    .map((v, idx) => {
      const x = pad + (idx / Math.max(1, values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / Math.max(0.001, max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const latest = values[values.length - 1] ?? 0;

  return (
    <div className="bg-slate-800/45 border border-slate-800 rounded-md p-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-slate-400">{title}</span>
        <span className="font-mono text-xs font-semibold text-white tabular-nums">
          {latest.toFixed(unit === '%' ? 1 : 0)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 overflow-visible">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" strokeWidth="1" />
        {values.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        )}
      </svg>
    </div>
  );
};

export const EconomyWindow: React.FC<EconomyWindowProps> = ({
  state,
  derived,
  zIndex,
  onFocus,
  onClose,
  onOpenPalancas,
  onInspectCausal,
}) => {
  const [tab, setTab] = useState<'resumen' | 'curvas'>('resumen');
  const fin = state.gobierno.finanzas;
  const acum = state.gobierno.acumuladoPeriodo;
  const estDiario = state.ultimaSalidaEconomica.saldoDiarioEstimado;
  const foodBalance = state.alimento.produccionDiaria - state.alimento.consumoDiario;
  const lastExpenses =
    fin.nomina +
    fin.pensiones +
    fin.garantiaAlimentaria +
    fin.ayudaSocial +
    fin.operacion +
    fin.prensa;
  const curIngresos = acum.impuestos;
  const curGastos =
    acum.nomina +
    acum.pensiones +
    acum.garantiaAlimentaria +
    acum.ayudaSocial +
    acum.operacion +
    acum.prensa;

  const foodOwner = state.empresas.alimento.dueno
    ? state.npcs.find((n) => n.id === state.empresas.alimento.dueno && n.vivo)?.nombre || 'Sin dueño'
    : 'Vacante';
  const liveSociosCount = state.empresas.comercio.socios.filter((id) =>
    state.npcs.some((n) => n.id === id && n.vivo)
  ).length;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const popScale = Math.max(0.6, derived.poblacion / 100);
  const foodEmployees = derived.roles.agricultor + derived.roles.tecnico;
  const foodCap =
    Math.round(preset.topesPrivados.agricultor * popScale) +
    Math.round(preset.topesPrivados.tecnico * popScale);
  const foodVacancies = Math.max(0, foodCap - foodEmployees);
  const comEmployees = derived.roles.obrero;
  const comCap = Math.round(preset.topesPrivados.obrero * popScale);
  const comVacancies = Math.max(0, comCap - comEmployees);

  return (
    <div className="pointer-events-none fixed top-14 left-3 md:left-[555px]" style={{ zIndex }}>
      <RctWindow
        title="Economía, Empresas y Abasto"
        subtitle={`Reserva $${Math.round(state.gobierno.reserva)} · Stock ${state.alimento.diasStock.toFixed(0)}d · Precio $${state.alimento.precio.toFixed(2)}`}
        tone="amber"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[450px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-115px)] overflow-y-auto space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 items-center gap-1 bg-slate-800/70 p-1 rounded border border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => setTab('resumen')}
                className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                  tab === 'resumen' ? 'bg-amber-700 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Balance y Empresas
              </button>
              <button
                type="button"
                onClick={() => setTab('curvas')}
                className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                  tab === 'curvas' ? 'bg-amber-700 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Curvas ({state.historial.length})
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenPalancas}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3" />
              Palancas
            </button>
          </div>

          {tab === 'resumen' ? (
            <div className="space-y-4">
              {/* Fiscal KPIs */}
              <div className="grid grid-cols-4 gap-2 bg-slate-800/50 border border-slate-800 rounded-md p-2.5 text-xs font-mono tabular-nums">
                <div>
                  <span className="font-sans text-[10px] text-slate-400 block">Reserva</span>
                  <span className="font-semibold text-white">${Math.round(state.gobierno.reserva)}</span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-400 block">Flujo est.</span>
                  <span className={`font-semibold ${estDiario >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {estDiario >= 0 ? '+' : ''}${estDiario.toFixed(0)}/d
                  </span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-400 block">Ing. cierre</span>
                  <span className="font-semibold text-emerald-400">+${fin.ingresos.toFixed(0)}</span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-400 block">Gas. cierre</span>
                  <span className="font-semibold text-slate-200">-${lastExpenses.toFixed(0)}</span>
                </div>
              </div>

              {/* Current Period + Last Settlement */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-white pb-1 border-b border-slate-800">
                  <span>Período en curso ({acum.dias}/{FISCAL_PERIOD_DAYS}d)</span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    Ing +${curIngresos.toFixed(0)} · Gas -${curGastos.toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Desglose último cierre fiscal</span>
                  <span className={`font-mono font-semibold ${fin.saldo >= 0 ? 'text-teal-300' : 'text-rose-400'}`}>
                    Saldo: {fin.saldo >= 0 ? '+' : ''}${fin.saldo.toFixed(0)}
                  </span>
                </div>
                {[
                  { label: 'Ingresos (impuestos)', val: fin.ingresos },
                  { label: 'Nómina empleados públicos', val: -fin.nomina },
                  { label: 'Pensiones (jubilados)', val: -fin.pensiones },
                  { label: 'Garantía alimentaria', val: -fin.garantiaAlimentaria },
                  { label: 'Ayuda social', val: -fin.ayudaSocial },
                  { label: 'Operación de servicios', val: -fin.operacion },
                  { label: 'Prensa estatal', val: -fin.prensa },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-[11px]">
                    <span className="text-slate-300">{row.label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        row.val > 0 ? 'text-emerald-400' : row.val < 0 ? 'text-slate-200' : 'text-slate-500'
                      }`}
                    >
                      {row.val >= 0 ? `+$${row.val.toFixed(1)}` : `-$${Math.abs(row.val).toFixed(1)}`}
                    </span>
                  </div>
                ))}

                {(fin.emision > 0 || fin.importaciones > 0 || fin.exportaciones > 0) && (
                  <div className="pt-1 border-t border-slate-800/70 space-y-0.5 text-[10px] font-mono tabular-nums text-slate-400">
                    {fin.emision > 0 && (
                      <div className="flex justify-between text-amber-300">
                        <span>Emisión monetaria aplicada</span>
                        <span>+${fin.emision.toFixed(1)}</span>
                      </div>
                    )}
                    {fin.importaciones > 0 && (
                      <div className="flex justify-between">
                        <span>Importaciones (salen de reserva)</span>
                        <span>-${fin.importaciones.toFixed(1)}</span>
                      </div>
                    )}
                    {fin.exportaciones > 0 && (
                      <div className="flex justify-between text-emerald-300">
                        <span>Exportaciones (directo a Productora)</span>
                        <span>+${fin.exportaciones.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                )}

                {fin.impago && (
                  <div className="bg-rose-950/40 border border-rose-700/60 rounded px-2 py-1 text-[10px] text-rose-200 font-mono">
                    Impago vigente: discrecional {Math.round(fin.prorrateoDiscrecional * 100)}% · nómina{' '}
                    {Math.round(fin.prorrateoNomina * 100)}% · pens./garantía{' '}
                    {Math.round(fin.prorrateoPensionGarantia * 100)}%
                  </div>
                )}
              </div>

              {/* Food & Pantries */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Alimento y Despensas</span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    Precio ${state.alimento.precio.toFixed(2)} (Mdo ${state.alimento.precioMercado.toFixed(2)})
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 bg-slate-800/45 border border-slate-800 rounded-md p-2 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block">Stock</span>
                    <span className="font-semibold text-white">{Math.round(state.alimento.stock)} u.</span>
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block">Cosecha</span>
                    <span className="font-semibold text-emerald-400">+{state.alimento.produccionDiaria}/d</span>
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block">Consumo</span>
                    <span className="font-semibold text-slate-200">-{state.alimento.consumoDiario}/d</span>
                  </div>
                  <div>
                    <span className="font-sans text-[10px] text-slate-400 block">Balance</span>
                    <span className={`font-semibold ${foodBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {foodBalance >= 0 ? '+' : ''}
                      {foodBalance.toFixed(0)}/d
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                  <span>Despensa media hogares: {derived.despensaMediaDias.toFixed(1)}d</span>
                  <span>Sin liquidez: {derived.sinDineroPct}%</span>
                </div>
              </div>

              {/* Two Sector Enterprises */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-white">Empresas privadas</div>
                {[
                  {
                    key: 'alimento',
                    label: 'Productora de Alimento',
                    ownerLabel: foodOwner,
                    employees: foodEmployees,
                    vacancies: foodVacancies,
                    ent: state.empresas.alimento,
                  },
                  {
                    key: 'comercio',
                    label: 'Empresa de Comercio',
                    ownerLabel: `${liveSociosCount} socio(s)`,
                    employees: comEmployees,
                    vacancies: comVacancies,
                    ent: state.empresas.comercio,
                  },
                ].map(({ key, label, ownerLabel, employees, vacancies, ent }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 bg-slate-800/45 border border-slate-800 rounded px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-slate-100 truncate">
                        {label} <span className="font-normal text-slate-400">({ownerLabel})</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                        Empleados: {employees} · Vacantes: {vacancies}
                      </div>
                      {ent.respuesta && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-300 flex-wrap">
                          <span>
                            Respuesta: {ent.respuesta.tipo.replace('_', ' ')} (sueldos{' '}
                            {Math.round(ent.respuesta.factorSueldo * 100)}% · {ent.respuesta.diasRestantes}d)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onInspectCausal(
                                `${label}: ${ent.respuesta!.tipo.replace('_', ' ')}`,
                                ent.respuesta!.causa || ent.respuesta!.origen,
                                `Los ingresos del período no alcanzaron a cubrir los sueldos de referencia de ${label}.`
                              )
                            }
                            className="px-1.5 py-0.5 text-[9px] font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded-sm"
                          >
                            ¿Por qué?
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className={ent.ultimaGanancia >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {ent.ultimaGanancia >= 0 ? '+' : ''}${ent.ultimaGanancia.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-slate-500">Sueldos ${ent.ultimoSueldosPeriodo.toFixed(0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <SparklineCard data={state.historial} getVal={(p) => p.reserva} title="Reserva estatal" color="#14b8a6" />
              <SparklineCard data={state.historial} getVal={(p) => p.apoyo} title="Apoyo electoral" unit="%" color="#10b981" />
              <SparklineCard data={state.historial} getVal={(p) => p.hambreCritica} title="Hambre crítica" unit="%" color="#ef4444" />
              <SparklineCard data={state.historial} getVal={(p) => p.satisfaccion} title="Satisfacción media" unit="%" color="#38bdf8" />
              <SparklineCard data={state.historial} getVal={(p) => p.poblacion} title="Población viva" color="#a78bfa" />
              <SparklineCard data={state.historial} getVal={(p) => p.inflacion} title="Inflación" unit="%" color="#f59e0b" />
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
