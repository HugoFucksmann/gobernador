import {
  AGENDA_CONSTANTS,
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  EDUCATION_CONSTANTS,
  HOUSING_CONSTANTS,
  LAND_CONSTANTS,
  LOT_CLASS_MIN_TILES,
  LOT_CLASS_RANK,
  RITMO_CONSTANTS,
  SERVICE_RADIUS_CONSTANTS,
  TERRAIN_CONSTANTS,
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
  Npc,
  NpcAgendaSlot,
  NpcRitmo,
  Parcela,
  ParcelTipo,
  PersonalityTrait,
  RoleId,
  SimEvent,
  TerrenoTile,
  ViaTramo,
  ZoneDefinition,
  ZoneId,
} from '../types/game';
import { computeMaintenanceBreakdown, getActiveBuildings, getBuildingRoleCapacity } from './policies';
import { nextSeqId, normalizeSeed } from './rng';

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

function buildZoneStepMap(
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

export function buildTraversableZoneStepMap(
  state: Pick<GameState, 'zonas' | 'tramos' | 'distanciasZonas'>
): Record<ZoneId, Record<ZoneId, number>> {
  const zonas = state.zonas || {};
  const tramos = state.tramos || [];
  const activeZones = Object.keys(zonas).filter((z) => zonas[z]?.estado !== 'no_urbanizada');
  const activeSet = new Set(activeZones);

  const isTraversableEdge = (a: ZoneId, b: ZoneId): boolean => {
    if (!activeSet.has(a) || !activeSet.has(b)) return false;
    const directTramos = tramos.filter(
      (t) => (t.zonaA === a && t.zonaB === b) || (t.zonaA === b && t.zonaB === a)
    );
    if (directTramos.length > 0) {
      return directTramos.some((t) => t.construida && t.estado > 0);
    }
    if (state.distanciasZonas?.[a] && typeof state.distanciasZonas[a][b] === 'number') {
      return Number.isFinite(state.distanciasZonas[a][b]);
    }
    return true;
  };

  const dist: Record<ZoneId, Record<ZoneId, number>> = {};
  for (const start of activeZones) {
    dist[start] = { [start]: 0 };
    const queue: ZoneId[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = dist[start][cur];
      for (const nb of zonas[cur]?.vecinas ?? []) {
        if (dist[start][nb] === undefined && isTraversableEdge(cur, nb)) {
          dist[start][nb] = d + 1;
          queue.push(nb);
        }
      }
    }
  }
  return dist;
}

function terrainStepRng(seedRef: { s: number }): number {
  const next = (seedRef.s + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  seedRef.s = next;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeNoiseSampler(cols: number, rows: number, seedRef: { s: number }) {
  const grid: number[] = new Array((cols + 1) * (rows + 1));
  for (let i = 0; i < grid.length; i++) {
    grid[i] = terrainStepRng(seedRef);
  }
  const stride = cols + 1;
  return (nx: number, ny: number): number => {
    const gx = clamp(nx, 0, 1) * cols;
    const gy = clamp(ny, 0, 1) * rows;
    const x0 = Math.min(cols - 1, Math.floor(gx));
    const y0 = Math.min(rows - 1, Math.floor(gy));
    const fx = gx - x0;
    const fy = gy - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const v00 = grid[y0 * stride + x0];
    const v10 = grid[y0 * stride + x0 + 1];
    const v01 = grid[(y0 + 1) * stride + x0];
    const v11 = grid[(y0 + 1) * stride + x0 + 1];
    const top = v00 + (v10 - v00) * ux;
    const bot = v01 + (v11 - v01) * ux;
    return top + (bot - top) * uy;
  };
}

interface GeneratedTerrainData {
  terrainRows: TerrenoTile[][];
  alturaRows: number[][];
  sueloUtilPct: number;
  clearingCenter: { nx: number; ny: number };
}

function generateTerrainLayerAttempt(
  ancho: number,
  alto: number,
  seed: number,
  hasRibera: boolean,
  terrainOpts?: { nivelAgua?: number; nRios?: number }
): GeneratedTerrainData & { valid: boolean } {
  const rng = { s: normalizeSeed(seed) };
  const oct1 = makeNoiseSampler(6, 6, rng);
  const oct2 = makeNoiseSampler(14, 14, rng);
  const phaseX = terrainStepRng(rng) * 0.16 - 0.08;
  const phaseY = terrainStepRng(rng) * 0.16 - 0.08;

  const height: number[][] = Array.from({ length: alto }, () => new Array(ancho).fill(0.4));
  const alturaRows: number[][] = Array.from({ length: alto }, () => new Array(ancho).fill(4));
  const terrainRows: TerrenoTile[][] = Array.from({ length: alto }, () => new Array<TerrenoTile>(ancho).fill('.'));

  // 1. 2-octave value noise heightfield with gentle interior livable basin
  for (let ty = 0; ty < alto; ty++) {
    const ny = (ty + 0.5) / alto;
    for (let tx = 0; tx < ancho; tx++) {
      const nx = (tx + 0.5) / ancho;
      const n1 = oct1(nx, ny);
      const n2 = oct2(nx, ny);
      const dx = nx - (0.44 + phaseX);
      const dy = ny - (0.46 + phaseY);
      const radial = Math.hypot(dx, dy);
      // Keep central valley mid-height while edges can become sea/lakes or peaks
      const basinPull = radial < 0.34 ? 0 : (radial - 0.34) * 0.38;
      const rawH = clamp(n1 * 0.65 + n2 * 0.35 + basinPull * (n1 > 0.5 ? 0.85 : -0.85), 0.02, 0.98);
      height[ty][tx] = rawH;
      alturaRows[ty][tx] = Math.min(9, Math.max(0, Math.floor(rawH * 10)));
    }
  }

  // 2. Water below nivelAgua + mountain above umbralMontana
  const nivelAgua = terrainOpts?.nivelAgua ?? TERRAIN_CONSTANTS.nivelAgua;
  for (let ty = 0; ty < alto; ty++) {
    for (let tx = 0; tx < ancho; tx++) {
      const h = height[ty][tx];
      if (h < nivelAgua) {
        terrainRows[ty][tx] = '~';
      } else if (h >= TERRAIN_CONSTANTS.umbralMontana) {
        terrainRows[ty][tx] = '^';
      }
    }
  }

  // 3. Rivers (n_rios high points descending by steepest slope to water or map edge)
  const highCandidates: Array<{ x: number; y: number; h: number }> = [];
  for (let ty = 1; ty < alto - 1; ty++) {
    for (let tx = 1; tx < ancho - 1; tx++) {
      if (height[ty][tx] >= 0.62) {
        highCandidates.push({ x: tx, y: ty, h: height[ty][tx] });
      }
    }
  }
  highCandidates.sort((a, b) => b.h - a.h);

  const carveRiverFrom = (startX: number, startY: number, widthTwo: boolean) => {
    let cx = startX;
    let cy = startY;
    const seen = new Set<string>();
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let steps = 0; steps < ancho + alto; steps++) {
      const key = `${cx},${cy}`;
      if (seen.has(key)) break;
      seen.add(key);
      terrainRows[cy][cx] = '~';
      if (widthTwo && cx + 1 < ancho) terrainRows[cy][cx + 1] = '~';
      if (cx === 0 || cy === 0 || cx === ancho - 1 || cy === alto - 1) break;

      let bestX = -1;
      let bestY = -1;
      let bestScore = height[cy][cx];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= ancho || ny < 0 || ny >= alto) continue;
        if (seen.has(`${nx},${ny}`)) continue;
        const nh = height[ny][nx];
        if (terrainRows[ny][nx] === '~' && steps > 3) {
          bestX = nx;
          bestY = ny;
          bestScore = -1;
          break;
        }
        if (nh < bestScore) {
          bestScore = nh;
          bestX = nx;
          bestY = ny;
        }
      }
      if (bestX < 0) {
        // Nudge toward nearest border if caught in local minimum
        const dLeft = cx;
        const dRight = ancho - 1 - cx;
        const dTop = cy;
        const dBot = alto - 1 - cy;
        const m = Math.min(dLeft, dRight, dTop, dBot);
        if (m === dRight) cx++;
        else if (m === dLeft) cx--;
        else if (m === dBot) cy++;
        else cy--;
      } else {
        cx = bestX;
        cy = bestY;
        if (bestScore < 0) {
          terrainRows[cy][cx] = '~';
          break;
        }
      }
    }
  };

  const usedStarts: Array<{ x: number; y: number }> = [];
  const nRios = terrainOpts?.nRios ?? TERRAIN_CONSTANTS.nRios;
  for (let r = 0; r < nRios; r++) {
    const picked = highCandidates.find((cand) =>
      usedStarts.every((u) => Math.hypot(u.x - cand.x, u.y - cand.y) > ancho * 0.28)
    );
    if (picked) {
      usedStarts.push(picked);
      carveRiverFrom(picked.x, picked.y, r === 0 && ancho >= 48);
    }
  }

  // Ensure ribera natural river barrier between east bank and ribera exists across seeds
  if (hasRibera) {
    const riverX = clamp(Math.round((1214 / WORLD_CANVAS_W) * ancho), 2, ancho - 4);
    const yStart = clamp(Math.round((230 / WORLD_CANVAS_H) * alto), 1, alto - 2);
    const yEnd = clamp(Math.round((780 / WORLD_CANVAS_H) * alto), yStart + 2, alto - 1);
    for (let ty = yStart; ty <= yEnd; ty++) {
      const meander = Math.round(Math.sin(ty * 0.25 + phaseX * 20) * 1);
      const rx = clamp(riverX + meander, 1, ancho - 2);
      terrainRows[ty][rx] = '~';
      if (rx + 1 < ancho) terrainRows[ty][rx + 1] = '~';
    }
  }

  // 4. Monte ('%') for heights between umbralMonte and umbralMontana OR steep slope
  for (let ty = 0; ty < alto; ty++) {
    for (let tx = 0; tx < ancho; tx++) {
      if (terrainRows[ty][tx] !== '.') continue;
      const h = height[ty][tx];
      let maxDiff = 0;
      if (tx > 0) maxDiff = Math.max(maxDiff, Math.abs(h - height[ty][tx - 1]));
      if (tx + 1 < ancho) maxDiff = Math.max(maxDiff, Math.abs(h - height[ty][tx + 1]));
      if (ty > 0) maxDiff = Math.max(maxDiff, Math.abs(h - height[ty - 1][tx]));
      if (ty + 1 < alto) maxDiff = Math.max(maxDiff, Math.abs(h - height[ty + 1][tx]));
      if (h >= TERRAIN_CONSTANTS.umbralMonte || maxDiff >= TERRAIN_CONSTANTS.umbralPendiente) {
        terrainRows[ty][tx] = '%';
      }
    }
  }

  // 5. Compute suelo_util_pct and largest contiguous '.' clearing via BFS
  let sueloCount = 0;
  for (let ty = 0; ty < alto; ty++) {
    for (let tx = 0; tx < ancho; tx++) {
      if (terrainRows[ty][tx] === '.') sueloCount++;
    }
  }
  const sueloUtilPct = sueloCount / Math.max(1, ancho * alto);

  const visited = new Uint8Array(ancho * alto);
  let bestArea = 0;
  let bestSumX = 0;
  let bestSumY = 0;
  const qx = new Int32Array(ancho * alto);
  const qy = new Int32Array(ancho * alto);

  for (let sy = 0; sy < alto; sy++) {
    for (let sx = 0; sx < ancho; sx++) {
      const idx = sy * ancho + sx;
      if (visited[idx] || terrainRows[sy][sx] !== '.') continue;
      let head = 0;
      let tail = 0;
      qx[tail] = sx;
      qy[tail] = sy;
      tail++;
      visited[idx] = 1;
      let sumX = 0;
      let sumY = 0;

      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head++;
        sumX += cx;
        sumY += cy;
        if (cx + 1 < ancho) {
          const ni = cy * ancho + cx + 1;
          if (!visited[ni] && terrainRows[cy][cx + 1] === '.') {
            visited[ni] = 1;
            qx[tail] = cx + 1;
            qy[tail] = cy;
            tail++;
          }
        }
        if (cx > 0) {
          const ni = cy * ancho + cx - 1;
          if (!visited[ni] && terrainRows[cy][cx - 1] === '.') {
            visited[ni] = 1;
            qx[tail] = cx - 1;
            qy[tail] = cy;
            tail++;
          }
        }
        if (cy + 1 < alto) {
          const ni = (cy + 1) * ancho + cx;
          if (!visited[ni] && terrainRows[cy + 1][cx] === '.') {
            visited[ni] = 1;
            qx[tail] = cx;
            qy[tail] = cy + 1;
            tail++;
          }
        }
        if (cy > 0) {
          const ni = (cy - 1) * ancho + cx;
          if (!visited[ni] && terrainRows[cy - 1][cx] === '.') {
            visited[ni] = 1;
            qx[tail] = cx;
            qy[tail] = cy - 1;
            tail++;
          }
        }
      }

      if (tail > bestArea) {
        bestArea = tail;
        bestSumX = sumX;
        bestSumY = sumY;
      }
    }
  }

  const areaMin = ancho * alto * TERRAIN_CONSTANTS.areaMinimaNucleoPct;
  const valid =
    sueloUtilPct >= TERRAIN_CONSTANTS.sueloMinimoPct && bestArea >= areaMin;

  return {
    terrainRows,
    alturaRows,
    sueloUtilPct,
    clearingCenter:
      bestArea > 0
        ? { nx: bestSumX / bestArea / ancho, ny: bestSumY / bestArea / alto }
        : { nx: 0.45, ny: 0.45 },
    valid,
  };
}

function generateValidatedTerrain(
  ancho: number,
  alto: number,
  semilla: number,
  hasRibera: boolean,
  terrainOpts?: { nivelAgua?: number; nRios?: number }
): GeneratedTerrainData {
  const baseSeed = normalizeSeed((semilla ^ 0x517cc1b7) >>> 0);
  let fallback: GeneratedTerrainData | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateTerrainLayerAttempt(
      ancho,
      alto,
      (baseSeed + attempt * 0x9e3779b9) >>> 0,
      hasRibera,
      terrainOpts
    );
    if (!fallback || candidate.sueloUtilPct > fallback.sueloUtilPct) {
      fallback = candidate;
    }
    if (candidate.valid) {
      return candidate;
    }
  }
  return fallback!;
}

function getGridDimensionsForPopulation(
  pop: number,
  semilla = 1,
  hasRibera = true,
  terrainOpts?: { nivelAgua?: number; nRios?: number }
): { ancho: number; alto: number; sueloUtilPct: number } {
  const probe = generateValidatedTerrain(48, 48, semilla, hasRibera, terrainOpts);
  const lado = clamp(
    Math.round(
      Math.sqrt(
        (Math.max(50, pop) * TERRAIN_CONSTANTS.baldosasPorPersona) /
          Math.max(0.35, probe.sueloUtilPct)
      )
    ),
    TERRAIN_CONSTANTS.ladoMin,
    TERRAIN_CONSTANTS.ladoMax
  );
  return { ancho: lado, alto: lado, sueloUtilPct: probe.sueloUtilPct };
}

export function getTerrainBuildCostInfo(
  grid: MapaV2Grid | undefined,
  tiles: Array<[number, number]>,
  isBridge = false
): {
  buildable: boolean;
  multiplier: number;
  bridgeExtraCost: number;
  waterTiles: number;
  monteTiles: number;
  steepTiles: number;
  mountainTiles: number;
} {
  if (!grid || tiles.length === 0) {
    return {
      buildable: true,
      multiplier: 1,
      bridgeExtraCost: 0,
      waterTiles: 0,
      monteTiles: 0,
      steepTiles: 0,
      mountainTiles: 0,
    };
  }
  let waterTiles = 0;
  let monteTiles = 0;
  let steepTiles = 0;
  let mountainTiles = 0;

  for (const [rawX, rawY] of tiles) {
    const tx = clamp(Math.round(rawX), 0, grid.ancho - 1);
    const ty = clamp(Math.round(rawY), 0, grid.alto - 1);
    const ch = (grid.terreno[ty]?.[tx] ?? '.') as TerrenoTile;
    if (ch === '^') mountainTiles++;
    else if (ch === '~') waterTiles++;
    else if (ch === '%') monteTiles++;

    if (grid.altura && grid.altura[ty]) {
      const h0 = Number(grid.altura[ty][tx] ?? '4');
      let maxDiff = 0;
      const neighbors: Array<[number, number]> = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < grid.ancho && ny >= 0 && ny < grid.alto && grid.altura[ny]) {
          const hn = Number(grid.altura[ny][nx] ?? '4');
          maxDiff = Math.max(maxDiff, Math.abs(h0 - hn) / 9);
        }
      }
      if (maxDiff >= TERRAIN_CONSTANTS.umbralPendiente) steepTiles++;
    }
  }

  const buildable = mountainTiles === 0 && (isBridge || waterTiles === 0);
  let multiplier = 1;
  if (monteTiles > 0) multiplier *= TERRAIN_CONSTANTS.factorMonte;
  if (steepTiles > 0) multiplier *= TERRAIN_CONSTANTS.factorPendiente;
  const bridgeExtraCost = isBridge ? waterTiles * TERRAIN_CONSTANTS.costoPuentePorBaldosa : 0;

  return {
    buildable,
    multiplier: Number(multiplier.toFixed(3)),
    bridgeExtraCost: Number(bridgeExtraCost.toFixed(1)),
    waterTiles,
    monteTiles,
    steepTiles,
    mountainTiles,
  };
}

export function getParcelTerrainTiles(state: Pick<GameState, 'mapaGrid'>, parcela: Parcela): Array<[number, number]> {
  const grid = state.mapaGrid;
  const ancho = grid?.ancho ?? 48;
  const alto = grid?.alto ?? 48;
  const x0 = clamp(parcela.x ?? Math.round((parcela.wx / WORLD_CANVAS_W) * ancho), 0, ancho - 1);
  const y0 = clamp(parcela.y ?? Math.round((parcela.wy / WORLD_CANVAS_H) * alto), 0, alto - 1);
  const w = Math.max(1, parcela.w ?? 2);
  const h = Math.max(1, parcela.h ?? 2);
  const tiles: Array<[number, number]> = [];
  for (let dy = 0; dy < Math.min(4, h); dy++) {
    for (let dx = 0; dx < Math.min(4, w); dx++) {
      tiles.push([clamp(x0 + dx, 0, ancho - 1), clamp(y0 + dy, 0, alto - 1)]);
    }
  }
  return tiles;
}

export function getViaTerrainTiles(
  state: Pick<GameState, 'mapaGrid' | 'zonas'>,
  tramo: ViaTramo
): Array<[number, number]> {
  if (tramo.baldosas && tramo.baldosas.length > 0) {
    return tramo.baldosas;
  }
  const grid = state.mapaGrid;
  const ancho = grid?.ancho ?? 48;
  const alto = grid?.alto ?? 48;
  const rectA = state.zonas[tramo.zonaA]?.rect;
  const rectB = tramo.zonaB ? state.zonas[tramo.zonaB]?.rect : undefined;
  if (!rectA && !rectB) return [];
  const ax = rectA ? rectA.wx + rectA.ww / 2 : (rectB!.wx + rectB!.ww / 2);
  const ay = rectA ? rectA.wy + rectA.wh / 2 : (rectB!.wy + rectB!.wh / 2);
  const bx = rectB ? rectB.wx + rectB.ww / 2 : ax;
  const by = rectB ? rectB.wy + rectB.wh / 2 : ay;
  const tiles: Array<[number, number]> = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wx = ax + (bx - ax) * t;
    const wy = ay + (by - ay) * t;
    const tx = clamp(Math.round((wx / WORLD_CANVAS_W) * (ancho - 1)), 0, ancho - 1);
    const ty = clamp(Math.round((wy / WORLD_CANVAS_H) * (alto - 1)), 0, alto - 1);
    if (!tiles.some(([x, y]) => x === tx && y === ty)) {
      tiles.push([tx, ty]);
    }
  }
  return tiles;
}

export function getParcelLandPrice(
  state: GameState,
  parcela: Parcela
): { precioLote: number; accesibilidad: number } {
  const lotClass = inferLotClassFromParcel(parcela);
  const base = LAND_CONSTANTS.precioBaseLote[lotClass] ?? LAND_CONSTANTS.precioBaseLote.M;
  const centroParcel = state.parcelas.find((p) => p.zona === 'centro' && p.estado !== 'sin_calle');
  let dist = getZoneTravelCost(state, parcela.zona, 'centro');
  if (centroParcel && parcela.estado !== 'sin_calle') {
    const lotDist = getLotTravelCost(state, parcela, centroParcel);
    if (Number.isFinite(lotDist)) dist = lotDist;
  }
  const accesibilidad = Number.isFinite(dist) ? clamp(1 - dist / 42, 0, 1) : 0;
  const precioLote = Number((base * (1 + LAND_CONSTANTS.kAcceso * accesibilidad)).toFixed(2));
  return { precioLote, accesibilidad: Number(accesibilidad.toFixed(3)) };
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

function syncMapaGridVias(
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
  targetPop: number,
  semilla = 1,
  terrainOpts?: { nivelAgua?: number; nRios?: number }
): MapaV2Grid {
  const hasRibera = Boolean(zonas.ribera);
  const { ancho, alto } = getGridDimensionsForPopulation(targetPop, semilla, hasRibera, terrainOpts);
  const zoneIds = Object.keys(zonas);

  const generated = generateValidatedTerrain(ancho, alto, semilla, hasRibera, terrainOpts);
  const terrainRows = generated.terrainRows;
  const alturaRows = generated.alturaRows;
  const zoneRows: string[][] = Array.from({ length: alto }, () => Array(ancho).fill(' '));

  // Map each tile center to nearest zone rect (solid coverage, no gaps)
  for (let ty = 0; ty < alto; ty++) {
    const wy = ((ty + 0.5) / alto) * WORLD_CANVAS_H;
    for (let tx = 0; tx < ancho; tx++) {
      const wx = ((tx + 0.5) / ancho) * WORLD_CANVAS_W;
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

  // Derive zone adjacency strictly from orthographic 4-neighbor tile contiguity (+ tramos)
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

  // Populate tramo.baldosas from tramo.puntos and clear non-bridge roads over water/mountain
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
          if (t.construida && t.tipo !== 'puente' && terrainRows[by][bx] !== '.') {
            terrainRows[by][bx] = '.';
          }
          if (!t.construida && t.tipo !== 'puente' && (terrainRows[by][bx] === '~' || terrainRows[by][bx] === '^')) {
            terrainRows[by][bx] = '%';
          }
        }
      }
    }
    t.baldosas = baldosas;
  }

  // Ensure every parcel has tile coordinates (x, y, w, h), clase, and frente;
  // Clear mountain/water under buildable/starting parcels while preserving '%' (monte) on non-occupied expansion plots
  let finalSuelo = 0;
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

    for (let dy = 0; dy < Math.min(3, p.h); dy++) {
      for (let dx = 0; dx < Math.min(3, p.w); dx++) {
        const tx = clamp(p.x + dx, 0, ancho - 1);
        const ty = clamp(p.y + dy, 0, alto - 1);
        if (p.estado === 'ocupada' || p.estado === 'en_obra') {
          terrainRows[ty][tx] = '.';
        } else if (terrainRows[ty][tx] === '~' || terrainRows[ty][tx] === '^') {
          terrainRows[ty][tx] = p.estado === 'libre' ? '.' : '%';
        }
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

  for (let ty = 0; ty < alto; ty++) {
    for (let tx = 0; tx < ancho; tx++) {
      if (terrainRows[ty][tx] === '.') finalSuelo++;
    }
  }
  const sueloUtilPct = Number((finalSuelo / Math.max(1, ancho * alto)).toFixed(3));

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
    altura: alturaRows.map((r) => r.join('')),
    vias: Array.from({ length: alto }, () => '.'.repeat(ancho)),
    zonas: zoneRows.map((r) => r.join('')),
    sueloUtilPct,
    zonas_info,
  };
  syncMapaGridVias(grid, tramos);
  return grid;
}

function getViaTramoCost(tramo: ViaTramo): number {
  if (!tramo.construida || tramo.estado <= 0) return Infinity;
  return tramo.longitud * (1 + VIAL_CONSTANTS.kVial * (1 - clamp(tramo.estado, 0, 100) / 100));
}

function getBuiltNetworkNodes(state: Pick<GameState, 'zonas' | 'tramos'>): Set<string> {
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
  if (parcela.estado === 'sin_calle') return true;
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

function hashNpcSeed(semilla: number, npcId: string, salt = 0): number {
  let h = (normalizeSeed(semilla) ^ (salt * 0x9e3779b9)) >>> 0;
  for (let i = 0; i < npcId.length; i++) {
    h = Math.imul(h ^ npcId.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hashFloat(seed: number): number {
  const step = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(step ^ (step >>> 15), 1 | step);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function getShiftScheduleForNpc(
  npc: Pick<Npc, 'rol' | 'ritmo'>,
  firmRubro?: FirmRubro
): { startH: number; endH: number } {
  const turno = npc.ritmo?.turno ?? 0;
  if (npc.rol === 'estudiante' || npc.rol === 'docente') {
    return { startH: 8, endH: 13 };
  }
  if (npc.rol === 'policia') {
    return turno % 3 === 1 ? { startH: 8, endH: 16 } : turno % 3 === 2 ? { startH: 16, endH: 24 } : { startH: 0, endH: 8 };
  }
  if (npc.rol === 'medico') {
    return turno % 3 === 1 ? { startH: 8, endH: 16 } : turno % 3 === 2 ? { startH: 16, endH: 24 } : { startH: 0, endH: 8 };
  }
  if (npc.rol === 'estatal' || npc.rol === 'ingeniero') {
    return { startH: 9, endH: 17 };
  }
  switch (firmRubro) {
    case 'agro':
      return { startH: 6, endH: 15 };
    case 'industria':
      return turno % 2 === 1 ? { startH: 14, endH: 22 } : { startH: 6, endH: 14 };
    case 'comercio':
      return turno % 2 === 1 ? { startH: 14.5, endH: 20 } : { startH: 9, endH: 14.5 };
    case 'gastronomia':
      return turno % 2 === 1 ? { startH: 17.5, endH: 24 } : { startH: 11, endH: 17.5 };
    case 'servicios':
      return turno % 2 === 1 ? { startH: 14, endH: 19 } : { startH: 9, endH: 14 };
    case 'entretenimiento':
      return { startH: 16, endH: 26 };
    default:
      return { startH: 9, endH: 17 };
  }
}

export function buildSeededNpcRitmo(
  npcId: string,
  edad: number,
  semilla: number,
  habitPoolIds: string[] = []
): NpcRitmo {
  const baseH = hashNpcSeed(semilla, npcId, 11);
  const r1 = hashFloat(baseH);
  const r2 = hashFloat(baseH + 1);
  const r3 = hashFloat(baseH + 2);
  const r4 = hashFloat(baseH + 3);
  const r5 = hashFloat(baseH + 4);

  // Cronotipo: -2 a +2h (younger later, older earlier)
  const ageShift = edad < 30 ? 0.65 : edad >= 55 ? -0.65 : 0;
  const rawCrono = (r1 * 4 - 2) + ageShift;
  const cronotipo = Number(clamp(Math.round(rawCrono * 2) / 2, RITMO_CONSTANTS.cronotipoMin, RITMO_CONSTANTS.cronotipoMax).toFixed(1));

  // Gustos across 4 spend categories summing to 100
  const wB = 20 + r2 * 40;
  const wG = 15 + r3 * 35;
  const wS = 12 + r4 * 30;
  const wE = 10 + r5 * 35;
  const sumW = wB + wG + wS + wE;
  const bienes = Math.round((wB / sumW) * 100);
  const gastronomia = Math.round((wG / sumW) * 100);
  const servicios = Math.round((wS / sumW) * 100);
  const entretenimiento = Math.max(5, 100 - bienes - gastronomia - servicios);

  const turno = Math.floor(hashFloat(baseH + 5) * 3);
  const d1 = Math.floor(hashFloat(baseH + 6) * 7);
  const hasTwoRestDays = hashFloat(baseH + 7) < 0.65;
  const d2 = (d1 + 1 + Math.floor(hashFloat(baseH + 8) * 5)) % 7;
  const diasDescanso = hasTwoRestDays ? [d1, d2] : [d1];

  const habitos: string[] = [];
  if (habitPoolIds.length > 0) {
    const targetHabits = Math.min(3, habitPoolIds.length);
    const startIdx = Math.floor(hashFloat(baseH + 9) * habitPoolIds.length);
    for (let k = 0; k < targetHabits; k++) {
      const pid = habitPoolIds[(startIdx + k * 3) % habitPoolIds.length];
      if (pid && !habitos.includes(pid)) habitos.push(pid);
    }
  }

  return {
    cronotipo,
    gustos: { bienes, gastronomia, servicios, entretenimiento },
    habitos,
    turno,
    diasDescanso,
  };
}

export function updateDailyNpcRitmoAndHabits(state: GameState): void {
  const dia = state.reloj.dia;
  const weekDay = dia % 7;
  const activeLeisureAndShopParcels = state.parcelas.filter(
    (p) =>
      p.edificio?.activo &&
      (p.edificio.tipo === 'almacen' ||
        p.edificio.tipo === 'supermercado' ||
        p.edificio.tipo === 'tienda' ||
        p.edificio.tipo === 'kiosco' ||
        p.edificio.tipo === 'restoran' ||
        p.edificio.tipo === 'bar_cafe' ||
        p.edificio.tipo === 'cine_teatro' ||
        p.edificio.tipo === 'club' ||
        p.edificio.tipo === 'gimnasio' ||
        p.edificio.tipo === 'peluqueria' ||
        p.edificio.tipo === 'taller')
  );
  const activeParcelMap = new Map(activeLeisureAndShopParcels.map((p) => [p.id, p]));
  const leisureCandidates = activeLeisureAndShopParcels.filter(
    (p) =>
      p.edificio?.tipo === 'cine_teatro' ||
      p.edificio?.tipo === 'club' ||
      p.edificio?.tipo === 'bar_cafe' ||
      p.edificio?.tipo === 'restoran' ||
      p.edificio?.tipo === 'gimnasio'
  );
  const shopCandidates = activeLeisureAndShopParcels.filter(
    (p) =>
      p.edificio?.tipo === 'almacen' ||
      p.edificio?.tipo === 'supermercado' ||
      p.edificio?.tipo === 'tienda' ||
      p.edificio?.tipo === 'kiosco'
  );
  const firmaById = new Map(state.firmas.map((f) => [f.id, f]));

  for (const n of state.npcs) {
    if (!n.vivo) continue;
    if (!n.ritmo) {
      n.ritmo = buildSeededNpcRitmo(
        n.id,
        n.edad,
        state.semilla,
        activeLeisureAndShopParcels.map((p) => p.id)
      );
    }
    // Forget closed habit parcels
    n.ritmo.habitos = (n.ritmo.habitos ?? []).filter((pid) => activeParcelMap.has(pid));
    if (n.ritmo.habitos.length < 2 && activeLeisureAndShopParcels.length > 0) {
      const hSeed = hashNpcSeed(state.semilla, n.id, dia + 17);
      const pick = activeLeisureAndShopParcels[Math.floor(hashFloat(hSeed) * activeLeisureAndShopParcels.length)];
      if (pick && !n.ritmo.habitos.includes(pick.id)) n.ritmo.habitos.push(pick.id);
    }

    const rSeed = hashNpcSeed(state.semilla, n.id, dia * 31 + 7);
    const rAbs = hashFloat(rSeed);
    const rAct = hashFloat(rSeed + 1);
    const rHab = hashFloat(rSeed + 2);
    const rPick = hashFloat(rSeed + 3);

    const isRestDay = (n.ritmo.diasDescanso ?? []).includes(weekDay);
    const hasJob =
      n.edad >= 18 &&
      n.edad < 65 &&
      n.rol !== 'desempleado' &&
      n.rol !== 'estudiante' &&
      !n.hospital.internado &&
      !n.capacitacion;

    if (hasJob && !isRestDay) {
      const rebelTerm = (getEffectiveTrait(n, 'rebeldia') / 100) * 0.08;
      const healthTerm = Math.max(0, 75 - n.variables.salud) * 0.0018;
      const satTerm = Math.max(0, 55 - n.variables.satisfaccion) * 0.0014;
      const probFalta = clamp(RITMO_CONSTANTS.faltazgoBaseProb + rebelTerm + healthTerm + satTerm, 0, 0.25);
      n.ritmo.faltandoHoy = rAbs < probFalta;
    } else {
      n.ritmo.faltandoHoy = false;
    }

    // Arrival delay from commute & low laboriosidad
    let commuteCost: number = VIAL_CONSTANTS.costoInternoZona;
    if (n.empleadorId) {
      const firma = firmaById.get(n.empleadorId);
      if (firma) commuteCost = getZoneTravelCost(state, n.zona, firma.zona);
    }
    const travelHours = Number.isFinite(commuteCost)
      ? commuteCost / Math.max(1, AGENDA_CONSTANTS.baldosasPorHora)
      : 1.5;
    const lazyDelay = ((100 - getEffectiveTrait(n, 'laboriosidad')) / 100) * 0.6;
    n.ritmo.llegadaRetrasoHoras = Number((travelHours + lazyDelay).toFixed(2));

    // Free-time choice via utility = necessity * personality
    const soc = getEffectiveTrait(n, 'sociabilidad');
    const cod = getEffectiveTrait(n, 'codicia');
    const val = getEffectiveTrait(n, 'valentia');
    const propGasto = getEffectivePropensionGasto(n);
    const gustos = n.ritmo.gustos;

    const uCasa =
      28 +
      Math.max(0, 72 - n.variables.salud) * 0.9 +
      (n.variables.hambre > 55 ? 16 : 0) +
      (100 - soc) * 0.22;
    const uOcio =
      18 +
      soc * 0.36 +
      val * 0.14 +
      Math.max(0, 62 - n.variables.satisfaccion) * 0.55 +
      ((gustos.entretenimiento + gustos.gastronomia) * 0.25) -
      (n.variables.salud < 45 ? 18 : 0);
    const uCompras =
      16 +
      propGasto * 0.3 +
      (100 - cod) * 0.16 +
      (n.variables.hambre > 45 ? 18 : 0) +
      ((gustos.bienes + gustos.servicios) * 0.22);
    const uVisita = 12 + soc * 0.34 + (n.padresIds.length > 0 || n.parejaId ? 10 : 0);
    const uPasear = 14 + (100 - n.variables.miedo) * 0.14 + (isRestDay ? 10 : 0);

    const totalU = uCasa + uOcio + uCompras + uVisita + uPasear;
    let cursor = rAct * totalU;
    let act: NonNullable<NpcRitmo['libreHoyActividad']> = 'casa';
    if ((cursor -= uCasa) <= 0) act = 'casa';
    else if ((cursor -= uOcio) <= 0) act = 'ocio';
    else if ((cursor -= uCompras) <= 0) act = 'compras';
    else if ((cursor -= uVisita) <= 0) act = 'visita';
    else act = 'pasear';
    n.ritmo.libreHoyActividad = act;

    // Habit vs exploration selection
    let chosenParcel: Parcela | undefined;
    const pool = act === 'ocio' ? leisureCandidates : act === 'compras' ? shopCandidates : [];
    if (pool.length > 0) {
      const habitMatches = n.ritmo.habitos
        .map((pid) => activeParcelMap.get(pid))
        .filter((p): p is Parcela => Boolean(p && pool.some((c) => c.id === p.id)));
      if (habitMatches.length > 0 && rHab < RITMO_CONSTANTS.pHabito) {
        chosenParcel = habitMatches[Math.floor(rPick * habitMatches.length)];
      } else {
        // Explore weighted by gustos & closeness
        let bestScore = -1;
        for (const cand of pool) {
          const bDef = cand.edificio ? BUILDING_CATALOG[cand.edificio.tipo] : undefined;
          const catWeight = bDef?.categoriaGasto ? (gustos[bDef.categoriaGasto] ?? 20) : 20;
          const dist = getZoneTravelCost(state, n.zona, cand.zona);
          const distPenalty = Number.isFinite(dist) ? dist : 45;
          const noise = hashFloat(rSeed + cand.orden) * 28;
          const score = catWeight * 0.9 - distPenalty * 0.55 + noise;
          if (score > bestScore) {
            bestScore = score;
            chosenParcel = cand;
          }
        }
        if (chosenParcel && !n.ritmo.habitos.includes(chosenParcel.id)) {
          if (n.ritmo.habitos.length >= 3) n.ritmo.habitos.shift();
          n.ritmo.habitos.push(chosenParcel.id);
        }
      }
    }
    n.ritmo.libreHoyParcelaId = chosenParcel?.id;
  }
}

export function getNpcDailyAgenda(
  state: Pick<GameState, 'hogares' | 'casas' | 'parcelas' | 'firmas' | 'zonas' | 'reloj'>,
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

  const dia = state.reloj?.dia ?? 1;
  const isRestDay = (npc.ritmo?.diasDescanso ?? []).includes(dia % 7);
  const crono = npc.ritmo?.cronotipo ?? 0;

  let workParcel: Parcela | undefined;
  let workLabel = 'Trabajando';
  let firmRubro: FirmRubro | undefined;
  if (npc.hospital.internado) {
    workParcel = state.parcelas.find((p) => p.edificio?.id === npc.hospital.edificioId) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'hospital' && p.edificio.activo);
    workLabel = 'Internado en hospital';
  } else if (npc.capacitacion) {
    workParcel =
      state.parcelas.find((p) => p.zona === homeZone && (p.edificio?.tipo === 'universidad' || p.edificio?.tipo === 'escuela') && p.edificio.activo) ??
      state.parcelas.find((p) => (p.edificio?.tipo === 'universidad' || p.edificio?.tipo === 'escuela') && p.edificio.activo);
    workLabel = `Capacitándose (${npc.capacitacion.rolObjetivo})`;
  } else if (npc.accionIa?.zonaDestino || npc.accionIa?.fueraDePuesto) {
    workParcel =
      state.parcelas.find((p) => p.zona === (npc.accionIa?.zonaDestino ?? homeZone) && p.edificio?.tipo === 'plaza') ??
      state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
    workLabel = npc.accionIa.nombre;
  } else if (npc.empleadorId) {
    const firma = ctx?.firmaById
      ? ctx.firmaById.get(npc.empleadorId)
      : state.firmas.find((f) => f.id === npc.empleadorId);
    firmRubro = firma?.rubro;
    const localId = firma?.locales?.[0];
    if (localId) {
      workParcel = ctx?.parcelaById
        ? ctx.parcelaById.get(localId)
        : state.parcelas.find((p) => p.id === localId);
    }
    workLabel = npc.ritmo?.faltandoHoy
      ? 'Ausente del turno'
      : isRestDay
      ? 'Día de descanso'
      : firma
      ? `Turno en ${firma.nombre}`
      : 'En jornada laboral';
  } else if (npc.rol === 'estudiante') {
    const eduType = npc.edad >= 18 ? 'universidad' : 'escuela';
    workParcel =
      state.parcelas.find((p) => p.zona === homeZone && p.edificio?.tipo === eduType && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === eduType && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'escuela' && p.edificio.activo);
    workLabel = workParcel
      ? eduType === 'universidad'
        ? 'Cursando en universidad'
        : 'Asistiendo a la escuela'
      : 'Estudio en casa';
  } else if (npc.rol === 'policia') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && p.edificio?.tipo === 'comisaria' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'comisaria' && p.edificio.activo);
    workLabel = isRestDay ? 'Franco policial' : 'Patrulla y guardia';
  } else if (npc.rol === 'medico') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && p.edificio?.tipo === 'hospital' && p.edificio.activo) ??
      state.parcelas.find((p) => p.edificio?.tipo === 'hospital' && p.edificio.activo);
    workLabel = isRestDay ? 'Descanso médico' : 'Guardia médica';
  } else if (npc.rol === 'estatal' || npc.rol === 'ingeniero') {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'oficina_publica' && p.edificio.activo);
    workLabel = isRestDay ? 'Día libre' : npc.rol === 'ingeniero' ? 'Supervisión de obras' : 'Gestión pública';
  } else if (npc.rol === 'docente') {
    workParcel =
      state.parcelas.find((p) => p.zona === npc.zona && (p.edificio?.tipo === 'escuela' || p.edificio?.tipo === 'universidad') && p.edificio.activo) ??
      state.parcelas.find((p) => (p.edificio?.tipo === 'escuela' || p.edificio?.tipo === 'universidad') && p.edificio.activo);
    workLabel = isRestDay ? 'Día libre' : 'Dictando clases';
  } else if (npc.rol === 'jubilado') {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
    workLabel = 'Paseo por la plaza';
  } else {
    workParcel = state.parcelas.find((p) => p.edificio?.tipo === 'plaza');
    workLabel = 'Buscando empleo / trámites';
  }

  const sched = getShiftScheduleForNpc(npc, firmRubro);
  const worksMorning =
    !npc.hospital.internado &&
    !isRestDay &&
    !npc.ritmo?.faltandoHoy &&
    !(npc.accionIa?.fueraDePuesto) &&
    npc.rol !== 'jubilado' &&
    npc.rol !== 'desempleado' &&
    (sched.startH + crono < 13);
  const worksAfternoon =
    !npc.hospital.internado &&
    !isRestDay &&
    !npc.ritmo?.faltandoHoy &&
    !(npc.accionIa?.fueraDePuesto) &&
    npc.rol !== 'jubilado' &&
    npc.rol !== 'desempleado' &&
    (sched.endH + crono >= 14);
  const worksEvening =
    !npc.hospital.internado &&
    !isRestDay &&
    !npc.ritmo?.faltandoHoy &&
    (sched.endH + crono >= 20 || (npc.rol === 'policia' && (npc.ritmo?.turno ?? 0) % 3 === 2));

  const workZone = workParcel?.zona ?? npc.zona;
  const workRect = state.zonas[workZone]?.rect;
  const workWx = workParcel ? workParcel.wx + workParcel.ww / 2 : workRect ? workRect.wx + workRect.ww * 0.5 : homeWx;
  const workWy = workParcel ? workParcel.wy + workParcel.wh / 2 : workRect ? workRect.wy + workRect.wh * 0.5 : homeWy;

  // Shopping / food parcel in home or work zone
  const habitParcel = npc.ritmo?.libreHoyParcelaId
    ? ctx?.parcelaById
      ? ctx.parcelaById.get(npc.ritmo.libreHoyParcelaId)
      : state.parcelas.find((p) => p.id === npc.ritmo.libreHoyParcelaId)
    : undefined;

  const shopParcel =
    habitParcel ??
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

  const libreAct = npc.ritmo?.libreHoyActividad ?? 'casa';
  const leisureParcel =
    habitParcel ??
    (libreAct === 'ocio' || libreAct === 'compras'
      ? state.parcelas.find(
          (p) =>
            p.edificio?.activo &&
            (p.edificio.tipo === 'bar_cafe' ||
              p.edificio.tipo === 'cine_teatro' ||
              p.edificio.tipo === 'club' ||
              p.edificio.tipo === 'gimnasio' ||
              p.edificio.tipo === 'plaza')
        )
      : libreAct === 'pasear'
      ? state.parcelas.find((p) => p.edificio?.tipo === 'plaza')
      : homeParcel);

  const isHospitalized = npc.hospital.internado;
  const morningParcel = isHospitalized ? workParcel : worksMorning ? workParcel : libreAct === 'compras' ? shopParcel : homeParcel;
  const morningZone = morningParcel?.zona ?? (worksMorning ? workZone : homeZone);
  const morningWx = morningParcel ? morningParcel.wx + morningParcel.ww / 2 : worksMorning ? workWx : homeWx;
  const morningWy = morningParcel ? morningParcel.wy + morningParcel.wh / 2 : worksMorning ? workWy : homeWy;

  const afternoonUsesWork = !isHospitalized && worksAfternoon;
  const tardeParcel = isHospitalized ? workParcel : afternoonUsesWork ? workParcel : leisureParcel;
  const tardeZone = tardeParcel?.zona ?? (afternoonUsesWork ? workZone : homeZone);
  const tardeWx = tardeParcel ? tardeParcel.wx + tardeParcel.ww / 2 : afternoonUsesWork ? workWx : homeWx;
  const tardeWy = tardeParcel ? tardeParcel.wy + tardeParcel.wh / 2 : afternoonUsesWork ? workWy : homeWy;
  const tardeActividad = isHospitalized
    ? 'Internado en hospital'
    : afternoonUsesWork
    ? workLabel
    : libreAct === 'ocio' && tardeParcel
    ? `Ocio en ${tardeParcel.nombre}`
    : libreAct === 'compras' && tardeParcel
    ? `Compras en ${tardeParcel.nombre}`
    : libreAct === 'visita'
    ? 'Visita familiar'
    : libreAct === 'pasear'
    ? 'Paseo por el barrio'
    : 'Tiempo libre en casa';

  const eveningAtLeisure =
    !isHospitalized &&
    !worksEvening &&
    libreAct === 'ocio' &&
    getEffectiveTrait(npc, 'valentia') >= 45 &&
    Boolean(leisureParcel);
  const eveningParcel = isHospitalized
    ? workParcel
    : worksEvening
    ? workParcel
    : eveningAtLeisure
    ? leisureParcel
    : homeParcel;
  const eveningZone = eveningParcel?.zona ?? (worksEvening ? workZone : homeZone);
  const eveningWx = eveningParcel ? eveningParcel.wx + eveningParcel.ww / 2 : worksEvening ? workWx : homeWx;
  const eveningWy = eveningParcel ? eveningParcel.wy + eveningParcel.wh / 2 : worksEvening ? workWy : homeWy;

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
      actividad: isHospitalized ? 'Internado en hospital' : worksMorning ? workLabel : isRestDay ? 'Mañana libre en casa' : workLabel,
      destinoTipo: isHospitalized ? 'hospital' : worksMorning && workParcel ? 'trabajo' : homeParcel ? 'casa' : 'zona',
      zona: morningZone,
      parcelaId: morningParcel?.id,
      wx: morningWx,
      wy: morningWy,
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
      destinoTipo: isHospitalized ? 'hospital' : afternoonUsesWork ? 'trabajo' : tardeParcel ? 'parcela' : 'casa',
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
        : worksEvening
        ? workLabel
        : eveningAtLeisure && eveningParcel
        ? `Salida nocturna (${eveningParcel.nombre})`
        : homeParcel
        ? 'Regreso al hogar'
        : 'Regreso a su zona',
      destinoTipo: isHospitalized
        ? 'hospital'
        : worksEvening
        ? 'trabajo'
        : eveningAtLeisure
        ? 'parcela'
        : homeParcel
        ? 'casa'
        : 'zona',
      zona: eveningZone,
      parcelaId: eveningParcel?.id,
      wx: eveningWx,
      wy: eveningWy,
    },
  ];
}

function getCommuteProductivityFactor(
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

function getFirmaLocales(state: GameState, firma: Firma): Parcela[] {
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

function getHouseEffectiveCapacity(casa: Casa): number {
  const stateFactor = clamp(casa.estado / 100, 0.4, 1);
  return Math.max(1, Math.round(casa.capacidad * stateFactor));
}

function isHogarHacinado(hogar: Hogar, casa: Casa | undefined): boolean {
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
  zonas?: GameState['zonas'],
  distanciasZonas?: GameState['distanciasZonas']
): HospitalFacilityInfo[] {
  const active = getActiveBuildings(parcelas).filter(
    (b) => b.tipo === 'hospital' || b.tipo === 'hospital_campana'
  );
  if (active.length === 0) return [];

  const vivos = npcs.filter((n) => n.vivo);
  const activeMedicos = vivos.filter(
    (n) => n.rol === 'medico' && !n.hospital.internado && !n.accionIa?.fueraDePuesto && !n.capacitacion
  );

  const permHosp = active.filter((b) => b.tipo === 'hospital');
  const assignedByHospId = new Map<string, number>();
  for (const h of permHosp) assignedByHospId.set(h.id, 0);

  if (permHosp.length > 0) {
    const zoneSteps = zonas ? buildZoneStepMap(zonas) : null;
    for (const m of activeMedicos) {
      let bestHosp: BuildingInstance | undefined;
      let bestCost = Infinity;
      for (const h of permHosp) {
        let cost = h.zona === m.zona ? VIAL_CONSTANTS.costoInternoZona : Infinity;
        if (h.zona !== m.zona) {
          const roadCost = distanciasZonas?.[m.zona]?.[h.zona];
          if (typeof roadCost === 'number') {
            cost = roadCost;
          } else if (zoneSteps) {
            const st = zoneSteps[m.zona]?.[h.zona];
            if (typeof st === 'number') cost = st * 10 + VIAL_CONSTANTS.costoInternoZona;
          }
        }
        if (!Number.isFinite(cost)) continue;
        // Tie-break toward hospitals with fewer assigned doctors so doctors distribute evenly
        const loadBias = (assignedByHospId.get(h.id) ?? 0) * 0.25;
        if (cost + loadBias < bestCost) {
          bestCost = cost + loadBias;
          bestHosp = h;
        }
      }
      if (bestHosp) {
        assignedByHospId.set(bestHosp.id, (assignedByHospId.get(bestHosp.id) ?? 0) + 1);
      }
    }
  }

  const parcelNameById = new Map<string, string>();
  for (const p of parcelas) parcelNameById.set(p.id, p.nombre);

  const facilities: HospitalFacilityInfo[] = active.map((b) => {
    const def = BUILDING_CATALOG[b.tipo];
    const camasFisicas = def.camasHospital ?? 0;
    let medicosAsignados = 0;
    let camasEfectivas = camasFisicas;

    if (b.tipo === 'hospital') {
      medicosAsignados = assignedByHospId.get(b.id) ?? 0;
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

export function getNpcProductivity(
  npc: Npc,
  state: GameState,
  ctx?: { hogarById?: Map<string, Hogar>; firmaById?: Map<string, Firma> }
): number {
  if (!npc.vivo || npc.hospital.internado || npc.accionIa?.fueraDePuesto || npc.capacitacion) return 0;
  const hogar = ctx?.hogarById
    ? ctx.hogarById.get(npc.hogarId)
    : state.hogares.find((h) => h.id === npc.hogarId);
  const isActuallyStreet = hogar?.estado === 'calle' && !hogar?.ocupandoCasaId;
  const streetFactor = isActuallyStreet ? HOUSING_CONSTANTS.calleProdFactor : 1;
  const commuteFactor = getCommuteProductivityFactor(state, npc, ctx?.firmaById);
  const faltazgoFactor = npc.ritmo?.faltandoHoy ? RITMO_CONSTANTS.faltazgoPenaltyFactor : 1;
  const modProd = getModifierDelta(npc, 'productividad');
  const base = clamp(
    (45 + npc.variables.salud * 0.4 + npc.personalidad.laboriosidad * 0.15 - npc.variables.hambre * 0.35) *
      streetFactor *
      commuteFactor *
      faltazgoFactor +
      modProd,
    15,
    125
  );
  return Number(base.toFixed(1));
}

export function computeZoneServiceCoverage(
  state: Pick<GameState, 'zonas' | 'tramos' | 'distanciasZonas' | 'parcelas' | 'npcs'>
): Record<ZoneId, { escuela: number; universidad: number; salud: number; policia: number }> {
  const steps = buildTraversableZoneStepMap(state);
  const activeZones = getWorldZones(state);
  const zoneCount = activeZones.length;
  const activeBuildings = getActiveBuildings(state.parcelas);
  const vivos = state.npcs.filter((n) => n.vivo);

  const popTotalByZone = new Map<ZoneId, number>();
  const menoresByZone = new Map<ZoneId, number>();
  const preEgresoByZone = new Map<ZoneId, number>();
  const minPreEgresoAge = EDUCATION_CONSTANTS.edadEgreso - SERVICE_RADIUS_CONSTANTS.aniosPreEgreso;
  for (const z of activeZones) {
    popTotalByZone.set(z, 0);
    menoresByZone.set(z, 0);
    preEgresoByZone.set(z, 0);
  }
  for (const n of vivos) {
    const ez = getEffectiveZone(n, zoneCount, activeZones);
    popTotalByZone.set(ez, (popTotalByZone.get(ez) ?? 0) + 1);
    if (n.edad < EDUCATION_CONSTANTS.edadEgreso) {
      menoresByZone.set(ez, (menoresByZone.get(ez) ?? 0) + 1);
      if (n.edad >= minPreEgresoAge) {
        preEgresoByZone.set(ez, (preEgresoByZone.get(ez) ?? 0) + 1);
      }
    }
  }

  const hospFacilities = computeHospitalFacilities(
    state.parcelas,
    state.npcs,
    state.zonas,
    state.distanciasZonas
  );

  // Assign active teachers (docente) between escuela and universidad buildings within reachable zones
  const escuelas = activeBuildings.filter((b) => b.tipo === 'escuela');
  const universidades = activeBuildings.filter((b) => b.tipo === 'universidad');
  const eduBuildings = [...escuelas, ...universidades];
  const docentesPorEdificio = new Map<string, number>();
  for (const eb of eduBuildings) docentesPorEdificio.set(eb.id, 0);
  const activeDocentes = vivos.filter(
    (n) => n.rol === 'docente' && !n.hospital.internado && !n.accionIa?.fueraDePuesto && !n.capacitacion
  );
  if (eduBuildings.length > 0) {
    for (const d of activeDocentes) {
      let best: BuildingInstance | undefined;
      let bestScore = Infinity;
      for (const eb of eduBuildings) {
        const sDist = steps[d.zona]?.[eb.zona];
        if (typeof sDist !== 'number') continue;
        const load = docentesPorEdificio.get(eb.id) ?? 0;
        const cap = getBuildingRoleCapacity(eb).docente ?? 4;
        const overPenalty = load >= cap ? 50 : 0;
        const score = sDist * 4 + load * 0.6 + overPenalty;
        if (score < bestScore) {
          bestScore = score;
          best = eb;
        }
      }
      if (!best) best = eduBuildings[0];
      docentesPorEdificio.set(best.id, (docentesPorEdificio.get(best.id) ?? 0) + 1);
    }
  }

  const comisarías = activeBuildings.filter((b) => b.tipo === 'comisaria');
  const activePolicias = vivos.filter(
    (n) => n.rol === 'policia' && !n.hospital.internado && !n.accionIa?.fueraDePuesto && !n.capacitacion
  );

  const out: Record<ZoneId, { escuela: number; universidad: number; salud: number; policia: number }> = {};

  for (const z of Object.keys(state.zonas || {})) {
    if (state.zonas[z]?.estado === 'no_urbanizada') {
      out[z] = { escuela: 0, universidad: 0, salud: 0, policia: 0 };
      continue;
    }

    // 1. Escuela coverage
    const escInArea = escuelas.filter(
      (b) => (steps[z]?.[b.zona] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioEscuela
    );
    let covEsc = 0;
    if (escInArea.length > 0) {
      let docentesArea = 0;
      for (const b of escInArea) docentesArea += docentesPorEdificio.get(b.id) ?? 0;
      let menoresArea = 0;
      for (const y of activeZones) {
        if ((steps[z]?.[y] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioEscuela) {
          menoresArea += menoresByZone.get(y) ?? 0;
        }
      }
      covEsc =
        menoresArea <= 0
          ? docentesArea > 0
            ? 1
            : 0
          : clamp(docentesArea / (menoresArea / SERVICE_RADIUS_CONSTANTS.habitantesPorDocente), 0, 1);
    }

    // 2. Universidad coverage
    const univInArea = universidades.filter(
      (b) => (steps[z]?.[b.zona] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioUniversidad
    );
    let covUniv = 0;
    if (univInArea.length > 0) {
      let docentesArea = 0;
      for (const b of univInArea) docentesArea += docentesPorEdificio.get(b.id) ?? 0;
      let preArea = 0;
      for (const y of activeZones) {
        if ((steps[z]?.[y] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioUniversidad) {
          preArea += preEgresoByZone.get(y) ?? 0;
        }
      }
      covUniv =
        preArea <= 0
          ? docentesArea > 0
            ? 1
            : 0
          : clamp(docentesArea / (preArea / SERVICE_RADIUS_CONSTANTS.habitantesPorUniversidad), 0, 1);
    }

    // 3. Salud coverage
    const hospInArea = hospFacilities.filter(
      (f) => (steps[z]?.[f.zona] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioHospital
    );
    let covSalud = 0;
    if (hospInArea.length > 0) {
      let medicosArea = 0;
      for (const f of hospInArea) {
        if (f.esCampana) {
          medicosArea += f.camasEfectivas / Math.max(1, ECON_CONSTANTS.pacientesPorMedico);
        } else {
          medicosArea += f.medicosAsignados;
        }
      }
      let popArea = 0;
      for (const y of activeZones) {
        if ((steps[z]?.[y] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioHospital) {
          popArea += popTotalByZone.get(y) ?? 0;
        }
      }
      covSalud =
        popArea <= 0
          ? medicosArea > 0
            ? 1
            : 0
          : clamp(medicosArea / (popArea / SERVICE_RADIUS_CONSTANTS.habitantesPorMedico), 0, 1);
    }

    // 4. Policía coverage (presencia atenuada dentro del radioComisaria)
    const hasComisariaInRange = comisarías.some(
      (c) => (steps[c.zona]?.[z] ?? Infinity) <= SERVICE_RADIUS_CONSTANTS.radioComisaria
    );
    let covPol = 0;
    if (hasComisariaInRange) {
      let presencia = 0;
      for (const p of activePolicias) {
        const py = getEffectiveZone(p, zoneCount, activeZones);
        const d = steps[py]?.[z];
        if (typeof d === 'number' && d <= SERVICE_RADIUS_CONSTANTS.radioComisaria) {
          presencia += Math.pow(SERVICE_RADIUS_CONSTANTS.atenuacionPolicia, d);
        }
      }
      const popZ = popTotalByZone.get(z) ?? 0;
      covPol =
        popZ <= 0
          ? presencia > 0
            ? 1
            : 0
          : clamp(presencia / (popZ / SERVICE_RADIUS_CONSTANTS.habitantesPorPolicia), 0, 1);
    }

    out[z] = {
      escuela: Number(covEsc.toFixed(3)),
      universidad: Number(covUniv.toFixed(3)),
      salud: Number(covSalud.toFixed(3)),
      policia: Number(covPol.toFixed(3)),
    };
  }

  return out;
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
  let electoresCount = 0;
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
  const minFoodCost = Math.max(
    1,
    (state.alimento?.precio ?? ECON_CONSTANTS.precioBaseAlimento) * ECON_CONSTANTS.consumoPorNpc
  );

  for (const n of vivos) {
    roles[n.rol] = (roles[n.rol] ?? 0) + 1;
    satSum += n.variables.satisfaccion;
    const h = hogarById.get(n.hogarId);
    if (n.edad >= 18) {
      electoresCount++;
      if (n.variables.lealtad >= 50) apoyoCount++;
      if (!h || h.dinero < minFoodCost) sinDinero++;
    }
    if (n.variables.satisfaccion < 30) descCount++;
    if (n.variables.hambre > SERVICE_RADIUS_CONSTANTS.umbralHambreCritica) hambreCrit++;
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

  const hospFacilities = computeHospitalFacilities(
    state.parcelas,
    state.npcs,
    state.zonas,
    state.distanciasZonas
  );
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
  const serviceCoverage = computeZoneServiceCoverage(state);

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

  const seguridadGlobal = state.gobierno.indicadores.seguridad ?? 50;
  for (const z of zoneIds) {
    const covPol = serviceCoverage[z]?.policia ?? 0;
    const bonusComisaria = comisariaBonusByZone.get(z) ?? 0;
    const bonusMuralla = murallaBonusByZone.get(z) ?? 0;
    const integ = state.gobierno.integridad[z] ?? 100;
    const rawDef = Math.min(100, seguridadGlobal * covPol) + bonusComisaria + bonusMuralla;
    defensa[z] = Number(
      clamp(rawDef * (1 - ECON_CONSTANTS.kIntegridad * (1 - integ / 100)), 0, 100).toFixed(1)
    );
    orden[z] = Number((covPol * 100).toFixed(1));
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
    apoyoPct: electoresCount > 0 ? Number(((apoyoCount / electoresCount) * 100).toFixed(1)) : 0,
    descontentosPct: vivosCount > 0 ? Number(((descCount / vivosCount) * 100).toFixed(1)) : 0,
    desempleoPct:
      laborales > 0 ? Number(((roles.desempleado / laborales) * 100).toFixed(1)) : 0,
    hambreCriticaPct: vivosCount > 0 ? Number(((hambreCrit / vivosCount) * 100).toFixed(1)) : 0,
    sinDineroPct: electoresCount > 0 ? Number(((sinDinero / electoresCount) * 100).toFixed(1)) : 0,
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

const ROOT_EVENT_TYPES = new Set<string>([
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
