import {
  AGENDA_CONSTANTS,
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  HOUSING_CONSTANTS,
  LOT_CLASS_MIN_TILES,
  LOT_CLASS_RANK,
  ROLE_CATALOG,
  VIAL_CONSTANTS,
} from '../data/catalogs';
import {
  BuildingInstance,
  BuildingType,
  Casa,
  ClimatePhenomenon,
  CommunityDerived,
  Firma,
  FirmRubro,
  FranjaDiaId,
  GameState,
  Hogar,
  LotClass,
  MapaV2Grid,
  ModifiableKey,
  Modifier,
  Npc,
  NpcAgendaSlot,
  Parcela,
  ParcelTipo,
  PersonalityTrait,
  RoleId,
  SimEvent,
  ViaTramo,
  ZoneDefinition,
  ZoneId,
} from '../types/game';
import { computeMaintenanceBreakdown, getActiveBuildings, getBuildingRoleCapacity } from './policies';
import { nextSeqId } from './rng';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getStage(edad: number): 'menor' | 'adulto' | 'jubilado' {
  if (edad < 18) return 'menor';
  if (edad >= 65) return 'jubilado';
  return 'adulto';
}

export function getWorldZones(state: Pick<GameState, 'zonas'>): ZoneId[] {
  const keys = Object.keys(state.zonas || {}).filter(
    (z) => state.zonas[z]?.estado !== 'no_urbanizada'
  );
  return keys.length > 0 ? keys : ['centro'];
}

export function getAllZoneIds(state: Pick<GameState, 'zonas'>): ZoneId[] {
  const keys = Object.keys(state.zonas || {});
  return keys.length > 0 ? keys : ['centro'];
}

export function getEffectiveZone(npc: Npc, zonesCount: number, defaultZones?: ZoneId[]): ZoneId {
  if (npc.hospital.internado && npc.hospital.zonaHospital) {
    return npc.hospital.zonaHospital;
  }
  if (npc.accionIa?.zonaDestino) {
    return npc.accionIa.zonaDestino;
  }
  if (npc.accionIa?.esFoco && zonesCount > 1) {
    return defaultZones?.[0] ?? 'centro';
  }
  return npc.zona;
}

export function getModifierDelta(npc: Npc, key: ModifiableKey): number {
  let sum = 0;
  for (const m of npc.modificadores) {
    const d = m.afecta[key];
    if (typeof d === 'number') sum += d;
  }
  return sum;
}

export function getEffectiveTrait(npc: Npc, trait: PersonalityTrait): number {
  return clamp(npc.personalidad[trait] + getModifierDelta(npc, trait), 0, 100);
}

export function getEffectivePropensionGasto(npc: Npc): number {
  const base = npc.economia.propensionGasto;
  const delta = getModifierDelta(npc, 'propensionGasto');
  return clamp(base + delta * 100, ECON_CONSTANTS.propensionGastoMin * 100, ECON_CONSTANTS.propensionGastoMax * 100);
}

export function getEffectivePropensionEmprender(npc: Npc): number {
  return clamp(npc.economia.propensionEmprender + getModifierDelta(npc, 'propensionEmprender'), 0, 100);
}

export function getActivePhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => dia >= f.inicioDia && dia < f.inicioDia + f.duracionDias
  );
}

export function getAnnouncedPhenomena(state: GameState): ClimatePhenomenon[] {
  // CAOS_PRENSA_V2: sin medios activos no se emiten avisos ni alarma pública
  const hasActiveMedia = state.medios.some((m) => m.activa !== false);
  if (!hasActiveMedia) return [];
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => typeof f.avisoDias === 'number' && dia >= f.inicioDia - f.avisoDias && dia < f.inicioDia
  );
}

export function shortestZonePath(
  zonas: GameState['zonas'],
  from: ZoneId,
  to: ZoneId
): ZoneId[] {
  if (from === to) return [from];
  const visited = new Set<ZoneId>([from]);
  const queue: ZoneId[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    const neighbors = zonas[last]?.vecinas ?? [];
    for (const next of neighbors) {
      if (next === to) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [from];
}

export function buildZoneStepMap(
  zonas: GameState['zonas']
): Record<ZoneId, Record<ZoneId, number>> {
  const zoneIds = Object.keys(zonas);
  const dist: Record<ZoneId, Record<ZoneId, number>> = {};
  for (const start of zoneIds) {
    dist[start] = { [start]: 0 };
    const queue: ZoneId[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = dist[start][cur];
      for (const nb of zonas[cur]?.vecinas ?? []) {
        if (dist[start][nb] === undefined) {
          dist[start][nb] = d + 1;
          queue.push(nb);
        }
      }
    }
  }
  return dist;
}

export function getGridDimensionsForPopulation(pop: number): { ancho: number; alto: number } {
  if (pop > 800) return { ancho: 160, alto: 160 };
  if (pop > 150) return { ancho: 80, alto: 80 };
  return { ancho: 48, alto: 48 };
}

const WORLD_CANVAS_W = 1560;
const WORLD_CANVAS_H = 980;

export function inferLotClassFromParcel(
  p: Pick<Parcela, 'clase' | 'w' | 'h' | 'ww' | 'wh' | 'tipoParcela' | 'edificio'>,
  hintBuildingType?: BuildingType
): LotClass {
  if (p.clase) return p.clase;
  const bType = p.edificio?.tipo ?? hintBuildingType;
  if (bType && BUILDING_CATALOG[bType]) {
    return BUILDING_CATALOG[bType].claseMinima;
  }
  if (p.tipoParcela === 'agricola' || p.tipoParcela === 'industrial') return 'XL';
  if (p.tipoParcela === 'especial') return 'L';
  if (p.tipoParcela === 'publica') return 'L';
  if (p.w && p.h) {
    const area = p.w * p.h;
    if (area >= 36) return 'XL';
    if (area >= 16) return 'L';
    if (area >= 9) return 'M';
    return 'S';
  }
  const ww = p.ww ?? 44;
  if (ww >= 70) return 'XL';
  if (ww >= 52) return 'L';
  if (ww >= 45) return 'M';
  return 'S';
}

export function canBuildTypeInParcela(parcela: Parcela, tipo: BuildingType): boolean {
  const def = BUILDING_CATALOG[tipo];
  if (!def) return false;
  if (parcela.tipoParcela !== def.parcelTipo) return false;
  const lotClass = inferLotClassFromParcel(parcela);
  return LOT_CLASS_RANK[lotClass] >= LOT_CLASS_RANK[def.claseMinima];
}

const ZONE_CHAR_MAP: Record<ZoneId, string> = {
  noroeste: 'O',
  norte: 'N',
  noreste: 'E',
  oeste: 'W',
  centro: 'C',
  este: 'P',
  suroeste: 'S',
  sur: 'U',
  sureste: 'R',
  poligono: 'I',
  ribera: 'B',
};

function rasterizeLineTiles(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ancho: number,
  alto: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let cx = clamp(Math.round(x0), 0, ancho - 1);
  let cy = clamp(Math.round(y0), 0, alto - 1);
  const tx = clamp(Math.round(x1), 0, ancho - 1);
  const ty = clamp(Math.round(y1), 0, alto - 1);
  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx - dy;

  for (let steps = 0; steps < ancho + alto + 4; steps++) {
    pts.push([cx, cy]);
    if (cx === tx && cy === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
  return pts;
}

export function syncMapaGridVias(
  grid: MapaV2Grid,
  tramos: ViaTramo[]
): void {
  const { ancho, alto } = grid;
  const viaRows: string[][] = Array.from({ length: alto }, () => Array(ancho).fill('.'));
  for (const t of tramos) {
    if (!t.construida || t.estado <= 0) continue;
    const ch = t.tipo === 'puente' ? 'p' : t.tipo === 'camino' ? 'r' : 'c';
    for (const [bx, by] of t.baldosas ?? []) {
      if (bx >= 0 && bx < ancho && by >= 0 && by < alto) {
        viaRows[by][bx] = ch;
      }
    }
  }
  grid.vias = viaRows.map((r) => r.join(''));
}

export function buildTileGridAndSyncMap(
  zonas: Record<ZoneId, ZoneDefinition>,
  parcelas: Parcela[],
  tramos: ViaTramo[],
  targetPop: number
): MapaV2Grid {
  const { ancho, alto } = getGridDimensionsForPopulation(targetPop);
  const zoneIds = Object.keys(zonas);

  const terrainRows: string[][] = Array.from({ length: alto }, () => Array(ancho).fill('.'));
  const zoneRows: string[][] = Array.from({ length: alto }, () => Array(ancho).fill(' '));

  const riverXMin = 1192;
  const riverXMax = 1236;

  // Map each tile center to nearest zone rect (solid coverage, no gaps, river barrier before ribera)
  for (let ty = 0; ty < alto; ty++) {
    const wy = ((ty + 0.5) / alto) * WORLD_CANVAS_H;
    for (let tx = 0; tx < ancho; tx++) {
      const wx = ((tx + 0.5) / ancho) * WORLD_CANVAS_W;

      if (wx >= riverXMin && wx <= riverXMax && wy >= 245 && wy <= 765) {
        terrainRows[ty][tx] = '~';
      } else if ((wx >= 1245 && wy < 235) || (wx >= 815 && wy >= 780)) {
        terrainRows[ty][tx] = '^';
      }

      let bestZone = zoneIds[0] ?? 'centro';
      let bestDist = Infinity;
      for (const zId of zoneIds) {
        const r = zonas[zId].rect;
        const dx = wx < r.wx ? r.wx - wx : wx > r.wx + r.ww ? wx - (r.wx + r.ww) : 0;
        const dy = wy < r.wy ? r.wy - wy : wy > r.wy + r.wh ? wy - (r.wy + r.wh) : 0;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestZone = zId;
        }
      }
      zoneRows[ty][tx] = ZONE_CHAR_MAP[bestZone] ?? bestZone.charAt(0).toUpperCase();
    }
  }

  // Derive zone adjacency strictly from orthographic 4-neighbor tile contiguity (+ river bridges)
  const charToZone: Record<string, ZoneId> = {};
  for (const zId of zoneIds) {
    charToZone[ZONE_CHAR_MAP[zId] ?? zId.charAt(0).toUpperCase()] = zId;
  }
  const derivedVecinas = new Map<ZoneId, Set<ZoneId>>();
  for (const zId of zoneIds) derivedVecinas.set(zId, new Set<ZoneId>());

  for (let ty = 0; ty < alto; ty++) {
    for (let tx = 0; tx < ancho; tx++) {
      const zA = charToZone[zoneRows[ty][tx]];
      if (!zA) continue;
      if (tx + 1 < ancho) {
        const zB = charToZone[zoneRows[ty][tx + 1]];
        if (zB && zB !== zA) {
          derivedVecinas.get(zA)?.add(zB);
          derivedVecinas.get(zB)?.add(zA);
        }
      }
      if (ty + 1 < alto) {
        const zB = charToZone[zoneRows[ty + 1][tx]];
        if (zB && zB !== zA) {
          derivedVecinas.get(zA)?.add(zB);
          derivedVecinas.get(zB)?.add(zA);
        }
      }
    }
  }
  for (const t of tramos) {
    if (t.zonaA && t.zonaB && t.zonaA !== t.zonaB) {
      derivedVecinas.get(t.zonaA)?.add(t.zonaB);
      derivedVecinas.get(t.zonaB)?.add(t.zonaA);
    }
  }
  for (const zId of zoneIds) {
    const derived = [...(derivedVecinas.get(zId) ?? [])];
    if (derived.length > 0) {
      zonas[zId].vecinas = derived;
    }
  }

  // Populate tramo.baldosas from tramo.puntos
  const tramoById = new Map<string, ViaTramo>();
  for (const t of tramos) {
    tramoById.set(t.id, t);
    const pts = t.puntos && t.puntos.length >= 2
      ? t.puntos
      : [
          {
            wx: (zonas[t.zonaA]?.rect.wx ?? 415) + (zonas[t.zonaA]?.rect.ww ?? 370) / 2,
            wy: (zonas[t.zonaA]?.rect.wy ?? 270) + (zonas[t.zonaA]?.rect.wh ?? 225) / 2,
          },
          {
            wx: (zonas[t.zonaB ?? t.zonaA]?.rect.wx ?? 600) + (zonas[t.zonaB ?? t.zonaA]?.rect.ww ?? 370) / 2,
            wy: (zonas[t.zonaB ?? t.zonaA]?.rect.wy ?? 380) + (zonas[t.zonaB ?? t.zonaA]?.rect.wh ?? 225) / 2,
          },
        ];
    const seen = new Set<string>();
    const baldosas: Array<[number, number]> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const gx0 = (pts[i].wx / WORLD_CANVAS_W) * ancho;
      const gy0 = (pts[i].wy / WORLD_CANVAS_H) * alto;
      const gx1 = (pts[i + 1].wx / WORLD_CANVAS_W) * ancho;
      const gy1 = (pts[i + 1].wy / WORLD_CANVAS_H) * alto;
      for (const [bx, by] of rasterizeLineTiles(gx0, gy0, gx1, gy1, ancho, alto)) {
        const key = `${bx},${by}`;
        if (!seen.has(key)) {
          seen.add(key);
          baldosas.push([bx, by]);
        }
      }
    }
    t.baldosas = baldosas;
  }

  // Ensure every parcel has tile coordinates (x, y, w, h), clase, and frente
  for (const p of parcelas) {
    const lotClass = inferLotClassFromParcel(p);
    p.clase = lotClass;
    const minT = LOT_CLASS_MIN_TILES[lotClass];
    const scaledW = Math.max(minT.w, Math.round((p.ww / WORLD_CANVAS_W) * ancho));
    const scaledH = Math.max(minT.h, Math.round((p.wh / WORLD_CANVAS_H) * alto));
    p.w = scaledW;
    p.h = scaledH;
    p.x = clamp(Math.round((p.wx / WORLD_CANVAS_W) * ancho), 0, ancho - 1);
    p.y = clamp(Math.round((p.wy / WORLD_CANVAS_H) * alto), 0, alto - 1);

    // Ensure parcel footprint doesn't sit on water/mountain tiles
    for (let dy = 0; dy < Math.min(3, p.h); dy++) {
      for (let dx = 0; dx < Math.min(3, p.w); dx++) {
        const tx = clamp(p.x + dx, 0, ancho - 1);
        const ty = clamp(p.y + dy, 0, alto - 1);
        if (terrainRows[ty][tx] !== '.') terrainRows[ty][tx] = '.';
      }
    }

    const apertura = p.tramoAperturaId ? tramoById.get(p.tramoAperturaId) : undefined;
    if (apertura?.baldosas && apertura.baldosas.length > 0) {
      const endPt = apertura.baldosas[apertura.baldosas.length - 1];
      p.frente = [endPt[0], endPt[1]];
    } else {
      const zRect = zonas[p.zona]?.rect;
      const roadWx = zRect ? zRect.wx + zRect.ww / 2 : p.wx + p.ww / 2;
      const roadWy = zRect ? zRect.wy + zRect.wh / 2 : p.wy + p.wh / 2;
      const fx = clamp(Math.round((((p.wx + p.ww / 2) * 0.55 + roadWx * 0.45) / WORLD_CANVAS_W) * ancho), 0, ancho - 1);
      const fy = clamp(Math.round((((p.wy + p.wh / 2) * 0.55 + roadWy * 0.45) / WORLD_CANVAS_H) * alto), 0, alto - 1);
      p.frente = [fx, fy];
    }
  }

  const zonas_info: MapaV2Grid['zonas_info'] = {};
  for (const zId of zoneIds) {
    const z = zonas[zId];
    zonas_info[zId] = {
      id: zId,
      codigo: ZONE_CHAR_MAP[zId] ?? zId.charAt(0).toUpperCase(),
      nombre: z.nombre,
      estado: z.estado ?? 'activa',
      nodoPrincipal: z.nodoPrincipal ?? `n_${zId}`,
    };
  }

  const grid: MapaV2Grid = {
    version: 1,
    ancho,
    alto,
    terreno: terrainRows.map((r) => r.join('')),
    vias: Array.from({ length: alto }, () => '.'.repeat(ancho)),
    zonas: zoneRows.map((r) => r.join('')),
    zonas_info,
  };
  syncMapaGridVias(grid, tramos);
  return grid;
}

export function getViaTramoCost(tramo: ViaTramo): number {
  if (!tramo.construida || tramo.estado <= 0) return Infinity;
  return tramo.longitud * (1 + VIAL_CONSTANTS.kVial * (1 - clamp(tramo.estado, 0, 100) / 100));
}

export function getBuiltNetworkNodes(state: Pick<GameState, 'zonas' | 'tramos'>): Set<string> {
  const nodes = new Set<string>();
  for (const [zId, z] of Object.entries(state.zonas || {})) {
    if (z.estado !== 'no_urbanizada') {
      nodes.add(z.nodoPrincipal ?? `n_${zId}`);
    }
  }
  for (const t of state.tramos || []) {
    if (t.construida && t.estado > 0) {
      nodes.add(t.nodoA);
      nodes.add(t.nodoB);
    }
  }
  return nodes;
}

export function isViaConnectableToNetwork(
  state: Pick<GameState, 'zonas' | 'tramos'>,
  tramo: ViaTramo
): boolean {
  if (tramo.construida || tramo.enObra) return false;
  const builtNodes = getBuiltNetworkNodes(state);
  return builtNodes.has(tramo.nodoA) || builtNodes.has(tramo.nodoB);
}

export function isLotIsolated(state: Pick<GameState, 'zonas' | 'tramos' | 'distanciasZonas'>, parcela: Parcela): boolean {
  if (parcela.estado === 'sin_calle' || parcela.estado === 'bloqueada') return true;
  if (state.zonas[parcela.zona]?.estado === 'no_urbanizada') return true;
  if (parcela.tramoAperturaId) {
    const tramo = state.tramos.find((t) => t.id === parcela.tramoAperturaId);
    if (tramo && (!tramo.construida || tramo.estado <= 0)) return true;
  }
  return false;
}

function getRoadNodeCoordsMap(state: Pick<GameState, 'zonas' | 'tramos'>): Map<string, { wx: number; wy: number }> {
  const coords = new Map<string, { wx: number; wy: number }>();
  for (const [zId, z] of Object.entries(state.zonas || {})) {
    const nId = z.nodoPrincipal ?? `n_${zId}`;
    if (z.rect) {
      coords.set(nId, { wx: z.rect.wx + z.rect.ww / 2, wy: z.rect.wy + z.rect.wh / 2 });
    }
  }
  for (const t of state.tramos || []) {
    if (t.puntos && t.puntos.length >= 2) {
      if (!coords.has(t.nodoA)) coords.set(t.nodoA, { wx: t.puntos[0].wx, wy: t.puntos[0].wy });
      const last = t.puntos[t.puntos.length - 1];
      if (!coords.has(t.nodoB)) coords.set(t.nodoB, { wx: last.wx, wy: last.wy });
    }
  }
  return coords;
}

function getParcelRoadNode(state: Pick<GameState, 'zonas' | 'tramos'>, parcel: Parcela): string {
  if (parcel.nodoAcceso) return parcel.nodoAcceso;
  if (parcel.tramoAperturaId) {
    const t = (state.tramos || []).find((x) => x.id === parcel.tramoAperturaId && x.construida && x.estado > 0);
    if (t) return t.nodoB;
  }
  return state.zonas[parcel.zona]?.nodoPrincipal ?? `n_${parcel.zona}`;
}

function getParcelFrontAccessCost(
  state: Pick<GameState, 'zonas' | 'tramos' | 'mapaGrid'>,
  parcel: Parcela,
  nodeId: string,
  nodeCoords?: Map<string, { wx: number; wy: number }>
): number {
  const ancho = state.mapaGrid?.ancho ?? 48;
  const alto = state.mapaGrid?.alto ?? 48;
  const fx = parcel.frente?.[0] ?? parcel.x ?? Math.round(((parcel.wx + parcel.ww / 2) / WORLD_CANVAS_W) * ancho);
  const fy = parcel.frente?.[1] ?? parcel.y ?? Math.round(((parcel.wy + parcel.wh / 2) / WORLD_CANVAS_H) * alto);
  const coords = nodeCoords ?? getRoadNodeCoordsMap(state);
  const nPos = coords.get(nodeId);
  if (!nPos) return 1;
  const nx = (nPos.wx / WORLD_CANVAS_W) * ancho;
  const ny = (nPos.wy / WORLD_CANVAS_H) * alto;
  return Number(Math.max(0.5, (Math.abs(fx - nx) + Math.abs(fy - ny)) * 0.35).toFixed(2));
}

function runNodeDijkstra(
  adj: Record<string, Array<{ to: string; cost: number; tramo?: ViaTramo }>>,
  startNode: string
): {
  dist: Record<string, number>;
  prev: Record<string, { node: string; tramo?: ViaTramo }>;
} {
  const dist: Record<string, number> = { [startNode]: 0 };
  const prev: Record<string, { node: string; tramo?: ViaTramo }> = {};
  const visited = new Set<string>();
  const queue: string[] = [startNode];

  while (queue.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if ((dist[queue[i]] ?? Infinity) < (dist[queue[bestIdx]] ?? Infinity)) {
        bestIdx = i;
      }
    }
    const u = queue.splice(bestIdx, 1)[0];
    if (visited.has(u)) continue;
    visited.add(u);
    const du = dist[u] ?? Infinity;
    for (const edge of adj[u] ?? []) {
      const nd = du + edge.cost;
      if (nd < (dist[edge.to] ?? Infinity)) {
        dist[edge.to] = nd;
        prev[edge.to] = { node: u, tramo: edge.tramo };
        queue.push(edge.to);
      }
    }
  }
  return { dist, prev };
}

export function recomputeRoadDistances(state: GameState): void {
  const adj: Record<string, Array<{ to: string; cost: number; tramo: ViaTramo }>> = {};
  const addEdge = (a: string, b: string, cost: number, tramo: ViaTramo) => {
    if (!adj[a]) adj[a] = [];
    adj[a].push({ to: b, cost, tramo });
  };

  const allNodes = new Set<string>();
  const zoneIds = Object.keys(state.zonas || {});
  for (const zId of zoneIds) {
    allNodes.add(state.zonas[zId]?.nodoPrincipal ?? `n_${zId}`);
  }

  for (const t of state.tramos || []) {
    allNodes.add(t.nodoA);
    allNodes.add(t.nodoB);
    const cost = getViaTramoCost(t);
    if (!Number.isFinite(cost)) continue;
    addEdge(t.nodoA, t.nodoB, cost, t);
    addEdge(t.nodoB, t.nodoA, cost, t);
  }

  const nodeDistMatrix: Record<string, Record<string, number>> = {};
  for (const n of allNodes) {
    nodeDistMatrix[n] = runNodeDijkstra(adj, n).dist;
  }

  const matrix: Record<ZoneId, Record<ZoneId, number>> = {};
  for (const zA of zoneIds) {
    matrix[zA] = {};
    const startNode = state.zonas[zA]?.nodoPrincipal ?? `n_${zA}`;
    const distNode = nodeDistMatrix[startNode] ?? {};
    for (const zB of zoneIds) {
      if (zA === zB) {
        matrix[zA][zB] = VIAL_CONSTANTS.costoInternoZona;
      } else {
        const endNode = state.zonas[zB]?.nodoPrincipal ?? `n_${zB}`;
        const d = distNode[endNode];
        matrix[zA][zB] =
          typeof d === 'number' && Number.isFinite(d)
            ? Number((d + VIAL_CONSTANTS.costoInternoZona).toFixed(2))
            : Infinity;
      }
    }
  }

  state.distanciasZonas = matrix;

  // Cache node-to-node & zone-to-zone Dijkstra shortest distances for O(1) lot-front queries
  const lotDistCache: Record<string, number> = {};
  for (const nA of allNodes) {
    const dMap = nodeDistMatrix[nA] ?? {};
    for (const nB of allNodes) {
      const d = nA === nB ? 0 : dMap[nB];
      lotDistCache[`node:${nA}:${nB}`] =
        typeof d === 'number' && Number.isFinite(d) ? Number(d.toFixed(2)) : Infinity;
    }
  }
  for (const zA of zoneIds) {
    for (const zB of zoneIds) {
      lotDistCache[`${zA}:${zB}`] = matrix[zA]?.[zB] ?? Infinity;
    }
  }
  state.distanciasLotes = lotDistCache;

  if (state.mapaGrid) {
    syncMapaGridVias(state.mapaGrid, state.tramos);
  }
}

export function getZoneTravelCost(state: GameState, from: ZoneId, to: ZoneId): number {
  if (from === to) return VIAL_CONSTANTS.costoInternoZona;
  const cached = state.distanciasZonas?.[from]?.[to];
  if (typeof cached === 'number') return cached;
  const steps = buildZoneStepMap(state.zonas);
  const stepDist = steps[from]?.[to];
  return typeof stepDist === 'number'
    ? stepDist * 10 + VIAL_CONSTANTS.costoInternoZona
    : Infinity;
}

export function getLotTravelCost(state: GameState, fromParcel: Parcela, toParcel: Parcela): number {
  if (isLotIsolated(state, fromParcel) || isLotIsolated(state, toParcel)) return Infinity;
  if (fromParcel.id === toParcel.id) return 0;

  const nodeA = getParcelRoadNode(state, fromParcel);
  const nodeB = getParcelRoadNode(state, toParcel);

  if (nodeA === nodeB) {
    const fx = fromParcel.frente?.[0] ?? fromParcel.x ?? 0;
    const fy = fromParcel.frente?.[1] ?? fromParcel.y ?? 0;
    const tx = toParcel.frente?.[0] ?? toParcel.x ?? 0;
    const ty = toParcel.frente?.[1] ?? toParcel.y ?? 0;
    const manhattan = Math.abs(tx - fx) + Math.abs(ty - fy);
    return Number(Math.max(1, manhattan * 0.4).toFixed(2));
  }

  let netDist = state.distanciasLotes?.[`node:${nodeA}:${nodeB}`];
  if (typeof netDist !== 'number') {
    const adj: Record<string, Array<{ to: string; cost: number }>> = {};
    for (const t of state.tramos || []) {
      const cost = getViaTramoCost(t);
      if (!Number.isFinite(cost)) continue;
      if (!adj[t.nodoA]) adj[t.nodoA] = [];
      if (!adj[t.nodoB]) adj[t.nodoB] = [];
      adj[t.nodoA].push({ to: t.nodoB, cost });
      adj[t.nodoB].push({ to: t.nodoA, cost });
    }
    netDist = runNodeDijkstra(adj, nodeA).dist[nodeB] ?? Infinity;
  }
  if (!Number.isFinite(netDist)) return Infinity;

  const nodeCoords = getRoadNodeCoordsMap(state);
  const accessA = getParcelFrontAccessCost(state, fromParcel, nodeA, nodeCoords);
  const accessB = getParcelFrontAccessCost(state, toParcel, nodeB, nodeCoords);
  return Number((accessA + netDist + accessB).toFixed(2));
}

export function getRouteWaypointsBetween(
  state: Pick<GameState, 'zonas' | 'tramos'>,
  fromWx: number,
  fromWy: number,
  fromZona: ZoneId,
  toWx: number,
  toWy: number,
  toZona: ZoneId
): Array<{ wx: number; wy: number }> {
  if (fromZona === toZona) {
    return [{ wx: toWx, wy: toWy }];
  }

  const nodeCoords = getRoadNodeCoordsMap(state);
  const findClosestNode = (wx: number, wy: number, fallbackZona: ZoneId): string => {
    const fallbackNode = state.zonas[fallbackZona]?.nodoPrincipal ?? `n_${fallbackZona}`;
    let bestNode = fallbackNode;
    let bestDist = Infinity;
    for (const [nodeId, pos] of nodeCoords.entries()) {
      const d = Math.hypot(pos.wx - wx, pos.wy - wy);
      if (d < bestDist) {
        bestDist = d;
        bestNode = nodeId;
      }
    }
    const zNodePos = nodeCoords.get(fallbackNode);
    if (zNodePos && Math.hypot(zNodePos.wx - wx, zNodePos.wy - wy) <= bestDist + 60) {
      return fallbackNode;
    }
    return bestNode;
  };

  const startNode = findClosestNode(fromWx, fromWy, fromZona);
  const endNode = findClosestNode(toWx, toWy, toZona);
  if (startNode === endNode) {
    return [{ wx: toWx, wy: toWy }];
  }

  const adj: Record<string, Array<{ to: string; cost: number; tramo: ViaTramo }>> = {};
  for (const t of state.tramos || []) {
    const cost = getViaTramoCost(t);
    if (!Number.isFinite(cost)) continue;
    if (!adj[t.nodoA]) adj[t.nodoA] = [];
    if (!adj[t.nodoB]) adj[t.nodoB] = [];
    adj[t.nodoA].push({ to: t.nodoB, cost, tramo: t });
    adj[t.nodoB].push({ to: t.nodoA, cost, tramo: t });
  }

  const { dist, prev } = runNodeDijkstra(adj, startNode);
  const waypoints: Array<{ wx: number; wy: number }> = [];

  if (Number.isFinite(dist[endNode] ?? Infinity)) {
    const edgeSteps: Array<{ from: string; to: string; tramo: ViaTramo }> = [];
    let cur = endNode;
    while (cur !== startNode && prev[cur]) {
      const step = prev[cur];
      if (step.tramo) {
        edgeSteps.unshift({ from: step.node, to: cur, tramo: step.tramo });
      }
      cur = step.node;
    }

    for (const step of edgeSteps) {
      const t = step.tramo;
      if (t.puntos && t.puntos.length >= 2) {
        const pts = t.nodoA === step.from ? t.puntos : [...t.puntos].reverse();
        for (const pt of pts) {
          waypoints.push({ wx: pt.wx, wy: pt.wy });
        }
      } else {
        const pEnd = nodeCoords.get(step.to);
        if (pEnd) waypoints.push({ wx: pEnd.wx, wy: pEnd.wy });
      }
    }
  }

  waypoints.push({ wx: toWx, wy: toWy });
  return waypoints;
}

export function getFranjaDia(tick: number, ticksPorDia = 120): FranjaDiaId {
  const hour = (clamp(tick, 0, Math.max(1, ticksPorDia) - 1) / Math.max(1, ticksPorDia)) * 24;
  if (hour < 6) return 'noche';
  if (hour < 12) return 'manana';
  if (hour < 14) return 'mediodia';
  if (hour < 19) return 'tarde';
  return 'anochecer';
}

export function getNpcDailyAgenda(
  state: Pick<GameState, 'hogares' | 'casas' | 'parcelas' | 'firmas' | 'zonas'>,
  npc: Npc,
  ctx?: {
    hogarById?: Map<string, Hogar>;
    casaById?: Map<string, Casa>;
    parcelaById?: Map<string, Parcela>;
    firmaById?: Map<string, Firma>;
  }
): NpcAgendaSlot[] {
  const hogar = ctx?.hogarById
    ? ctx.hogarById.get(npc.hogarId)
    : state.hogares.find((h) => h.id === npc.hogarId);
  const casa = hogar?.casaId
    ? ctx?.casaById
      ? ctx.casaById.get(hogar.casaId)
      : state.casas.find((c) => c.id === hogar.casaId)
    : undefined;
  const homeParcel = casa
    ? ctx?.parcelaById
      ? ctx.parcelaById.get(casa.parcelaId)
      : state.parcelas.find((p) => p.id === casa.parcelaId)
    : undefined;

  const homeZone = homeParcel?.zona ?? hogar?.zona ?? npc.zona;
  const homeRect = state.zonas[homeZone]?.rect;
  const homeWx = homeParcel ? homeParcel.wx + homeParcel.ww / 2 : homeRect ? homeRect.wx + homeRect.ww * 0.5 : npc.mapa.x;
  const homeWy = homeParcel ? homeParcel.wy + homeParcel.wh / 2 : homeRect ? homeRect.wy + homeRect.wh * 0.5 : npc.mapa.y;

  // Locate work or school parcel
  let workParcel: Parcela | undefined;
  let workLabel = 'Trabajando';
  if (npc.hospital.internado) {
    workParcel = state.parcelas.find((p) => p.edificio?.id === npc.hospital.edificioId) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'hospital' && p.edificio.activo);
    workLabel = 'Internado en hospital';
  } else if (npc.empleadorId) {
    const firma = ctx?.firmaById
      ? ctx.firmaById.get(npc.empleadorId)
      : state.firmas.find((f) => f.id === npc.empleadorId);
    const localId = firma?.locales?.[0];
    if (localId) {
      workParcel = ctx?.parcelaById
        ? ctx.parcelaById.get(localId)
        : state.parcelas.find((p) => p.id === localId);
    }
    workLabel = firma ? `Trabajo en ${firma.nombre}` : 'En jornada laboral';
  } else if (npc.rol === 'estudiante') {
    workParcel =
      state.parcelas.find((p) => p.zona === homeZone && p.edificio?.tipo === 'escuela' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'escuela' && p.edificio.activo);
    workLabel = 'Asistiendo a la escuela';
  } else if (npc.rol === 'policia') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && p.edificio?.tipo === 'comisaria' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'comisaria' && p.edificio.activo);
    workLabel = 'Patrulla y guardia';
  } else if (npc.rol === 'medico') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && p.edificio?.tipo === 'hospital' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'hospital' && p.edificio.activo);
    workLabel = 'Guardia médica';
  } else if (npc.rol === 'estatal' || npc.rol === 'ingeniero') {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'oficina_publica' && p.edificio.activo);
    workLabel = npc.rol === 'ingeniero' ? 'Supervisión de obras' : 'Gestión pública';
  } else if (npc.rol === 'docente') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && p.edificio?.tipo === 'escuela' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'escuela' && p.edificio.activo);
    workLabel = 'Dictando clases';
  } else if (npc.rol === 'jubilado') {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
    workLabel = 'Paseo por la plaza';
  } else {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
    workLabel = 'Buscando empleo / trámites';
  }

  const workZone = workParcel?.zona ?? npc.zona;
  const workRect = state.zonas[workZone]?.rect;
  const workWx = workParcel ? workParcel.wx + workParcel.ww / 2 : workRect ? workRect.wx + workRect.ww * 0.5 : homeWx;
  const workWy = workParcel ? workParcel.wy + workParcel.wh / 2 : workRect ? workRect.wy + workRect.wh * 0.5 : homeWy;

  // Midday shopping / food parcel in home or work zone
  const shopParcel =
    state.parcelas.find(
      (p) =>
        (p.zona === homeZone || p.zona === workZone) &&
        p.edificio?.activo &&
        (p.edificio.tipo === 'almacen' || p.edificio.tipo === 'supermercado' || p.edificio.tipo === 'restoran')
    ) ??
    state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
  const shopZone = shopParcel?.zona ?? homeZone;
  const shopWx = shopParcel ? shopParcel.wx + shopParcel.ww / 2 : homeWx;
  const shopWy = shopParcel ? shopParcel.wy + shopParcel.wh / 2 : homeWy;

  // Afternoon leisure parcel for non-working hours or breaks
  const leisureParcel =
    npc.edad >= 18 && (npc.economia.propensionGasto >= 62 || npc.rol === 'jubilado' || npc.rol === 'desempleado')
      ? state.parcelas.find(
          (p) =>
            p.edificio?.activo &&
            (p.edificio.tipo === 'bar_cafe' ||
              p.edificio.tipo === 'cine_teatro' ||
              p.edificio.tipo === 'gimnasio' ||
              p.edificio.tipo === 'plaza')
        )
      : undefined;

  const isHospitalized = npc.hospital.internado;
  const afternoonUsesLeisure =
    !isHospitalized &&
    Boolean(leisureParcel) &&
    (npc.rol === 'estudiante' || npc.rol === 'jubilado' || npc.rol === 'desempleado');

  const tardeParcel = afternoonUsesLeisure ? leisureParcel : workParcel;
  const tardeZone = tardeParcel?.zona ?? workZone;
  const tardeWx = tardeParcel ? tardeParcel.wx + tardeParcel.ww / 2 : workWx;
  const tardeWy = tardeParcel ? tardeParcel.wy + tardeParcel.wh / 2 : workWy;
  const tardeActividad = afternoonUsesLeisure
    ? `Ocio en ${tardeParcel?.nombre ?? 'la ciudad'}`
    : workLabel;

  const nightPatrol = !isHospitalized && npc.rol === 'policia';

  return [
    {
      franja: 'noche',
      horario: AGENDA_CONSTANTS.franjas[0].horario,
      actividad: isHospitalized ? 'Internado en hospital' : homeParcel ? 'Descanso en casa' : 'Pernoctando en zona',
      destinoTipo: isHospitalized ? 'hospital' : homeParcel ? 'casa' : 'zona',
      zona: isHospitalized ? workZone : homeZone,
      parcelaId: isHospitalized ? workParcel?.id : homeParcel?.id,
      wx: isHospitalized ? workWx : homeWx,
      wy: isHospitalized ? workWy : homeWy,
    },
    {
      franja: 'manana',
      horario: AGENDA_CONSTANTS.franjas[1].horario,
      actividad: workLabel,
      destinoTipo: isHospitalized ? 'hospital' : workParcel ? 'trabajo' : 'zona',
      zona: workZone,
      parcelaId: workParcel?.id,
      wx: workWx,
      wy: workWy,
    },
    {
      franja: 'mediodia',
      horario: AGENDA_CONSTANTS.franjas[2].horario,
      actividad: isHospitalized ? 'Internado en hospital' : shopParcel ? `Compras en ${shopParcel.nombre}` : 'Almuerzo en casa',
      destinoTipo: isHospitalized ? 'hospital' : shopParcel ? 'parcela' : 'casa',
      zona: isHospitalized ? workZone : shopZone,
      parcelaId: isHospitalized ? workParcel?.id : shopParcel?.id,
      wx: isHospitalized ? workWx : shopWx,
      wy: isHospitalized ? workWy : shopWy,
    },
    {
      franja: 'tarde',
      horario: AGENDA_CONSTANTS.franjas[3].horario,
      actividad: tardeActividad,
      destinoTipo: isHospitalized ? 'hospital' : afternoonUsesLeisure ? 'parcela' : 'trabajo',
      zona: tardeZone,
      parcelaId: tardeParcel?.id,
      wx: tardeWx,
      wy: tardeWy,
    },
    {
      franja: 'anochecer',
      horario: AGENDA_CONSTANTS.franjas[4].horario,
      actividad: isHospitalized
        ? 'Internado en hospital'
        : nightPatrol
        ? 'Patrulla nocturna'
        : homeParcel
        ? 'Regreso al hogar'
        : 'Regreso a su zona',
      destinoTipo: isHospitalized ? 'hospital' : nightPatrol ? 'trabajo' : homeParcel ? 'casa' : 'zona',
      zona: isHospitalized || nightPatrol ? workZone : homeZone,
      parcelaId: isHospitalized || nightPatrol ? workParcel?.id : homeParcel?.id,
      wx: isHospitalized || nightPatrol ? workWx : homeWx,
      wy: isHospitalized || nightPatrol ? workWy : homeWy,
    },
  ];
}

export function getCommuteProductivityFactor(
  state: GameState,
  npc: Npc,
  firmaById?: Map<string, Firma>
): number {
  if (!npc.empleadorId) return 1;
  const firma = firmaById
    ? firmaById.get(npc.empleadorId)
    : state.firmas.find((f) => f.id === npc.empleadorId);
  if (!firma) return 1;
  const cost = getZoneTravelCost(state, npc.zona, firma.zona);
  if (!Number.isFinite(cost)) return 0.65;
  const extra = Math.max(0, cost - VIAL_CONSTANTS.costoInternoZona);
  const horasViaje = extra / Math.max(1, AGENDA_CONSTANTS.baldosasPorHora);
  const factor = clamp(1 - extra * VIAL_CONSTANTS.kTraslado - horasViaje * 0.05, 0.72, 1);
  npc.commuteBaldosas = Number(cost.toFixed(1));
  npc.commutePenalty = Number((1 - factor).toFixed(3));
  return factor;
}

export function computeDemandaSuelo(state: GameState): Record<string, number> {
  const result: Record<string, number> = {};
  const activeZones = getWorldZones(state);
  const parcelTipos: ParcelTipo[] = ['residencial', 'comercial', 'industrial', 'agricola'];

  const casaById = new Map(state.casas.map((c) => [c.id, c]));
  const freeCountByZoneTipo = new Map<string, number>();
  for (const p of state.parcelas) {
    if (p.estado === 'libre') {
      const k = `${p.zona}:${p.tipoParcela}`;
      freeCountByZoneTipo.set(k, (freeCountByZoneTipo.get(k) ?? 0) + 1);
    }
  }

  for (const z of activeZones) {
    const zHogares = state.hogares.filter((h) => h.zona === z);
    const streetOrCrowded = zHogares.filter(
      (h) => h.estado === 'calle' || isHogarHacinado(h, h.casaId ? casaById.get(h.casaId) : undefined)
    ).length;

    const expandingCom = state.firmas.filter(
      (f) =>
        f.activa &&
        f.zona === z &&
        f.rubro !== 'agro' &&
        f.rubro !== 'industria' &&
        f.rubro !== 'medio' &&
        f.factor > 1.02 &&
        f.caja >= 220
    ).length;

    const expandingAgro = state.firmas.filter(
      (f) => f.activa && f.zona === z && f.rubro === 'agro' && f.factor > 1.02 && f.caja >= 260
    ).length;

    const expandingInd = state.firmas.filter(
      (f) => f.activa && f.zona === z && f.rubro === 'industria' && f.factor > 1.02 && f.caja >= 340
    ).length;

    const demandByTipo: Record<ParcelTipo, number> = {
      residencial: streetOrCrowded,
      comercial: expandingCom,
      industrial: expandingInd,
      agricola: expandingAgro,
      publica: 0,
      especial: 0,
    };

    for (const pt of parcelTipos) {
      const key = `${z}:${pt}`;
      const libres = freeCountByZoneTipo.get(key) ?? 0;
      const dem = demandByTipo[pt];
      result[key] = Number((dem / Math.max(0.5, libres)).toFixed(2));
    }
  }

  return result;
}

export function computeTotalWorldMoney(state: GameState): number {
  let total = state.gobierno.reserva;
  for (const h of state.hogares) {
    total += h.dinero;
  }
  for (const f of state.firmas) {
    total += f.caja + f.ventas;
  }
  return total;
}

export function computeDailyFoodPriceForZone(state: GameState, zona: ZoneId): number {
  const agroFirmas = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  const zonePop = Math.max(
    1,
    state.npcs.filter((n) => n.vivo && n.zona === zona).length
  );
  const agroZone = agroFirmas.filter((f) => f.zona === zona);
  const stockZone =
    agroZone.length > 0
      ? agroZone.reduce((s, f) => s + (f.stock ?? 0), 0)
      : state.alimento.stock / Math.max(1, getWorldZones(state).length);
  const diasStockZone = stockZone / Math.max(1, zonePop * ECON_CONSTANTS.consumoPorNpc);
  const globalDays = Math.max(0.2, state.alimento.diasStock);
  const effDays = agroZone.length > 0 ? (diasStockZone * 0.6 + globalDays * 0.4) : globalDays;

  const scarcityFactor = clamp(10 / Math.max(1.5, effDays), 0.72, 2.4);

  let climateMult = 1;
  for (const fen of getActivePhenomena(state)) {
    const fInt = fen.intensidad / 100;
    if (fen.tipo === 'sequia') {
      climateMult *= 1 + ECON_CONSTANTS.coefSequiaPrecio * fInt;
    } else if (fen.tipo === 'plaga') {
      climateMult *= 1 + ECON_CONSTANTS.coefPlagaPrecio * fInt;
    }
  }

  const inflFactor = 1 + (state.gobierno.inflacion || 0) / 100;
  const comerciosZona = state.firmas.filter(
    (f) => f.activa && f.rubro === 'comercio' && f.zona === zona
  );
  const maxMargen = comerciosZona.reduce((m, f) => Math.max(m, f.margenPoder || 0), 0);
  const rawPrice =
    ECON_CONSTANTS.precioBaseAlimento * scarcityFactor * climateMult * inflFactor * (1 + maxMargen);

  const capMode = state.gobierno.palancasVigentes.precioMaximo;
  const capFactor = capMode === 'moderado' ? 1.25 : capMode === 'estricto' ? 0.6 : null;
  if (capFactor !== null) {
    return Number(Math.min(rawPrice, ECON_CONSTANTS.precioBaseAlimento * capFactor * inflFactor).toFixed(3));
  }
  return Number(rawPrice.toFixed(3));
}

export function getFirmaLocales(state: GameState, firma: Firma): Parcela[] {
  if (!firma.locales || firma.locales.length === 0) return [];
  const set = new Set(firma.locales);
  return state.parcelas.filter((p) => set.has(p.id) && p.edificio && p.edificio.activo);
}

export function getFirmaRoleCaps(state: GameState, firma: Firma): Partial<Record<RoleId, number>> {
  const total: Partial<Record<RoleId, number>> = Object.create(null);
  for (const p of getFirmaLocales(state, firma)) {
    if (!p.edificio) continue;
    const caps = getBuildingRoleCapacity(p.edificio);
    for (const [role, val] of Object.entries(caps)) {
      if (typeof val === 'number' && val > 0) {
        total[role as RoleId] = (total[role as RoleId] ?? 0) + val;
      }
    }
  }
  return total;
}

export function getHouseEffectiveCapacity(casa: Casa): number {
  const stateFactor = clamp(casa.estado / 100, 0.4, 1);
  return Math.max(1, Math.round(casa.capacidad * stateFactor));
}

export function isHogarHacinado(hogar: Hogar, casa: Casa | undefined): boolean {
  if (!casa) return false;
  return hogar.miembros.length > getHouseEffectiveCapacity(casa);
}

export interface HospitalFacilityInfo {
  edificioId: string;
  parcelaId: string;
  nombre: string;
  zona: ZoneId;
  tipo: 'hospital' | 'hospital_campana';
  esCampana: boolean;
  medicosAsignados: number;
  camasFisicas: number;
  camasEfectivas: number;
  ocupadas: number;
  libres: number;
  diasRestantesCampana?: number;
}

export function computeHospitalFacilities(
  parcelas: Parcela[],
  npcs: Npc[],
  zonas?: GameState['zonas']
): HospitalFacilityInfo[] {
  const active = getActiveBuildings(parcelas).filter(
    (b) => b.tipo === 'hospital' || b.tipo === 'hospital_campana'
  );
  if (active.length === 0) return [];

  const vivos = npcs.filter((n) => n.vivo);
  const medicosPorZona: Record<string, number> = {};
  for (const n of vivos) {
    if (n.rol === 'medico' && !n.hospital.internado && !n.accionIa?.fueraDePuesto) {
      medicosPorZona[n.zona] = (medicosPorZona[n.zona] || 0) + 1;
    }
  }

  const hospitalesPermanentesPorZona: Record<string, BuildingInstance[]> = {};
  for (const b of active) {
    if (b.tipo === 'hospital') {
      if (!hospitalesPermanentesPorZona[b.zona]) hospitalesPermanentesPorZona[b.zona] = [];
      hospitalesPermanentesPorZona[b.zona].push(b);
    }
  }

  const parcelNameById = new Map<string, string>();
  for (const p of parcelas) parcelNameById.set(p.id, p.nombre);

  const zoneSteps = zonas ? buildZoneStepMap(zonas) : null;
  const totalMedicos = Object.values(medicosPorZona).reduce((s, c) => s + c, 0);
  const totalPerm = active.filter((b) => b.tipo === 'hospital').length;

  const facilities: HospitalFacilityInfo[] = active.map((b) => {
    const def = BUILDING_CATALOG[b.tipo];
    const camasFisicas = def.camasHospital ?? 0;
    let medicosAsignados = 0;
    let camasEfectivas = camasFisicas;

    if (b.tipo === 'hospital') {
      const sameZoneHosp = hospitalesPermanentesPorZona[b.zona]?.length ?? 1;
      const medsLocal = medicosPorZona[b.zona] || 0;
      medicosAsignados =
        medsLocal > 0
          ? Math.round(medsLocal / sameZoneHosp)
          : totalPerm > 0
          ? Math.round(totalMedicos / totalPerm)
          : 0;
      // Fallback: count all active medicos across reachable zones if local has none
      if (medicosAsignados === 0 && totalMedicos > 0 && zoneSteps) {
        const anyMeds = Object.values(medicosPorZona).reduce((a, c) => a + c, 0);
        medicosAsignados = Math.max(1, Math.round(anyMeds / totalPerm));
      }
      camasEfectivas = Math.min(camasFisicas, medicosAsignados * ECON_CONSTANTS.pacientesPorMedico);
    }

    const ocupadas = vivos.filter(
      (n) => n.hospital.internado && n.hospital.edificioId === b.id
    ).length;

    return {
      edificioId: b.id,
      parcelaId: b.parcelaId,
      nombre: parcelNameById.get(b.parcelaId) || def.nombre,
      zona: b.zona,
      tipo: b.tipo as 'hospital' | 'hospital_campana',
      esCampana: b.tipo === 'hospital_campana',
      medicosAsignados,
      camasFisicas,
      camasEfectivas,
      ocupadas,
      libres: Math.max(0, camasEfectivas - ocupadas),
      diasRestantesCampana: b.diasRestantesCampana,
    };
  });

  // Unassigned internados fall back to first available facility
  const internadosSinEdificio = vivos.filter(
    (n) => n.hospital.internado && !n.hospital.edificioId
  ).length;
  if (internadosSinEdificio > 0 && facilities.length > 0) {
    facilities[0].ocupadas += internadosSinEdificio;
    facilities[0].libres = Math.max(0, facilities[0].camasEfectivas - facilities[0].ocupadas);
  }

  return facilities;
}

export function computeAmenazaPercibida(state: GameState): Record<ZoneId, number> {
  const dia = state.reloj.dia;
  const zones = getWorldZones(state);
  const minHitDay = dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;
  const result: Record<ZoneId, number> = {};
  for (const z of zones) result[z] = 0;

  const hasActiveMedia = state.medios.some((m) => m.activa !== false);
  const trackedPhenomena = state.clima.fenomenos.filter((f) => {
    const aviso = f.avisoDias ?? 0;
    return f.origen && dia >= f.inicioDia - aviso && dia < f.inicioDia + f.duracionDias;
  });

  const medioCredById = new Map<string, number>();
  for (const m of state.medios) {
    medioCredById.set(m.id, m.credibilidad);
  }

  const phenomZones = new Set<ZoneId>();
  for (const f of trackedPhenomena) {
    if (f.origen) phenomZones.add(f.origen);
  }

  const avisoByZone: Record<ZoneId, number> = {};
  if (hasActiveMedia && phenomZones.size > 0) {
    for (const n of state.noticias) {
      const nz = n.zonaOrigen ?? n.zona;
      if (
        n.esAviso &&
        nz &&
        phenomZones.has(nz) &&
        (n.vigenteHastaDia === undefined || dia < n.vigenteHastaDia)
      ) {
        const cred = n.credibilidad ?? medioCredById.get(n.medioId) ?? 60;
        const score = (n.alcance * cred) / 100;
        if (score > (avisoByZone[nz] ?? 0)) avisoByZone[nz] = score;
      }
    }
  }

  for (const z of zones) {
    const avisoVal = avisoByZone[z] ?? 0;
    const hits = (state.golpesPorZonaHistorial[z] || []).filter(
      (d) => d > minHitDay && d <= dia
    ).length;
    const golpesVal = Math.min(100, ECON_CONSTANTS.golpeAmenazaPeso * hits);
    result[z] = Number(Math.max(avisoVal, golpesVal).toFixed(1));
  }

  return result;
}

export function computeNpcVariableTargets(
  npc: Npc,
  hogar: Hogar | undefined,
  casa: Casa | undefined,
  state: GameState,
  ctx?: { vivosCount?: number; hospitalFull?: boolean }
): {
  satisfaccion: number;
  lealtad: number;
} {
  let vivosCount = ctx?.vivosCount;
  let hospitalFull = ctx?.hospitalFull;
  if (vivosCount === undefined || hospitalFull === undefined) {
    let alive = 0;
    let internadosCount = 0;
    for (const n of state.npcs) {
      if (!n.vivo) continue;
      alive++;
      if (n.hospital.internado) internadosCount++;
    }
    vivosCount = Math.max(1, alive);
    const hospitalCap = computeHospitalFacilities(state.parcelas, state.npcs, state.zonas).reduce(
      (s, f) => s + f.camasEfectivas,
      0
    );
    hospitalFull = hospitalCap > 0 && internadosCount >= hospitalCap;
  }

  const isStreet = hogar?.estado === 'calle' && !hogar?.ocupandoCasaId;
  const isOwner =
    Boolean(casa && hogar) &&
    ((casa!.dueno.tipo === 'hogar' && casa!.dueno.id === hogar!.id) ||
      (casa!.dueno.tipo === 'npc' && hogar!.miembros.includes(casa!.dueno.id)));
  const isCrowded = isHogarHacinado(hogar ?? ({ miembros: [] } as unknown as Hogar), casa);
  const houseBadState = casa ? casa.estado < HOUSING_CONSTANTS.umbralEstadoCasaMalo : false;
  const rentBurden =
    hogar && casa && !isOwner && hogar.ultimoIngresoNeto > 0
      ? casa.alquiler / Math.max(1, hogar.ultimoIngresoNeto)
      : 0;

  const powerAdq = state.ultimaSalidaEconomica?.poderAdquisitivo?.[npc.hogarId] ?? 65;
  const empBonus = npc.rol === 'desempleado' ? -12 : 4;
  const healthBonus = (npc.variables.salud - 70) * 0.28;
  const hungerPenalty = npc.variables.hambre * 0.42;
  const fearPenalty = npc.variables.miedo * 0.2;
  const housingDelta =
    (isOwner ? 6 : 0) +
    (isStreet ? -22 : 0) +
    (isCrowded ? -8 : 0) +
    (houseBadState ? -6 : 0) +
    (rentBurden > 0.4 ? -clamp((rentBurden - 0.4) * 28, 0, 14) : 0);

  const familySize = hogar?.miembros.length ?? 1;
  const familyBonus = (npc.parejaId ? 3 : 0) + (familySize >= 3 ? 2.5 : 0);
  const recentLossPenalty =
    npc.ultimaPerdidaFamiliarDia && state.reloj.dia - npc.ultimaPerdidaFamiliarDia <= 14
      ? -clamp(14 - (state.reloj.dia - npc.ultimaPerdidaFamiliarDia), 2, 12)
      : 0;

  const hungryKidsPenalty =
    hogar && hogar.noPudoPagarComida ? -8 : 0;

  const resilFactor = (getEffectiveTrait(npc, 'resiliencia') - 50) * 0.14;
  const modSat = getModifierDelta(npc, 'satisfaccion');

  const satisfaccion = clamp(
    46 +
      (powerAdq - 50) * 0.3 +
      empBonus +
      healthBonus -
      hungerPenalty -
      fearPenalty +
      housingDelta +
      familyBonus +
      recentLossPenalty +
      hungryKidsPenalty +
      resilFactor +
      modSat,
    0,
    100
  );

  const pubBonus = ROLE_CATALOG[npc.rol].publico ? 8 : 0;
  const taxDrag = (state.gobierno.palancasVigentes.impuesto - 36) * -0.25;
  const servQuality =
    (state.gobierno.indicadores.salud +
      state.gobierno.indicadores.seguridad +
      state.gobierno.indicadores.infraestructura) /
      3 -
    55;
  const modLealtad = getModifierDelta(npc, 'lealtad');
  const lealtad = clamp(
    52 +
      (satisfaccion - 50) * 0.55 +
      pubBonus +
      taxDrag +
      servQuality * 0.25 -
      (hospitalFull && vivosCount > 0 ? 4 : 0) +
      modLealtad,
    0,
    100
  );

  return { satisfaccion, lealtad };
}

export function getNpcProductivity(
  npc: Npc,
  state: GameState,
  ctx?: { hogarById?: Map<string, Hogar>; firmaById?: Map<string, Firma> }
): number {
  if (!npc.vivo || npc.hospital.internado || npc.accionIa?.fueraDePuesto) return 0;
  const hogar = ctx?.hogarById
    ? ctx.hogarById.get(npc.hogarId)
    : state.hogares.find((h) => h.id === npc.hogarId);
  const isActuallyStreet = hogar?.estado === 'calle' && !hogar?.ocupandoCasaId;
  const streetFactor = isActuallyStreet ? HOUSING_CONSTANTS.calleProdFactor : 1;
  const commuteFactor = getCommuteProductivityFactor(state, npc, ctx?.firmaById);
  const modProd = getModifierDelta(npc, 'productividad');
  const base = clamp(
    (45 + npc.variables.salud * 0.4 + npc.personalidad.laboriosidad * 0.15 - npc.variables.hambre * 0.35) *
      streetFactor *
      commuteFactor +
      modProd,
    15,
    125
  );
  return Number(base.toFixed(1));
}

export function deriveCommunityStats(state: GameState): CommunityDerived {
  const total = Math.max(1, state.config.poblacionInicial);
  const vivos = state.npcs.filter((n) => n.vivo);
  const vivosCount = vivos.length;
  const bajas = Math.max(0, state.npcs.length - vivosCount);

  const roles: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    empresario: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    constructor: 0,
    inmobiliario: 0,
    desempleado: 0,
    jubilado: 0,
  };

  const hogarById = new Map<string, Hogar>();
  for (const h of state.hogares) hogarById.set(h.id, h);
  const casaById = new Map<string, Casa>();
  for (const c of state.casas) casaById.set(c.id, c);
  const firmaById = new Map<string, Firma>();
  for (const f of state.firmas) firmaById.set(f.id, f);
  const prodCtx = { hogarById, firmaById };

  const zoneIds = getWorldZones(state);
  const zoneCount = zoneIds.length;
  const vivosByZone = new Map<ZoneId, Npc[]>();
  for (const z of zoneIds) vivosByZone.set(z, []);

  let satSum = 0;
  let apoyoCount = 0;
  let descCount = 0;
  let hambreCrit = 0;
  let sinDinero = 0;
  let internados = 0;
  let esperandoCama = 0;
  let prodSum = 0;
  let edadSum = 0;
  let menores = 0;
  let jubilados = 0;
  let laborales = 0;

  for (const n of vivos) {
    roles[n.rol] = (roles[n.rol] ?? 0) + 1;
    satSum += n.variables.satisfaccion;
    if (n.variables.lealtad >= 50) apoyoCount++;
    if (n.variables.satisfaccion < 35) descCount++;
    if (n.variables.hambre >= 70) hambreCrit++;
    const h = hogarById.get(n.hogarId);
    if (!h || h.dinero <= 1) sinDinero++;
    if (n.hospital.internado) internados++;
    if (n.hospital.esperandoCama) esperandoCama++;
    prodSum += getNpcProductivity(n, state, prodCtx);
    edadSum += n.edad;
    if (n.edad < 18) menores++;
    else if (n.edad >= 65) jubilados++;
    else if (n.rol !== 'estudiante') laborales++;
    const ez = getEffectiveZone(n, zoneCount, zoneIds);
    const zList = vivosByZone.get(ez);
    if (zList) zList.push(n);
    else vivosByZone.set(ez, [n]);
  }

  const hogCount = Math.max(1, state.hogares.length);
  let calleCount = 0;
  let conCasaCount = 0;
  let hacinadosCount = 0;
  let despensaSum = 0;
  let rentLoadSum = 0;
  let rentLoadCount = 0;
  const streetByZone = new Map<ZoneId, number>();

  for (const h of state.hogares) {
    if (h.estado === 'calle') {
      calleCount++;
      if (!h.ocupandoCasaId) {
        streetByZone.set(h.zona, (streetByZone.get(h.zona) ?? 0) + 1);
      }
    }
    if (h.estado === 'con_casa') {
      conCasaCount++;
      const casa = h.casaId ? casaById.get(h.casaId) : undefined;
      if (isHogarHacinado(h, casa)) hacinadosCount++;
      if (casa && casa.alquiler > 0) {
        const isOwner =
          (casa.dueno.tipo === 'hogar' && casa.dueno.id === h.id) ||
          (casa.dueno.tipo === 'npc' && h.miembros.includes(casa.dueno.id));
        if (!isOwner && h.ultimoIngresoNeto > 0) {
          rentLoadSum += (casa.alquiler / Math.max(1, h.ultimoIngresoNeto)) * 100;
          rentLoadCount++;
        }
      }
    }
    const miembros = Math.max(1, h.miembros.length);
    despensaSum += h.despensa / miembros;
  }

  const hospFacilities = computeHospitalFacilities(state.parcelas, state.npcs, state.zonas);
  const camasHospital = hospFacilities.reduce((s, f) => s + f.camasEfectivas, 0);
  const capacidadHospitalTotal = hospFacilities.reduce((s, f) => s + f.camasFisicas, 0);
  const hospitalesLlenos = hospFacilities.filter(
    (f) => f.camasEfectivas > 0 && f.libres === 0
  ).length;
  const hospitalOcupacionPct =
    camasHospital > 0
      ? Number((((internados + esperandoCama) / camasHospital) * 100).toFixed(1))
      : internados + esperandoCama > 0
      ? 100
      : 0;

  const defensa: Record<ZoneId, number> = {};
  const orden: Record<ZoneId, number> = {};
  const amenazaPercibida = computeAmenazaPercibida(state);

  const activeBuildings = getActiveBuildings(state.parcelas);
  const comisariaBonusByZone = new Map<ZoneId, number>();
  const murallaBonusByZone = new Map<ZoneId, number>();
  for (const b of activeBuildings) {
    if (b.tipo === 'comisaria') {
      comisariaBonusByZone.set(
        b.zona,
        (comisariaBonusByZone.get(b.zona) ?? 0) + (BUILDING_CATALOG[b.tipo].bonusDefensa ?? 0)
      );
    } else if (b.tipo === 'muralla') {
      murallaBonusByZone.set(
        b.zona,
        (murallaBonusByZone.get(b.zona) ?? 0) + (BUILDING_CATALOG[b.tipo].defensaMuralla ?? 0)
      );
    }
  }

  for (const z of zoneIds) {
    const zNpcs = vivosByZone.get(z) ?? [];
    let zPol = 0;
    let zOut = 0;
    let zFearSum = 0;
    for (const n of zNpcs) {
      if (n.rol === 'policia' && !n.hospital.internado && !n.accionIa?.fueraDePuesto) zPol++;
      if (n.accionIa?.fueraDePuesto) zOut++;
      zFearSum += n.variables.miedo;
    }
    const bonusComisaria = comisariaBonusByZone.get(z) ?? 0;
    const bonusMuralla = murallaBonusByZone.get(z) ?? 0;
    const integ = state.gobierno.integridad[z] ?? 100;
    defensa[z] = Number(clamp(zPol * 10 + bonusComisaria + bonusMuralla + (integ - 100) * 0.25, 0, 100).toFixed(1));

    const zStreet = streetByZone.get(z) ?? 0;
    const zFear = zNpcs.length > 0 ? zFearSum / zNpcs.length : 0;
    const neededPol = Math.max(1, zNpcs.length * ECON_CONSTANTS.objetivoOrden);
    const ordRatio = clamp(zPol / neededPol, 0, 1.3);
    orden[z] = Number(clamp(48 + ordRatio * 42 - zOut * 5 - zStreet * 3 - zFear * 0.15, 0, 100).toFixed(1));
  }

  const activeFirmas = state.firmas.filter((f) => f.activa);
  let cuotaMayorPct = 0;
  for (const f of activeFirmas) {
    for (const q of Object.values(f.cuotaZona || {})) {
      if (q * 100 > cuotaMayorPct) cuotaMayorPct = q * 100;
    }
  }

  const yearsElapsed = Math.max(1 / 365, state.reloj.dia / 365);
  const natalidad = Number(
    ((state.mercadoStats.nacimientosAcum / Math.max(1, vivosCount)) * 100 / Math.max(0.2, yearsElapsed)).toFixed(2)
  );
  const mortalidad = Number(
    ((state.mercadoStats.muertesAcum / Math.max(1, vivosCount)) * 100 / Math.max(0.2, yearsElapsed)).toFixed(2)
  );

  const tramos = state.tramos ?? [];
  const parcelasSinCalle = state.parcelas.filter((p) => p.estado === 'sin_calle').length;
  const zonasNoUrbanizadas = Object.values(state.zonas).filter(
    (z) => z.estado === 'no_urbanizada'
  ).length;
  const tramosEnMalEstado = tramos.filter(
    (t) => t.construida && t.estado > 0 && t.estado < VIAL_CONSTANTS.umbralMalEstadoVia
  ).length;
  const tramosCortados = tramos.filter((t) => t.construida && t.estado <= 0).length;
  const maint = computeMaintenanceBreakdown(
    state.parcelas,
    state.gobierno.palancasVigentes.nivelObras,
    vivosCount,
    state.config.poblacionInicial,
    tramos
  );
  const constrFirms = activeFirmas.filter((f) => f.rubro === 'construccion');
  const constructoraSalud = {
    firmas: constrFirms.length,
    ventasPeriodo: Number(
      constrFirms.reduce((s, f) => s + (f.ultimoIngresoPeriodo || f.ventas || 0), 0).toFixed(1)
    ),
    factorMedio:
      constrFirms.length > 0
        ? Number((constrFirms.reduce((s, f) => s + f.factor, 0) / constrFirms.length).toFixed(2))
        : 0,
    empleos: constrFirms.reduce((s, f) => s + f.empleados.length, 0),
  };

  return {
    poblacion: vivosCount,
    poblacionPct: Number(((vivosCount / total) * 100).toFixed(1)),
    vivos: vivosCount,
    bajas,
    satisfaccionMedia: vivosCount > 0 ? Number((satSum / vivosCount).toFixed(1)) : 0,
    apoyoPct: vivosCount > 0 ? Number(((apoyoCount / vivosCount) * 100).toFixed(1)) : 0,
    descontentosPct: vivosCount > 0 ? Number(((descCount / vivosCount) * 100).toFixed(1)) : 0,
    desempleoPct:
      laborales > 0 ? Number(((roles.desempleado / laborales) * 100).toFixed(1)) : 0,
    hambreCriticaPct: vivosCount > 0 ? Number(((hambreCrit / vivosCount) * 100).toFixed(1)) : 0,
    sinDineroPct: vivosCount > 0 ? Number(((sinDinero / vivosCount) * 100).toFixed(1)) : 0,
    despensaMediaDias: Number((despensaSum / hogCount).toFixed(2)),
    hospitalOcupacionPct,
    camasHospital,
    capacidadHospitalTotal,
    hospitalesLlenos,
    internados,
    esperandoCama,
    edificiosActivos: activeBuildings.length,
    parcelasLibres: state.parcelas.filter((p) => p.estado === 'libre').length,
    parcelasSinCalle,
    zonasNoUrbanizadas,
    tramosEnMalEstado,
    tramosCortados,
    mantenimientoTotalPeriodo: maint.mantenimientoTotal,
    hogares: state.hogares.length,
    callePct: Number(((calleCount / hogCount) * 100).toFixed(1)),
    hacinamientoPct:
      conCasaCount > 0 ? Number(((hacinadosCount / conCasaCount) * 100).toFixed(1)) : 0,
    alquilerCargaMediaPct:
      rentLoadCount > 0 ? Number((rentLoadSum / rentLoadCount).toFixed(1)) : 0,
    natalidad,
    mortalidad,
    edadMedia: vivosCount > 0 ? Number((edadSum / vivosCount).toFixed(1)) : 0,
    pctMenores: vivosCount > 0 ? Number(((menores / vivosCount) * 100).toFixed(1)) : 0,
    pctJubilados: vivosCount > 0 ? Number(((jubilados / vivosCount) * 100).toFixed(1)) : 0,
    defensa,
    orden,
    amenazaPercibida,
    productividadTotal: Number(prodSum.toFixed(1)),
    roles,
    mercado: {
      firmas: activeFirmas.length,
      cuotaMayorPct: Number(cuotaMayorPct.toFixed(1)),
      quiebrasPeriodo: state.mercadoStats.quiebrasPeriodo,
      fundacionesPeriodo: state.mercadoStats.fundacionesPeriodo,
    },
    constructoraSalud,
  };
}

export const ROOT_EVENT_TYPES = new Set<string>([
  'control',
  'obra_inicio',
  'demolicion',
  'fenomeno_inicio',
  'aviso',
  'muerte',
  'nacimiento',
  'pareja',
  'herencia',
  'desalojo',
  'firma_fundada',
  'firma_compra',
  'firma_quiebra',
  'monopolio',
  'impago',
  'hito',
  'victoria',
  'objetivo_perdido',
  'fin_partida',
]);

export function compactEvents(state: GameState): void {
  const cutoff = state.reloj.dia - ECON_CONSTANTS.ventanaEventosDias;
  if (cutoff <= 1 && state.eventos.length <= 1500) return;
  const byId = new Map<string, SimEvent>();
  for (const e of state.eventos) byId.set(e.id, e);
  const pinned = new Set<string>();
  for (const e of state.eventos) {
    if (e.tipo === 'agregado' || e.dia < cutoff) continue;
    let cur: string | undefined = e.causa;
    for (let depth = 0; depth < 6 && cur; depth++) {
      const parent = byId.get(cur);
      if (!parent || pinned.has(parent.id)) break;
      if (parent.dia < cutoff) pinned.add(parent.id);
      cur = parent.causa;
    }
  }

  let hasUncompactedOld = false;
  for (const ev of state.eventos) {
    if (ev.dia < cutoff && ev.tipo !== 'agregado' && !ROOT_EVENT_TYPES.has(ev.tipo) && !pinned.has(ev.id)) {
      hasUncompactedOld = true;
      break;
    }
  }
  if (!hasUncompactedOld && state.eventos.length <= 1500) return;

  const kept: SimEvent[] = [];
  const aggByDayZone: Record<
    string,
    { dia: number; zona: ZoneId; conteos: Record<string, number>; existing?: SimEvent; dirty: boolean }
  > = {};

  for (const ev of state.eventos) {
    if (ev.dia >= cutoff || ROOT_EVENT_TYPES.has(ev.tipo) || pinned.has(ev.id)) {
      kept.push(ev);
    } else if (ev.tipo === 'agregado') {
      const key = `${ev.dia}:${ev.zona}`;
      const cur = aggByDayZone[key];
      if (cur) {
        for (const [k, v] of Object.entries(ev.conteos)) cur.conteos[k] = (cur.conteos[k] ?? 0) + v;
        cur.dirty = true;
      } else {
        aggByDayZone[key] = { dia: ev.dia, zona: ev.zona, conteos: { ...ev.conteos }, existing: ev, dirty: false };
      }
    } else {
      const key = `${ev.dia}:${ev.zona}`;
      if (!aggByDayZone[key]) {
        aggByDayZone[key] = { dia: ev.dia, zona: ev.zona, conteos: {}, dirty: true };
      } else {
        aggByDayZone[key].dirty = true;
      }
      aggByDayZone[key].conteos[ev.tipo] = (aggByDayZone[key].conteos[ev.tipo] ?? 0) + 1;
    }
  }

  for (const bucket of Object.values(aggByDayZone)) {
    if (bucket.existing && !bucket.dirty) {
      kept.push(bucket.existing);
    } else {
      kept.push({
        id: nextSeqId(state, 'ev_agg'),
        dia: bucket.dia,
        tipo: 'agregado',
        zona: bucket.zona,
        conteos: bucket.conteos,
      });
    }
  }

  const pinnedRoots: SimEvent[] = [];
  const aggEvents: SimEvent[] = [];
  const recentOthers: SimEvent[] = [];

  for (const ev of kept) {
    if (ROOT_EVENT_TYPES.has(ev.tipo) || pinned.has(ev.id)) {
      pinnedRoots.push(ev);
    } else if (ev.tipo === 'agregado') {
      aggEvents.push(ev);
    } else {
      recentOthers.push(ev);
    }
  }

  pinnedRoots.sort((a, b) => b.dia - a.dia);
  aggEvents.sort((a, b) => b.dia - a.dia);
  recentOthers.sort((a, b) => b.dia - a.dia);

  const maxEvents = 1500;
  const keptRoots = pinnedRoots.slice(0, maxEvents);
  const remainingAfterRoots = Math.max(0, maxEvents - keptRoots.length);
  const minAggReserve = Math.min(aggEvents.length, Math.min(600, remainingAfterRoots));
  const recentBudget = Math.max(0, remainingAfterRoots - minAggReserve);
  const keptRecent = recentOthers.slice(0, recentBudget);
  const aggBudget = Math.max(minAggReserve, remainingAfterRoots - keptRecent.length);
  const keptAgg = aggEvents.slice(0, aggBudget);

  const finalEvents = [...keptRoots, ...keptRecent, ...keptAgg];
  finalEvents.sort((a, b) => b.dia - a.dia);
  state.eventos = finalEvents;
}

export function emitSimEvent(state: GameState, event: SimEvent): void {
  state.eventosDiaActual.push(event);
  state.eventos.unshift(event);
  if (state.eventos.length > 1500) {
    compactEvents(state);
  }
}

export function addNpcModifier(npc: Npc, mod: Modifier): void {
  const existingIdx = npc.modificadores.findIndex((m) => m.id === mod.id);
  if (existingIdx >= 0) {
    npc.modificadores[existingIdx] = mod;
  } else {
    npc.modificadores.push(mod);
  }
}

export function checkEngineInvariants(
  state: GameState,
  opts?: { checkMoney?: boolean }
): string[] {
  const errors: string[] = [];
  if (opts?.checkMoney ?? true) {
    const actualMoney = computeTotalWorldMoney(state);
    const expectedMoney =
      state.ultimoDineroTotal + state.auditEntradasDia - state.auditSalidasDia;
    if (Math.abs(actualMoney - expectedMoney) > 0.25) {
      errors.push(
        `Dinero total derivó día ${state.reloj.dia}: actual=${actualMoney.toFixed(2)} esperado=${expectedMoney.toFixed(2)}`
      );
    }
  }

  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const casaById = new Map(state.casas.map((c) => [c.id, c]));
  const firmaById = new Map(state.firmas.map((f) => [f.id, f]));

  for (const h of state.hogares) {
    if (h.estado !== 'acogida') {
      const hasAdult = h.miembros.some((id) => {
        const m = npcById.get(id);
        return m && m.vivo && m.edad >= 18;
      });
      if (!hasAdult) {
        errors.push(`Hogar ${h.id} sin adulto vivo`);
      }
    }
  }

  for (const n of state.npcs) {
    if (!n.vivo) continue;
    const h = hogarById.get(n.hogarId);
    if (!h || !h.miembros.includes(n.id)) {
      errors.push(`NPC ${n.id} sin hogar válido (${n.hogarId})`);
    }
    if (n.empleadorId) {
      const f = firmaById.get(n.empleadorId);
      if (!f || !f.activa || !f.empleados.includes(n.id)) {
        errors.push(`NPC ${n.id} tiene empleadorId ${n.empleadorId} pero no figura en nómina`);
      }
    }
  }

  for (const c of state.casas) {
    if (c.hogarId) {
      const h = hogarById.get(c.hogarId);
      if (!h || h.casaId !== c.id || h.estado !== 'con_casa') {
        errors.push(`Casa ${c.id} ocupada inconsistente con hogar ${c.hogarId}`);
      }
    }
  }

  for (const f of state.firmas) {
    if (!f.activa) continue;
    const isState = f.partes.some((p) => p.tipo === 'estado');
    if (!isState && f.partes.length > 0) {
      const sum = f.partes.reduce((s, p) => s + p.pct, 0);
      if (Math.abs(sum - 100) > 0.2) {
        errors.push(`Firma ${f.id} partes suman ${sum.toFixed(2)}`);
      }
    }
  }

  for (const p of state.parcelas) {
    if (p.estado === 'sin_calle' && p.edificio) {
      errors.push(`Parcela sin calle ${p.id} tiene edificio`);
    }
  }

  void casaById;
  return errors;
}

export function getRubroDisplayName(rubro: FirmRubro): string {
  switch (rubro) {
    case 'agro':
      return 'Agroalimentaria';
    case 'industria':
      return 'Industria';
    case 'comercio':
      return 'Comercio';
    case 'gastronomia':
      return 'Gastronomía';
    case 'servicios':
      return 'Servicios';
    case 'entretenimiento':
      return 'Entretenimiento';
    case 'construccion':
      return 'Construcción';
    case 'inmobiliaria':
      return 'Inmobiliaria';
    case 'medio':
      return 'Medio de Prensa';
  }
}
