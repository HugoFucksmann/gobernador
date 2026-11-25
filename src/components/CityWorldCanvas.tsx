import React, { useEffect, useRef, useState } from 'react';
import { ACTION_TABLE, DISTRICT_BY_ID, DISTRICTS, ROLE_CATALOG } from '../data/catalogs';
import {
  evaluateNpcBubbleText,
  evaluateNpcLensColor,
  evaluateZoneMetricColor,
} from '../engine/npcInsights';
import { getWorldZones, TICKS_PER_DAY } from '../engine/simulation';
import { CommunityDerived, GameState, Npc, ZoneId } from '../types/game';
import { CameraTarget, CityTab, MapFilter, MapLens, WindowId } from '../types/ui';

export type { CameraTarget, MapFilter, MapLens, WindowId };

interface CityWorldCanvasProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  selectedNpcId: string | null;
  filter: MapFilter;
  lens: MapLens;
  followSelected: boolean;
  cameraTarget: CameraTarget | null;
  zoomRequest: { delta: number; seq: number } | null;
  onSelectNpc: (npcId: string) => void;
  onOpenSection: (section: WindowId, tabHint?: CityTab) => void;
  onCancelFollow: () => void;
  onHoverInfoChange?: (info: string | null) => void;
}

// Logical simulation bounds: 0..1000 x 0..580
const WORLD_W = 1000;
const WORLD_H = 580;

// 2:1 True Isometric Projection centered on town middle (500, 290)
const ORIGIN_WX = 500;
const ORIGIN_WY = 290;
const ISO_X = 1.68;
const ISO_Y = 0.84;

// Offscreen static terrain cache covering extended countryside (-240..1240 x -220..800)
const TERRAIN_W = 4200;
const TERRAIN_H = 2100;
const TERRAIN_CX = TERRAIN_W / 2;
const TERRAIN_CY = TERRAIN_H / 2;

const MINIMAP_W = 208;
const MINIMAP_H = 120;

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

interface AmbientVehicle {
  axis: 'h' | 'v';
  pos: number;
  lane: number;
  speed: number;
  color: string;
}

interface WorldSpeechBubble {
  npcId: string;
  text: string;
  width: number;
  expiresAt: number;
}

interface LandmarkDef {
  id: string;
  label: string;
  hint: string;
  section: WindowId;
  tabHint?: CityTab;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  height: number;
}

const LANDMARKS: LandmarkDef[] = [
  {
    id: 'palacio',
    label: 'Palacio de Gobierno',
    hint: 'Abrir Palancas de Gobierno',
    section: 'palancas',
    wx: 500,
    wy: 365,
    ww: 132,
    wh: 100,
    height: 44,
  },
  {
    id: 'prensa',
    label: 'Redacción de Prensa',
    hint: 'Abrir Gaceta del Valle',
    section: 'gaceta',
    wx: 540,
    wy: 196,
    ww: 62,
    wh: 46,
    height: 26,
  },
  {
    id: 'mercado',
    label: 'Plaza y Mercado',
    hint: 'Abrir Economía y Empresas',
    section: 'economia',
    wx: 408,
    wy: 74,
    ww: 196,
    wh: 120,
    height: 18,
  },
  {
    id: 'campos',
    label: 'Campos del Valle',
    hint: 'Abrir Economía y Abasto',
    section: 'economia',
    wx: 34,
    wy: 72,
    ww: 298,
    wh: 198,
    height: 22,
  },
  {
    id: 'clinica',
    label: 'Clínica y Comisaría',
    hint: 'Salud, seguridad y obras (Palancas)',
    section: 'palancas',
    wx: 380,
    wy: 366,
    ww: 108,
    wh: 158,
    height: 30,
  },
  {
    id: 'escuela',
    label: 'Escuela del Valle',
    hint: 'Docentes fijos y estudiantes (Palancas / Ciudad)',
    section: 'palancas',
    wx: 714,
    wy: 78,
    ww: 156,
    wh: 148,
    height: 28,
  },
  {
    id: 'taller',
    label: 'Talleres Industriales',
    hint: 'Obras públicas e industria (Palancas)',
    section: 'palancas',
    wx: 42,
    wy: 358,
    ww: 280,
    wh: 178,
    height: 32,
  },
];

const SORTED_LANDMARKS = [...LANDMARKS].sort((a, b) => b.wx + b.wy - (a.wx + a.wy));

const SKIN_TONES = ['#f5d0b5', '#e8b896', '#d49a73', '#b87a56', '#f2c6a7'];
const HAIR_TONES = ['#27272a', '#451a03', '#713f12', '#1e293b', '#57534e', '#92400e'];

function hashIndex(id: string, len: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % len;
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

  // Soft cast shadow on ground to the east-south
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

  // Windows along both visible walls
  if (height >= 16) {
    const winFill =
      litWindows > 0.12
        ? `rgba(253, 224, 71, ${(0.45 + litWindows * 1.1).toFixed(2)})`
        : 'rgba(15, 23, 42, 0.34)';
    ctx.fillStyle = winFill;
    const rows = height >= 30 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const zOff = height * (rows === 2 ? (r === 0 ? 0.35 : 0.68) : 0.48);
      // Left wall windows
      const colsL = Math.max(1, Math.floor(ww / 24));
      for (let c = 0; c < colsL; c++) {
        const t = (c + 0.5) / colsL;
        const px = w.ix + (s.ix - w.ix) * t;
        const py = w.iy + (s.iy - w.iy) * t - zOff;
        ctx.beginPath();
        ctx.moveTo(px - 3, py - 1.5);
        ctx.lineTo(px + 3, py + 1.5);
        ctx.lineTo(px + 3, py + 6.5);
        ctx.lineTo(px - 3, py + 3.5);
        ctx.closePath();
        ctx.fill();
      }
      // Right wall windows
      const colsR = Math.max(1, Math.floor(wh / 24));
      for (let c = 0; c < colsR; c++) {
        const t = (c + 0.5) / colsR;
        const px = s.ix + (e.ix - s.ix) * t;
        const py = s.iy + (e.iy - s.iy) * t - zOff;
        ctx.beginPath();
        ctx.moveTo(px - 3, py + 1.5);
        ctx.lineTo(px + 3, py - 1.5);
        ctx.lineTo(px + 3, py + 3.5);
        ctx.lineTo(px - 3, py + 6.5);
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

  // Back-left slope
  ctx.fillStyle = slopeDark;
  ctx.beginPath();
  ctx.moveTo(n.ix, n.iy - baseZ);
  ctx.lineTo(w.ix, w.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front-left slope
  ctx.fillStyle = slopeLight;
  ctx.beginPath();
  ctx.moveTo(w.ix, w.iy - baseZ);
  ctx.lineTo(s.ix, s.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front-right slope
  ctx.fillStyle = slopeDark;
  ctx.beginPath();
  ctx.moveTo(s.ix, s.iy - baseZ);
  ctx.lineTo(e.ix, e.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Back-right slope
  ctx.fillStyle = slopeLight;
  ctx.beginPath();
  ctx.moveTo(e.ix, e.iy - baseZ);
  ctx.lineTo(n.ix, n.iy - baseZ);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// --- Offscreen Static Terrain Builder (called ONCE per climate mood) ---
function buildStaticTerrainCanvas(hasDrought: boolean, hasPlague: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TERRAIN_W;
  canvas.height = TERRAIN_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(TERRAIN_CX, TERRAIN_CY);

  // Base countryside backdrop
  ctx.fillStyle = hasDrought ? '#cabf95' : '#6fa350';
  ctx.fillRect(-TERRAIN_CX, -TERRAIN_CY, TERRAIN_W, TERRAIN_H);

  // Classic RCT-style checkerboard grass tiles across the whole valley
  const tile = 40;
  const grassA = hasDrought ? '#d5ca9e' : '#74aa54';
  const grassB = hasDrought ? '#cbbd8f' : '#699f4b';
  for (let wx = -240; wx < 1240; wx += tile) {
    for (let wy = -220; wy < 800; wy += tile) {
      const even = ((Math.floor(wx / tile) + Math.floor(wy / tile)) & 1) === 0;
      ctx.fillStyle = even ? grassA : grassB;
      isoQuadPath(ctx, wx, wy, tile, tile);
      ctx.fill();
    }
  }

  // Valley river along the west edge (wx: -90..-15)
  ctx.fillStyle = hasDrought ? '#7dd3fc' : '#0284c7';
  isoQuadPath(ctx, -92, -220, 74, 1020);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  isoQuadPath(ctx, -78, -220, 14, 1020);
  ctx.fill();
  // Riverbank sand trim
  ctx.fillStyle = '#d6c69c';
  isoQuadPath(ctx, -18, -220, 8, 1020);
  ctx.fill();

  // Isometric Avenues (running across the whole valley + beyond!)
  const drawIsoRoadH = (cy: number, x1: number, x2: number) => {
    ctx.fillStyle = '#94a3b8';
    isoQuadPath(ctx, x1, cy - 18, x2 - x1, 36);
    ctx.fill();
    ctx.fillStyle = '#334155';
    isoQuadPath(ctx, x1, cy - 13, x2 - x1, 26);
    ctx.fill();
    // Dashed center line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([12, 12]);
    const a = worldToIso(x1, cy);
    const b = worldToIso(x2, cy);
    ctx.beginPath();
    ctx.moveTo(a.ix, a.iy);
    ctx.lineTo(b.ix, b.iy);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawIsoRoadV = (cx: number, y1: number, y2: number) => {
    ctx.fillStyle = '#94a3b8';
    isoQuadPath(ctx, cx - 18, y1, 36, y2 - y1);
    ctx.fill();
    ctx.fillStyle = '#334155';
    isoQuadPath(ctx, cx - 13, y1, 26, y2 - y1);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([12, 12]);
    const a = worldToIso(cx, y1);
    const b = worldToIso(cx, y2);
    ctx.beginPath();
    ctx.moveTo(a.ix, a.iy);
    ctx.lineTo(b.ix, b.iy);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawIsoRoadH(295, -240, 1240);
  drawIsoRoadV(355, -220, 800);
  drawIsoRoadV(665, -220, 800);

  // Stone Bridge over the west river at y=295
  ctx.fillStyle = '#cbd5e1';
  isoQuadPath(ctx, -96, 275, 84, 4);
  ctx.fill();
  isoQuadPath(ctx, -96, 311, 84, 4);
  ctx.fill();

  // Intersections & crosswalks
  for (const inter of [
    { x: 355, y: 295 },
    { x: 665, y: 295 },
  ]) {
    ctx.fillStyle = '#334155';
    isoQuadPath(ctx, inter.x - 15, inter.y - 15, 30, 30);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    for (let i = -9; i <= 9; i += 6) {
      isoQuadPath(ctx, inter.x + i - 1.5, inter.y - 20, 3, 5);
      ctx.fill();
      isoQuadPath(ctx, inter.x + i - 1.5, inter.y + 15, 3, 5);
      ctx.fill();
    }
  }

  // District Terrain Pads
  for (const d of DISTRICTS) {
    ctx.fillStyle =
      d.id === 'campos'
        ? hasDrought
          ? '#d6c68f'
          : '#92bd69'
        : d.id === 'taller'
        ? '#94a3b8'
        : d.id === 'mercado'
        ? '#d6cbb5'
        : d.id === 'civico'
        ? '#cbd5e1'
        : '#8ab86d';
    isoQuadPath(ctx, d.x, d.y, d.w, d.h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Farmland furrowed plots (Campos)
  const plotColors = hasDrought
    ? ['#cbb578', '#bfa665']
    : hasPlague
    ? ['#8f9e73', '#7b8a60']
    : ['#9bc963', '#ceb95c'];
  const plots = [
    { x: 40, y: 78, w: 125, h: 78, k: 0 },
    { x: 180, y: 78, w: 145, h: 78, k: 1 },
    { x: 40, y: 170, w: 125, h: 94, k: 1 },
    { x: 180, y: 170, w: 145, h: 94, k: 0 },
  ];
  for (const p of plots) {
    ctx.fillStyle = plotColors[p.k];
    isoQuadPath(ctx, p.x, p.y, p.w, p.h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    for (let fy = p.y + 12; fy < p.y + p.h - 8; fy += 12) {
      const p1 = worldToIso(p.x + 8, fy);
      const p2 = worldToIso(p.x + p.w - 8, fy);
      ctx.beginPath();
      ctx.moveTo(p1.ix, p1.iy);
      ctx.lineTo(p2.ix, p2.iy);
      ctx.stroke();
    }
  }

  // Plaza cobblestone pattern
  ctx.fillStyle = '#e5dcc8';
  isoQuadPath(ctx, 410, 74, 200, 178);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,116,139,0.22)';
  ctx.lineWidth = 1;
  for (let px = 430; px < 610; px += 25) {
    const a = worldToIso(px, 74);
    const b = worldToIso(px, 252);
    ctx.beginPath();
    ctx.moveTo(a.ix, a.iy);
    ctx.lineTo(b.ix, b.iy);
    ctx.stroke();
  }

  // Schoolyard court
  ctx.fillStyle = '#fcd34d';
  isoQuadPath(ctx, 726, 166, 130, 56);
  ctx.fill();
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Residential Park & Pond
  ctx.fillStyle = hasDrought ? '#c7bf89' : '#86efac';
  isoQuadPath(ctx, 844, 344, 110, 174);
  ctx.fill();
  ctx.fillStyle = '#0ea5e9';
  isoQuadPath(ctx, 872, 405, 56, 44);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // District Carved Labels on roadsides
  for (const d of DISTRICTS) {
    const pos = worldToIso(d.x + 14, d.y + 18);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(pos.ix - 4, pos.iy - 14, 146, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(d.nombre, pos.ix + 4, pos.iy);
  }

  return canvas;
}

function buildMinimapBgCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MINIMAP_W;
  c.height = MINIMAP_H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.fillStyle = '#2d4726';
  ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

  // Project entire world (0..1000 x 0..580) nicely centered inside MINIMAP_W x MINIMAP_H
  const mapPoint = (wx: number, wy: number) => {
    const iso = worldToIso(wx, wy);
    return {
      mx: MINIMAP_W / 2 + iso.ix * 0.068,
      my: MINIMAP_H / 2 + iso.iy * 0.068,
    };
  };

  // River
  ctx.fillStyle = '#0284c7';
  const r1 = mapPoint(-80, -80);
  const r2 = mapPoint(-20, -80);
  const r3 = mapPoint(-20, 660);
  const r4 = mapPoint(-80, 660);
  ctx.beginPath();
  ctx.moveTo(r1.mx, r1.my);
  ctx.lineTo(r2.mx, r2.my);
  ctx.lineTo(r3.mx, r3.my);
  ctx.lineTo(r4.mx, r4.my);
  ctx.closePath();
  ctx.fill();

  for (const d of DISTRICTS) {
    ctx.fillStyle =
      d.id === 'campos'
        ? '#65a30d'
        : d.id === 'taller'
        ? '#64748b'
        : d.id === 'mercado'
        ? '#d97706'
        : d.id === 'civico'
        ? '#0f766e'
        : '#4d7c0f';
    const p1 = mapPoint(d.x, d.y);
    const p2 = mapPoint(d.x + d.w, d.y);
    const p3 = mapPoint(d.x + d.w, d.y + d.h);
    const p4 = mapPoint(d.x, d.y + d.h);
    ctx.beginPath();
    ctx.moveTo(p1.mx, p1.my);
    ctx.lineTo(p2.mx, p2.my);
    ctx.lineTo(p3.mx, p3.my);
    ctx.lineTo(p4.mx, p4.my);
    ctx.closePath();
    ctx.fill();
  }

  return c;
}

function buildLampGlowSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 48);
  g.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
  g.addColorStop(0.5, 'rgba(253, 224, 71, 0.2)');
  g.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
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
  nowSec: number
) {
  const isMoving =
    !isPaused &&
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
  c.globalAlpha = active ? 1 : 0.16;

  // Shadow
  c.fillStyle = 'rgba(15, 23, 42, 0.28)';
  c.beginPath();
  c.ellipse(0, 1.5, 5.5, 2.8, 0, 0, Math.PI * 2);
  c.fill();

  if (npc.accionIa) {
    c.beginPath();
    c.ellipse(0, 0, 10 + Math.sin(nowSec * 4) * 1.2, 5.5, 0, 0, Math.PI * 2);
    c.strokeStyle = npc.accionIa.tipo === 'condicion' ? '#ef4444' : '#f59e0b';
    c.lineWidth = 1.8;
    c.stroke();
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
  c.fillStyle = color;
  c.strokeStyle = '#ffffff';
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
  } else if (npc.rol === 'ingeniero') {
    c.fillStyle = '#facc15';
    c.beginPath();
    c.arc(0, -14.8 - bob, 3.6, Math.PI, 0);
    c.fill();
  } else if (npc.rol === 'empresario') {
    c.fillStyle = '#0f172a';
    c.fillRect(-5, -16.3 - bob, 10, 1.5);
    c.fillRect(-3.2, -19.2 - bob, 6.4, 3);
    c.fillStyle = '#f59e0b';
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

  if (npc.accionIa && active) {
    const badgeText =
      npc.accionIa.id === 'protesta' || npc.accionIa.id === 'huelga'
        ? '!'
        : npc.accionIa.id === 'saqueo'
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
    c.roundRect(-6, -28 - bob, 12, 10, 3);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = '700 8px "Plus Jakarta Sans", sans-serif';
    c.textAlign = 'center';
    c.fillText(badgeText, 0, -20.5 - bob);
    c.textAlign = 'start';
  }

  c.restore();
}

export const CityWorldCanvas: React.FC<CityWorldCanvasProps> = ({
  state,
  derived,
  paused,
  selectedNpcId,
  filter,
  lens,
  followSelected,
  cameraTarget,
  zoomRequest,
  onSelectNpc,
  onOpenSection,
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
  const selectedIdRef = useRef(selectedNpcId);
  selectedIdRef.current = selectedNpcId;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const lensRef = useRef(lens);
  lensRef.current = lens;
  const followRef = useRef(followSelected);
  followRef.current = followSelected;
  const onHoverInfoRef = useRef(onHoverInfoChange);
  onHoverInfoRef.current = onHoverInfoChange;

  // Start camera zoomed in over Plaza Central & Palacio de Gobierno so the huge isometric world feels expansive!
  const initialCenter = worldToIso(485, 255);
  const camRef = useRef({
    x: initialCenter.ix,
    y: initialCenter.iy,
    zoom: 1.08,
    targetX: initialCenter.ix,
    targetY: initialCenter.iy,
    targetZoom: 1.08,
  });

  const keysHeldRef = useRef<Set<string>>(new Set());
  const hoveredLandmarkRef = useRef<LandmarkDef | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);

  const [hoverTooltipData, setHoverTooltipData] = useState<{
    kind: 'npc' | 'landmark';
    title: string;
    subtitle: string;
    detail?: string;
  } | null>(null);

  const renderPositionsRef = useRef<Map<string, RenderNpcState>>(new Map());
  const smokeRef = useRef<SmokeParticle[]>([]);
  const bubblesRef = useRef<WorldSpeechBubble[]>([]);
  const seenContagionEventIdsRef = useRef<Set<string>>(new Set());
  const nextBubbleAtRef = useRef<number>(0);
  const vehiclesRef = useRef<AmbientVehicle[]>([
    { axis: 'v', pos: 110, lane: 349, speed: 28, color: '#d97706' },
    { axis: 'v', pos: 420, lane: 361, speed: -24, color: '#0284c7' },
    { axis: 'h', pos: 200, lane: 289, speed: 32, color: '#16a34a' },
    { axis: 'h', pos: 720, lane: 301, speed: -26, color: '#dc2626' },
    { axis: 'v', pos: 260, lane: 659, speed: 25, color: '#475569' },
  ]);

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
  const minimapBgRef = useRef<HTMLCanvasElement | null>(null);
  const lampSpriteRef = useRef<HTMLCanvasElement | null>(null);

  // Keyboard panning (WASD / Arrows)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT'
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

  // Handle external district jump requests
  useEffect(() => {
    if (!cameraTarget) return;
    if (cameraTarget.district === 'all') {
      const center = worldToIso(500, 290);
      camRef.current.targetX = center.ix;
      camRef.current.targetY = center.iy;
      camRef.current.targetZoom = 0.56;
    } else {
      const d = DISTRICT_BY_ID[cameraTarget.district];
      if (d) {
        const p = worldToIso(d.x + d.w / 2, d.y + d.h / 2);
        camRef.current.targetX = p.ix;
        camRef.current.targetY = p.iy;
        camRef.current.targetZoom = 1.18;
      }
    }
  }, [cameraTarget]);

  // Handle external zoom button requests
  useEffect(() => {
    if (!zoomRequest) return;
    if (zoomRequest.delta === 0) {
      const center = worldToIso(485, 255);
      camRef.current.targetX = center.ix;
      camRef.current.targetY = center.iy;
      camRef.current.targetZoom = 1.08;
    } else {
      camRef.current.targetZoom = Math.max(
        0.48,
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

  // Main 60fps Frustum-Culled Isometric Render Loop
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();
    let lastMinimapTime = 0;

    let prevSeed = stateRef.current.semilla;
    let prevTick = stateRef.current.reloj.tick;

    // Reusable queue array to minimize GC churn
    const renderQueue: DrawableItem[] = [];

    const matchesFilter = (npc: Npc): boolean => {
      if (!npc.vivo) return false;
      if (filterRef.current === 'acciones') return Boolean(npc.accionIa);
      if (filterRef.current === 'descontentos') return npc.variables.satisfaccion < 30;
      if (filterRef.current === 'hambre') return npc.variables.hambre > 80;
      return true;
    };

    const drawMinimap = (st: GameState, posMap: Map<string, RenderNpcState>) => {
      const mc = minimapCanvasRef.current;
      if (!mc) return;
      const mctx = mc.getContext('2d');
      if (!mctx) return;

      if (!minimapBgRef.current) {
        minimapBgRef.current = buildMinimapBgCanvas();
      }
      mctx.drawImage(minimapBgRef.current, 0, 0);

      // NPCs
      const curLens = lensRef.current;
      const curDerived = derivedRef.current;
      for (const npc of st.npcs) {
        if (!npc.vivo) continue;
        const rp = posMap.get(npc.id);
        const wx = rp ? rp.x : npc.mapa.x;
        const wy = rp ? rp.y : npc.mapa.y;
        const iso = worldToIso(wx, wy);
        const mx = MINIMAP_W / 2 + iso.ix * 0.068;
        const my = MINIMAP_H / 2 + iso.iy * 0.068;
        mctx.fillStyle =
          npc.id === selectedIdRef.current
            ? '#ffffff'
            : evaluateNpcLensColor(npc, curLens, st, curDerived);
        mctx.fillRect(mx - 1, my - 1, 2.5, 2.5);
      }

      // Current Camera Viewport Box
      const { w, h } = viewportSizeRef.current;
      const cam = camRef.current;
      const halfW = (w / 2 / cam.zoom) * 0.068;
      const halfH = (h / 2 / cam.zoom) * 0.068;
      const cx = MINIMAP_W / 2 + cam.x * 0.068;
      const cy = MINIMAP_H / 2 + cam.y * 0.068;
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
        const panSpeed = (520 / camRef.current.zoom) * dt;
        if (keys.has('a') || keys.has('arrowleft')) camRef.current.targetX -= panSpeed;
        if (keys.has('d') || keys.has('arrowright')) camRef.current.targetX += panSpeed;
        if (keys.has('w') || keys.has('arrowup')) camRef.current.targetY -= panSpeed;
        if (keys.has('s') || keys.has('arrowdown')) camRef.current.targetY += panSpeed;
        camRef.current.targetX = Math.max(-1450, Math.min(1450, camRef.current.targetX));
        camRef.current.targetY = Math.max(-760, Math.min(760, camRef.current.targetY));
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

          // 3. Ambient vehicles, smoke, and organic speech bubbles
          if (!pausedRef.current) {
            for (const v of vehiclesRef.current) {
              v.pos += v.speed * dt;
              if (v.axis === 'v') {
                if (v.pos > WORLD_H + 140) v.pos = -140;
                if (v.pos < -140) v.pos = WORLD_H + 140;
              } else {
                if (v.pos > WORLD_W + 180) v.pos = -180;
                if (v.pos < -180) v.pos = WORLD_W + 180;
              }
            }

            if (Math.random() < 0.16 && smokeRef.current.length < 24) {
              const chimneys = [
                { wx: 152, wy: 374, z: 36 },
                { wx: 304, wy: 374, z: 34 },
                { wx: 178, wy: 468, z: 36 },
              ];
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
                  ...bubblesRef.current.filter((b) => b.expiresAt > nowSec && !batchIds.has(b.npcId)).slice(-3),
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
                  ...bubblesRef.current.filter((b) => b.expiresAt > nowSec && b.npcId !== chosen.id).slice(-5),
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
          const duskAmount = dayPhase > 0.72 ? Math.sin(((dayPhase - 0.72) / 0.28) * Math.PI) * 0.45 : 0;

          // Ensure static terrain cache matches climate theme
          const terrainKey = `${hasDrought ? 1 : 0}_${hasPlague ? 1 : 0}`;
          if (!terrainCacheRef.current || terrainCacheRef.current.key !== terrainKey) {
            terrainCacheRef.current = {
              canvas: buildStaticTerrainCanvas(hasDrought, hasPlague),
              key: terrainKey,
            };
          }
          if (!lampSpriteRef.current) {
            lampSpriteRef.current = buildLampGlowSprite();
          }

          // 5. Render Frame
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = hasDrought ? '#cabf95' : '#6fa350';
          ctx.fillRect(0, 0, w, h);

          // Calculate Frustum Bounds in Isometric World Space
          const viewHalfW = w / 2 / cam.zoom;
          const viewHalfH = h / 2 / cam.zoom;
          const margin = 160;
          const minIx = cam.x - viewHalfW - margin;
          const maxIx = cam.x + viewHalfW + margin;
          const minIy = cam.y - viewHalfH - margin;
          const maxIy = cam.y + viewHalfH + margin;

          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(cam.zoom, cam.zoom);
          ctx.translate(-cam.x, -cam.y);

          // Blit ONLY the visible slice of pre-rendered static terrain!
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

          // Zone Lens Overlay (defensa / orden / integridad / amenaza)
          const activeLens = lensRef.current;
          if (
            activeLens === 'defensa' ||
            activeLens === 'orden' ||
            activeLens === 'integridad' ||
            activeLens === 'amenaza'
          ) {
            const curDerived = derivedRef.current;
            const zoneRects: Record<ZoneId, { wx: number; wy: number; ww: number; wh: number }> = {
              centro: { wx: 366, wy: 24, ww: 288, wh: 532 },
              norte: { wx: 24, wy: 24, ww: 320, wh: 260 },
              sur: { wx: 24, wy: 306, ww: 320, wh: 250 },
              este: { wx: 676, wy: 24, ww: 300, wh: 532 },
              oeste: { wx: -16, wy: 24, ww: 40, wh: 532 },
            };
            const zoneKeys = getWorldZones(st);
            ctx.save();
            for (const zk of zoneKeys) {
              const zr = zoneRects[zk];
              if (!zr) continue;
              const val =
                activeLens === 'defensa'
                  ? curDerived.defensa[zk] ?? 0
                  : activeLens === 'orden'
                  ? curDerived.orden?.[zk] ?? 0
                  : activeLens === 'integridad'
                  ? st.gobierno.integridad?.[zk] ?? 100
                  : curDerived.amenazaPercibida[zk] ?? 0;
              const strokeCol = evaluateZoneMetricColor(activeLens, val);
              isoQuadPath(ctx, zr.wx, zr.wy, zr.ww, zr.wh);
              ctx.globalAlpha = 0.18;
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
              ctx.roundRect(lblPos.ix - 48, lblPos.iy - 11, 96, 20, 4);
              ctx.fill();
              ctx.fillStyle = '#f8fafc';
              ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`${zk.toUpperCase()} ${Math.round(val)}%`, lblPos.ix, lblPos.iy + 2.5);
              ctx.textAlign = 'start';
            }
            ctx.restore();
          }

          // Interactive Landmark Hover Footprint Highlight
          if (hoveredLandmarkRef.current) {
            const lm = hoveredLandmarkRef.current;
            ctx.save();
            isoQuadPath(ctx, lm.wx - 4, lm.wy - 4, lm.ww + 8, lm.wh + 8);
            ctx.fillStyle = 'rgba(20, 184, 166, 0.16)';
            ctx.fill();
            ctx.strokeStyle = '#14b8a6';
            ctx.lineWidth = 2.6;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.restore();
          }

          // 6. Populate Frustum-Culled Painter's Algorithm Queue
          renderQueue.length = 0;

          const pushItem = (wx: number, wy: number, draw: (c: CanvasRenderingContext2D) => void) => {
            const p = worldToIso(wx, wy);
            if (p.ix < minIx || p.ix > maxIx || p.iy < minIy || p.iy > maxIy) return;
            renderQueue.push({ kind: 'fn', depth: wx + wy, draw });
          };

          // Barn & Silo (Campos)
          pushItem(286, 134, (c) => {
            drawIsoBox(c, 264, 118, 44, 32, 18, '#dc2626', '#991b1b', '#b91c1c', undefined, duskAmount);
            drawIsoPitchedRoof(c, 262, 116, 48, 36, 18, 12, '#ef4444', '#991b1b');
          });
          pushItem(322, 134, (c) => {
            drawIsoBox(c, 314, 126, 16, 16, 30, '#e2e8f0', '#94a3b8', '#cbd5e1');
          });

          // Rotating Windmill
          pushItem(168, 162, (c) => {
            drawIsoBox(c, 160, 154, 16, 16, 26, '#92400e', '#78350f', '#b45309');
            const top = worldToIso(168, 162);
            c.save();
            c.translate(top.ix, top.iy - 28);
            c.rotate(pausedRef.current ? 0.3 : nowSec * 1.1);
            c.strokeStyle = '#f8fafc';
            c.lineWidth = 2.6;
            for (let b = 0; b < 4; b++) {
              c.rotate(Math.PI / 2);
              c.beginPath();
              c.moveTo(0, 0);
              c.lineTo(0, -20);
              c.stroke();
            }
            c.restore();
          });

          // Industrial Factories & Crates
          pushItem(106, 396, (c) => {
            drawIsoBox(c, 46, 362, 120, 68, 28, '#64748b', '#475569', '#94a3b8', undefined, duskAmount);
            drawIsoBox(c, 146, 368, 14, 14, 44, '#334155', '#1e293b', '#475569');
          });
          pushItem(256, 393, (c) => {
            drawIsoBox(c, 194, 362, 124, 62, 26, '#475569', '#334155', '#64748b', undefined, duskAmount);
            drawIsoBox(c, 298, 368, 14, 14, 42, '#334155', '#1e293b', '#475569');
          });
          pushItem(122, 493, (c) => {
            drawIsoBox(c, 52, 456, 140, 74, 28, '#64748b', '#475569', '#94a3b8', undefined, duskAmount);
            drawIsoBox(c, 172, 462, 14, 14, 44, '#334155', '#1e293b', '#475569');
          });
          for (const cr of [
            { x: 222, y: 462, c1: '#b45309', c2: '#d97706' },
            { x: 244, y: 462, c1: '#92400e', c2: '#b45309' },
            { x: 222, y: 484, c1: '#d97706', c2: '#f59e0b' },
            { x: 266, y: 472, c1: '#b45309', c2: '#d97706' },
          ]) {
            pushItem(cr.x + 8, cr.y + 8, (c) => {
              drawIsoBox(c, cr.x, cr.y, 16, 16, 10, cr.c2, cr.c1, cr.c2);
            });
          }

          // Plaza Fountain & Market Stalls
          pushItem(510, 162, (c) => {
            const fp = worldToIso(510, 162);
            c.fillStyle = '#94a3b8';
            c.beginPath();
            c.ellipse(fp.ix, fp.iy, 30, 15, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#0ea5e9';
            c.beginPath();
            c.ellipse(fp.ix, fp.iy - 2, 22, 11, 0, 0, Math.PI * 2);
            c.fill();
            const ripple = ((nowSec * 12) % 16) + 4;
            c.strokeStyle = 'rgba(255,255,255,0.7)';
            c.lineWidth = 1.4;
            c.beginPath();
            c.ellipse(fp.ix, fp.iy - 2, ripple, ripple * 0.5, 0, 0, Math.PI * 2);
            c.stroke();
            // Center water spout
            c.fillStyle = '#e0f2fe';
            c.fillRect(fp.ix - 1.5, fp.iy - 14, 3, 12);
          });

          for (const stDef of [
            { x: 422, y: 92, c: '#dc2626', cDark: '#991b1b' },
            { x: 458, y: 92, c: '#0d9488', cDark: '#115e59' },
            { x: 540, y: 92, c: '#d97706', cDark: '#92400e' },
            { x: 576, y: 92, c: '#2563eb', cDark: '#1e40af' },
            { x: 422, y: 214, c: '#059669', cDark: '#065f46' },
            { x: 458, y: 214, c: '#ca8a04', cDark: '#854d0e' },
          ]) {
            pushItem(stDef.x + 13, stDef.y + 9, (c) => {
              drawIsoBox(c, stDef.x, stDef.y, 26, 18, 12, stDef.c, stDef.cDark, '#e7dec8');
            });
          }

          // Press Building (Redacción)
          pushItem(571, 219, (c) => {
            drawIsoBox(c, 543, 200, 56, 38, 22, '#be185d', '#831843', '#9d174d', undefined, duskAmount);
            const roof = worldToIso(571, 219);
            c.fillStyle = '#fdf2f8';
            c.fillRect(roof.ix - 20, roof.iy - 34, 40, 11);
            c.fillStyle = '#9d174d';
            c.font = '700 7.5px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.fillText('PRENSA', roof.ix, roof.iy - 26);
            c.textAlign = 'start';
          });

          // Clínica
          pushItem(433, 404, (c) => {
            drawIsoBox(c, 384, 370, 98, 68, 26, '#ffffff', '#cbd5e1', '#e2e8f0', undefined, duskAmount);
            const roof = worldToIso(433, 404);
            c.fillStyle = '#dc2626';
            c.fillRect(roof.ix - 3, roof.iy - 34, 6, 16);
            c.fillRect(roof.ix - 8, roof.iy - 29, 16, 6);
          });

          // Comisaría
          pushItem(430, 491, (c) => {
            drawIsoBox(c, 384, 462, 92, 58, 24, '#1d4ed8', '#172554', '#1e3a8a', undefined, duskAmount);
            const roof = worldToIso(430, 491);
            c.fillStyle = '#dbeafe';
            c.font = '700 7.5px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.fillText('COMISARÍA', roof.ix, roof.iy - 24);
            c.textAlign = 'start';
          });

          // Palacio de Gobierno (Hero Civic Monument)
          pushItem(567, 416, (c) => {
            drawIsoBox(c, 503, 369, 128, 94, 32, '#0f766e', '#94a3b8', '#cbd5e1', undefined, duskAmount);
            // Upper Dome Tier
            drawIsoBox(c, 541, 395, 52, 42, 16, '#14b8a6', '#0f766e', '#115e59');
            const top = worldToIso(567, 416);
            const flagWave = Math.sin(nowSec * 4) * 2.5;
            c.strokeStyle = '#0f172a';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(top.ix, top.iy - 48);
            c.lineTo(top.ix, top.iy - 74);
            c.stroke();
            c.fillStyle = '#f59e0b';
            c.beginPath();
            c.moveTo(top.ix, top.iy - 74);
            c.lineTo(top.ix + 18, top.iy - 70 + flagWave);
            c.lineTo(top.ix, top.iy - 63);
            c.closePath();
            c.fill();

            if (st.gobierno.finanzas.impago) {
              c.strokeStyle = `rgba(220, 38, 38, ${(0.55 + Math.sin(nowSec * 5) * 0.35).toFixed(2)})`;
              c.lineWidth = 3;
              isoQuadPath(c, 498, 364, 138, 104);
              c.stroke();
            }
          });

          // Escuela del Valle
          pushItem(791, 117, (c) => {
            drawIsoBox(c, 718, 80, 146, 74, 24, '#e0e7ff', '#a5b4fc', '#c7d2fe', undefined, duskAmount);
            drawIsoPitchedRoof(c, 716, 78, 150, 78, 24, 12, '#4f46e5', '#3730a3');
            const top = worldToIso(791, 117);
            c.fillStyle = '#ffffff';
            c.font = '700 8px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.fillText('ESCUELA', top.ix, top.iy - 22);
            c.textAlign = 'start';
          });

          // Residential Cottages
          for (const hHouse of [
            { x: 702, y: 274, w: 46, h: 36, r1: '#ea580c', r2: '#9a3412' },
            { x: 766, y: 274, w: 46, h: 36, r1: '#d97706', r2: '#92400e' },
            { x: 830, y: 274, w: 46, h: 36, r1: '#dc2626', r2: '#991b1b' },
            { x: 896, y: 274, w: 48, h: 38, r1: '#0d9488', r2: '#115e59' },
            { x: 702, y: 344, w: 46, h: 36, r1: '#d97706', r2: '#92400e' },
            { x: 766, y: 344, w: 46, h: 36, r1: '#ea580c', r2: '#9a3412' },
            { x: 702, y: 446, w: 50, h: 38, r1: '#c2410c', r2: '#7c2d12' },
            { x: 772, y: 446, w: 50, h: 38, r1: '#b45309', r2: '#78350f' },
          ]) {
            pushItem(hHouse.x + hHouse.w / 2, hHouse.y + hHouse.h / 2, (c) => {
              drawIsoBox(c, hHouse.x, hHouse.y, hHouse.w, hHouse.h, 15, '#fef3c7', '#e2d5b5', '#f5ebd1', undefined, duskAmount);
              drawIsoPitchedRoof(c, hHouse.x - 2, hHouse.y - 2, hHouse.w + 4, hHouse.h + 4, 15, 10, hHouse.r1, hHouse.r2);
            });
          }

          // Isometric Trees (Town + Surrounding Countryside)
          const trees = [
            { x: 38, y: 54 },
            { x: 326, y: 56 },
            { x: 384, y: 256 },
            { x: 632, y: 64 },
            { x: 384, y: 332 },
            { x: 636, y: 526 },
            { x: 896, y: 102 },
            { x: 938, y: 162 },
            { x: 862, y: 368 },
            { x: 932, y: 374 },
            { x: 868, y: 492 },
            { x: 934, y: 486 },
            { x: 696, y: 516 },
            // Countryside forest ring
            { x: 110, y: -45 },
            { x: 240, y: -65 },
            { x: 520, y: -52 },
            { x: 820, y: -48 },
            { x: 1045, y: 95 },
            { x: 1065, y: 225 },
            { x: 1050, y: 410 },
            { x: 180, y: 625 },
            { x: 510, y: 635 },
            { x: 840, y: 628 },
            { x: -135, y: 120 },
            { x: -140, y: 360 },
            { x: -125, y: 490 },
          ];
          for (const t of trees) {
            pushItem(t.x, t.y, (c) => {
              const p = worldToIso(t.x, t.y);
              c.fillStyle = 'rgba(15,23,42,0.2)';
              c.beginPath();
              c.ellipse(p.ix + 6, p.iy + 2, 11, 5.5, 0, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = '#78350f';
              c.fillRect(p.ix - 2, p.iy - 10, 4, 10);
              c.fillStyle = hasDrought ? '#84a955' : '#15803d';
              c.beginPath();
              c.arc(p.ix, p.iy - 16, 11, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = hasDrought ? '#a3be6e' : '#22c55e';
              c.beginPath();
              c.arc(p.ix - 3, p.iy - 19, 6.5, 0, Math.PI * 2);
              c.fill();
            });
          }

          // Ambient Isometric Vehicles
          for (const v of vehiclesRef.current) {
            const wx = v.axis === 'v' ? v.lane : v.pos;
            const wy = v.axis === 'v' ? v.pos : v.lane;
            pushItem(wx, wy, (c) => {
              const ww = v.axis === 'v' ? 9 : 15;
              const wh = v.axis === 'v' ? 15 : 9;
              drawIsoBox(c, wx - ww / 2, wy - wh / 2, ww, wh, 7, v.color, '#1e293b', '#334155');
            });
          }

          // Isometric RCT Peeps (NPCs) - zero closure allocations per frame
          const curLens = lensRef.current;
          const curDerived = derivedRef.current;
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
          for (let i = 0; i < renderQueue.length; i++) {
            const item = renderQueue[i];
            if (item.kind === 'npc') {
              drawIsoNpc(
                ctx,
                item.ix,
                item.iy,
                item.npc,
                item.rp,
                st,
                curLens,
                curDerived,
                curSelectedId,
                isSimPaused,
                matchesFilter(item.npc),
                nowSec
              );
            } else {
              item.draw(ctx);
            }
          }

          // Factory Smoke (above roofs)
          for (const sm of smokeRef.current) {
            const p = worldToIso(sm.wx, sm.wy);
            ctx.fillStyle = `rgba(226, 232, 240, ${sm.alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(p.ix, p.iy - sm.z, sm.r, 0, Math.PI * 2);
            ctx.fill();
          }

          // Organic Speech Bubbles (using pre-measured width!)
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

          // Pre-baked Lamp Glow Sprites at Dusk (zero gradient allocations per frame!)
          if (duskAmount > 0.1 && lampSpriteRef.current) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.85, duskAmount * 1.4);
            const lamps = [
              { x: 355, y: 140 },
              { x: 355, y: 420 },
              { x: 665, y: 140 },
              { x: 665, y: 420 },
              { x: 510, y: 295 },
              { x: 200, y: 295 },
              { x: 820, y: 295 },
            ];
            for (const lp of lamps) {
              const p = worldToIso(lp.x, lp.y);
              ctx.drawImage(lampSpriteRef.current, p.ix - 48, p.iy - 48);
            }
            ctx.restore();
          }

          // Climate / Zombie edge aura & origin indicator
          if (hasZombie) {
            const zombieFen = activeFens.find((f) => f.tipo === 'plaga_zombie');
            const origPos: Record<ZoneId, { wx: number; wy: number }> = {
              centro: { wx: 510, wy: 290 },
              norte: { wx: 184, wy: 80 },
              este: { wx: 920, wy: 290 },
              sur: { wx: 184, wy: 510 },
              oeste: { wx: 45, wy: 290 },
            };
            for (let z = 0; z < 10; z++) {
              const angle = nowSec * 0.2 + z * ((Math.PI * 2) / 10);
              const zwx = 500 + Math.cos(angle) * 530 + Math.sin(nowSec * 2 + z) * 14;
              const zwy = 290 + Math.sin(angle) * 310 + Math.cos(nowSec * 2 + z) * 14;
              const p = worldToIso(zwx, zwy);
              ctx.fillStyle = 'rgba(136, 19, 55, 0.78)';
              ctx.beginPath();
              ctx.arc(p.ix, p.iy - 5, 5.5, 0, Math.PI * 2);
              ctx.fill();
            }
            if (zombieFen?.origen) {
              const op = origPos[zombieFen.origen] || origPos.este;
              const ip = worldToIso(op.wx, op.wy);
              ctx.fillStyle = 'rgba(190, 18, 60, 0.9)';
              ctx.beginPath();
              ctx.roundRect(ip.ix - 54, ip.iy - 14, 108, 22, 4);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`ORIGEN: ${zombieFen.origen.toUpperCase()}`, ip.ix, ip.iy + 0.5);
              ctx.textAlign = 'start';
            }
          }

          ctx.restore();

          // Subtle twilight tint over viewport
          if (duskAmount > 0.05) {
            ctx.fillStyle = `rgba(30, 27, 75, ${(duskAmount * 0.22).toFixed(2)})`;
            ctx.fillRect(0, 0, w, h);
          }

          // Throttled Minimap update (~12fps)
          if (now - lastMinimapTime > 80) {
            lastMinimapTime = now;
            drawMinimap(st, posMap);
          }
        }
      }

      animId = window.requestAnimationFrame(frame);
    };

    animId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(animId);
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
        minimapBgRef.current.width = 0;
        minimapBgRef.current.height = 0;
        minimapBgRef.current = null;
      }
      if (lampSpriteRef.current) {
        lampSpriteRef.current.width = 0;
        lampSpriteRef.current.height = 0;
        lampSpriteRef.current = null;
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

  const findLandmarkAt = (ix: number, iy: number): LandmarkDef | null => {
    // Check front-most landmarks first (descending wx + wy)
    for (const lm of SORTED_LANDMARKS) {
      // Check both ground footprint and elevated roof plane
      for (const zOff of [lm.height * 0.5, 0]) {
        const wCoords = isoToWorld(ix, iy + zOff);
        if (
          wCoords.wx >= lm.wx &&
          wCoords.wx <= lm.wx + lm.ww &&
          wCoords.wy >= lm.wy &&
          wCoords.wy <= lm.wy + lm.wh
        ) {
          return lm;
        }
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
        camRef.current.targetX = Math.max(
          -1450,
          Math.min(1450, dragRef.current.origCamX - dx / camRef.current.zoom)
        );
        camRef.current.targetY = Math.max(
          -760,
          Math.min(760, dragRef.current.origCamY - dy / camRef.current.zoom)
        );
        if (hoveredKeyRef.current !== null) {
          hoveredKeyRef.current = null;
          hoveredLandmarkRef.current = null;
          setHoverTooltipData(null);
          onHoverInfoRef.current?.(null);
        }
        return;
      }
    }

    const coords = screenToIso(e.clientX, e.clientY);
    if (!coords) return;

    // Move tooltip directly via DOM transform (ZERO React re-render on mouse move!)
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
        hoveredLandmarkRef.current = null;
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

    const lm = findLandmarkAt(coords.ix, coords.iy);
    if (lm) {
      const nextKey = `lm:${lm.id}`;
      if (hoveredKeyRef.current !== nextKey) {
        hoveredKeyRef.current = nextKey;
        hoveredLandmarkRef.current = lm;
        setHoverTooltipData({
          kind: 'landmark',
          title: lm.label,
          subtitle: lm.hint,
          detail: 'Clic para abrir ventana',
        });
        onHoverInfoRef.current?.(`${lm.label} — ${lm.hint}`);
      }
      return;
    }

    if (hoveredKeyRef.current !== null) {
      hoveredKeyRef.current = null;
      hoveredLandmarkRef.current = null;
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

    const lm = findLandmarkAt(coords.ix, coords.iy);
    if (lm) {
      onOpenSection(lm.section, lm.tabHint);
    }
  };

  // Cursor-anchored zoom (classic RCT / RTS zoom toward mouse pointer)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = screenToIso(e.clientX, e.clientY);
    const prevZoom = camRef.current.targetZoom;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const nextZoom = Math.max(0.48, Math.min(2.4, prevZoom * factor));
    camRef.current.targetZoom = nextZoom;

    if (coords) {
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = coords.sx - rect.width / 2;
      const offsetY = coords.sy - rect.height / 2;
      camRef.current.targetX = Math.max(
        -1450,
        Math.min(1450, coords.ix - offsetX / nextZoom)
      );
      camRef.current.targetY = Math.max(
        -760,
        Math.min(760, coords.iy - offsetY / nextZoom)
      );
    }
  };

  const panFromMinimap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const targetIx = (mx - MINIMAP_W / 2) / 0.068;
    const targetIy = (my - MINIMAP_H / 2) / 0.068;
    onCancelFollow();
    camRef.current.targetX = Math.max(-1450, Math.min(1450, targetIx));
    camRef.current.targetY = Math.max(-760, Math.min(760, targetIy));
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
          hoveredLandmarkRef.current = null;
          setHoverTooltipData(null);
          onHoverInfoRef.current?.(null);
        }}
        onWheel={handleWheel}
        className="w-full h-full block cursor-pointer active:cursor-grabbing"
      />

      {/* Zero-rerender Tooltip (transformed directly via DOM ref) */}
      <div
        ref={tooltipDivRef}
        className={`pointer-events-none absolute top-0 left-0 z-20 bg-slate-900/95 border-t border-l border-slate-500/50 border-b border-r border-slate-950 text-white text-xs rounded px-2.5 py-1.5 shadow-xl max-w-[240px] ${
          hoverTooltipData ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hoverTooltipData && (
          <>
            <div className="font-semibold text-white">{hoverTooltipData.title}</div>
            <div className="text-slate-300 capitalize text-[11px]">{hoverTooltipData.subtitle}</div>
            {hoverTooltipData.detail && (
              <div
                className={`mt-0.5 font-mono text-[10px] tabular-nums ${
                  hoverTooltipData.kind === 'landmark' ? 'text-teal-300 font-sans font-medium' : 'text-slate-400'
                }`}
              >
                {hoverTooltipData.detail}
              </div>
            )}
          </>
        )}
      </div>

      {/* Interactive RCT Minimap (bottom-right) */}
      <div className="pointer-events-auto fixed bottom-10 right-3 z-20 bg-slate-800/95 border-t border-l border-slate-500/60 border-b-2 border-r-2 border-slate-950 rounded shadow-2xl overflow-hidden hidden sm:block">
        <div className="flex items-center justify-between px-2 py-0.5 bg-slate-700/90 border-b border-slate-900 text-[10px] font-semibold text-slate-100">
          <span>Mapa del Valle</span>
          <span className="font-mono text-[9px] text-slate-300 tabular-nums">Clic para mover</span>
        </div>
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
