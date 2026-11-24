import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Compass,
  Newspaper,
  Scale,
  ShieldCheck,
  Sparkles,
  Wheat,
} from 'lucide-react';
import {
  ECON_CONSTANTS,
  LEVER_MAX_CHANGE_PCT,
  ROLE_CATALOG,
  ROLE_GROUPS,
  SCENARIO_PRESETS,
} from '../../data/catalogs';
import {
  adjustPublicCapInLevers,
  applyFiscalStanceToLevers,
  detectActiveFiscalStance,
  FiscalStance,
  getBudgetAllocationSummary,
  setBudgetShareInLevers,
} from '../../engine/policies';
import {
  CommunityDerived,
  DistrictId,
  EventLogEntry,
  GameState,
  GovernorLevers as GovernorLeversType,
  HistoryPoint,
  PublicRoleId,
  RoleGroupId,
  RoleId,
  ServiceAreaId,
  TaxableGroupId,
} from '../../types/game';
import { DockSection, MapFilter, MapLens } from '../../types/ui';
import { RctWindow, RctWindowTone } from './RctWindow';

interface PolicyDrawersProps {
  section: DockSection;
  state: GameState;
  derived: CommunityDerived;
  aiBusy: boolean;
  mapFilter: MapFilter;
  mapLens: MapLens;
  onClose: () => void;
  onUpdateLevers: (updater: (prev: GovernorLeversType) => GovernorLeversType) => void;
  onUpdateMediaIntervention: (
    medioId: string,
    field: 'financiamiento' | 'regulacion',
    value: number
  ) => void;
  onTriggerPress: () => void;
  onChangeMapFilter: (f: MapFilter) => void;
  onChangeMapLens: (l: MapLens) => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onSelectRoleSample: (role: RoleId) => void;
}

const SERVICE_META: Array<{
  area: ServiceAreaId;
  role: PublicRoleId;
  label: string;
  effect: string;
}> = [
  { area: 'salud', role: 'medico', label: 'Salud y Clínica', effect: 'Cura y frena pandemias' },
  { area: 'seguridad', role: 'policia', label: 'Seguridad y Policía', effect: 'Baja el miedo y bajas' },
  { area: 'educacion', role: 'docente', label: 'Educación y Escuela', effect: 'Forma trabajadores' },
  { area: 'infraestructura', role: 'ingeniero', label: 'Obras e Infraestructura', effect: 'Eleva productividad' },
];

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
  const w = 220;
  const h = 52;
  const pad = 6;
  const points = values
    .map((v, idx) => {
      const x = pad + (idx / Math.max(1, values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / Math.max(0.001, max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const latest = values[values.length - 1] ?? 0;

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-slate-400">{title}</span>
        <span className="font-mono text-xs font-semibold text-white tabular-nums">
          {latest.toFixed(unit === '%' ? 1 : 0)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 overflow-visible">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#1e293b" strokeWidth="1" />
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

export const PolicyDrawers: React.FC<PolicyDrawersProps> = ({
  section,
  state,
  derived,
  aiBusy,
  mapFilter,
  mapLens,
  onClose,
  onUpdateLevers,
  onUpdateMediaIntervention,
  onTriggerPress,
  onChangeMapFilter,
  onChangeMapLens,
  onJumpDistrict,
  onSelectRoleSample,
}) => {
  const [treasuryTab, setTreasuryTab] = useState<'controles' | 'balance'>('controles');
  const [servicesTab, setServicesTab] = useState<'areas' | 'subsidios'>('areas');
  const [pressTab, setPressTab] = useState<'gaceta' | 'medios'>('gaceta');
  const [cityTab, setCityTab] = useState<'bitacora' | 'lentes' | 'roles'>('bitacora');
  const [logFilter, setLogFilter] = useState<EventLogEntry['categoria'] | 'todas'>('todas');

  const mod = state.config.economiaModulo;
  const obj = state.gobierno.palancasObjetivo;
  const vig = state.gobierno.palancasVigentes;

  const {
    servicesPct,
    subsidiesPct,
    pressPct,
    totalAssignedPct: totalBudgetPct,
    remainingToReservePct: remainingToReserve,
  } = getBudgetAllocationSummary(obj);

  const setBudgetShare = (
    setter: (draft: GovernorLeversType, clampedVal: number) => void,
    rawVal: number,
    currentVal: number
  ) => {
    onUpdateLevers((prev) => setBudgetShareInLevers(prev, setter, rawVal, currentVal));
  };

  const applyFiscalStance = (stance: FiscalStance) => {
    onUpdateLevers((prev) => applyFiscalStanceToLevers(prev, stance));
  };

  const activeStance = detectActiveFiscalStance(obj);

  const WINDOW_META: Record<
    DockSection,
    { title: string; subtitle: string; tone: RctWindowTone; icon: React.ReactNode }
  > = {
    tesoreria: {
      title: 'Palacio de Gobierno — Tesorería',
      subtitle: `Flujo ${state.ultimaSalidaEconomica.disponibleDiarioEstimado >= 0 ? '+' : ''}$${state.ultimaSalidaEconomica.disponibleDiarioEstimado.toFixed(0)}/d · ±${LEVER_MAX_CHANGE_PCT}% cada cierre`,
      tone: 'teal',
      icon: <Coins className="w-3.5 h-3.5" />,
    },
    alimento: {
      title: 'Mercado y Campos — Alimento',
      subtitle: `Cosecha +${state.alimento.produccionDiaria}/d · Consumo -${state.alimento.consumoDiario}/d · $${state.alimento.precio.toFixed(2)}`,
      tone: 'amber',
      icon: <Wheat className="w-3.5 h-3.5" />,
    },
    servicios: {
      title: 'Servicios Públicos y Subsidios',
      subtitle: `Asignado ${totalBudgetPct}% · A reserva ${remainingToReserve}%`,
      tone: 'blue',
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
    prensa: {
      title: 'Gaceta del Valle — Prensa',
      subtitle: `${state.medios.length} medio(s) operando en la ciudad`,
      tone: 'rose',
      icon: <Newspaper className="w-3.5 h-3.5" />,
    },
    ciudad: {
      title: 'Ciudad, Lentes y Bitácora',
      subtitle: `Caos ${state.caosTracker.accionesEnVentana}/${state.config.caos.maxAccionesPorPeriodo} · ${state.caosTracker.respiroActivo ? 'Respiro activo' : 'Ritmo normal'}`,
      tone: 'slate',
      icon: <Compass className="w-3.5 h-3.5" />,
    },
  };

  const meta = WINDOW_META[section];

  return (
    <div className="pointer-events-none fixed top-12 left-3 z-[25]">
      <RctWindow
        title={meta.title}
        subtitle={meta.subtitle}
        tone={meta.tone}
        icon={meta.icon}
        onClose={onClose}
        className="w-[520px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-118px)] overflow-y-auto space-y-3.5">
          {/* 1. TESORERIA */}
          {section === 'tesoreria' && (
            <>
              <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-sm border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTreasuryTab('controles')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    treasuryTab === 'controles' ? 'bg-teal-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Impuestos y Nómina
                </button>
                <button
                  type="button"
                  onClick={() => setTreasuryTab('balance')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    treasuryTab === 'balance' ? 'bg-teal-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Balance y Curvas
                </button>
              </div>

              {treasuryTab === 'controles' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyFiscalStance('austeridad')}
                      className={`py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                        activeStance === 'austeridad'
                          ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                          : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                      }`}
                    >
                      Austeridad
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFiscalStance('equilibrio')}
                      className={`py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                        activeStance === 'equilibrio'
                          ? 'bg-teal-700 border-teal-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                      }`}
                    >
                      Equilibrio
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFiscalStance('bienestar')}
                      className={`py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                        activeStance === 'bienestar'
                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                          : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                      }`}
                    >
                      Bienestar
                    </button>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-200">
                      Recaudación de impuestos (0–60%)
                    </div>
                    {mod === 'simple' ? (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Impuesto único</span>
                          <span className="font-mono font-semibold text-white tabular-nums">
                            {obj.recaudacion.impuestoUnico}%
                            {Math.abs(vig.recaudacion.impuestoUnico - obj.recaudacion.impuestoUnico) >= 1 && (
                              <span className="text-amber-400 ml-1">
                                (vig. {Math.round(vig.recaudacion.impuestoUnico)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={60}
                          value={obj.recaudacion.impuestoUnico}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            onUpdateLevers((p) => ({
                              ...p,
                              recaudacion: { ...p.recaudacion, impuestoUnico: v },
                            }));
                          }}
                          className="w-full"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Por encima de 40% frena la productividad de la ciudad.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {(
                          [
                            { id: 'agro', label: 'Agro' },
                            { id: 'industria', label: 'Industria' },
                            { id: 'comercio', label: 'Comercio y Prensa' },
                            { id: 'publico', label: 'Sector Público' },
                          ] as Array<{ id: TaxableGroupId; label: string }>
                        ).map((g) => (
                          <div key={g.id}>
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className="text-slate-300">{g.label}</span>
                              <span className="font-mono font-semibold text-white tabular-nums">
                                {obj.recaudacion.impuestoGrupo[g.id]}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={60}
                              value={obj.recaudacion.impuestoGrupo[g.id]}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateLevers((p) => ({
                                  ...p,
                                  recaudacion: {
                                    ...p.recaudacion,
                                    impuestoGrupo: { ...p.recaudacion.impuestoGrupo, [g.id]: val },
                                  },
                                }));
                              }}
                              className="w-full"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-200">Salario público</span>
                        <span className="font-mono font-semibold text-white tabular-nums">
                          {obj.gasto.salarioPublico}% ($
                          {((ECON_CONSTANTS.salarioBasePublico * obj.gasto.salarioPublico) / 100).toFixed(1)}/d)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={obj.gasto.salarioPublico}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateLevers((p) => ({
                            ...p,
                            gasto: { ...p.gasto, salarioPublico: val },
                          }));
                        }}
                        className="w-full"
                      />
                    </div>

                    {mod === 'fiscal' && (
                      <div className="pt-2 border-t border-slate-800">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-200">Tope emisión monetaria</span>
                          <span className="font-mono font-semibold text-amber-300 tabular-nums">
                            {obj.finanzas.topeEmision}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          value={obj.finanzas.topeEmision}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateLevers((p) => ({
                              ...p,
                              finanzas: { ...p.finanzas, topeEmision: val },
                            }));
                          }}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <SparklineCard
                      data={state.historial}
                      getVal={(p) => p.reserva}
                      title="Reserva estatal"
                      color="#14b8a6"
                    />
                    <SparklineCard
                      data={state.historial}
                      getVal={(p) => p.apoyo}
                      title="Apoyo electoral"
                      unit="%"
                      color="#38bdf8"
                    />
                    <SparklineCard
                      data={state.historial}
                      getVal={(p) => p.stockDias}
                      title="Alimento (días)"
                      unit="d"
                      color="#22c55e"
                    />
                    <SparklineCard
                      data={state.historial}
                      getVal={(p) => p.inflacion}
                      title="Inflación"
                      unit="%"
                      color="#f59e0b"
                    />
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-white pb-1 border-b border-slate-800">
                      <span>Último cierre fiscal ({state.gobierno.acumuladoPeriodo.dias}/7d)</span>
                      <span
                        className={`font-mono tabular-nums ${
                          state.gobierno.finanzas.disponible >= 0 ? 'text-teal-300' : 'text-rose-400'
                        }`}
                      >
                        Disp: ${state.gobierno.finanzas.disponible.toFixed(0)}
                      </span>
                    </div>
                    {[
                      { label: 'Recaudación impositiva', val: state.gobierno.finanzas.impuestos },
                      { label: 'Ventas externas alimento', val: state.gobierno.finanzas.ventasAlimento },
                      { label: 'Nómina empleados públicos', val: -state.gobierno.finanzas.nomina },
                      { label: 'Pensiones (jubilados)', val: -state.gobierno.finanzas.pensiones },
                      { label: 'Garantía alimentaria', val: -state.gobierno.finanzas.garantiaAlimentaria },
                      { label: 'Compras externas alimento', val: -state.gobierno.finanzas.comprasAlimento },
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
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. ALIMENTO */}
          {section === 'alimento' && (
            <div className="space-y-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    {mod === 'simple' ? 'Ración del almacén común' : 'Garantía alimentaria estatal'}
                  </span>
                  <span className="font-mono text-sm font-bold text-teal-300 tabular-nums">
                    {mod === 'simple' ? `${obj.alimento.racion}%` : `${obj.alimento.garantiaAlimentaria}%`}
                  </span>
                </div>
                {mod === 'simple' ? (
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={obj.alimento.racion}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, racion: val },
                      }));
                    }}
                    className="w-full"
                  />
                ) : (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={obj.alimento.garantiaAlimentaria}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, garantiaAlimentaria: val },
                      }));
                    }}
                    className="w-full"
                  />
                )}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-[11px] text-slate-400 block">Stock</span>
                    <span className="font-semibold text-white">{Math.round(state.alimento.stock)} u.</span>
                  </div>
                  <div>
                    <span className="font-sans text-[11px] text-slate-400 block">Cosecha</span>
                    <span className="font-semibold text-emerald-400">+{state.alimento.produccionDiaria}/d</span>
                  </div>
                  <div>
                    <span className="font-sans text-[11px] text-slate-400 block">Demanda</span>
                    <span className="font-semibold text-slate-200">-{state.alimento.consumoDiario}/d</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Comercio exterior</span>
                  <span className="font-mono font-semibold text-white tabular-nums">
                    {obj.alimento.intercambio > 0
                      ? `Importando +${obj.alimento.intercambio}%`
                      : obj.alimento.intercambio < 0
                      ? `Exportando ${Math.abs(obj.alimento.intercambio)}%`
                      : 'Cerrado (0)'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, intercambio: -60 },
                      }))
                    }
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                      obj.alimento.intercambio < -15
                        ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Vender
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, intercambio: 0 },
                      }))
                    }
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                      obj.alimento.intercambio >= -15 && obj.alimento.intercambio <= 15
                        ? 'bg-teal-700 border-teal-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    Neutro
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, intercambio: 60 },
                      }))
                    }
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                      obj.alimento.intercambio > 15
                        ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Comprar
                  </button>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={obj.alimento.intercambio}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onUpdateLevers((p) => ({
                      ...p,
                      alimento: { ...p.alimento, intercambio: val },
                    }));
                  }}
                  className="w-full"
                />
                <p className="text-[11px] text-slate-400">
                  Capacidad comercial activa: <strong className="text-slate-200">{Math.round(state.gobierno.coberturas.comercio * 100)}%</strong>.
                </p>
              </div>
            </div>
          )}

          {/* 3. SERVICIOS */}
          {section === 'servicios' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-sm border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setServicesTab('areas')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    servicesTab === 'areas' ? 'bg-sky-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Áreas y Cupos
                </button>
                <button
                  type="button"
                  onClick={() => setServicesTab('subsidios')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    servicesTab === 'subsidios' ? 'bg-sky-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Subsidios y Estatal
                </button>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Reparto del disponible (tope 100%)</span>
                  <span className="font-mono font-semibold text-teal-300 tabular-nums">
                    {totalBudgetPct}% asignado · {remainingToReserve}% reserva
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-sm overflow-hidden flex">
                  <div className="h-full bg-teal-500" style={{ width: `${servicesPct}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${subsidiesPct}%` }} />
                  <div className="h-full bg-sky-500" style={{ width: `${pressPct}%` }} />
                </div>
              </div>

              {servicesTab === 'areas' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SERVICE_META.map((s) => {
                    const indVal = Math.round(state.gobierno.indicadores[s.area]);
                    const ocupados = derived.roles[s.role];
                    const cupo = obj.cupos[s.role];
                    const targetCov =
                      SCENARIO_PRESETS[state.config.escenarioId].objetivoCobertura?.[s.role] ??
                      ECON_CONSTANTS.objetivoCobertura[s.role];
                    const rec = Math.max(
                      1,
                      Math.round(derived.poblacion * targetCov)
                    );
                    return (
                      <div
                        key={s.area}
                        className="bg-slate-950/60 border border-slate-800 rounded p-2.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-white">{s.label}</div>
                            <div className="text-[10px] text-slate-400">{s.effect}</div>
                          </div>
                          <span
                            className={`font-mono text-xs font-bold tabular-nums ${
                              indVal < 35 ? 'text-rose-400' : 'text-teal-300'
                            }`}
                          >
                            {indVal}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                          <div
                            className={`h-full ${indVal < 35 ? 'bg-rose-500' : 'bg-teal-500'}`}
                            style={{ width: `${indVal}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Presup.</span>
                              <span className="font-mono text-white tabular-nums">
                                {obj.gasto.presupuesto[s.area]}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={60}
                              value={obj.gasto.presupuesto[s.area]}
                              onChange={(e) =>
                                setBudgetShare(
                                  (draft, val) => {
                                    draft.gasto.presupuesto[s.area] = val;
                                  },
                                  Number(e.target.value),
                                  obj.gasto.presupuesto[s.area]
                                )
                              }
                              className="w-full"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                              {ocupados}/{rec}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateLevers((p) => adjustPublicCapInLevers(p, s.role, -1))}
                              className="w-5 h-5 rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 font-mono text-xs"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-mono text-xs font-semibold tabular-nums">
                              {cupo}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateLevers((p) => adjustPublicCapInLevers(p, s.role, 1))}
                              className="w-5 h-5 rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 font-mono text-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-200">
                      Subsidios por sector ({mod === 'simple' ? 'suben ánimo' : 'transfieren dinero'})
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {(['sin_ingreso', 'agro', 'industria', 'comercio', 'publico'] as RoleGroupId[]).map(
                        (grp) => (
                          <div key={grp}>
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className="text-slate-300 truncate">{ROLE_GROUPS[grp].nombre}</span>
                              <span className="font-mono text-amber-300 tabular-nums">
                                {obj.gasto.subsidios[grp]}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={40}
                              value={obj.gasto.subsidios[grp]}
                              onChange={(e) =>
                                setBudgetShare(
                                  (draft, val) => {
                                    draft.gasto.subsidios[grp] = val;
                                  },
                                  Number(e.target.value),
                                  obj.gasto.subsidios[grp]
                                )
                              }
                              className="w-full"
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">Administración Estatal</div>
                      <p className="text-[11px] text-slate-400">
                        Eficiencia recaudatoria:{' '}
                        <strong className="text-teal-300 font-mono">
                          {Math.round(state.gobierno.coberturas.estatal * 100)}%
                        </strong>{' '}
                        (ocupados {derived.roles.estatal})
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateLevers((p) => adjustPublicCapInLevers(p, 'estatal', -1))}
                        className="w-6 h-6 rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 font-mono"
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums">
                        {obj.cupos.estatal}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateLevers((p) => adjustPublicCapInLevers(p, 'estatal', 1))}
                        className="w-6 h-6 rounded-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 font-mono"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. PRENSA */}
          {section === 'prensa' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-sm border border-slate-800 text-xs flex-1">
                  <button
                    type="button"
                    onClick={() => setPressTab('gaceta')}
                    className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                      pressTab === 'gaceta' ? 'bg-rose-800 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Gaceta ({state.noticias.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPressTab('medios')}
                    className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                      pressTab === 'medios' ? 'bg-rose-800 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Medios y Fondos
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onTriggerPress}
                  disabled={aiBusy || state.resultado.estado !== 'jugando'}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-sm disabled:opacity-50 shrink-0"
                >
                  <Newspaper className="w-3.5 h-3.5" />
                  Publicar hoy
                </button>
              </div>

              {pressTab === 'gaceta' ? (
                <div className="bg-[#faf6ee] text-slate-900 rounded border border-amber-200/40 divide-y divide-stone-300 max-h-[340px] overflow-y-auto">
                  {state.noticias.slice(0, 10).map((article) => (
                    <article key={article.id} className="p-3.5 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
                        <span className="font-semibold text-stone-900">
                          {article.medioNombre} · Por {article.autorNombre} · Día {article.dia}
                        </span>
                        <span className="font-mono flex items-center gap-1">
                          {article.fuente === 'ia' && (
                            <span className="flex items-center gap-0.5 text-teal-800 font-sans font-semibold">
                              <Sparkles className="w-3 h-3" />
                              IA
                            </span>
                          )}
                          <span>{article.tono}</span>
                        </span>
                      </div>
                      <h3 className="font-display text-base font-bold text-stone-900 leading-snug">
                        {article.titulo}
                      </h3>
                      <p className="text-xs text-stone-700 leading-relaxed">{article.texto}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-300">
                      Presupuesto estatal prensa:{' '}
                      <strong className="font-mono text-sky-300">{obj.gasto.prensa}%</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={obj.gasto.prensa}
                      onChange={(e) =>
                        setBudgetShare(
                          (draft, val) => {
                            draft.gasto.prensa = val;
                          },
                          Number(e.target.value),
                          obj.gasto.prensa
                        )
                      }
                      className="w-36"
                    />
                  </div>
                  <div className="space-y-2">
                    {state.medios.map((m) => {
                      const target = state.gobierno.prensaObjetivo[m.id] || m.intervencion;
                      return (
                        <div
                          key={m.id}
                          className="bg-slate-950/60 border border-slate-800 rounded p-2.5 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display font-bold text-white">{m.nombre}</span>
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                              Cred {Math.round(m.credibilidad)}% · Alc {Math.round(m.alcancePct)}%
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Fondos</span>
                                <span className="font-mono text-white">{Math.round(target.financiamiento)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                disabled={state.medios.length === 1}
                                value={target.financiamiento}
                                onChange={(e) =>
                                  onUpdateMediaIntervention(m.id, 'financiamiento', Number(e.target.value))
                                }
                                className="w-full"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Regulación</span>
                                <span className="font-mono text-amber-300">{Math.round(target.regulacion)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={target.regulacion}
                                onChange={(e) =>
                                  onUpdateMediaIntervention(m.id, 'regulacion', Number(e.target.value))
                                }
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. CIUDAD */}
          {section === 'ciudad' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-sm border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setCityTab('bitacora')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    cityTab === 'bitacora' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Bitácora
                </button>
                <button
                  type="button"
                  onClick={() => setCityTab('lentes')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    cityTab === 'lentes' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Lentes y Zonas
                </button>
                <button
                  type="button"
                  onClick={() => setCityTab('roles')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    cityTab === 'roles' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Roles ({derived.poblacion})
                </button>
              </div>

              {cityTab === 'bitacora' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(['todas', 'ia', 'condicion', 'economia', 'clima'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setLogFilter(c)}
                        className={`px-2 py-0.5 text-[11px] rounded-sm ${
                          logFilter === c
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                  </div>
                  <div className="divide-y divide-slate-800 max-h-[300px] overflow-y-auto pr-1">
                    {state.bitacora
                      .filter((e) => logFilter === 'todas' || e.categoria === logFilter)
                      .slice(0, 40)
                      .map((entry) => (
                        <div key={entry.id} className="py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-100">{entry.titulo}</span>
                            <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0">
                              D{entry.dia} · {entry.origen}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-0.5">{entry.detalle}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {cityTab === 'lentes' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-200 mb-1.5">Lente visual</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'roles', label: 'Profesiones' },
                          { id: 'satisfaccion', label: 'Humor social' },
                          { id: 'hambre', label: 'Hambre' },
                          { id: 'lealtad', label: 'Apoyo electoral' },
                        ] as Array<{ id: MapLens; label: string }>
                      ).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => onChangeMapLens(l.id)}
                          className={`py-1.5 px-2 rounded-sm border font-medium ${
                            mapLens === l.id
                              ? 'bg-teal-700 border-teal-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200 mb-1.5">Filtrar vecinos</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'todos', label: 'Todos' },
                          { id: 'acciones', label: 'En acción' },
                          { id: 'descontentos', label: 'Descontentos' },
                          { id: 'hambre', label: 'Hambre crítica' },
                        ] as Array<{ id: MapFilter; label: string }>
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onChangeMapFilter(f.id)}
                          className={`py-1.5 px-2 rounded-sm border font-medium ${
                            mapFilter === f.id
                              ? 'bg-slate-100 border-white text-slate-900'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200 mb-1.5">Saltar a distrito</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'Vista panorámica' },
                          { id: 'campos', label: 'Campos' },
                          { id: 'taller', label: 'Industria' },
                          { id: 'mercado', label: 'Plaza' },
                          { id: 'civico', label: 'Cívico' },
                          { id: 'residencial', label: 'Barrio Sur' },
                        ] as Array<{ id: DistrictId | 'all'; label: string }>
                      ).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => onJumpDistrict(d.id)}
                          className="px-2.5 py-1 rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {cityTab === 'roles' && (
                <div className="grid grid-cols-2 gap-1 text-xs max-h-[300px] overflow-y-auto">
                  {(Object.keys(ROLE_CATALOG) as RoleId[]).map((rId) => {
                    const def = ROLE_CATALOG[rId];
                    const count = derived.roles[rId];
                    return (
                      <button
                        key={rId}
                        type="button"
                        disabled={count === 0}
                        onClick={() => onSelectRoleSample(rId)}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-sm bg-slate-950/50 hover:bg-slate-800 disabled:opacity-35 text-left border border-slate-800/80"
                      >
                        <span className="flex items-center gap-2 truncate text-slate-200">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: def.color }}
                          />
                          <span className="truncate">{def.nombre}</span>
                        </span>
                        <span className="font-mono text-slate-400 tabular-nums">{count}</span>
                      </button>
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
