import {
  DISTRICTS,
  MEDIA_TEMPLATES,
  PUBLIC_ROLES,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
  SPANISH_NAMES,
} from '../data/catalogs';
import {
  GameState,
  GovernorLevers,
  MediaOutlet,
  Npc,
  RoleId,
  WorldConfig,
} from '../types/game';

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getDistrictPosition(role: RoleId): { x: number; y: number } {
  const def = ROLE_CATALOG[role];
  const zone = DISTRICTS.find((d) => d.id === def.distrito) || DISTRICTS[0];
  return {
    x: zone.x + 28 + Math.random() * (zone.w - 56),
    y: zone.y + 44 + Math.random() * (zone.h - 68),
  };
}

export function isTestConfig(config: WorldConfig): boolean {
  const preset = SCENARIO_PRESETS[config.escenarioId];
  if (config.economiaModulo !== preset.economiaDefault) return true;
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

export function createInitialGameState(config: WorldConfig): GameState {
  const preset = SCENARIO_PRESETS[config.escenarioId];
  const pop = config.poblacionInicial;
  const scale = pop / 100;

  // Build role counts scaled to requested population
  const baseDistribution: Array<{ rol: RoleId; count: number }> = [
    { rol: 'agricultor', count: Math.round(preset.topesPrivados.agricultor * scale) },
    { rol: 'obrero', count: Math.round(preset.topesPrivados.obrero * scale) },
    { rol: 'tecnico', count: Math.max(1, Math.round(preset.topesPrivados.tecnico * scale)) },
    { rol: 'comerciante', count: Math.max(2, Math.round(preset.topesPrivados.comerciante * scale)) },
    { rol: 'periodista', count: Math.max(config.cantidadMedios, Math.round(preset.topesPrivados.periodista * scale)) },
    { rol: 'policia', count: Math.max(1, Math.round(preset.cuposIniciales.policia * scale)) },
    { rol: 'estatal', count: Math.max(1, Math.round(preset.cuposIniciales.estatal * scale)) },
    { rol: 'docente', count: Math.max(1, Math.round(preset.cuposIniciales.docente * scale)) },
    { rol: 'medico', count: Math.max(1, Math.round(preset.cuposIniciales.medico * scale)) },
    { rol: 'ingeniero', count: Math.max(1, Math.round(preset.cuposIniciales.ingeniero * scale)) },
    { rol: 'estudiante', count: Math.round(12 * scale) },
    { rol: 'jubilado', count: Math.round(10 * scale) },
    { rol: 'desempleado', count: Math.max(1, Math.round(3 * scale)) },
  ];

  // Adjust agricultor / estudiante count so total equals pop exactly
  let currentTotal = baseDistribution.reduce((acc, item) => acc + item.count, 0);
  if (currentTotal !== pop) {
    baseDistribution[0].count = Math.max(5, baseDistribution[0].count + (pop - currentTotal));
  }

  const npcs: Npc[] = [];
  let idx = 0;

  for (const entry of baseDistribution) {
    const def = ROLE_CATALOG[entry.rol];
    for (let i = 0; i < entry.count; i++) {
      const id = `npc_${String(idx + 1).padStart(3, '0')}`;
      const baseName = SPANISH_NAMES[idx % SPANISH_NAMES.length];
      const nombre = idx >= SPANISH_NAMES.length ? `${baseName} ${Math.floor(idx / SPANISH_NAMES.length) + 1}` : baseName;

      let edad = randInt(22, 58);
      if (entry.rol === 'estudiante') edad = randInt(8, 21);
      if (entry.rol === 'jubilado') edad = randInt(65, 84);

      const educNivel = Math.max(def.educMin, entry.rol === 'estudiante' ? (edad < 13 ? 0 : 1) : randInt(def.educMin, 3));
      const pos = getDistrictPosition(entry.rol);
      const dest = getDistrictPosition(entry.rol);

      const personalidad = {
        valentia: clamp(Math.round(randRange(20, 80) + (def.afinidad === 'valentia' ? 18 : 0)), 5, 98),
        laboriosidad: clamp(Math.round(randRange(25, 82) + (def.afinidad === 'laboriosidad' ? 15 : 0)), 10, 98),
        codicia: clamp(Math.round(randRange(18, 78) + (def.afinidad === 'codicia' ? 18 : 0)), 5, 98),
        rebeldia: clamp(Math.round(randRange(12, 65) + (def.afinidad === 'rebeldia' ? 18 : 0)), 5, 95),
        resiliencia: clamp(Math.round(randRange(30, 85)), 10, 98),
      };

      npcs.push({
        id,
        nombre,
        edad,
        educacion: {
          nivel: educNivel,
          progreso: randInt(10, 85),
        },
        personalidad,
        variables: {
          salud: randInt(82, 98),
          hambre: randInt(8, 22),
          miedo: config.escenarioId === 'zombies' ? randInt(18, 34) : randInt(5, 16),
          satisfaccion: randInt(58, 76),
          lealtad: randInt(54, 72),
        },
        economia: {
          ingresoPos: Number(Math.random().toFixed(2)),
          dinero: entry.rol === 'desempleado' ? randInt(4, 12) : randInt(24, 75),
          ultimoIngresoNeto: 0,
        },
        rol: entry.rol,
        mapa: {
          x: pos.x,
          y: pos.y,
          destino: dest,
          accion: entry.rol === 'estudiante' ? 'estudiando' : entry.rol === 'jubilado' || entry.rol === 'desempleado' ? 'paseando' : 'trabajando',
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
        dependenciaPct: Math.round((finShare * 0.15) / (tpl.ingresosPropios + finShare * 0.15) * 100),
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
      impuestoUnico: 28,
      impuestoGrupo: {
        agro: 24,
        industria: 28,
        comercio: 30,
        publico: 22,
      },
    },
    gasto: {
      salarioPublico: 100,
      presupuesto: {
        salud: 22,
        seguridad: config.escenarioId === 'zombies' ? 28 : 18,
        infraestructura: 20,
        educacion: 16,
      },
      prensa: 6,
      subsidios: {
        agro: 0,
        industria: 0,
        comercio: 0,
        publico: 0,
        sin_ingreso: 8,
      },
    },
    alimento: {
      racion: 100,
      garantiaAlimentaria: 85,
      intercambio: 0,
    },
    finanzas: {
      topeEmision: 10,
    },
    cupos,
  };

  const stockInicial = Math.round(preset.stockAlimentoInicial * scale);
  const initialPhenomena =
    config.escenarioId === 'zombies'
      ? [
          {
            id: 'fen_zombie_init',
            tipo: 'plaga_zombie' as const,
            nombre: 'Brote Zombie Periférico',
            intensidad: 18,
            inicioDia: 1,
            duracionDias: 180,
          },
        ]
      : [];

  return {
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
      inflacion: preset.inflacionInicial,
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
        seguridad: config.escenarioId === 'zombies' ? 52 : 55,
        salud: 62,
        educacion: 55,
        infraestructura: 56,
      },
      coberturas: {
        policia: 1,
        estatal: 1,
        docente: 1,
        medico: 1,
        ingeniero: 1,
        comercio: 1,
      },
      palancasVigentes: structuredClone(initialLevers),
      palancasObjetivo: structuredClone(initialLevers),
      prensaObjetivo,
    },
    alimento: {
      stock: stockInicial,
      consumoPorNpc: 1,
      diasStock: Math.round(stockInicial / pop),
      precio: 1.0,
      precioBase: 1.0,
      produccionDiaria: pop * 1.05,
      consumoDiario: pop,
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
        titulo:
          config.escenarioId === 'zombies'
            ? 'Asume nuevo gobernador bajo alerta sanitaria en las afueras'
            : 'Comienza la gestión con cuentas equilibradas y horizonte electoral',
        texto:
          config.escenarioId === 'zombies'
            ? 'Con los primeros reportes de brotes en los límites del valle, la población observa de cerca el refuerzo de la policía y el abastecimiento de alimentos.'
            : 'El despacho inicia su mandato con almacenes abastecidos y consenso inicial. Los sectores productivos aguardan las primeras señales impositivas y de gasto.',
        origen: 'sistema:inicio',
        fuente: 'plantilla',
      },
    ],
    ultimaSalidaEconomica: {
      accesoComida: Object.fromEntries(npcs.map((n) => [n.id, 1])),
      poderAdquisitivo: Object.fromEntries(npcs.map((n) => [n.id, 55])),
      disponibleDiarioEstimado: 35,
      precioAlimento: 1.0,
      inflacion: preset.inflacionInicial,
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
    bitacora: [
      {
        id: 'log_init',
        dia: 1,
        categoria: 'sistema',
        origen: 'sistema:inicio',
        titulo: `Inicio de partida: ${preset.nombre}`,
        detalle: `Módulo económico: ${config.economiaModulo} · ${pop} habitantes · ${medios.length} medio(s) de prensa.`,
      },
    ],
    historial: [
      {
        dia: 1,
        reserva: Math.round(preset.reservaInicial * scale),
        inflacion: preset.inflacionInicial,
        satisfaccion: 67,
        apoyo: 64,
        hambreCritica: 0,
        stockDias: Math.round(stockInicial / pop),
        poblacion: pop,
      },
    ],
    resultado: {
      estado: 'jugando',
    },
  };
}
