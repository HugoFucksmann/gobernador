import {
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  BuildingInstance,
  CommunityDerived,
  FiscalLedger,
  GameState,
  GovernorLevers,
  Parcela,
  ServiceAreaId,
  ServiceLevel,
  ServicePublicRoleId,
  WorldConfig,
} from '../types/game';

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  escenarioId: 'elecciones',
  economiaModulo: SCENARIO_PRESETS.elecciones.economiaDefault,
  nivelMundo: SCENARIO_PRESETS.elecciones.economiaDefault === 'fiscal' ? 'M2' : 'M1',
  nivelGobernador: SCENARIO_PRESETS.elecciones.economiaDefault === 'fiscal' ? 'G3' : 'G2',
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
  comidaMenoresEst: number;
  ayudaSocialEst: number;
  mantenimientoEst: number;
  operacionObrasEst: number;
  operacionEst: number;
  prensaEst: number;
  gastosEst: number;
  saldoEst: number;
  importCostDiaEst: number;
  targetJobs: Record<ServicePublicRoleId, number>;
  totalPublicJobs: number;
  daysToSettlement: number;
}

export function sumPeriodExpenses(fin: FiscalLedger): number {
  return (
    fin.nomina +
    fin.pensiones +
    fin.comidaMenores +
    fin.garantiaAlimentaria +
    fin.ayudaSocial +
    fin.operacion +
    (fin.obras ?? 0) +
    (fin.subsidios ?? 0) +
    fin.prensa
  );
}

export function daysToSettlement(state: GameState): number {
  return Math.max(1, PERIOD_DAYS - state.reloj.diasEnPeriodo);
}

export function getDevPopScale(poblacionInicial: number): number {
  return Math.max(0.5, poblacionInicial / 100);
}

export function getObrasTargetJobs(population: number, level: ServiceLevel): number {
  if (level === 0) return 0;
  return Math.max(1, Math.round((Math.max(0, population) * OBRAS_LEVEL_TABLE[level].puestosPct) / 100));
}

export function getActiveBuildings(parcelas: Parcela[]): BuildingInstance[] {
  const list: BuildingInstance[] = [];
  for (const p of parcelas) {
    if (p.edificio && p.edificio.estado === 'ocupada' && p.edificio.activo) {
      list.push(p.edificio);
    }
  }
  return list;
}

export function getBuildingJobCaps(
  parcelas: Parcela[],
  population: number,
  nivelObras: ServiceLevel,
  poblacionInicial: number,
  cuposFijosBase?: { estatal: number; docente: number }
): {
  policia: number;
  medico: number;
  ingeniero: number;
  estatal: number;
  docente: number;
  agricultor: number;
  obrero: number;
  comerciante: number;
} {
  const devScale = getDevPopScale(poblacionInicial);
  let policia = 0;
  let medico = 0;
  let estatal = 0;
  let docente = 0;
  let agricultor = 0;
  let obrero = 0;
  let comerciante = 0;
  let hasEscuela = false;
  let hasOficina = false;

  for (const b of getActiveBuildings(parcelas)) {
    const def = BUILDING_CATALOG[b.tipo];
    if (b.tipo === 'comisaria' && def.puestosRol) {
      policia += Math.round(def.puestosRol * devScale);
    } else if (b.tipo === 'hospital' && def.puestosRol) {
      medico += Math.round(def.puestosRol * devScale);
    } else if (b.tipo === 'oficina_publica' && def.puestosRol) {
      hasOficina = true;
      estatal += Math.round(def.puestosRol * devScale);
    } else if (b.tipo === 'escuela' && def.puestosRol) {
      hasEscuela = true;
      docente += Math.round(def.puestosRol * devScale);
    } else if (b.tipo === 'campo' && def.puestosAgricultor) {
      agricultor += Math.round(def.puestosAgricultor * devScale);
    } else if (b.tipo === 'local_comercio') {
      if (def.puestosObrero) obrero += Math.round(def.puestosObrero * devScale);
      if (def.puestosComerciante) comerciante += Math.round(def.puestosComerciante * devScale);
    }
  }

  return {
    policia,
    medico,
    ingeniero: getObrasTargetJobs(population, nivelObras),
    estatal: hasOficina ? cuposFijosBase?.estatal ?? estatal : 0,
    docente: hasEscuela ? cuposFijosBase?.docente ?? docente : 0,
    agricultor,
    obrero,
    comerciante,
  };
}

export function computeMaintenanceBreakdown(
  parcelas: Parcela[],
  nivelObras: ServiceLevel,
  vivosCount: number,
  poblacionInicial: number
): {
  mantenimientoPorArea: Record<ServiceAreaId, number>;
  mantenimientoTotal: number;
  operacionObras: number;
  operacionTotal: number;
} {
  const devScale = getDevPopScale(poblacionInicial);
  const mantenimientoPorArea: Record<ServiceAreaId, number> = {
    seguridad: 0,
    salud: 0,
    infraestructura: 0,
  };

  for (const b of getActiveBuildings(parcelas)) {
    const def = BUILDING_CATALOG[b.tipo];
    if (def.mantenimientoPeriodo > 0 && def.areaServicio) {
      mantenimientoPorArea[def.areaServicio] += def.mantenimientoPeriodo * devScale;
    }
  }

  const mantenimientoTotal =
    mantenimientoPorArea.seguridad +
    mantenimientoPorArea.salud +
    mantenimientoPorArea.infraestructura;
  const operacionObras = (OBRAS_LEVEL_TABLE[nivelObras].operacionPeriodo * Math.max(1, vivosCount)) / 100;
  mantenimientoPorArea.infraestructura += operacionObras;

  return {
    mantenimientoPorArea,
    mantenimientoTotal: Number(mantenimientoTotal.toFixed(2)),
    operacionObras: Number(operacionObras.toFixed(2)),
    operacionTotal: Number((mantenimientoTotal + operacionObras).toFixed(2)),
  };
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
  let minorsCount = 0;
  let baseTaxableGrossDia = 0;

  for (const n of vivos) {
    if (n.edad < 18) minorsCount++;
    if (n.rol === 'jubilado') jubilados++;
    if (n.rol === 'desempleado') desempleados++;
    if (n.rol === 'comerciante') comerciantes++;
    const def = ROLE_CATALOG[n.rol];
    if (def.grupo !== 'sin_ingreso') {
      if (def.publico) {
        baseTaxableGrossDia += ECON_CONSTANTS.salarioBasePublico * (levers.salarioPublico / 100);
      } else if (def.ingreso) {
        const factor =
          n.rol === 'agricultor' || n.rol === 'tecnico'
            ? state.empresas.alimento.factor
            : n.rol === 'obrero'
            ? state.empresas.comercio.factor
            : 1;
        baseTaxableGrossDia +=
          (def.ingreso[0] + n.economia.ingresoPos * (def.ingreso[1] - def.ingreso[0])) * 0.65 * factor;
      } else if (n.rol === 'empresario') {
        baseTaxableGrossDia += Math.max(0, state.empresas.alimento.ultimaGanancia) / PERIOD_DAYS;
      } else if (n.rol === 'comerciante') {
        const livePartners = Math.max(1, state.empresas.comercio.socios.length);
        baseTaxableGrossDia +=
          Math.max(0, state.empresas.comercio.ultimaGanancia) / livePartners / PERIOD_DAYS;
      }
    }
  }

  const buildingCaps = getBuildingJobCaps(
    state.parcelas,
    pop,
    levers.nivelObras,
    state.config.poblacionInicial,
    state.gobierno.cuposFijos
  );

  const targetJobs: Record<ServicePublicRoleId, number> = {
    policia: buildingCaps.policia,
    medico: buildingCaps.medico,
    ingeniero: buildingCaps.ingeniero,
  };

  const totalPublicJobs =
    targetJobs.policia +
    targetJobs.medico +
    targetJobs.ingeniero +
    buildingCaps.estatal +
    buildingCaps.docente;

  const salarioDia = ECON_CONSTANTS.salarioBasePublico * (levers.salarioPublico / 100);
  const nominaEst = totalPublicJobs * salarioDia * PERIOD_DAYS;
  const pensionesEst = jubilados * ECON_CONSTANTS.pensionBase * PERIOD_DAYS;
  const ayudaSocialEst = (desempleados + jubilados) * levers.ayudaSocial * PERIOD_DAYS;

  const opBreakdown = computeMaintenanceBreakdown(
    state.parcelas,
    levers.nivelObras,
    pop,
    state.config.poblacionInicial
  );
  const mantenimientoEst = opBreakdown.mantenimientoTotal;
  const operacionObrasEst = opBreakdown.operacionObras;
  const operacionEst = opBreakdown.operacionTotal;

  const comidaMenoresEst =
    acum.dias > 0
      ? (acum.comidaMenores / acum.dias) * PERIOD_DAYS
      : fin.comidaMenores > 0
      ? fin.comidaMenores
      : minorsCount * state.alimento.precio * ECON_CONSTANTS.consumoPorNpc * PERIOD_DAYS;

  let garantiaEst = 0;
  if (acum.dias > 0 && acum.garantiaAlimentaria > 0) {
    const baseGar = (acum.garantiaAlimentaria / acum.dias) * PERIOD_DAYS;
    if (vig.garantiaAlimentaria > 0) {
      garantiaEst = baseGar * (levers.garantiaAlimentaria / vig.garantiaAlimentaria);
    } else {
      garantiaEst = baseGar * (levers.garantiaAlimentaria / 100);
    }
  } else if (fin.garantiaAlimentaria > 0) {
    if (vig.garantiaAlimentaria > 0) {
      garantiaEst = fin.garantiaAlimentaria * (levers.garantiaAlimentaria / vig.garantiaAlimentaria);
    } else {
      garantiaEst = fin.garantiaAlimentaria * (levers.garantiaAlimentaria / 100);
    }
  }

  const prensaEst = levers.prensa;

  let ingresosEst = 0;
  const taxScale = vig.impuesto > 0 ? levers.impuesto / vig.impuesto : 0;
  if (fin.ingresos > 0) {
    ingresosEst =
      vig.impuesto > 0
        ? fin.ingresos * taxScale
        : baseTaxableGrossDia * (levers.impuesto / 100) * PERIOD_DAYS;
  } else if (acum.dias > 0 && acum.impuestos > 0) {
    ingresosEst =
      vig.impuesto > 0
        ? (acum.impuestos / acum.dias) * PERIOD_DAYS * taxScale
        : baseTaxableGrossDia * (levers.impuesto / 100) * PERIOD_DAYS;
  } else {
    ingresosEst = baseTaxableGrossDia * (levers.impuesto / 100) * PERIOD_DAYS;
  }

  const gastosEst =
    nominaEst + pensionesEst + comidaMenoresEst + garantiaEst + ayudaSocialEst + operacionEst + prensaEst;
  const saldoEst = ingresosEst - gastosEst;

  let importCostDiaEst = 0;
  if (levers.comercioExterior > 0 && comerciantes > 0) {
    const capacity = comerciantes * ECON_CONSTANTS.intercambioPorComerciante * (levers.comercioExterior / 100);
    const extPrice =
      ECON_CONSTANTS.precioBaseAlimento *
      (1 + state.gobierno.inflacion / 100) *
      ECON_CONSTANTS.diferencialImportacion;
    importCostDiaEst = capacity * extPrice;
  }

  return {
    ingresosEst: Number(ingresosEst.toFixed(1)),
    nominaEst: Number(nominaEst.toFixed(1)),
    pensionesEst: Number(pensionesEst.toFixed(1)),
    garantiaEst: Number(garantiaEst.toFixed(1)),
    comidaMenoresEst: Number(comidaMenoresEst.toFixed(1)),
    ayudaSocialEst: Number(ayudaSocialEst.toFixed(1)),
    mantenimientoEst: Number(mantenimientoEst.toFixed(1)),
    operacionObrasEst: Number(operacionObrasEst.toFixed(1)),
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
    derived.hospitalOcupacionPct > 100 ||
    state.demandasActivas.length > 0
  );
}
