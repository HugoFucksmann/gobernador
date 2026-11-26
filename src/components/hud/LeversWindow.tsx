import React from 'react';
import {
  Building2,
  GraduationCap,
  Lock,
  Newspaper,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  Wheat,
  Wrench,
} from 'lucide-react';
import {
  ECON_CONSTANTS,
  FOREIGN_TRADE_STEPS,
  LEVEL11_CONSTANTS,
  LEVER_BOUNDS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  PRICE_CAP_FACTORS,
} from '../../data/catalogs';
import type { ExtraLeverKey } from '../../engine/gameController';
import {
  daysToSettlement,
  estimatePeriodBudget,
  getActiveBuildings,
  getBuildingJobCaps,
  getObrasTargetJobs,
} from '../../engine/policies';
import {
  CommunityDerived,
  GameState,
  GovernorLevers,
  LeverKey,
  PriceCapMode,
  ServiceLevel,
} from '../../types/game';
import { RctWindow } from './RctWindow';
import { HintIcon, UiTooltip } from './UiTooltip';

interface LeversWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onUpdateLevers: (updater: (prev: GovernorLevers) => GovernorLevers) => void;
  onSetExtraLever?: (key: ExtraLeverKey, value: number) => { ok: boolean; error?: string };
  onOpenBuildPanel?: () => void;
}

interface NumericSliderProps {
  label: string;
  tooltip: string;
  vigente: number;
  objetivo: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: 'green' | 'amber';
  valueLabel?: string;
  vigenteLabel?: string;
  lockNote?: string;
  disabled?: boolean;
  onChange: (val: number) => void;
}

const NumericSlider: React.FC<NumericSliderProps> = ({
  label,
  tooltip,
  vigente,
  objetivo,
  min,
  max,
  step = 1,
  unit = '%',
  accent = 'green',
  valueLabel,
  vigenteLabel,
  lockNote,
  disabled = false,
  onChange,
}) => {
  const pending = Math.abs(objetivo - vigente) >= 0.01;
  const toneClass = accent === 'amber' ? 'text-amber-300' : 'text-emerald-400';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-semibold text-zinc-100">{label}</span>
          <HintIcon text={tooltip} placement="top" />
          {lockNote && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
              <Lock className="w-3 h-3" />
              {lockNote}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-mono tabular-nums shrink-0 text-sm">
          {pending && (
            <span className="text-xs text-amber-300">
              {vigenteLabel ?? `${vigente}${unit}`} →
            </span>
          )}
          <span className={`font-bold ${toneClass}`}>
            {valueLabel ?? `${objetivo}${unit}`}
          </span>
        </span>
      </div>

      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={objetivo}
        disabled={disabled || Boolean(lockNote)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      />
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
  onSetExtraLever,
  onOpenBuildPanel,
}) => {
  const mod = state.config.economiaModulo;
  const govLevel = state.config.nivelGobernador ?? (mod === 'fiscal' ? 'G3' : 'G2');
  const isG0 = govLevel === 'G0' || Boolean(state.config.estadoAutomatico);
  const isG1 = govLevel === 'G1';
  const isG3 = govLevel === 'G3';
  const showTopeEmision = mod === 'fiscal' && isG3;

  const obj = state.gobierno.palancasObjetivo;
  const vig = state.gobierno.palancasVigentes;
  const extrasObj = state.gobierno.extras?.objetivo ?? {
    subsidioAlimento: 0,
    presion: 0,
    acceso: 0,
    nivelEducacion: 0,
  };
  const extrasVig = state.gobierno.extras?.vigentes ?? {
    subsidioAlimento: 0,
    presion: 0,
    acceso: 0,
    nivelEducacion: 0,
  };

  const budget = estimatePeriodBudget(state, obj);
  const vigBudget = estimatePeriodBudget(state, vig);
  const daysLeft = daysToSettlement(state);

  const getLockNote = (lever: LeverKey): string | undefined => {
    const lock = state.bloqueosPalanca.find(
      (b) => b.palanca === lever && state.reloj.dia < b.hastaDia
    );
    return lock ? `D${lock.hastaDia}` : undefined;
  };

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

  const caps = getBuildingJobCaps(
    state.parcelas,
    derived.poblacion,
    obj.nivelObras,
    state.config.poblacionInicial,
    state.gobierno.cuposFijos
  );
  const activeBuildings = getActiveBuildings(state.parcelas);
  const hospitalesCount = activeBuildings.filter((b) => b.tipo === 'hospital').length;
  const campanasCount = activeBuildings.filter((b) => b.tipo === 'hospital_campana').length;
  const comisariasCount = activeBuildings.filter((b) => b.tipo === 'comisaria').length;

  const hasPendingCore =
    Math.abs(obj.impuesto - vig.impuesto) >= 0.01 ||
    Math.abs(obj.ayudaSocial - vig.ayudaSocial) >= 0.01 ||
    Math.abs(obj.garantiaAlimentaria - vig.garantiaAlimentaria) >= 0.01 ||
    (!isG1 &&
      (Math.abs(obj.salarioPublico - vig.salarioPublico) >= 0.01 ||
        Math.abs(obj.prensa - vig.prensa) >= 0.01 ||
        obj.precioMaximo !== vig.precioMaximo ||
        obj.comercioExterior !== vig.comercioExterior ||
        obj.nivelObras !== vig.nivelObras)) ||
    (showTopeEmision && Math.abs(obj.topeEmision - vig.topeEmision) >= 0.01);

  const hasPendingExtras =
    isG3 &&
    (Math.abs(extrasObj.subsidioAlimento - extrasVig.subsidioAlimento) >= 0.01 ||
      Math.abs(extrasObj.presion - extrasVig.presion) >= 0.01 ||
      Math.abs(extrasObj.acceso - extrasVig.acceso) >= 0.01 ||
      Math.abs(extrasObj.nivelEducacion - extrasVig.nivelEducacion) >= 0.01);

  const hasPendingChanges = !isG0 && (hasPendingCore || hasPendingExtras);

  const resetPending = () => {
    if (isG0) return;
    onUpdateLevers(() => ({ ...vig }));
    if (isG3 && onSetExtraLever) {
      onSetExtraLever('subsidioAlimento', extrasVig.subsidioAlimento);
      onSetExtraLever('presion', extrasVig.presion);
      onSetExtraLever('acceso', extrasVig.acceso);
      onSetExtraLever('nivelEducacion', extrasVig.nivelEducacion);
    }
  };

  const priceCapOptions: Array<{ mode: PriceCapMode; label: string; capLabel: string }> = [
    { mode: 'libre', label: 'Libre', capLabel: 'Sin tope' },
    {
      mode: 'moderado',
      label: 'Moderado',
      capLabel: `$${(ECON_CONSTANTS.precioBaseAlimento * (PRICE_CAP_FACTORS.moderado ?? 1.25)).toFixed(2)}`,
    },
    {
      mode: 'estricto',
      label: 'Estricto',
      capLabel: `$${(ECON_CONSTANTS.precioBaseAlimento * (PRICE_CAP_FACTORS.estricto ?? 0.6)).toFixed(2)}`,
    },
  ];

  const obrasTarget = getObrasTargetJobs(derived.poblacion, obj.nivelObras);
  const obrasRow = OBRAS_LEVEL_TABLE[obj.nivelObras];
  const precioLockNote = getLockNote('precioMaximo');
  const tradeLockNote = getLockNote('comercioExterior');
  const obrasLockNote = getLockNote('nivelObras');

  const saldoDelta = budget.saldoEst - vigBudget.saldoEst;
  const budgetTooltip = `Nómina $${budget.nominaEst.toFixed(0)} · Pens. $${budget.pensionesEst.toFixed(0)} · Menores $${budget.comidaMenoresEst.toFixed(0)} · Gar. ~$${budget.garantiaEst.toFixed(0)} · Ayuda $${budget.ayudaSocialEst.toFixed(0)} · Mant. Edif. $${budget.mantenimientoEdificiosEst.toFixed(0)} + Vías $${budget.mantenimientoViasEst.toFixed(0)} · Obras $${budget.operacionObrasEst.toFixed(0)} · Prensa $${budget.prensaEst.toFixed(0)}`;

  return (
    <div className="pointer-events-none fixed top-20 left-4" style={{ zIndex }}>
      <RctWindow
        title="Palancas"
        subtitle={`Cierre en ${daysLeft}d · Rigen mañana`}
        tone="green"
        icon={<SlidersHorizontal className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[520px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-5">
          {(isG0 || isG1) && (
            <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs text-amber-200">
              {state.config.estadoAutomatico
                ? 'Estado automático activo: el gobierno ajusta las palancas solo.'
                : govLevel === 'G0'
                ? 'Modo G0: controles automáticos.'
                : 'Modo G1: impuesto, ayuda, garantía y parcelas.'}
            </div>
          )}

          {/* Budget Summary + Pre-confirm Impact Strip */}
          <UiTooltip text={budgetTooltip} placement="bottom" className="w-full">
            <div className="w-full bg-zinc-800/60 border border-zinc-700/70 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-zinc-300">
                  Proyección ({PERIOD_DAYS}d)
                </span>
                {hasPendingChanges ? (
                  <button
                    type="button"
                    onClick={resetPending}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Revertir
                  </button>
                ) : (
                  <span className="text-zinc-500">Al día</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 font-mono text-sm tabular-nums">
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Ingresos</span>
                  <span className="font-bold text-emerald-400">+${budget.ingresosEst.toFixed(0)}</span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Gastos</span>
                  <span className="font-bold text-zinc-200">-${budget.gastosEst.toFixed(0)}</span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Saldo</span>
                  <span
                    className={`font-bold ${
                      budget.saldoEst >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {budget.saldoEst >= 0 ? '+' : ''}${budget.saldoEst.toFixed(0)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono tabular-nums pt-2 border-t border-zinc-700/60">
                <span>
                  Mant.: Edif. ${budget.mantenimientoEdificiosEst.toFixed(0)} · Vías $
                  {budget.mantenimientoViasEst.toFixed(0)}
                </span>
                {Math.abs(saldoDelta) >= 1 && (
                  <span className={saldoDelta >= 0 ? 'text-emerald-300' : 'text-amber-300'}>
                    Impacto: {saldoDelta >= 0 ? '+' : ''}${saldoDelta.toFixed(0)}/per
                  </span>
                )}
              </div>
            </div>
          </UiTooltip>

          {/* 1. Finanzas */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">Finanzas</h3>

            <NumericSlider
              label="Impuesto"
              tooltip={`Aplica a privados, públicos y firmas. Recaudación est.: +$${budget.ingresosEst.toFixed(0)}/per. Por encima de ${ECON_CONSTANTS.fiscalUmbral}% frena la actividad.`}
              vigente={vig.impuesto}
              objetivo={obj.impuesto}
              min={LEVER_BOUNDS.impuesto.min}
              max={LEVER_BOUNDS.impuesto.max}
              step={LEVER_BOUNDS.impuesto.step}
              lockNote={getLockNote('impuesto')}
              disabled={isG0}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, impuesto: val }))}
            />

            {!isG1 && (
              <NumericSlider
                label="Salario público"
                tooltip={`${publicEmployeesNow}/${budget.totalPublicJobs} puestos · Nómina est.: $${budget.nominaEst.toFixed(0)}/per ($${dailyWagePerEmp.toFixed(2)}/d por empleado).`}
                vigente={vig.salarioPublico}
                objetivo={obj.salarioPublico}
                min={LEVER_BOUNDS.salarioPublico.min}
                max={LEVER_BOUNDS.salarioPublico.max}
                step={LEVER_BOUNDS.salarioPublico.step}
                lockNote={getLockNote('salarioPublico')}
                disabled={isG0}
                valueLabel={`${obj.salarioPublico}%`}
                vigenteLabel={`${vig.salarioPublico}%`}
                onChange={(val) => onUpdateLevers((p) => ({ ...p, salarioPublico: val }))}
              />
            )}

            <NumericSlider
              label="Ayuda social"
              tooltip={`${socialBeneficiaries} beneficiarios (desempleados y jubilados) · Costo est.: $${budget.ayudaSocialEst.toFixed(0)}/per.`}
              vigente={vig.ayudaSocial}
              objetivo={obj.ayudaSocial}
              min={LEVER_BOUNDS.ayudaSocial.min}
              max={LEVER_BOUNDS.ayudaSocial.max}
              step={LEVER_BOUNDS.ayudaSocial.step}
              unit=" $/d"
              accent="amber"
              lockNote={getLockNote('ayudaSocial')}
              disabled={isG0}
              valueLabel={`$${obj.ayudaSocial.toFixed(1)}/d`}
              vigenteLabel={`$${vig.ayudaSocial.toFixed(1)}/d`}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, ayudaSocial: val }))}
            />

            {!isG1 && (
              <NumericSlider
                label="Prensa (pauta)"
                tooltip={`Reparto parejo entre ${state.medios.length} medio(s): $${(obj.prensa / Math.max(1, state.medios.length)).toFixed(1)}/per cada uno.`}
                vigente={vig.prensa}
                objetivo={obj.prensa}
                min={LEVER_BOUNDS.prensa.min}
                max={LEVER_BOUNDS.prensa.max}
                step={LEVER_BOUNDS.prensa.step}
                unit=" $/per"
                accent="green"
                lockNote={getLockNote('prensa')}
                disabled={isG0}
                valueLabel={`$${obj.prensa.toFixed(0)}`}
                vigenteLabel={`$${vig.prensa.toFixed(0)}`}
                onChange={(val) => onUpdateLevers((p) => ({ ...p, prensa: val }))}
              />
            )}

            {showTopeEmision && (
              <NumericSlider
                label="Tope emisión"
                tooltip={`Cubre déficit hasta $${((budget.ingresosEst * obj.topeEmision) / 100).toFixed(0)}/per pero eleva la inflación (actual ${state.gobierno.inflacion.toFixed(1)}%).`}
                vigente={vig.topeEmision}
                objetivo={obj.topeEmision}
                min={LEVER_BOUNDS.topeEmision.min}
                max={LEVER_BOUNDS.topeEmision.max}
                step={LEVER_BOUNDS.topeEmision.step}
                accent="amber"
                lockNote={getLockNote('topeEmision')}
                disabled={isG0}
                onChange={(val) => onUpdateLevers((p) => ({ ...p, topeEmision: val }))}
              />
            )}
          </section>

          {/* 2. Obras y Servicios */}
          <section className="pt-3 border-t border-zinc-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Obras y Servicios</h3>
              {onOpenBuildPanel && (
                <button
                  type="button"
                  onClick={onOpenBuildPanel}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Parcelas ({derived.parcelasLibres})
                </button>
              )}
            </div>

            {!isG1 && (
              <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-white">Nivel de Obras</span>
                    <HintIcon
                      text={`${obrasRow.label}: ${derived.roles.ingeniero}/${obrasTarget} ingenieros · velocidad x${obrasRow.diasObraFactor.toFixed(2)} días · repara vías y edificios.`}
                      placement="top"
                    />
                    {obrasLockNote && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                        <Lock className="w-3 h-3" />
                        {obrasLockNote}
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${
                      state.gobierno.indicadores.infraestructura < 35 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {Math.round(state.gobierno.indicadores.infraestructura)}%
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1.5">
                  {([0, 1, 2, 3, 4, 5] as ServiceLevel[]).map((lvl) => {
                    const row = OBRAS_LEVEL_TABLE[lvl];
                    const selected = obj.nivelObras === lvl;
                    return (
                      <UiTooltip
                        key={lvl}
                        text={`${row.label}: ${row.puestosPct}% puestos · $${row.operacionPeriodo}/per`}
                        placement="top"
                      >
                        <button
                          type="button"
                          disabled={isG0 || Boolean(obrasLockNote)}
                          onClick={() => onUpdateLevers((p) => ({ ...p, nivelObras: lvl }))}
                          className={`w-full py-2 px-1 rounded-xl border text-center transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            selected
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                          }`}
                        >
                          <div className="text-xs font-mono font-bold">N{lvl}</div>
                        </button>
                      </UiTooltip>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <UiTooltip text={`Policías ${derived.roles.policia}/${caps.policia} · Construir en parcelas`} placement="top">
                <div className="w-full bg-zinc-800/50 rounded-xl p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-200 font-semibold">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Comisarías ({comisariasCount})
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {Math.round(state.gobierno.indicadores.seguridad)}%
                  </span>
                </div>
              </UiTooltip>

              <UiTooltip
                text={`Médicos ${derived.roles.medico}/${caps.medico} · Camas ${derived.internados}/${derived.capacidadHospitalTotal}${derived.esperandoCama > 0 ? ` (${derived.esperandoCama} esp.)` : ''}`}
                placement="top"
              >
                <div className="w-full bg-zinc-800/50 rounded-xl p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-200 font-semibold">
                    <Stethoscope className="w-4 h-4 text-rose-400" />
                    Hospitales ({hospitalesCount}{campanasCount > 0 ? `+${campanasCount}` : ''})
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {Math.round(state.gobierno.indicadores.salud)}%
                  </span>
                </div>
              </UiTooltip>
            </div>
          </section>

          {/* 3. Alimento */}
          <section className="pt-3 border-t border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Wheat className="w-4 h-4 text-amber-300" />
                Alimento
              </h3>
              <span className="font-mono text-xs text-zinc-300 tabular-nums">
                {state.alimento.diasStock.toFixed(0)}d · ${state.alimento.precio.toFixed(2)}
              </span>
            </div>

            <NumericSlider
              label="Garantía alimentaria"
              tooltip={`Cubre el faltante a quien no alcanza a comprar (menores siempre 100%). Costo est.: ~$${budget.garantiaEst.toFixed(0)}/per.`}
              vigente={vig.garantiaAlimentaria}
              objetivo={obj.garantiaAlimentaria}
              min={LEVER_BOUNDS.garantiaAlimentaria.min}
              max={LEVER_BOUNDS.garantiaAlimentaria.max}
              step={LEVER_BOUNDS.garantiaAlimentaria.step}
              lockNote={getLockNote('garantiaAlimentaria')}
              disabled={isG0}
              onChange={(val) => onUpdateLevers((p) => ({ ...p, garantiaAlimentaria: val }))}
            />

            {!isG1 && (
              <>
                <div className="space-y-2.5 bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">Precio máximo</span>
                      <HintIcon
                        text="No cuesta presupuesto. Si queda debajo del costo salarial, las firmas productoras recortan sueldos o despiden."
                        placement="top"
                      />
                      {precioLockNote && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                          <Lock className="w-3 h-3" />
                          {precioLockNote}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {priceCapOptions.map((opt) => {
                      const selected = obj.precioMaximo === opt.mode;
                      return (
                        <button
                          key={opt.mode}
                          type="button"
                          disabled={isG0 || Boolean(precioLockNote)}
                          onClick={() => onUpdateLevers((p) => ({ ...p, precioMaximo: opt.mode }))}
                          className={`py-2 px-2.5 rounded-xl border text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            selected
                              ? 'bg-amber-600/85 border-amber-400 text-white'
                              : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                          }`}
                        >
                          <div className="text-xs font-semibold">{opt.label}</div>
                          <div className="text-xs font-mono text-zinc-300">{opt.capLabel}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5 bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">Comercio exterior</span>
                      <HintIcon
                        text={`${activeComerciantes} comerciantes (cap. ${dailyTradeCapacity} u/d). ${
                          obj.comercioExterior > 0
                            ? `Importar cuesta ~$${budget.importCostDiaEst.toFixed(0)}/d de la reserva.`
                            : obj.comercioExterior < 0
                            ? `Exportar vende excedente sobre ${ECON_CONSTANTS.stockMinExportarDias}d directo desde el agro.`
                            : 'Cerrado (0 u/d).'
                        }`}
                        placement="top"
                      />
                      {tradeLockNote && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                          <Lock className="w-3 h-3" />
                          {tradeLockNote}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {FOREIGN_TRADE_STEPS.map((st) => {
                      const selected = obj.comercioExterior === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          disabled={isG0 || Boolean(tradeLockNote)}
                          onClick={() =>
                            onUpdateLevers((p) => ({ ...p, comercioExterior: st.value }))
                          }
                          className={`py-2 px-1 rounded-xl border text-center transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            selected
                              ? st.value > 0
                                ? 'bg-amber-600/85 border-amber-400 text-white'
                                : 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
                          }`}
                        >
                          <div className="text-xs font-semibold truncate">{st.shortLabel}</div>
                          <div className="text-xs font-mono text-zinc-300">
                            {st.value > 0 ? `+${st.value}%` : `${st.value}%`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* 4. Controles G3 avanzados */}
          {isG3 && onSetExtraLever && (
            <section className="pt-3 border-t border-zinc-800 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                <span>Profundidad G3</span>
              </div>

              <NumericSlider
                label="Subsidio al alimento"
                tooltip={`Impulsa +${(LEVEL11_CONSTANTS.subsidioProdPorPunto * 100).toFixed(1)}% producción agro por cada punto porcentual, pagado por el Estado.`}
                vigente={extrasVig.subsidioAlimento}
                objetivo={extrasObj.subsidioAlimento}
                min={0}
                max={30}
                step={1}
                unit="%"
                disabled={isG0}
                onChange={(val) => {
                  onSetExtraLever('subsidioAlimento', val);
                }}
              />

              <NumericSlider
                label="Nivel de educación"
                tooltip={`Acelera progreso escolar (N0–N5). Costo est.: $${(extrasObj.nivelEducacion * derived.poblacion * LEVEL11_CONSTANTS.educCostoPorNpcPeriodo).toFixed(0)}/per.`}
                vigente={extrasVig.nivelEducacion}
                objetivo={extrasObj.nivelEducacion}
                min={0}
                max={5}
                step={1}
                unit=""
                valueLabel={`N${extrasObj.nivelEducacion}`}
                vigenteLabel={`N${extrasVig.nivelEducacion}`}
                disabled={isG0}
                onChange={(val) => {
                  onSetExtraLever('nivelEducacion', val);
                }}
              />

              <div className="pt-2 border-t border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                  <Newspaper className="w-3.5 h-3.5" />
                  <span>Relación con medios (G3)</span>
                </div>

                <NumericSlider
                  label="Acceso oficial a medios"
                  tooltip={`Aumenta alcance y credibilidad mediática; costo $${LEVEL11_CONSTANTS.accesoCostoPorPunto}/punto por período.`}
                  vigente={extrasVig.acceso}
                  objetivo={extrasObj.acceso}
                  min={0}
                  max={100}
                  step={5}
                  disabled={isG0}
                  onChange={(val) => {
                    onSetExtraLever('acceso', val);
                  }}
                />

                <NumericSlider
                  label="Presión editorial"
                  tooltip={`Fuerza afinidad editorial, pero sobre ${LEVEL11_CONSTANTS.presionUmbral}% reduce credibilidad de la prensa.`}
                  vigente={extrasVig.presion}
                  objetivo={extrasObj.presion}
                  min={0}
                  max={100}
                  step={5}
                  accent="amber"
                  disabled={isG0}
                  onChange={(val) => {
                    onSetExtraLever('presion', val);
                  }}
                />
              </div>
            </section>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
