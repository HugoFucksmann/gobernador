import {
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  HOUSING_CONSTANTS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  BuildingInstance,
  CommunityDerived,
  GameState,
  GovernorLevers,
  Parcela,
  RoleId,
  ServiceAreaId,
  ServiceLevel,
  ServicePublicRoleId,
  ViaTramo,
  WorldConfig,
} from '../types/game';

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  escenarioId: 'elecciones',
  economiaModulo: 'base',
  nivelMundo: 'M3',
  nivelGobernador: 'G0',
  estadoAutomatico: true,
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
  mantenimientoViasEst: number;
  mantenimientoEdificiosEst: number;
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

export function sumPeriodExpenses(fin: GameState['gobierno']['finanzas']): number {
  return (
    fin.nomina +
    fin.pensiones +
    fin.comidaMenores +
    (fin.acogidaMenores ?? 0) +
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
  return Math.max(1, poblacionInicial / 100);
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

export function getBuildingRoleCapacity(b: BuildingInstance): Partial<Record<RoleId, number>> {
  const def = BUILDING_CATALOG[b.tipo];
  if (!def) return Object.create(null);
  const healthFactor = b.estadoSalud < 40 ? 0.5 : 1;
  const result: Partial<Record<RoleId, number>> = Object.create(null);
  for (const [role, count] of Object.entries(def.puestos)) {
    if (typeof count === 'number' && count > 0) {
      result[role as RoleId] = Math.max(1, Math.round(count * healthFactor));
    }
  }
  return result;
}

export function getBuildingJobCaps(
  parcelas: Parcela[],
  population: number,
  nivelObras: ServiceLevel,
  _poblacionInicial: number,
  cuposFijosBase?: { estatal: number; docente: number }
): {
  policia: number;
  medico: number;
  ingeniero: number;
  estatal: number;
  docente: number;
  agricultor: number;
  tecnico: number;
  obrero: number;
  comerciante: number;
  constructor: number;
  inmobiliario: number;
  periodista: number;
} {
  let policia = 0;
  let medico = 0;
  let estatal = 0;
  let docente = 0;
  let agricultor = 0;
  let tecnico = 0;
  let obrero = 0;
  let comerciante = 0;
  let constructor = 0;
  let inmobiliario = 0;
  let periodista = 0;
  let oficinaCount = 0;
  let escuelaCount = 0;

  for (const b of getActiveBuildings(parcelas)) {
    const caps = getBuildingRoleCapacity(b);
    if (b.tipo === 'oficina_publica') oficinaCount++;
    if (b.tipo === 'escuela') escuelaCount++;

    policia += caps.policia ?? 0;
    medico += caps.medico ?? 0;
    estatal += caps.estatal ?? 0;
    docente += caps.docente ?? 0;
    agricultor += caps.agricultor ?? 0;
    tecnico += caps.tecnico ?? 0;
    obrero += caps.obrero ?? 0;
    comerciante += caps.comerciante ?? 0;
    constructor += Object.hasOwn(caps, 'constructor') && typeof caps.constructor === 'number' ? caps.constructor : 0;
    inmobiliario += caps.inmobiliario ?? 0;
    periodista += caps.periodista ?? 0;
  }

  const baseOficinaCap = BUILDING_CATALOG.oficina_publica.puestos.estatal ?? 4;
  const baseEscuelaCap = BUILDING_CATALOG.escuela.puestos.docente ?? 4;
  const estatalTotal =
    oficinaCount === 0
      ? 0
      : cuposFijosBase?.estatal !== undefined
      ? Math.max(0, cuposFijosBase.estatal + Math.max(0, estatal - baseOficinaCap))
      : estatal;
  const docenteTotal =
    escuelaCount === 0
      ? 0
      : cuposFijosBase?.docente !== undefined
      ? Math.max(0, cuposFijosBase.docente + Math.max(0, docente - baseEscuelaCap))
      : docente;

  return {
    policia,
    medico,
    ingeniero: getObrasTargetJobs(population, nivelObras),
    estatal: estatalTotal,
    docente: docenteTotal,
    agricultor,
    tecnico,
    obrero,
    comerciante,
    constructor,
    inmobiliario,
    periodista,
  };
}

export function computeMaintenanceBreakdown(
  parcelas: Parcela[],
  nivelObras: ServiceLevel,
  vivosCount: number,
  _poblacionInicial: number,
  tramos: ViaTramo[] = []
): {
  mantenimientoPorArea: Record<ServiceAreaId, number>;
  mantenimientoEdificios: number;
  mantenimientoVias: number;
  mantenimientoTotal: number;
  operacionObras: number;
  operacionTotal: number;
} {
  const mantenimientoPorArea: Record<ServiceAreaId, number> = {
    seguridad: 0,
    salud: 0,
    infraestructura: 0,
  };

  for (const b of getActiveBuildings(parcelas)) {
    const def = BUILDING_CATALOG[b.tipo];
    if (
      (def.categoria === 'publico' || def.categoria === 'suceso') &&
      def.mantenimientoPeriodo > 0 &&
      def.areaServicio
    ) {
      mantenimientoPorArea[def.areaServicio] += def.mantenimientoPeriodo;
    }
  }

  const mantenimientoEdificios =
    mantenimientoPorArea.seguridad +
    mantenimientoPorArea.salud +
    mantenimientoPorArea.infraestructura;

  let mantenimientoVias = 0;
  for (const t of tramos) {
    if (t.construida && t.mantenimientoPeriodo > 0) {
      mantenimientoVias += t.mantenimientoPeriodo;
    }
  }
  mantenimientoPorArea.infraestructura += mantenimientoVias;

  const mantenimientoTotal = mantenimientoEdificios + mantenimientoVias;
  const operacionObras = (OBRAS_LEVEL_TABLE[nivelObras].operacionPeriodo * Math.max(1, vivosCount)) / 100;
  mantenimientoPorArea.infraestructura += operacionObras;

  return {
    mantenimientoPorArea,
    mantenimientoEdificios: Number(mantenimientoEdificios.toFixed(2)),
    mantenimientoVias: Number(mantenimientoVias.toFixed(2)),
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
  let acogidaMinors = 0;
  let baseTaxableGrossDia = 0;

  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const firmaById = new Map(state.firmas.map((f) => [f.id, f]));

  for (const h of state.hogares) {
    if (h.estado === 'acogida') acogidaMinors += h.miembros.length;
  }

  for (const n of vivos) {
    if (n.rol === 'jubilado') jubilados++;
    if (n.rol === 'desempleado') desempleados++;
    if (n.rol === 'comerciante') comerciantes++;

    const def = ROLE_CATALOG[n.rol];
    if (def.grupo === 'publico') {
      baseTaxableGrossDia += ECON_CONSTANTS.salarioBasePublico * (levers.salarioPublico / 100);
    } else if (def.grupo === 'privado') {
      const f = n.empleadorId ? firmaById.get(n.empleadorId) : undefined;
      const factor = f ? f.factor : 1;
      if (def.ingreso) {
        baseTaxableGrossDia +=
          (def.ingreso[0] + (n.economia.ingresoPos / 100) * (def.ingreso[1] - def.ingreso[0])) *
          0.65 *
          factor;
      }
    }
    if (n.partes && n.partes.length > 0) {
      for (const part of n.partes) {
        const f = firmaById.get(part.firmaId);
        if (f && f.ultimaGanancia > 0) {
          baseTaxableGrossDia += ((f.ultimaGanancia * (part.pct / 100)) * 0.65) / PERIOD_DAYS;
        }
      }
    }
  }

  // Taxable rents received by household/npc owners
  for (const c of state.casas) {
    if (c.hogarId && (c.dueno.tipo === 'hogar' || c.dueno.tipo === 'npc')) {
      const occ = hogarById.get(c.hogarId);
      if (occ) {
        const isSelfOwned =
          (c.dueno.tipo === 'hogar' && c.dueno.id === occ.id) ||
          (c.dueno.tipo === 'npc' && occ.miembros.includes(c.dueno.id));
        if (!isSelfOwned) {
          baseTaxableGrossDia += c.alquiler / PERIOD_DAYS;
        }
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
    state.config.poblacionInicial,
    state.tramos ?? []
  );
  const mantenimientoEst = opBreakdown.mantenimientoTotal;
  const mantenimientoViasEst = opBreakdown.mantenimientoVias;
  const mantenimientoEdificiosEst = opBreakdown.mantenimientoEdificios;
  const operacionObrasEst = opBreakdown.operacionObras;
  const operacionEst = opBreakdown.operacionTotal;

  const comidaMenoresEst =
    acum.dias > 0
      ? (acum.comidaMenores / acum.dias) * PERIOD_DAYS
      : fin.comidaMenores > 0
      ? fin.comidaMenores
      : acogidaMinors *
        (state.alimento.precio * ECON_CONSTANTS.consumoPorNpc + HOUSING_CONSTANTS.costoAcogidaMenorDia) *
        PERIOD_DAYS;

  let garantiaEst = 0;
  if (acum.dias > 0 && acum.garantiaAlimentaria > 0) {
    const baseGar = (acum.garantiaAlimentaria / acum.dias) * PERIOD_DAYS;
    garantiaEst =
      vig.garantiaAlimentaria > 0
        ? baseGar * (levers.garantiaAlimentaria / vig.garantiaAlimentaria)
        : baseGar * (levers.garantiaAlimentaria / 100);
  } else if (fin.garantiaAlimentaria > 0) {
    garantiaEst =
      vig.garantiaAlimentaria > 0
        ? fin.garantiaAlimentaria * (levers.garantiaAlimentaria / vig.garantiaAlimentaria)
        : fin.garantiaAlimentaria * (levers.garantiaAlimentaria / 100);
  }

  const prensaEst = state.medios.some((m) => m.activa !== false) ? levers.prensa : 0;

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
    mantenimientoViasEst: Number(mantenimientoViasEst.toFixed(1)),
    mantenimientoEdificiosEst: Number(mantenimientoEdificiosEst.toFixed(1)),
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
    derived.callePct > 15 ||
    state.demandasActivas.length > 0
  );
}
