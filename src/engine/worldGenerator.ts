import {
  BUILDING_CATALOG,
  DEFAULT_TRAMOS,
  DEFAULT_ZONAS,
  ECON_CONSTANTS,
  FIRM_CONSTANTS,
  MEDIA_TEMPLATES,
  ROLE_CATALOG,
  ROLE_DISTRICTS,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
  SPANISH_LAST_NAMES,
  SPANISH_NAMES,
} from '../data/catalogs';
import {
  BuildingInstance,
  BuildingType,
  Casa,
  ClimatePhenomenon,
  EconomyModule,
  Firma,
  FirmRubro,
  GameState,
  GovernorComplexityLevel,
  GovernorLevers,
  Hogar,
  HouseType,
  MediaOutlet,
  Npc,
  Parcela,
  ParcelTipo,
  RoleId,
  ScenarioId,
  ServicePublicRoleId,
  WorldComplexityLevel,
  WorldConfig,
  ZoneDefinition,
  ZoneId,
} from '../types/game';
import { getBuildingJobCaps, getBuildingRoleCapacity, getObrasTargetJobs } from './policies';
import { initSubsystemRng, nextRand, normalizeSeed, randInt, randRange } from './rng';
import {
  clamp,
  computeDemandaSuelo,
  computeTotalWorldMoney,
  getWorldZones,
  recomputeRoadDistances,
  syncLegacyEnterprisesView,
} from './worldHelpers';

interface RngHolder {
  rngState: number;
}

function drawRand(rng?: RngHolder): number {
  return rng ? nextRand(rng) : Math.random();
}

export function getZoneCanvasPosition(
  zone: ZoneId,
  rng?: RngHolder,
  zonas?: Record<ZoneId, ZoneDefinition>
): { x: number; y: number } {
  const zDef = zonas?.[zone];
  if (zDef?.rect) {
    return {
      x: zDef.rect.wx + 28 + drawRand(rng) * Math.max(40, zDef.rect.ww - 56),
      y: zDef.rect.wy + 28 + drawRand(rng) * Math.max(40, zDef.rect.wh - 56),
    };
  }
  return {
    x: 440 + drawRand(rng) * 320,
    y: 290 + drawRand(rng) * 180,
  };
}

export function getDistrictPosition(role: RoleId, rng?: RngHolder): { x: number; y: number } {
  const dist = ROLE_DISTRICTS[role] ?? 'residencial';
  const box =
    dist === 'campos'
      ? { x: 35, y: 40, w: 340, h: 680 }
      : dist === 'mercado'
      ? { x: 825, y: 285, w: 340, h: 190 }
      : dist === 'civico'
      ? { x: 430, y: 285, w: 340, h: 190 }
      : { x: 430, y: 40, w: 720, h: 680 };

  return {
    x: box.x + drawRand(rng) * box.w,
    y: box.y + drawRand(rng) * box.h,
  };
}

export function getCityErrandPosition(
  role: RoleId,
  zone?: ZoneId,
  rng?: RngHolder,
  zonas?: Record<ZoneId, ZoneDefinition>
): { x: number; y: number; accion: string } {
  if (zone && zonas?.[zone]) {
    const zPos = getZoneCanvasPosition(zone, rng, zonas);
    if (role === 'policia') return { ...zPos, accion: `patrullando ${zonas[zone].nombre}` };
    if (role === 'periodista') return { ...zPos, accion: `reportando en ${zonas[zone].nombre}` };
    return { ...zPos, accion: ROLE_CATALOG[role].nombre.toLowerCase() };
  }
  const p = getDistrictPosition(role, rng);
  return { ...p, accion: 'trabajando' };
}

export function resolveComplexityConfig(raw: Partial<WorldConfig>): {
  nivelMundo: WorldComplexityLevel;
  nivelGobernador: GovernorComplexityLevel;
  economiaModulo: EconomyModule;
  estadoAutomatico: boolean;
} {
  const defaultWorld: WorldComplexityLevel =
    raw.economiaModulo === 'fiscal' ? 'M4' : 'M3';
  const nivelMundo: WorldComplexityLevel = raw.nivelMundo ?? defaultWorld;
  const economiaModulo: EconomyModule = nivelMundo === 'M4' ? 'fiscal' : 'base';
  const defaultGov: GovernorComplexityLevel = nivelMundo === 'M4' ? 'G3' : 'G2';
  const nivelGobernador: GovernorComplexityLevel = raw.nivelGobernador ?? defaultGov;
  const estadoAutomatico = raw.estadoAutomatico ?? nivelGobernador === 'G0';
  return { nivelMundo, nivelGobernador, economiaModulo, estadoAutomatico };
}

export function isTestConfig(config: WorldConfig): boolean {
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const { nivelMundo, nivelGobernador } = resolveComplexityConfig(config);
  if (nivelMundo !== 'M3' && nivelMundo !== 'M4') return true;
  if (nivelGobernador === 'G0' || nivelGobernador === 'G1') return true;
  if (config.poblacionInicial !== preset.poblacionDefault) return true;
  if (config.cantidadMedios !== preset.mediosDefault) return true;
  return false;
}

function buildScaledParcelas(
  escenarioId: ScenarioId,
  nivelMundo: WorldComplexityLevel,
  pop: number,
  zonas: Record<ZoneId, ZoneDefinition>,
  cantidadMedios?: number
): Parcela[] {
  const preset = SCENARIO_PRESETS[escenarioId];
  const isM0 = nivelMundo === 'M0';
  const base: Parcela[] = preset.parcelas.map((def, idx) => {
    const tipoParcela: ParcelTipo =
      def.tipoParcela ??
      (def.houseType
        ? 'residencial'
        : def.edificioInicial === 'campo'
        ? 'agricola'
        : def.edificioInicial === 'fabrica'
        ? 'industrial'
        : def.edificioInicial === 'plaza' || def.edificioInicial === 'puerto' || def.edificioInicial === 'muelle_comercio'
        ? 'especial'
        : def.edificioInicial === 'hospital' ||
          def.edificioInicial === 'comisaria' ||
          def.edificioInicial === 'escuela' ||
          def.edificioInicial === 'oficina_publica' ||
          def.id.includes('libre') ||
          def.id.includes('hito')
        ? 'publica'
        : 'comercial');

    const zona = def.zona;
    let estadoInicial = def.estadoInicial;
    let edificio: BuildingInstance | null = null;
    const isM0NonBasePrivate =
      isM0 &&
      def.edificioInicial &&
      (def.edificioInicial === 'fabrica' ||
        def.edificioInicial === 'oficina_constructora' ||
        def.edificioInicial === 'oficina_inmobiliaria' ||
        def.edificioInicial === 'oficina_banco');
    const isDisabledMedio = cantidadMedios === 0 && def.edificioInicial === 'oficina_medio';

    if (isM0NonBasePrivate || isDisabledMedio) {
      estadoInicial = 'libre';
    } else if (estadoInicial === 'ocupada' && def.edificioInicial) {
      edificio = {
        id: `ed_init_${idx + 1}`,
        tipo: def.edificioInicial,
        parcelaId: def.id,
        dueno: def.duenoInicial ?? 'estado',
        estado: 'ocupada',
        activo: true,
        estadoSalud: 100,
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
      tipoParcela,
      orden: def.orden ?? idx + 1,
      wx: def.wx,
      wy: def.wy,
      ww: def.ww,
      wh: def.wh,
      estado: estadoInicial,
      tramoAperturaId: def.tramoAperturaId,
      nodoAcceso: def.nodoAcceso,
      edificio,
    };
  });

  // Dynamically expand parcels for larger population targets (120..5000) across active zones only
  const scale = Math.max(1, pop / 100);
  if (scale > 1.2) {
    const zoneList = Object.keys(zonas).filter((z) => zonas[z].estado !== 'no_urbanizada');
    const neededHouses = Math.ceil(pop / 2.6) + 12;
    const currentRes = base.filter(
      (p) => p.tipoParcela === 'residencial' && p.estado !== 'sin_calle'
    ).length;
    const extraRes = Math.max(0, neededHouses - currentRes);

    const resZones = zoneList.filter((z) => zonas[z].caracter === 'residencial' || zonas[z].caracter === 'centro');
    for (let i = 0; i < extraRes; i++) {
      const z = resZones[i % Math.max(1, resZones.length)] ?? 'norte';
      const rect = zonas[z].rect;
      const col = i % 7;
      const row = Math.floor(i / 7) % 4;
      base.push({
        id: `p_res_ext_${i + 1}`,
        nombre: `Solar Residencial ${z} ${i + 1}`,
        zona: z,
        distrito: 'residencial',
        tipoParcela: 'residencial',
        orden: 100 + i,
        wx: rect.wx + 16 + col * 48,
        wy: rect.wy + 135 + row * 24,
        ww: 42,
        wh: 20,
        estado: 'libre',
        edificio: null,
      });
    }

    const extraFields = Math.max(0, Math.round(6 * (scale - 1)));
    const agroZones = zoneList.filter((z) => zonas[z].caracter === 'agricola');
    for (let i = 0; i < extraFields; i++) {
      const z = agroZones[i % Math.max(1, agroZones.length)] ?? 'noroeste';
      const rect = zonas[z].rect;
      const pid = `p_campo_ext_${i + 1}`;
      base.push({
        id: pid,
        nombre: `Campo Expandido ${i + 1}`,
        zona: z,
        distrito: 'campos',
        tipoParcela: 'agricola',
        orden: 200 + i,
        wx: rect.wx + 24 + (i % 4) * 82,
        wy: rect.wy + 150,
        ww: 74,
        wh: 46,
        estado: 'ocupada',
        edificio: {
          id: `ed_campo_ext_${i + 1}`,
          tipo: 'campo',
          parcelaId: pid,
          dueno: 'agro',
          estado: 'ocupada',
          activo: true,
          estadoSalud: 100,
          diasObraRestantes: 0,
          diasObraTotal: 0,
          zona: z,
        },
      });
    }

    const v2ShopCycle: BuildingType[] = isM0
      ? ['almacen', 'supermercado', 'tienda', 'kiosco']
      : ['supermercado', 'tienda', 'restoran', 'bar_cafe', 'taller', 'cine_teatro', 'almacen', 'gimnasio'];
    const extraShops = Math.max(0, Math.round(6 * (scale - 1)));
    const comZones = zoneList.filter((z) => zonas[z].caracter !== 'agricola');
    for (let i = 0; i < extraShops; i++) {
      const z = comZones[i % Math.max(1, comZones.length)] ?? 'centro';
      const rect = zonas[z].rect;
      const pid = `p_com_ext_${i + 1}`;
      const tipo: BuildingType = v2ShopCycle[i % v2ShopCycle.length];
      base.push({
        id: pid,
        nombre: `${BUILDING_CATALOG[tipo].nombre} ${z} ${i + 1}`,
        zona: z,
        distrito: 'mercado',
        tipoParcela: 'comercial',
        orden: 300 + i,
        wx: rect.wx + 20 + (i % 5) * 56,
        wy: rect.wy + 88,
        ww: 46,
        wh: 36,
        estado: 'ocupada',
        edificio: {
          id: `ed_com_ext_${i + 1}`,
          tipo,
          parcelaId: pid,
          dueno: BUILDING_CATALOG[tipo].rubro ?? 'comercio',
          estado: 'ocupada',
          activo: true,
          estadoSalud: 100,
          diasObraRestantes: 0,
          diasObraTotal: 0,
          zona: z,
        },
      });
    }

    if (!isM0) {
      const extraFactories = Math.max(0, Math.floor((pop - 120) / 180));
      const indZones = ['este', 'oeste'];
      for (let i = 0; i < extraFactories; i++) {
        const z = indZones[i % indZones.length];
        const rect = zonas[z]?.rect ?? zonas.este.rect;
        const pid = `p_fab_ext_${i + 1}`;
        base.push({
          id: pid,
          nombre: `Fábrica Expandida ${i + 1}`,
          zona: z,
          distrito: 'taller',
          tipoParcela: 'industrial',
          orden: 350 + i,
          wx: rect.wx + 32 + (i % 4) * 74,
          wy: rect.wy + 160,
          ww: 58,
          wh: 42,
          estado: 'ocupada',
          edificio: {
            id: `ed_fab_ext_${i + 1}`,
            tipo: 'fabrica',
            parcelaId: pid,
            dueno: 'industria',
            estado: 'ocupada',
            activo: true,
            estadoSalud: 100,
            diasObraRestantes: 0,
            diasObraTotal: 0,
            zona: z,
          },
        });
      }
    }

    const extraHosp = Math.max(0, Math.floor((pop - 120) / 140));
    const pubZones = ['norte', 'sur', 'este', 'oeste', 'noreste', 'suroeste'];
    for (let i = 0; i < extraHosp; i++) {
      const z = pubZones[i % pubZones.length] ?? 'norte';
      const rect = zonas[z].rect;
      const pidH = `p_hosp_ext_${i + 1}`;
      base.push({
        id: pidH,
        nombre: `Hospital Zonal ${z}`,
        zona: z,
        distrito: 'civico',
        tipoParcela: 'publica',
        orden: 400 + i * 2,
        wx: rect.wx + 260,
        wy: rect.wy + 32,
        ww: 50,
        wh: 40,
        estado: 'ocupada',
        edificio: {
          id: `ed_hosp_ext_${i + 1}`,
          tipo: 'hospital',
          parcelaId: pidH,
          dueno: 'estado',
          estado: 'ocupada',
          activo: true,
          estadoSalud: 100,
          diasObraRestantes: 0,
          diasObraTotal: 0,
          zona: z,
        },
      });
      const pidC = `p_comis_ext_${i + 1}`;
      base.push({
        id: pidC,
        nombre: `Comisaría Zonal ${z}`,
        zona: z,
        distrito: 'civico',
        tipoParcela: 'publica',
        orden: 401 + i * 2,
        wx: rect.wx + 314,
        wy: rect.wy + 32,
        ww: 46,
        wh: 38,
        estado: 'ocupada',
        edificio: {
          id: `ed_comis_ext_${i + 1}`,
          tipo: 'comisaria',
          parcelaId: pidC,
          dueno: 'estado',
          estado: 'ocupada',
          activo: true,
          estadoSalud: 100,
          diasObraRestantes: 0,
          diasObraTotal: 0,
          zona: z,
        },
      });
    }
  }

  return base;
}

export function buildInitialParcelas(
  escenarioId: ScenarioId,
  nivelMundo: WorldComplexityLevel,
  pop = 100,
  zonas: Record<ZoneId, ZoneDefinition> = DEFAULT_ZONAS,
  cantidadMedios?: number
): Parcela[] {
  return buildScaledParcelas(escenarioId, nivelMundo, pop, zonas, cantidadMedios);
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
  const subRng = initSubsystemRng(semilla);
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const pop = clamp(Math.round(config.poblacionInicial || 100), 50, 5000);
  const scale = pop / 100;
  const zonas = structuredClone(preset.zonas);
  const activeZoneIds = Object.keys(zonas).filter((z) => zonas[z].estado !== 'no_urbanizada');
  const allZoneIds = Object.keys(zonas);
  const tramos = structuredClone(preset.tramos ?? DEFAULT_TRAMOS);
  const mediaCount = clamp(config.cantidadMedios ?? preset.mediosDefault, 0, 3);

  const parcelas = buildScaledParcelas(config.escenarioId, config.nivelMundo, pop, zonas, mediaCount);
  const initialLevers: GovernorLevers = structuredClone(preset.initialLevers);
  const cuposFijos = {
    estatal: Math.max(2, Math.round(preset.cuposFijos.estatal * scale)),
    docente: Math.max(2, Math.round(preset.cuposFijos.docente * scale)),
  };

  const jobCaps = getBuildingJobCaps(parcelas, pop, initialLevers.nivelObras, pop, cuposFijos);

  // Build role counts that fit exact initial vacancies + balanced minors/retirees
  const roleDistribution: Array<{ rol: RoleId; count: number }> = [
    { rol: 'agricultor', count: jobCaps.agricultor },
    { rol: 'tecnico', count: jobCaps.tecnico },
    { rol: 'obrero', count: jobCaps.obrero },
    { rol: 'comerciante', count: jobCaps.comerciante },
    { rol: 'constructor', count: Math.max(2, jobCaps.constructor) },
    { rol: 'inmobiliario', count: Math.max(1, jobCaps.inmobiliario) },
    { rol: 'empresario', count: Math.max(2, Math.round(3 * scale)) },
    { rol: 'periodista', count: mediaCount === 0 ? 0 : Math.max(mediaCount, jobCaps.periodista) },
    { rol: 'policia', count: jobCaps.policia },
    { rol: 'medico', count: jobCaps.medico },
    { rol: 'ingeniero', count: getObrasTargetJobs(pop, initialLevers.nivelObras) },
    { rol: 'estatal', count: cuposFijos.estatal },
    { rol: 'docente', count: cuposFijos.docente },
    { rol: 'estudiante', count: Math.round(20 * scale) },
    { rol: 'jubilado', count: Math.round(8 * scale) },
    { rol: 'desempleado', count: 0 },
  ];

  const sumAssigned = roleDistribution.reduce((s, r) => s + r.count, 0);
  if (sumAssigned < pop) {
    const slack = pop - sumAssigned;
    const estSlot = roleDistribution.find((r) => r.rol === 'estudiante')!;
    const agSlot = roleDistribution.find((r) => r.rol === 'agricultor')!;
    const desSlot = roleDistribution.find((r) => r.rol === 'desempleado')!;
    const extraStud = Math.floor(slack * 0.45);
    const extraAg = Math.floor(slack * 0.35);
    estSlot.count += extraStud;
    agSlot.count += extraAg;
    desSlot.count += slack - extraStud - extraAg;
  } else if (sumAssigned > pop) {
    let over = sumAssigned - pop;
    for (const r of ['estudiante', 'jubilado', 'obrero', 'agricultor'] as RoleId[]) {
      const slot = roleDistribution.find((x) => x.rol === r)!;
      const cut = Math.min(over, Math.max(0, slot.count - 2));
      slot.count -= cut;
      over -= cut;
    }
  }

  // Generate NPCs
  const npcs: Npc[] = [];
  let npcSeq = 0;
  for (const item of roleDistribution) {
    const def = ROLE_CATALOG[item.rol];
    const allowedZ = (preset.zonaPorRol[item.rol] ?? activeZoneIds).filter(
      (z) => zonas[z] && zonas[z].estado !== 'no_urbanizada'
    );
    const zonePool = allowedZ.length > 0 ? allowedZ : activeZoneIds;
    for (let i = 0; i < item.count; i++) {
      npcSeq++;
      const id = `npc_${String(npcSeq).padStart(3, '0')}`;
      const nombre = SPANISH_NAMES[(npcSeq - 1) % SPANISH_NAMES.length];
      const apellido = SPANISH_LAST_NAMES[(npcSeq * 7 + randInt(rng, 0, 10)) % SPANISH_LAST_NAMES.length];
      const zona = zonePool[i % zonePool.length] ?? 'centro';
      const edad =
        item.rol === 'estudiante'
          ? randInt(rng, 3, 17)
          : item.rol === 'jubilado'
          ? randInt(rng, 65, 82)
          : randInt(rng, 21, 56);
      const educNivel =
        item.rol === 'estudiante'
          ? edad >= 14
            ? 1
            : 0
          : Math.max(def.educMin, randInt(rng, def.educMin, 3));

      const personalidad = {
        valentia: clamp(Math.round(randRange(rng, 25, 80) + (def.afinidad === 'valentia' ? 16 : 0)), 8, 96),
        laboriosidad: clamp(Math.round(randRange(rng, 30, 84) + (def.afinidad === 'laboriosidad' ? 14 : 0)), 10, 98),
        codicia: clamp(Math.round(randRange(rng, 20, 78) + (def.afinidad === 'codicia' ? 16 : 0)), 8, 96),
        rebeldia: clamp(Math.round(randRange(rng, 14, 62) + (def.afinidad === 'rebeldia' ? 16 : 0)), 5, 92),
        resiliencia: clamp(Math.round(randRange(rng, 34, 86)), 15, 96),
      };

      const zPos = getZoneCanvasPosition(zona, rng, zonas);
      const propGasto = Math.round(
        clamp(68 - (personalidad.codicia - 50) * 0.25 + randRange(rng, -6, 6), 42, 88)
      );
      const propEmprender = Math.round(
        clamp(personalidad.codicia * 0.42 + personalidad.rebeldia * 0.22 + randRange(rng, 0, 18), 10, 92)
      );

      npcs.push({
        id,
        nombre,
        apellido,
        edad,
        cumpleanosDia: randInt(rng, 1, 365),
        hogarId: '',
        parejaId: null,
        padresIds: [],
        rol: item.rol,
        empleadorId: null,
        partes: [],
        zona,
        vivo: true,
        educacion: {
          nivel: educNivel,
          estudiando: item.rol === 'estudiante',
        },
        personalidad,
        variables: {
          salud: item.rol === 'jubilado' ? randInt(rng, 70, 88) : randInt(rng, 84, 98),
          hambre: randInt(rng, 8, 22),
          miedo: config.escenarioId === 'zombies' ? randInt(rng, 14, 30) : randInt(rng, 5, 16),
          satisfaccion: randInt(rng, 54, 74),
          lealtad: randInt(rng, 46, 68),
        },
        economia: {
          ingresoPos: randInt(rng, 25, 80),
          propensionGasto: propGasto,
          propensionEmprender: propEmprender,
          ultimoIngresoNeto: def.grupo === 'sin_ingreso' ? 0 : 6.2,
        },
        hospital: {
          internado: false,
          esperandoCama: false,
          diasInternado: 0,
        },
        accionIa: null,
        modificadores: [],
        mapa: {
          x: zPos.x,
          y: zPos.y,
          destino: { x: zPos.x, y: zPos.y },
          accion: item.rol === 'estudiante' ? 'estudiando' : item.rol === 'jubilado' ? 'paseando' : 'trabajando',
        },
      });
    }
  }

  // Group NPCs into coherent Households (adult couples, children, retirees)
  const adults = npcs.filter((n) => n.edad >= 18 && n.edad < 65);
  const retirees = npcs.filter((n) => n.edad >= 65);
  const minors = npcs.filter((n) => n.edad < 18);

  const hogares: Hogar[] = [];
  let hSeq = 0;

  let adultCursor = 0;
  while (adultCursor < adults.length) {
    hSeq++;
    const hId = `h_${hSeq}`;
    const p1 = adults[adultCursor++];
    const members: Npc[] = [p1];

    // Pair ~65% of adults
    if (adultCursor < adults.length && nextRand(rng) < 0.65) {
      const p2 = adults[adultCursor++];
      p1.parejaId = p2.id;
      p2.parejaId = p1.id;
      p2.apellido = p1.apellido;
      p2.zona = p1.zona;
      members.push(p2);
    }

    hogares.push({
      id: hId,
      miembros: members.map((m) => m.id),
      casaId: null,
      dinero: 0,
      despensa: 0,
      estado: 'calle',
      periodosSinPagar: 0,
      periodosHacinado: 0,
      zona: p1.zona,
      ultimoIngresoNeto: 0,
      alquilerPagadoPeriodo: 0,
    });
    for (const m of members) m.hogarId = hId;
  }

  // Attach retirees either with an adult family or in own retiree household
  for (let i = 0; i < retirees.length; i++) {
    const ret = retirees[i];
    if (i % 2 === 0 && hogares.length > 0) {
      const targetH = hogares[i % hogares.length];
      targetH.miembros.push(ret.id);
      ret.hogarId = targetH.id;
      ret.zona = targetH.zona;
    } else {
      hSeq++;
      const hId = `h_${hSeq}`;
      hogares.push({
        id: hId,
        miembros: [ret.id],
        casaId: null,
        dinero: 0,
        despensa: 0,
        estado: 'calle',
        periodosSinPagar: 0,
        periodosHacinado: 0,
        zona: ret.zona,
        ultimoIngresoNeto: 0,
        alquilerPagadoPeriodo: 0,
      });
      ret.hogarId = hId;
    }
  }

  // Attach minors to multi-adult or matching-zone households with coherent parents/apellido
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const eligibleFamilyHogares = hogares.filter((h) => h.miembros.length >= 2);
  const fallbackHogares = hogares.length > 0 ? hogares : [];
  for (let i = 0; i < minors.length; i++) {
    const ch = minors[i];
    const pool = eligibleFamilyHogares.length > 0 ? eligibleFamilyHogares : fallbackHogares;
    const h = pool[i % pool.length];
    const firstParent = npcById.get(h.miembros[0]);
    const secondParent = h.miembros[1] ? npcById.get(h.miembros[1]) : undefined;
    ch.hogarId = h.id;
    ch.zona = h.zona;
    if (firstParent) {
      ch.apellido = firstParent.apellido;
      ch.padresIds = secondParent ? [firstParent.id, secondParent.id] : [firstParent.id];
    }
    h.miembros.push(ch.id);
  }

  // Build Firms by Rubro (V2 generic Firma model: 2 fixed in M0, all 9+1 rubros in M1+)
  const firmas: Firma[] = [];
  let fSeq = 0;
  const privateParcels = parcelas.filter(
    (p) =>
      p.estado === 'ocupada' &&
      p.edificio &&
      (p.tipoParcela === 'agricola' || p.tipoParcela === 'comercial' || p.tipoParcela === 'industrial')
  );

  const createFirma = (
    rubro: FirmRubro,
    nombre: string,
    zona: ZoneId,
    locales: string[],
    owners: Npc[],
    initCaja: number,
    initVentas = 0
  ): Firma => {
    fSeq++;
    const fid = `f_${fSeq}`;
    const validOwners = owners.filter((o) => o.vivo);
    const pctEach = validOwners.length > 0 ? 100 / validOwners.length : 0;
    const partes = validOwners.map((o) => ({ tipo: 'npc' as const, id: o.id, pct: Number(pctEach.toFixed(4)) }));
    if (partes.length > 1) {
      const sum = partes.reduce((s, p) => s + p.pct, 0);
      partes[0].pct = Number((partes[0].pct + (100 - sum)).toFixed(4));
    }
    for (const p of partes) {
      const o = npcById.get(p.id);
      if (o) o.partes.push({ firmaId: fid, pct: p.pct });
    }

    let capDiaria = 0;
    for (const pid of locales) {
      const parcel = parcelas.find((x) => x.id === pid);
      if (parcel?.edificio) {
        capDiaria += BUILDING_CATALOG[parcel.edificio.tipo].capacidadVentasDiaria ?? 80;
      }
    }

    const f: Firma = {
      id: fid,
      rubro,
      nombre,
      zona,
      activa: true,
      partes,
      gerenteId: validOwners[0]?.id ?? null,
      locales: [...locales],
      empleados: [],
      ventas: initVentas,
      caja: initCaja,
      parteSueldos: FIRM_CONSTANTS.parteSueldosBase,
      factor: 1.0,
      cuotaZona: {},
      margenPoder: 0,
      stock: rubro === 'agro' ? 0 : undefined,
      stockBienes: rubro === 'industria' ? Math.round(160 * scale) : undefined,
      capacidadDiaria: capDiaria > 0 ? capDiaria : 90,
      siloDias: rubro === 'agro' ? ECON_CONSTANTS.siloDias : undefined,
      periodosEnPerdida: 0,
      periodosSinDueno: 0,
      periodosFactorAlto: 0,
      periodosFactorBajo: 0,
      ultimoTramo: 'normal',
      despidosPendientes: 0,
      refPorEmpleado: {},
      ultimoIngresoPeriodo: Math.max(90, initVentas),
      ultimoSueldosPeriodo: 65,
      ultimaGanancia: 25,
      historialGanancias: [25],
    };

    for (const pid of locales) {
      const parcel = parcelas.find((x) => x.id === pid);
      if (parcel?.edificio) {
        parcel.edificio.firmaId = fid;
        parcel.edificio.dueno = fid;
        parcel.edificio.duenoRef = { tipo: 'firma', id: fid };
      }
    }

    firmas.push(f);
    return f;
  };

  const empresarios = npcs.filter((n) => n.rol === 'empresario');
  const comerciantes = npcs.filter((n) => n.rol === 'comerciante');
  const constructores = npcs.filter((n) => n.rol === 'constructor');
  const inmobiliarios = npcs.filter((n) => n.rol === 'inmobiliario');
  const periodistas = npcs.filter((n) => n.rol === 'periodista');

  if (config.nivelMundo === 'M0') {
    const agroParcels = privateParcels.filter((p) => p.tipoParcela === 'agricola').map((p) => p.id);
    const comParcels = privateParcels.filter((p) => p.tipoParcela === 'comercial').map((p) => p.id);
    createFirma('agro', 'Productora de Alimento', 'centro', agroParcels, empresarios.slice(0, 1), 360);
    createFirma('comercio', 'Comercio y Servicios', 'centro', comParcels, comerciantes.slice(0, 2), 340);
  } else {
    // 1. Agro firms (2-4 competing farms grouped by zone)
    const agroParcels = privateParcels.filter((p) => p.edificio?.tipo === 'campo');
    const agroGroups = Math.max(2, Math.min(4, Math.ceil(agroParcels.length / 2)));
    for (let g = 0; g < agroGroups; g++) {
      const slice = agroParcels.filter((_, idx) => idx % agroGroups === g);
      if (slice.length === 0) continue;
      const owner = empresarios[g % Math.max(1, empresarios.length)] ?? comerciantes[0];
      createFirma(
        'agro',
        `Agropecuaria ${slice[0].zona.charAt(0).toUpperCase() + slice[0].zona.slice(1)}`,
        slice[0].zona,
        slice.map((s) => s.id),
        owner ? [owner] : [],
        320
      );
    }

    // 2. Industria firms (each fabrica parcel)
    const indParcels = privateParcels.filter((p) => p.edificio?.tipo === 'fabrica');
    indParcels.forEach((p, idx) => {
      const owner = empresarios[(idx + 1) % Math.max(1, empresarios.length)] ?? comerciantes[0];
      createFirma('industria', p.nombre, p.zona, [p.id], owner ? [owner] : [], 340);
    });

    // 3..6. Commerce, Gastronomia, Servicios, Entretenimiento (grouped cleanly by building rubro)
    const consumerParcels = privateParcels.filter((p) => {
      const r = p.edificio ? BUILDING_CATALOG[p.edificio.tipo].rubro : undefined;
      return r === 'comercio' || r === 'gastronomia' || r === 'servicios' || r === 'entretenimiento';
    });
    consumerParcels.forEach((p, idx) => {
      const r = BUILDING_CATALOG[p.edificio!.tipo].rubro!;
      const owner = comerciantes[idx % Math.max(1, comerciantes.length)] ?? empresarios[0];
      createFirma(r, p.nombre, p.zona, [p.id], owner ? [owner] : [], 240);
    });

    // 7. Constructora firms (seed initial period ventas so Period 1 payroll closes cleanly)
    const constrParcels = privateParcels.filter((p) => p.edificio?.tipo === 'oficina_constructora');
    if (constrParcels.length > 0) {
      constrParcels.forEach((p, idx) => {
        const owner = constructores[idx % Math.max(1, constructores.length)] ?? empresarios[0];
        createFirma('construccion', p.nombre, p.zona, [p.id], owner ? [owner] : [], 360, Math.round(160 * scale));
      });
    } else {
      createFirma('construccion', 'Constructora del Valle', 'centro', [], constructores.slice(0, 1), 360, Math.round(160 * scale));
    }

    // 8. Inmobiliaria firms
    const inmobParcels = privateParcels.filter((p) => p.edificio?.tipo === 'oficina_inmobiliaria');
    if (inmobParcels.length > 0) {
      inmobParcels.forEach((p, idx) => {
        const owner = inmobiliarios[idx % Math.max(1, inmobiliarios.length)] ?? empresarios[0];
        createFirma('inmobiliaria', p.nombre, p.zona, [p.id], owner ? [owner] : [], 320, Math.round(130 * scale));
      });
    } else {
      createFirma('inmobiliaria', 'Inmobiliaria del Valle', 'centro', [], inmobiliarios.slice(0, 1), 320, Math.round(130 * scale));
    }

    // 10. Banco in M4
    if (config.nivelMundo === 'M4' || config.economiaModulo === 'fiscal') {
      const bankParcels = privateParcels.filter((p) => p.edificio?.tipo === 'oficina_banco');
      if (bankParcels.length > 0) {
        bankParcels.forEach((p, idx) => {
          const owner = empresarios[idx % Math.max(1, empresarios.length)];
          createFirma('banco', p.nombre, p.zona, [p.id], owner ? [owner] : [], 420, Math.round(110 * scale));
        });
      } else {
        const freeCom = parcelas.find((p) => p.tipoParcela === 'comercial' && p.estado === 'libre' && p.zona === 'centro');
        const locs = freeCom ? [freeCom.id] : [];
        if (freeCom) {
          freeCom.estado = 'ocupada';
          freeCom.edificio = {
            id: 'ed_banco_init',
            tipo: 'oficina_banco',
            parcelaId: freeCom.id,
            dueno: 'banco',
            estado: 'ocupada',
            activo: true,
            estadoSalud: 100,
            diasObraRestantes: 0,
            diasObraTotal: 0,
            zona: freeCom.zona,
          };
        }
        createFirma('banco', 'Banco del Valle', 'centro', locs, empresarios.slice(0, 1), 420, Math.round(110 * scale));
      }
    }
  }

  // 9. Media outlets (as rubro 'medio' firms)
  const medioParcels = privateParcels.filter((p) => p.edificio?.tipo === 'oficina_medio');
  const medios: MediaOutlet[] = [];
  const fondosPorMedio = mediaCount > 0 ? Number((initialLevers.prensa / mediaCount).toFixed(1)) : 0;
  for (let mIdx = 0; mIdx < mediaCount; mIdx++) {
    const tpl = MEDIA_TEMPLATES[mIdx] ?? MEDIA_TEMPLATES[0];
    const parcel = medioParcels[mIdx];
    const owner = periodistas[mIdx % Math.max(1, periodistas.length)] ?? empresarios[0];
    const mFirm = createFirma(
      'medio',
      tpl.nombre,
      parcel?.zona ?? 'centro',
      parcel ? [parcel.id] : [],
      owner ? [owner] : [],
      180,
      Math.round(65 + fondosPorMedio)
    );
    const cols = periodistas.filter((_, j) => j % mediaCount === mIdx).map((n) => n.id);
    if (cols.length === 0 && periodistas[0]) cols.push(periodistas[0].id);

    const depPct = Number(
      ((fondosPorMedio / Math.max(1, tpl.ingresosPropios + fondosPorMedio)) * 100).toFixed(1)
    );
    medios.push({
      id: mFirm.id,
      firmaId: mFirm.id,
      nombre: tpl.nombre,
      zona: mFirm.zona,
      activa: true,
      duenoNpcIds: owner ? [owner.id] : [],
      columnistas: cols,
      alcancePct: tpl.alcancePct,
      credibilidad: tpl.credibilidad,
      afinidadBase: tpl.afinidadGobierno,
      lineaEditorial: {
        afinidadGobierno: tpl.afinidadGobierno,
        sensacionalismo: tpl.sensacionalismo,
      },
      ingresos: {
        publicidad: tpl.ingresosPropios,
        fondosEstado: fondosPorMedio,
        dependenciaPct: depPct,
      },
      finanzas: {
        ingresosPropios: tpl.ingresosPropios,
        fondosEstado: fondosPorMedio,
        dependenciaPct: depPct,
      },
      caja: mFirm.caja,
      periodosEnPerdida: 0,
    });
  }

  // Compute target role vacancies per firm so multi-rubro roles (tecnico, obrero, comerciante) spread cleanly
  const firmRoleCaps = new Map<string, Partial<Record<RoleId, number>>>();
  for (const f of firmas) {
    const agg: Partial<Record<RoleId, number>> = Object.create(null);
    for (const pid of f.locales) {
      const p = parcelas.find((x) => x.id === pid);
      if (p?.edificio) {
        const caps = getBuildingRoleCapacity(p.edificio);
        for (const [r, cnt] of Object.entries(caps)) {
          if (typeof cnt === 'number' && cnt > 0) {
            agg[r as RoleId] = (agg[r as RoleId] ?? 0) + cnt;
          }
        }
      }
    }
    firmRoleCaps.set(f.id, agg);
  }

  const firmsByRoleMatch = (rol: RoleId): Firma[] => {
    const def = ROLE_CATALOG[rol];
    const allowedRubros = new Set(
      (def.rubro ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (allowedRubros.size === 0) return [];
    return firmas.filter((f) => allowedRubros.has(f.rubro) && f.locales.length > 0);
  };

  for (const n of npcs) {
    const def = ROLE_CATALOG[n.rol];
    if (def.grupo !== 'privado' || def.gerencia) continue;
    const pool = firmsByRoleMatch(n.rol);
    if (pool.length === 0) continue;

    pool.sort((a, b) => {
      const aOpen = (firmRoleCaps.get(a.id)?.[n.rol] ?? 0) - a.empleados.filter((id) => npcById.get(id)?.rol === n.rol).length;
      const bOpen = (firmRoleCaps.get(b.id)?.[n.rol] ?? 0) - b.empleados.filter((id) => npcById.get(id)?.rol === n.rol).length;
      const aHasSlot = aOpen > 0 ? 0 : 1;
      const bHasSlot = bOpen > 0 ? 0 : 1;
      if (aHasSlot !== bHasSlot) return aHasSlot - bHasSlot;
      const aZone = a.zona === n.zona ? 0 : 1;
      const bZone = b.zona === n.zona ? 0 : 1;
      if (aZone !== bZone) return aZone - bZone;
      return a.empleados.length - b.empleados.length;
    });
    const chosen = pool[0];
    n.empleadorId = chosen.id;
    chosen.empleados.push(n.id);
  }

  // Allocate Houses to accessible Residential Parcels (exclude sin_calle!)
  const casas: Casa[] = [];
  let cSeq = 0;
  const resParcels = parcelas.filter((p) => p.tipoParcela === 'residencial' && p.estado === 'libre');
  const inmobFirms = firmas.filter((f) => f.rubro === 'inmobiliaria');
  const sortedHogares = [...hogares].sort((a, b) => b.miembros.length - a.miembros.length);

  // First build houses on residential parcels enough for households + ~12% vacant buffer
  const targetHouses = Math.min(resParcels.length, Math.ceil(sortedHogares.length * 1.12));
  for (let i = 0; i < targetHouses; i++) {
    const parcel = resParcels[i];
    const h = sortedHogares[i];
    const desiredCap = h ? h.miembros.length : 4;
    const houseType: HouseType =
      desiredCap >= 6 ? 'casa_grande' : desiredCap >= 4 ? 'casa_mediana' : 'casa_chica';
    const def = BUILDING_CATALOG[houseType];
    cSeq++;
    const casaId = `c_${cSeq}`;

    // Distribute ownership: ~45% homeowner, ~35% inmobiliaria, ~20% individual npc
    let dueno: Casa['dueno'] = { tipo: 'hogar', id: h?.id ?? 'estado' };
    if (h && i % 10 < 5) {
      dueno = { tipo: 'hogar', id: h.id };
    } else if (inmobFirms.length > 0 && i % 10 < 8) {
      const inf = inmobFirms[i % inmobFirms.length];
      dueno = { tipo: 'firma', id: inf.id };
    } else if (empresarios.length > 0) {
      const ownerNpc = empresarios[i % empresarios.length];
      dueno = { tipo: 'npc', id: ownerNpc.id };
    } else {
      dueno = { tipo: 'estado', id: 'estado' };
    }

    const zIdx = zonas[parcel.zona]?.demandaAlquilerIndice ?? 1.0;
    const rent = Number(((def.alquilerBase ?? 12) * zIdx).toFixed(2));
    const casa: Casa = {
      id: casaId,
      tipo: houseType,
      parcelaId: parcel.id,
      zona: parcel.zona,
      capacidad: def.capacidadCasa ?? 4,
      estado: randInt(rng, 84, 100),
      dueno,
      alquiler: rent,
      hogarId: null,
      diasVaciaSinMantenimiento: 0,
      alquilerCobradoPeriodo: 0,
    };

    parcel.estado = 'ocupada';
    parcel.edificio = {
      id: `ed_casa_${cSeq}`,
      tipo: houseType,
      parcelaId: parcel.id,
      dueno: dueno.id,
      duenoRef: dueno,
      casaId,
      estado: 'ocupada',
      activo: true,
      estadoSalud: casa.estado,
      diasObraRestantes: 0,
      diasObraTotal: 0,
      zona: parcel.zona,
    };

    if (h) {
      casa.hogarId = h.id;
      h.casaId = casa.id;
      h.estado = 'con_casa';
      h.zona = parcel.zona;
      for (const mid of h.miembros) {
        const m = npcById.get(mid);
        if (m) m.zona = parcel.zona;
      }
    }
    casas.push(casa);
  }

  // Calibrate initial household dinero, despensa & agro stock
  const totalStockInicial = Math.round(preset.stockAlimentoInicial * scale);
  const agroFirms = firmas.filter((f) => f.rubro === 'agro');
  if (agroFirms.length > 0) {
    const perAgro = totalStockInicial / agroFirms.length;
    for (const af of agroFirms) af.stock = Number(perAgro.toFixed(2));
  }

  for (const h of hogares) {
    const mCount = Math.max(1, h.miembros.length);
    const workers = h.miembros.filter((id) => {
      const m = npcById.get(id);
      return m && ROLE_CATALOG[m.rol].grupo !== 'sin_ingreso';
    }).length;
    const baseNetPerPeriod = Math.max(18, workers * 42 + mCount * 10);
    h.ultimoIngresoNeto = baseNetPerPeriod;
    h.dinero = Math.round(baseNetPerPeriod * 1.45 + mCount * 18);
    h.despensa = Number((mCount * 3.1).toFixed(2));
  }

  // Initial service coverage & integrity per zone
  const serviceCounts: Record<ServicePublicRoleId, number> = {
    policia: npcs.filter((n) => n.rol === 'policia').length,
    medico: npcs.filter((n) => n.rol === 'medico').length,
    ingeniero: npcs.filter((n) => n.rol === 'ingeniero').length,
  };
  const coberturas: Record<ServicePublicRoleId, number> = {
    policia: clamp(serviceCounts.policia / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.policia), 0, 1),
    medico: clamp(serviceCounts.medico / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.medico), 0, 1),
    ingeniero: clamp(serviceCounts.ingeniero / Math.max(1, pop * ECON_CONSTANTS.objetivoCobertura.ingeniero), 0, 1),
  };

  const integridad: Record<ZoneId, number> = {};
  const defInit = config.escenarioId === 'zombies' ? 52 : 55;
  const ultimaDefensaZona: Record<ZoneId, number> = {};
  const ultimaOrdenZona: Record<ZoneId, number> = {};
  const ultimaIntegridadZona: Record<ZoneId, number> = {};
  const golpesPorZonaHistorial: Record<ZoneId, number[]> = {};
  for (const z of allZoneIds) {
    integridad[z] = 100;
    ultimaDefensaZona[z] = defInit;
    ultimaOrdenZona[z] = 95;
    ultimaIntegridadZona[z] = 100;
    golpesPorZonaHistorial[z] = [];
  }

  const initialPhenomena: ClimatePhenomenon[] =
    config.nivelMundo === 'M0' || config.nivelMundo === 'M1'
      ? []
      : structuredClone(preset.fenomenosIniciales);

  const initialReserva = Math.round(preset.reservaInicial * scale);
  const satMedia = Number(
    (npcs.reduce((s, n) => s + n.variables.satisfaccion, 0) / Math.max(1, pop)).toFixed(1)
  );
  const apoyoInit = Number(
    ((npcs.filter((n) => n.variables.lealtad >= 50).length / Math.max(1, pop)) * 100).toFixed(1)
  );
  const edadMedia = Number(
    (npcs.reduce((s, n) => s + n.edad, 0) / Math.max(1, pop)).toFixed(1)
  );
  const calleCount = hogares.filter((h) => h.estado === 'calle').length;
  const callePct = Number(((calleCount / Math.max(1, hogares.length)) * 100).toFixed(1));
  const diasStockInit = Number((totalStockInicial / Math.max(1, pop * ECON_CONSTANTS.consumoPorNpc)).toFixed(2));

  const state: GameState = {
    versionFormato: SAVE_FORMAT_VERSION,
    semilla,
    config,
    devMode: false,
    rngState: rng.rngState,
    rng: subRng,
    idSeq: npcSeq + hSeq + cSeq + fSeq + 50,
    reloj: {
      dia: 1,
      anio: 1,
      periodo: 1,
      diasEnPeriodo: 0,
      tick: 0,
      ticksPorDia: 120,
      velocidad: 1,
      pausado: false,
    },
    zonas,
    tramos,
    distanciasZonas: {},
    demandaSuelo: {},
    demandaSueloRachas: {},
    npcs,
    hogares,
    casas,
    firmas,
    alimento: {
      stock: totalStockInicial,
      produccionDiaria: Math.round(pop * 1.15),
      consumoDiario: pop * ECON_CONSTANTS.consumoPorNpc,
      diasStock: diasStockInit,
      siloDias: ECON_CONSTANTS.siloDias,
      precio: ECON_CONSTANTS.precioBaseAlimento,
      precioMercado: ECON_CONSTANTS.precioBaseAlimento,
    },
    empresas: {
      alimento: {
        id: 'alimento',
        nombre: 'Agroalimentaria',
        dueno: empresarios[0]?.id ?? null,
        socios: [],
        ventasAcum: 0,
        parteSueldos: FIRM_CONSTANTS.parteSueldosBase,
        factor: 1,
        stock: totalStockInicial,
        siloDias: ECON_CONSTANTS.siloDias,
        periodosFactorAlto: 0,
        periodosFactorBajo: 0,
        ultimoTramo: 'normal',
        despidosPendientes: 0,
        refPorEmpleado: {},
        ultimoIngresoPeriodo: 0,
        ultimoSueldosPeriodo: 0,
        ultimaGanancia: 0,
      },
      comercio: {
        id: 'comercio',
        nombre: 'Comercio y Servicios',
        dueno: null,
        socios: comerciantes.map((c) => c.id),
        ventasAcum: 0,
        parteSueldos: FIRM_CONSTANTS.parteSueldosBase,
        factor: 1,
        periodosFactorAlto: 0,
        periodosFactorBajo: 0,
        ultimoTramo: 'normal',
        despidosPendientes: 0,
        refPorEmpleado: {},
        ultimoIngresoPeriodo: 0,
        ultimoSueldosPeriodo: 0,
        ultimaGanancia: 0,
      },
    },
    gobierno: {
      reserva: initialReserva,
      inflacion: preset.inflacionInicial,
      cuposFijos,
      indicadores: {
        seguridad: defInit,
        salud: 64,
        infraestructura: 58,
      },
      coberturas,
      integridad,
      palancasVigentes: structuredClone(initialLevers),
      palancasObjetivo: structuredClone(initialLevers),
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
        acogidaMenores: 0,
        mantenimiento: 0,
        mantenimientoVias: 0,
        operacionObras: 0,
        operacion: 0,
        obras: 0,
        operacionPorArea: { seguridad: 0, salud: 0, infraestructura: 0 },
        prensa: 0,
        importaciones: 0,
        exportaciones: 0,
      },
      finanzas: {
        ingresos: 0,
        nomina: 0,
        pensiones: 0,
        garantiaAlimentaria: 0,
        garantiaImpaga: 0,
        comidaMenores: 0,
        acogidaMenores: 0,
        ayudaSocial: 0,
        mantenimiento: 0,
        mantenimientoVias: 0,
        mantenimientoEdificios: 0,
        operacionObras: 0,
        operacion: 0,
        obras: 0,
        prensa: 0,
        saldo: 0,
        emision: 0,
        importaciones: 0,
        exportaciones: 0,
        impago: false,
        alcanzaNomina: true,
        prorrateoDiscrecional: 1,
        prorrateoNomina: 1,
        prorrateoPensionGarantia: 1,
      },
    },
    parcelas,
    hitosCumplidos: [],
    demandasActivas: [],
    medidasVigentes: [],
    bloqueosPalanca: [],
    cooldownActorDemanda: {},
    clima: {
      fenomenos: initialPhenomena,
      proximoEventoDia:
        config.nivelMundo === 'M0' || config.nivelMundo === 'M1'
          ? 999999
          : preset.proximoEventoDiaInicial,
    },
    medios,
    noticias:
      medios.length > 0
        ? [
            {
              id: 'n_init',
              dia: 1,
              medioId: medios[0].id,
              medioNombre: medios[0].nombre,
              autorId: medios[0].columnistas[0] || npcs[0].id,
              autorNombre:
                npcs.find((n) => n.id === (medios[0].columnistas[0] || npcs[0].id))?.nombre ||
                'Redacción',
              tema: 'gobierno',
              tono: 'neutral',
              alcance: medios[0].alcancePct,
              credibilidad: medios[0].credibilidad,
              titulo:
                config.escenarioId === 'zombies'
                  ? 'Alerta sanitaria en la periferia al iniciar la gestión'
                  : 'Inicia el mandato en el valle con 9 zonas activas',
              texto:
                config.escenarioId === 'zombies'
                  ? 'Los brotes perimetrales ponen a prueba las defensas zonales y la capacidad hospitalaria.'
                  : 'Familias, comercios y campos productivos comienzan la temporada con precios estables.',
              origen: 'sistema:inicio',
              textoOrigen: 'plantilla',
            },
          ]
        : [],
    colaHechosDia: [],
    ventanasCondicion: [],
    clasificadorRegistro: [],
    caosTracker: {
      ventanaInicioDia: 1,
      accionesEnVentana: 0,
      respiroActivo: false,
    },
    cooldownsCondicion: {
      impago: 0,
      descontento: 0,
      hambre: 0,
      paroFirma: 0,
      ocupacion: 0,
      boicot: 0,
    },
    golpesPorZonaHistorial,
    avisosEmitidos: [],
    fenomenosIniciadosIds: initialPhenomena.filter((f) => f.inicioDia <= 1).map((f) => f.id),
    ultimaIntegridadZona,
    ultimaDefensaZona,
    ultimaOrdenZona,
    ultimaVariantePorAccion: {},
    precioAyer: ECON_CONSTANTS.precioBaseAlimento,
    hambreAyerPct: 0,
    ultimoSaldoCierre: 0,
    ultimaSalidaEconomica: {
      accesoComida: Object.fromEntries(hogares.map((h) => [h.id, 1])),
      poderAdquisitivo: Object.fromEntries(hogares.map((h) => [h.id, 65])),
      precioAlimento: Object.fromEntries(activeZoneIds.map((z) => [z, ECON_CONSTANTS.precioBaseAlimento])),
      alquilerMedio: Object.fromEntries(activeZoneIds.map((z) => [z, 13])),
      cuotaMercado: {},
      saldoDiarioEstimado: 15,
      inflacion: preset.inflacionInicial,
      precioGlobal: ECON_CONSTANTS.precioBaseAlimento,
      gastoVidaPorCategoria: {
        bienes: 0,
        gastronomia: 0,
        servicios: 0,
        entretenimiento: 0,
      },
      bienesImportadosDia: 0,
      industriaExportDia: 0,
    },
    metricasPeriodoAnterior: {
      apoyoPct: apoyoInit,
      hambreCriticaPct: 0,
      poblacion: pop,
      satisfaccionMedia: satMedia,
    },
    mercadoStats: {
      quiebrasPeriodo: 0,
      fundacionesPeriodo: 0,
      comprasPeriodo: 0,
      construccionesPeriodo: 0,
      nacimientosAcum: 0,
      muertesAcum: 0,
      hogaresEnAcogida: 0,
      ultimaActualizacionDemogDia: 1,
    },
    auditEntradasDia: 0,
    auditSalidasDia: 0,
    ultimoDineroTotal: 0,
    eventosDiaActual: [],
    eventos: [],
    historial: [
      {
        dia: 1,
        reserva: initialReserva,
        inflacion: preset.inflacionInicial,
        satisfaccion: satMedia,
        apoyo: apoyoInit,
        hambreCritica: 0,
        stockDias: diasStockInit,
        poblacion: pop,
        callePct,
        edadMedia,
        cuotaMayorPct: 50,
      },
    ],
    bitacora: [
      {
        id: 'log_init',
        dia: 1,
        categoria: 'sistema',
        origen: 'sistema:inicio',
        titulo: `Inicio de partida: ${preset.nombre}`,
        detalle: `Nivel ${config.nivelMundo} · ${pop} habitantes · ${hogares.length} hogares · ${firmas.length} firmas · ${casas.length} casas.`,
      },
    ],
    resultado: {
      estado: 'jugando',
      victoriaCumplida: false,
    },
  };

  recomputeRoadDistances(state);
  state.demandaSuelo = computeDemandaSuelo(state);
  syncLegacyEnterprisesView(state);
  state.ultimoDineroTotal = computeTotalWorldMoney(state);
  void getWorldZones;
  return state;
}
