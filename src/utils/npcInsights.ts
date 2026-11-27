import { ROLE_CATALOG } from '../data/catalogs';
import { CommunityDerived, GameState, Npc, ZoneId } from '../types/game';
import { MapLens } from '../types/ui';
import { getEffectiveZone, getWorldZones } from '../engine/simulation';

function hashIndex(id: string, len: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

export function getNpcZoneName(npc: Npc, state?: GameState): string {
  const zDef = state?.zonas?.[npc.zona];
  if (zDef?.nombre) return zDef.nombre;
  return npc.zona.charAt(0).toUpperCase() + npc.zona.slice(1);
}

/**
 * Factor dominante en el ánimo actual del NPC (UI_PROTOTIPO §5).
 * Calculado solo para visualización a partir de su estado real.
 */
export function evaluateNpcTopMoodFactor(npc: Npc, state?: GameState): string {
  if (!npc.vivo) return 'Fallecido';
  if (npc.hospital.esperandoCama) return 'No hay camas en el hospital';
  if (npc.hospital.internado) return 'Internado en recuperación';
  const hogar = state?.hogares.find((h) => h.id === npc.hogarId);
  if (hogar?.estado === 'calle') return 'Sin vivienda en la zona';
  if (npc.variables.hambre > 75) return 'Falta alimento en el hogar';
  if (hogar && hogar.miembros.length > 0) {
    const despPP = hogar.despensa / hogar.miembros.length;
    if (despPP < 1.2) return 'Despensa casi vacía';
  }
  if (npc.variables.miedo > 65) return 'Miedo por amenazas en la zona';
  if (npc.rol === 'desempleado') return 'Sin empleo estable';
  const empFirm = npc.empleadorId ? state?.firmas.find((f) => f.id === npc.empleadorId) : undefined;
  if (empFirm && empFirm.factor < 0.92) return `Le recortaron el sueldo (${empFirm.nombre})`;
  if (hogar && hogar.periodosSinPagar > 0) return 'Atraso en el alquiler';
  if (npc.variables.satisfaccion >= 72) return 'Ingresos y servicios estables';
  if (npc.variables.satisfaccion < 35) return 'Descontento por impuestos y costo de vida';
  if (empFirm && empFirm.factor > 1.05) return `Buen sueldo en ${empFirm.nombre}`;
  return 'Rutina diaria sin sobresaltos';
}

export function evaluateNpcBubbleText(npc: Npc): string {
  if (npc.hospital.internado) return 'En recuperación médica';
  if (npc.hospital.esperandoCama) return 'Esperando cama disponible';
  if (npc.accionIa) {
    if (npc.accionIa.id === 'huelga') return '¡Exigimos nuestros pagos!';
    if (npc.accionIa.id === 'protesta') return '¡Queremos respuestas!';
    if (npc.accionIa.id === 'saqueo') return '¡Necesitamos comida ya!';
    if (npc.accionIa.id === 'paro_firma') return '¡Paramos hasta recuperar sueldos!';
    if (npc.accionIa.id === 'ocupacion') return '¡Esta casa está vacía y nos quedamos!';
    if (npc.accionIa.id === 'boicot') return '¡No compramos con estos precios!';
    if (npc.accionIa.id === 'organizar_fiesta') return '¡Que siga la música!';
    if (npc.accionIa.id === 'organizar_asamblea') return '¡Vecinos, a debatir!';
    if (npc.accionIa.id === 'predicar') return '¡Escuchen lo que viene!';
    if (npc.accionIa.id === 'cavar_pozo') return 'Algo hay acá abajo...';
    if (npc.accionIa.id === 'acaparar_comida') return 'Mejor guardar víveres';
    if (npc.accionIa.id === 'compartir_comida') return 'Tomá, llevate algo para comer';
    if (npc.accionIa.id === 'cuidar_vecinos') return 'Te traigo algo para la fiebre';
    if (npc.accionIa.id === 'reparar_barricada') return 'Reforzando estas tablas';
    if (npc.accionIa.id === 'sermon_apocaliptico') return '¡Se acerca el fin!';
    return npc.accionIa.nombre;
  }
  if (npc.variables.hambre > 74) return '¡Qué cara está la comida!';
  if (npc.variables.miedo > 62) return 'Se siente tensión en la calle';
  if (npc.variables.satisfaccion < 32) return 'Así no se puede seguir...';
  if (npc.variables.satisfaccion > 76) {
    const happy = ['Buen día en el valle', 'Todo en marcha', 'Lindos tiempos'];
    return happy[hashIndex(npc.id, happy.length)];
  }
  if (npc.rol === 'policia') return 'Ronda tranquila';
  if (npc.rol === 'agricultor') return 'Buena tierra hoy';
  if (npc.rol === 'tecnico') return 'Ajustando el riego';
  if (npc.rol === 'constructor') return 'Avanzando en la obra';
  if (npc.rol === 'inmobiliario') return 'Revisando alquileres del barrio';
  if (npc.rol === 'obrero') return 'Turno en marcha';
  if (npc.rol === 'periodista') return 'Buscando primicias';
  if (npc.rol === 'comerciante') return '¡Pasen a ver!';
  if (npc.rol === 'empresario') return 'Revisando márgenes y costos';
  return 'Día movido en el pueblo';
}

export function evaluateZoneMetricColor(
  lens: 'defensa' | 'orden' | 'integridad' | 'amenaza',
  value: number
): string {
  if (lens === 'defensa' || lens === 'orden') {
    return value >= 60 ? '#10b981' : value >= 35 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'integridad') {
    return value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  }
  return value >= 50 ? '#ef4444' : value >= 20 ? '#f59e0b' : '#10b981';
}

const NEUTRAL_VILLAGER_PALETTE = ['#e2e8f0', '#cbd5e1', '#d6d3d1', '#bae6fd', '#fde68a'];

export function evaluateNpcLensColor(
  npc: Npc,
  lens: MapLens,
  state?: GameState,
  derived?: CommunityDerived
): string {
  if (lens === 'ninguna') return NEUTRAL_VILLAGER_PALETTE[hashIndex(npc.id, NEUTRAL_VILLAGER_PALETTE.length)];
  if (lens === 'roles') return ROLE_CATALOG[npc.rol].color;
  if (lens === 'acciones') {
    if (!npc.accionIa) return '#cbd5e1';
    if (npc.accionIa.tipo === 'condicion') return '#ef4444';
    if (npc.accionIa.esFoco) return '#a855f7';
    return '#f59e0b';
  }
  if (lens === 'satisfaccion') {
    const v = npc.variables.satisfaccion;
    return v >= 65 ? '#10b981' : v >= 40 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'vivienda') {
    const hogar = state?.hogares.find((h) => h.id === npc.hogarId);
    if (!hogar || hogar.estado === 'calle') return '#ef4444';
    const casa = hogar.casaId ? state?.casas.find((c) => c.id === hogar.casaId) : undefined;
    const crowded =
      casa && state
        ? state.hogares
            .filter((h) => h.casaId === casa.id)
            .reduce((acc, h) => acc + h.miembros.length, 0) > casa.capacidad
        : false;
    if (crowded || (casa && casa.estado < 45) || hogar.periodosSinPagar > 0) return '#f59e0b';
    return hogar.estado === 'con_casa' ? '#10b981' : '#38bdf8';
  }

  if (lens === 'firmas') {
    if (npc.partes && npc.partes.length > 0) return '#eab308';
    const firma = npc.empleadorId ? state?.firmas.find((f) => f.id === npc.empleadorId) : undefined;
    if (!firma) return ROLE_CATALOG[npc.rol].publico ? '#3b82f6' : '#94a3b8';
    if (firma.rubro === 'agro') return '#10b981';
    if (firma.rubro === 'comercio') return '#0ea5e9';
    if (firma.rubro === 'industria') return '#8b5cf6';
    if (firma.rubro === 'construccion') return '#f59e0b';
    if (firma.rubro === 'medio') return '#ec4899';
    return '#64748b';
  }

  const zones = state ? getWorldZones(state) : undefined;
  const zone: ZoneId = getEffectiveZone(npc, zones?.length ?? 9, zones);

  if (lens === 'alquiler') {
    const rent = state?.ultimaSalidaEconomica?.alquilerMedio?.[zone] ?? 12;
    return rent > 22 ? '#ef4444' : rent > 14 ? '#f59e0b' : '#10b981';
  }
  if (lens === 'vias') {
    const tramosZona = (state?.tramos ?? []).filter(
      (t) => t.construida && (t.zonaA === zone || t.zonaB === zone)
    );
    const avg =
      tramosZona.length > 0
        ? tramosZona.reduce((acc, t) => acc + t.estado, 0) / tramosZona.length
        : 100;
    return avg >= 70 ? '#10b981' : avg >= 40 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'defensa') {
    if (npc.rol === 'policia') return '#1d4ed8';
    const val = derived?.defensa[zone] ?? 50;
    return evaluateZoneMetricColor('defensa', val);
  }
  if (lens === 'orden') {
    if (npc.rol === 'policia') return '#0ea5e9';
    const val = derived?.orden[zone] ?? 50;
    return evaluateZoneMetricColor('orden', val);
  }
  if (lens === 'integridad') {
    if (npc.rol === 'ingeniero' || npc.rol === 'obrero') return '#0284c7';
    const val = state?.gobierno.integridad?.[zone] ?? 100;
    return evaluateZoneMetricColor('integridad', val);
  }
  if (lens === 'amenaza') {
    const val = derived?.amenazaPercibida[zone] ?? 0;
    return evaluateZoneMetricColor('amenaza', val);
  }

  return ROLE_CATALOG[npc.rol].color;
}
