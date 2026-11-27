import { ACTION_TABLE } from '../data/catalogs';
import { GameState, SimEvent, ZoneId } from '../types/game';

const RAREZA_ACTION_ID_SET = new Set(
  ACTION_TABLE.filter(
    (a) =>
      a.tipo === 'espontanea' &&
      a.efectos.every((e) => e.id === 'decorativa' || (e.id === 'anima' && (e.intensidad ?? 'baja') === 'baja'))
  ).map((a) => a.id)
);

const CONDITION_ACTION_ID_SET = new Set(
  ACTION_TABLE.filter((a) => a.tipo === 'condicion').map((a) => a.id)
);

export function getEventParticipantIds(ev: SimEvent, state: GameState): string[] {
  const ordered: string[] = [];
  const pushId = (id?: string | null) => {
    if (!id || ordered.includes(id)) return;
    ordered.push(id);
  };

  if (ev.foco?.tipo === 'persona') {
    pushId(ev.foco.id);
  }
  if ('npcId' in ev && ev.npcId) pushId(ev.npcId);
  if ('npcIds' in ev && Array.isArray(ev.npcIds)) {
    for (const id of ev.npcIds) pushId(id);
  }
  if ('npcs' in ev && Array.isArray(ev.npcs)) {
    for (const id of ev.npcs) pushId(id);
  }
  if ('padresIds' in ev && Array.isArray(ev.padresIds)) {
    for (const id of ev.padresIds) pushId(id);
  }
  if ('deNpcId' in ev && ev.deNpcId) pushId(ev.deNpcId);
  if ('aIds' in ev && Array.isArray(ev.aIds)) {
    for (const id of ev.aIds) pushId(id);
  }
  if ('herederos' in ev && Array.isArray(ev.herederos)) {
    for (const id of ev.herederos) pushId(id);
  }
  if ('miembros' in ev && Array.isArray(ev.miembros)) {
    for (const id of ev.miembros) pushId(id);
  }
  if ('duenoId' in ev && ev.duenoId) pushId(ev.duenoId);
  if ('compradorId' in ev && ev.compradorId) pushId(ev.compradorId);

  if (ordered.length === 0 && 'hogarId' in ev && ev.hogarId) {
    const hog = state.hogares.find((h) => h.id === ev.hogarId);
    if (hog) {
      for (const id of hog.miembros) pushId(id);
    }
  }
  if ('actorId' in ev && ev.actorId) {
    pushId(ev.actorId);
  }

  const aliveSet = new Set(state.npcs.filter((n) => n.vivo).map((n) => n.id));
  return ordered.filter((id) => aliveSet.has(id));
}

export interface EventFocusHandlers {
  onFollowNpc?: (npcId: string) => void;
  onSelectNpc?: (npcId: string) => void;
  onSelectParcela?: (parcelaId: string) => void;
  onSelectZona?: (zona: ZoneId) => void;
  onJumpZone?: (zona: ZoneId) => void;
}

export function focusSimEventCamera(
  ev: SimEvent,
  state: GameState,
  handlers: EventFocusHandlers
): void {
  const participants = getEventParticipantIds(ev, state);
  if (ev.foco?.tipo === 'persona' && participants.includes(ev.foco.id)) {
    if (handlers.onFollowNpc) handlers.onFollowNpc(ev.foco.id);
    else handlers.onSelectNpc?.(ev.foco.id);
    return;
  }
  if (participants.length > 0) {
    if (handlers.onFollowNpc) handlers.onFollowNpc(participants[0]);
    else handlers.onSelectNpc?.(participants[0]);
    return;
  }
  if (ev.foco?.tipo === 'lote') {
    handlers.onSelectParcela?.(ev.foco.id);
    handlers.onJumpZone?.(ev.zona);
    return;
  }
  if ('parcelaId' in ev && ev.parcelaId) {
    handlers.onSelectParcela?.(ev.parcelaId);
    handlers.onJumpZone?.(ev.zona);
    return;
  }
  handlers.onSelectZona?.(ev.zona);
  handlers.onJumpZone?.(ev.zona);
}

export function isHighSeverityOrRareEvent(ev: SimEvent): boolean {
  if (
    ev.tipo === 'colapso' ||
    ev.tipo === 'impago' ||
    ev.tipo === 'hospital_saturado' ||
    ev.tipo === 'ruta_cortada' ||
    ev.tipo === 'extorsion'
  ) {
    return true;
  }
  if (ev.tipo === 'accion_inicio') {
    return (
      CONDITION_ACTION_ID_SET.has(ev.accion) ||
      RAREZA_ACTION_ID_SET.has(ev.accion)
    );
  }
  return false;
}

export function describeMapEdgeEvent(
  ev: SimEvent,
  state: GameState
): { badge: string; title: string; severity: 'critica' | 'rareza' | 'condicion' } {
  const zName = state.zonas[ev.zona]?.nombre ?? ev.zona;
  if (ev.tipo === 'colapso') {
    return { badge: 'COLAPSO', title: `Colapso (${ev.causaColapso}) · ${zName}`, severity: 'critica' };
  }
  if (ev.tipo === 'impago') {
    return { badge: 'IMPAGO', title: `Impago estatal · faltan $${Math.round(ev.faltante)}`, severity: 'critica' };
  }
  if (ev.tipo === 'hospital_saturado') {
    return { badge: 'SALUD', title: `Hospital saturado (${ev.ocupacionPct}%) · ${zName}`, severity: 'critica' };
  }
  if (ev.tipo === 'ruta_cortada') {
    return { badge: 'VÍA', title: `Ruta cortada · ${zName}`, severity: 'critica' };
  }
  if (ev.tipo === 'extorsion') {
    return { badge: 'EXTORSIÓN', title: `Extorsión en ${zName}`, severity: 'critica' };
  }
  if (ev.tipo === 'accion_inicio') {
    const def = ACTION_TABLE.find((a) => a.id === ev.accion);
    const label = def?.nombre ?? ev.accion;
    if (CONDITION_ACTION_ID_SET.has(ev.accion)) {
      return {
        badge: 'CONDICIÓN',
        title: `${label}${ev.npcIds.length > 1 ? ` (${ev.npcIds.length})` : ''} · ${zName}`,
        severity: 'condicion',
      };
    }
    return {
      badge: 'RAREZA',
      title: `${label} · ${zName}`,
      severity: 'rareza',
    };
  }
  return { badge: 'AVISO', title: `${ev.tipo} · ${zName}`, severity: 'critica' };
}
