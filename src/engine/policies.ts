import {
  ECON_CONSTANTS,
  FISCAL_PERIOD_DAYS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
  SERVICE_LEVEL_TABLE,
} from '../data/catalogs';
import {
  CommunityDerived,
  GameState,
  GovernorLevers,
  ServiceLevel,
  ServiceLeverId,
  ServicePublicRoleId,
  WorldConfig,
} from '../types/game';

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  escenarioId: 'elecciones',
  economiaModulo: SCENARIO_PRESETS.elecciones.economiaDefault,
  cantidadMedios: SCENARIO_PRESETS.elecciones.mediosDefault,
  poblacionInicial: SCENARIO_PRESETS.elecciones.poblacionDefault,
  caos: { ...SCENARIO_PRESETS.elecciones.caosDefault },
  semilla: 1,
  usarIaGemini: false,
};

export interface PeriodBudgetEstimate {
  ingresosEst: number;
  nominaEst: number;
  pensionesEst: number;
  garantiaEst: number;
  ayudaSocialEst: number;
  operacionEst: number;
  prensaEst: number;
  gastosEst: number;
  saldoEst: number;
  importCostDiaEst: number;
  targetJobs: Record<ServicePublicRoleId, number>;
  totalPublicJobs: number;
  daysToSettlement: number;
}

export function daysToSettlement(state: GameState): number {
  return Math.max(1, FISCAL_PERIOD_DAYS - state.reloj.diasEnPeriodoFiscal);
}

export function getServiceTargetJobs(
  population: number,
  lever: ServiceLeverId,
  level: ServiceLevel
): number {
  if (level === 0) return 0;
  return Math.round((Math.max(0, population) * SERVICE_LEVEL_TABLE[lever][level].puestosPct) / 100);
}

export function estimatePeriodBudget(state: GameState, levers: GovernorLevers): PeriodBudgetEstimate {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);
  const vig = state.gobierno.palancasVigentes;
  const acum = state.gobierno.acumuladoPeriodo;
  const fin = state.gobierno.finanzas;

  let jubilados = 0;
  let desempleados = 0;
  let comerciantes = 0;
  let baseTaxableGrossDia = 0;

  for (const n of vivos) {
    if (n.rol === 'jubilado') jubilados++;
    if (n.rol === 'desempleado') desempleados++;
    if (n.rol === 'comerciante') comerciantes++;
    const def = ROLE_CATALOG[n.rol];
    if (def.grupo !== 'sin_ingreso') {
      if (def.publico) {
        baseTaxableGrossDia += ECON_CONSTANTS.salarioBasePublico * (levers.salarioPublico / 100);
      } else if (def.ingreso) {
        baseTaxableGrossDia += (def.ingreso[0] + n.economia.ingresoPos * (def.ingreso[1] - def.ingreso[0])) * 0.78;
      } else if (n.rol === 'empresario' || n.rol === 'comerciante') {
        baseTaxableGrossDia += 14;
      }
    }
  }

  const targetJobs: Record<ServicePublicRoleId, number> = {
    policia: getServiceTargetJobs(pop, 'seguridad', levers.servicios.seguridad),
    medico: getServiceTargetJobs(pop, 'salud', levers.servicios.salud),
    ingeniero: getServiceTargetJobs(pop, 'obras', levers.servicios.obras),
  };

  const fixedJobs = state.gobierno.cuposFijos.estatal + state.gobierno.cuposFijos.docente;
  const totalPublicJobs = targetJobs.policia + targetJobs.medico + targetJobs.ingeniero + fixedJobs;

  const salarioDia = ECON_CONSTANTS.salarioBasePublico * (levers.salarioPublico / 100);
  const nominaEst = totalPublicJobs * salarioDia * FISCAL_PERIOD_DAYS;
  const pensionesEst = jubilados * ECON_CONSTANTS.pensionBase * FISCAL_PERIOD_DAYS;
  const ayudaSocialEst = (desempleados + jubilados) * levers.ayudaSocial * FISCAL_PERIOD_DAYS;

  const opSeg = (SERVICE_LEVEL_TABLE.seguridad[levers.servicios.seguridad].operacionPeriodo * pop) / 100;
  const opSal = (SERVICE_LEVEL_TABLE.salud[levers.servicios.salud].operacionPeriodo * pop) / 100;
  const opObr = (SERVICE_LEVEL_TABLE.obras[levers.servicios.obras].operacionPeriodo * pop) / 100;
  const operacionEst = opSeg + opSal + opObr;

  let garantiaEst = 0;
  if (acum.dias > 0) {
    const baseGar = (acum.garantiaAlimentaria / acum.dias) * FISCAL_PERIOD_DAYS;
    if (vig.garantiaAlimentaria > 0) {
      garantiaEst = baseGar * (levers.garantiaAlimentaria / vig.garantiaAlimentaria);
    } else {
      garantiaEst = baseGar * (0.3 + (levers.garantiaAlimentaria / 100) * 0.7);
    }
  } else if (fin.garantiaAlimentaria > 0) {
    if (vig.garantiaAlimentaria > 0) {
      garantiaEst = fin.garantiaAlimentaria * (levers.garantiaAlimentaria / vig.garantiaAlimentaria);
    } else {
      garantiaEst = fin.garantiaAlimentaria;
    }
  } else {
    // Day 1 preview fallback before first tick accumulates
    const minorsCount = vivos.filter((n) => n.edad < 18).length;
    garantiaEst = minorsCount * state.alimento.precio * FISCAL_PERIOD_DAYS * 0.8;
  }

  const prensaEst = levers.prensa;

  let ingresosEst = 0;
  const taxScale = vig.impuesto > 0 ? levers.impuesto / vig.impuesto : 0;
  if (fin.ingresos > 0) {
    ingresosEst = vig.impuesto > 0 ? fin.ingresos * taxScale : baseTaxableGrossDia * (levers.impuesto / 100) * FISCAL_PERIOD_DAYS;
  } else if (acum.dias > 0 && acum.impuestos > 0) {
    ingresosEst = vig.impuesto > 0 ? (acum.impuestos / acum.dias) * FISCAL_PERIOD_DAYS * taxScale : baseTaxableGrossDia * (levers.impuesto / 100) * FISCAL_PERIOD_DAYS;
  } else {
    ingresosEst = baseTaxableGrossDia * (levers.impuesto / 100) * FISCAL_PERIOD_DAYS;
  }

  const gastosEst = nominaEst + pensionesEst + garantiaEst + ayudaSocialEst + operacionEst + prensaEst;
  const saldoEst = ingresosEst - gastosEst;

  let importCostDiaEst = 0;
  if (levers.comercioExterior > 0 && comerciantes > 0) {
    const capacity = comerciantes * ECON_CONSTANTS.intercambioPorComerciante * (levers.comercioExterior / 100);
    const extPrice = ECON_CONSTANTS.precioBaseAlimento * (1 + state.gobierno.inflacion / 100) * ECON_CONSTANTS.diferencialImportacion;
    importCostDiaEst = capacity * extPrice;
  }

  return {
    ingresosEst: Number(ingresosEst.toFixed(1)),
    nominaEst: Number(nominaEst.toFixed(1)),
    pensionesEst: Number(pensionesEst.toFixed(1)),
    garantiaEst: Number(garantiaEst.toFixed(1)),
    ayudaSocialEst: Number(ayudaSocialEst.toFixed(1)),
    operacionEst: Number(operacionEst.toFixed(1)),
    prensaEst: Number(prensaEst.toFixed(1)),
    gastosEst: Number(gastosEst.toFixed(1)),
    saldoEst: Number(saldoEst.toFixed(1)),
    importCostDiaEst: Number(importCostDiaEst.toFixed(1)),
    targetJobs,
    totalPublicJobs,
    daysToSettlement: daysToSettlement(state),
  };
}

export function hasActiveCrisisAlert(state: GameState, derived: CommunityDerived): boolean {
  return (
    state.gobierno.finanzas.impago ||
    derived.descontentosPct > 30 ||
    derived.hambreCriticaPct > 20 ||
    derived.hospitalOcupacionPct > 100
  );
}
