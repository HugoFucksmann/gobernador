import { DISTRICTS, ROLE_CATALOG } from '../data/catalogs';
import { Npc } from '../types/game';
import { MapLens } from '../types/ui';

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
  if (npc.accionIa) {
    if (npc.accionIa.id === 'huelga') return '¡Exigimos nuestros pagos!';
    if (npc.accionIa.id === 'protesta') return '¡Queremos respuestas!';
    if (npc.accionIa.id === 'saqueo') return '¡Necesitamos comida ya!';
    if (npc.accionIa.id === 'organizar_fiesta') return '¡Que siga la música!';
    if (npc.accionIa.id === 'predicar') return '¡Escuchen lo que viene!';
    if (npc.accionIa.id === 'cavar_pozo') return 'Algo hay acá abajo...';
    if (npc.accionIa.id === 'acaparar_comida') return 'Mejor guardar víveres';
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
  if (npc.rol === 'periodista') return 'Buscando primicias';
  if (npc.rol === 'comerciante') return '¡Pasen a ver!';
  return 'Día movido en el pueblo';
}

export function evaluateNpcLensColor(npc: Npc, lens: MapLens): string {
  if (lens === 'roles') return ROLE_CATALOG[npc.rol].color;
  if (lens === 'satisfaccion') {
    const v = npc.variables.satisfaccion;
    return v >= 65 ? '#10b981' : v >= 40 ? '#f59e0b' : '#ef4444';
  }
  if (lens === 'hambre') {
    const v = npc.variables.hambre;
    return v > 75 ? '#ef4444' : v > 45 ? '#f59e0b' : '#14b8a6';
  }
  const v = npc.variables.lealtad;
  return v >= 55 ? '#0ea5e9' : v >= 35 ? '#f59e0b' : '#e11d48';
}
