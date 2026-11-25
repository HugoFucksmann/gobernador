import { DISTRICTS, ROLE_CATALOG } from '../data/catalogs';
import { CommunityDerived, GameState, Npc, ZoneId } from '../types/game';
import { MapLens } from '../types/ui';
import { getEffectiveZone, getWorldZones } from './simulation';

function hashIndex(id: string, len: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

export function getNpcDistrictName(npc: Npc): string {
  const match = DISTRICTS.find(
    (d) =>
      npc.mapa.x >= d.x &&
      npc.mapa.x <= d.x + d.w &&
      npc.mapa.y >= d.y &&
      npc.mapa.y <= d.y + d.h
  );
  return match?.nombre || 'Avenidas centrales';
}

export function evaluateNpcBubbleText(npc: Npc): string {
  if (npc.hospital.internado) return 'En recuperación médica';
  if (npc.hospital.esperandoCama) return 'Esperando cama disponible';
  if (npc.accionIa) {
    if (npc.accionIa.id === 'huelga') return '¡Exigimos nuestros pagos!';
    if (npc.accionIa.id === 'protesta') return '¡Queremos respuestas!';
    if (npc.accionIa.id === 'saqueo') return '¡Necesitamos comida ya!';
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
  if (npc.rol === 'periodista') return 'Buscando primicias';
  if (npc.rol === 'comerciante') return '¡Pasen a ver!';
  if (npc.rol === 'empresario') return 'Revisando números del molino';
  return 'Día movido en el pueblo';
}

export function evaluateZoneMetricColor(
  lens: 'defensa' | 'orden' | 'integridad' | 'amenaza' | 'hospital',
  value: number
): string {
  if (lens === 'defensa' || lens === 'orden') {
    return value >= 60 ? '#10b981' : value >= 35 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'integridad') {
    return value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'amenaza') {
    return value >= 50 ? '#ef4444' : value >= 20 ? '#f59e0b' : '#10b981';
  }
  // hospital occupancy %
  return value > 100 ? '#ef4444' : value >= 75 ? '#f59e0b' : '#0ea5e9';
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
  if (lens === 'hambre') {
    const v = npc.variables.hambre;
    return v > 75 ? '#ef4444' : v > 45 ? '#f59e0b' : '#14b8a6';
  }
  if (lens === 'lealtad') {
    const v = npc.variables.lealtad;
    return v >= 55 ? '#0ea5e9' : v >= 35 ? '#f59e0b' : '#e11d48';
  }
  if (lens === 'hospital') {
    if (npc.hospital.esperandoCama) return '#ef4444';
    if (npc.hospital.internado) return '#0ea5e9';
    if (npc.rol === 'medico') return '#10b981';
    if (npc.variables.salud < 65) return '#f59e0b';
    return '#94a3b8';
  }

  const zonesCount = state ? getWorldZones(state).length : 5;
  const zone: ZoneId = getEffectiveZone(npc, zonesCount);

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
