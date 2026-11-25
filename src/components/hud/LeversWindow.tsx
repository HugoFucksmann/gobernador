import React from 'react';
import {
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  Wheat,
  Wrench,
} from 'lucide-react';
import {
  ECON_CONSTANTS,
  FISCAL_PERIOD_DAYS,
  FOREIGN_TRADE_STEPS,
  LEVER_BOUNDS,
  PRICE_CAP_FACTORS,
  SCENARIO_PRESETS,
  SERVICE_LEVEL_TABLE,
  SERVICE_LEVER_TO_AREA,
  SERVICE_LEVER_TO_ROLE,
} from '../../data/catalogs';
import {
  daysToSettlement,
  estimatePeriodBudget,
  getServiceTargetJobs,
} from '../../engine/policies';
import {
  CommunityDerived,
  GameState,
  GovernorLevers,
  PriceCapMode,
  ServiceLevel,
  ServiceLeverId,
} from '../../types/game';
import { RctWindow } from './RctWindow';

interface LeversWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onUpdateLevers: (updater: (prev: GovernorLevers) => GovernorLevers) => void;
}

const SERVICE_CARDS: Array<{
  lever: ServiceLeverId;
  title: string;
  effect: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    lever: 'seguridad',
    title: 'Seguridad',
    effect: 'Policías y operación: defensa, orden y menos miedo',
    Icon: Shield,
  },
  {
    lever: 'salud',
    title: 'Salud',
    effect: 'Médicos (camas) y operación: rapidez de cura',
    Icon: Stethoscope,
  },
  {
    lever: 'obras',
    title: 'Obras',
    effect: 'Ingenieros y operación: infraestructura y reparación',
    Icon: Wrench,
  },
];

interface NumericSliderProps {
  label: string;
  hint?: string;
  vigente: number;
  objetivo: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: 'teal' | 'amber' | 'sky';
  valueLabel?: string;
  vigenteLabel?: string;
  costNote?: string;
  onChange: (val: number) => void;
}

const NumericSlider: React.FC<NumericSliderProps> = ({
  label,
  hint,
  vigente,
  objetivo,
  min,
  max,
  step = 1,
  unit = '%',
  accent = 'teal',
  valueLabel,
  vigenteLabel,
  costNote,
  onChange,
}) => {
  const pending = Math.abs(objetivo - vigente) >= 0.01;
  const toneClass =
    accent === 'amber'
      ? 'text-amber-300'
      : accent === 'sky'
      ? 'text-sky-300'
      : 'text-teal-300';

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <div className="min-w-0">
          <span className="font-medium text-slate-200">{label}</span>
          {hint && <span className="text-[10px] text-slate-400 ml-1.5">{hint}</span>}
        </div>
        <span className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
          {pending && (
            <span className="text-[10px] text-amber-300/90">
              hoy {vigenteLabel ?? `${vigente}${unit}`} →
            </span>
          )}
          <span className={`font-semibold ${toneClass}`}>
            {valueLabel ?? `${objetivo}${unit}`}
          </span>
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={objetivo}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-teal-500"
      />

      {costNote && (
        <div className="text-[10px] text-slate-400 font-mono tabular-nums">{costNote}</div>
      )}
    </div>
  );
};

export const LeversWindow: React.FC<LeversWindowProps> = ({
  state,
  derived,
  zIndex,
  onFocus,
  onClose,
  onUpdateLevers,
}) => {
  const mod = state.config.economiaModulo;
  const obj = state.gobierno.palancasObjetivo;
  const vig = state.gobierno.palancasVigentes;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const budget = estimatePeriodBudget(state, obj);
  const daysLeft = daysToSettlement(state);

  const publicEmployeesNow =
    derived.roles.policia +
    derived.roles.medico +
    derived.roles.ingeniero +
    derived.roles.estatal +
    derived.roles.docente;
  const dailyWagePerEmp = (ECON_CONSTANTS.salarioBasePublico * obj.salarioPublico) / 100;
  const socialBeneficiaries = derived.roles.desempleado + derived.roles.jubilado;
  const activeComerciantes = derived.roles.comerciante;
  const dailyTradeCapacity = activeComerciantes * ECON_CONSTANTS.intercambioPorComerciante;

  const hasPendingChanges =
    Math.abs(obj.impuesto - vig.impuesto) >= 0.01 ||
    Math.abs(obj.salarioPublico - vig.salarioPublico) >= 0.01 ||
    Math.abs(obj.ayudaSocial - vig.ayudaSocial) >= 0.01 ||
    Math.abs(obj.garantiaAlimentaria - vig.garantiaAlimentaria) >= 0.01 ||
    Math.abs(obj.prensa - vig.prensa) >= 0.01 ||
    (mod === 'fiscal' && Math.abs(obj.topeEmision - vig.topeEmision) >= 0.01) ||
    obj.precioMaximo !== vig.precioMaximo ||
    obj.comercioExterior !== vig.comercioExterior ||
    obj.servicios.seguridad !== vig.servicios.seguridad ||
    obj.servicios.salud !== vig.servicios.salud ||
    obj.servicios.obras !== vig.servicios.obras;

  const resetPending = () => {
    onUpdateLevers(() => structuredClone(vig));
  };

  const priceCapOptions: Array<{ mode: PriceCapMode; label: string; capLabel: string }> = [
    { mode: 'libre', label: 'Libre', capLabel: 'Sin tope' },
    {
      mode: 'moderado',
      label: 'Moderado',
      capLabel: `Máx $${(state.alimento.precioBase * (PRICE_CAP_FACTORS.moderado ?? 1.25)).toFixed(2)}`,
    },
    {
      mode: 'estricto',
      label: 'Estricto',
      capLabel: `Máx $${(state.alimento.precioBase * (PRICE_CAP_FACTORS.estricto ?? 0.6)).toFixed(2)}`,
    },
  ];

  return (
    <div className="pointer-events-none fixed top-14 left-3" style={{ zIndex }}>
      <RctWindow
        title="Palancas de Gobierno"
        subtitle={`Cierre en ${daysLeft}d · Saldo est. ${budget.saldoEst >= 0 ? '+' : ''}$${budget.saldoEst.toFixed(0)}/per · Rigen mañana`}
        tone="teal"
        icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[540px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-115px)] overflow-y-auto space-y-4">
          {/* Top Period Budget Projection Strip */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-md p-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-slate-200">
                Proyección por período ({FISCAL_PERIOD_DAYS}d · cierre en {daysLeft}d)
              </span>
              {hasPendingChanges ? (
                <button
                  type="button"
                  onClick={resetPending}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-500/40 rounded"
                >
                  <RotateCcw className="w-3 h-3" />
                  Revertir pendientes
                </button>
              ) : (
                <span className="text-[10px] text-slate-400">Sin cambios pendientes</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums pt-0.5">
              <div>
                <span className="font-sans text-[10px] text-slate-400 block">Ingresos est.</span>
                <span className="font-semibold text-emerald-400">+${budget.ingresosEst.toFixed(0)}</span>
              </div>
              <div>
                <span className="font-sans text-[10px] text-slate-400 block">Gastos est.</span>
                <span className="font-semibold text-slate-200">-${budget.gastosEst.toFixed(0)}</span>
              </div>
              <div>
                <span className="font-sans text-[10px] text-slate-400 block">Saldo est.</span>
                <span
                  className={`font-semibold ${
                    budget.saldoEst >= 0 ? 'text-teal-300' : 'text-rose-400'
                  }`}
                >
                  {budget.saldoEst >= 0 ? '+' : ''}${budget.saldoEst.toFixed(0)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums">
              Nómina ${budget.nominaEst.toFixed(0)} · Pens. ${budget.pensionesEst.toFixed(0)} · Gar. ~$
              {budget.garantiaEst.toFixed(0)} · Ayuda ${budget.ayudaSocialEst.toFixed(0)} · Op. $
              {budget.operacionEst.toFixed(0)} · Prensa ${budget.prensaEst.toFixed(0)}
            </div>
          </div>

          {/* 1. Finanzas */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <h3 className="text-xs font-bold text-white">1. Finanzas</h3>
              <span className="text-[10px] text-slate-400">
                Impuesto &gt;{ECON_CONSTANTS.fiscalUmbral}% frena actividad
              </span>
            </div>

            <NumericSlider
              label="Impuesto general"
              hint="(privados, públicos y ganancia)"
              vigente={vig.impuesto}
              objetivo={obj.impuesto}
              min={LEVER_BOUNDS.impuesto.min}
              max={LEVER_BOUNDS.impuesto.max}
              step={LEVER_BOUNDS.impuesto.step}
              costNote={`Recaudación est.: +$${budget.ingresosEst.toFixed(0)}/período`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, impuesto: val }))}
            />

            <NumericSlider
              label="Salario público"
              hint={`(${publicEmployeesNow} activos → obj. ${budget.totalPublicJobs})`}
              vigente={vig.salarioPublico}
              objetivo={obj.salarioPublico}
              min={LEVER_BOUNDS.salarioPublico.min}
              max={LEVER_BOUNDS.salarioPublico.max}
              step={LEVER_BOUNDS.salarioPublico.step}
              valueLabel={`${obj.salarioPublico}% ($${dailyWagePerEmp.toFixed(2)}/d)`}
              vigenteLabel={`${vig.salarioPublico}%`}
              costNote={`Nómina proyectada: $${budget.nominaEst.toFixed(0)}/período`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, salarioPublico: val }))}
            />

            <NumericSlider
              label="Ayuda social"
              hint={`(${socialBeneficiaries} beneficiarios: desempleados + jubilados)`}
              vigente={vig.ayudaSocial}
              objetivo={obj.ayudaSocial}
              min={LEVER_BOUNDS.ayudaSocial.min}
              max={LEVER_BOUNDS.ayudaSocial.max}
              step={LEVER_BOUNDS.ayudaSocial.step}
              unit=" $/d"
              accent="amber"
              valueLabel={`$${obj.ayudaSocial.toFixed(1)}/d`}
              vigenteLabel={`$${vig.ayudaSocial.toFixed(1)}/d`}
              costNote={`Costo est.: $${budget.ayudaSocialEst.toFixed(0)}/período`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, ayudaSocial: val }))}
            />

            <NumericSlider
              label="Prensa"
              hint={`(reparto parejo entre ${state.medios.length} medio/s)`}
              vigente={vig.prensa}
              objetivo={obj.prensa}
              min={LEVER_BOUNDS.prensa.min}
              max={LEVER_BOUNDS.prensa.max}
              step={LEVER_BOUNDS.prensa.step}
              unit=" $/per"
              accent="sky"
              valueLabel={`$${obj.prensa.toFixed(0)}/per`}
              vigenteLabel={`$${vig.prensa.toFixed(0)}/per`}
              costNote={`$${(obj.prensa / Math.max(1, state.medios.length)).toFixed(1)}/per por medio`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, prensa: val }))}
            />

            {mod === 'fiscal' && (
              <NumericSlider
                label="Tope emisión monetaria"
                hint="(cubre déficit, eleva inflación)"
                vigente={vig.topeEmision}
                objetivo={obj.topeEmision}
                min={LEVER_BOUNDS.topeEmision.min}
                max={LEVER_BOUNDS.topeEmision.max}
                step={LEVER_BOUNDS.topeEmision.step}
                accent="amber"
                costNote={`Hasta $${((budget.ingresosEst * obj.topeEmision) / 100).toFixed(0)}/per · Inflación actual ${state.gobierno.inflacion.toFixed(1)}%`}
                onChange={(val) => onUpdateLevers((p) => ({ ...p, topeEmision: val }))}
              />
            )}
          </section>

          {/* 2. Servicios */}
          <section className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white">2. Servicios (niveles 0 a 5)</h3>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                Camas {derived.internados}/{derived.camasHospital}
                {derived.esperandoCama > 0 && (
                  <span className="text-rose-400 font-semibold ml-1">· {derived.esperandoCama} esp.</span>
                )}
              </span>
            </div>

            <div className="space-y-2.5">
              {SERVICE_CARDS.map(({ lever, title, effect, Icon }) => {
                const area = SERVICE_LEVER_TO_AREA[lever];
                const role = SERVICE_LEVER_TO_ROLE[lever];
                const indVal = Math.round(state.gobierno.indicadores[area]);
                const activeCount = derived.roles[role];
                const objLevel = obj.servicios[lever];
                const vigLevel = vig.servicios[lever];
                const targetCount = getServiceTargetJobs(derived.poblacion, lever, objLevel);
                const levelRow = SERVICE_LEVEL_TABLE[lever][objLevel];
                const pendingLvl = objLevel !== vigLevel;
                const targetCov =
                  preset.objetivoCobertura?.[role] ?? ECON_CONSTANTS.objetivoCobertura[role];
                const recommended = Math.max(1, Math.round(derived.poblacion * targetCov));

                return (
                  <div
                    key={lever}
                    className="bg-slate-800/45 border border-slate-800 rounded-md p-2.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                          <Icon className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                          <span>{title}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            · {levelRow.label}
                          </span>
                          {pendingLvl && (
                            <span className="text-[10px] font-mono text-amber-300">
                              (hoy N{vigLevel} → N{objLevel})
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">{effect}</p>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div
                          className={`text-[11px] font-bold ${
                            indVal < 35 ? 'text-rose-400' : 'text-teal-300'
                          }`}
                        >
                          Ind. {indVal}%
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {activeCount}/{targetCount} p. (rec. {recommended})
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-1">
                      {([0, 1, 2, 3, 4, 5] as ServiceLevel[]).map((lvl) => {
                        const row = SERVICE_LEVEL_TABLE[lever][lvl];
                        const selected = objLevel === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() =>
                              onUpdateLevers((p) => ({
                                ...p,
                                servicios: { ...p.servicios, [lever]: lvl },
                              }))
                            }
                            title={`${row.label}: ${row.puestosPct}% puestos · $${row.operacionPeriodo}/per`}
                            className={`py-1 px-1 rounded border text-center transition-colors ${
                              selected
                                ? 'bg-teal-700 border-teal-400 text-white'
                                : 'bg-slate-900/70 hover:bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="text-[11px] font-mono font-bold">N{lvl}</div>
                            <div className="text-[9px] text-slate-300/90 font-mono">
                              {row.puestosPct}% · ${row.operacionPeriodo}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
                <span>Puestos fijos por escenario (no editables)</span>
                <span className="font-mono text-slate-300 tabular-nums">
                  Estatales {derived.roles.estatal}/{state.gobierno.cuposFijos.estatal} · Docentes{' '}
                  {derived.roles.docente}/{state.gobierno.cuposFijos.docente}
                </span>
              </div>
            </div>
          </section>

          {/* 3. Alimento */}
          <section className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Wheat className="w-3.5 h-3.5 text-amber-300" />
                3. Alimento
              </h3>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                Stock {state.alimento.diasStock.toFixed(0)}d · Venta ${state.alimento.precio.toFixed(2)} (Mdo $
                {state.alimento.precioMercado.toFixed(2)})
              </span>
            </div>

            <NumericSlider
              label="Garantía alimentaria"
              hint="(cubre faltante a quien no llega; menores siempre 100%)"
              vigente={vig.garantiaAlimentaria}
              objetivo={obj.garantiaAlimentaria}
              min={LEVER_BOUNDS.garantiaAlimentaria.min}
              max={LEVER_BOUNDS.garantiaAlimentaria.max}
              step={LEVER_BOUNDS.garantiaAlimentaria.step}
              costNote={`Gasto obligatorio est.: ~$${budget.garantiaEst.toFixed(0)}/período`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, garantiaAlimentaria: val }))}
            />

            <div className="space-y-1.5 bg-slate-800/40 border border-slate-800 rounded-md p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Precio máximo</span>
                <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                  {obj.precioMaximo !== vig.precioMaximo ? `hoy ${vig.precioMaximo} → ` : ''}
                  {obj.precioMaximo}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {priceCapOptions.map((opt) => {
                  const selected = obj.precioMaximo === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => onUpdateLevers((p) => ({ ...p, precioMaximo: opt.mode }))}
                      className={`py-1.5 px-2 rounded border text-left transition-colors ${
                        selected
                          ? 'bg-amber-700/80 border-amber-400 text-white'
                          : 'bg-slate-900/70 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{opt.label}</div>
                      <div className="text-[10px] font-mono text-slate-300">{opt.capLabel}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400">
                No cuesta presupuesto; si queda bajo el costo salarial, la productora recorta sueldos o despide.
              </p>
            </div>

            <div className="space-y-1.5 bg-slate-800/40 border border-slate-800 rounded-md p-2.5">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white">Comercio exterior</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">
                    ({activeComerciantes} com. · cap. {dailyTradeCapacity} u/d)
                  </span>
                </div>
                <span className="font-mono text-[11px] text-teal-300 tabular-nums">
                  {obj.comercioExterior !== vig.comercioExterior
                    ? `hoy ${vig.comercioExterior}% → `
                    : ''}
                  {obj.comercioExterior > 0 ? `+${obj.comercioExterior}%` : `${obj.comercioExterior}%`}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {FOREIGN_TRADE_STEPS.map((st) => {
                  const selected = obj.comercioExterior === st.value;
                  return (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() =>
                        onUpdateLevers((p) => ({ ...p, comercioExterior: st.value }))
                      }
                      className={`py-1.5 px-1 rounded border text-center transition-colors ${
                        selected
                          ? st.value > 0
                            ? 'bg-amber-700/80 border-amber-400 text-white'
                            : st.value < 0
                            ? 'bg-emerald-700/80 border-emerald-400 text-white'
                            : 'bg-teal-700 border-teal-400 text-white'
                          : 'bg-slate-900/70 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="text-[10px] font-semibold truncate">{st.shortLabel}</div>
                      <div className="text-[9px] font-mono text-slate-300">
                        {st.value > 0 ? `+${st.value}%` : `${st.value}%`}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                {obj.comercioExterior > 0
                  ? `Importar cuesta ~$${budget.importCostDiaEst.toFixed(0)}/d de la reserva estatal`
                  : obj.comercioExterior < 0
                  ? `Exportar vende excedente sobre ${ECON_CONSTANTS.stockMinExportarDias}d de stock directo a la Productora`
                  : 'Comercio exterior cerrado (0 u/d)'}
              </div>
            </div>
          </section>
        </div>
      </RctWindow>
    </div>
  );
};
