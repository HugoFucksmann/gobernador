import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Compass,
  GitBranch,
  Landmark,
  Newspaper,
  Scale,
  Search,
  Sparkles,
  Wheat,
} from 'lucide-react';
import {
  ECON_CONSTANTS,
  FISCAL_PERIOD_DAYS,
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
  getLeverMarginInfo,
  getPublicCapMax,
  setBudgetShareInLevers,
} from '../../engine/policies';
import {
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveZone,
} from '../../engine/simulation';
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
  ZoneId,
} from '../../types/game';
import { CityTab, DockSection } from '../../types/ui';
import { RctWindow, RctWindowTone } from './RctWindow';

const ZONE_TO_DISTRICT: Record<ZoneId, DistrictId | 'all'> = {
  centro: 'civico',
  norte: 'campos',
  este: 'residencial',
  sur: 'taller',
  oeste: 'campos',
};

interface PolicyDrawersProps {
  section: DockSection;
  state: GameState;
  derived: CommunityDerived;
  aiBusy: boolean;
  ciudadTabRequest?: { tab: CityTab; seq: number } | null;
  onClose: () => void;
  onUpdateLevers: (updater: (prev: GovernorLeversType) => GovernorLeversType) => void;
  onUpdateMediaIntervention: (
    medioId: string,
    field: 'financiamiento' | 'regulacion',
    value: number
  ) => void;
  onTriggerPress: () => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onSelectRoleSample: (role: RoleId) => void;
  onSelectNpc: (npcId: string) => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

const SERVICE_META: Array<{
  area: ServiceAreaId;
  role: PublicRoleId;
  label: string;
  effect: string;
}> = [
  { area: 'salud', role: 'medico', label: 'Salud', effect: 'Camas y cura (+salud)' },
  { area: 'seguridad', role: 'policia', label: 'Seguridad', effect: 'Defensa (-miedo)' },
  { area: 'educacion', role: 'docente', label: 'Educación', effect: 'Forma calificados' },
  { area: 'infraestructura', role: 'ingeniero', label: 'Obras', effect: 'Repara zonas' },
];

const PendingHint: React.FC<{
  inicio: number;
  vigente: number;
  objetivo: number;
  min: number;
  max: number;
  diasEnPeriodo: number;
  unit?: string;
}> = ({ inicio, vigente, objetivo, min, max, diasEnPeriodo, unit = '%' }) => {
  const info = getLeverMarginInfo(inicio, vigente, objetivo, min, max, diasEnPeriodo);
  if (!info.pendingChange) return null;
  return (
    <span
      title={`Margen este período: ${Math.round(info.minAllowedInPeriod)}–${Math.round(
        info.maxAllowedInPeriod
      )}${unit} (${info.daysToSettlement}d para cierre)`}
      className="text-[10px] font-mono text-amber-300 tabular-nums"
    >
      vig. {Math.round(vigente)}
      {unit}
    </span>
  );
};

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

export const PolicyDrawers: React.FC<PolicyDrawersProps> = ({
  section,
  state,
  derived,
  aiBusy,
  ciudadTabRequest,
  onClose,
  onUpdateLevers,
  onUpdateMediaIntervention,
  onTriggerPress,
  onJumpDistrict,
  onSelectRoleSample,
  onSelectNpc,
  onInspectCausal,
}) => {
  const [govTab, setGovTab] = useState<'decisiones' | 'balance'>('decisiones');
  const [showAdvancedGov, setShowAdvancedGov] = useState<boolean>(false);
  const [pressView, setPressView] = useState<'edicion' | 'medios'>('edicion');
  const [cityTab, setCityTab] = useState<CityTab>('alertas');
  const [logFilter, setLogFilter] = useState<EventLogEntry['categoria'] | 'todas'>('todas');
  const [npcQuery, setNpcQuery] = useState<string>('');

  useEffect(() => {
    if (section === 'ciudad' && ciudadTabRequest?.tab) {
      setCityTab(ciudadTabRequest.tab);
    }
  }, [section, ciudadTabRequest]);

  const mod = state.config.economiaModulo;
  const obj = state.gobierno.palancasObjetivo;
  const vig = state.gobierno.palancasVigentes;
  const ini = state.gobierno.palancasInicioPeriodo || vig;
  const diasPer = state.reloj.diasEnPeriodoFiscal;
  const daysLeftPeriod = Math.max(1, FISCAL_PERIOD_DAYS - diasPer);
  const maxCupo = getPublicCapMax(derived.poblacion);
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zoneIds = Object.keys(preset.zonas) as ZoneId[];
  const zonesCount = zoneIds.length;

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
  const estDiario = state.ultimaSalidaEconomica.disponibleDiarioEstimado;
  const activeFenomenos = getActivePhenomena(state);
  const announcedFenomenos = getAnnouncedPhenomena(state);

  // Build active alerts list for Ciudad -> Alertas
  const activeAlerts: Array<{
    id: string;
    severity: 'critica' | 'aviso';
    title: string;
    detail: string;
    district?: DistrictId | 'all';
    causalRef?: string;
  }> = [];

  if (state.gobierno.finanzas.impago) {
    const ev = state.eventos.find((e) => e.tipo === 'impago');
    activeAlerts.push({
      id: 'al_impago',
      severity: 'critica',
      title: 'Impago de obligaciones estatales',
      detail: 'Faltante en último cierre fiscal. Puede disparar huelga de estatales.',
      district: 'civico',
      causalRef: ev?.id,
    });
  }
  if (derived.hospitalOcupacionPct > 100) {
    const ev = state.eventos.find((e) => e.tipo === 'hospital_saturado');
    activeAlerts.push({
      id: 'al_hosp',
      severity: 'critica',
      title: `Hospital saturado (${derived.hospitalOcupacionPct}%)`,
      detail: `${derived.internados}/${derived.camasHospital} camas ocupadas · ${derived.esperandoCama} esperando atención.`,
      district: 'civico',
      causalRef: ev?.id,
    });
  }
  if (derived.hambreCriticaPct > 20) {
    activeAlerts.push({
      id: 'al_hambre',
      severity: 'critica',
      title: `Hambre crítica en ${derived.hambreCriticaPct}% de vecinos`,
      detail: 'Supera el umbral de saqueos (> 20%) y reduce apoyo y salud.',
      district: 'campos',
    });
  }
  if (derived.descontentosPct > 30) {
    activeAlerts.push({
      id: 'al_malestar',
      severity: 'critica',
      title: `Malestar social elevado (${derived.descontentosPct}%)`,
      detail: 'Supera el umbral de protestas (> 30%).',
      district: 'mercado',
    });
  }
  for (const fen of announcedFenomenos) {
    const daysTo = Math.max(1, fen.inicioDia - state.reloj.dia);
    activeAlerts.push({
      id: `al_warn_${fen.id}`,
      severity: 'aviso',
      title: `Aviso: ${fen.nombre} en ${daysTo}d`,
      detail: fen.origen ? `Origen estimado: zona ${fen.origen}.` : 'Prepará reservas y cobertura.',
      district: fen.origen ? ZONE_TO_DISTRICT[fen.origen] : 'all',
    });
  }
  for (const fen of activeFenomenos) {
    const ev = state.eventos.find((e) => e.tipo === 'fenomeno_inicio' && e.fenomenoId === fen.id);
    activeAlerts.push({
      id: `al_act_${fen.id}`,
      severity: fen.tipo === 'plaga_zombie' || fen.tipo === 'pandemia' ? 'critica' : 'aviso',
      title: `Activo: ${fen.nombre} (${Math.round(fen.intensidad)}%)`,
      detail: fen.origen ? `Foco en zona ${fen.origen}.` : 'Afecta a toda la comunidad.',
      district: fen.origen ? ZONE_TO_DISTRICT[fen.origen] : 'all',
      causalRef: ev?.id || `clima:${fen.tipo}`,
    });
  }
  for (const ev of state.eventos.filter((e) => e.tipo === 'golpe' && state.reloj.dia - e.dia <= 3).slice(0, 3)) {
    if (ev.tipo === 'golpe') {
      const npc = state.npcs.find((n) => n.id === ev.npcId);
      activeAlerts.push({
        id: `al_hit_${ev.id}`,
        severity: 'critica',
        title: `Ataque en zona ${ev.zona} (${npc?.nombre || 'vecino'})`,
        detail: `Daño -${ev.dano} salud (Día ${ev.dia}).`,
        district: ZONE_TO_DISTRICT[ev.zona],
        causalRef: ev.id,
      });
    }
  }

  const WINDOW_META: Record<
    DockSection,
    { title: string; subtitle: string; tone: RctWindowTone; icon: React.ReactNode }
  > = {
    gobierno: {
      title: 'Gobierno y Finanzas',
      subtitle: `Flujo ${estDiario >= 0 ? '+' : ''}$${estDiario.toFixed(0)}/d · Cierre en ${daysLeftPeriod}d (margen ±${LEVER_MAX_CHANGE_PCT}%)`,
      tone: 'teal',
      icon: <Landmark className="w-3.5 h-3.5" />,
    },
    alimento: {
      title: 'Alimento y Abasto',
      subtitle: `Stock ${state.alimento.diasStock.toFixed(0)}d · Cosecha +${state.alimento.produccionDiaria}/d · Consumo -${state.alimento.consumoDiario}/d`,
      tone: 'amber',
      icon: <Wheat className="w-3.5 h-3.5" />,
    },
    ciudad: {
      title: 'Ciudad, Alertas y Gaceta',
      subtitle: `${activeAlerts.length} alerta(s) · ${state.noticias.length} notas · Caos ${state.caosTracker.accionesEnVentana}/${state.config.caos.maxAccionesPorPeriodo}`,
      tone: 'blue',
      icon: <Compass className="w-3.5 h-3.5" />,
    },
  };

  const meta = WINDOW_META[section];
  const foodBalance = state.alimento.produccionDiaria - state.alimento.consumoDiario;

  return (
    <div className="pointer-events-none fixed top-14 left-3 z-[25]">
      <RctWindow
        title={meta.title}
        subtitle={meta.subtitle}
        tone={meta.tone}
        icon={meta.icon}
        onClose={onClose}
        className="w-[460px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-120px)] overflow-y-auto space-y-3.5">
          {/* 1. GOBIERNO UNIFICADO */}
          {section === 'gobierno' && (
            <>
              <div className="flex items-center gap-1 bg-slate-800/70 p-1 rounded border border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setGovTab('decisiones')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    govTab === 'decisiones' ? 'bg-teal-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Decisiones del período
                </button>
                <button
                  type="button"
                  onClick={() => setGovTab('balance')}
                  className={`flex-1 py-1 rounded-sm font-semibold transition-colors ${
                    govTab === 'balance' ? 'bg-teal-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Balance y Curvas
                </button>
              </div>

              {/* Compact Cash & Allocation Strip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Reparto del disponible estatal</span>
                  <span className="font-mono font-semibold text-teal-300 tabular-nums">
                    {totalBudgetPct}% asignado · {remainingToReserve}% reserva
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-sm overflow-hidden flex">
                  <div className="h-full bg-teal-500" style={{ width: `${servicesPct}%` }} title={`Servicios ${servicesPct}%`} />
                  <div className="h-full bg-amber-500" style={{ width: `${subsidiesPct}%` }} title={`Subsidios ${subsidiesPct}%`} />
                  <div className="h-full bg-sky-500" style={{ width: `${pressPct}%` }} title={`Prensa ${pressPct}%`} />
                </div>
              </div>

              {govTab === 'decisiones' ? (
                <div className="space-y-4">
                  {/* Stance presets */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                      Orientación rápida
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyFiscalStance('austeridad')}
                        className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                          activeStance === 'austeridad'
                            ? 'bg-amber-600/25 border-amber-400 text-amber-200'
                            : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                        }`}
                      >
                        Austeridad
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFiscalStance('equilibrio')}
                        className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                          activeStance === 'equilibrio'
                            ? 'bg-teal-700 border-teal-400 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                        }`}
                      >
                        Equilibrio
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFiscalStance('bienestar')}
                        className={`py-1.5 text-xs font-semibold rounded border transition-colors ${
                          activeStance === 'bienestar'
                            ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                            : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                        }`}
                      >
                        Bienestar
                      </button>
                    </div>
                  </div>

                  {/* Taxes & Payroll */}
                  <div className="pt-3 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        Impuestos y Salario Público
                      </span>
                      <span className="text-[10px] text-slate-500">
                        &gt;40% impuesto frena actividad
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {(
                        [
                          { id: 'agro', label: 'Agro' },
                          { id: 'industria', label: 'Industria' },
                          { id: 'comercio', label: 'Comercio y Prensa' },
                          { id: 'publico', label: 'Sector Público' },
                        ] as Array<{ id: TaxableGroupId; label: string }>
                      ).map((g) => (
                        <div key={g.id} className="space-y-0.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-300">{g.label}</span>
                            <span className="flex items-center gap-1.5 font-mono tabular-nums">
                              <PendingHint
                                inicio={ini.recaudacion.impuestoGrupo[g.id]}
                                vigente={vig.recaudacion.impuestoGrupo[g.id]}
                                objetivo={obj.recaudacion.impuestoGrupo[g.id]}
                                min={0}
                                max={60}
                                diasEnPeriodo={diasPer}
                              />
                              <span className="font-semibold text-white">
                                {obj.recaudacion.impuestoGrupo[g.id]}%
                              </span>
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

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-200">Salario público</span>
                        <span className="flex items-center gap-2 font-mono tabular-nums">
                          <PendingHint
                            inicio={ini.gasto.salarioPublico}
                            vigente={vig.gasto.salarioPublico}
                            objetivo={obj.gasto.salarioPublico}
                            min={50}
                            max={150}
                            diasEnPeriodo={diasPer}
                          />
                          <span className="font-semibold text-white">
                            {obj.gasto.salarioPublico}% ($
                            {((ECON_CONSTANTS.salarioBasePublico * obj.gasto.salarioPublico) / 100).toFixed(1)}/d)
                          </span>
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
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-200">Tope emisión monetaria (cubre déficit, sube inflación)</span>
                          <span className="flex items-center gap-2 font-mono tabular-nums">
                            <PendingHint
                              inicio={ini.finanzas.topeEmision}
                              vigente={vig.finanzas.topeEmision}
                              objetivo={obj.finanzas.topeEmision}
                              min={0}
                              max={30}
                              diasEnPeriodo={diasPer}
                            />
                            <span className="font-semibold text-amber-300">
                              {obj.finanzas.topeEmision}%
                            </span>
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

                  {/* Services & Quotas */}
                  <div className="pt-3 border-t border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        Servicios Públicos y Cupos (máx {maxCupo})
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        Camas {derived.internados}/{derived.camasHospital}
                        {derived.esperandoCama > 0 && (
                          <span className="text-rose-400 font-semibold ml-1">
                            · {derived.esperandoCama} esp.
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/80">
                      {SERVICE_META.map((s) => {
                        const indVal = Math.round(state.gobierno.indicadores[s.area]);
                        const ocupados = derived.roles[s.role];
                        const cupo = obj.cupos[s.role];
                        const targetCov =
                          SCENARIO_PRESETS[state.config.escenarioId].objetivoCobertura?.[s.role] ??
                          ECON_CONSTANTS.objetivoCobertura[s.role];
                        const rec = Math.max(1, Math.round(derived.poblacion * targetCov));
                        return (
                          <div key={s.area} className="py-2 first:pt-0 last:pb-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-semibold text-white">{s.label}</span>
                                <span className="text-[10px] text-slate-400 truncate">{s.effect}</span>
                              </div>
                              <span
                                className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                                  indVal < 35 ? 'text-rose-400' : 'text-teal-300'
                                }`}
                              >
                                Nivel {indVal}%
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1 space-y-0.5">
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>Presupuesto</span>
                                  <span className="flex items-center gap-1.5 font-mono tabular-nums">
                                    <PendingHint
                                      inicio={ini.gasto.presupuesto[s.area]}
                                      vigente={vig.gasto.presupuesto[s.area]}
                                      objetivo={obj.gasto.presupuesto[s.area]}
                                      min={0}
                                      max={100}
                                      diasEnPeriodo={diasPer}
                                    />
                                    <span className="text-white font-semibold">
                                      {obj.gasto.presupuesto[s.area]}%
                                    </span>
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
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

                              <div className="flex items-center gap-1 shrink-0 pt-2">
                                <span
                                  className="text-[10px] text-slate-400 font-mono tabular-nums mr-0.5"
                                  title="Empleados actuales / Recomendado"
                                >
                                  {ocupados}/{rec}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateLevers((p) =>
                                      adjustPublicCapInLevers(p, s.role, -1, derived.poblacion)
                                    )
                                  }
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono text-xs"
                                >
                                  −
                                </button>
                                <span className="w-4 text-center font-mono text-xs font-semibold tabular-nums">
                                  {cupo}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateLevers((p) =>
                                      adjustPublicCapInLevers(p, s.role, 1, derived.poblacion)
                                    )
                                  }
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Collapsible Advanced: Subsidies, State Admin & Press State Budget */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedGov((v) => !v)}
                      className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        {showAdvancedGov ? (
                          <ChevronDown className="w-3.5 h-3.5 text-teal-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        Subsidios, Estatal y Prensa estatal
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        Sub {subsidiesPct}% · Prensa {pressPct}% · Adm {obj.cupos.estatal}
                      </span>
                    </button>

                    {showAdvancedGov && (
                      <div className="pt-2.5 space-y-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {(['sin_ingreso', 'agro', 'industria', 'comercio', 'publico'] as RoleGroupId[]).map(
                            (grp) => (
                              <div key={grp} className="space-y-0.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-slate-300 truncate">{ROLE_GROUPS[grp].nombre}</span>
                                  <span className="flex items-center gap-1 font-mono tabular-nums">
                                    <PendingHint
                                      inicio={ini.gasto.subsidios[grp]}
                                      vigente={vig.gasto.subsidios[grp]}
                                      objetivo={obj.gasto.subsidios[grp]}
                                      min={0}
                                      max={100}
                                      diasEnPeriodo={diasPer}
                                    />
                                    <span className="text-amber-300 font-semibold">
                                      {obj.gasto.subsidios[grp]}%
                                    </span>
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
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
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-300">Prensa estatal</span>
                              <span className="flex items-center gap-1 font-mono tabular-nums">
                                <PendingHint
                                  inicio={ini.gasto.prensa}
                                  vigente={vig.gasto.prensa}
                                  objetivo={obj.gasto.prensa}
                                  min={0}
                                  max={100}
                                  diasEnPeriodo={diasPer}
                                />
                                <span className="text-sky-300 font-semibold">{obj.gasto.prensa}%</span>
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
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
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
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
                              onClick={() =>
                                onUpdateLevers((p) =>
                                  adjustPublicCapInLevers(p, 'estatal', -1, derived.poblacion)
                                )
                              }
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono"
                            >
                              −
                            </button>
                            <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums">
                              {obj.cupos.estatal}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLevers((p) =>
                                  adjustPublicCapInLevers(p, 'estatal', 1, derived.poblacion)
                                )
                              }
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono"
                            >
                              +
                            </button>
                          </div>
                        </div>
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
                      getVal={(p) => p.hambreCritica}
                      title="Hambre crítica"
                      unit="%"
                      color="#ef4444"
                    />
                    <SparklineCard
                      data={state.historial}
                      getVal={(p) => p.satisfaccion}
                      title="Satisfacción media"
                      unit="%"
                      color="#38bdf8"
                    />
                    {mod === 'fiscal' && (
                      <SparklineCard
                        data={state.historial}
                        getVal={(p) => p.inflacion}
                        title="Inflación"
                        unit="%"
                        color="#f59e0b"
                      />
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-white pb-1 border-b border-slate-800/80">
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
                      { label: 'Compras externas (reserva)', val: -state.gobierno.finanzas.comprasAlimento },
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
            <div className="space-y-4">
              {/* Summary Strip */}
              <div className="grid grid-cols-4 gap-2 bg-slate-800/50 border border-slate-800 rounded-md p-2.5 text-xs font-mono tabular-nums">
                <div>
                  <span className="font-sans text-[10px] text-slate-400 block">Stock (máx {state.alimento.siloDias}d)</span>
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

              {/* Price Cap & Food Guarantee */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs bg-slate-800/40 border border-slate-800 rounded px-2.5 py-1.5">
                  <span className="text-slate-300">
                    Precio vigente: <strong className="font-mono text-white">${state.alimento.precio.toFixed(2)}/u</strong>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Mercado: ${state.alimento.precioMercado.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Precio máximo del alimento</span>
                    <span className="flex items-center gap-2 font-mono tabular-nums">
                      <PendingHint
                        inicio={ini.alimento.precioMaximo}
                        vigente={vig.alimento.precioMaximo}
                        objetivo={obj.alimento.precioMaximo}
                        min={50}
                        max={ECON_CONSTANTS.precioMaximoSinTope}
                        diasEnPeriodo={diasPer}
                      />
                      <span className="text-sm font-bold text-amber-300">
                        {obj.alimento.precioMaximo >= ECON_CONSTANTS.precioMaximoSinTope
                          ? 'Sin tope'
                          : `${obj.alimento.precioMaximo}% ($${(
                              (state.alimento.precioBase * obj.alimento.precioMaximo) /
                              100
                            ).toFixed(2)})`}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={ECON_CONSTANTS.precioMaximoSinTope}
                    step={5}
                    value={obj.alimento.precioMaximo}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateLevers((p) => ({
                        ...p,
                        alimento: { ...p.alimento, precioMaximo: val },
                      }));
                    }}
                    className="w-full"
                  />
                  <p className="text-[11px] text-slate-400">
                    Si el tope queda por debajo del precio de mercado, la productora puede recortar sueldos, despedir o restringir margen.
                  </p>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Garantía alimentaria estatal</span>
                    <span className="flex items-center gap-2 font-mono tabular-nums">
                      <PendingHint
                        inicio={ini.alimento.garantiaAlimentaria}
                        vigente={vig.alimento.garantiaAlimentaria}
                        objetivo={obj.alimento.garantiaAlimentaria}
                        min={0}
                        max={100}
                        diasEnPeriodo={diasPer}
                      />
                      <span className="text-sm font-bold text-teal-300">
                        {obj.alimento.garantiaAlimentaria}%
                      </span>
                    </span>
                  </div>
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
                  <p className="text-[11px] text-slate-400">
                    Cubre a quienes no alcanzan a comprar alimento con su dinero, con costo para el Estado.
                  </p>
                </div>
              </div>

              {/* Enterprises & Pantries */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Empresas y despensas</span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    Despensa media {derived.despensaMediaDias.toFixed(1)}d · Sin liquidez {derived.sinDineroPct}%
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  {[
                    {
                      key: 'alimento',
                      label: 'Productora de Alimento',
                      ent: state.empresas.alimento,
                    },
                    ...state.empresas.comerciales.map((c, idx) => ({
                      key: c.id,
                      label: `Comercio #${idx + 1}`,
                      ent: c,
                    })),
                  ].map(({ key, label, ent }) => {
                    const owner = ent.dueno
                      ? state.npcs.find((n) => n.id === ent.dueno && n.vivo)?.nombre || 'Sin dueño'
                      : 'Vacante';
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 bg-slate-800/45 border border-slate-800 rounded px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-100 truncate">
                            {label} <span className="font-normal text-slate-400">({owner})</span>
                          </div>
                          {ent.respuesta && (
                            <div className="text-[10px] text-amber-300">
                              Respuesta: {ent.respuesta.tipo.replace('_', ' ')} ({ent.respuesta.diasRestantes}d)
                            </div>
                          )}
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div
                            className={
                              ent.ultimaGanancia >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'
                            }
                          >
                            {ent.ultimaGanancia >= 0 ? '+' : ''}${ent.ultimaGanancia.toFixed(0)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Sueldos ${ent.ultimoSueldosPeriodo.toFixed(0)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trade */}
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Comercio exterior</span>
                  <span className="flex items-center gap-2 font-mono font-semibold text-white tabular-nums">
                    <PendingHint
                      inicio={ini.alimento.intercambio}
                      vigente={vig.alimento.intercambio}
                      objetivo={obj.alimento.intercambio}
                      min={-100}
                      max={100}
                      diasEnPeriodo={diasPer}
                      unit=""
                    />
                    <span>
                      {obj.alimento.intercambio > 0
                        ? `Importar +${obj.alimento.intercambio}%`
                        : obj.alimento.intercambio < 0
                        ? `Exportar ${Math.abs(obj.alimento.intercambio)}%`
                        : 'Cerrado (0)'}
                    </span>
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
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                      obj.alimento.intercambio < -15
                        ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
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
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                      obj.alimento.intercambio >= -15 && obj.alimento.intercambio <= 15
                        ? 'bg-teal-700 border-teal-400 text-white'
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
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                      obj.alimento.intercambio > 15
                        ? 'bg-amber-600/25 border-amber-400 text-amber-200'
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
                  Capacidad comercial: <strong className="text-slate-200">{Math.round(state.gobierno.coberturas.comercio * 100)}%</strong> · Comprar debita de caja al contado.
                </p>
              </div>

              {(activeFenomenos.length > 0 || announcedFenomenos.length > 0) && (
                <div className="pt-3 border-t border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                    <CloudRain className="w-3.5 h-3.5" />
                    Clima y amenazas en curso
                  </div>
                  {activeFenomenos.map((f) => (
                    <div key={f.id} className="text-slate-300">
                      • <strong className="text-white">{f.nombre}</strong> ({Math.round(f.intensidad)}%)
                      {f.origen ? ` en zona ${f.origen}` : ''}
                    </div>
                  ))}
                  {announcedFenomenos.map((f) => (
                    <div key={f.id} className="text-slate-400">
                      • Aviso: {f.nombre} en {Math.max(1, f.inicioDia - state.reloj.dia)}d
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. CIUDAD UNIFICADA */}
          {section === 'ciudad' && (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-1 bg-slate-800/70 p-1 rounded border border-slate-700/80 text-[11px]">
                {(
                  [
                    { id: 'alertas', label: `Alertas (${activeAlerts.length})` },
                    { id: 'gaceta', label: 'Gaceta' },
                    { id: 'objetivo', label: 'Objetivo' },
                    { id: 'vecinos', label: 'Vecinos' },
                    { id: 'bitacora', label: 'Bitácora' },
                  ] as Array<{ id: CityTab; label: string }>
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCityTab(t.id)}
                    className={`py-1 px-1 rounded-sm font-semibold transition-colors truncate ${
                      cityTab === t.id ? 'bg-sky-700 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Alertas */}
              {cityTab === 'alertas' && (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {activeAlerts.length === 0 ? (
                    <div className="py-6 text-xs text-slate-400 text-center">
                      La ciudad opera sin alertas críticas ni avisos climáticos activos hoy.
                    </div>
                  ) : (
                    activeAlerts.map((al) => (
                      <div
                        key={al.id}
                        className={`rounded-md p-2.5 border text-xs space-y-1 ${
                          al.severity === 'critica'
                            ? 'bg-rose-950/35 border-rose-700/60'
                            : 'bg-amber-950/30 border-amber-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <AlertTriangle
                              className={`w-3.5 h-3.5 shrink-0 ${
                                al.severity === 'critica' ? 'text-rose-400' : 'text-amber-400'
                              }`}
                            />
                            <span>{al.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {al.district && (
                              <button
                                type="button"
                                onClick={() => onJumpDistrict(al.district!)}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-sm"
                              >
                                Ir
                              </button>
                            )}
                            {al.causalRef && (
                              <button
                                type="button"
                                onClick={() => onInspectCausal(al.title, al.causalRef, al.detail)}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded-sm"
                              >
                                ¿Por qué?
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300">{al.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab: Gaceta & Medios */}
              {cityTab === 'gaceta' && (
                <div className="space-y-3">
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
                    <div className="bg-[#faf6ee] text-slate-900 rounded-md border border-amber-200/40 divide-y divide-stone-300 max-h-[340px] overflow-y-auto">
                      {state.noticias.slice(0, 12).map((article) => (
                        <article key={article.id} className="p-3 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
                            <span className="font-semibold text-stone-900">
                              {article.medioNombre} · {article.autorNombre} · D{article.dia}
                            </span>
                            <span className="font-mono flex items-center gap-1.5">
                              {article.textoOrigen === 'generativo' && (
                                <span className="flex items-center gap-0.5 text-teal-800 font-sans font-semibold">
                                  <Sparkles className="w-3 h-3" />
                                  Gen.
                                </span>
                              )}
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
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300">Presupuesto estatal prensa</span>
                          <span className="flex items-center gap-2 font-mono tabular-nums">
                            <PendingHint
                              inicio={ini.gasto.prensa}
                              vigente={vig.gasto.prensa}
                              objetivo={obj.gasto.prensa}
                              min={0}
                              max={100}
                              diasEnPeriodo={diasPer}
                            />
                            <span className="text-sky-300 font-semibold">{obj.gasto.prensa}%</span>
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
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
                          className="w-full"
                        />
                      </div>

                      <div className="divide-y divide-slate-800 border-t border-slate-800">
                        {state.medios.map((m) => {
                          const target = state.gobierno.prensaObjetivo[m.id] || m.intervencion;
                          return (
                            <div key={m.id} className="py-2.5 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-display font-bold text-white">{m.nombre}</span>
                                <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                                  Cred {Math.round(m.credibilidad)}% · Alc {Math.round(m.alcancePct)}% · Dep {Math.round(m.finanzas.dependenciaPct)}%
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-0.5">
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
                                <div className="space-y-0.5">
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

              {/* Tab: Objetivo */}
              {cityTab === 'objetivo' && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-800/45 border border-slate-800 rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{preset.nombre}</span>
                      <span className="font-mono text-[11px] text-teal-300 tabular-nums">
                        Día {state.reloj.dia}/{preset.victoria.plazoDia ?? 365}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">{preset.victoria.descripcion}</p>
                    <p className="text-[11px] text-rose-300/90">
                      Derrota inmediata: {preset.derrota.descripcion}
                    </p>
                    {state.resultado.victoriaCumplida && (
                      <div className="text-[11px] font-semibold text-emerald-400">
                        Meta cumplida en día {state.resultado.diaVictoria} (modo continuo activo).
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                      Estado de Zonas
                    </div>
                    <div className="space-y-1 font-mono text-[11px] tabular-nums">
                      <div className="grid grid-cols-5 text-[10px] text-slate-400 font-sans border-b border-slate-800 pb-1">
                        <span>Zona</span>
                        <span className="text-right">Defensa</span>
                        <span className="text-right">Orden</span>
                        <span className="text-right">Integridad</span>
                        <span className="text-right">Amenaza</span>
                      </div>
                      {zoneIds.map((z) => {
                        const def = Math.round(derived.defensa[z] ?? 0);
                        const ord = Math.round(derived.orden?.[z] ?? 0);
                        const integ = Math.round(state.gobierno.integridad?.[z] ?? 100);
                        const amen = Math.round(derived.amenazaPercibida[z] ?? 0);
                        return (
                          <div key={z} className="grid grid-cols-5 items-center py-0.5">
                            <span className="font-sans capitalize text-slate-200">{z}</span>
                            <span className={`text-right ${def < 35 ? 'text-rose-400 font-semibold' : 'text-teal-300'}`}>
                              {def}%
                            </span>
                            <span className={`text-right ${ord < 35 ? 'text-amber-400 font-semibold' : 'text-sky-300'}`}>
                              {ord}%
                            </span>
                            <span className={`text-right ${integ < 60 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}`}>
                              {integ}%
                            </span>
                            <span className={`text-right ${amen >= 50 ? 'text-rose-400 font-semibold' : 'text-slate-300'}`}>
                              {amen}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Vecinos & Profesiones */}
              {cityTab === 'vecinos' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">Buscar vecino ({derived.poblacion})</span>
                      <div className="relative flex-1 max-w-[210px]">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1.5" />
                        <input
                          type="text"
                          value={npcQuery}
                          onChange={(e) => setNpcQuery(e.target.value)}
                          placeholder="Nombre, rol o zona…"
                          className="w-full bg-slate-800 border border-slate-700 rounded pl-6 pr-2 py-0.5 text-[11px] text-white placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto divide-y divide-slate-800/80 bg-slate-800/35 border border-slate-800 rounded-md">
                      {state.npcs
                        .filter((n) => n.vivo)
                        .filter((n) => {
                          if (!npcQuery.trim()) return true;
                          const q = npcQuery.toLowerCase();
                          const roleLabel = ROLE_CATALOG[n.rol].nombre.toLowerCase();
                          const z = getEffectiveZone(n, zonesCount);
                          return (
                            n.nombre.toLowerCase().includes(q) ||
                            roleLabel.includes(q) ||
                            z.includes(q)
                          );
                        })
                        .slice(0, 40)
                        .map((n) => {
                          const z = getEffectiveZone(n, zonesCount);
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => onSelectNpc(n.id)}
                              className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-slate-800 text-[11px]"
                            >
                              <span className="truncate text-slate-100">
                                <strong>{n.nombre}</strong>{' '}
                                <span className="text-slate-400">
                                  ({ROLE_CATALOG[n.rol].nombre} · {z})
                                </span>
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-2">
                                S:{Math.round(n.variables.salud)} H:{Math.round(n.variables.hambre)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                      Profesiones (clic para seguir un vecino)
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(ROLE_CATALOG) as RoleId[]).map((rId) => {
                        const def = ROLE_CATALOG[rId];
                        const count = derived.roles[rId];
                        return (
                          <button
                            key={rId}
                            type="button"
                            disabled={count === 0}
                            onClick={() => onSelectRoleSample(rId)}
                            className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-800 disabled:opacity-35 text-left border border-slate-800 text-[11px]"
                          >
                            <span className="flex items-center gap-2 truncate text-slate-200">
                              <span
                                className="w-2 h-2 rounded-sm shrink-0"
                                style={{ backgroundColor: def.color }}
                              />
                              <span className="truncate">{def.nombre}</span>
                            </span>
                            <span className="font-mono text-slate-400 tabular-nums">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Bitácora */}
              {cityTab === 'bitacora' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(['todas', 'caos', 'condicion', 'economia', 'clima', 'prensa'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setLogFilter(c)}
                        className={`px-2 py-0.5 text-[11px] rounded capitalize ${
                          logFilter === c
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {c === 'todas' ? 'Todas' : c === 'condicion' ? 'Condición' : c === 'economia' ? 'Economía' : c}
                      </button>
                    ))}
                  </div>
                  <div className="divide-y divide-slate-800 max-h-[310px] overflow-y-auto pr-1">
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
                          {(entry.simEventId || entry.causa) && (
                            <div className="flex justify-end mt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectCausal(
                                    entry.titulo,
                                    entry.simEventId || entry.causa,
                                    entry.detalle
                                  )
                                }
                                className="flex items-center gap-1 text-[10px] font-semibold text-teal-400 hover:underline"
                              >
                                <GitBranch className="w-3 h-3" />
                                ¿Por qué?
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
