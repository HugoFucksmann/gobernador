import React from 'react';
import { Info } from 'lucide-react';
import {
  ECON_CONSTANTS,
  LEVER_MAX_CHANGE_PCT,
  PUBLIC_ROLES,
  ROLE_CATALOG,
  ROLE_GROUPS,
} from '../data/catalogs';
import {
  CommunityDerived,
  GameState,
  GovernorLevers as GovernorLeversType,
  PublicRoleId,
  RoleGroupId,
  ServiceAreaId,
  TaxableGroupId,
} from '../types/game';

interface GovernorLeversProps {
  state: GameState;
  derived: CommunityDerived;
  onUpdateLevers: (updater: (prev: GovernorLeversType) => GovernorLeversType) => void;
  onUpdateMediaIntervention: (medioId: string, field: 'financiamiento' | 'regulacion', value: number) => void;
}

const SERVICE_LABELS: Record<ServiceAreaId, { nombre: string; efecto: string }> = {
  salud: { nombre: 'Salud', efecto: 'Recuperación sanitaria y resistencia a pandemias' },
  seguridad: { nombre: 'Seguridad', efecto: 'Reduce miedo y bajas en brotes' },
  infraestructura: { nombre: 'Infraestructura', efecto: 'Eleva productividad general' },
  educacion: { nombre: 'Educación', efecto: 'Acelera progreso escolar de menores' },
};

export const GovernorLevers: React.FC<GovernorLeversProps> = ({
  state,
  derived,
  onUpdateLevers,
  onUpdateMediaIntervention,
}) => {
  const mod = state.config.economiaModulo;
  const obj = state.gobierno.palancasObjetivo;
  const vig = state.gobierno.palancasVigentes;

  const totalBudgetPct =
    obj.gasto.presupuesto.salud +
    obj.gasto.presupuesto.seguridad +
    obj.gasto.presupuesto.infraestructura +
    obj.gasto.presupuesto.educacion +
    obj.gasto.prensa +
    obj.gasto.subsidios.agro +
    obj.gasto.subsidios.industria +
    obj.gasto.subsidios.comercio +
    obj.gasto.subsidios.publico +
    obj.gasto.subsidios.sin_ingreso;

  const remainingToReserve = Math.max(0, 100 - totalBudgetPct);

  const setBudgetShare = (setter: (draft: GovernorLeversType, clampedVal: number) => void, rawVal: number, currentVal: number) => {
    const maxAllowed = currentVal + (100 - totalBudgetPct);
    const clamped = Math.max(0, Math.min(maxAllowed, rawVal));
    onUpdateLevers((prev) => {
      const next = structuredClone(prev);
      setter(next, clamped);
      return next;
    });
  };

  const renderTargetVsActive = (vVal: number, oVal: number, suffix = '%') => {
    if (Math.abs(vVal - oVal) < 0.5) return null;
    return (
      <span className="text-[11px] font-mono text-amber-700 ml-1.5">
        (vigente: {Math.round(vVal)}
        {suffix})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Info className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            Las palancas fijan condiciones para el cierre fiscal (cada 7 días). Por inercia administrativa, cada ajuste avanza hasta{' '}
            <strong className="text-slate-900">±{LEVER_MAX_CHANGE_PCT}% del rango</strong> por período.
          </span>
        </div>
        <div className="text-xs font-mono text-slate-700 tabular-nums">
          Módulo activo: <strong className="text-slate-900">{mod}</strong> · Disponible est./sem:{' '}
          <strong className={state.ultimaSalidaEconomica.disponibleDiarioEstimado * 7 < 0 ? 'text-rose-700' : 'text-emerald-700'}>
            ${Math.round(state.ultimaSalidaEconomica.disponibleDiarioEstimado * 7)}
          </strong>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Recaudación, Salario y Finanzas */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recaudación y nómina</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Impuestos (0–60%) y salario público ({ECON_CONSTANTS.salarioBasePublico} base).
            </p>
          </div>

          {mod === 'simple' ? (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="tax-unique" className="font-medium text-slate-700">
                  Impuesto único
                  {renderTargetVsActive(vig.recaudacion.impuestoUnico, obj.recaudacion.impuestoUnico)}
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {obj.recaudacion.impuestoUnico}%
                </span>
              </div>
              <input
                id="tax-unique"
                type="range"
                min={0}
                max={60}
                value={obj.recaudacion.impuestoUnico}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateLevers((p) => ({
                    ...p,
                    recaudacion: { ...p.recaudacion, impuestoUnico: val },
                  }));
                }}
                className="w-full"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Por encima de 40% reduce la productividad laboral.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(
                [
                  { id: 'agro', label: 'Impuesto Agro (agricultores)' },
                  { id: 'industria', label: 'Impuesto Industria (obreros y técnicos)' },
                  { id: 'comercio', label: 'Impuesto Comercio y Prensa' },
                  { id: 'publico', label: 'Impuesto Sector Público' },
                ] as Array<{ id: TaxableGroupId; label: string }>
              ).map((g) => (
                <div key={g.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor={`tax-${g.id}`} className="font-medium text-slate-700">
                      {g.label}
                      {renderTargetVsActive(vig.recaudacion.impuestoGrupo[g.id], obj.recaudacion.impuestoGrupo[g.id])}
                    </label>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {obj.recaudacion.impuestoGrupo[g.id]}%
                    </span>
                  </div>
                  <input
                    id={`tax-${g.id}`}
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

          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="salario-pub" className="font-medium text-slate-700">
                Salario público
                {renderTargetVsActive(vig.gasto.salarioPublico, obj.gasto.salarioPublico)}
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {obj.gasto.salarioPublico}% (${((ECON_CONSTANTS.salarioBasePublico * obj.gasto.salarioPublico) / 100).toFixed(1)}/d)
              </span>
            </div>
            <input
              id="salario-pub"
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
            <p className="text-[11px] text-slate-500 mt-1">
              Gasto obligatorio prioritario. No se indexa solo con la inflación.
            </p>
          </div>

          {/* Alimento */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-semibold text-slate-800">Política alimentaria</h3>
            {mod === 'simple' ? (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="racion" className="font-medium text-slate-700">
                    Ración del almacén común
                    {renderTargetVsActive(vig.alimento.racion, obj.alimento.racion)}
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {obj.alimento.racion}%
                  </span>
                </div>
                <input
                  id="racion"
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
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="garantia" className="font-medium text-slate-700">
                    Garantía alimentaria estatal
                    {renderTargetVsActive(vig.alimento.garantiaAlimentaria, obj.alimento.garantiaAlimentaria)}
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {obj.alimento.garantiaAlimentaria}%
                  </span>
                </div>
                <input
                  id="garantia"
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
                <p className="text-[11px] text-slate-500 mt-1">
                  Cubre el % faltante de comida a quienes no llegan a pagarla.
                </p>
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="intercambio" className="font-medium text-slate-700">
                  Intercambio externo
                  {renderTargetVsActive(vig.alimento.intercambio, obj.alimento.intercambio, '')}
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {obj.alimento.intercambio > 0
                    ? `Compra +${obj.alimento.intercambio}`
                    : obj.alimento.intercambio < 0
                    ? `Venta ${obj.alimento.intercambio}`
                    : '0 (neutro)'}
                </span>
              </div>
              <input
                id="intercambio"
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
              <p className="text-[11px] text-slate-500 mt-1">
                Capacidad comercial activa: {Math.round(state.gobierno.coberturas.comercio * 100)}%. Comprar cuesta 30% más que vender.
              </p>
            </div>
          </div>

          {/* Finanzas (only fiscal) */}
          {mod === 'fiscal' && (
            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="emision" className="font-medium text-slate-700">
                  Tope de emisión monetaria
                  {renderTargetVsActive(vig.finanzas.topeEmision, obj.finanzas.topeEmision)}
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {obj.finanzas.topeEmision}%
                </span>
              </div>
              <input
                id="emision"
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
              <p className="text-[11px] text-slate-500 mt-1">
                Autoriza cubrir déficit imprimiendo hasta este % de los ingresos (genera inflación).
              </p>
            </div>
          )}
        </div>

        {/* Column 2: Reparto del Disponible (Presupuesto + Subsidios + Prensa <= 100%) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Reparto del disponible</h2>
              <span className="text-xs font-mono font-semibold text-teal-700 tabular-nums">
                {totalBudgetPct}% asignado · {remainingToReserve}% a reserva
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Todo gasto compite por el mismo disponible semanal (máximo 100%).
            </p>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2 flex">
              <div
                className="h-full bg-teal-600"
                style={{
                  width: `${
                    obj.gasto.presupuesto.salud +
                    obj.gasto.presupuesto.seguridad +
                    obj.gasto.presupuesto.infraestructura +
                    obj.gasto.presupuesto.educacion
                  }%`,
                }}
              />
              <div
                className="h-full bg-amber-500"
                style={{
                  width: `${Object.values(obj.gasto.subsidios).reduce((a, b) => a + b, 0)}%`,
                }}
              />
              <div className="h-full bg-sky-600" style={{ width: `${obj.gasto.prensa}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-800">Presupuesto de servicios</h3>
            {(['salud', 'seguridad', 'infraestructura', 'educacion'] as ServiceAreaId[]).map((area) => (
              <div key={area}>
                <div className="flex justify-between text-xs mb-0.5">
                  <label htmlFor={`area-${area}`} className="font-medium text-slate-700">
                    {SERVICE_LABELS[area].nombre}
                    {renderTargetVsActive(vig.gasto.presupuesto[area], obj.gasto.presupuesto[area])}
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {obj.gasto.presupuesto[area]}%
                  </span>
                </div>
                <input
                  id={`area-${area}`}
                  type="range"
                  min={0}
                  max={60}
                  value={obj.gasto.presupuesto[area]}
                  onChange={(e) =>
                    setBudgetShare(
                      (draft, val) => {
                        draft.gasto.presupuesto[area] = val;
                      },
                      Number(e.target.value),
                      obj.gasto.presupuesto[area]
                    )
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-semibold text-slate-800">
              Subsidios por grupo {mod === 'simple' ? '(suben satisfacción directa)' : '(transferencia de dinero)'}
            </h3>
            {(['sin_ingreso', 'agro', 'industria', 'comercio', 'publico'] as RoleGroupId[]).map((grp) => (
              <div key={grp}>
                <div className="flex justify-between text-xs mb-0.5">
                  <label htmlFor={`sub-${grp}`} className="font-medium text-slate-700">
                    {ROLE_GROUPS[grp].nombre}
                    {renderTargetVsActive(vig.gasto.subsidios[grp], obj.gasto.subsidios[grp])}
                  </label>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {obj.gasto.subsidios[grp]}%
                  </span>
                </div>
                <input
                  id={`sub-${grp}`}
                  type="range"
                  min={0}
                  max={50}
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
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs mb-0.5">
              <label htmlFor="prensa-pct" className="font-medium text-slate-700">
                Financiamiento estatal a prensa
                {renderTargetVsActive(vig.gasto.prensa, obj.gasto.prensa)}
              </label>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">{obj.gasto.prensa}%</span>
            </div>
            <input
              id="prensa-pct"
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
              className="w-full"
            />
          </div>
        </div>

        {/* Column 3: Cupos Públicos y Prensa */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Cupos públicos y prensa</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tope de puestos estatales y regulación/reparto sobre medios privados.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-800">Cupos de empleo público</h3>
            {PUBLIC_ROLES.map((pRole: PublicRoleId) => {
              const def = ROLE_CATALOG[pRole];
              const ocupados = derived.roles[pRole];
              const cupo = obj.cupos[pRole];
              const rec = Math.max(1, Math.round(derived.poblacion * ECON_CONSTANTS.objetivoCobertura[pRole]));
              return (
                <div key={pRole} className="flex items-center justify-between gap-3 text-xs py-1">
                  <div>
                    <div className="font-medium text-slate-800">{def.nombre}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      Ocupados: {ocupados} · Meta cobertura: {rec}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLevers((p) => ({
                          ...p,
                          cupos: { ...p.cupos, [pRole]: Math.max(0, p.cupos[pRole] - 1) },
                        }))
                      }
                      className="w-7 h-7 rounded-md border border-slate-200 hover:bg-slate-50 font-mono text-sm"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono font-semibold text-slate-900 tabular-nums">
                      {cupo}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLevers((p) => ({
                          ...p,
                          cupos: { ...p.cupos, [pRole]: Math.min(25, p.cupos[pRole] + 1) },
                        }))
                      }
                      className="w-7 h-7 rounded-md border border-slate-200 hover:bg-slate-50 font-mono text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-slate-500">
              Subir cupos eleva la nómina y resta trabajadores privados; bajarlos genera desempleo.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h3 className="text-xs font-semibold text-slate-800">Intervención en medios privados</h3>
            {state.medios.map((medio) => {
              const target = state.gobierno.prensaObjetivo[medio.id] || medio.intervencion;
              return (
                <div key={medio.id} className="border border-slate-100 rounded-lg p-3 space-y-2.5 bg-slate-50/70">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">{medio.nombre}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      Cred. {Math.round(medio.credibilidad)}% · Dep. {Math.round(medio.finanzas.dependenciaPct)}%
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span>Cuota financiamiento (reparto 100%)</span>
                      <span className="font-mono font-semibold tabular-nums">{Math.round(target.financiamiento)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      disabled={state.medios.length === 1}
                      value={target.financiamiento}
                      onChange={(e) => onUpdateMediaIntervention(medio.id, 'financiamiento', Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span>Regulación (baja sensacionalismo y credibilidad)</span>
                      <span className="font-mono font-semibold tabular-nums">{Math.round(target.regulacion)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={target.regulacion}
                      onChange={(e) => onUpdateMediaIntervention(medio.id, 'regulacion', Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
