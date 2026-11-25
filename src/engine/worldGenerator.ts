import {
  DISTRICTS,
  ECON_CONSTANTS,
  MEDIA_TEMPLATES,
  PUBLIC_ROLES,
  ROLE_CATALOG,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
  SPANISH_NAMES,
} from '../data/catalogs';
import {
  ClimatePhenomenon,
  CommercialEnterpriseState,
  GameState,
  GovernorLevers,
  MediaOutlet,
  Npc,
  RoleId,
  WorldConfig,
  ZoneId,
} from '../types/game';
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
  const zone = DISTRICTS.find((d) => d.id === def.distrito) || DISTRICTS[0];

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
    const plaza = DISTRICTS.find((d) => d.id === 'mercado')!;
    return {
      x: plaza.x + 36 + drawRand(rng) * (plaza.w - 72),
      y: plaza.y + 62 + drawRand(rng) * (plaza.h - 86),
      accion: 'en el mercado central',
    };
  }

  if (drawRand(rng) < 0.18) {
    const home = DISTRICTS.find((d) => d.id === 'residencial')!;
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

export function isTestConfig(config: WorldConfig): boolean {
  const preset = SCENARIO_PRESETS[config.escenarioId];
  if (config.economiaModulo !== preset.economiaDefault) return true;
  if (config.poblacionInicial !== preset.poblacionDefault) return true;
  if (config.cantidadMedios !== preset.mediosDefault) return true;
  if (config.disturbiosActivos) return true;
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

export function createInitialGameState(rawConfig: WorldConfig): GameState {
  const semilla = normalizeSeed(rawConfig.semilla);
  const config: WorldConfig = {
    ...rawConfig,
    semilla,
    disturbiosActivos: Boolean(rawConfig.disturbiosActivos),
  };
  const rng: RngHolder = { rngState: semilla };
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const pop = config.poblacionInicial;
  const scale = pop / 100;

  // ESTADOS §10 exact composition across all 14 roles (100 NPCs default)
  const baseDistribution: Array<{ rol: RoleId; count: number }> = [
    { rol: 'agricultor', count: Math.round(preset.topesPrivados.agricultor * scale) },
    { rol: 'obrero', count: Math.round(preset.topesPrivados.obrero * scale) },
    { rol: 'tecnico', count: Math.max(1, Math.round(preset.topesPrivados.tecnico * scale)) },
    { rol: 'comerciante', count: Math.max(2, Math.round(preset.topesPrivados.comerciante * scale)) },
    { rol: 'empresario', count: Math.max(1, preset.topesPrivados.empresario) },
    { rol: 'periodista', count: Math.max(config.cantidadMedios, Math.round(preset.topesPrivados.periodista * scale)) },
    { rol: 'policia', count: Math.max(1, Math.round(preset.cuposIniciales.policia * scale)) },
    { rol: 'estatal', count: Math.max(1, Math.round(preset.cuposIniciales.estatal * scale)) },
    { rol: 'docente', count: Math.max(1, Math.round(preset.cuposIniciales.docente * scale)) },
    { rol: 'medico', count: Math.max(1, Math.round(preset.cuposIniciales.medico * scale)) },
    { rol: 'ingeniero', count: Math.max(1, Math.round(preset.cuposIniciales.ingeniero * scale)) },
    { rol: 'estudiante', count: Math.round(12 * scale) },
    { rol: 'jubilado', count: Math.round(10 * scale) },
    { rol: 'desempleado', count: Math.max(1, Math.round(2 * scale)) },
  ];

  const currentTotal = baseDistribution.reduce((acc, item) => acc + item.count, 0);
  if (currentTotal !== pop) {
    baseDistribution[0].count = Math.max(5, baseDistribution[0].count + (pop - currentTotal));
  }

  const npcs: Npc[] = [];
  let idx = 0;

  for (const entry of baseDistribution) {
    const def = ROLE_CATALOG[entry.rol];
    const allowedZones = preset.zonaPorRol[entry.rol] || ['centro'];
    for (let i = 0; i < entry.count; i++) {
      const id = `npc_${String(idx + 1).padStart(3, '0')}`;
      const baseName = SPANISH_NAMES[idx % SPANISH_NAMES.length];
      const nombre = idx >= SPANISH_NAMES.length ? `${baseName} ${Math.floor(idx / SPANISH_NAMES.length) + 1}` : baseName;
      const zona: ZoneId = allowedZones[i % allowedZones.length];

      // ESTADOS §2: students strictly < 18 when world spawns
      let edad = randInt(rng, 22, 58);
      if (entry.rol === 'estudiante') edad = randInt(rng, 8, 17);
      if (entry.rol === 'jubilado') edad = randInt(rng, 65, 84);

      const educNivel = Math.max(
        def.educMin,
        entry.rol === 'estudiante' ? (edad < 13 ? 0 : 1) : randInt(rng, def.educMin, 3)
      );
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

      // ESTADOS §4: initial pantry starts at the NPC's target so everything aligns cleanly at startup
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

      const initialTaxGroup = def.grupo;
      const initTaxRate =
        initialTaxGroup === 'agro'
          ? 37
          : initialTaxGroup === 'industria'
          ? 38
          : initialTaxGroup === 'comercio'
          ? 38
          : initialTaxGroup === 'publico'
          ? 37
          : 0;
      const initIncomePos = Number(nextRand(rng).toFixed(2));
      const estNetoInicial =
        entry.rol === 'empresario'
          ? 10
          : entry.rol === 'comerciante'
          ? 8
          : entry.rol === 'jubilado'
          ? ECON_CONSTANTS.pensionBase
          : def.publico
          ? Number((ECON_CONSTANTS.salarioBasePublico * (1 - initTaxRate / 100)).toFixed(2))
          : def.ingreso
          ? Number(
              (
                (def.ingreso[0] + initIncomePos * (def.ingreso[1] - def.ingreso[0])) *
                0.78 *
                (1 - initTaxRate / 100)
              ).toFixed(2)
            )
          : 0;

      npcs.push({
        id,
        nombre,
        edad,
        cumpleanosDia: randInt(rng, 1, 365),
        educacion: {
          nivel: educNivel,
          progreso: randInt(rng, 10, 85),
        },
        personalidad,
        variables: {
          salud: randInt(rng, 82, 98),
          hambre: randInt(rng, 8, 22),
          miedo: miedoInicial,
          satisfaccion: randInt(rng, 52, 72),
          lealtad: lealtadInicial,
        },
        economia: {
          ingresoPos: initIncomePos,
          dinero: entry.rol === 'desempleado' ? randInt(rng, 10, 20) : randInt(rng, 40, 110),
          ultimoIngresoNeto: estNetoInicial,
          despensa: Number(objetivoDespensa.toFixed(2)),
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

  // Assign journalists to media outlets
  const journalistIds = npcs.filter((n) => n.rol === 'periodista').map((n) => n.id);
  const mediaCount = clamp(config.cantidadMedios, 1, 3);
  const shareBase = Math.floor(100 / mediaCount);
  const medios: MediaOutlet[] = MEDIA_TEMPLATES.slice(0, mediaCount).map((tpl, mIdx) => {
    const finShare = mIdx === 0 ? 100 - shareBase * (mediaCount - 1) : shareBase;
    const assigned = journalistIds.filter((_, jIdx) => jIdx % mediaCount === mIdx);
    if (assigned.length === 0 && journalistIds.length > 0) {
      assigned.push(journalistIds[0]);
    }
    return {
      id: tpl.id,
      nombre: tpl.nombre,
      lineaEditorial: {
        afinidadGobierno: tpl.afinidadGobierno,
        sensacionalismo: tpl.sensacionalismo,
      },
      credibilidad: tpl.credibilidad,
      alcancePct: mediaCount === 1 ? 85 : clamp(45 + Math.round(finShare * 0.4), 30, 85),
      columnistas: assigned,
      finanzas: {
        ingresosPropios: tpl.ingresosPropios,
        fondosEstado: Math.round(finShare * 0.15),
        dependenciaPct: Math.round(((finShare * 0.15) / (tpl.ingresosPropios + finShare * 0.15)) * 100),
      },
      intervencion: {
        financiamiento: finShare,
        regulacion: 10,
      },
    };
  });

  const prensaObjetivo: Record<string, { financiamiento: number; regulacion: number }> = {};
  for (const m of medios) {
    prensaObjetivo[m.id] = {
      financiamiento: m.intervencion.financiamiento,
      regulacion: m.intervencion.regulacion,
    };
  }

  const cupos: Record<typeof PUBLIC_ROLES[number], number> = {
    policia: Math.max(1, Math.round(preset.cuposIniciales.policia * scale)),
    estatal: Math.max(1, Math.round(preset.cuposIniciales.estatal * scale)),
    docente: Math.max(1, Math.round(preset.cuposIniciales.docente * scale)),
    medico: Math.max(1, Math.round(preset.cuposIniciales.medico * scale)),
    ingeniero: Math.max(1, Math.round(preset.cuposIniciales.ingeniero * scale)),
  };

  const initialLevers: GovernorLevers = {
    recaudacion: {
      impuestoGrupo: {
        agro: 37,
        industria: 38,
        comercio: 38,
        publico: 37,
      },
    },
    gasto: {
      salarioPublico: 100,
      presupuesto: {
        salud: 18,
        seguridad: config.escenarioId === 'zombies' ? 28 : 12,
        infraestructura: 18,
        educacion: 12,
      },
      prensa: 5,
      subsidios: {
        agro: 4,
        industria: 0,
        comercio: 0,
        publico: 0,
        sin_ingreso: 6,
      },
    },
    alimento: {
      precioMaximo: ECON_CONSTANTS.precioMaximoSinTope,
      garantiaAlimentaria: 85,
      intercambio: 0,
    },
    finanzas: {
      topeEmision: 10,
    },
    cupos,
  };

  const stockInicial = Math.round(preset.stockAlimentoInicial * scale);
  const empresarioNpc = npcs.find((n) => n.rol === 'empresario') || null;
  const comerciantesNpcs = npcs.filter((n) => n.rol === 'comerciante');
  const comerciales: CommercialEnterpriseState[] = comerciantesNpcs.map((c, idxCom) => ({
    id: `com_${idxCom + 1}`,
    dueno: c.id,
    ingresosAcum: 0,
    sueldosAcum: 0,
    diasPeriodo: 0,
    ultimaGanancia: 0,
    ultimoIngresoPeriodo: 0,
    ultimoSueldosPeriodo: 0,
    respuesta: null,
  }));

  const initialPhenomena: ClimatePhenomenon[] =
    config.escenarioId === 'zombies'
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
      : [];

  const satInicial = Number(
    (npcs.reduce((acc, n) => acc + n.variables.satisfaccion, 0) / Math.max(1, npcs.length)).toFixed(1)
  );
  const apoyoInicial = Number(
    ((npcs.filter((n) => n.variables.lealtad >= 50).length / Math.max(1, npcs.length)) * 100).toFixed(1)
  );
  const hambreInicial = Number(
    ((npcs.filter((n) => n.variables.hambre > 80).length / Math.max(1, npcs.length)) * 100).toFixed(1)
  );
  const despensaMediaInicial = Number(
    (npcs.reduce((acc, n) => acc + n.economia.despensa, 0) / Math.max(1, npcs.length)).toFixed(1)
  );

  const getMetricValue = (m: 'apoyoPct' | 'hambreCriticaPct' | 'poblacion') =>
    m === 'apoyoPct' ? apoyoInicial : m === 'hambreCriticaPct' ? hambreInicial : pop;

  const initDefense = config.escenarioId === 'zombies' ? 52 : 55;
  const inflacionInicial = preset.inflacionInicial;
  const diasStockInicial = Number((stockInicial / (pop * ECON_CONSTANTS.consumoPorNpc)).toFixed(1));

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
      periodoFiscal: 1,
      diasEnPeriodoFiscal: 0,
    },
    npcs,
    gobierno: {
      reserva: Math.round(preset.reservaInicial * scale),
      inflacion: inflacionInicial,
      finanzas: {
        ingresos: 0,
        impuestos: 0,
        ventasAlimento: 0,
        nomina: 0,
        pensiones: 0,
        garantiaAlimentaria: 0,
        comprasAlimento: 0,
        disponible: 0,
        presupuestoAsignado: 0,
        subsidiosAsignados: 0,
        prensaAsignada: 0,
        aReserva: 0,
        deficit: 0,
        emision: 0,
        impago: false,
      },
      acumuladoPeriodo: {
        dias: 0,
        impuestos: 0,
        ventasAlimento: 0,
        nomina: 0,
        pensiones: 0,
        garantiaAlimentaria: 0,
        comprasAlimento: 0,
      },
      indicadores: {
        seguridad: initDefense,
        salud: 62,
        educacion: 55,
        infraestructura: 56,
      },
      integridad: {
        centro: 100,
        norte: 100,
        este: 100,
        sur: 100,
        oeste: 100,
      },
      coberturas: {
        policia: clamp(
          cupos.policia / Math.max(1, pop * (preset.objetivoCobertura?.policia ?? ECON_CONSTANTS.objetivoCobertura.policia)),
          0,
          1
        ),
        estatal: clamp(
          cupos.estatal / Math.max(1, pop * (preset.objetivoCobertura?.estatal ?? ECON_CONSTANTS.objetivoCobertura.estatal)),
          0,
          1
        ),
        docente: clamp(
          cupos.docente / Math.max(1, pop * (preset.objetivoCobertura?.docente ?? ECON_CONSTANTS.objetivoCobertura.docente)),
          0,
          1
        ),
        medico: clamp(
          cupos.medico / Math.max(1, pop * (preset.objetivoCobertura?.medico ?? ECON_CONSTANTS.objetivoCobertura.medico)),
          0,
          1
        ),
        ingeniero: clamp(
          cupos.ingeniero / Math.max(1, pop * (preset.objetivoCobertura?.ingeniero ?? ECON_CONSTANTS.objetivoCobertura.ingeniero)),
          0,
          1
        ),
        comercio: clamp(
          comerciantesNpcs.length /
            Math.max(1, pop * (preset.objetivoCobertura?.comercio ?? ECON_CONSTANTS.objetivoCobertura.comercio)),
          0,
          1
        ),
      },
      palancasVigentes: structuredClone(initialLevers),
      palancasObjetivo: structuredClone(initialLevers),
      palancasInicioPeriodo: structuredClone(initialLevers),
      prensaObjetivo,
      prensaInicioPeriodo: structuredClone(prensaObjetivo),
    },
    empresas: {
      alimento: {
        id: 'alimento',
        dueno: empresarioNpc ? empresarioNpc.id : null,
        stock: stockInicial,
        diasStock: diasStockInicial,
        siloDias: ECON_CONSTANTS.siloDias,
        ingresosAcum: 0,
        sueldosAcum: 0,
        diasPeriodo: 0,
        ultimaGanancia: 0,
        ultimoIngresoPeriodo: 0,
        ultimoSueldosPeriodo: 0,
        respuesta: null,
      },
      comerciales,
    },
    alimento: {
      stock: stockInicial,
      consumoPorNpc: ECON_CONSTANTS.consumoPorNpc,
      diasStock: diasStockInicial,
      siloDias: ECON_CONSTANTS.siloDias,
      precio: ECON_CONSTANTS.precioBaseAlimento,
      precioMercado: ECON_CONSTANTS.precioBaseAlimento,
      precioBase: ECON_CONSTANTS.precioBaseAlimento,
      produccionDiaria: Number(
        (
          baseDistribution[0].count *
          ECON_CONSTANTS.produccionBaseAgricultor *
          0.72 *
          (1 +
            (Math.min(
              baseDistribution[2].count * 0.72,
              baseDistribution[0].count * ECON_CONSTANTS.tecnicosPorAgricultor
            ) /
              Math.max(1, baseDistribution[0].count)) *
              ECON_CONSTANTS.kTecnificacion)
        ).toFixed(1)
      ),
      consumoDiario: pop * ECON_CONSTANTS.consumoPorNpc,
    },
    clima: {
      fenomenos: initialPhenomena,
      proximoEventoDia: config.escenarioId === 'zombies' ? 28 : 22,
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
        tema: 'asuncion',
        tono: 'informativo',
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
      disponibleDiarioEstimado: 35,
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
      disturbios: 0,
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
