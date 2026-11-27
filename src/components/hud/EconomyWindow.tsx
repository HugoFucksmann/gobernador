import React, { useState } from 'react';
import { Home, SlidersHorizontal, Store, TrendingUp } from 'lucide-react';
import { PERIOD_DAYS } from '../../data/catalogs';
import { isObserverMode, sumAcumuladoExpenses, sumPeriodExpenses } from '../../engine/policies';
import { getRubroDisplayName } from '../../engine/worldHelpers';
import { CommunityDerived, FirmRubro, GameState, HistoryPoint, ZoneId } from '../../types/game';
import { RctWindow } from './RctWindow';
import { UiTooltip } from './UiTooltip';

interface EconomyWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onOpenPalancas: () => void;
  onJumpZone: (z: ZoneId | 'all') => void;
  onSelectFirma?: (firmaId: string) => void;
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
  onJumpZone,
  onSelectFirma,
  onInspectCausal,
}) => {
  const [tab, setTab] = useState<'resumen' | 'firmas' | 'vivienda' | 'curvas'>('resumen');
  const [rubroFilter, setRubroFilter] = useState<FirmRubro | 'todos'>('todos');
  const isG0 = isObserverMode(state.config);

  const fin = state.gobierno.finanzas;
  const acum = state.gobierno.acumuladoPeriodo;
  const estDiario = state.ultimaSalidaEconomica.saldoDiarioEstimado;
  const foodBalance = state.alimento.produccionDiaria - state.alimento.consumoDiario;
  const lastExpenses = sumPeriodExpenses(fin);
  const curIngresos = acum.impuestos;
  const curGastos = sumAcumuladoExpenses(acum);

  const activeFirms = state.firmas.filter((f) => f.activa);
  const filteredFirms = activeFirms
    .filter((f) => rubroFilter === 'todos' || f.rubro === rubroFilter)
    .sort((a, b) => b.ultimaGanancia - a.ultimaGanancia);

  const mantVias = fin.mantenimientoVias ?? 0;
  const mantEdif = fin.mantenimientoEdificios ?? Math.max(0, (fin.mantenimiento ?? 0) - mantVias);

  const casasConstruidas = state.casas.length;
  const casasOcupadas = state.casas.filter((c) => Boolean(c.hogarId)).length;
  const hogaresCalle = state.hogares.filter((h) => h.estado === 'calle').length;
  const hogaresAcogida = state.hogares.filter((h) => h.estado === 'acogida').length;

  return (
    <div className="pointer-events-none fixed top-20 left-4 md:left-[548px]" style={{ zIndex }}>
      <RctWindow
        title="Economía y Mercado"
        subtitle={`Reserva $${Math.round(state.gobierno.reserva)} · ${activeFirms.length} firmas · Calle ${derived.callePct}%`}
        tone="amber"
        icon={<TrendingUp className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[500px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="grid grid-cols-4 flex-1 gap-1 bg-zinc-800/80 p-1 rounded-xl text-xs">
              {(
                [
                  { id: 'resumen', label: 'Balance' },
                  { id: 'firmas', label: `Firmas (${activeFirms.length})` },
                  { id: 'vivienda', label: 'Vivienda' },
                  { id: 'curvas', label: 'Curvas' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`py-2 px-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                    tab === t.id ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {!isG0 && (
              <button
                type="button"
                onClick={onOpenPalancas}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl shrink-0 transition-colors whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Palancas
              </button>
            )}
          </div>

          {tab === 'resumen' && (
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
              <div className="space-y-1.5 text-xs">
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
                  { label: 'Nómina pública', val: -fin.nomina },
                  { label: 'Pensiones', val: -fin.pensiones },
                  { label: 'Comida y acogida menores', val: -(fin.comidaMenores + (fin.acogidaMenores ?? 0)) },
                  { label: 'Garantía alimentaria', val: -fin.garantiaAlimentaria },
                  { label: 'Ayuda social', val: -fin.ayudaSocial },
                  { label: 'Mant. edificios', val: -mantEdif },
                  { label: 'Mant. vías', val: -mantVias },
                  { label: 'Obras públicas', val: -((fin.operacionObras ?? 0) + (fin.obras ?? 0)) },
                  { label: 'Subsidios agro', val: -(fin.subsidios ?? 0) },
                  { label: 'Pauta prensa', val: -fin.prensa },
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

              {/* Food & Market KPIs */}
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

              {/* Concentration & Demographics Snapshot */}
              <div className="pt-3 border-t border-zinc-800 grid grid-cols-3 gap-2.5 text-xs font-mono tabular-nums">
                <div className="bg-zinc-800/55 rounded-xl p-3">
                  <span className="font-sans text-zinc-400 block">Cuota mayor</span>
                  <span className={`font-bold text-sm ${derived.mercado.cuotaMayorPct >= 38 ? 'text-amber-300' : 'text-white'}`}>
                    {derived.mercado.cuotaMayorPct}%
                  </span>
                </div>
                <div className="bg-zinc-800/55 rounded-xl p-3">
                  <span className="font-sans text-zinc-400 block">Altas / Quiebras</span>
                  <span className="font-bold text-sm text-zinc-200">
                    +{derived.mercado.fundacionesPeriodo} / -{derived.mercado.quiebrasPeriodo}
                  </span>
                </div>
                <div className="bg-zinc-800/55 rounded-xl p-3">
                  <span className="font-sans text-zinc-400 block">Constructoras</span>
                  <span
                    className={`font-bold text-sm ${
                      (derived.constructoraSalud?.firmas ?? 0) === 0 ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    {derived.constructoraSalud?.firmas ?? 0} ({Math.round((derived.constructoraSalud?.factorMedio ?? 1) * 100)}%)
                  </span>
                </div>
              </div>

              {((derived.constructoraSalud?.firmas ?? 0) === 0 ||
                (state.obrasSinCapacidadEnPeriodo ?? 0) > 0 ||
                (state.obraDirectaSinCapacidadPeriodos ?? 0) > 0) && (
                <div className="bg-amber-950/35 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
                  <span>
                    {(derived.constructoraSalud?.firmas ?? 0) === 0
                      ? 'Obra directa sin constructora (+35% costo y +40% plazo)'
                      : 'Obras con capacidad saturada en el período'}
                  </span>
                  <span className="font-mono tabular-nums shrink-0 text-amber-300">
                    {(state.obrasSinCapacidadEnPeriodo ?? 0) > 0
                      ? `${state.obrasSinCapacidadEnPeriodo} obra(s)`
                      : ''}
                    {(state.obraDirectaSinCapacidadPeriodos ?? 0) > 0
                      ? ` · racha ${state.obraDirectaSinCapacidadPeriodos}/2`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {tab === 'firmas' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(
                  [
                    { id: 'todos', label: 'Todos' },
                    { id: 'agro', label: 'Agro' },
                    { id: 'industria', label: 'Industria' },
                    { id: 'comercio', label: 'Comercio' },
                    { id: 'construccion', label: 'Obra' },
                    { id: 'inmobiliaria', label: 'Inmob.' },
                    { id: 'gastronomia', label: 'Gastro' },
                    { id: 'servicios', label: 'Serv.' },
                    { id: 'entretenimiento', label: 'Ocio' },
                    { id: 'medio', label: 'Prensa' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRubroFilter(r.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                      rubroFilter === r.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredFirms.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-400 bg-zinc-800/40 rounded-xl">
                    Sin firmas activas en este rubro.
                  </div>
                ) : (
                  filteredFirms.map((f) => {
                    const mKey = `${f.rubro}:${f.zona}`;
                    const leader = state.ultimaSalidaEconomica.cuotaMercado[mKey];
                    const share = Math.round(
                      leader?.firma === f.id
                        ? leader.cuota
                        : (f.cuotaZona?.[f.zona] ?? Math.max(...Object.values(f.cuotaZona), 0)) * 100
                    );
                    const zoneName = state.zonas[f.zona]?.nombre ?? f.zona;
                    const stockText =
                      f.stock !== undefined
                        ? ` · Stock ${Math.round(f.stock)}`
                        : f.stockBienes !== undefined
                        ? ` · Bienes ${Math.round(f.stockBienes)}`
                        : '';

                    return (
                      <div
                        key={f.id}
                        className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onSelectFirma?.(f.id)}
                              className="flex items-center gap-2 text-left hover:text-emerald-400 transition-colors max-w-full"
                            >
                              <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="font-semibold text-sm text-white hover:text-emerald-400 truncate">
                                {f.nombre}
                              </span>
                            </button>
                            <div className="text-zinc-400 mt-0.5">
                              {getRubroDisplayName(f.rubro)} ·{' '}
                              <button
                                type="button"
                                onClick={() => onJumpZone(f.zona)}
                                className="hover:underline text-zinc-300"
                              >
                                {zoneName}
                              </button>
                              {' · '}
                              {f.locales.length} local(es)
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div className={f.ultimaGanancia >= 0 ? 'text-emerald-400 font-bold text-sm' : 'text-rose-400 font-bold text-sm'}>
                              {f.ultimaGanancia >= 0 ? '+' : ''}${f.ultimaGanancia.toFixed(0)}
                            </div>
                            <div className="text-zinc-400">Caja ${Math.round(f.caja)}</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 font-mono tabular-nums text-zinc-300">
                          <span>
                            {f.empleados.length} emp. · Sueldo {Math.round(f.factor * 100)}%
                            {share > 0 ? ` · Cuota ${share}%` : ''}
                            {stockText}
                          </span>
                          {f.ultimoTramo !== 'normal' && (
                            <button
                              type="button"
                              onClick={() =>
                                onInspectCausal(
                                  `${f.nombre}: ${f.ultimoTramo}`,
                                  f.ultimaCausa,
                                  `Factor salarial ${Math.round(f.factor * 100)}% y ganancia $${f.ultimaGanancia.toFixed(0)}.`
                                )
                              }
                              className={`font-sans underline font-semibold shrink-0 ${
                                f.ultimoTramo === 'aumento'
                                  ? 'text-emerald-400'
                                  : f.ultimoTramo === 'despido'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                              }`}
                            >
                              {f.ultimoTramo} · ¿Por qué?
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'vivienda' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-zinc-800/55 rounded-xl p-3.5">
                  <span className="font-sans text-zinc-400 block">Hogares totales</span>
                  <span className="text-lg font-bold text-white">{derived.hogares}</span>
                  <span className="font-sans text-zinc-400 block mt-0.5">
                    Calle {hogaresCalle} ({derived.callePct}%) · Acogida {hogaresAcogida}
                  </span>
                </div>
                <div className="bg-zinc-800/55 rounded-xl p-3.5">
                  <span className="font-sans text-zinc-400 block">Viviendas</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {casasOcupadas}/{casasConstruidas}
                  </span>
                  <span className="font-sans text-zinc-400 block mt-0.5">
                    Hacinados {derived.hacinamientoPct}% · Carga alq. {derived.alquilerCargaMediaPct}%
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <Home className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Alquiler y demanda de suelo por zona</span>
                </div>
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 text-xs font-mono tabular-nums">
                  {Object.values(state.zonas).map((z) => {
                    const alq = state.ultimaSalidaEconomica.alquilerMedio[z.id] ?? 0;
                    const demSuelo = state.demandaSuelo[`${z.id}:residencial`] ?? 1;
                    const zCasas = state.casas.filter((c) => c.zona === z.id).length;
                    const isNoUrb = z.estado === 'no_urbanizada';
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => onJumpZone(z.id)}
                        className="w-full flex items-center justify-between gap-2 bg-zinc-800/55 hover:bg-zinc-800 rounded-xl px-3 py-2 text-left transition-colors"
                      >
                        <span className="font-sans font-medium text-zinc-100 truncate">
                          {z.nombre}
                          {isNoUrb ? ' (sin vía)' : ''}
                        </span>
                        <span className="text-zinc-300 shrink-0">
                          {zCasas} casas · ${alq.toFixed(1)} · Suelo {demSuelo.toFixed(2)}x
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'curvas' && (
            <div className="grid grid-cols-2 gap-3">
              <SparklineCard data={state.historial} getVal={(p) => p.reserva} title="Reserva" color="#10b981" />
              <SparklineCard data={state.historial} getVal={(p) => p.satisfaccion} title="Satisfacción" unit="%" color="#34d399" />
              <SparklineCard data={state.historial} getVal={(p) => p.apoyo} title="Apoyo" unit="%" color="#10b981" />
              <SparklineCard data={state.historial} getVal={(p) => p.hambreCritica} title="Hambre" unit="%" color="#f43f5e" />
              <SparklineCard data={state.historial} getVal={(p) => p.stockDias} title="Stock alimento" unit="d" color="#a3e635" />
              <SparklineCard data={state.historial} getVal={(p) => p.callePct} title="Hogares en calle" unit="%" color="#f59e0b" />
              <SparklineCard data={state.historial} getVal={(p) => p.cuotaMayorPct} title="Concentración máx." unit="%" color="#38bdf8" />
              <SparklineCard data={state.historial} getVal={(p) => p.edadMedia} title="Edad media" unit="a" color="#c084fc" />
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
