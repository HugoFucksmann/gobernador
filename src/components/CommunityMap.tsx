import React, { useEffect, useRef, useState } from 'react';
import { DISTRICTS, ROLE_CATALOG } from '../data/catalogs';
import { GameState, Npc, RoleId } from '../types/game';

export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre';

interface CommunityMapProps {
  state: GameState;
  selectedNpcId: string | null;
  onSelectNpc: (npcId: string) => void;
}

const LOGICAL_W = 1000;
const LOGICAL_H = 580;

export const CommunityMap: React.FC<CommunityMapProps> = ({
  state,
  selectedNpcId,
  onSelectNpc,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [filter, setFilter] = useState<MapFilter>('todos');
  const [roleFilter, setRoleFilter] = useState<RoleId | 'todos'>('todos');
  const [hoveredNpc, setHoveredNpc] = useState<{ npc: Npc; screenX: number; screenY: number } | null>(null);

  const matchesFilter = (npc: Npc): boolean => {
    if (!npc.vivo) return false;
    if (roleFilter !== 'todos' && npc.rol !== roleFilter) return false;
    if (filter === 'acciones') return Boolean(npc.accionIa);
    if (filter === 'descontentos') return npc.variables.satisfaccion < 30;
    if (filter === 'hambre') return npc.variables.hambre > 80;
    return true;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Subtle roads connecting districts
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(355, 24);
    ctx.lineTo(355, 556);
    ctx.moveTo(665, 24);
    ctx.lineTo(665, 556);
    ctx.moveTo(24, 295);
    ctx.lineTo(665, 295);
    ctx.stroke();

    // Draw Districts
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.color;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(d.x, d.y, d.w, d.h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(d.nombre, d.x + 12, d.y + 22);

      ctx.fillStyle = '#64748b';
      ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(d.subtitulo, d.x + 12, d.y + 37);
    }

    // Climate subtle atmosphere tint
    const hasDrought = state.clima.fenomenos.some((f) => f.tipo === 'sequia' || f.tipo === 'plaga');
    const hasZombie = state.clima.fenomenos.some((f) => f.tipo === 'plaga_zombie');
    if (hasDrought) {
      ctx.fillStyle = 'rgba(217, 119, 6, 0.06)';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }
    if (hasZombie) {
      ctx.fillStyle = 'rgba(190, 18, 60, 0.05)';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }

    // Draw NPCs
    for (const npc of state.npcs) {
      if (!npc.vivo) continue;
      const active = matchesFilter(npc);
      const isSelected = npc.id === selectedNpcId;
      const roleDef = ROLE_CATALOG[npc.rol];
      const radius = isSelected ? 7.5 : 5;

      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.16;

      // Outer ring for AI actions or condition actions
      if (npc.accionIa) {
        ctx.beginPath();
        ctx.arc(npc.mapa.x, npc.mapa.y, radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = npc.accionIa.tipo === 'condicion' ? '#dc2626' : '#d97706';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Selection halo
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(npc.mapa.x, npc.mapa.y, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#0f766e';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // NPC Circle
      ctx.beginPath();
      ctx.arc(npc.mapa.x, npc.mapa.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = roleDef.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Critical hunger small dot marker above
      if (npc.variables.hambre > 80 && active) {
        ctx.beginPath();
        ctx.arc(npc.mapa.x + 5, npc.mapa.y - 5, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
      }

      ctx.restore();
    }
  }, [state, selectedNpcId, filter, roleFilter]);

  const getMapCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;
    return { x, y, clientX: e.clientX - rect.left, clientY: e.clientY - rect.top };
  };

  const findNearestNpc = (x: number, y: number): Npc | null => {
    let best: Npc | null = null;
    let bestDist = 16;
    for (const npc of state.npcs) {
      if (!npc.vivo) continue;
      const d = Math.hypot(npc.mapa.x - x, npc.mapa.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    return best;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getMapCoords(e);
    if (!coords) return;
    const npc = findNearestNpc(coords.x, coords.y);
    if (npc) {
      setHoveredNpc({ npc, screenX: coords.clientX, screenY: coords.clientY });
    } else {
      setHoveredNpc(null);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getMapCoords(e);
    if (!coords) return;
    const npc = findNearestNpc(coords.x, coords.y);
    if (npc) {
      onSelectNpc(npc.id);
    }
  };

  const activeActionsCount = state.npcs.filter((n) => n.vivo && n.accionIa).length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Mapa de la comunidad</h2>
          <p className="text-xs text-slate-500">
            Haz clic sobre cualquier habitante para inspeccionar su estado, modificadores y pensamiento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'acciones', label: `Acciones (${activeActionsCount})` },
                { id: 'descontentos', label: 'Descontentos' },
                { id: 'hambre', label: 'Hambre crítica' },
              ] as Array<{ id: MapFilter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filter === f.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar por rol"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleId | 'todos')}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            <option value="todos">Todos los roles</option>
            {Object.values(ROLE_CATALOG).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive Map Canvas */}
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredNpc(null)}
          onClick={handleClick}
          className="w-full h-auto block cursor-pointer"
          style={{ aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}` }}
        />

        {hoveredNpc && (
          <div
            className="pointer-events-none absolute z-10 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-md max-w-[220px]"
            style={{
              left: Math.min(hoveredNpc.screenX + 12, 540),
              top: Math.max(hoveredNpc.screenY - 56, 8),
            }}
          >
            <div className="font-semibold">{hoveredNpc.npc.nombre}</div>
            <div className="text-slate-300">
              {ROLE_CATALOG[hoveredNpc.npc.rol].nombre} · {hoveredNpc.npc.edad} años
            </div>
            <div className="text-slate-300 font-mono mt-0.5 tabular-nums">
              Sat {Math.round(hoveredNpc.npc.variables.satisfaccion)}% · Ham {Math.round(hoveredNpc.npc.variables.hambre)}%
            </div>
            {hoveredNpc.npc.accionIa && (
              <div className="text-amber-300 mt-0.5 truncate">{hoveredNpc.npc.accionIa.nombre}</div>
            )}
          </div>
        )}
      </div>

      {/* Quiet Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <strong className="text-slate-700 font-medium">Anillo ámbar:</strong> acción espontánea IA
          </span>
          <span>
            <strong className="text-slate-700 font-medium">Anillo rojo:</strong> acción de condición (huelga/protesta/saqueo)
          </span>
          <span>
            <strong className="text-slate-700 font-medium">Punto rojo:</strong> hambre crítica (&gt;80)
          </span>
        </div>
        <span className="font-mono tabular-nums">
          {state.npcs.filter((n) => n.vivo).length} vivos / {state.npcs.filter((n) => !n.vivo).length} bajas
        </span>
      </div>
    </div>
  );
};
