import React, { useEffect, useRef, useState } from 'react';
import {
  ACTION_TABLE,
  BUILDING_CATALOG,
  ROLE_CATALOG,
} from '../data/catalogs';
import {
  evaluateNpcBubbleText,
  evaluateNpcLensColor,
  evaluateZoneMetricColor,
} from '../utils/npcInsights';
import {
  computeHospitalFacilities,
  getWorldZones,
  HospitalFacilityInfo,
  TICKS_PER_DAY,
} from '../engine/simulation';
import { isViaConnectableToNetwork } from '../engine/worldHelpers';
import {
  BuildingType,
  Casa,
  CommunityDerived,
  Firma,
  GameState,
  Hogar,
  LecturaIndicadorId,
  MapaV2Grid,
  Npc,
  Parcela,
  RoleId,
  ViaTramo,
  ZoneDefinition,
  ZoneId,
} from '../types/game';
import { CameraTarget, CityTab, MapFilter, MapHoverPreview, MapLens, WindowId } from '../types/ui';

export type { CameraTarget, MapFilter, MapLens, WindowId };

interface CityWorldCanvasProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  noRender?: boolean;
  selectedNpcId: string | null;
  selectedParcelaId?: string | null;
  selectedTramoId?: string | null;
  selectedZonaId?: ZoneId | null;
  hoveredPreview?: MapHoverPreview | null;
  filter: MapFilter;
  lens: MapLens;
  lecturaHeatIndicator?: LecturaIndicadorId | null;
  followSelected: boolean;
  cameraTarget: CameraTarget | null;
  zoomRequest: { delta: number; seq: number } | null;
  onSelectNpc: (npcId: string) => void;
  onSelectParcela?: (parcelaId: string) => void;
  onSelectTramo?: (tramoId: string) => void;
  onSelectZona?: (zonaId: ZoneId) => void;
  onOpenSection: (section: WindowId, tabHint?: CityTab) => void;
  onCancelFollow: () => void;
  onHoverInfoChange?: (info: string | null) => void;
}

// Logical simulation bounds V2: 0..1560 x 0..980
const WORLD_W = 1560;
const WORLD_H = 980;

// 2:1 True Isometric Projection centered on valley midpoint (780, 490)
const ORIGIN_WX = WORLD_W / 2;
const ORIGIN_WY = WORLD_H / 2;
const ISO_X = 1.45;
const ISO_Y = 0.725;

// Offscreen static terrain cache covering extended countryside (-220..1780 x -220..1200)
const TERRAIN_W = 5600;
const TERRAIN_H = 3000;
const TERRAIN_CX = TERRAIN_W / 2;
const TERRAIN_CY = TERRAIN_H / 2;

const MINIMAP_W = 208;
const MINIMAP_H = 120;
const MINIMAP_SCALE = 0.048;

const CAM_LIMIT_X = 2150;
const CAM_LIMIT_Y = 1150;

function worldToIso(wx: number, wy: number): { ix: number; iy: number } {
  const dx = wx - ORIGIN_WX;
  const dy = wy - ORIGIN_WY;
  return {
    ix: (dx - dy) * ISO_X,
    iy: (dx + dy) * ISO_Y,
  };
}

function isoToWorld(ix: number, iy: number): { wx: number; wy: number } {
  const a = ix / ISO_X;
  const b = iy / ISO_Y;
  return {
    wx: (a + b) * 0.5 + ORIGIN_WX,
    wy: (b - a) * 0.5 + ORIGIN_WY,
  };
}

function clampCamX(v: number): number {
  return Math.max(-CAM_LIMIT_X, Math.min(CAM_LIMIT_X, v));
}

function clampCamY(v: number): number {
  return Math.max(-CAM_LIMIT_Y, Math.min(CAM_LIMIT_Y, v));
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface RenderNpcState {
  x: number;
  y: number;
  walkPhase: number;
  facingX: number;
  skin: string;
  hair: string;
}

interface SmokeParticle {
  wx: number;
  wy: number;
  z: number;
  r: number;
  alpha: number;
  vz: number;
  vx: number;
}

interface WorldSpeechBubble {
  npcId: string;
  text: string;
  width: number;
  expiresAt: number;
}

const SKIN_TONES = ['#f5d0b5', '#e8b896', '#d49a73', '#b87a56', '#f2c6a7'];
const HAIR_TONES = ['#27272a', '#451a03', '#713f12', '#1e293b', '#57534e', '#92400e'];

function hashIndex(id: string, len: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
}

function getZonePadColor(z: ZoneDefinition, hasDrought: boolean, hasPlague: boolean): string {
  if (z.estado === 'no_urbanizada') {
    return hasDrought ? '#b5a77e' : '#7b8763';
  }
  switch (z.caracter) {
    case 'agricola':
      return hasDrought ? '#d6c68f' : hasPlague ? '#88996c' : '#92bd69';
    case 'industrial':
      return '#94a3b8';
    case 'comercial':
      return '#d6cbb5';
    case 'centro':
      return '#cbd5e1';
    default:
      return hasDrought ? '#c2b98b' : '#8ab86d';
  }
}

function getMinimapZoneColor(z: ZoneDefinition): string {
  if (z.estado === 'no_urbanizada') return '#4b5548';
  switch (z.caracter) {
    case 'agricola':
      return '#65a30d';
    case 'industrial':
      return '#64748b';
    case 'comercial':
      return '#d97706';
    case 'centro':
      return '#0f766e';
    default:
      return '#4d7c0f';
  }
}

// --- Isometric Geometry Helpers ---
function isoQuadPath(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  z = 0
) {
  const n = worldToIso(wx, wy);
  const e = worldToIso(wx + ww, wy);
  const s = worldToIso(wx + ww, wy + wh);
  const w = worldToIso(wx, wy + wh);
  ctx.beginPath();
  ctx.moveTo(n.ix, n.iy - z);
  ctx.lineTo(e.ix, e.iy - z);
  ctx.lineTo(s.ix, s.iy - z);
  ctx.lineTo(w.ix, w.iy - z);
  ctx.closePath();
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  height: number,
  roofColor: string,
  leftWallColor: string,
  rightWallColor: string,
  outlineColor = 'rgba(15,23,42,0.28)',
  litWindows = 0
) {
  const n = worldToIso(wx, wy);
  const e = worldToIso(wx + ww, wy);
  const s = worldToIso(wx + ww, wy + wh);
  const w = worldToIso(wx, wy + wh);

  // Soft cast shadow on ground
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.beginPath();
  ctx.moveTo(e.ix, e.iy);
  ctx.lineTo(e.ix + height * 0.72, e.iy + height * 0.32);
  ctx.lineTo(s.ix + height * 0.72, s.iy + height * 0.32);
  ctx.lineTo(w.ix + height * 0.45, w.iy + height * 0.2);
  ctx.lineTo(s.ix, s.iy);
  ctx.closePath();
  ctx.fill();

  // Left-front wall (West -> South)
  ctx.fillStyle = leftWallColor;
  ctx.beginPath();
  ctx.moveTo(w.ix, w.iy);
  ctx.lineTo(s.ix, s.iy);
  ctx.lineTo(s.ix, s.iy - height);
  ctx.lineTo(w.ix, w.iy - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right-front wall (South -> East)
  ctx.fillStyle = rightWallColor;
  ctx.beginPath();
  ctx.moveTo(s.ix, s.iy);
  ctx.lineTo(e.ix, e.iy);
  ctx.lineTo(e.ix, e.iy - height);
  ctx.lineTo(s.ix, s.iy - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Roof face
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(n.ix, n.iy - height);
  ctx.lineTo(e.ix, e.iy - height);
  ctx.lineTo(s.ix, s.iy - height);
  ctx.lineTo(w.ix, w.iy - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (height >= 16) {
    const winFill =
      litWindows > 0.12
        ? `rgba(253, 224, 71, ${(0.45 + litWindows * 1.1).toFixed(2)})`
        : 'rgba(15, 23, 42, 0.34)';
    ctx.fillStyle = winFill;
    const rows = height >= 30 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const zOff = height * (rows === 2 ? (r === 0 ? 0.35 : 0.68) : 0.48);
      const colsL = Math.max(1, Math.floor(ww / 24));
      for (let c = 0; c < colsL; c++) {
        const t = (c + 0.5) / colsL;
        const px = w.ix + (s.ix - w.ix) * t;
        const py = w.iy + (s.iy - w.iy) * t - zOff;
        ctx.beginPath();
        ctx.moveTo(px - 2.6, py - 1.3);
        ctx.lineTo(px + 2.6, py + 1.3);
        ctx.lineTo(px + 2.6, py + 5.8);
        ctx.lineTo(px - 2.6, py + 3.2);
        ctx.closePath();
        ctx.fill();
      }
      const colsR = Math.max(1, Math.floor(wh / 24));
      for (let c = 0; c < colsR; c++) {
        const t = (c + 0.5) / colsR;
        const px = s.ix + (e.ix - s.ix) * t;
        const py = s.iy + (e.iy - s.iy) * t - zOff;
        ctx.beginPath();
        ctx.moveTo(px - 2.6, py + 1.3);
        ctx.lineTo(px + 2.6, py - 1.3);
        ctx.lineTo(px + 2.6, py + 3.2);
        ctx.lineTo(px - 2.6, py + 5.8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function drawIsoPitchedRoof(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  baseZ: number,
  peakZ: number,
  slopeLight: string,
  slopeDark: string
) {
  const n = worldToIso(wx, wy);
  const e = worldToIso(wx + ww, wy);
  const s = worldToIso(wx + ww, wy + wh);
  const w = worldToIso(wx, wy + wh);
  const peak = worldToIso(wx + ww * 0.5, wy + wh * 0.5);

  const px = peak.ix;
  const py = peak.iy - (baseZ + peakZ);

  ctx.strokeStyle = 'rgba(15,23,42,0.28)';
  ctx.lineWidth = 1;

  ctx.fillStyle = slopeDark;
  ctx.beginPath();
  ctx.moveTo(n.ix, n.iy - baseZ);
  ctx.lineTo(w.ix, w.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = slopeLight;
  ctx.beginPath();
  ctx.moveTo(w.ix, w.iy - baseZ);
  ctx.lineTo(s.ix, s.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = slopeDark;
  ctx.beginPath();
  ctx.moveTo(s.ix, s.iy - baseZ);
  ctx.lineTo(e.ix, e.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = slopeLight;
  ctx.beginPath();
  ctx.moveTo(e.ix, e.iy - baseZ);
  ctx.lineTo(n.ix, n.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// --- Offscreen Static Terrain Builder ---
function tileCoordHash(gx: number, gy: number, seed: number): number {
  let h = (Math.imul(gx + 17, 73856093) ^ Math.imul(gy + 31, 19349663) ^ Math.imul(seed | 1, 83492791)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function buildStaticTerrainCanvas(
  mapaGrid: MapaV2Grid | undefined,
  zonas: ZoneDefinition[],
  hasDrought: boolean,
  hasPlague: boolean,
  seed: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TERRAIN_W;
  canvas.height = TERRAIN_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(TERRAIN_CX, TERRAIN_CY);

  // Base countryside backdrop
  ctx.fillStyle = hasDrought ? '#cabf95' : '#6fa350';
  ctx.fillRect(-TERRAIN_CX, -TERRAIN_CY, TERRAIN_W, TERRAIN_H);

  const grassA = hasDrought ? '#d5ca9e' : '#74aa54';
  const grassB = hasDrought ? '#cbbd8f' : '#699f4b';
  const waterCol = hasDrought ? '#38bdf8' : '#0284c7';
  const rockCol = hasDrought ? '#948870' : '#64748b';
  const rockHiCol = hasDrought ? '#b0a386' : '#94a3b8';

  if (mapaGrid && mapaGrid.ancho > 0 && mapaGrid.alto > 0) {
    const ancho = mapaGrid.ancho;
    const alto = mapaGrid.alto;
    const tw = WORLD_W / ancho;
    const th = WORLD_H / alto;

    // Extended surrounding grass apron outside 0..WORLD_W x 0..WORLD_H
    const apron = 50;
    for (let wx = -200; wx < WORLD_W + 200; wx += apron) {
      for (let wy = -200; wy < WORLD_H + 200; wy += apron) {
        if (wx >= 0 && wx < WORLD_W && wy >= 0 && wy < WORLD_H) continue;
        const even = ((Math.floor(wx / apron) + Math.floor(wy / apron)) & 1) === 0;
        ctx.fillStyle = even ? grassA : grassB;
        isoQuadPath(ctx, wx, wy, apron, apron);
        ctx.fill();
      }
    }

    // Terrain tiles strictly from state.mapaGrid.terreno + altura relief
    for (let gy = 0; gy < alto; gy++) {
      const row = mapaGrid.terreno[gy] ?? '';
      const altRow = mapaGrid.altura?.[gy] ?? '';
      for (let gx = 0; gx < ancho; gx++) {
        const ch = row[gx] ?? '.';
        const alt = Math.max(0, Math.min(9, Number(altRow[gx] ?? '4') || 4));
        const wx = gx * tw;
        const wy = gy * th;
        if (ch === '~') {
          ctx.fillStyle = waterCol;
          isoQuadPath(ctx, wx, wy, tw + 0.4, th + 0.4);
          ctx.fill();
          if (((gx + gy) & 1) === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            isoQuadPath(ctx, wx + tw * 0.2, wy + th * 0.25, tw * 0.55, th * 0.22);
            ctx.fill();
          }
        } else if (ch === '^') {
          ctx.fillStyle = rockCol;
          isoQuadPath(ctx, wx, wy, tw + 0.4, th + 0.4);
          ctx.fill();
          ctx.fillStyle = rockHiCol;
          isoQuadPath(ctx, wx + tw * 0.15, wy + th * 0.15, tw * 0.5, th * 0.5);
          ctx.fill();
        } else if (ch === '%') {
          ctx.fillStyle = hasDrought ? '#9c9b64' : '#4d7c3f';
          isoQuadPath(ctx, wx, wy, tw + 0.35, th + 0.35);
          ctx.fill();
          if (alt >= 5) {
            ctx.fillStyle = `rgba(255,255,255,${((alt - 4) * 0.03).toFixed(2)})`;
            ctx.fill();
          }
          const cIso = worldToIso(wx + tw * 0.5, wy + th * 0.5);
          ctx.fillStyle = hasDrought ? '#787143' : '#2f5e2c';
          ctx.beginPath();
          ctx.arc(cIso.ix, cIso.iy - 2, Math.max(2.6, tw * 0.28), 0, Math.PI * 2);
          ctx.fill();
        } else {
          const even = ((gx + gy) & 1) === 0;
          ctx.fillStyle = even ? grassA : grassB;
          isoQuadPath(ctx, wx, wy, tw + 0.35, th + 0.35);
          ctx.fill();
          if (alt > 4) {
            ctx.fillStyle = `rgba(255,255,255,${((alt - 4) * 0.025).toFixed(2)})`;
            ctx.fill();
          } else if (alt < 4) {
            ctx.fillStyle = `rgba(15,23,42,${((4 - alt) * 0.03).toFixed(2)})`;
            ctx.fill();
          }
        }
      }
    }
  } else {
    const tile = 50;
    for (let wx = -220; wx < 1780; wx += tile) {
      for (let wy = -220; wy < 1200; wy += tile) {
        const even = ((Math.floor(wx / tile) + Math.floor(wy / tile)) & 1) === 0;
        ctx.fillStyle = even ? grassA : grassB;
        isoQuadPath(ctx, wx, wy, tile, tile);
        ctx.fill();
      }
    }
  }

  // Zone terrain pads from V2 state.zonas
  for (const z of zonas) {
    const r = z.rect;
    if (!r) continue;
    ctx.save();
    ctx.fillStyle = getZonePadColor(z, hasDrought, hasPlague);
    isoQuadPath(ctx, r.wx, r.wy, r.ww, r.wh);
    ctx.fill();

    if (z.estado === 'no_urbanizada') {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (z.caracter === 'agricola') {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.2;
        for (let fy = r.wy + 20; fy < r.wy + r.wh - 14; fy += 18) {
          const p1 = worldToIso(r.wx + 12, fy);
          const p2 = worldToIso(r.wx + r.ww - 12, fy);
          ctx.beginPath();
          ctx.moveTo(p1.ix, p1.iy);
          ctx.lineTo(p2.ix, p2.iy);
          ctx.stroke();
        }
      } else if (z.caracter === 'centro') {
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.16)';
        ctx.lineWidth = 1;
        for (let px = r.wx + 24; px < r.wx + r.ww - 12; px += 28) {
          const a = worldToIso(px, r.wy + 8);
          const b = worldToIso(px, r.wy + r.wh - 8);
          ctx.beginPath();
          ctx.moveTo(a.ix, a.iy);
          ctx.lineTo(b.ix, b.iy);
          ctx.stroke();
        }
      }
    }

    // Zone plaque at north-west corner
    const lbl = worldToIso(r.wx + 10, r.wy + 12);
    const labelText =
      z.estado === 'no_urbanizada' ? `${z.nombre} · Sin urbanizar` : z.nombre;
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    const pw = Math.min(200, ctx.measureText(labelText).width + 14);
    ctx.fillStyle = z.estado === 'no_urbanizada' ? 'rgba(15, 23, 42, 0.64)' : 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(lbl.ix - 4, lbl.iy - 13, pw, 18, 4);
    ctx.fill();
    ctx.fillStyle = z.estado === 'no_urbanizada' ? '#cbd5e1' : '#f8fafc';
    ctx.fillText(labelText, lbl.ix + 3, lbl.iy);
    ctx.restore();
  }

  // Deterministic static flora strictly from mapaGrid soil tiles & seed (outside zone pads & roads)
  if (mapaGrid && mapaGrid.ancho > 0 && mapaGrid.alto > 0) {
    const ancho = mapaGrid.ancho;
    const alto = mapaGrid.alto;
    const tw = WORLD_W / ancho;
    const th = WORLD_H / alto;
    const zoneRects = zonas.map((z) => z.rect).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const step = Math.max(1, Math.floor(ancho / 40));
    for (let gy = 1; gy < alto - 1; gy += step) {
      const row = mapaGrid.terreno[gy] ?? '';
      const viaRow = mapaGrid.vias[gy] ?? '';
      for (let gx = 1; gx < ancho - 1; gx += step) {
        if ((row[gx] ?? '.') !== '.' || (viaRow[gx] ?? '.') !== '.') continue;
        if ((tileCoordHash(gx, gy, seed) % 100) >= 6) continue;
        const wx = (gx + 0.5) * tw;
        const wy = (gy + 0.5) * th;
        const insideZone = zoneRects.some(
          (r) => wx >= r.wx - 8 && wx <= r.wx + r.ww + 8 && wy >= r.wy - 8 && wy <= r.wy + r.wh + 8
        );
        if (insideZone) continue;
        const p = worldToIso(wx, wy);
        ctx.fillStyle = 'rgba(15,23,42,0.16)';
        ctx.beginPath();
        ctx.ellipse(p.ix + 4, p.iy + 2, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(p.ix - 1.5, p.iy - 8, 3, 8);
        ctx.fillStyle = hasDrought ? '#84a955' : '#15803d';
        ctx.beginPath();
        ctx.arc(p.ix, p.iy - 12, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hasDrought ? '#a3be6e' : '#22c55e';
        ctx.beginPath();
        ctx.arc(p.ix - 2, p.iy - 14.5, 4.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas;
}

function buildMinimapBgCanvas(
  mapaGrid: MapaV2Grid | undefined,
  zonas: ZoneDefinition[]
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MINIMAP_W;
  c.height = MINIMAP_H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.fillStyle = '#2d4726';
  ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

  const mapPoint = (wx: number, wy: number) => {
    const iso = worldToIso(wx, wy);
    return {
      mx: MINIMAP_W / 2 + iso.ix * MINIMAP_SCALE,
      my: MINIMAP_H / 2 + iso.iy * MINIMAP_SCALE,
    };
  };

  // Water, mountain & scrubland tiles from state.mapaGrid.terreno
  if (mapaGrid && mapaGrid.ancho > 0 && mapaGrid.alto > 0) {
    const tw = WORLD_W / mapaGrid.ancho;
    const th = WORLD_H / mapaGrid.alto;
    for (let gy = 0; gy < mapaGrid.alto; gy++) {
      const row = mapaGrid.terreno[gy] ?? '';
      for (let gx = 0; gx < mapaGrid.ancho; gx++) {
        const ch = row[gx] ?? '.';
        if (ch !== '~' && ch !== '^' && ch !== '%') continue;
        ctx.fillStyle = ch === '~' ? '#0284c7' : ch === '^' ? '#64748b' : '#3f6212';
        const pt = mapPoint((gx + 0.5) * tw, (gy + 0.5) * th);
        const sz = Math.max(1.8, tw * MINIMAP_SCALE * 1.4);
        ctx.fillRect(pt.mx - sz / 2, pt.my - sz / 2, sz, sz);
      }
    }
  }

  for (const z of zonas) {
    const d = z.rect;
    if (!d) continue;
    ctx.fillStyle = getMinimapZoneColor(z);
    const p1 = mapPoint(d.wx, d.wy);
    const p2 = mapPoint(d.wx + d.ww, d.wy);
    const p3 = mapPoint(d.wx + d.ww, d.wy + d.wh);
    const p4 = mapPoint(d.wx, d.wy + d.wh);
    ctx.beginPath();
    ctx.moveTo(p1.mx, p1.my);
    ctx.lineTo(p2.mx, p2.my);
    ctx.lineTo(p3.mx, p3.my);
    ctx.lineTo(p4.mx, p4.my);
    ctx.closePath();
    ctx.fill();
    if (z.estado === 'no_urbanizada') {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  return c;
}

type DrawableItem =
  | {
      kind: 'fn';
      depth: number;
      draw: (ctx: CanvasRenderingContext2D) => void;
    }
  | {
      kind: 'npc';
      depth: number;
      ix: number;
      iy: number;
      npc: Npc;
      rp: RenderNpcState;
    };

function drawIsoNpc(
  c: CanvasRenderingContext2D,
  ix: number,
  iy: number,
  npc: Npc,
  rp: RenderNpcState,
  st: GameState,
  curLens: MapLens,
  curDerived: CommunityDerived,
  selectedId: string | null,
  isPaused: boolean,
  active: boolean,
  nowSec: number,
  notableType?: 'empresario' | 'medio'
) {
  const inHospital = Boolean(npc.hospital.internado);
  const waitingBed = Boolean(npc.hospital.esperandoCama);
  const offDuty = Boolean(npc.accionIa?.fueraDePuesto);
  const isMoving =
    !isPaused &&
    !inHospital &&
    (Math.hypot(npc.mapa.x - rp.x, npc.mapa.y - rp.y) > 0.35 ||
      Math.hypot(npc.mapa.destino.x - npc.mapa.x, npc.mapa.destino.y - npc.mapa.y) > 2);
  const isSelected = npc.id === selectedId;
  const color = evaluateNpcLensColor(npc, curLens, st, curDerived);
  const bob = isMoving ? Math.abs(Math.sin(rp.walkPhase)) * 2.2 : 0;
  const stride = isMoving ? Math.sin(rp.walkPhase) * 2.6 : 0;
  const sc = isSelected ? 1.32 : 1.05;

  c.save();
  c.translate(ix, iy);
  c.scale(sc, sc);
  c.globalAlpha = active ? (inHospital ? 0.88 : 1) : 0.16;

  // Shadow
  c.fillStyle = 'rgba(15, 23, 42, 0.28)';
  c.beginPath();
  c.ellipse(0, 1.5, 5.5, 2.8, 0, 0, Math.PI * 2);
  c.fill();

  if (inHospital) {
    c.beginPath();
    c.ellipse(0, 0, 10.5, 5.8, 0, 0, Math.PI * 2);
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 1.8;
    c.stroke();
  } else if (waitingBed) {
    c.beginPath();
    c.ellipse(0, 0, 11 + Math.sin(nowSec * 6) * 1.4, 6, 0, 0, Math.PI * 2);
    c.strokeStyle = '#fb7185';
    c.lineWidth = 2;
    c.stroke();
  } else if (npc.accionIa) {
    c.save();
    c.beginPath();
    c.ellipse(0, 0, 10 + Math.sin(nowSec * 4) * 1.2, 5.5, 0, 0, Math.PI * 2);
    if (offDuty) c.setLineDash([3, 2.5]);
    c.strokeStyle = npc.accionIa.tipo === 'condicion' ? '#ef4444' : '#f59e0b';
    c.lineWidth = 1.8;
    c.stroke();
    c.restore();
  }

  if (isSelected) {
    c.beginPath();
    c.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
    c.strokeStyle = '#14b8a6';
    c.lineWidth = 2.4;
    c.stroke();
  }

  // Legs
  c.fillStyle = '#0f172a';
  c.fillRect(-3 + stride * 0.45, -3.5, 2.2, 4);
  c.fillRect(1 - stride * 0.45, -3.5, 2.2, 4);

  // Torso
  c.fillStyle = inHospital ? '#e0f2fe' : color;
  c.strokeStyle = waitingBed ? '#fda4af' : '#ffffff';
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(-4.5, -10.5 - bob, 9, 8, 2.5);
  c.fill();
  c.stroke();

  // Head
  c.fillStyle = rp.skin;
  c.beginPath();
  c.arc(0, -13.5 - bob, 3.4, 0, Math.PI * 2);
  c.fill();

  // Role Hat / Hair
  if (npc.rol === 'agricultor') {
    c.fillStyle = '#eab308';
    c.beginPath();
    c.ellipse(0, -15.8 - bob, 5.2, 2, 0, 0, Math.PI * 2);
    c.fill();
  } else if (npc.rol === 'policia') {
    c.fillStyle = '#1e3a8a';
    c.fillRect(-3.5, -17 - bob, 7, 2.5);
  } else if (npc.rol === 'ingeniero' || npc.rol === 'constructor') {
    c.fillStyle = npc.rol === 'constructor' ? '#f97316' : '#facc15';
    c.beginPath();
    c.arc(0, -14.8 - bob, 3.6, Math.PI, 0);
    c.fill();
  } else if (npc.rol === 'empresario' || npc.rol === 'inmobiliario') {
    c.fillStyle = '#0f172a';
    c.fillRect(-5, -16.3 - bob, 10, 1.5);
    c.fillRect(-3.2, -19.2 - bob, 6.4, 3);
    c.fillStyle = npc.rol === 'inmobiliario' ? '#10b981' : '#f59e0b';
    c.fillRect(-3.2, -17 - bob, 6.4, 0.9);
  } else {
    c.fillStyle = npc.rol === 'jubilado' ? '#e2e8f0' : rp.hair;
    c.beginPath();
    c.arc(0, -14.5 - bob, 3.2, Math.PI, 0);
    c.fill();
  }

  if (npc.variables.hambre > 80 && active) {
    c.fillStyle = '#dc2626';
    c.beginPath();
    c.arc(6.5, -15 - bob, 2.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 0.8;
    c.stroke();
  }

  if ((inHospital || waitingBed) && active) {
    c.fillStyle = waitingBed ? '#be123c' : '#0284c7';
    c.beginPath();
    c.roundRect(-6, -28 - bob, 12, 10, 3);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(-1, -26 - bob, 2, 6);
    c.fillRect(-3, -24 - bob, 6, 2);
  } else if (npc.accionIa && active) {
    const badgeText =
      npc.accionIa.id === 'protesta' || npc.accionIa.id === 'huelga'
        ? '!'
        : npc.accionIa.id === 'saqueo' || npc.accionIa.id === 'boicotea'
        ? '×'
        : npc.accionIa.id === 'organizar_fiesta'
        ? '♪'
        : npc.accionIa.id === 'compartir_comida'
        ? '♥'
        : npc.accionIa.id === 'cuidar_vecinos'
        ? '+'
        : npc.accionIa.id === 'reparar_barricada'
        ? '⚒'
        : npc.accionIa.id === 'organizar_asamblea'
        ? '⚑'
        : '•';
    c.fillStyle = npc.accionIa.tipo === 'condicion' ? '#dc2626' : '#d97706';
    c.beginPath();
    c.roundRect(offDuty ? -9 : -6, -28 - bob, offDuty ? 18 : 12, 10, 3);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = '700 7.5px "Plus Jakarta Sans", sans-serif';
    c.textAlign = 'center';
    c.fillText(offDuty ? `${badgeText}⏸` : badgeText, 0, -20.5 - bob);
    c.textAlign = 'start';
  }

  if (notableType && active) {
    const nx = inHospital || waitingBed || npc.accionIa ? 10 : 0;
    const ny = inHospital || waitingBed || npc.accionIa ? -20 - bob : -24 - bob;
    c.fillStyle = notableType === 'empresario' ? '#f59e0b' : '#ec4899';
    c.strokeStyle = '#0f172a';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(nx, ny - 4.5);
    c.lineTo(nx + 4.5, ny);
    c.lineTo(nx, ny + 4.5);
    c.lineTo(nx - 4.5, ny);
    c.closePath();
    c.fill();
    c.stroke();
  }

  c.restore();
}

function drawHouseBuilding(
  c: CanvasRenderingContext2D,
  tipo: 'casa_chica' | 'casa_mediana' | 'casa_grande',
  bx: number,
  by: number,
  bw: number,
  bh: number,
  duskAmount: number,
  casa: Casa | undefined
) {
  const height = tipo === 'casa_grande' ? 19 : tipo === 'casa_mediana' ? 14 : 11;
  const peak = tipo === 'casa_grande' ? 11 : tipo === 'casa_mediana' ? 9 : 7;
  const occupied = Boolean(casa?.hogarId);
  const roofLight =
    tipo === 'casa_grande' ? '#0d9488' : tipo === 'casa_mediana' ? '#ea580c' : '#d97706';
  const roofDark =
    tipo === 'casa_grande' ? '#115e59' : tipo === 'casa_mediana' ? '#9a3412' : '#92400e';
  const wallL = occupied ? '#e2d5b5' : '#cbd5e1';
  const wallR = occupied ? '#f5ebd1' : '#e2e8f0';

  drawIsoBox(c, bx, by, bw, bh, height, '#fef3c7', wallL, wallR, undefined, occupied ? duskAmount : 0);
  drawIsoPitchedRoof(c, bx - 1.5, by - 1.5, bw + 3, bh + 3, height, peak, roofLight, roofDark);
}

function drawParcelBuilding(
  c: CanvasRenderingContext2D,
  tipo: BuildingType,
  parcel: Parcela,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  center: { ix: number; iy: number },
  duskAmount: number,
  nowSec: number,
  casa: Casa | undefined,
  impago: boolean
) {
  if (tipo === 'casa_chica' || tipo === 'casa_mediana' || tipo === 'casa_grande') {
    drawHouseBuilding(c, tipo, bx, by, bw, bh, duskAmount, casa);
    return;
  }

  const labelRoof = (text: string, yOff: number, color = '#ffffff') => {
    c.fillStyle = color;
    c.font = '700 7.2px "Plus Jakarta Sans", sans-serif';
    c.textAlign = 'center';
    c.fillText(text, center.ix, center.iy - yOff);
    c.textAlign = 'start';
  };

  switch (tipo) {
    case 'hospital': {
      drawIsoBox(c, bx, by, bw, bh, 26, '#ffffff', '#cbd5e1', '#e2e8f0', undefined, duskAmount);
      c.fillStyle = '#dc2626';
      c.fillRect(center.ix - 2.5, center.iy - 34, 5, 14);
      c.fillRect(center.ix - 7, center.iy - 29.5, 14, 5);
      break;
    }
    case 'hospital_campana': {
      drawIsoBox(c, bx + 4, by + 4, bw - 8, bh - 8, 13, '#fef2f2', '#94a3b8', '#cbd5e1');
      drawIsoPitchedRoof(c, bx + 2, by + 2, bw - 4, bh - 4, 13, 9, '#f8fafc', '#cbd5e1');
      c.fillStyle = '#dc2626';
      c.fillRect(center.ix - 2, center.iy - 27, 4, 9);
      c.fillRect(center.ix - 4.5, center.iy - 24.5, 9, 4);
      if (parcel.edificio?.diasRestantesCampana !== undefined) {
        labelRoof(`${parcel.edificio.diasRestantesCampana}d`, 4, '#0f172a');
      }
      break;
    }
    case 'comisaria': {
      drawIsoBox(c, bx, by, bw, bh, 23, '#1d4ed8', '#172554', '#1e3a8a', undefined, duskAmount);
      labelRoof('COMISARÍA', 24, '#dbeafe');
      break;
    }
    case 'escuela': {
      drawIsoBox(c, bx, by, bw, bh, 22, '#e0e7ff', '#a5b4fc', '#c7d2fe', undefined, duskAmount);
      drawIsoPitchedRoof(c, bx - 2, by - 2, bw + 4, bh + 4, 22, 11, '#4f46e5', '#3730a3');
      labelRoof('ESCUELA', 22, '#ffffff');
      break;
    }
    case 'universidad': {
      drawIsoBox(c, bx, by, bw, bh, 25, '#c7d2fe', '#6366f1', '#818cf8', undefined, duskAmount);
      drawIsoPitchedRoof(c, bx - 2, by - 2, bw + 4, bh + 4, 25, 13, '#312e81', '#1e1b4b');
      labelRoof('UNIV.', 26, '#eef2ff');
      break;
    }
    case 'oficina_publica': {
      drawIsoBox(c, bx, by, bw, bh, 28, '#0f766e', '#475569', '#64748b', undefined, duskAmount);
      drawIsoBox(c, bx + bw * 0.2, by + bh * 0.2, bw * 0.6, bh * 0.6, 12, '#14b8a6', '#0f766e', '#115e59');
      labelRoof('GOBIERNO', 40, '#ecfeff');
      if (impago) {
        c.strokeStyle = `rgba(220, 38, 38, ${(0.55 + Math.sin(nowSec * 5) * 0.35).toFixed(2)})`;
        c.lineWidth = 2.6;
        isoQuadPath(c, parcel.wx - 2, parcel.wy - 2, parcel.ww + 4, parcel.wh + 4);
        c.stroke();
      }
      break;
    }
    case 'plaza': {
      c.fillStyle = '#e5dcc8';
      isoQuadPath(c, parcel.wx + 2, parcel.wy + 2, parcel.ww - 4, parcel.wh - 4);
      c.fill();
      c.strokeStyle = '#94a3b8';
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = '#0ea5e9';
      c.beginPath();
      c.ellipse(center.ix, center.iy - 1, 16, 8, 0, 0, Math.PI * 2);
      c.fill();
      const ripple = ((nowSec * 11) % 12) + 3;
      c.strokeStyle = 'rgba(255,255,255,0.72)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(center.ix, center.iy - 1, ripple, ripple * 0.5, 0, 0, Math.PI * 2);
      c.stroke();
      // Flagpole on Plaza Mayor
      const flagWave = Math.sin(nowSec * 4) * 2;
      c.strokeStyle = '#0f172a';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(center.ix + 14, center.iy);
      c.lineTo(center.ix + 14, center.iy - 24);
      c.stroke();
      c.fillStyle = '#f59e0b';
      c.beginPath();
      c.moveTo(center.ix + 14, center.iy - 24);
      c.lineTo(center.ix + 26, center.iy - 21 + flagWave);
      c.lineTo(center.ix + 14, center.iy - 17);
      c.closePath();
      c.fill();
      break;
    }
    case 'puerto':
    case 'muelle_comercio': {
      const isMuelle = tipo === 'muelle_comercio';
      drawIsoBox(
        c,
        bx,
        by,
        bw,
        bh,
        15,
        isMuelle ? '#0369a1' : '#0f766e',
        '#334155',
        '#475569',
        undefined,
        duskAmount
      );
      drawIsoBox(c, bx + bw - 14, by + 4, 10, 10, 26, '#f59e0b', '#b45309', '#d97706');
      labelRoof(isMuelle ? 'MUELLE EXT.' : 'PUERTO', 18, '#e0f2fe');
      break;
    }
    case 'campo': {
      const barnW = Math.min(34, bw * 0.48);
      const barnH = Math.min(26, bh * 0.54);
      drawIsoBox(c, bx + 4, by + 4, barnW, barnH, 14, '#dc2626', '#991b1b', '#b91c1c', undefined, duskAmount);
      drawIsoPitchedRoof(c, bx + 2, by + 2, barnW + 4, barnH + 4, 14, 9, '#ef4444', '#991b1b');
      drawIsoBox(c, bx + barnW + 10, by + 8, 11, 11, 22, '#e2e8f0', '#94a3b8', '#cbd5e1');
      break;
    }
    case 'fabrica': {
      drawIsoBox(c, bx, by, bw, bh, 22, '#64748b', '#334155', '#475569', undefined, duskAmount);
      drawIsoBox(c, bx + bw - 14, by + 4, 10, 10, 36, '#1e293b', '#0f172a', '#334155');
      labelRoof('FÁBRICA', 23, '#e2e8f0');
      break;
    }
    case 'supermercado': {
      drawIsoBox(c, bx, by, bw, bh, 18, '#0284c7', '#1e3a8a', '#0369a1', undefined, duskAmount);
      labelRoof('SÚPER', 19, '#e0f2fe');
      break;
    }
    case 'almacen': {
      drawIsoBox(c, bx, by, bw, bh, 17, '#d97706', '#78350f', '#b45309', undefined, duskAmount);
      labelRoof('ALMACÉN', 18, '#fef3c7');
      break;
    }
    case 'tienda': {
      drawIsoBox(c, bx, by, bw, bh, 16, '#059669', '#064e3b', '#047857', undefined, duskAmount);
      labelRoof('TIENDA', 17, '#d1fae5');
      break;
    }
    case 'kiosco': {
      drawIsoBox(c, bx + 4, by + 4, bw - 8, bh - 8, 12, '#f59e0b', '#92400e', '#b45309');
      drawIsoPitchedRoof(c, bx + 2, by + 2, bw - 4, bh - 4, 12, 6, '#fbbf24', '#d97706');
      break;
    }
    case 'restoran': {
      drawIsoBox(c, bx, by, bw, bh, 17, '#e11d48', '#881337', '#be123c', undefined, duskAmount);
      labelRoof('RESTORÁN', 18, '#ffe4e6');
      break;
    }
    case 'bar_cafe': {
      drawIsoBox(c, bx, by, bw, bh, 15, '#b45309', '#451a03', '#78350f', undefined, duskAmount);
      labelRoof('CAFÉ', 16, '#fef3c7');
      break;
    }
    case 'peluqueria': {
      drawIsoBox(c, bx, by, bw, bh, 15, '#14b8a6', '#115e59', '#0f766e', undefined, duskAmount);
      labelRoof('PELUQ.', 16, '#ccfbf1');
      break;
    }
    case 'taller': {
      drawIsoBox(c, bx, by, bw, bh, 18, '#475569', '#1e293b', '#334155', undefined, duskAmount);
      labelRoof('TALLER', 19, '#e2e8f0');
      break;
    }
    case 'gimnasio': {
      drawIsoBox(c, bx, by, bw, bh, 19, '#4f46e5', '#312e81', '#3730a3', undefined, duskAmount);
      labelRoof('GIMNASIO', 20, '#e0e7ff');
      break;
    }
    case 'cine_teatro': {
      drawIsoBox(c, bx, by, bw, bh, 22, '#7c3aed', '#4c1d95', '#5b21b6', undefined, duskAmount);
      labelRoof('CINE', 23, '#f3e8ff');
      break;
    }
    case 'club': {
      drawIsoBox(c, bx, by, bw, bh, 19, '#a21caf', '#4a044e', '#701a75', undefined, duskAmount);
      labelRoof('CLUB', 20, '#fae8ff');
      break;
    }
    case 'oficina_constructora': {
      drawIsoBox(c, bx, by, bw, bh, 22, '#ea580c', '#7c2d12', '#9a3412', undefined, duskAmount);
      labelRoof('CONSTR.', 23, '#ffedd5');
      break;
    }
    case 'oficina_inmobiliaria': {
      drawIsoBox(c, bx, by, bw, bh, 22, '#10b981', '#064e3b', '#047857', undefined, duskAmount);
      labelRoof('INMOB.', 23, '#d1fae5');
      break;
    }
    case 'oficina_medio': {
      drawIsoBox(c, bx, by, bw, bh, 21, '#be185d', '#831843', '#9d174d', undefined, duskAmount);
      labelRoof('PRENSA', 22, '#fdf2f8');
      break;
    }
    case 'muralla': {
      drawIsoBox(c, bx, by, bw, 10, 20, '#cbd5e1', '#475569', '#64748b');
      drawIsoBox(c, bx, by + bh - 10, bw, 10, 20, '#cbd5e1', '#475569', '#64748b');
      drawIsoBox(c, bx, by, 10, bh, 20, '#cbd5e1', '#475569', '#64748b');
      labelRoof('MURALLA', 22, '#f8fafc');
      break;
    }
    case 'silo': {
      drawIsoBox(c, bx + 6, by + 6, 16, 16, 30, '#f8fafc', '#94a3b8', '#cbd5e1');
      drawIsoBox(c, bx + 26, by + 6, 16, 16, 30, '#f8fafc', '#94a3b8', '#cbd5e1');
      labelRoof('SILO', 31, '#0f172a');
      break;
    }
    case 'riego': {
      c.fillStyle = '#0284c7';
      isoQuadPath(c, bx, by + bh * 0.25, bw, bh * 0.5);
      c.fill();
      drawIsoBox(c, bx + bw * 0.35, by + bh * 0.15, 18, 18, 14, '#38bdf8', '#0369a1', '#0284c7');
      labelRoof('RIEGO', 16, '#e0f2fe');
      break;
    }
  }
}

export const CityWorldCanvas: React.FC<CityWorldCanvasProps> = ({
  state,
  derived,
  paused,
  noRender = false,
  selectedNpcId,
  selectedParcelaId = null,
  selectedTramoId = null,
  selectedZonaId = null,
  hoveredPreview = null,
  filter,
  lens,
  lecturaHeatIndicator = null,
  followSelected,
  cameraTarget,
  zoomRequest,
  onSelectNpc,
  onSelectParcela,
  onSelectTramo,
  onSelectZona,
  onCancelFollow,
  onHoverInfoChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipDivRef = useRef<HTMLDivElement | null>(null);
  const viewportSizeRef = useRef<{ w: number; h: number }>({ w: 1280, h: 720 });

  const stateRef = useRef(state);
  stateRef.current = state;
  const derivedRef = useRef(derived);
  derivedRef.current = derived;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const noRenderRef = useRef(noRender);
  noRenderRef.current = noRender;
  const selectedIdRef = useRef(selectedNpcId);
  selectedIdRef.current = selectedNpcId;
  const selectedParcelaIdRef = useRef(selectedParcelaId);
  selectedParcelaIdRef.current = selectedParcelaId;
  const selectedTramoIdRef = useRef(selectedTramoId);
  selectedTramoIdRef.current = selectedTramoId;
  const selectedZonaIdRef = useRef(selectedZonaId);
  selectedZonaIdRef.current = selectedZonaId;
  const hoveredPreviewRef = useRef(hoveredPreview);
  hoveredPreviewRef.current = hoveredPreview;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const lensRef = useRef(lens);
  lensRef.current = lens;
  const lecturaHeatRef = useRef(lecturaHeatIndicator);
  lecturaHeatRef.current = lecturaHeatIndicator;
  const followRef = useRef(followSelected);
  followRef.current = followSelected;
  const onHoverInfoRef = useRef(onHoverInfoChange);
  onHoverInfoRef.current = onHoverInfoChange;

  // Start camera framed over Centro Cívico
  const initialCenter = worldToIso(600, 382);
  const camRef = useRef({
    x: initialCenter.ix,
    y: initialCenter.iy,
    zoom: 1.04,
    targetX: initialCenter.ix,
    targetY: initialCenter.iy,
    targetZoom: 1.04,
  });

  const keysHeldRef = useRef<Set<string>>(new Set());
  const hoveredParcelaIdRef = useRef<string | null>(null);
  const hoveredTramoIdRef = useRef<string | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);

  const [hoverTooltipData, setHoverTooltipData] = useState<{
    kind: 'npc' | 'parcela' | 'tramo';
    title: string;
    subtitle: string;
    detail?: string;
  } | null>(null);

  const renderPositionsRef = useRef<Map<string, RenderNpcState>>(new Map());
  const smokeRef = useRef<SmokeParticle[]>([]);
  const bubblesRef = useRef<WorldSpeechBubble[]>([]);
  const seenContagionEventIdsRef = useRef<Set<string>>(new Set());
  const nextBubbleAtRef = useRef<number>(0);

  const dragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origCamX: initialCenter.ix,
    origCamY: initialCenter.iy,
  });

  const minimapDragRef = useRef(false);

  // Offscreen Caches
  const terrainCacheRef = useRef<{
    canvas: HTMLCanvasElement;
    key: string;
  } | null>(null);
  const minimapBgRef = useRef<{
    canvas: HTMLCanvasElement;
    key: string;
  } | null>(null);

  // Keyboard panning (WASD / Arrows)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keysHeldRef.current.add(k);
        onCancelFollow();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.key.toLowerCase());
    };
    const clearKeys = () => {
      keysHeldRef.current.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearKeys);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearKeys);
    };
  }, [onCancelFollow]);

  // Handle external zone / coord jump requests
  useEffect(() => {
    if (!cameraTarget) return;
    if (cameraTarget.wx !== undefined && cameraTarget.wy !== undefined) {
      const p = worldToIso(cameraTarget.wx, cameraTarget.wy);
      camRef.current.targetX = clampCamX(p.ix);
      camRef.current.targetY = clampCamY(p.iy);
      if (camRef.current.targetZoom < 1.15) camRef.current.targetZoom = 1.24;
      return;
    }
    if (cameraTarget.zone === 'all') {
      const center = worldToIso(780, 490);
      camRef.current.targetX = center.ix;
      camRef.current.targetY = center.iy;
      camRef.current.targetZoom = 0.46;
      return;
    }
    if (cameraTarget.zone) {
      const zr = stateRef.current.zonas[cameraTarget.zone]?.rect;
      if (zr) {
        const p = worldToIso(zr.wx + zr.ww / 2, zr.wy + zr.wh / 2);
        camRef.current.targetX = p.ix;
        camRef.current.targetY = p.iy;
        camRef.current.targetZoom = 1.14;
        return;
      }
    }
  }, [cameraTarget]);

  // Handle external zoom button requests
  useEffect(() => {
    if (!zoomRequest) return;
    if (zoomRequest.delta === 0) {
      const center = worldToIso(600, 382);
      camRef.current.targetX = center.ix;
      camRef.current.targetY = center.iy;
      camRef.current.targetZoom = 1.04;
    } else {
      camRef.current.targetZoom = Math.max(
        0.38,
        Math.min(2.4, camRef.current.targetZoom + zoomRequest.delta)
      );
    }
  }, [zoomRequest]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        viewportSizeRef.current = { w: rect.width, h: rect.height };
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const screenToIso = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const ix = (sx - rect.width / 2) / camRef.current.zoom + camRef.current.x;
    const iy = (sy - rect.height / 2) / camRef.current.zoom + camRef.current.y;
    return { ix, iy, sx, sy };
  };

  // Main 60fps Frustum-Culled Isometric Render Loop (paused when noRender is active)
  useEffect(() => {
    if (noRender) return;
    let animId = 0;
    let lastTime = performance.now();
    let lastMinimapTime = 0;

    let prevSeed = stateRef.current.semilla;
    let prevTick = stateRef.current.reloj.tick;

    const renderQueue: DrawableItem[] = [];

    const drawMinimap = (st: GameState, posMap: Map<string, RenderNpcState>, zoneKey: string) => {
      const mc = minimapCanvasRef.current;
      if (!mc) return;
      const mctx = mc.getContext('2d');
      if (!mctx) return;

      if (!minimapBgRef.current || minimapBgRef.current.key !== zoneKey) {
        minimapBgRef.current = {
          canvas: buildMinimapBgCanvas(st.mapaGrid, Object.values(st.zonas)),
          key: zoneKey,
        };
      }
      mctx.drawImage(minimapBgRef.current.canvas, 0, 0);

      // Roads on minimap
      for (const tramo of st.tramos ?? []) {
        if (!tramo.puntos || tramo.puntos.length < 2) continue;
        const p0 = worldToIso(tramo.puntos[0].wx, tramo.puntos[0].wy);
        const p1 = worldToIso(tramo.puntos[1].wx, tramo.puntos[1].wy);
        mctx.strokeStyle = !tramo.construida
          ? 'rgba(245,158,11,0.35)'
          : tramo.estado <= 0
          ? '#ef4444'
          : '#334155';
        mctx.lineWidth = tramo.construida ? 1.4 : 0.9;
        mctx.beginPath();
        mctx.moveTo(MINIMAP_W / 2 + p0.ix * MINIMAP_SCALE, MINIMAP_H / 2 + p0.iy * MINIMAP_SCALE);
        mctx.lineTo(MINIMAP_W / 2 + p1.ix * MINIMAP_SCALE, MINIMAP_H / 2 + p1.iy * MINIMAP_SCALE);
        mctx.stroke();
      }

      // NPCs
      const curLens = lensRef.current;
      const curDerived = derivedRef.current;
      for (const npc of st.npcs) {
        if (!npc.vivo) continue;
        const rp = posMap.get(npc.id);
        const wx = rp ? rp.x : npc.mapa.x;
        const wy = rp ? rp.y : npc.mapa.y;
        const iso = worldToIso(wx, wy);
        const mx = MINIMAP_W / 2 + iso.ix * MINIMAP_SCALE;
        const my = MINIMAP_H / 2 + iso.iy * MINIMAP_SCALE;
        mctx.fillStyle =
          npc.id === selectedIdRef.current
            ? '#ffffff'
            : evaluateNpcLensColor(npc, curLens, st, curDerived);
        mctx.fillRect(mx - 1, my - 1, 2.2, 2.2);
      }

      // Current Camera Viewport Box
      const { w, h } = viewportSizeRef.current;
      const cam = camRef.current;
      const halfW = (w / 2 / cam.zoom) * MINIMAP_SCALE;
      const halfH = (h / 2 / cam.zoom) * MINIMAP_SCALE;
      const cx = MINIMAP_W / 2 + cam.x * MINIMAP_SCALE;
      const cy = MINIMAP_H / 2 + cam.y * MINIMAP_SCALE;
      mctx.strokeStyle = '#ffffff';
      mctx.lineWidth = 1.4;
      mctx.strokeRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nowSec = now / 1000;

      // Keyboard WASD / Arrow camera pan
      const keys = keysHeldRef.current;
      if (keys.size > 0) {
        const panSpeed = (560 / camRef.current.zoom) * dt;
        if (keys.has('a') || keys.has('arrowleft')) camRef.current.targetX -= panSpeed;
        if (keys.has('d') || keys.has('arrowright')) camRef.current.targetX += panSpeed;
        if (keys.has('w') || keys.has('arrowup')) camRef.current.targetY -= panSpeed;
        if (keys.has('s') || keys.has('arrowdown')) camRef.current.targetY += panSpeed;
        camRef.current.targetX = clampCamX(camRef.current.targetX);
        camRef.current.targetY = clampCamY(camRef.current.targetY);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { w, h } = viewportSizeRef.current;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const pw = Math.max(1, Math.round(w * dpr));
          const ph = Math.max(1, Math.round(h * dpr));
          if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
          }

          const st = stateRef.current;
          const posMap = renderPositionsRef.current;

          if (st.semilla !== prevSeed || st.reloj.tick < prevTick) {
            posMap.clear();
            smokeRef.current.length = 0;
            bubblesRef.current.length = 0;
            seenContagionEventIdsRef.current.clear();
            nextBubbleAtRef.current = 0;
          }
          prevSeed = st.semilla;
          prevTick = st.reloj.tick;

          // Build per-frame lookup maps for houses, households, and firms
          const hogarById = new Map<string, Hogar>();
          for (const hItem of st.hogares) hogarById.set(hItem.id, hItem);
          const casaById = new Map<string, Casa>();
          for (const cItem of st.casas) casaById.set(cItem.id, cItem);
          const firmaById = new Map<string, Firma>();
          for (const fItem of st.firmas) firmaById.set(fItem.id, fItem);

          // 1. Interpolate NPC positions smoothly & prune dead NPCs
          let aliveCount = 0;
          for (const npc of st.npcs) {
            if (!npc.vivo) {
              posMap.delete(npc.id);
              continue;
            }
            aliveCount++;
            let r = posMap.get(npc.id);
            if (!r) {
              r = {
                x: npc.mapa.x,
                y: npc.mapa.y,
                walkPhase: Math.random() * 6,
                facingX: 1,
                skin: SKIN_TONES[hashIndex(npc.id, SKIN_TONES.length)],
                hair: HAIR_TONES[hashIndex(npc.id + 'h', HAIR_TONES.length)],
              };
              posMap.set(npc.id, r);
            }
            const dx = npc.mapa.x - r.x;
            const dy = npc.mapa.y - r.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.25) {
              const lerp = Math.min(1, dt * 8.5);
              r.x += dx * lerp;
              r.y += dy * lerp;
              r.walkPhase += dt * (8 + Math.min(8, dist * 0.45));
              r.facingX = dx - dy >= 0 ? 1 : -1;
            } else {
              r.x = npc.mapa.x;
              r.y = npc.mapa.y;
            }
          }
          if (posMap.size > aliveCount) {
            const liveIds = new Set<string>();
            for (const npc of st.npcs) {
              if (npc.vivo) liveIds.add(npc.id);
            }
            for (const id of posMap.keys()) {
              if (!liveIds.has(id)) posMap.delete(id);
            }
          }

          // 2. Smooth camera lerp & follow
          const cam = camRef.current;
          if (followRef.current && selectedIdRef.current) {
            const targetPos = posMap.get(selectedIdRef.current);
            if (targetPos) {
              const iso = worldToIso(targetPos.x, targetPos.y);
              cam.targetX = iso.ix;
              cam.targetY = iso.iy;
              if (cam.targetZoom < 1.25) cam.targetZoom = 1.35;
            }
          }
          cam.x += (cam.targetX - cam.x) * Math.min(1, dt * 9);
          cam.y += (cam.targetY - cam.y) * Math.min(1, dt * 9);
          cam.zoom += (cam.targetZoom - cam.zoom) * Math.min(1, dt * 9);

          // 3. Factory chimney smoke and speech bubbles
          if (!pausedRef.current) {

            if (Math.random() < 0.16 && smokeRef.current.length < 24) {
              const chimneys = st.parcelas
                .filter((p) => p.edificio?.estado === 'ocupada' && p.edificio.tipo === 'fabrica')
                .map((p) => ({ wx: p.wx + p.ww - 10, wy: p.wy + 10, z: 36 }));
              if (chimneys.length > 0) {
                const ch = chimneys[Math.floor(Math.random() * chimneys.length)];
                smokeRef.current.push({
                  wx: ch.wx,
                  wy: ch.wy,
                  z: ch.z,
                  r: 3.5 + Math.random() * 2,
                  alpha: 0.44,
                  vz: 14 + Math.random() * 8,
                  vx: 4 + Math.random() * 5,
                });
              }
            }

            for (const ev of st.eventosDiaActual) {
              if (
                ev.tipo === 'accion_inicio' &&
                ev.origen?.endsWith('/contagio') &&
                !seenContagionEventIdsRef.current.has(ev.id)
              ) {
                if (seenContagionEventIdsRef.current.size > 120) {
                  seenContagionEventIdsRef.current.clear();
                }
                seenContagionEventIdsRef.current.add(ev.id);
                const actionDef = ACTION_TABLE.find((a) => a.id === ev.accion);
                const actionLabel = actionDef?.nombre ?? ev.accion;
                const joinText = `Se suma: ${actionLabel}`;
                ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
                const bw = Math.min(185, ctx.measureText(joinText).width + 14);
                const batch = ev.npcIds.slice(0, 5).map((npcId) => ({
                  npcId,
                  text: joinText,
                  width: bw,
                  expiresAt: nowSec + 3.6,
                }));
                const batchIds = new Set(batch.map((b) => b.npcId));
                bubblesRef.current = [
                  ...bubblesRef.current
                    .filter((b) => b.expiresAt > nowSec && !batchIds.has(b.npcId))
                    .slice(-3),
                  ...batch,
                ];
              }
            }

            if (nowSec > nextBubbleAtRef.current) {
              nextBubbleAtRef.current = nowSec + 2.8 + Math.random() * 2;
              const vivos = st.npcs.filter((n) => n.vivo);
              if (vivos.length > 0) {
                const prioritized = vivos.filter(
                  (n) => n.accionIa || n.variables.hambre > 72 || n.variables.miedo > 60
                );
                const pool = prioritized.length > 0 && Math.random() < 0.65 ? prioritized : vivos;
                const chosen = pool[Math.floor(Math.random() * pool.length)];
                const text = evaluateNpcBubbleText(chosen);
                ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
                const bw = Math.min(170, ctx.measureText(text).width + 14);
                bubblesRef.current = [
                  ...bubblesRef.current
                    .filter((b) => b.expiresAt > nowSec && b.npcId !== chosen.id)
                    .slice(-5),
                  { npcId: chosen.id, text, width: bw, expiresAt: nowSec + 3.4 },
                ];
              }
            }
          }

          bubblesRef.current = bubblesRef.current.filter((b) => b.expiresAt > nowSec);
          smokeRef.current = smokeRef.current
            .map((p) => ({
              ...p,
              wx: p.wx + p.vx * dt,
              z: p.z + p.vz * dt,
              r: p.r + 3.5 * dt,
              alpha: p.alpha - 0.18 * dt,
            }))
            .filter((p) => p.alpha > 0.02);

          // 4. Climate & Day Phase
          const activeFens = st.clima.fenomenos.filter(
            (f) => st.reloj.dia >= f.inicioDia && st.reloj.dia < f.inicioDia + f.duracionDias
          );
          const hasDrought = activeFens.some((f) => f.tipo === 'sequia');
          const hasPlague = activeFens.some((f) => f.tipo === 'plaga');
          const hasZombie = activeFens.some((f) => f.tipo === 'plaga_zombie');

          const dayPhase = (st.reloj.tick % TICKS_PER_DAY) / TICKS_PER_DAY;
          const duskAmount =
            dayPhase > 0.72 ? Math.sin(((dayPhase - 0.72) / 0.28) * Math.PI) * 0.45 : 0;

          const zoneList = Object.values(st.zonas);
          const zoneStateKey = zoneList.map((z) => `${z.id}:${z.estado}`).join('|');
          const gridKey = st.mapaGrid
            ? `${st.mapaGrid.ancho}x${st.mapaGrid.alto}:${st.mapaGrid.terreno[0]?.slice(0, 8) ?? ''}:${st.mapaGrid.altura?.[0]?.slice(0, 8) ?? ''}`
            : 'nogrid';
          const terrainKey = `${st.semilla}_${gridKey}_${hasDrought ? 1 : 0}_${hasPlague ? 1 : 0}_${zoneStateKey}`;
          if (!terrainCacheRef.current || terrainCacheRef.current.key !== terrainKey) {
            terrainCacheRef.current = {
              canvas: buildStaticTerrainCanvas(st.mapaGrid, zoneList, hasDrought, hasPlague, st.semilla),
              key: terrainKey,
            };
          }

          // 5. Render Frame
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = hasDrought ? '#cabf95' : '#6fa350';
          ctx.fillRect(0, 0, w, h);

          const viewHalfW = w / 2 / cam.zoom;
          const viewHalfH = h / 2 / cam.zoom;
          const margin = 180;
          const minIx = cam.x - viewHalfW - margin;
          const maxIx = cam.x + viewHalfW + margin;
          const minIy = cam.y - viewHalfH - margin;
          const maxIy = cam.y + viewHalfH + margin;

          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(cam.zoom, cam.zoom);
          ctx.translate(-cam.x, -cam.y);

          // Blit visible slice of pre-rendered terrain
          const srcX = Math.max(0, Math.floor(cam.x - viewHalfW + TERRAIN_CX - 4));
          const srcY = Math.max(0, Math.floor(cam.y - viewHalfH + TERRAIN_CY - 4));
          const srcRight = Math.min(TERRAIN_W, Math.ceil(cam.x + viewHalfW + TERRAIN_CX + 4));
          const srcBottom = Math.min(TERRAIN_H, Math.ceil(cam.y + viewHalfH + TERRAIN_CY + 4));
          const srcW = srcRight - srcX;
          const srcH = srcBottom - srcY;
          if (srcW > 0 && srcH > 0) {
            ctx.drawImage(
              terrainCacheRef.current.canvas,
              srcX,
              srcY,
              srcW,
              srcH,
              srcX - TERRAIN_CX,
              srcY - TERRAIN_CY,
              srcW,
              srcH
            );
          }

          // Dynamic Road Network (V2 tramos)
          const preview = hoveredPreviewRef.current;
          for (const tramo of st.tramos ?? []) {
            if (!tramo.puntos || tramo.puntos.length < 2) continue;
            const p0 = worldToIso(tramo.puntos[0].wx, tramo.puntos[0].wy);
            const p1 = worldToIso(tramo.puntos[1].wx, tramo.puntos[1].wy);
            const isSelTramo = selectedTramoIdRef.current === tramo.id;
            const isHovTramo =
              hoveredTramoIdRef.current === tramo.id || preview?.tramoId === tramo.id;
            const connectable = !tramo.construida && !tramo.enObra && isViaConnectableToNetwork(st, tramo);
            const baseW = tramo.tipo === 'puente' ? 16 : tramo.tipo === 'camino' ? 12 : 9;

            ctx.save();
            ctx.lineCap = 'round';
            if (tramo.construida) {
              // Road shoulder
              ctx.strokeStyle = tramo.tipo === 'puente' ? '#cbd5e1' : '#94a3b8';
              ctx.lineWidth = baseW + 4;
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();

              // Road surface
              ctx.strokeStyle =
                tramo.estado <= 0
                  ? '#7f1d1d'
                  : tramo.estado < 50
                  ? '#57534e'
                  : '#334155';
              ctx.lineWidth = baseW;
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();

              // Center stripes or cut indicator
              ctx.strokeStyle =
                tramo.estado <= 0
                  ? '#fca5a5'
                  : tramo.estado < 50
                  ? '#fbbf24'
                  : '#e2e8f0';
              ctx.lineWidth = 1.4;
              ctx.setLineDash([8, 8]);
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();
              ctx.setLineDash([]);
            } else if (tramo.enObra) {
              ctx.strokeStyle = '#d97706';
              ctx.lineWidth = baseW;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();
              ctx.setLineDash([]);
            } else {
              ctx.strokeStyle =
                isHovTramo || isSelTramo
                  ? 'rgba(20, 184, 166, 0.85)'
                  : connectable
                  ? 'rgba(245, 158, 11, 0.45)'
                  : 'rgba(148, 163, 184, 0.22)';
              ctx.lineWidth = isHovTramo || isSelTramo ? baseW : 5;
              ctx.setLineDash([6, 6]);
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            if (isSelTramo || isHovTramo) {
              ctx.strokeStyle = isSelTramo ? '#14b8a6' : '#38bdf8';
              ctx.lineWidth = baseW + 8;
              ctx.globalAlpha = 0.35;
              ctx.beginPath();
              ctx.moveTo(p0.ix, p0.iy);
              ctx.lineTo(p1.ix, p1.iy);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // Road status badge at midpoint if in obra, cut, bad condition, or hovered connectable
            const midX = (p0.ix + p1.ix) / 2;
            const midY = (p0.iy + p1.iy) / 2;
            let roadTag: { text: string; bg: string; fg: string } | null = null;
            if (tramo.enObra) {
              roadTag = { text: `OBRA · ${tramo.diasObraRestantes}d`, bg: '#78350f', fg: '#fde68a' };
            } else if (tramo.construida && tramo.estado <= 0) {
              roadTag = { text: 'CORTADA', bg: '#991b1b', fg: '#fee2e2' };
            } else if (tramo.construida && tramo.estado < 50) {
              roadTag = { text: `VÍA ${Math.round(tramo.estado)}%`, bg: '#92400e', fg: '#fef3c7' };
            } else if ((isHovTramo || isSelTramo) && connectable) {
              roadTag = { text: `CONECTAR $${tramo.costoObra}`, bg: '#065f46', fg: '#ecfdf5' };
            }

            if (roadTag && midX >= minIx && midX <= maxIx && midY >= minIy && midY <= maxIy) {
              const tw = roadTag.text.length * 5.2 + 12;
              ctx.fillStyle = roadTag.bg;
              ctx.beginPath();
              ctx.roundRect(midX - tw / 2, midY - 8, tw, 15, 4);
              ctx.fill();
              ctx.fillStyle = roadTag.fg;
              ctx.font = '700 7.5px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(roadTag.text, midX, midY + 2);
              ctx.textAlign = 'start';
            }
            ctx.restore();
          }

          // Hover Zone Preview Highlight from HUD tables
          if (preview?.zona) {
            const pzr = st.zonas[preview.zona]?.rect;
            if (pzr) {
              ctx.save();
              isoQuadPath(ctx, pzr.wx, pzr.wy, pzr.ww, pzr.wh);
              ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
              ctx.fill();
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 3;
              ctx.setLineDash([8, 5]);
              ctx.stroke();
              ctx.restore();
            }
          }

          // Selected Zone Highlight
          const selZonaId = selectedZonaIdRef.current;
          if (selZonaId && st.zonas[selZonaId]?.rect) {
            const szr = st.zonas[selZonaId].rect!;
            ctx.save();
            isoQuadPath(ctx, szr.wx, szr.wy, szr.ww, szr.wh);
            ctx.fillStyle = 'rgba(20, 184, 166, 0.1)';
            ctx.fill();
            ctx.strokeStyle = '#14b8a6';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 6]);
            ctx.stroke();
            ctx.restore();
          }

          // Zone Lens Overlay (defensa / orden / integridad / amenaza / alquiler / firmas / vias)
          const activeLens = lensRef.current;
          if (
            activeLens === 'defensa' ||
            activeLens === 'orden' ||
            activeLens === 'integridad' ||
            activeLens === 'amenaza' ||
            activeLens === 'alquiler' ||
            activeLens === 'firmas' ||
            activeLens === 'vias'
          ) {
            const curDerived = derivedRef.current;
            const zoneKeys = getWorldZones(st);
            ctx.save();
            for (const zk of zoneKeys) {
              const zr = st.zonas[zk]?.rect;
              if (!zr) continue;
              let strokeCol = '#10b981';
              let labelText = '';
              if (activeLens === 'alquiler') {
                const rent = st.ultimaSalidaEconomica?.alquilerMedio?.[zk] ?? 0;
                strokeCol = rent > 22 ? '#ef4444' : rent > 14 ? '#f59e0b' : '#10b981';
                labelText = `${zk.toUpperCase()} $${rent.toFixed(1)}`;
              } else if (activeLens === 'firmas') {
                const zFirms = st.firmas.filter((f) => f.activa && f.zona === zk).length;
                strokeCol = zFirms >= 4 ? '#f59e0b' : zFirms >= 1 ? '#10b981' : '#64748b';
                labelText = `${zk.toUpperCase()} ${zFirms} fir.`;
              } else if (activeLens === 'vias') {
                const zTramos = st.tramos.filter((t) => t.construida && (t.zonaA === zk || t.zonaB === zk));
                const avgV =
                  zTramos.length > 0
                    ? zTramos.reduce((s, t) => s + t.estado, 0) / zTramos.length
                    : 100;
                strokeCol = avgV >= 70 ? '#10b981' : avgV >= 40 ? '#f59e0b' : '#ef4444';
                labelText = `${zk.toUpperCase()} vía ${Math.round(avgV)}%`;
              } else {
                const val =
                  activeLens === 'defensa'
                    ? curDerived.defensa[zk] ?? 0
                    : activeLens === 'orden'
                    ? curDerived.orden?.[zk] ?? 0
                    : activeLens === 'integridad'
                    ? st.gobierno.integridad?.[zk] ?? 100
                    : curDerived.amenazaPercibida[zk] ?? 0;
                strokeCol = evaluateZoneMetricColor(activeLens, val);
                labelText = `${zk.toUpperCase()} ${Math.round(val)}%`;
              }

              isoQuadPath(ctx, zr.wx, zr.wy, zr.ww, zr.wh);
              ctx.globalAlpha = 0.16;
              ctx.fillStyle = strokeCol;
              ctx.fill();
              ctx.globalAlpha = 0.72;
              ctx.strokeStyle = strokeCol;
              ctx.lineWidth = 2.4;
              ctx.stroke();

              const lblPos = worldToIso(zr.wx + zr.ww * 0.5, zr.wy + zr.wh * 0.5);
              ctx.globalAlpha = 0.92;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              ctx.beginPath();
              ctx.roundRect(lblPos.ix - 56, lblPos.iy - 11, 112, 20, 4);
              ctx.fill();
              ctx.fillStyle = '#f8fafc';
              ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(labelText, lblPos.ix, lblPos.iy + 2.5);
              ctx.textAlign = 'start';
            }
            ctx.restore();
          }

          // Lectura Indicator Zone Heatmap Overlay (from Tema panel)
          const heatId = lecturaHeatRef.current;
          if (heatId && st.lectura?.indicadores[heatId]) {
            const heatInd = st.lectura.indicadores[heatId];
            const zoneKeys = getWorldZones(st);
            const vals = zoneKeys.map((zk) => {
              const s = heatInd.seriesPorZona[zk];
              return s && s.length > 0 ? s[s.length - 1] : heatInd.valor;
            });
            const minV = Math.min(...vals);
            const maxV = Math.max(...vals);
            const higherGood = heatId !== 'vivienda' && heatId !== 'empleo';
            ctx.save();
            zoneKeys.forEach((zk, idx) => {
              const zr = st.zonas[zk]?.rect;
              if (!zr) return;
              const val = vals[idx];
              const ratio = maxV > minV ? (val - minV) / (maxV - minV) : 0.5;
              const goodRatio = higherGood ? ratio : 1 - ratio;
              const heatCol = goodRatio >= 0.65 ? '#10b981' : goodRatio >= 0.35 ? '#f59e0b' : '#ef4444';
              isoQuadPath(ctx, zr.wx, zr.wy, zr.ww, zr.wh);
              ctx.globalAlpha = 0.2;
              ctx.fillStyle = heatCol;
              ctx.fill();
              ctx.globalAlpha = 0.78;
              ctx.strokeStyle = heatCol;
              ctx.lineWidth = 2.4;
              ctx.stroke();

              const lblPos = worldToIso(zr.wx + zr.ww * 0.5, zr.wy + zr.wh * 0.5);
              ctx.globalAlpha = 0.92;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
              ctx.beginPath();
              ctx.roundRect(lblPos.ix - 56, lblPos.iy - 11, 112, 20, 4);
              ctx.fill();
              ctx.fillStyle = '#f8fafc';
              ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`${zk.toUpperCase()} · ${val}`, lblPos.ix, lblPos.iy + 2.5);
              ctx.textAlign = 'start';
            });
            ctx.restore();
          }

          // Interactive Parcel Footprints (libre / sin_calle / hovered / selected)
          for (const p of st.parcelas) {
            const isSel = selectedParcelaIdRef.current === p.id;
            const isHov = hoveredParcelaIdRef.current === p.id || preview?.parcelaId === p.id;
            if (
              p.estado === 'libre' ||
              p.estado === 'sin_calle' ||
              isSel ||
              isHov
            ) {
              ctx.save();
              isoQuadPath(ctx, p.wx, p.wy, p.ww, p.wh);
              if (p.estado === 'sin_calle') {
                ctx.fillStyle = isHov || isSel ? 'rgba(245, 158, 11, 0.22)' : 'rgba(71, 85, 105, 0.22)';
                ctx.fill();
                // Diagonal hatch inside sin_calle lot
                ctx.save();
                ctx.clip();
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                ctx.lineWidth = 1;
                for (let hx = 8; hx < p.ww + p.wh; hx += 10) {
                  const a = worldToIso(p.wx + Math.min(hx, p.ww), p.wy + Math.max(0, hx - p.ww));
                  const b = worldToIso(p.wx + Math.max(0, hx - p.wh), p.wy + Math.min(hx, p.wh));
                  ctx.beginPath();
                  ctx.moveTo(a.ix, a.iy);
                  ctx.lineTo(b.ix, b.iy);
                  ctx.stroke();
                }
                ctx.restore();
                isoQuadPath(ctx, p.wx, p.wy, p.ww, p.wh);
                ctx.strokeStyle = isSel ? '#14b8a6' : isHov ? '#fbbf24' : 'rgba(148, 163, 184, 0.5)';
                ctx.lineWidth = isSel || isHov ? 2.2 : 1.1;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
              } else if (p.estado === 'libre') {
                ctx.fillStyle = isSel || isHov ? 'rgba(20,184,166,0.24)' : 'rgba(16,185,129,0.12)';
                ctx.fill();
                ctx.strokeStyle = isSel ? '#14b8a6' : isHov ? '#38bdf8' : '#10b981';
                ctx.lineWidth = isSel || isHov ? 2.6 : 1.5;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
              } else if (isSel || isHov) {
                ctx.fillStyle = 'rgba(20,184,166,0.16)';
                ctx.fill();
                ctx.strokeStyle = isSel ? '#14b8a6' : '#38bdf8';
                ctx.lineWidth = 2.6;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
              }
              ctx.restore();
            }
          }

          // 6. Populate Frustum-Culled Painter's Algorithm Queue
          renderQueue.length = 0;

          const pushItem = (wx: number, wy: number, draw: (c: CanvasRenderingContext2D) => void) => {
            const p = worldToIso(wx, wy);
            if (p.ix < minIx || p.ix > maxIx || p.iy < minIy || p.iy > maxIy) return;
            renderQueue.push({ kind: 'fn', depth: wx + wy, draw });
          };

          // Active Role & Hospital Lookup for Status Badges
          const activeRoleCounts: Partial<Record<RoleId, number>> = Object.create(null);
          for (const n of st.npcs) {
            if (n.vivo && !n.hospital.internado && !n.accionIa?.fueraDePuesto) {
              activeRoleCounts[n.rol] = (activeRoleCounts[n.rol] ?? 0) + 1;
            }
          }
          const medicosActivosFrame = activeRoleCounts.medico ?? 0;
          const hospInfoFrame = computeHospitalFacilities(st, medicosActivosFrame);
          const hospFacilityById = new Map<string, HospitalFacilityInfo>();
          for (const f of hospInfoFrame.facilities) {
            hospFacilityById.set(f.edificioId, f);
          }
          const hospParcelaOrder = st.parcelas
            .filter(
              (p) =>
                p.edificio?.estado === 'ocupada' && p.edificio.activo && p.edificio.tipo === 'hospital'
            )
            .sort((a, b) => a.orden - b.orden);
          const sinComidaFrame = st.alimento.stock <= 0.1;

          // Dynamic Parcels & Buildings from V2 state.parcelas
          for (const parcel of st.parcelas) {
            const cx = parcel.wx + parcel.ww * 0.5;
            const cy = parcel.wy + parcel.wh * 0.5;
            pushItem(cx, cy, (c) => {
              const center = worldToIso(cx, cy);
              if (parcel.estado === 'sin_calle') {
                if (cam.zoom >= 0.72 || hoveredParcelaIdRef.current === parcel.id) {
                  c.fillStyle = 'rgba(30, 41, 59, 0.76)';
                  c.beginPath();
                  c.roundRect(center.ix - 23, center.iy - 8, 46, 15, 4);
                  c.fill();
                  c.fillStyle = '#cbd5e1';
                  c.font = '600 7.5px "Plus Jakarta Sans", sans-serif';
                  c.textAlign = 'center';
                  c.fillText('SIN VÍA', center.ix, center.iy + 2);
                  c.textAlign = 'start';
                }
                return;
              }

              if (parcel.estado === 'libre') {
                c.fillStyle = 'rgba(6, 78, 59, 0.82)';
                c.beginPath();
                c.roundRect(center.ix - 22, center.iy - 8, 44, 15, 4);
                c.fill();
                c.strokeStyle = '#10b981';
                c.lineWidth = 1;
                c.stroke();
                c.fillStyle = '#ecfdf5';
                c.font = '700 8px "Plus Jakarta Sans", sans-serif';
                c.textAlign = 'center';
                c.fillText('+ SOLAR', center.ix, center.iy + 2);
                c.textAlign = 'start';
                return;
              }

              const bld = parcel.edificio;
              if (!bld) return;

              const bx = parcel.wx + 4;
              const by = parcel.wy + 4;
              const bw = Math.max(20, parcel.ww - 8);
              const bh = Math.max(16, parcel.wh - 8);

              if (bld.estado === 'en_obra') {
                drawIsoBox(c, bx, by, bw, bh, 14, '#d97706', '#78350f', '#92400e');
                const pctDone =
                  bld.diasObraTotal > 0
                    ? Math.max(0.05, Math.min(1, (bld.diasObraTotal - bld.diasObraRestantes) / bld.diasObraTotal))
                    : 0.5;
                c.fillStyle = 'rgba(15, 23, 42, 0.9)';
                c.beginPath();
                c.roundRect(center.ix - 30, center.iy - 31, 60, 19, 4);
                c.fill();
                c.fillStyle = '#fde68a';
                c.font = '700 7.5px "Plus Jakarta Sans", sans-serif';
                c.textAlign = 'center';
                c.fillText(`OBRA · ${bld.diasObraRestantes}d`, center.ix, center.iy - 20);
                c.textAlign = 'start';
                c.fillStyle = '#1e293b';
                c.fillRect(center.ix - 24, center.iy - 16, 48, 2.5);
                c.fillStyle = '#10b981';
                c.fillRect(center.ix - 24, center.iy - 16, 48 * pctDone, 2.5);
                return;
              }

              const casa = bld.casaId ? casaById.get(bld.casaId) : undefined;
              drawParcelBuilding(
                c,
                bld.tipo,
                parcel,
                bx,
                by,
                bw,
                bh,
                center,
                duskAmount,
                nowSec,
                casa,
                st.gobierno.finanzas.impago
              );

              // Operational status badge
              const fac = hospFacilityById.get(bld.id);
              const bDef = BUILDING_CATALOG[bld.tipo];
              const firma = bld.firmaId ? firmaById.get(bld.firmaId) : undefined;
              let statusTag: { text: string; bg: string; fg: string } | null = null;

              if (bld.tipo === 'hospital') {
                const hIdx = hospParcelaOrder.findIndex((p) => p.id === parcel.id);
                const hLen = Math.max(1, hospParcelaOrder.length);
                const docsHere =
                  Math.floor(medicosActivosFrame / hLen) +
                  (hIdx >= 0 && hIdx < medicosActivosFrame % hLen ? 1 : 0);
                if (docsHere === 0) {
                  statusTag = { text: 'SIN PERSONAL', bg: '#991b1b', fg: '#fee2e2' };
                } else if (fac && fac.beds > 0 && fac.occupied >= fac.beds) {
                  statusTag = { text: 'LLENO', bg: '#b45309', fg: '#fef3c7' };
                }
              } else if (bld.tipo === 'hospital_campana') {
                if (fac && fac.beds > 0 && fac.occupied >= fac.beds) {
                  statusTag = { text: 'LLENO', bg: '#b45309', fg: '#fef3c7' };
                }
              } else if (bld.tipo === 'comisaria' && (activeRoleCounts.policia ?? 0) === 0) {
                statusTag = { text: 'SIN PERSONAL', bg: '#991b1b', fg: '#fee2e2' };
              } else if (
                (bld.tipo === 'escuela' || bld.tipo === 'universidad') &&
                (activeRoleCounts.docente ?? 0) === 0
              ) {
                statusTag = { text: 'SIN PERSONAL', bg: '#991b1b', fg: '#fee2e2' };
              } else if (bld.tipo === 'oficina_publica' && (activeRoleCounts.estatal ?? 0) === 0) {
                statusTag = { text: 'SIN PERSONAL', bg: '#991b1b', fg: '#fee2e2' };
              } else if (bDef.categoria === 'vivienda' && casa) {
                if (casa.estado < 45) {
                  statusTag = { text: 'DETERIORO', bg: '#92400e', fg: '#fef3c7' };
                }
              } else if (bDef.categoria === 'privado' && firma) {
                if (firma.empleados.length === 0) {
                  statusTag = { text: 'SIN PERSONAL', bg: '#991b1b', fg: '#fee2e2' };
                } else if (bDef.vendeComida && sinComidaFrame) {
                  statusTag = { text: 'SIN COMIDA', bg: '#991b1b', fg: '#fee2e2' };
                } else if (firma.factor < 0.96) {
                  statusTag = { text: 'RECORTANDO', bg: '#b45309', fg: '#fef3c7' };
                }
              }

              if (statusTag) {
                const tagW = statusTag.text.length * 5.0 + 10;
                const tagY = center.iy - 42;
                c.fillStyle = statusTag.bg;
                c.beginPath();
                c.roundRect(center.ix - tagW / 2, tagY, tagW, 13, 4);
                c.fill();
                c.fillStyle = statusTag.fg;
                c.font = '700 7px "Plus Jakarta Sans", sans-serif';
                c.textAlign = 'center';
                c.fillText(statusTag.text, center.ix, tagY + 9);
                c.textAlign = 'start';
              }
            });
          }

          // Isometric NPCs
          const curLens = lensRef.current;
          const curDerived = derivedRef.current;
          const curFilter = filterRef.current;
          for (const npc of st.npcs) {
            if (!npc.vivo) continue;
            const rp = posMap.get(npc.id);
            if (!rp) continue;
            const p = worldToIso(rp.x, rp.y);
            if (p.ix < minIx || p.ix > maxIx || p.iy < minIy || p.iy > maxIy) continue;
            renderQueue.push({
              kind: 'npc',
              depth: rp.x + rp.y,
              ix: p.ix,
              iy: p.iy,
              npc,
              rp,
            });
          }

          // Execute Painter's Sort (back to front)
          renderQueue.sort((a, b) => a.depth - b.depth);
          const curSelectedId = selectedIdRef.current;
          const isSimPaused = pausedRef.current;
          const notableMap = new Map((st.lectura?.notables ?? []).map((n) => [n.npcId, n.tipo]));
          for (let i = 0; i < renderQueue.length; i++) {
            const item = renderQueue[i];
            if (item.kind === 'npc') {
              const n = item.npc;
              let isVisible = true;
              if (curFilter === 'acciones') isVisible = Boolean(n.accionIa);
              else if (curFilter === 'descontentos') isVisible = n.variables.satisfaccion < 30;
              else if (curFilter === 'hambre') isVisible = n.variables.hambre > 80;
              else if (curFilter === 'calle') isVisible = hogarById.get(n.hogarId)?.estado === 'calle';

              drawIsoNpc(
                ctx,
                item.ix,
                item.iy,
                n,
                item.rp,
                st,
                curLens,
                curDerived,
                curSelectedId,
                isSimPaused,
                isVisible,
                nowSec,
                notableMap.get(n.id)
              );
            } else {
              item.draw(ctx);
            }
          }

          // Factory Smoke
          for (const sm of smokeRef.current) {
            const p = worldToIso(sm.wx, sm.wy);
            ctx.fillStyle = `rgba(226, 232, 240, ${sm.alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(p.ix, p.iy - sm.z, sm.r, 0, Math.PI * 2);
            ctx.fill();
          }

          // Speech Bubbles
          for (const b of bubblesRef.current) {
            if (b.npcId === selectedIdRef.current) continue;
            const rp = posMap.get(b.npcId);
            if (!rp) continue;
            const p = worldToIso(rp.x, rp.y);
            if (p.ix < minIx || p.ix > maxIx || p.iy < minIy || p.iy > maxIy) continue;
            const fade = Math.min(1, (b.expiresAt - nowSec) * 1.6);
            ctx.save();
            ctx.globalAlpha = fade * 0.95;
            const bx = p.ix - b.width / 2;
            const by = p.iy - 42;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            ctx.beginPath();
            ctx.roundRect(bx, by, b.width, 18, 5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#0f172a';
            ctx.font = '600 9.5px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(b.text, bx + 7, by + 12, b.width - 12);
            ctx.restore();
          }

          // Selected NPC nameplate
          if (selectedIdRef.current) {
            const selNpc = st.npcs.find((n) => n.id === selectedIdRef.current && n.vivo);
            if (selNpc) {
              const rp = posMap.get(selNpc.id);
              const p = worldToIso(rp ? rp.x : selNpc.mapa.x, rp ? rp.y : selNpc.mapa.y);
              const label = `${selNpc.nombre} · ${
                selNpc.accionIa ? selNpc.accionIa.nombre : selNpc.mapa.accion
              }`;
              ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
              const tw = Math.min(220, ctx.measureText(label).width + 16);
              const bx = p.ix - tw / 2;
              const by = p.iy - 48;
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.roundRect(bx, by, tw, 20, 5);
              ctx.fill();
              ctx.strokeStyle = '#14b8a6';
              ctx.lineWidth = 1.4;
              ctx.stroke();
              ctx.fillStyle = '#f8fafc';
              ctx.fillText(label, bx + 8, by + 13.5, tw - 14);
            }
          }

          // Climate / Zombie edge aura & origin indicator
          if (hasZombie) {
            const zombieFen = activeFens.find((f) => f.tipo === 'plaga_zombie');
            for (let z = 0; z < 12; z++) {
              const angle = nowSec * 0.2 + z * ((Math.PI * 2) / 12);
              const zwx = 780 + Math.cos(angle) * 760 + Math.sin(nowSec * 2 + z) * 18;
              const zwy = 490 + Math.sin(angle) * 480 + Math.cos(nowSec * 2 + z) * 18;
              const p = worldToIso(zwx, zwy);
              ctx.fillStyle = 'rgba(136, 19, 55, 0.78)';
              ctx.beginPath();
              ctx.arc(p.ix, p.iy - 5, 5.5, 0, Math.PI * 2);
              ctx.fill();
            }
            if (zombieFen?.origen) {
              const zr = st.zonas[zombieFen.origen]?.rect ?? st.zonas.este?.rect;
              if (zr) {
                const ip = worldToIso(zr.wx + zr.ww * 0.5, zr.wy + zr.wh * 0.5);
                ctx.fillStyle = 'rgba(190, 18, 60, 0.9)';
                ctx.beginPath();
                ctx.roundRect(ip.ix - 60, ip.iy - 14, 120, 22, 4);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`ORIGEN: ${zombieFen.origen.toUpperCase()}`, ip.ix, ip.iy + 0.5);
                ctx.textAlign = 'start';
              }
            }
          }

          ctx.restore();

          if (duskAmount > 0.05) {
            ctx.fillStyle = `rgba(30, 27, 75, ${(duskAmount * 0.22).toFixed(2)})`;
            ctx.fillRect(0, 0, w, h);
          }

          if (now - lastMinimapTime > 80) {
            lastMinimapTime = now;
            drawMinimap(st, posMap, zoneStateKey);
          }
        }
      }

      animId = window.requestAnimationFrame(frame);
    };

    animId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(animId);
    };
  }, [noRender]);

  // Dispose offscreen caches only on component unmount
  useEffect(() => {
    return () => {
      keysHeldRef.current.clear();
      renderPositionsRef.current.clear();
      smokeRef.current.length = 0;
      bubblesRef.current.length = 0;
      seenContagionEventIdsRef.current.clear();
      if (terrainCacheRef.current) {
        terrainCacheRef.current.canvas.width = 0;
        terrainCacheRef.current.canvas.height = 0;
        terrainCacheRef.current = null;
      }
      if (minimapBgRef.current) {
        minimapBgRef.current.canvas.width = 0;
        minimapBgRef.current.canvas.height = 0;
        minimapBgRef.current = null;
      }
    };
  }, []);

  const findNearestNpc = (ix: number, iy: number): Npc | null => {
    let best: Npc | null = null;
    let bestDist = 20 / camRef.current.zoom;
    const posMap = renderPositionsRef.current;
    for (const npc of stateRef.current.npcs) {
      if (!npc.vivo) continue;
      const rp = posMap.get(npc.id);
      const p = worldToIso(rp ? rp.x : npc.mapa.x, rp ? rp.y : npc.mapa.y);
      const d = Math.hypot(p.ix - ix, p.iy - 8 - iy);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  };

  const findParcelaAt = (ix: number, iy: number): Parcela | null => {
    const sorted = [...stateRef.current.parcelas].sort((a, b) => b.wx + b.wy - (a.wx + a.wy));
    for (const p of sorted) {
      const zOffsets = p.estado === 'ocupada' ? [14, 0] : [0];
      for (const zOff of zOffsets) {
        const wCoords = isoToWorld(ix, iy + zOff);
        if (
          wCoords.wx >= p.wx &&
          wCoords.wx <= p.wx + p.ww &&
          wCoords.wy >= p.wy &&
          wCoords.wy <= p.wy + p.wh
        ) {
          return p;
        }
      }
    }
    return null;
  };

  const findTramoAt = (ix: number, iy: number): ViaTramo | null => {
    const threshold = 14 / camRef.current.zoom;
    let best: ViaTramo | null = null;
    let bestDist = threshold;
    for (const tramo of stateRef.current.tramos ?? []) {
      if (!tramo.puntos || tramo.puntos.length < 2) continue;
      const p0 = worldToIso(tramo.puntos[0].wx, tramo.puntos[0].wy);
      const p1 = worldToIso(tramo.puntos[1].wx, tramo.puntos[1].wy);
      const dist = pointToSegmentDist(ix, iy, p0.ix, p0.iy, p1.ix, p1.iy);
      if (dist < bestDist) {
        bestDist = dist;
        best = tramo;
      }
    }
    return best;
  };

  const findZoneAt = (ix: number, iy: number): ZoneDefinition | null => {
    const wCoords = isoToWorld(ix, iy);
    for (const z of Object.values(stateRef.current.zonas)) {
      const r = z.rect;
      if (!r) continue;
      if (
        wCoords.wx >= r.wx &&
        wCoords.wx <= r.wx + r.ww &&
        wCoords.wy >= r.wy &&
        wCoords.wy <= r.wy + r.wh
      ) {
        return z;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origCamX: camRef.current.targetX,
      origCamY: camRef.current.targetY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragRef.current.moved = true;
        onCancelFollow();
        camRef.current.targetX = clampCamX(dragRef.current.origCamX - dx / camRef.current.zoom);
        camRef.current.targetY = clampCamY(dragRef.current.origCamY - dy / camRef.current.zoom);
        if (hoveredKeyRef.current !== null) {
          hoveredKeyRef.current = null;
          hoveredParcelaIdRef.current = null;
          hoveredTramoIdRef.current = null;
          setHoverTooltipData(null);
          onHoverInfoRef.current?.(null);
        }
        return;
      }
    }

    const coords = screenToIso(e.clientX, e.clientY);
    if (!coords) return;

    if (tooltipDivRef.current) {
      const tx = Math.min(coords.sx + 16, viewportSizeRef.current.w - 256);
      const ty = Math.max(coords.sy - 68, 66);
      tooltipDivRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }

    const npc = findNearestNpc(coords.ix, coords.iy);
    if (npc) {
      const nextKey = `npc:${npc.id}`;
      if (hoveredKeyRef.current !== nextKey) {
        hoveredKeyRef.current = nextKey;
        hoveredParcelaIdRef.current = null;
        hoveredTramoIdRef.current = null;
        const subtitle = npc.accionIa ? npc.accionIa.nombre : npc.mapa.accion;
        setHoverTooltipData({
          kind: 'npc',
          title: `${npc.nombre} · ${ROLE_CATALOG[npc.rol].nombre}`,
          subtitle,
          detail: `Sat ${Math.round(npc.variables.satisfaccion)}% · Ham ${Math.round(npc.variables.hambre)}%`,
        });
        onHoverInfoRef.current?.(`${npc.nombre} (${ROLE_CATALOG[npc.rol].nombre}) — ${subtitle}`);
      }
      return;
    }

    const parcela = findParcelaAt(coords.ix, coords.iy);
    if (parcela) {
      const b = parcela.edificio;
      const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
      const nextKey = `parcela:${parcela.id}:${parcela.estado}:${b?.tipo ?? ''}:${b?.diasObraRestantes ?? 0}`;
      if (hoveredKeyRef.current !== nextKey) {
        hoveredKeyRef.current = nextKey;
        hoveredParcelaIdRef.current = parcela.id;
        hoveredTramoIdRef.current = null;
        const zName = stateRef.current.zonas[parcela.zona]?.nombre ?? parcela.zona;
        const subtitle =
          parcela.estado === 'sin_calle'
            ? `Parcela sin vía · ${zName}`
            : parcela.estado === 'libre'
            ? `Parcela libre (${parcela.tipoParcela}) · ${zName}`
            : parcela.estado === 'en_obra' && bDef && b
            ? `En obra: ${bDef.nombre} (${b.diasObraRestantes}d)`
            : bDef
            ? `${bDef.nombre} · ${zName}`
            : zName;
        const detail =
          parcela.estado === 'sin_calle'
            ? 'Requiere conectar vía pública'
            : parcela.estado === 'libre'
            ? 'Clic para construir obra'
            : 'Clic para inspeccionar';
        setHoverTooltipData({
          kind: 'parcela',
          title: parcela.nombre,
          subtitle,
          detail,
        });
        onHoverInfoRef.current?.(`${parcela.nombre} — ${subtitle}`);
      }
      return;
    }

    const tramo = findTramoAt(coords.ix, coords.iy);
    if (tramo) {
      const nextKey = `tramo:${tramo.id}:${tramo.construida}:${tramo.enObra}:${Math.round(tramo.estado)}`;
      if (hoveredKeyRef.current !== nextKey) {
        hoveredKeyRef.current = nextKey;
        hoveredParcelaIdRef.current = null;
        hoveredTramoIdRef.current = tramo.id;
        const subtitle = tramo.enObra
          ? `En construcción · ${tramo.diasObraRestantes}d restantes`
          : tramo.construida
          ? tramo.estado <= 0
            ? 'Vía cortada por deterioro'
            : `Estado vial ${Math.round(tramo.estado)}% · Mant. $${tramo.mantenimientoPeriodo}`
          : isViaConnectableToNetwork(stateRef.current, tramo)
          ? `Vía conectable · Costo $${tramo.costoObra}`
          : 'Vía planificada (aún sin enlace)';
        const detail = tramo.construida
          ? `${tramo.parcelasAbiertas.length} parcelas servidas`
          : 'Clic para inspeccionar o construir';
        setHoverTooltipData({
          kind: 'tramo',
          title: tramo.nombre,
          subtitle,
          detail,
        });
        onHoverInfoRef.current?.(`${tramo.nombre} — ${subtitle}`);
      }
      return;
    }

    if (hoveredKeyRef.current !== null) {
      hoveredKeyRef.current = null;
      hoveredParcelaIdRef.current = null;
      hoveredTramoIdRef.current = null;
      setHoverTooltipData(null);
      onHoverInfoRef.current?.(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const moved = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (moved) return;

    const coords = screenToIso(e.clientX, e.clientY);
    if (!coords) return;

    const npc = findNearestNpc(coords.ix, coords.iy);
    if (npc) {
      onSelectNpc(npc.id);
      return;
    }

    const parcela = findParcelaAt(coords.ix, coords.iy);
    if (parcela) {
      onSelectParcela?.(parcela.id);
      return;
    }

    const tramo = findTramoAt(coords.ix, coords.iy);
    if (tramo) {
      onSelectTramo?.(tramo.id);
      return;
    }

    const zone = findZoneAt(coords.ix, coords.iy);
    if (zone) {
      onSelectZona?.(zone.id);
    }
  };

  // Cursor-anchored zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = screenToIso(e.clientX, e.clientY);
    const prevZoom = camRef.current.targetZoom;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const nextZoom = Math.max(0.38, Math.min(2.4, prevZoom * factor));
    camRef.current.targetZoom = nextZoom;

    if (coords) {
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = coords.sx - rect.width / 2;
      const offsetY = coords.sy - rect.height / 2;
      camRef.current.targetX = clampCamX(coords.ix - offsetX / nextZoom);
      camRef.current.targetY = clampCamY(coords.iy - offsetY / nextZoom);
    }
  };

  const panFromMinimap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const targetIx = (mx - MINIMAP_W / 2) / MINIMAP_SCALE;
    const targetIy = (my - MINIMAP_H / 2) / MINIMAP_SCALE;
    onCancelFollow();
    camRef.current.targetX = clampCamX(targetIx);
    camRef.current.targetY = clampCamY(targetIy);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none bg-[#2d4726]">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => {
          dragRef.current.dragging = false;
          hoveredKeyRef.current = null;
          hoveredParcelaIdRef.current = null;
          hoveredTramoIdRef.current = null;
          setHoverTooltipData(null);
          onHoverInfoRef.current?.(null);
        }}
        onWheel={handleWheel}
        className="w-full h-full block cursor-pointer active:cursor-grabbing"
      />

      {noRender && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-zinc-950/90 flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-4 text-center max-w-sm shadow-2xl space-y-1.5">
            <div className="text-sm font-bold text-emerald-400">Modo sin dibujo activo</div>
            <div className="text-xs text-zinc-300">
              El mapa se omite para simular más rápido. Desactivalo desde la barra de desarrollo superior.
            </div>
          </div>
        </div>
      )}

      {/* Zero-rerender Tooltip (transformed directly via DOM ref) */}
      <div
        ref={tooltipDivRef}
        className={`pointer-events-none absolute top-0 left-0 z-20 bg-zinc-950/95 border border-zinc-700/90 text-white text-sm rounded-xl px-3.5 py-2.5 shadow-2xl max-w-[260px] ${
          hoverTooltipData ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hoverTooltipData && (
          <>
            <div className="font-semibold text-white leading-snug">{hoverTooltipData.title}</div>
            <div className="text-zinc-300 text-xs mt-0.5">{hoverTooltipData.subtitle}</div>
            {hoverTooltipData.detail && (
              <div
                className={`mt-1 font-mono text-xs tabular-nums ${
                  hoverTooltipData.kind !== 'npc' ? 'text-emerald-400 font-sans font-medium' : 'text-zinc-400'
                }`}
              >
                {hoverTooltipData.detail}
              </div>
            )}
          </>
        )}
      </div>

      {/* Interactive Valley Minimap (bottom-right) */}
      <div
        title="Minimapa: clic o arrastrá para mover la cámara"
        className="pointer-events-auto fixed bottom-4 right-4 z-20 bg-zinc-900/92 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden hidden lg:block"
      >
        <canvas
          ref={minimapCanvasRef}
          width={MINIMAP_W}
          height={MINIMAP_H}
          onMouseDown={(e) => {
            minimapDragRef.current = true;
            panFromMinimap(e);
          }}
          onMouseMove={(e) => {
            if (minimapDragRef.current) panFromMinimap(e);
          }}
          onMouseUp={() => {
            minimapDragRef.current = false;
          }}
          onMouseLeave={() => {
            minimapDragRef.current = false;
          }}
          className="block cursor-crosshair"
        />
      </div>
    </div>
  );
};
