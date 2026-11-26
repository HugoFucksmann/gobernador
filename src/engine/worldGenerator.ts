import {
  DISTRICT_BY_ID,
  ECON_CONSTANTS,
  MEDIA_TEMPLATES,
  PERIOD_DAYS,
  ROLE_CATALOG,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
  SPANISH_NAMES,
} from '../data/catalogs';
import {
  BuildingInstance,
  ClimatePhenomenon,
  EconomyModule,
  GameState,
  GovernorComplexityLevel,
  GovernorLevers,
  MediaOutlet,
  Npc,
  Parcela,
  RoleId,
  ServicePublicRoleId,
  WorldComplexityLevel,
  WorldConfig,
  ZoneId,
} from '../types/game';
import {
  computeMaintenanceBreakdown,
  getBuildingJobCaps,
  getObrasTargetJobs,
} from './policies';
import { nextRand, normalizeSeed, randInt, randRange } from './rng';

interface RngHolder {
  rngState: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function drawRand(rng?: RngHolder): number {
  return rng ? nextRand(rng) : Math.random();
}

export function getZoneCanvasPosition(zone: ZoneId, rng?: RngHolder): { x: number; y: number } {
  const ranges: Record<ZoneId, { x: [number, number]; y: [number, number] }> = {
    centro: { x: [380, 640], y: [250, 535] },
    norte: { x: [45, 860], y: [45, 220] },
    este: { x: [685, 955], y: [180, 535] },
    sur: { x: [45, 640], y: [330, 545] },
    oeste: { x: [35, 330], y: [50, 520] },
  };
  const r = ranges[zone] || ranges.centro;
  return {
    x: r.x[0] + drawRand(rng) * (r.x[1] - r.x[0]),
    y: r.y[0] + drawRand(rng) * (r.y[1] - r.y[0]),
  };
}

export function getDistrictPosition(role: RoleId, rng?: RngHolder): { x: number; y: number } {
  const def = ROLE_CATALOG[role];
  const zone = DISTRICT_BY_ID[def.distrito] || DISTRICT_BY_ID.campos;

  if (role === 'docente' || role === 'estudiante') {
    return {
      x: zone.x + 34 + drawRand(rng) * (zone.w - 68),
      y: zone.y + 62 + drawRand(rng) * 170,
    };
  }
  if (role === 'jubilado' || role === 'desempleado') {
    return {
      x: zone.x + 34 + drawRand(rng) * (zone.w - 68),
      y: zone.y + 245 + drawRand(rng) * (zone.h - 275),
    };
  }
  if (role === 'medico') {
    return {
      x: zone.x + 28 + drawRand(rng) * 115,
      y: zone.y + 65 + drawRand(rng) * (zone.h - 90),
    };
  }
  if (role === 'estatal' || role === 'ingeniero') {
    return {
      x: zone.x + 145 + drawRand(rng) * (zone.w - 175),
      y: zone.y + 65 + drawRand(rng) * (zone.h - 90),
    };
  }

  return {
    x: zone.x + 30 + drawRand(rng) * (zone.w - 60),
    y: zone.y + 56 + drawRand(rng) * (zone.h - 80),
  };
}

export function getCityErrandPosition(
  role: RoleId,
  zone?: ZoneId,
  rng?: RngHolder
): { x: number; y: number; accion: string } {
  if (role === 'policia') {
    if (zone && zone !== 'centro') {
      const zPos = getZoneCanvasPosition(zone, rng);
      return { ...zPos, accion: `patrullando zona ${zone}` };
    }
    const patrolSpots = [
      { x: 355, y: 120 + drawRand(rng) * 340, accion: 'patrullando avenida oeste' },
      { x: 665, y: 120 + drawRand(rng) * 340, accion: 'patrullando avenida este' },
      { x: 140 + drawRand(rng) * 480, y: 295, accion: 'patrullando bulevar central' },
      { x: 430 + drawRand(rng) * 160, y: 140 + drawRand(rng) * 100, accion: 'vigilando la plaza' },
    ];
    return patrolSpots[Math.floor(drawRand(rng) * patrolSpots.length)];
  }

  if (role === 'periodista') {
    const spots = [
      { x: 420 + drawRand(rng) * 180, y: 100 + drawRand(rng) * 140, accion: 'cubriendo la plaza' },
      { x: 420 + drawRand(rng) * 180, y: 360 + drawRand(rng) * 150, accion: 'entrevistando en Centro Cívico' },
      { x: 100 + drawRand(rng) * 200, y: 100 + drawRand(rng) * 140, accion: 'reportando en los campos' },
    ];
    return spots[Math.floor(drawRand(rng) * spots.length)];
  }

  if (drawRand(rng) < 0.28) {
    const plaza = DISTRICT_BY_ID.mercado;
    return {
      x: plaza.x + 36 + drawRand(rng) * (plaza.w - 72),
      y: plaza.y + 62 + drawRand(rng) * (plaza.h - 86),
      accion: 'en el mercado central',
    };
  }

  if (drawRand(rng) < 0.18) {
    const home = DISTRICT_BY_ID.residencial;
    return {
      x: home.x + 36 + drawRand(rng) * (home.w - 72),
      y: home.y + 240 + drawRand(rng) * (home.h - 270),
      accion: 'pasando por su barrio',
    };
  }

  const workPos = getDistrictPosition(role, rng);
  const workAction =
    role === 'estudiante'
      ? 'estudiando en la escuela'
      : role === 'jubilado'
      ? 'paseando por el parque'
      : role === 'desempleado'
      ? 'buscando trabajo'
      : role === 'agricultor'
      ? 'trabajando en los cultivos'
      : role === 'tecnico'
      ? 'tecnificando los campos'
      : role === 'medico'
      ? 'atendiendo en la clínica'
      : role === 'comerciante'
      ? 'atendiendo su comercio'
      : role === 'empresario'
      ? 'gestionando su empresa'
      : 'trabajando';

  return { ...workPos, accion: workAction };
}

export function resolveComplexityConfig(raw: Partial<WorldConfig>): {
  nivelMundo: WorldComplexityLevel;
  nivelGobernador: GovernorComplexityLevel;
  economiaModulo: EconomyModule;
} {
  const preset = SCENARIO_PRESETS[raw.escenarioId ?? 'elecciones'];
  const defaultWorld: WorldComplexityLevel = preset.economiaDefault === 'fiscal' ? 'M2' : 'M1';
  const nivelMundo: WorldComplexityLevel =
    raw.nivelMundo ??
    (raw.economiaModulo === 'fiscal' ? 'M2' : raw.economiaModulo === 'base' ? defaultWorld : defaultWorld);
  const economiaModulo: EconomyModule = nivelMundo === 'M2' ? 'fiscal' : 'base';
  const defaultGov: GovernorComplexityLevel = nivelMundo === 'M2' ? 'G3' : 'G2';
  const nivelGobernador: GovernorComplexityLevel = raw.nivelGobernador ?? defaultGov;
  return { nivelMundo, nivelGobernador, economiaModulo };
}

export function isTestConfig(config: WorldConfig): boolean {
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const { nivelMundo, nivelGobernador, economiaModulo } = resolveComplexityConfig(config);
  const defaultWorld: WorldComplexityLevel = preset.economiaDefault === 'fiscal' ? 'M2' : 'M1';
  if (economiaModulo !== preset.economiaDefault) return true;
  if (nivelMundo !== defaultWorld) return true;
  const defaultGov: GovernorComplexityLevel = defaultWorld === 'M2' ? 'G3' : 'G2';
  if (nivelGobernador !== defaultGov && !(defaultWorld === 'M2' && nivelGobernador === 'G2')) {
    return true;
  }
  if (config.poblacionInicial !== preset.poblacionDefault) return true;
  if (config.cantidadMedios !== preset.mediosDefault) return true;
  const c = config.caos;
  const d = preset.caosDefault;
  return (
    c.maxAccionesPorPeriodo !== d.maxAccionesPorPeriodo ||
    c.periodoDias !== d.periodoDias ||
    c.maxPctRolFueraDePuesto !== d.maxPctRolFueraDePuesto ||
    c.duracionMaxDias !== d.duracionMaxDias ||
    c.respiroSiSatisfaccionMediaMenorA !== d.respiroSiSatisfaccionMediaMenorA
  );
}

export function buildInitialParcelas(
  escenarioId: 'elecciones' | 'zombies',
  nivelMundo: WorldComplexityLevel
): Parcela[] {
  const preset = SCENARIO_PRESETS[escenarioId];
  return preset.parcelas.map((def, idx) => {
    const zona: ZoneId = nivelMundo === 'M0' ? 'centro' : def.zona;
    let edificio: BuildingInstance | null = null;
    if (def.estadoInicial === 'ocupada' && def.edificioInicial) {
      const dueno =
        def.edificioInicial === 'campo'
          ? 'alimento'
          : def.edificioInicial === 'local_comercio'
          ? 'comercio'
          : 'estado';
      edificio = {
        id: `ed_init_${idx + 1}`,
        tipo: def.edificioInicial,
        parcelaId: def.id,
        dueno,
        estado: 'ocupada',
        activo: true,
        diasObraRestantes: 0,
        diasObraTotal: 0,
        zona,
      };
    }
    return {
      id: def.id,
      nombre: def.nombre,
      zona,
      distrito: def.distrito,
      estado: def.estadoInicial,
      edificio,
      wx: def.wx,
      wy: def.wy,
      ww: def.ww,
      wh: def.wh,
      hitoRequerido: def.hitoRequerido,
      orden: idx,
    };
  });
}

export function createInitialGameState(rawConfig: WorldConfig): GameState {
  const semilla = normalizeSeed(rawConfig.semilla);
  const resolved = resolveComplexityConfig(rawConfig);
  const config: WorldConfig = {
    ...rawConfig,
    ...resolved,
    semilla,
  };
  const rng: RngHolder = { rngState: semilla };
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const pop = config.poblacionInicial;
  const scale = pop / 100;

  const parcelas = buildInitialParcelas(config.escenarioId, config.nivelMundo ?? 'M1');
  const cuposFijos = {
    estatal: Math.max(1, Math.round(preset.cuposFijos.estatal * scale)),
    docente: Math.max(1, Math.round(preset.cuposFijos.docente * scale)),
  };

  const initialLevers: GovernorLevers = structuredClone(preset.initialLevers);
  const jobCaps = getBuildingJobCaps(parcelas, pop, initialLevers.nivelObras, pop, cuposFijos);

  // ESTADOS §10 exact composition across all 14 roles (100 NPCs default)
  const baseDistribution: Array<{ rol: RoleId; count: number }> = [
    { rol: 'agricultor', count: jobCaps.agricultor },
    { rol: 'obrero', count: jobCaps.obrero },
    { rol: 'tecnico', count: Math.max(1, Math.round(preset.topesPrivados.tecnico * scale)) },
    { rol: 'comerciante', count: Math.max(2, jobCaps.comerciante) },
    { rol: 'empresario', count: Math.max(1, preset.topesPrivados.empresario) },
    { rol: 'periodista', count: Math.max(config.cantidadMedios, Math.round(preset.topesPrivados.periodista * scale)) },
    { rol: 'policia', count: jobCaps.policia },
    { rol: 'estatal', count: cuposFijos.estatal },
    { rol: 'docente', count: cuposFijos.docente },
    { rol: 'medico', count: jobCaps.medico },
    { rol: 'ingeniero', count: getObrasTargetJobs(pop, initialLevers.nivelObras) },
    { rol: 'estudiante', count: Math.round(12 * scale) },
    { rol: 'jubilado', count: Math.round(10 * scale) },
    { rol: 'desempleado', count: Math.max(1, Math.round(2 * scale)) },
  ];

  const currentTotal = baseDistribution.reduce((acc, item) => acc + item.count, 0);
  if (currentTotal !== pop) {
    // Keep private farmer/worker roles capped by existing buildings, adjust unallocated slack into desempleado/estudiante
    const delta = pop - currentTotal;
    const desIdx = baseDistribution.findIndex((b) => b.rol === 'desempleado');
    if (desIdx >= 0 && baseDistribution[desIdx].count + delta >= 0) {
      baseDistribution[desIdx].count += delta;
    } else {
      baseDistribution[0].count = Math.max(5, baseDistribution[0].count + delta);
    }
  }

  const npcs: Npc[] = [];
  let idx = 0;

  const activeComisariaZones = Array.from(
    new Set(
      parcelas
        .filter((p) => p.estado === 'ocupada' && p.edificio?.activo && p.edificio.tipo === 'comisaria')
        .map((p) => p.zona)
    )
  );

  for (const entry of baseDistribution) {
    const def = ROLE_CATALOG[entry.rol];
    const allowedZones: ZoneId[] =
      config.nivelMundo === 'M0'
        ? ['centro']
        : entry.rol === 'policia' && activeComisariaZones.length > 0
        ? activeComisariaZones
        : preset.zonaPorRol[entry.rol] || ['centro'];
    for (let i = 0; i < entry.count; i++) {
      const id = `npc_${String(idx + 1).padStart(3, '0')}`;
      const baseName = SPANISH_NAMES[idx % SPANISH_NAMES.length];
      const nombre = idx >= SPANISH_NAMES.length ? `${baseName} ${Math.floor(idx / SPANISH_NAMES.length) + 1}` : baseName;
      const zona: ZoneId = config.nivelMundo === 'M0' ? 'centro' : allowedZones[i % allowedZones.length];

      let edad = randInt(rng, 22, 58);
      if (entry.rol === 'estudiante') edad = randInt(rng, 8, 17);
      if (entry.rol === 'jubilado') edad = randInt(rng, 65, 84);

      const educNivel =
        entry.rol === 'estudiante' ? randInt(rng, 0, 3) : Math.max(def.educMin, randInt(rng, def.educMin, 3));
      const pos = getDistrictPosition(entry.rol, rng);
      const dest = getDistrictPosition(entry.rol, rng);

      const personalidad = {
        valentia: clamp(Math.round(randRange(rng, 20, 80) + (def.afinidad === 'valentia' ? 18 : 0)), 5, 98),
        laboriosidad: clamp(Math.round(randRange(rng, 25, 82) + (def.afinidad === 'laboriosidad' ? 15 : 0)), 10, 98),
        codicia: clamp(Math.round(randRange(rng, 18, 78) + (def.afinidad === 'codicia' ? 18 : 0)), 5, 98),
        rebeldia: clamp(Math.round(randRange(rng, 12, 65) + (def.afinidad === 'rebeldia' ? 18 : 0)), 5, 95),
        resiliencia: clamp(Math.round(randRange(rng, 30, 85)), 10, 98),
      };

      const miedoInicial = config.escenarioId === 'zombies' ? randInt(rng, 18, 34) : randInt(rng, 5, 16);
      const lealtadInicial = clamp(Math.round(randRange(rng, 42, 66)), 25, 82);
      const saludInicial = entry.rol === 'jubilado' ? randInt(rng, 68, 86) : randInt(rng, 82, 98);

      const objetivoDespensa = clamp(
        ECON_CONSTANTS.objetivoBaseDias *
          (1 +
            ECON_CONSTANTS.kPrudenciaDespensa * (1 - personalidad.valentia / 100) +
            ECON_CONSTANTS.kMiedoDespensa * (miedoInicial / 100)),
        1,
        ECON_CONSTANTS.despensaMaxDias
      );

      const propensionGasto = Number(
        clamp(
          ECON_CONSTANTS.propensionGastoBase -
            (personalidad.codicia / 100 - 0.5) * 0.22 +
            randRange(rng, -0.05, 0.05),
          ECON_CONSTANTS.propensionGastoMin,
          ECON_CONSTANTS.propensionGastoMax
        ).toFixed(3)
      );

      const initTaxRate = def.grupo === 'sin_ingreso' ? 0 : initialLevers.impuesto;
      const initIncomePos = Number(nextRand(rng).toFixed(2));
      const estProdInit = clamp(
        (0.35 + 0.65 * (personalidad.laboriosidad / 100)) *
          (0.45 + 0.55 * 0.99) *
          (0.55 + 0.45 * 0.57) *
          (0.85 + 0.3 * 0.575),
        0,
        1.35
      );
      const estNetoInicial =
        entry.rol === 'empresario'
          ? 14.5
          : entry.rol === 'comerciante'
          ? 9.5
          : entry.rol === 'jubilado'
          ? Number((ECON_CONSTANTS.pensionBase + initialLevers.ayudaSocial).toFixed(2))
          : entry.rol === 'desempleado'
          ? initialLevers.ayudaSocial
          : def.publico
          ? Number(
              (
                ECON_CONSTANTS.salarioBasePublico *
                (initialLevers.salarioPublico / 100) *
                (1 - initTaxRate / 100)
              ).toFixed(2)
            )
          : def.ingreso
          ? Number(
              (
                (def.ingreso[0] + initIncomePos * (def.ingreso[1] - def.ingreso[0])) *
                estProdInit *
                (1 - initTaxRate / 100)
              ).toFixed(2)
            )
          : 0;

      const initialDinero = 0;
      const initialDespensa = Number(
        clamp(objetivoDespensa - 1, 1.5, ECON_CONSTANTS.despensaMaxDias).toFixed(2)
      );

      npcs.push({
        id,
        nombre,
        edad,
        cumpleanosDia: randInt(rng, 1, 365),
        educacion: {
          nivel: educNivel,
        },
        personalidad,
        variables: {
          salud: saludInicial,
          hambre: randInt(rng, 8, 22),
          miedo: miedoInicial,
          satisfaccion: randInt(rng, 52, 72),
          lealtad: lealtadInicial,
        },
        economia: {
          ingresoPos: initIncomePos,
          dinero: initialDinero,
          ultimoIngresoNeto: estNetoInicial,
          despensa: initialDespensa,
          propensionGasto,
          noPudoPagarComida: false,
        },
        rol: entry.rol,
        zona,
        hospital: {
          internado: false,
          esperandoCama: false,
          diasInternado: 0,
        },
        mapa: {
          x: pos.x,
          y: pos.y,
          destino: dest,
          accion:
            entry.rol === 'estudiante'
              ? 'estudiando'
              : entry.rol === 'jubilado' || entry.rol === 'desempleado'
              ? 'paseando'
              : 'trabajando',
        },
        accionIa: null,
        modificadores: [],
        vivo: true,
      });
      idx++;
    }
  }

  const journalistIds = npcs.filter((n) => n.rol === 'periodista').map((n) => n.id);
  const mediaCount = clamp(config.cantidadMedios, 1, 3);
  const fondosInicialesPorMedio = Number((initialLevers.prensa / mediaCount).toFixed(1));
  const medios: MediaOutlet[] = MEDIA_TEMPLATES.slice(0, mediaCount).map((tpl, mIdx) => {
    const assigned = journalistIds.filter((_, jIdx) => jIdx % mediaCount === mIdx);
    if (assigned.length === 0 && journalistIds.length > 0) {
      assigned.push(journalistIds[0]);
    }
    const depPct = Number(
      ((fondosInicialesPorMedio / Math.max(1, tpl.ingresosPropios + fondosInicialesPorMedio)) * 100).toFixed(1)
    );
    return {
      id: tpl.id,
      nombre: tpl.nombre,
      lineaEditorial: {
        afinidadGobierno: tpl.afinidadGobierno,
        sensacionalismo: tpl.sensacionalismo,
      },
      afinidadBase: tpl.afinidadGobierno,
      credibilidad: tpl.credibilidad,
      alcancePct: Math.round(clamp(14 + Math.sqrt(fondosInicialesPorMedio) * 11.5, 12, 95)),
      columnistas: assigned,
      finanzas: {
        ingresosPropios: tpl.ingresosPropios,
        fondosEstado: fondosInicialesPorMedio,
        dependenciaPct: depPct,
      },
    };
  });

  const serviceRoleCounts: Record<ServicePublicRoleId, number> = {
    policia: npcs.filter((n) => n.rol === 'policia').length,
    medico: npcs.filter((n) => n.rol === 'medico').length,
    ingeniero: npcs.filter((n) => n.rol === 'ingeniero').length,
  };

  const coberturas: Record<ServicePublicRoleId, number> = {
    policia: clamp(serviceRoleCounts.policia / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.policia), 0, 1),
    medico: clamp(serviceRoleCounts.medico / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.medico), 0, 1),
    ingeniero: clamp(serviceRoleCounts.ingeniero / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.ingeniero), 0, 1),
  };

  const stockInicial = Math.round(preset.stockAlimentoInicial * scale);
  const empresarioNpc = npcs.find((n) => n.rol === 'empresario') || null;
  const comerciantesNpcs = npcs.filter((n) => n.rol === 'comerciante');

  const initialPhenomena: ClimatePhenomenon[] =
    config.nivelMundo === 'M0'
      ? []
      : config.escenarioId === 'zombies'
      ? [
          {
            id: 'fen_zombie_init',
            tipo: 'plaga_zombie',
            nombre: 'Brote Zombie Periférico',
            intensidad: 10,
            inicioDia: 1,
            duracionDias: 185,
            crecimientoDia: 0.5,
            origen: 'este',
            avisoDias: 0,
          },
          {
            id: 'fen_zombie_horda_1',
            tipo: 'plaga_zombie',
            nombre: 'Horda Zombie del Oeste',
            intensidad: 65,
            inicioDia: 55,
            duracionDias: 12,
            origen: 'oeste',
            avisoDias: 8,
          },
          {
            id: 'fen_zombie_horda_2',
            tipo: 'plaga_zombie',
            nombre: 'Horda Zombie del Norte',
            intensidad: 80,
            inicioDia: 115,
            duracionDias: 14,
            origen: 'norte',
            avisoDias: 10,
          },
        ]
      : [
          {
            id: 'seq_elecciones_verano',
            tipo: 'sequia',
            nombre: 'Sequía Estival Anunciada',
            intensidad: 65,
            inicioDia: 165,
            duracionDias: 45,
            avisoDias: 10,
          },
        ];

  const satInicial = Number(
    (npcs.reduce((acc, n) => acc + n.variables.satisfaccion, 0) / Math.max(1, npcs.length)).toFixed(1)
  );
  const electores = npcs.filter((n) => n.edad >= 18);
  const apoyoInicial =
    electores.length > 0
      ? Number(((electores.filter((n) => n.variables.lealtad >= 50).length / electores.length) * 100).toFixed(1))
      : 0;
  const hambreInicial = Number(
    ((npcs.filter((n) => n.variables.hambre > 80).length / Math.max(1, npcs.length)) * 100).toFixed(1)
  );
  const despensaMediaInicial = Number(
    (npcs.reduce((acc, n) => acc + n.economia.despensa, 0) / Math.max(1, npcs.length)).toFixed(1)
  );

  const getMetricValue = (m: 'apoyoPct' | 'hambreCriticaPct' | 'poblacion' | 'poblacionPct') =>
    m === 'apoyoPct'
      ? apoyoInicial
      : m === 'hambreCriticaPct'
      ? hambreInicial
      : m === 'poblacionPct'
      ? 100
      : pop;

  const initDefense = config.escenarioId === 'zombies' ? 52 : 55;
  const inflacionInicial = preset.inflacionInicial;
  const diasStockInicial = Number((stockInicial / (pop * ECON_CONSTANTS.consumoPorNpc)).toFixed(1));

  const estInitialProd = (w: Npc, satGuess = 0.57, saludGuess = 0.99): number => {
    const lab = w.personalidad.laboriosidad / 100;
    const sal = saludGuess;
    const sat = satGuess;
    const infraFactor = 0.85 + 0.3 * 0.575;
    const taxRate = ROLE_CATALOG[w.rol].grupo === 'sin_ingreso' ? 0 : initialLevers.impuesto;
    const fiscalFactor =
      taxRate <= ECON_CONSTANTS.fiscalUmbral
        ? 1
        : Math.max(0.5, 1 - ECON_CONSTANTS.fiscalPendiente * (taxRate - ECON_CONSTANTS.fiscalUmbral));
    return clamp(
      (0.35 + 0.65 * lab) * (0.45 + 0.55 * sal) * (0.55 + 0.45 * sat) * infraFactor * fiscalFactor,
      0,
      1.35
    );
  };

  const initTaxMult = 1 - initialLevers.impuesto / 100;
  const foodWorkers = npcs.filter((n) => n.rol === 'agricultor' || n.rol === 'tecnico');
  const foodWageEstPeriodo = Number(
    (
      foodWorkers.reduce((acc, w) => {
        const range = ROLE_CATALOG[w.rol].ingreso!;
        return acc + (range[0] + w.economia.ingresoPos * (range[1] - range[0])) * estInitialProd(w, 0.57, 0.99);
      }, 0) * PERIOD_DAYS
    ).toFixed(1)
  );
  const estFoodSalesPeriodo =
    pop *
    ECON_CONSTANTS.consumoPorNpc *
    ECON_CONSTANTS.precioBaseAlimento *
    (1 - ECON_CONSTANTS.margenComercialPct / 100) *
    PERIOD_DAYS;
  const foodParteSueldos = clamp(
    Number((foodWageEstPeriodo / Math.max(1, estFoodSalesPeriodo)).toFixed(4)),
    0.25,
    0.92
  );
  const foodRevEstPeriodo = Number(
    Math.max(foodWageEstPeriodo / Math.max(0.1, foodParteSueldos), estFoodSalesPeriodo).toFixed(1)
  );
  const empNetDiaEst = (Math.max(0, foodRevEstPeriodo - foodWageEstPeriodo) / PERIOD_DAYS) * initTaxMult;

  const comWorkers = npcs.filter((n) => n.rol === 'obrero');
  const comWageEstPeriodo = Number(
    (
      comWorkers.reduce((acc, w) => {
        const range = ROLE_CATALOG[w.rol].ingreso!;
        return acc + (range[0] + w.economia.ingresoPos * (range[1] - range[0])) * estInitialProd(w, 0.59, 0.985);
      }, 0) * PERIOD_DAYS
    ).toFixed(1)
  );

  const opBreakdown = computeMaintenanceBreakdown(parcelas, initialLevers.nivelObras, pop, pop);
  const estOpPeriodo = opBreakdown.operacionTotal;
  const foodMarginPeriodo =
    pop *
    ECON_CONSTANTS.consumoPorNpc *
    ECON_CONSTANTS.precioBaseAlimento *
    (ECON_CONSTANTS.margenComercialPct / 100) *
    PERIOD_DAYS;

  let comNetDiaEst = 9.5;
  let estComSalesPeriodo = 0;
  for (let iter = 0; iter < 10; iter++) {
    let estLivingDia = 0;
    for (const n of npcs) {
      if (n.edad < 18) continue;
      let effNet = n.economia.ultimoIngresoNeto;
      if (n.rol === 'empresario') {
        effNet = empNetDiaEst;
      } else if (n.rol === 'comerciante') {
        effNet = comNetDiaEst;
      } else if (n.rol === 'agricultor' || n.rol === 'tecnico' || n.rol === 'periodista') {
        const range = ROLE_CATALOG[n.rol].ingreso!;
        effNet =
          (range[0] + n.economia.ingresoPos * (range[1] - range[0])) *
          estInitialProd(n, 0.57, 0.99) *
          initTaxMult;
      } else if (n.rol === 'obrero') {
        const range = ROLE_CATALOG[n.rol].ingreso!;
        effNet =
          (range[0] + n.economia.ingresoPos * (range[1] - range[0])) *
          estInitialProd(n, 0.59, 0.985) *
          initTaxMult;
      }
      const baseNet = Math.max(0, effNet - ECON_CONSTANTS.precioBaseAlimento);
      estLivingDia += (1 + (n.economia.propensionGasto - ECON_CONSTANTS.propensionGastoBase) * 0.25) * baseNet;
    }
    estComSalesPeriodo = foodMarginPeriodo + estLivingDia * 0.985 * PERIOD_DAYS + estOpPeriodo;
    const merchCount = Math.max(1, comerciantesNpcs.length);
    comNetDiaEst =
      (Math.max(0, estComSalesPeriodo - comWageEstPeriodo) / merchCount / PERIOD_DAYS) * initTaxMult;
  }

  const comParteSueldos = clamp(
    Number((comWageEstPeriodo / Math.max(1, estComSalesPeriodo)).toFixed(4)),
    0.2,
    0.9
  );
  const comRevEstPeriodo = Number(
    Math.max(comWageEstPeriodo / Math.max(0.1, comParteSueldos), estComSalesPeriodo).toFixed(1)
  );

  const colchonInicial =
    ECON_CONSTANTS.colchonDias * ECON_CONSTANTS.precioBaseAlimento * ECON_CONSTANTS.consumoPorNpc;
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    const def = ROLE_CATALOG[n.rol];
    let netDia = n.economia.ultimoIngresoNeto;
    if (n.rol === 'empresario') {
      netDia = Number(empNetDiaEst.toFixed(2));
    } else if (n.rol === 'comerciante') {
      netDia = Number(comNetDiaEst.toFixed(2));
    } else if (n.rol === 'agricultor' || n.rol === 'tecnico' || n.rol === 'periodista') {
      const range = def.ingreso!;
      netDia = Number(
        (
          (range[0] + n.economia.ingresoPos * (range[1] - range[0])) *
          estInitialProd(n, 0.57, 0.99) *
          initTaxMult
        ).toFixed(2)
      );
    } else if (n.rol === 'obrero') {
      const range = def.ingreso!;
      netDia = Number(
        (
          (range[0] + n.economia.ingresoPos * (range[1] - range[0])) *
          estInitialProd(n, 0.59, 0.985) *
          initTaxMult
        ).toFixed(2)
      );
    }
    n.economia.ultimoIngresoNeto = netDia;

    const netAboveFood = Math.max(0, netDia - ECON_CONSTANTS.precioBaseAlimento);
    const steadyAvgDinero =
      colchonInicial +
      ((1 - n.economia.propensionGasto) * netAboveFood) / Math.max(0.005, ECON_CONSTANTS.kRiqueza);
    if (n.rol === 'estudiante') {
      n.economia.dinero = 0;
    } else if (n.rol === 'desempleado') {
      n.economia.dinero = Math.round(initialLevers.ayudaSocial * PERIOD_DAYS);
    } else if (n.rol === 'jubilado') {
      n.economia.dinero = Math.round(colchonInicial + netAboveFood * PERIOD_DAYS + netDia * 0.5);
    } else {
      n.economia.dinero = Math.round(
        Math.max(
          ECON_CONSTANTS.precioBaseAlimento * PERIOD_DAYS,
          steadyAvgDinero + netDia * PERIOD_DAYS * 0.4
        )
      );
    }

    const objDespensa = clamp(
      ECON_CONSTANTS.objetivoBaseDias *
        (1 +
          ECON_CONSTANTS.kPrudenciaDespensa * (1 - n.personalidad.valentia / 100) +
          ECON_CONSTANTS.kMiedoDespensa * (n.variables.miedo / 100)),
      1,
      ECON_CONSTANTS.despensaMaxDias
    );
    const pantryVal =
      objDespensa - ECON_CONSTANTS.umbralRecompraDias >= 1.0
        ? i % 2 === 0
          ? objDespensa - 1.0
          : objDespensa - 2.0
        : objDespensa - 1.0;
    n.economia.despensa = Number(clamp(pantryVal, 1.5, ECON_CONSTANTS.despensaMaxDias).toFixed(2));
  }

  const initialComVentasAcum = Number(estOpPeriodo.toFixed(2));
  const initialReserva = Math.round(preset.reservaInicial * scale);
  const initMoneyTotal = Number(
    (npcs.reduce((acc, n) => acc + n.economia.dinero, 0) + initialReserva + initialComVentasAcum).toFixed(2)
  );

  return {
    versionFormato: SAVE_FORMAT_VERSION,
    semilla,
    rngState: rng.rngState,
    idSeq: 0,
    config,
    esConfigDePrueba: isTestConfig(config),
    reloj: {
      tick: 0,
      dia: 1,
      anio: 1,
      periodo: 1,
      diasEnPeriodo: 0,
    },
    npcs,
    gobierno: {
      reserva: initialReserva,
      inflacion: inflacionInicial,
      finanzas: {
        ingresos: 0,
        nomina: 0,
        pensiones: 0,
        garantiaAlimentaria: 0,
        garantiaImpaga: 0,
        comidaMenores: 0,
        ayudaSocial: 0,
        mantenimiento: 0,
        operacionObras: 0,
        operacion: 0,
        obras: 0,
        prensa: 0,
        saldo: 0,
        emision: 0,
        importaciones: 0,
        exportaciones: 0,
        impago: false,
        alcanzaNomina: false,
        prorrateoDiscrecional: 1,
        prorrateoNomina: 1,
        prorrateoPensionGarantia: 1,
      },
      acumuladoPeriodo: {
        dias: 0,
        impuestos: 0,
        nominaPorNpc: {},
        pensionesPorNpc: {},
        ayudaPorNpc: {},
        periodistasPorNpc: {},
        nominaDevengada: 0,
        pensionesDevengadas: 0,
        ayudaDevengada: 0,
        garantiaAlimentaria: 0,
        garantiaImpaga: 0,
        comidaMenores: 0,
        mantenimiento: 0,
        operacionObras: 0,
        operacion: 0,
        obras: 0,
        operacionPorArea: {
          seguridad: 0,
          salud: 0,
          infraestructura: 0,
        },
        prensa: 0,
        importaciones: 0,
        exportaciones: 0,
      },
      indicadores: {
        seguridad: initDefense,
        salud: 62,
        infraestructura: 56,
      },
      integridad: {
        centro: 100,
        norte: 100,
        este: 100,
        sur: 100,
        oeste: 100,
      },
      coberturas,
      cuposFijos,
      palancasVigentes: structuredClone(initialLevers),
      palancasObjetivo: structuredClone(initialLevers),
    },
    empresas: {
      alimento: {
        id: 'alimento',
        dueno: empresarioNpc ? empresarioNpc.id : null,
        stock: stockInicial,
        diasStock: diasStockInicial,
        siloDias: ECON_CONSTANTS.siloDias,
        ventasAcum: 0,
        parteSueldos: foodParteSueldos,
        factor: 1,
        periodosFactorAlto: 0,
        periodosFactorBajo: 0,
        ultimoTramo: 'normal',
        despidosPendientes: 0,
        refPorEmpleado: {},
        ultimaGanancia: Number(Math.max(0, foodRevEstPeriodo - foodWageEstPeriodo).toFixed(1)),
        ultimoIngresoPeriodo: foodRevEstPeriodo,
        ultimoSueldosPeriodo: foodWageEstPeriodo,
      },
      comercio: {
        id: 'comercio',
        socios: comerciantesNpcs.map((c) => c.id),
        ventasAcum: initialComVentasAcum,
        parteSueldos: comParteSueldos,
        factor: 1,
        periodosFactorAlto: 0,
        periodosFactorBajo: 0,
        ultimoTramo: 'normal',
        despidosPendientes: 0,
        refPorEmpleado: {},
        ultimaGanancia: Number(Math.max(0, comRevEstPeriodo - comWageEstPeriodo).toFixed(1)),
        ultimoIngresoPeriodo: comRevEstPeriodo,
        ultimoSueldosPeriodo: comWageEstPeriodo,
      },
    },
    alimento: {
      stock: stockInicial,
      consumoPorNpc: ECON_CONSTANTS.consumoPorNpc,
      diasStock: diasStockInicial,
      siloDias: ECON_CONSTANTS.siloDias,
      precio: ECON_CONSTANTS.precioBaseAlimento,
      precioMercado: ECON_CONSTANTS.precioBaseAlimento,
      precioBase: ECON_CONSTANTS.precioBaseAlimento,
      produccionDiaria: (() => {
        const agWorkers = npcs.filter((n) => n.rol === 'agricultor');
        const tecWorkers = npcs.filter((n) => n.rol === 'tecnico');
        const baseProd = agWorkers.reduce(
          (acc, w) => acc + ECON_CONSTANTS.produccionBaseAgricultor * estInitialProd(w),
          0
        );
        const effTecs = Math.min(
          tecWorkers.reduce((acc, w) => acc + estInitialProd(w), 0),
          agWorkers.length * ECON_CONSTANTS.tecnicosPorAgricultor
        );
        const techMult = agWorkers.length > 0 ? 1 + (effTecs / agWorkers.length) * ECON_CONSTANTS.kTecnificacion : 1;
        return Number((baseProd * techMult).toFixed(1));
      })(),
      consumoDiario: pop * ECON_CONSTANTS.consumoPorNpc,
    },
    clima: {
      fenomenos: initialPhenomena,
      proximoEventoDia: config.nivelMundo === 'M0' ? 999999 : config.escenarioId === 'zombies' ? 28 : 22,
    },
    medios,
    noticias: [
      {
        id: 'n_init',
        dia: 1,
        medioId: medios[0].id,
        medioNombre: medios[0].nombre,
        autorId: medios[0].columnistas[0] || npcs[0].id,
        autorNombre:
          npcs.find((n) => n.id === (medios[0].columnistas[0] || npcs[0].id))?.nombre || 'Redacción',
        tema: 'gobierno',
        tono: 'neutral',
        alcance: medios[0].alcancePct,
        credibilidad: medios[0].credibilidad,
        titulo:
          config.escenarioId === 'zombies'
            ? 'Asume nuevo gobernador bajo alerta sanitaria en las afueras'
            : 'Comienza la gestión con cuentas equilibradas y horizonte electoral',
        texto:
          config.escenarioId === 'zombies'
            ? 'Con los primeros reportes de brotes en los límites del valle, la población observa de cerca el refuerzo de la policía y el abastecimiento de alimentos.'
            : 'El despacho inicia su mandato con almacenes abastecidos y consenso inicial. Los sectores productivos aguardan las primeras señales impositivas y de gasto.',
        origen: 'sistema:inicio',
        textoOrigen: 'plantilla',
      },
    ],
    ultimaSalidaEconomica: {
      accesoComida: Object.fromEntries(npcs.map((n) => [n.id, 1])),
      poderAdquisitivo: Object.fromEntries(npcs.map((n) => [n.id, 55])),
      saldoDiarioEstimado: 35,
      precioAlimento: ECON_CONSTANTS.precioBaseAlimento,
      inflacion: inflacionInicial,
    },
    caosTracker: {
      ventanaInicioDia: 1,
      accionesEnVentana: 0,
      respiroActivo: false,
      ultimoIntentoDia: 1,
    },
    ventanasCondicion: [],
    cooldownsCondicion: {
      impago: 0,
      descontento: 0,
      hambre: 0,
    },
    eventos: [],
    eventosDiaActual: [],
    golpesPorZonaHistorial: {
      centro: [],
      norte: [],
      este: [],
      sur: [],
      oeste: [],
    },
    ultimaDefensaZona: {
      centro: initDefense,
      norte: initDefense,
      este: initDefense,
      sur: initDefense,
      oeste: initDefense,
    },
    ultimaOrdenZona: {
      centro: 100,
      norte: 100,
      este: 100,
      sur: 100,
      oeste: 100,
    },
    ultimaIntegridadZona: {
      centro: 100,
      norte: 100,
      este: 100,
      sur: 100,
      oeste: 100,
    },
    fenomenosIniciadosIds: initialPhenomena.filter((f) => f.inicioDia <= 1).map((f) => f.id),
    avisosEmitidos: [],
    auditEntradasDia: 0,
    auditSalidasDia: 0,
    ultimoDineroTotal: initMoneyTotal,
    precioAyer: ECON_CONSTANTS.precioBaseAlimento,
    hambreAyerPct: hambreInicial,
    ultimoSaldoCierre: 0,
    colaHechosDia: [],
    ultimaVariantePorAccion: {},
    clasificadorRegistro: [],
    metricasBaseObjetivo: {
      victoriaInicial: getMetricValue(preset.victoria.metrica),
      derrotaInicial: getMetricValue(preset.derrota.metrica),
    },
    metricasPeriodoAnterior: {
      apoyoPct: apoyoInicial,
      hambreCriticaPct: hambreInicial,
      poblacion: pop,
      satisfaccionMedia: satInicial,
    },
    parcelas,
    hitosCumplidos: [],
    hitosRacha: {},
    demandasActivas: [],
    bloqueosPalanca: [],
    medidasVigentes: [],
    cooldownActorDemanda: {},
    parcelasRecienHabilitadasDia: 0,
    bitacora: [
      {
        id: 'log_init',
        dia: 1,
        categoria: 'sistema',
        origen: 'sistema:inicio',
        titulo: `Inicio de partida: ${preset.nombre}`,
        detalle: `Módulo económico: ${config.economiaModulo} · Semilla ${semilla} · ${pop} habitantes (despensa media ${despensaMediaInicial}d).`,
      },
    ],
    historial: [
      {
        dia: 1,
        reserva: Math.round(preset.reservaInicial * scale),
        inflacion: inflacionInicial,
        satisfaccion: satInicial,
        apoyo: apoyoInicial,
        hambreCritica: hambreInicial,
        stockDias: diasStockInicial,
        poblacion: pop,
      },
    ],
    resultado: {
      estado: 'jugando',
      victoriaCumplida: false,
    },
  };
}
