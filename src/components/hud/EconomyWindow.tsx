import React, { useState } from 'react';
import { SlidersHorizontal, TrendingUp } from 'lucide-react';
import { PERIOD_DAYS } from '../../data/catalogs';
import { getBuildingJobCaps, sumPeriodExpenses } from '../../engine/policies';
import { CommunityDerived, GameState, HistoryPoint } from '../../types/game';
import { RctWindow } from './RctWindow';
import { UiTooltip } from './UiTooltip';

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
  const h = 48;
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
    <div className="bg-zinc-800/55 border border-zinc-700/60 rounded-xl p-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-zinc-400">{title}</span>
        <span className="font-mono text-sm font-bold text-white tabular-nums">
          {latest.toFixed(unit === '%' ? 1 : 0)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 overflow-visible">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#3f3f46" strokeWidth="1" />
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
  const lastExpenses = sumPeriodExpenses(fin);
  const curIngresos = acum.impuestos;
  const curGastos =
    acum.nominaDevengada +
    acum.pensionesDevengadas +
    acum.comidaMenores +
    acum.garantiaAlimentaria +
    acum.ayudaDevengada +
    acum.operacion +
    (acum.obras ?? 0) +
    acum.prensa;

  const foodOwnerId = state.empresas.alimento.dueno;
  const socioIds = new Set(state.empresas.comercio.socios);
  let foodOwnerName = foodOwnerId ? 'Sin dueño' : 'Vacante';
  let liveSociosCount = 0;
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    if (foodOwnerId && n.id === foodOwnerId) foodOwnerName = n.nombre;
    if (socioIds.has(n.id)) liveSociosCount++;
  }
  const caps = getBuildingJobCaps(
    state.parcelas,
    derived.poblacion,
    state.gobierno.palancasVigentes.nivelObras,
    state.config.poblacionInicial,
    state.gobierno.cuposFijos
  );
  const foodEmployees = derived.roles.agricultor + derived.roles.tecnico;
  const foodVacancies = Math.max(0, caps.agricultor - foodEmployees);
  const comEmployees = derived.roles.obrero;
  const comVacancies = Math.max(0, caps.obrero - comEmployees);

  return (
    <div className="pointer-events-none fixed top-20 left-4 md:left-[548px]" style={{ zIndex }}>
      <RctWindow
        title="Economía"
        subtitle={`Reserva $${Math.round(state.gobierno.reserva)} · Stock ${state.alimento.diasStock.toFixed(0)}d`}
        tone="amber"
        icon={<TrendingUp className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[460px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setTab('resumen')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  tab === 'resumen' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Balance
              </button>
              <button
                type="button"
                onClick={() => setTab('curvas')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  tab === 'curvas' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Curvas ({state.historial.length})
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenPalancas}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl shrink-0 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Palancas
            </button>
          </div>

          {tab === 'resumen' ? (
            <div className="space-y-5">
              {/* Fiscal KPIs */}
              <div className="grid grid-cols-4 gap-3 bg-zinc-800/55 rounded-xl p-3.5 text-sm font-mono tabular-nums">
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Reserva</span>
                  <span className="font-bold text-white">${Math.round(state.gobierno.reserva)}</span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Flujo</span>
                  <span className={`font-bold ${estDiario >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {estDiario >= 0 ? '+' : ''}${estDiario.toFixed(0)}/d
                  </span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Ingresos</span>
                  <span className="font-bold text-emerald-400">+${fin.ingresos.toFixed(0)}</span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Gastos</span>
                  <span className="font-bold text-zinc-200">-${lastExpenses.toFixed(0)}</span>
                </div>
              </div>

              {/* Settlement Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-sm font-semibold text-white pb-2 border-b border-zinc-800">
                  <UiTooltip
                    text={`Período actual (${acum.dias}/${PERIOD_DAYS}d): +$${curIngresos.toFixed(0)} / -$${curGastos.toFixed(0)}`}
                  >
                    <span className="cursor-help">Último cierre</span>
                  </UiTooltip>
                  <span className={`font-mono font-bold ${fin.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fin.saldo >= 0 ? '+' : ''}${fin.saldo.toFixed(0)}
                  </span>
                </div>

                {[
                  { label: 'Impuestos', val: fin.ingresos },
                  { label: 'Nómina', val: -fin.nomina },
                  { label: 'Pensiones', val: -fin.pensiones },
                  { label: 'Menores', val: -fin.comidaMenores },
                  { label: 'Garantía', val: -fin.garantiaAlimentaria },
                  { label: 'Ayuda social', val: -fin.ayudaSocial },
                  { label: 'Mantenimiento', val: -(fin.mantenimiento ?? 0) },
                  { label: 'Obras', val: -((fin.operacionObras ?? 0) + (fin.obras ?? 0)) },
                  { label: 'Prensa', val: -fin.prensa },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-xs py-0.5">
                    <span className="text-zinc-300">{row.label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        row.val > 0 ? 'text-emerald-400' : row.val < 0 ? 'text-zinc-200' : 'text-zinc-500'
                      }`}
                    >
                      {row.val >= 0 ? `+$${row.val.toFixed(0)}` : `-$${Math.abs(row.val).toFixed(0)}`}
                    </span>
                  </div>
                ))}

                {fin.impago && (
                  <div className="bg-rose-950/50 border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-rose-200 font-mono">
                    Impago: nómina {Math.round(fin.prorrateoNomina * 100)}% · pens./gar. {Math.round(fin.prorrateoPensionGarantia * 100)}%
                  </div>
                )}
              </div>

              {/* Food & Pantries */}
              <div className="pt-3 border-t border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white">Alimento</span>
                  <UiTooltip text={`Mercado $${state.alimento.precioMercado.toFixed(2)} · Despensa media ${derived.despensaMediaDias.toFixed(1)}d · Sin liquidez ${derived.sinDineroPct}%`}>
                    <span className="font-mono text-xs text-zinc-300 tabular-nums cursor-help">
                      ${state.alimento.precio.toFixed(2)} · Despensa {derived.despensaMediaDias.toFixed(1)}d
                    </span>
                  </UiTooltip>
                </div>
                <div className="grid grid-cols-4 gap-2 bg-zinc-800/55 rounded-xl p-3 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-zinc-400 block">Stock</span>
                    <span className="font-bold text-white">{Math.round(state.alimento.stock)}</span>
                  </div>
                  <div>
                    <span className="font-sans text-zinc-400 block">Cosecha</span>
                    <span className="font-bold text-emerald-400">+{state.alimento.produccionDiaria}/d</span>
                  </div>
                  <div>
                    <span className="font-sans text-zinc-400 block">Consumo</span>
                    <span className="font-bold text-zinc-200">-{state.alimento.consumoDiario}/d</span>
                  </div>
                  <div>
                    <span className="font-sans text-zinc-400 block">Balance</span>
                    <span className={`font-bold ${foodBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {foodBalance >= 0 ? '+' : ''}
                      {foodBalance.toFixed(0)}/d
                    </span>
                  </div>
                </div>
              </div>

              {/* Private Enterprises */}
              <div className="pt-3 border-t border-zinc-800 space-y-2.5">
                <div className="text-sm font-bold text-white">Empresas</div>
                {[
                  {
                    key: 'alimento',
                    label: 'Productora',
                    ownerLabel: foodOwnerName,
                    employees: foodEmployees,
                    vacancies: foodVacancies,
                    ent: state.empresas.alimento,
                  },
                  {
                    key: 'comercio',
                    label: 'Comercio',
                    ownerLabel: `${liveSociosCount} socios`,
                    employees: comEmployees,
                    vacancies: comVacancies,
                    ent: state.empresas.comercio,
                  },
                ].map(({ key, label, ownerLabel, employees, vacancies, ent }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 bg-zinc-800/55 rounded-xl px-3.5 py-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <UiTooltip text={`Dueño/socios: ${ownerLabel} · Sueldos período $${ent.ultimoSueldosPeriodo.toFixed(0)}`}>
                        <div className="text-sm font-semibold text-white truncate cursor-help">
                          {label}
                        </div>
                      </UiTooltip>
                      <div className="text-xs text-zinc-400 font-mono tabular-nums">
                        {employees} emp. · {vacancies} vac. · Sueldo {Math.round(ent.factor * 100)}%
                      </div>
                      {ent.ultimoTramo !== 'normal' && (
                        <div
                          className={`flex items-center gap-2 text-xs font-semibold ${
                            ent.ultimoTramo === 'aumento'
                              ? 'text-emerald-400'
                              : ent.ultimoTramo === 'despido'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                          }`}
                        >
                          <span className="capitalize">{ent.ultimoTramo}</span>
                          <button
                            type="button"
                            onClick={() =>
                              onInspectCausal(
                                `${label}: ${ent.ultimoTramo}`,
                                ent.ultimaCausa,
                                `Factor salarial de ${label} en ${Math.round(ent.factor * 100)}%.`
                              )
                            }
                            className="underline text-zinc-200 hover:text-white"
                          >
                            ¿Por qué?
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0 text-sm">
                      <div className={ent.ultimaGanancia >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {ent.ultimaGanancia >= 0 ? '+' : ''}${ent.ultimaGanancia.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <SparklineCard data={state.historial} getVal={(p) => p.reserva} title="Reserva" color="#10b981" />
              <SparklineCard data={state.historial} getVal={(p) => p.apoyo} title="Apoyo" unit="%" color="#10b981" />
              <SparklineCard data={state.historial} getVal={(p) => p.hambreCritica} title="Hambre" unit="%" color="#f43f5e" />
              <SparklineCard data={state.historial} getVal={(p) => p.satisfaccion} title="Ánimo" unit="%" color="#f59e0b" />
              <SparklineCard data={state.historial} getVal={(p) => p.poblacion} title="Población" color="#e4e4e7" />
              {state.config.economiaModulo === 'fiscal' && (
                <SparklineCard data={state.historial} getVal={(p) => p.inflacion} title="Inflación" unit="%" color="#f59e0b" />
              )}
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
