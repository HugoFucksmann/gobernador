// Proyección del estado del motor al contrato con la UI (UI §9, CONTROLES §4 y §5).
// El protocolo es independiente del lenguaje: JSON plano, ids de texto, listas con esquema.
// Nada de acá tiene lógica de juego: solo lee el GameState y lo reordena para la vista.
import {
  ACTION_TABLE,
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  FOREIGN_TRADE_STEPS,
  GOVERNOR_BUILDABLE_TYPES,
  LEVER_BOUNDS,
  OBRAS_LEVEL_TABLE,
  PERIOD_DAYS,
  PRICE_CAP_FACTORS,
  ROLE_CATALOG,
  SAVE_FORMAT_VERSION,
  SCENARIO_PRESETS,
  ZONE_IDS,
} from '../src/data/catalogs';
import {
  computeHospitalFacilities,
  describeSimEvent,
  EXTRA_LEVER_BOUNDS,
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveZone,
  TICKS_PER_DAY,
} from '../src/engine/simulation';
import { getAllZoneIds } from '../src/engine/worldHelpers';
import { estimatePeriodBudget, getActiveBuildings, getBuildingJobCaps } from '../src/engine/policies';
import type { BuildingDefinition, CommunityDerived, GameState, Npc, Parcela, SimEvent } from '../src/types/game';
import MAPA_ELECCIONES from '../presets/mapa_elecciones.json';

export const PROTO = 2;

export const ROLE_IDS = Object.keys(ROLE_CATALOG);
export const ACTION_IDS = ACTION_TABLE.map((a) => a.id);

// Orden de las columnas de cada fila de NPC en el mensaje `state`.
export const NPC_COLS = [
  'idx', 'rol', 'zona', 'edad', 'salud', 'hambre', 'miedo', 'satisfaccion', 'lealtad',
  'flags', 'accion', 'zonaDestino', 'trabajo', 'compras', 'dinero',
];
// flags: 1 vivo · 2 internado · 4 esperando cama · 8 fuera de puesto · 16 accion foco · 32 sin dinero para comida

export function zoneIndex(z: string | undefined, zoneIds: string[] = ZONE_IDS): number {
  const i = zoneIds.indexOf(z as never);
  return i < 0 ? -1 : i;
}

function sumBuildingPuestos(b: BuildingDefinition): number {
  return Object.values(b.puestos ?? {}).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
}

export function buildHello(extra: Record<string, unknown> = {}) {
  return {
    t: 'hello',
    proto: PROTO,
    motor: 'gobernador-ts-v2',
    formatoGuardado: SAVE_FORMAT_VERSION,
    ticksPorDia: TICKS_PER_DAY,
    diasPorPeriodo: PERIOD_DAYS,
    mapa: MAPA_ELECCIONES,
    zonas: ZONE_IDS,
    roles: ROLE_IDS.map((id) => {
      const r = ROLE_CATALOG[id as keyof typeof ROLE_CATALOG];
      return { id, nombre: r.nombre, grupo: r.grupo, color: r.color, publico: !!r.publico };
    }),
    acciones: ACTION_TABLE.map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, efectos: a.efectos.map((e) => e.id) })),
    edificios: Object.values(BUILDING_CATALOG).map((b) => ({
      tipo: b.tipo,
      nombre: b.nombre,
      categoria: b.categoria,
      rubro: b.rubro ?? null,
      costo: b.costoObra,
      diasObra: b.diasObra,
      mantenimientoPeriodo: b.mantenimientoPeriodo,
      areaServicio: b.areaServicio ?? null,
      construible: b.construibleGobernador && GOVERNOR_BUILDABLE_TYPES.includes(b.tipo),
      requiereG2: !!b.requiereG2,
      camas: b.camasHospital ?? 0,
      puestos: sumBuildingPuestos(b),
      bonusDefensa: b.bonusDefensa ?? b.defensaMuralla ?? 0,
    })),
    palancas: {
      limites: LEVER_BOUNDS,
      obras: OBRAS_LEVEL_TABLE,
      precioMaximo: PRICE_CAP_FACTORS,
      extras: EXTRA_LEVER_BOUNDS,
      comercioExterior: FOREIGN_TRADE_STEPS,
    },
    escenarios: Object.values(SCENARIO_PRESETS).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      subtitulo: s.subtitulo,
      historia: s.historia,
      poblacionDefault: s.poblacionDefault,
      mediosDefault: s.mediosDefault,
      victoria: s.victoria,
      derrota: s.derrota,
      hitos: s.hitos,
      palancasIniciales: s.initialLevers,
      caos: s.caosDefault,
    })),
    ...extra,
  };
}

// ───────── Lugares de rutina (CONTROLES §4): solo para la vista ─────────
export function computeRoutinePlaces(state: GameState): Map<string, { trabajo: number; compras: number }> {
  const out = new Map<string, { trabajo: number; compras: number }>();
  const byType = (...types: string[]) =>
    state.parcelas.filter(
      (p) => p.edificio && p.edificio.estado === 'ocupada' && p.edificio.activo && types.includes(p.edificio.tipo)
    );
  const campos = byType('campo');
  const fabricas = byType('fabrica');
  const comercios = byType('almacen', 'supermercado', 'tienda', 'kiosco', 'restoran', 'bar_cafe');
  const oficinasPriv = byType('oficina_constructora', 'oficina_inmobiliaria', 'oficina_medio', 'oficina_banco', 'peluqueria', 'taller', 'gimnasio', 'cine_teatro', 'club');
  const hospitales = byType('hospital', 'hospital_campana');
  const comisarias = byType('comisaria');
  const escuelas = byType('escuela');
  const oficinas = byType('oficina_publica');
  const parcelIndex = new Map(state.parcelas.map((p, i) => [p.id, i]));
  const idx = (p: Parcela | undefined) => (p ? parcelIndex.get(p.id) ?? -1 : -1);

  let n = 0;
  for (const npc of state.npcs) {
    n++;
    if (!npc.vivo) continue;
    const h = parseInt(npc.id.replace(/\D/g, '') || '0', 10) + n;
    const pick = (list: Parcela[]): number => {
      if (list.length === 0) return -1;
      const same = list.filter((p) => p.zona === npc.zona);
      const pool = same.length > 0 ? same : list;
      return idx(pool[h % pool.length]);
    };
    let trabajo = -1;
    switch (npc.rol) {
      case 'agricultor':
      case 'tecnico': trabajo = pick(campos.length > 0 ? campos : fabricas); break;
      case 'obrero': trabajo = pick(fabricas.length > 0 ? fabricas : comercios); break;
      case 'comerciante': trabajo = pick(comercios); break;
      case 'constructor':
      case 'inmobiliario':
      case 'empresario':
      case 'periodista': trabajo = pick(oficinasPriv.length > 0 ? oficinasPriv : comercios); break;
      case 'policia': trabajo = pick(comisarias); break;
      case 'medico': trabajo = pick(hospitales); break;
      case 'docente':
      case 'estudiante': trabajo = pick(escuelas); break;
      case 'estatal':
      case 'ingeniero': trabajo = pick(oficinas); break;
      default: trabajo = -1;
    }
    out.set(npc.id, { trabajo, compras: pick(comercios) });
  }
  return out;
}

// ───────── Estado diario ─────────
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function buildingStaffing(state: GameState, derived: CommunityDerived) {
  const caps = getBuildingJobCaps(
    state.parcelas, derived.vivos, state.gobierno.palancasVigentes.nivelObras,
    state.config.poblacionInicial, state.gobierno.cuposFijos
  );
  const hosp = computeHospitalFacilities(state);
  const hospById = new Map(hosp.facilities.map((f) => [f.edificioId, f]));
  return { caps, hospById, roles: derived.roles };
}

export function projectParcelas(state: GameState, derived: CommunityDerived) {
  const { caps, hospById, roles } = buildingStaffing(state, derived);
  const activos = getActiveBuildings(state.parcelas);
  const countOf = (t: string) => Math.max(1, activos.filter((b) => b.tipo === t).length);
  return state.parcelas.map((p) => {
    const b = p.edificio;
    let edificio: Record<string, unknown> | null = null;
    if (b) {
      const def = BUILDING_CATALOG[b.tipo];
      let personal = 0;
      let capacidad = 0;
      let usada = 0;
      let sinPersonal = false;
      let lleno = false;
      if (b.estado === 'ocupada' && b.activo) {
        switch (b.tipo) {
          case 'hospital':
          case 'hospital_campana': {
            const f = hospById.get(b.id);
            capacidad = f?.camasEfectivas ?? 0;
            usada = f?.ocupadas ?? 0;
            personal = f?.medicosAsignados ?? 0;
            sinPersonal = b.tipo === 'hospital' && capacidad <= 0;
            lleno = capacidad <= 0 || usada >= capacidad;
            break;
          }
          case 'comisaria': capacidad = Math.round(caps.policia / countOf('comisaria')); personal = Math.min(capacidad, Math.round(roles.policia / countOf('comisaria'))); sinPersonal = personal <= 0; break;
          case 'escuela': capacidad = Math.round(caps.docente / countOf('escuela')); personal = Math.min(capacidad, roles.docente); sinPersonal = personal <= 0; break;
          case 'oficina_publica': capacidad = Math.round(caps.estatal / countOf('oficina_publica')); personal = Math.min(capacidad, roles.estatal); sinPersonal = personal <= 0; break;
          case 'campo': capacidad = Math.round((def.puestos.agricultor ?? 0) * Math.max(0.5, state.config.poblacionInicial / 100)); personal = Math.min(capacidad, Math.round(roles.agricultor / countOf('campo'))); sinPersonal = personal <= 0; break;
          default: {
            capacidad = sumBuildingPuestos(def);
            if (b.firmaId) {
              const firma = state.firmas.find((f) => f.id === b.firmaId);
              personal = firma ? Math.min(capacidad, firma.empleados.length) : 0;
              sinPersonal = capacidad > 0 && personal <= 0;
            }
            break;
          }
        }
      }
      edificio = {
        id: b.id,
        tipo: b.tipo,
        dueno: b.dueno,
        firmaId: b.firmaId ?? null,
        casaId: b.casaId ?? null,
        estado: b.estado,
        activo: b.activo,
        estadoSalud: b.estadoSalud,
        diasObraRestantes: b.diasObraRestantes,
        diasObraTotal: b.diasObraTotal,
        personal,
        capacidad,
        usada,
        sinPersonal,
        lleno,
        stockAgotado: !!def.vendeComida && state.alimento.stock <= 0,
      };
    }
    return {
      id: p.id,
      zona: p.zona,
      tipoParcela: p.tipoParcela,
      estado: p.estado,
      tramoAperturaId: p.tramoAperturaId ?? null,
      edificio,
    };
  });
}

export interface ProjectionCtx {
  seq: number;
  pausado: boolean;
  vel: number;
  devMode: boolean;
  focoNpc: string | null;
  simMs: number;
  ia: { activa: boolean; ocupada: boolean; disponible: boolean };
  esReplay?: boolean;
}

function metricValue(derived: CommunityDerived, m: string): number {
  switch (m) {
    case 'apoyoPct': return derived.apoyoPct;
    case 'hambreCriticaPct': return derived.hambreCriticaPct;
    case 'poblacion': return derived.poblacion;
    case 'poblacionPct': return derived.poblacionPct;
    default: return 0;
  }
}

export function projectState(state: GameState, derived: CommunityDerived, ctx: ProjectionCtx) {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const gov = state.gobierno;
  const fin = gov.finanzas;
  const acum = gov.acumuladoPeriodo;
  const dia = state.reloj.dia;
  const budget = estimatePeriodBudget(state, gov.palancasVigentes);
  const gastoSemana = Math.max(1, budget.gastosEst);
  const places = computeRoutinePlaces(state);
  const allZoneIds = getAllZoneIds(state);
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));

  // ── NPCs (filas compactas)
  const zcount = allZoneIds.length;
  const rows: number[][] = [];
  const porZona: Record<string, { n: number; sat: number; desc: number; hambre: number; miedo: number }> = {};
  for (const z of allZoneIds) porZona[z] = { n: 0, sat: 0, desc: 0, hambre: 0, miedo: 0 };
  state.npcs.forEach((npc, i) => {
    const vivo = npc.vivo;
    const hogar = hogarById.get(npc.hogarId);
    const lugar = vivo ? places.get(npc.id) : undefined;
    const ez = getEffectiveZone(npc, zcount, allZoneIds);
    if (vivo) {
      if (!porZona[ez]) porZona[ez] = { n: 0, sat: 0, desc: 0, hambre: 0, miedo: 0 };
      const pz = porZona[ez];
      pz.n++;
      pz.sat += npc.variables.satisfaccion;
      if (npc.variables.satisfaccion < 30) pz.desc++;
      if (npc.variables.hambre > 80) pz.hambre++;
      pz.miedo += npc.variables.miedo;
    }
    const accionIdx = npc.accionIa ? ACTION_IDS.indexOf(npc.accionIa.id) : -1;
    let flags = 0;
    if (vivo) flags |= 1;
    if (npc.hospital.internado) flags |= 2;
    if (npc.hospital.esperandoCama && !npc.hospital.internado) flags |= 4;
    if (npc.accionIa?.fueraDePuesto) flags |= 8;
    if (npc.accionIa?.esFoco) flags |= 16;
    if (hogar?.noPudoPagarComida) flags |= 32;
    rows.push([
      i,
      ROLE_IDS.indexOf(npc.rol),
      zoneIndex(npc.zona, allZoneIds),
      npc.edad,
      Math.round(npc.variables.salud),
      Math.round(npc.variables.hambre),
      Math.round(npc.variables.miedo),
      Math.round(npc.variables.satisfaccion),
      Math.round(npc.variables.lealtad),
      flags,
      accionIdx,
      zoneIndex(npc.accionIa?.zonaDestino ?? undefined, allZoneIds),
      lugar && lugar.trabajo >= 0 ? lugar.trabajo : -1,
      lugar && lugar.compras >= 0 ? lugar.compras : -1,
      Math.round(hogar?.dinero ?? 0),
    ]);
  });

  const zonas = allZoneIds.map((z: string) => {
    const pz = porZona[z] ?? { n: 0, sat: 0, desc: 0, hambre: 0, miedo: 0 };
    const zDef = state.zonas[z];
    return {
      id: z,
      nombre: zDef?.nombre ?? z,
      estado: zDef?.estado ?? 'activa',
      viaAperturaId: zDef?.viaAperturaId ?? null,
      poblacion: pz.n,
      satisfaccion: pz.n ? round1(pz.sat / pz.n) : 0,
      descontentosPct: pz.n ? round1((pz.desc / pz.n) * 100) : 0,
      hambreCriticaPct: pz.n ? round1((pz.hambre / pz.n) * 100) : 0,
      miedo: pz.n ? round1(pz.miedo / pz.n) : 0,
      defensa: round1(derived.defensa[z] ?? 0),
      orden: round1(derived.orden[z] ?? 0),
      amenaza: round1(derived.amenazaPercibida[z] ?? 0),
      integridad: round1(gov.integridad[z] ?? 100),
    };
  });

  // ── Objetivo
  const v = preset.victoria;
  const d = preset.derrota;
  const hist = state.historial;
  const prev = hist.length > 7 ? hist[hist.length - 8] : hist[0];
  const metricaKey = v.metrica === 'apoyoPct' ? 'apoyo' : v.metrica === 'poblacionPct' || v.metrica === 'poblacion' ? 'poblacion' : 'hambreCritica';
  const valorV = metricValue(derived, v.metrica);
  const tendencia = prev ? Math.sign(Math.round((valorV - ((prev as unknown as Record<string, number>)[metricaKey] ?? valorV)) * 10) / 10) : 0;

  const clima = [
    ...getActivePhenomena(state).map((f) => ({ f, estado: 'activo' as const })),
    ...getAnnouncedPhenomena(state).map((f) => ({ f, estado: 'anunciado' as const })),
  ].map(({ f, estado }) => ({
    id: f.id,
    tipo: f.tipo,
    nombre: f.nombre,
    estado,
    intensidad: Math.round(f.intensidad),
    origen: f.origen ?? null,
    inicioDia: f.inicioDia,
    duracionDias: f.duracionDias,
    diasRestantes: estado === 'activo' ? f.inicioDia + f.duracionDias - dia : f.inicioDia - dia,
  }));

  const foco = ctx.focoNpc ? state.npcs.find((n) => n.id === ctx.focoNpc) : undefined;

  return {
    t: 'state',
    seq: ctx.seq,
    dia,
    tick: state.reloj.tick,
    ticksPorDia: TICKS_PER_DAY,
    anio: state.reloj.anio,
    periodo: state.reloj.periodo,
    diasEnPeriodo: state.reloj.diasEnPeriodo,
    diasParaPago: Math.max(0, PERIOD_DAYS - state.reloj.diasEnPeriodo),
    pausado: ctx.pausado,
    vel: ctx.vel,
    dev: ctx.devMode,
    simMs: ctx.simMs,
    ia: ctx.ia,
    escenario: state.config.escenarioId,
    config: {
      escenarioId: state.config.escenarioId,
      nivelMundo: state.config.nivelMundo ?? 'M2',
      nivelGobernador: state.config.nivelGobernador ?? 'G2',
      estadoAutomatico: !!state.config.estadoAutomatico,
      poblacionInicial: state.config.poblacionInicial,
      cantidadMedios: state.config.cantidadMedios,
      semilla: state.semilla,
      economiaModulo: state.config.economiaModulo,
    },
    resultado: state.resultado,
    objetivo: {
      metrica: v.metrica, op: v.op, umbral: v.umbral, plazoDia: v.plazoDia ?? null, descripcion: v.descripcion,
      valor: valorV, diasRestantes: v.plazoDia ? Math.max(0, v.plazoDia - dia) : null,
      cumplido: !!state.resultado.victoriaCumplida,
      perdido: state.eventos.some((e) => e.tipo === 'objetivo_perdido'),
      tendencia,
      derrota: { metrica: d.metrica, op: d.op, umbral: d.umbral, descripcion: d.descripcion, valor: metricValue(derived, d.metrica) },
      derrotas: [d, ...(preset.derrotasExtra ?? [])].map((c) => ({ metrica: c.metrica, op: c.op, umbral: c.umbral, descripcion: c.descripcion, valor: metricValue(derived, c.metrica) })),
    },
    comunidad: derived,
    zonas,
    tramos: state.tramos ?? [],
    demandaSuelo: state.demandaSuelo ?? {},
    finanzas: {
      reserva: Math.round(gov.reserva * 100) / 100,
      semanasCaja: round1(gov.reserva / gastoSemana),
      inflacion: gov.inflacion,
      ultimoPeriodo: fin,
      periodoActual: { dias: acum.dias, impuestos: acum.impuestos, mantenimiento: acum.mantenimiento, operacion: acum.operacion, obras: acum.obras, prensa: acum.prensa, importaciones: acum.importaciones, exportaciones: acum.exportaciones },
      estimacion: budget,
    },
    comida: {
      stock: Math.round(state.alimento.stock),
      diasStock: round1(state.alimento.diasStock),
      precio: round1(state.alimento.precio * 100) / 100,
      precioBase: ECON_CONSTANTS.precioBaseAlimento,
      produccionDiaria: round1(state.alimento.produccionDiaria),
      consumoDiario: round1(state.alimento.consumoDiario),
      siloDias: state.alimento.siloDias,
    },
    firmas: state.firmas.filter((f) => f.activa).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      rubro: f.rubro,
      zona: f.zona,
      empleados: f.empleados.length,
      locales: f.locales.length,
      caja: Math.round(f.caja),
      ventas: Math.round(f.ventas),
      factor: f.factor,
      ultimaGanancia: Math.round(f.ultimaGanancia),
    })),
    medios: state.medios.map((m) => ({
      id: m.id, nombre: m.nombre, afinidad: m.lineaEditorial.afinidadGobierno, sensacionalismo: m.lineaEditorial.sensacionalismo,
      credibilidad: m.credibilidad, alcancePct: m.alcancePct, dependenciaPct: m.finanzas.dependenciaPct, columnistas: m.columnistas.length,
    })),
    servicios: { indicadores: gov.indicadores, coberturas: gov.coberturas },
    clima,
    parcelas: projectParcelas(state, derived),
    palancas: {
      vigentes: gov.palancasVigentes,
      objetivo: gov.palancasObjetivo,
      bloqueos: state.bloqueosPalanca,
      extras: state.gobierno.extras ?? { vigentes: { subsidioAlimento: 0, presion: 0, acceso: 0, nivelEducacion: 0 }, objetivo: { subsidioAlimento: 0, presion: 0, acceso: 0, nivelEducacion: 0 } },
    },
    demandas: state.demandasActivas,
    medidas: state.medidasVigentes,
    hitos: { cumplidos: state.hitosCumplidos, defs: preset.hitos },
    noticias: state.noticias.slice(0, 30).map((n) => ({
      id: n.id, dia: n.dia, medio: n.medioNombre, medioId: n.medioId, autor: n.autorNombre, tema: n.tema, tono: n.tono,
      alcance: Math.round(n.alcance), credibilidad: n.credibilidad ?? null, titulo: n.titulo, texto: n.texto,
      origen: n.origen, causa: n.causa ?? null, textoOrigen: n.textoOrigen, zona: n.zona ?? null, esAviso: !!n.esAviso,
    })),
    bitacora: state.bitacora.slice(0, 60),
    historial: state.historial.slice(-200),
    npcCols: NPC_COLS,
    npcs: rows,
    foco: foco ? projectNpcFicha(state, foco) : null,
  };
}

export function npcMeta(state: GameState) {
  return state.npcs.map((n) => ({
    id: n.id, nombre: `${n.nombre} ${n.apellido}`.trim(), cumple: n.cumpleanosDia, educ: n.educacion.nivel,
    pers: [n.personalidad.valentia, n.personalidad.laboriosidad, n.personalidad.codicia, n.personalidad.rebeldia, n.personalidad.resiliencia],
  }));
}

export function projectNpcFicha(state: GameState, npc: Npc) {
  const hogar = state.hogares.find((h) => h.id === npc.hogarId);
  return {
    id: npc.id,
    nombre: `${npc.nombre} ${npc.apellido}`.trim(),
    edad: npc.edad,
    rol: npc.rol,
    zona: npc.zona,
    vivo: npc.vivo,
    hogarId: npc.hogarId,
    educ: npc.educacion.nivel,
    personalidad: npc.personalidad,
    variables: npc.variables,
    economia: {
      ...npc.economia,
      dinero: hogar?.dinero ?? 0,
      despensa: hogar?.despensa ?? 0,
      noPudoPagarComida: !!hogar?.noPudoPagarComida,
    },
    hospital: npc.hospital,
    accion: npc.accionIa
      ? { id: npc.accionIa.id, nombre: npc.accionIa.nombre, diasRestantes: npc.accionIa.diasRestantes, zonaDestino: npc.accionIa.zonaDestino ?? null, origen: npc.accionIa.origen, causa: npc.accionIa.causa ?? null, texto: npc.accionIa.texto }
      : null,
    modificadores: npc.modificadores.map((m) => ({ id: m.id, texto: m.texto, afecta: m.afecta, diasRestantes: m.diasRestantes, origen: m.origen, causa: m.causa ?? null })),
    ultimoGolpeCausaId: npc.ultimoGolpeCausaId ?? null,
    dia: state.reloj.dia,
  };
}

export function projectEvent(ev: SimEvent, state: GameState) {
  let texto = '';
  try {
    const step = describeSimEvent(ev, state);
    texto = `${step.titulo}${step.detalle ? ' · ' + step.detalle : ''}`;
  } catch {
    texto = ev.tipo;
  }
  return { ...ev, texto };
}

export { ECON_CONSTANTS };
