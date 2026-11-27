import { LECTURA_CONSTANTS, PERIOD_DAYS } from '../data/catalogs';
import {
  CommunityDerived,
  GameState,
  LecturaAlerta,
  LecturaCausaTop,
  LecturaEstado,
  LecturaIndicador,
  LecturaIndicadorId,
  LecturaInforme,
  LecturaInformeCambio,
  LecturaInterlocutor,
  LecturaNotable,
  LecturaState,
  LecturaTexto,
  SimEvent,
  ZoneId,
} from '../types/game';
import { sumPeriodExpenses } from './policies';
import { clamp, getWorldZones } from './worldHelpers';

const ALL_INDICATOR_IDS: LecturaIndicadorId[] = [
  'poblacion',
  'vivienda',
  'comida',
  'empleo',
  'estado',
  'animo',
  'orden',
];

interface IndicatorMeta {
  higherIsGood: boolean;
  refFloor: number;
  maxVal?: number;
}

const INDICATOR_META: Record<LecturaIndicadorId, IndicatorMeta> = {
  poblacion: { higherIsGood: true, refFloor: 15 },
  vivienda: { higherIsGood: false, refFloor: 4, maxVal: 100 },
  comida: { higherIsGood: true, refFloor: 3 },
  empleo: { higherIsGood: false, refFloor: 4, maxVal: 100 },
  estado: { higherIsGood: true, refFloor: 6 },
  animo: { higherIsGood: true, refFloor: 10, maxVal: 100 },
  orden: { higherIsGood: true, refFloor: 10, maxVal: 100 },
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXX += i * i;
    sumXY += i * values[i];
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function getEventIndicators(ev: SimEvent): LecturaIndicadorId[] {
  switch (ev.tipo) {
    case 'nacimiento':
    case 'muerte':
    case 'migracion_llegada':
    case 'migracion_salida':
      return ['poblacion'];
    case 'desalojo':
    case 'calle_inicio':
    case 'calle_fin':
    case 'casa_construida':
    case 'casa_estado':
    case 'mudanza':
      return ['vivienda', 'animo'];
    case 'firma_quiebra':
    case 'firma_fundada':
    case 'firma_compra':
    case 'empresa_despido':
    case 'empresa_recorte':
    case 'empresa_aumento':
    case 'capacitacion_inicio':
    case 'capacitacion_fin':
      return ['empleo'];
    case 'impago':
    case 'impago_fin':
    case 'via_inicio':
    case 'via_fin':
    case 'obra_inicio':
    case 'obra_fin':
    case 'control':
      return ['estado'];
    case 'fenomeno_inicio':
    case 'fenomeno_fin':
    case 'aviso':
      return ['comida', 'animo'];
    case 'ataque':
      return ev.resultado === 'golpe' ? ['orden', 'animo'] : ['orden'];
    case 'golpe':
    case 'ruta_cortada':
    case 'accion_inicio':
      return ['orden', 'animo'];
    case 'noticia':
    case 'medio_cambio_linea':
    case 'medio_cierre':
      return ['animo'];
    default:
      return [];
  }
}

function getEventRootCause(ev: SimEvent): string {
  if ('causa' in ev && ev.causa) return ev.causa;
  if ('origen' in ev && ev.origen) return ev.origen;
  return ev.tipo;
}

function getEventNpcIds(ev: SimEvent): string[] {
  const ids: string[] = [];
  if ('npcId' in ev && ev.npcId) ids.push(ev.npcId);
  if ('npcIds' in ev && Array.isArray(ev.npcIds)) ids.push(...ev.npcIds);
  if ('duenoId' in ev && ev.duenoId) ids.push(ev.duenoId);
  if ('compradorId' in ev && ev.compradorId) ids.push(ev.compradorId);
  if ('deNpcId' in ev && ev.deNpcId) ids.push(ev.deNpcId);
  if ('autorId' in ev && typeof ev.autorId === 'string' && ev.autorId) ids.push(ev.autorId);
  return ids;
}

function classifyEstadoWithHysteresis(
  id: LecturaIndicadorId,
  valor: number,
  referencia: number,
  prevEstado: LecturaEstado
): LecturaEstado {
  const meta = INDICATOR_META[id];
  const denom = Math.max(meta.refFloor, Math.abs(referencia));
  const badDev = meta.higherIsGood
    ? (referencia - valor) / denom
    : (valor - referencia) / denom;

  const h = LECTURA_CONSTANTS.histeresisFactor;
  const uAt = LECTURA_CONSTANTS.umbralAtencion;
  const uMal = LECTURA_CONSTANTS.umbralMal;

  if (prevEstado === 'mal') {
    if (badDev >= uMal * h) return 'mal';
    if (badDev >= uAt * h) return 'atencion';
    return 'bien';
  }
  if (prevEstado === 'atencion') {
    if (badDev >= uMal) return 'mal';
    if (badDev >= uAt * h) return 'atencion';
    return 'bien';
  }
  if (badDev >= uMal) return 'mal';
  if (badDev >= uAt) return 'atencion';
  return 'bien';
}

function buildIndicatorText(
  id: LecturaIndicadorId,
  valor: number,
  estado: LecturaEstado,
  dir: -1 | 0 | 1
): LecturaTexto {
  const rounded = Number(valor.toFixed(1));
  if (estado === 'bien' && dir === 0) {
    return { clave: `${id}.estable`, params: { val: rounded } };
  }
  if (id === 'vivienda') {
    return {
      clave: dir === 1 ? 'vivienda.calle_sube' : dir === -1 ? 'vivienda.calle_baja' : 'vivienda.estado',
      params: { pct: rounded },
    };
  }
  if (id === 'comida') {
    return {
      clave: dir === -1 ? 'comida.stock_baja' : dir === 1 ? 'comida.stock_sube' : 'comida.estado',
      params: { dias: rounded },
    };
  }
  if (id === 'empleo') {
    return {
      clave: dir === 1 ? 'empleo.desempleo_sube' : dir === -1 ? 'empleo.desempleo_baja' : 'empleo.estado',
      params: { pct: rounded },
    };
  }
  if (id === 'estado') {
    return {
      clave: dir === -1 ? 'estado.reserva_baja' : dir === 1 ? 'estado.reserva_sube' : 'estado.equilibrio',
      params: { dias: rounded },
    };
  }
  if (id === 'animo') {
    return {
      clave: dir === -1 ? 'animo.baja' : dir === 1 ? 'animo.sube' : 'animo.estable',
      params: { val: rounded },
    };
  }
  if (id === 'orden') {
    return {
      clave: dir === -1 ? 'orden.baja' : dir === 1 ? 'orden.sube' : 'orden.estable',
      params: { val: rounded },
    };
  }
  return {
    clave: dir === 1 ? 'poblacion.crece' : dir === -1 ? 'poblacion.baja' : 'poblacion.estable',
    params: { val: Math.round(valor) },
  };
}

function computeReserveDays(state: GameState, popCount: number): number {
  const lastPeriodSpend = sumPeriodExpenses(state.gobierno.finanzas);
  const dailyOutflowEstimate = Math.max(
    12,
    lastPeriodSpend > 0 ? lastPeriodSpend / PERIOD_DAYS : Math.max(1, popCount) * 1.35
  );
  return clamp(state.gobierno.reserva / dailyOutflowEstimate, 0, 999);
}

function computePrimaryMetrics(
  state: GameState,
  derived: CommunityDerived
): Record<LecturaIndicadorId, number> {
  const reserveDays = computeReserveDays(state, derived.poblacion);
  const ordenVals = Object.values(derived.orden);
  const meanOrden =
    ordenVals.length > 0
      ? ordenVals.reduce((s, v) => s + v, 0) / ordenVals.length
      : state.gobierno.indicadores.seguridad;
  const ordenVal = Number(((state.gobierno.indicadores.seguridad + meanOrden) / 2).toFixed(1));
  return {
    poblacion: derived.poblacion,
    vivienda: Number(derived.callePct.toFixed(1)),
    comida: Number(state.alimento.diasStock.toFixed(1)),
    empleo: Number(derived.desempleoPct.toFixed(1)),
    estado: Number(reserveDays.toFixed(1)),
    animo: Number(derived.satisfaccionMedia.toFixed(1)),
    orden: ordenVal,
  };
}

function computeZoneMetrics(
  state: GameState,
  zones: ZoneId[]
): Record<ZoneId, Record<LecturaIndicadorId, number>> {
  const result: Record<ZoneId, Record<LecturaIndicadorId, number>> = {};
  const npcsByZone = new Map<ZoneId, typeof state.npcs>();
  const hogaresByZone = new Map<ZoneId, typeof state.hogares>();
  for (const z of zones) {
    npcsByZone.set(z, []);
    hogaresByZone.set(z, []);
  }
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    npcsByZone.get(n.zona)?.push(n);
  }
  for (const h of state.hogares) {
    if (h.estado === 'acogida') continue;
    hogaresByZone.get(h.zona)?.push(h);
  }

  const popTotal = Math.max(1, state.npcs.filter((n) => n.vivo).length);
  const baseReserveDays = computeReserveDays(state, popTotal);

  for (const z of zones) {
    const zNpcs = npcsByZone.get(z) ?? [];
    const zHog = hogaresByZone.get(z) ?? [];
    const zPop = zNpcs.length;
    const zCalle = zHog.length > 0 ? (zHog.filter((h) => h.estado === 'calle').length / zHog.length) * 100 : 0;
    const zAct = zNpcs.filter((n) => n.edad >= 18 && n.edad < 65);
    const zDesemp = zAct.length > 0 ? (zAct.filter((n) => n.rol === 'desempleado').length / zAct.length) * 100 : 0;
    const zSat =
      zNpcs.length > 0
        ? zNpcs.reduce((s, n) => s + n.variables.satisfaccion, 0) / zNpcs.length
        : 60;
    const zSeg = state.ultimaDefensaZona[z] ?? state.gobierno.indicadores.seguridad;
    const zOrd = state.ultimaOrdenZona?.[z] ?? state.ultimaIntegridadZona[z] ?? state.gobierno.indicadores.seguridad;
    const zOrden = (zSeg + zOrd) / 2;
    const zPrice = state.ultimaSalidaEconomica.precioAlimento[z] ?? state.alimento.precio;
    const priceRatio = state.alimento.precio > 0 ? state.alimento.precio / Math.max(0.5, zPrice) : 1;
    const zComida = clamp(state.alimento.diasStock * priceRatio, 0, 99);
    const zPublicBlds = state.parcelas.filter(
      (p) => p.zona === z && p.edificio?.dueno === 'estado' && p.edificio.activo
    );
    const zPublicHealth =
      zPublicBlds.length > 0
        ? zPublicBlds.reduce((s, p) => s + (p.edificio?.estadoSalud ?? 100), 0) / (zPublicBlds.length * 100)
        : 0.85;
    const zPendingWorks = state.parcelas.filter(
      (p) => p.zona === z && p.estado === 'en_obra' && p.edificio?.dueno === 'estado'
    ).length;
    const zEstadoPenalty = state.gobierno.finanzas.impago ? 0.5 : Math.max(0.65, zPublicHealth - zPendingWorks * 0.05);
    const zEstado = clamp(baseReserveDays * zEstadoPenalty, 0, 999);

    result[z] = {
      poblacion: zPop,
      vivienda: Number(zCalle.toFixed(1)),
      comida: Number(zComida.toFixed(1)),
      empleo: Number(zDesemp.toFixed(1)),
      estado: Number(zEstado.toFixed(1)),
      animo: Number(zSat.toFixed(1)),
      orden: Number(zOrden.toFixed(1)),
    };
  }
  return result;
}

function getActiveOrder(state: GameState): LecturaIndicadorId[] {
  const hasOrden =
    state.config.nivelMundo === 'M2' ||
    state.config.nivelMundo === 'M3' ||
    state.config.nivelMundo === 'M4';
  return hasOrden
    ? ['poblacion', 'vivienda', 'comida', 'empleo', 'estado', 'animo', 'orden']
    : ['poblacion', 'vivienda', 'comida', 'empleo', 'estado', 'animo'];
}

export function initLecturaState(state: GameState, derived: CommunityDerived): LecturaState {
  const zones = getWorldZones(state);
  const metrics = computePrimaryMetrics(state, derived);
  const zoneMetrics = computeZoneMetrics(state, zones);
  const indicadores = {} as Record<LecturaIndicadorId, LecturaIndicador>;

  for (const id of ALL_INDICATOR_IDS) {
    const val = metrics[id];
    const seriesPorZona: Record<ZoneId, number[]> = {};
    for (const z of zones) {
      seriesPorZona[z] = [zoneMetrics[z]?.[id] ?? val];
    }
    indicadores[id] = {
      id,
      valor: val,
      referencia: val,
      estado: 'bien',
      tendencia: { dir: 0, magnitud: 0 },
      serie: [val],
      seriePeriodos: [],
      serieAnios: [],
      seriesPorZona,
      causasTop: [],
      texto: buildIndicatorText(id, val, 'bien', 0),
    };
  }

  return {
    indicadores,
    ordenIndicadores: getActiveOrder(state),
    alertas: [],
    ultimoAlertaDiaPorClave: {},
    rachasTendenciaMala: {
      poblacion: 0,
      vivienda: 0,
      comida: 0,
      empleo: 0,
      estado: 0,
      animo: 0,
      orden: 0,
    },
    notables: [],
    informes: [],
    ultimoDiaActualizado: state.reloj.dia,
    ultimoPeriodoActualizado: state.reloj.periodo,
  };
}

function ensureLectura(state: GameState, derived: CommunityDerived): LecturaState {
  if (!state.lectura) {
    state.lectura = initLecturaState(state, derived);
  } else {
    state.lectura.ordenIndicadores = getActiveOrder(state);
  }
  return state.lectura;
}

function addAlertIfReady(
  lectura: LecturaState,
  dia: number,
  indicador: LecturaIndicadorId,
  entidad: string,
  severidad: 1 | 2 | 3,
  causa: string | undefined,
  texto: LecturaTexto
): void {
  const dedupeKey = `${indicador}:${entidad}`;
  const lastDay = lectura.ultimoAlertaDiaPorClave[dedupeKey];
  if (lastDay !== undefined && dia - lastDay < LECTURA_CONSTANTS.enfriamientoAlertaDias) {
    // Update existing active alert severity if escalated
    const existing = lectura.alertas.find(
      (a) => a.activa && a.indicador === indicador && a.entidad === entidad
    );
    if (existing && severidad > existing.severidad) {
      existing.severidad = severidad;
      existing.texto = texto;
      existing.causa = causa;
    }
    return;
  }

  // Close older duplicate for same indicator + entity
  for (const a of lectura.alertas) {
    if (a.activa && a.indicador === indicador && a.entidad === entidad) {
      a.activa = false;
    }
  }

  lectura.alertas.unshift({
    id: `al_${dia}_${indicador}_${entidad}`,
    severidad,
    indicador,
    entidad,
    causa,
    dia,
    activa: true,
    texto,
  });
  lectura.ultimoAlertaDiaPorClave[dedupeKey] = dia;
  if (lectura.alertas.length > 60) {
    lectura.alertas.length = 60;
  }
}

export function updateLecturaDaily(state: GameState, derived: CommunityDerived): void {
  if (state.config.lecturaActiva === false) return;
  const lectura = ensureLectura(state, derived);
  const dia = state.reloj.dia;
  const zones = getWorldZones(state);
  const metrics = computePrimaryMetrics(state, derived);
  const zoneMetrics = computeZoneMetrics(state, zones);

  // Mark notable events on today's event stream (read-only annotation)
  if (lectura.notables.length > 0 && state.eventosDiaActual.length > 0) {
    const notableSet = new Set(lectura.notables.map((n) => n.npcId));
    for (const ev of state.eventosDiaActual) {
      const nIds = getEventNpcIds(ev);
      if (nIds.some((id) => notableSet.has(id))) {
        ev.notable = true;
      }
    }
  }

  const minCauseDay = Math.max(0, dia - LECTURA_CONSTANTS.ventanaTendencia);
  const recentEvents = state.eventos.filter((e) => e.dia >= minCauseDay);

  for (const id of ALL_INDICATOR_IDS) {
    const ind = lectura.indicadores[id];
    const val = metrics[id];
    const prevEstado = ind.estado;
    ind.valor = val;

    ind.serie.push(val);
    if (ind.serie.length > LECTURA_CONSTANTS.ventanaSerieDias) {
      ind.serie.shift();
    }
    for (const z of zones) {
      const arr = ind.seriesPorZona[z] ?? [];
      arr.push(zoneMetrics[z]?.[id] ?? val);
      if (arr.length > LECTURA_CONSTANTS.ventanaSerieDias) arr.shift();
      ind.seriesPorZona[z] = arr;
    }

    const refWindow = ind.serie.slice(-LECTURA_CONSTANTS.ventanaReferencia);
    const refVal = refWindow.length > 0 ? Number(median(refWindow).toFixed(2)) : val;
    ind.referencia = refVal;

    const trendWindow = ind.serie.slice(-LECTURA_CONSTANTS.ventanaTendencia);
    const slope = linearSlope(trendWindow);
    const meta = INDICATOR_META[id];
    const denom = Math.max(meta.refFloor, Math.abs(refVal));
    const relSpan = (slope * trendWindow.length) / denom;
    const dir: -1 | 0 | 1 =
      Math.abs(relSpan) < LECTURA_CONSTANTS.bandaEstable ? 0 : slope > 0 ? 1 : -1;
    const magnitud = Number(Math.abs(relSpan).toFixed(2));
    ind.tendencia = { dir, magnitud };

    const nextEstado = classifyEstadoWithHysteresis(id, val, refVal, prevEstado);
    ind.estado = nextEstado;

    // Causes top 3
    const byCause = new Map<string, { score: number; eventoRaizId: string }>();
    for (const ev of recentEvents) {
      const affected = getEventIndicators(ev);
      if (!affected.includes(id)) continue;
      const cause = getEventRootCause(ev);
      const ageWeight = Math.max(0.25, 1 - (dia - ev.dia) / Math.max(1, LECTURA_CONSTANTS.ventanaTendencia));
      const cur = byCause.get(cause);
      if (cur) {
        cur.score += ageWeight;
      } else {
        byCause.set(cause, { score: ageWeight, eventoRaizId: ev.id });
      }
    }
    const totalScore = Array.from(byCause.values()).reduce((s, c) => s + c.score, 0);
    const causasTop: LecturaCausaTop[] = Array.from(byCause.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([causa, info]) => ({
        causa,
        peso: totalScore > 0 ? Number((info.score / totalScore).toFixed(2)) : 0,
        eventoRaizId: info.eventoRaizId,
      }));
    ind.causasTop = causasTop;
    ind.texto = buildIndicatorText(id, val, nextEstado, dir);

    const isVisibleIndicator = lectura.ordenIndicadores.includes(id);
    if (!isVisibleIndicator) continue;

    // Track bad trend streak
    const badTrend = (meta.higherIsGood && dir === -1) || (!meta.higherIsGood && dir === 1);
    lectura.rachasTendenciaMala[id] = badTrend ? (lectura.rachasTendenciaMala[id] ?? 0) + 1 : 0;

    // Close active alerts on 'bien'
    if (nextEstado === 'bien') {
      for (const a of lectura.alertas) {
        if (a.activa && a.indicador === id && a.entidad === 'ciudad') {
          a.activa = false;
        }
      }
    }

    // Generate alert on state escalation or sustained bad trend
    if (
      (nextEstado === 'atencion' || nextEstado === 'mal') &&
      (prevEstado === 'bien' || (prevEstado === 'atencion' && nextEstado === 'mal'))
    ) {
      addAlertIfReady(
        lectura,
        dia,
        id,
        'ciudad',
        nextEstado === 'mal' ? 3 : 2,
        causasTop[0]?.causa,
        ind.texto
      );
    } else if (lectura.rachasTendenciaMala[id] >= LECTURA_CONSTANTS.periodosTendenciaMala * 3) {
      addAlertIfReady(
        lectura,
        dia,
        id,
        'ciudad',
        nextEstado === 'mal' ? 3 : 1,
        causasTop[0]?.causa,
        ind.texto
      );
    }
  }

  // Severe single-day event alerts
  const dayDeaths = state.eventosDiaActual.filter((e) => e.tipo === 'muerte');
  if (dayDeaths.length >= 3) {
    addAlertIfReady(
      lectura,
      dia,
      'poblacion',
      'mortalidad',
      3,
      getEventRootCause(dayDeaths[0]),
      { clave: 'alerta.muertes_multiples', params: { cantidad: dayDeaths.length } }
    );
  }
  for (const ev of state.eventosDiaActual) {
    if (ev.tipo === 'firma_quiebra' && ev.cantidadDespedidos >= 4) {
      addAlertIfReady(
        lectura,
        dia,
        'empleo',
        ev.firmaId,
        2,
        ev.causa ?? ev.id,
        { clave: 'alerta.quiebra_grande', params: { firma: ev.firmaId, despidos: ev.cantidadDespedidos } }
      );
    } else if (ev.tipo === 'ruta_cortada') {
      addAlertIfReady(
        lectura,
        dia,
        'orden',
        ev.zona,
        3,
        ev.causa ?? ev.id,
        { clave: 'alerta.zona_aislada', params: { zona: ev.zona } }
      );
    } else if (ev.tipo === 'impago') {
      addAlertIfReady(
        lectura,
        dia,
        'estado',
        'fisco',
        3,
        ev.causa ?? ev.id,
        { clave: 'alerta.impago_estado', params: { faltante: Math.round(ev.faltante) } }
      );
    } else if (ev.tipo === 'ataque' && ev.resultado === 'golpe') {
      addAlertIfReady(
        lectura,
        dia,
        'orden',
        ev.zona,
        3,
        ev.causa ?? ev.id,
        {
          clave: 'alerta.ataque',
          params: ev.zonaOrigen ? { zona: ev.zona, origen: ev.zonaOrigen } : { zona: ev.zona },
        }
      );
    } else if (ev.tipo === 'golpe') {
      addAlertIfReady(
        lectura,
        dia,
        'orden',
        ev.zona,
        3,
        ev.causa ?? ev.id,
        { clave: 'alerta.golpe', params: { zona: ev.zona } }
      );
    }
  }

  // Full 365-day year compaction when year advances
  const prevAnio = Math.floor((Math.max(1, lectura.ultimoDiaActualizado) - 1) / 365) + 1;
  if (state.reloj.anio > prevAnio) {
    const periodsPerYear = Math.max(1, Math.round(365 / PERIOD_DAYS));
    for (const id of ALL_INDICATOR_IDS) {
      const ind = lectura.indicadores[id];
      ind.serieAnios = ind.serieAnios ?? [];
      if (ind.serieAnios.some((a) => a.anio === prevAnio)) continue;
      const periodSlice = (ind.seriePeriodos ?? []).slice(-periodsPerYear);
      const sourceVals =
        periodSlice.length > 0 ? periodSlice.map((p) => p.valor) : ind.serie;
      const avgAnio =
        sourceVals.reduce((s, v) => s + v, 0) / Math.max(1, sourceVals.length);
      ind.serieAnios.push({ anio: prevAnio, valor: Number(avgAnio.toFixed(1)) });
      if (ind.serieAnios.length > 50) ind.serieAnios.shift();
    }
  }

  lectura.ultimoDiaActualizado = dia;
}

function deriveNotablesPayday(state: GameState, prevNotables: LecturaNotable[]): LecturaNotable[] {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);
  const cap = Math.min(
    LECTURA_CONSTANTS.notablesMax,
    Math.max(1, Math.floor(LECTURA_CONSTANTS.notablesPct * pop))
  );
  const prevByNpc = new Map(prevNotables.map((n) => [n.npcId, n]));
  const npcById = new Map(vivos.map((n) => [n.id, n]));
  const dia = state.reloj.dia;

  const candidates: Array<Omit<LecturaNotable, 'diaIngreso'> & { diaIngreso?: number }> = [];

  // 1. Empresarios (majority owner of active firms)
  for (const f of state.firmas) {
    if (!f.activa || f.partes.length === 0) continue;
    const npcParts = f.partes.filter((p) => p.tipo === 'npc').sort((a, b) => b.pct - a.pct);
    const top = npcParts[0];
    if (!top || top.pct < 40) continue;
    const owner = npcById.get(top.id);
    if (!owner) continue;
    const maxShare = Math.max(0, ...Object.values(f.cuotaZona));
    const peso = Number(
      clamp(maxShare * 42 + f.empleados.length * 2.8 + clamp(f.caja / 18, 0, 30), 0, 100).toFixed(1)
    );
    candidates.push({
      npcId: owner.id,
      nombre: owner.nombre,
      tipo: 'empresario',
      motivo: `${f.nombre} (${f.empleados.length} emp.)`,
      peso,
      zona: f.zona,
      firmaId: f.id,
    });
  }

  // 2. Medios (owner or lead columnist of active MediaOutlet)
  for (const m of state.medios) {
    if (m.activa === false) continue;
    const repId = m.duenoNpcIds[0] ?? m.columnistas[0];
    const rep = repId ? npcById.get(repId) : undefined;
    if (!rep) continue;
    const peso = Number(clamp((m.alcancePct * m.credibilidad) / 65, 0, 100).toFixed(1));
    candidates.push({
      npcId: rep.id,
      nombre: rep.nombre,
      tipo: 'medio',
      motivo: `${m.nombre} (${Math.round(m.alcancePct)}% alc.)`,
      peso,
      zona: m.zona ?? 'centro',
      medioId: m.id,
    });
  }

  // Deduplicate keeping highest weight per NPC
  const bestByNpc = new Map<string, Omit<LecturaNotable, 'diaIngreso'>>();
  for (const c of candidates) {
    const existing = bestByNpc.get(c.npcId);
    if (!existing || c.peso > existing.peso) {
      bestByNpc.set(c.npcId, c);
    }
  }

  const nextList: LecturaNotable[] = [];
  for (const c of bestByNpc.values()) {
    const prev = prevByNpc.get(c.npcId);
    if (prev) {
      const age = dia - prev.diaIngreso;
      if (c.peso >= LECTURA_CONSTANTS.pesoBajo || age < LECTURA_CONSTANTS.diasMinNotable) {
        nextList.push({ ...c, diaIngreso: prev.diaIngreso });
      }
    } else if (c.peso >= LECTURA_CONSTANTS.pesoAlto) {
      nextList.push({ ...c, diaIngreso: dia });
    }
  }

  nextList.sort((a, b) => b.peso - a.peso);
  return nextList.slice(0, cap);
}

export function updateLecturaPayday(state: GameState, derived: CommunityDerived): void {
  if (state.config.lecturaActiva === false) return;
  const lectura = ensureLectura(state, derived);
  const dia = state.reloj.dia;
  const periodo = state.reloj.periodo;

  // 1. Update notables with hysteresis
  lectura.notables = deriveNotablesPayday(state, lectura.notables);

  // 2. Append period compaction on indicator series
  for (const id of ALL_INDICATOR_IDS) {
    const ind = lectura.indicadores[id];
    ind.seriePeriodos = ind.seriePeriodos ?? [];
    ind.seriePeriodos.push({ periodo, valor: ind.valor });
    if (ind.seriePeriodos.length > 104) ind.seriePeriodos.shift();
  }

  // 3. Build period report (top 3 indicator shifts + notable events)
  const cambios: Array<LecturaInformeCambio & { score: number }> = [];
  const periodStartDay = Math.max(1, dia - PERIOD_DAYS);
  const periodEvents = state.eventos.filter((e) => e.dia >= periodStartDay);

  for (const id of lectura.ordenIndicadores) {
    const ind = lectura.indicadores[id];
    const window = ind.serie.slice(-PERIOD_DAYS);
    const antes = window.length > 0 ? window[0] : ind.valor;
    const despues = ind.valor;
    const estadoAntes = classifyEstadoWithHysteresis(id, antes, ind.referencia, 'bien');
    const estadoDespues = ind.estado;
    const stateJump = estadoAntes !== estadoDespues ? 1.5 : 0;
    const relChange = Math.abs(despues - antes) / Math.max(INDICATOR_META[id].refFloor, Math.abs(ind.referencia));
    const score = stateJump + relChange;

    const topCause = ind.causasTop[0];
    const entidades = Array.from(
      new Set(
        periodEvents
          .filter((ev) => getEventIndicators(ev).includes(id))
          .map((ev) => ev.zona)
      )
    ).slice(0, 3);

    cambios.push({
      score,
      indicador: id,
      antes: Number(antes.toFixed(1)),
      despues: Number(despues.toFixed(1)),
      estadoAntes,
      estadoDespues,
      causaPrincipal: topCause?.causa,
      eventoRaizId: topCause?.eventoRaizId,
      entidades,
      texto: {
        clave: `informe.${id}`,
        params: {
          antes: Number(antes.toFixed(1)),
          despues: Number(despues.toFixed(1)),
          estado: estadoDespues,
        },
      },
    });
  }

  cambios.sort((a, b) => b.score - a.score);
  const topCambios: LecturaInformeCambio[] = cambios.slice(0, 3).map(({ score: _s, ...rest }) => rest);

  const hechosNotables = periodEvents
    .filter((ev) => ev.notable)
    .slice(-10)
    .map((ev) => ({
      eventoId: ev.id,
      dia: ev.dia,
      tipo: ev.tipo,
      npcId: getEventNpcIds(ev)[0],
      zona: ev.zona,
      texto: {
        clave: `notable.${ev.tipo}`,
        params: { zona: ev.zona, dia: ev.dia },
      },
    }));

  const informe: LecturaInforme = {
    periodo,
    dia,
    cambios: topCambios,
    hechosNotables,
  };
  lectura.informes.unshift(informe);
  if (lectura.informes.length > 24) {
    lectura.informes.length = 24;
  }
  lectura.ultimoPeriodoActualizado = periodo;
}

// ============================================================================
// Contrato §7: consultas del motor (solo lectura)
// ============================================================================

export function indicadores_resumen(state: GameState): LecturaIndicador[] {
  const l = state.lectura;
  if (!l) return [];
  return l.ordenIndicadores.map((id) => l.indicadores[id]).filter(Boolean);
}

export function indicador(state: GameState, id: LecturaIndicadorId): LecturaIndicador | undefined {
  return state.lectura?.indicadores[id];
}

export function alertas(
  state: GameState,
  filtro?: { soloActivas?: boolean; indicador?: LecturaIndicadorId; severidadMin?: 1 | 2 | 3 }
): LecturaAlerta[] {
  const list = state.lectura?.alertas ?? [];
  return list
    .filter((a) => {
      if (filtro?.soloActivas !== false && !a.activa) return false;
      if (filtro?.indicador && a.indicador !== filtro.indicador) return false;
      if (filtro?.severidadMin && a.severidad < filtro.severidadMin) return false;
      return true;
    })
    .sort((a, b) => (b.severidad !== a.severidad ? b.severidad - a.severidad : b.dia - a.dia));
}

export function alertas_visibles(state: GameState): LecturaAlerta[] {
  return alertas(state, { soloActivas: true }).slice(0, LECTURA_CONSTANTS.alertasVisiblesMax);
}

export function serie(
  state: GameState,
  id: LecturaIndicadorId,
  zona?: ZoneId,
  desde?: number,
  hasta?: number,
  resolucion: 'dia' | 'periodo' | 'anio' = 'dia'
): number[] {
  const ind = state.lectura?.indicadores[id];
  if (!ind) return [];
  const raw =
    resolucion === 'periodo'
      ? (ind.seriePeriodos ?? []).map((p) => p.valor)
      : resolucion === 'anio'
      ? (ind.serieAnios ?? []).map((a) => a.valor)
      : zona
      ? ind.seriesPorZona[zona] ?? ind.serie
      : ind.serie;
  if (desde === undefined && hasta === undefined) return [...raw];
  const start = Math.max(0, desde ?? 0);
  const end = hasta !== undefined ? Math.min(raw.length, hasta) : raw.length;
  return raw.slice(start, end);
}

export function historial(
  state: GameState,
  filtro?: { zona?: ZoneId; tipo?: SimEvent['tipo']; soloNotables?: boolean; desdeDia?: number; hastaDia?: number },
  pagina = 0,
  tamPagina = 25
): { items: SimEvent[]; total: number; pagina: number } {
  const filtered = [...state.eventos]
    .reverse()
    .filter((ev) => {
      if (filtro?.zona && ev.zona !== filtro.zona) return false;
      if (filtro?.tipo && ev.tipo !== filtro.tipo) return false;
      if (filtro?.soloNotables && !ev.notable) return false;
      if (filtro?.desdeDia !== undefined && ev.dia < filtro.desdeDia) return false;
      if (filtro?.hastaDia !== undefined && ev.dia > filtro.hastaDia) return false;
      return true;
    });
  const start = Math.max(0, pagina) * tamPagina;
  return {
    items: filtered.slice(start, start + tamPagina),
    total: filtered.length,
    pagina,
  };
}

export function causas(state: GameState, eventoId: string): SimEvent[] {
  const byId = new Map(state.eventos.map((e) => [e.id, e]));
  const chain: SimEvent[] = [];
  let cursor: string | undefined = eventoId;
  const visited = new Set<string>();
  for (let i = 0; i < 8 && cursor; i++) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const ev = byId.get(cursor);
    if (!ev) break;
    chain.push(ev);
    cursor = 'causa' in ev ? ev.causa : undefined;
  }
  return chain;
}

export function informe(state: GameState, n = 0): LecturaInforme | undefined {
  const list = state.lectura?.informes ?? [];
  return list[Math.max(0, n)];
}

export function notables(state: GameState, tipo?: 'empresario' | 'medio'): LecturaNotable[] {
  const list = state.lectura?.notables ?? [];
  return tipo ? list.filter((n) => n.tipo === tipo) : [...list];
}

export function interlocutor(state: GameState, npcId: string): LecturaInterlocutor | undefined {
  const not = state.lectura?.notables.find((n) => n.npcId === npcId);
  const npc = state.npcs.find((n) => n.id === npcId && n.vivo);
  if (!not || !npc) return undefined;
  const postura = Math.round(
    clamp((npc.variables.lealtad * 0.55 + npc.variables.satisfaccion * 0.45) * 2 - 100, -100, 100)
  );
  const intereses: string[] = [];
  if (not.tipo === 'empresario') {
    intereses.push('margen_empresarial', 'infraestructura', 'estabilidad_fiscal');
  } else {
    intereses.push('alcance_audiencia', 'credibilidad', 'libertad_editorial');
  }
  return {
    npcId: npc.id,
    tipo: not.tipo,
    posturaHaciaEstado: postura,
    intereses,
    pedidos: [],
  };
}

// Key -> readable Spanish string formatter for UI (zero AI, strictly keyed)
export function formatLecturaTexto(texto: LecturaTexto): string {
  const p = texto.params;
  switch (texto.clave) {
    case 'poblacion.crece':
      return `Población en alza (${p.val} hab.)`;
    case 'poblacion.baja':
      return `Descenso poblacional (${p.val} hab.)`;
    case 'poblacion.estable':
      return `Población estable (${p.val} hab.)`;
    case 'vivienda.calle_sube':
      return `Sube la gente en calle (${p.pct}%)`;
    case 'vivienda.calle_baja':
      return `Baja la gente en calle (${p.pct}%)`;
    case 'vivienda.estado':
    case 'vivienda.estable':
      return `Situación habitacional (${p.pct}% en calle)`;
    case 'comida.stock_baja':
      return `Bajan las reservas (${p.dias} días de stock)`;
    case 'comida.stock_sube':
      return `Suben las reservas (${p.dias} días de stock)`;
    case 'comida.estado':
    case 'comida.estable':
      return `Abasto alimentario (${p.dias} días de stock)`;
    case 'empleo.desempleo_sube':
      return `Sube el desempleo (${p.pct}%)`;
    case 'empleo.desempleo_baja':
      return `Baja el desempleo (${p.pct}%)`;
    case 'empleo.estado':
    case 'empleo.estable':
      return `Desempleo en ${p.pct}%`;
    case 'estado.reserva_baja':
      return `Reserva pública ajustada (${p.dias} días)`;
    case 'estado.reserva_sube':
      return `Reserva pública en alza (${p.dias} días)`;
    case 'estado.equilibrio':
    case 'estado.estable':
      return `Cuentas públicas (${p.dias} días de reserva)`;
    case 'animo.baja':
      return `Cae el ánimo social (${p.val}%)`;
    case 'animo.sube':
      return `Mejora el ánimo social (${p.val}%)`;
    case 'animo.estable':
      return `Ánimo social estable (${p.val}%)`;
    case 'orden.baja':
      return `Se resiente el orden (${p.val}%)`;
    case 'orden.sube':
      return `Mejora el orden (${p.val}%)`;
    case 'orden.estable':
      return `Orden y seguridad (${p.val}%)`;
    case 'alerta.muertes_multiples':
      return `${p.cantidad} fallecimientos en la jornada`;
    case 'alerta.quiebra_grande':
      return `Quiebra de firma ${p.firma} (${p.despidos} despidos)`;
    case 'alerta.zona_aislada':
      return `Zona ${p.zona} quedó incomunicada`;
    case 'alerta.impago_estado':
      return `Impago fiscal por $${p.faltante}`;
    case 'alerta.ataque':
      return p.origen ? `Ataque en zona ${p.zona} (desde ${p.origen})` : `Ataque en zona ${p.zona}`;
    case 'alerta.golpe':
      return `Golpe a la población en zona ${p.zona}`;
    default:
      if (texto.clave.startsWith('informe.')) {
        const indName = texto.clave.replace('informe.', '');
        return `${indName}: ${p.antes} → ${p.despues} (${p.estado})`;
      }
      if (texto.clave.startsWith('notable.')) {
        return `Hecho destacado (${texto.clave.replace('notable.', '')}) en ${p.zona}`;
      }
      return `${texto.clave}`;
  }
}
