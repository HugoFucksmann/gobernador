import { SCENARIO_PRESETS } from '../data/catalogs';
import {
  CommunityDerived,
  GameState,
  GovernorLevers,
  PublicRoleId,
  WorldConfig,
} from '../types/game';
import { clamp } from './simulation';

export type FiscalStance = 'austeridad' | 'equilibrio' | 'bienestar';

export interface BudgetAllocationSummary {
  servicesPct: number;
  subsidiesPct: number;
  pressPct: number;
  totalAssignedPct: number;
  remainingToReservePct: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  escenarioId: 'elecciones',
  economiaModulo: SCENARIO_PRESETS.elecciones.economiaDefault,
  cantidadMedios: SCENARIO_PRESETS.elecciones.mediosDefault,
  poblacionInicial: SCENARIO_PRESETS.elecciones.poblacionDefault,
  caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
  usarIaGemini: true,
};

export function getBudgetAllocationSummary(levers: GovernorLevers): BudgetAllocationSummary {
  const servicesPct =
    levers.gasto.presupuesto.salud +
    levers.gasto.presupuesto.seguridad +
    levers.gasto.presupuesto.infraestructura +
    levers.gasto.presupuesto.educacion;

  const subsidiesPct = Object.values(levers.gasto.subsidios).reduce((acc, v) => acc + v, 0);
  const pressPct = levers.gasto.prensa;
  const totalAssignedPct = servicesPct + subsidiesPct + pressPct;

  return {
    servicesPct,
    subsidiesPct,
    pressPct,
    totalAssignedPct,
    remainingToReservePct: Math.max(0, 100 - totalAssignedPct),
  };
}

export function setBudgetShareInLevers(
  prev: GovernorLevers,
  setter: (draft: GovernorLevers, clampedVal: number) => void,
  rawVal: number,
  currentVal: number
): GovernorLevers {
  const { totalAssignedPct } = getBudgetAllocationSummary(prev);
  const maxAllowed = currentVal + (100 - totalAssignedPct);
  const clamped = clamp(rawVal, 0, Math.max(0, maxAllowed));
  const next = structuredClone(prev);
  setter(next, clamped);
  return next;
}

export function applyFiscalStanceToLevers(
  prev: GovernorLevers,
  stance: FiscalStance
): GovernorLevers {
  const next = structuredClone(prev);
  if (stance === 'austeridad') {
    next.recaudacion.impuestoUnico = 34;
    next.recaudacion.impuestoGrupo = { agro: 30, industria: 34, comercio: 36, publico: 28 };
    next.gasto.salarioPublico = 85;
  } else if (stance === 'equilibrio') {
    next.recaudacion.impuestoUnico = 26;
    next.recaudacion.impuestoGrupo = { agro: 24, industria: 26, comercio: 28, publico: 22 };
    next.gasto.salarioPublico = 100;
  } else {
    next.recaudacion.impuestoUnico = 18;
    next.recaudacion.impuestoGrupo = { agro: 16, industria: 18, comercio: 22, publico: 15 };
    next.gasto.salarioPublico = 120;
  }
  return next;
}

export function detectActiveFiscalStance(levers: GovernorLevers): FiscalStance | null {
  const tax = levers.recaudacion.impuestoUnico;
  const wage = levers.gasto.salarioPublico;

  if (tax >= 32 && wage <= 90) return 'austeridad';
  if (tax <= 20 && wage >= 115) return 'bienestar';
  if (tax >= 23 && tax <= 29 && wage >= 95 && wage <= 105) return 'equilibrio';
  return null;
}

export function adjustPublicCapInLevers(
  prev: GovernorLevers,
  role: PublicRoleId,
  delta: number
): GovernorLevers {
  return {
    ...prev,
    cupos: {
      ...prev.cupos,
      [role]: clamp(prev.cupos[role] + delta, 0, 25),
    },
  };
}

export function rebalanceMediaIntervention(
  prensaObjetivo: Record<string, { financiamiento: number; regulacion: number }>,
  medioId: string,
  field: 'financiamiento' | 'regulacion',
  value: number
): Record<string, { financiamiento: number; regulacion: number }> | null {
  if (!prensaObjetivo[medioId]) return null;

  const next = structuredClone(prensaObjetivo);
  const clampedValue = clamp(value, 0, 100);

  if (field === 'regulacion') {
    next[medioId].regulacion = clampedValue;
    return next;
  }

  const others = Object.keys(next).filter((id) => id !== medioId);
  if (others.length === 0) {
    next[medioId].financiamiento = 100;
    return next;
  }

  next[medioId].financiamiento = clampedValue;
  const remaining = 100 - clampedValue;
  const currentOtherSum = others.reduce((acc, id) => acc + next[id].financiamiento, 0);

  if (currentOtherSum <= 0) {
    const equal = Math.floor(remaining / others.length);
    others.forEach((id, idx) => {
      next[id].financiamiento = idx === 0 ? remaining - equal * (others.length - 1) : equal;
    });
  } else {
    let assigned = 0;
    others.forEach((id, idx) => {
      if (idx === others.length - 1) {
        next[id].financiamiento = Math.max(0, remaining - assigned);
      } else {
        const share = Math.round((next[id].financiamiento / currentOtherSum) * remaining);
        next[id].financiamiento = share;
        assigned += share;
      }
    });
  }

  return next;
}

export function hasActiveCrisisAlert(state: GameState, derived: CommunityDerived): boolean {
  return (
    state.gobierno.finanzas.impago ||
    derived.descontentosPct > 30 ||
    derived.hambreCriticaPct > 20
  );
}
