import React, { useState } from 'react';
import {
  Brain,
  Coins,
  Crosshair,
  HeartPulse,
  MessageSquareQuote,
  RefreshCw,
  Sliders,
  User,
  Users,
} from 'lucide-react';
import { ROLE_CATALOG } from '../../data/catalogs';
import { getNpcDistrictName } from '../../engine/npcInsights';
import {
  getEffectiveTrait,
  getModifierDelta,
  getNpcProductivity,
  getStage,
} from '../../engine/simulation';
import {
  CommunityDerived,
  GameState,
  Npc,
  PersonalityTrait,
} from '../../types/game';
import { RctWindow } from './RctWindow';

interface CitizenCardProps {
  state: GameState;
  derived: CommunityDerived;
  selectedNpc: Npc | null;
  followSelected: boolean;
  thoughtLoading: boolean;
  onToggleFollow: () => void;
  onClearSelection: () => void;
  onRefreshThought: (npcId: string) => void;
  onOpenCommunityDrawer: () => void;
}

type CitizenTab = 'estado' | 'mente' | 'rasgos' | 'economia';

const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  valentia: 'Valentía',
  laboriosidad: 'Laboriosidad',
  codicia: 'Codicia',
  rebeldia: 'Rebeldía',
  resiliencia: 'Resiliencia',
};

const CitizenAvatar: React.FC<{ npc: Npc }> = ({ npc }) => {
  const def = ROLE_CATALOG[npc.rol];
  const mood =
    npc.variables.satisfaccion >= 65
      ? 'happy'
      : npc.variables.satisfaccion < 35 || npc.variables.hambre > 75
      ? 'upset'
      : 'neutral';

  return (
    <svg
      viewBox="0 0 48 48"
      className="w-12 h-12 rounded bg-slate-800 border border-slate-600 shrink-0"
      aria-hidden="true"
    >
      <path d="M10 46 C10 34, 38 34, 38 46 Z" fill={def.color} />
      <circle cx="24" cy="24" r="9" fill="#f2c6a7" />
      {npc.rol === 'agricultor' ? (
        <>
          <ellipse cx="24" cy="16" rx="14" ry="3.5" fill="#eab308" />
          <path d="M16 16 Q24 9 32 16 Z" fill="#ca8a04" />
        </>
      ) : npc.rol === 'policia' ? (
        <path d="M14 19 L34 19 L32 12 L16 12 Z" fill="#1e3a8a" />
      ) : npc.rol === 'ingeniero' ? (
        <path d="M14 19 Q24 9 34 19 Z" fill="#facc15" />
      ) : (
        <path
          d="M15 22 Q24 11 33 22 Q33 14 24 14 Q15 14 15 22 Z"
          fill={npc.rol === 'jubilado' ? '#e2e8f0' : '#334155'}
        />
      )}
      <circle cx="20.5" cy="23.5" r="1.3" fill="#0f172a" />
      <circle cx="27.5" cy="23.5" r="1.3" fill="#0f172a" />
      {mood === 'happy' && (
        <path d="M20 28 Q24 31 28 28" fill="none" stroke="#0f172a" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {mood === 'neutral' && (
        <line x1="20.5" y1="28.5" x2="27.5" y2="28.5" stroke="#0f172a" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {mood === 'upset' && (
        <path d="M20 30 Q24 27 28 30" fill="none" stroke="#0f172a" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
};

export const CitizenCard: React.FC<CitizenCardProps> = ({
  state,
  derived,
  selectedNpc,
  followSelected,
  thoughtLoading,
  onToggleFollow,
  onClearSelection,
  onRefreshThought,
  onOpenCommunityDrawer,
}) => {
  const [tab, setTab] = useState<CitizenTab>('estado');

  if (!selectedNpc) {
    return (
      <div className="pointer-events-auto fixed top-12 right-3 z-20 bg-slate-800/92 backdrop-blur-sm border-t border-l border-slate-500/50 border-b-2 border-r-2 border-slate-950 rounded px-3 py-2 shadow-xl text-xs w-[225px]">
        <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-700">
          <span className="font-semibold text-slate-100 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-teal-400" />
            Comunidad ({derived.poblacion})
          </span>
          <button
            type="button"
            onClick={onOpenCommunityDrawer}
            className="text-[11px] text-teal-300 hover:text-white font-medium"
          >
            Roles
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-[11px]">
          <div className="flex justify-between">
            <span className="font-sans text-slate-400">Sat.</span>
            <span className="font-semibold text-white">{derived.satisfaccionMedia}%</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-400">Apoyo</span>
            <span className={derived.apoyoPct >= 50 ? 'font-semibold text-emerald-400' : 'font-semibold text-amber-400'}>
              {derived.apoyoPct}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-400">Malestar</span>
            <span className={derived.descontentosPct > 30 ? 'font-semibold text-rose-400' : 'font-semibold text-slate-200'}>
              {derived.descontentosPct}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-400">Hambre</span>
            <span className={derived.hambreCriticaPct > 20 ? 'font-semibold text-rose-400' : 'font-semibold text-slate-200'}>
              {derived.hambreCriticaPct}%
            </span>
          </div>
        </div>
      </div>
    );
  }

  const def = ROLE_CATALOG[selectedNpc.rol];
  const stage = getStage(selectedNpc.edad);
  const prod = Math.round(getNpcProductivity(selectedNpc, state) * 100);
  const districtName = getNpcDistrictName(selectedNpc);

  return (
    <div className="pointer-events-none fixed top-12 right-3 z-20">
      <RctWindow
        title={selectedNpc.nombre}
        subtitle={`${def.nombre} · ${selectedNpc.edad} años (${stage})`}
        tone="teal"
        icon={<User className="w-3.5 h-3.5" />}
        onClose={onClearSelection}
        className="w-[310px]"
      >
        <div className="p-3 space-y-2.5">
          {/* Portrait + Location + Camera Lock */}
          <div className="flex items-center gap-2.5">
            <CitizenAvatar npc={selectedNpc} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[11px] text-teal-300 truncate capitalize font-medium">
                {districtName}
              </div>
              <div className="text-[11px] text-slate-300 truncate capitalize">
                {selectedNpc.accionIa ? selectedNpc.accionIa.nombre : selectedNpc.mapa.accion}
              </div>
              <button
                type="button"
                onClick={onToggleFollow}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold border transition-colors ${
                  followSelected
                    ? 'bg-teal-700 border-teal-400 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                {followSelected ? 'Siguiendo cámara' : 'Seguir vecino'}
              </button>
            </div>
          </div>

          {/* RCT Sub-Window Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-slate-950/70 p-1 rounded-sm border border-slate-800">
            {(
              [
                { id: 'estado', label: 'Estado', icon: HeartPulse },
                { id: 'mente', label: 'Mente', icon: Brain },
                { id: 'rasgos', label: 'Rasgos', icon: Sliders },
                { id: 'economia', label: 'Dinero', icon: Coins },
              ] as Array<{ id: CitizenTab; label: string; icon: React.ComponentType<{ className?: string }> }>
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center py-1 rounded-sm text-[10px] font-medium transition-colors ${
                    active ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mb-0.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab 1: Estado */}
          {tab === 'estado' && (
            <div className="space-y-2">
              {(
                [
                  { key: 'salud', label: 'Salud', val: selectedNpc.variables.salud, invert: false },
                  { key: 'hambre', label: 'Hambre', val: selectedNpc.variables.hambre, invert: true },
                  { key: 'miedo', label: 'Miedo', val: selectedNpc.variables.miedo, invert: true },
                  { key: 'satisfaccion', label: 'Satisfacción', val: selectedNpc.variables.satisfaccion, invert: false },
                  { key: 'lealtad', label: 'Apoyo / Lealtad', val: selectedNpc.variables.lealtad, invert: false },
                ] as const
              ).map((item) => {
                const v = Math.round(item.val);
                const bad = item.invert ? v > 70 : v < 30;
                const barColor = bad ? 'bg-rose-500' : item.invert ? 'bg-amber-500' : 'bg-teal-500';
                return (
                  <div key={item.key} className="text-[11px]">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono font-semibold text-white tabular-nums">{v}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                      <div className={`h-full ${barColor}`} style={{ width: `${v}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2: Mente */}
          {tab === 'mente' && (
            <div className="space-y-2.5 text-xs">
              <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                    <MessageSquareQuote className="w-3.5 h-3.5 text-teal-400" />
                    Pensamiento
                  </span>
                  <button
                    type="button"
                    onClick={() => onRefreshThought(selectedNpc.id)}
                    disabled={thoughtLoading}
                    className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${thoughtLoading ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>
                <p className="text-slate-200 italic leading-relaxed">
                  {thoughtLoading && !selectedNpc.pensamientoCache
                    ? 'Escuchando al habitante...'
                    : `“${selectedNpc.pensamientoCache?.texto || 'Pensando en la jornada...'}”`}
                </p>
              </div>

              {selectedNpc.accionIa && (
                <div className="border border-amber-500/40 bg-amber-950/40 rounded p-2 text-xs">
                  <div className="font-semibold text-amber-300">
                    {selectedNpc.accionIa.nombre} ({selectedNpc.accionIa.diasRestantes}d)
                  </div>
                  <p className="text-amber-100/90 text-[11px] mt-0.5">{selectedNpc.accionIa.texto}</p>
                </div>
              )}

              {selectedNpc.modificadores.length > 0 && (
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {selectedNpc.modificadores.map((mod) => (
                    <div key={mod.id} className="bg-slate-950/50 rounded p-1.5 border border-slate-800 text-[11px]">
                      <div className="text-slate-200">{mod.texto}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {mod.origen} · {mod.diasRestantes}d
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Rasgos */}
          {tab === 'rasgos' && (
            <div className="space-y-1.5 text-[11px]">
              {(Object.keys(TRAIT_LABELS) as PersonalityTrait[]).map((trait) => {
                const base = selectedNpc.personalidad[trait];
                const eff = Math.round(getEffectiveTrait(selectedNpc, trait));
                const delta = Math.round(getModifierDelta(selectedNpc, trait));
                return (
                  <div key={trait} className="flex items-center justify-between py-0.5 border-b border-slate-800/60">
                    <span className="text-slate-300">{TRAIT_LABELS[trait]}</span>
                    <span className="font-mono tabular-nums text-white font-semibold">
                      {base}
                      {delta !== 0 && (
                        <span className={delta > 0 ? 'text-amber-400 ml-1' : 'text-teal-400 ml-1'}>
                          ({delta > 0 ? '+' : ''}
                          {delta} → {eff})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-1 text-slate-400">
                <span>Nivel educativo</span>
                <span className="font-mono text-white font-semibold">Nivel {selectedNpc.educacion.nivel}/3</span>
              </div>
            </div>
          )}

          {/* Tab 4: Economía */}
          {tab === 'economia' && (
            <div className="space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="font-sans text-slate-400">Productividad</span>
                <span className="font-semibold text-white">{prod}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="font-sans text-slate-400">Último ingreso neto</span>
                <span className="font-semibold text-emerald-400">
                  ${selectedNpc.economia.ultimoIngresoNeto.toFixed(1)}/d
                </span>
              </div>
              {state.config.economiaModulo !== 'simple' && (
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="font-sans text-slate-400">Ahorros personales</span>
                  <span className="font-semibold text-white">${selectedNpc.economia.dinero.toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="font-sans text-slate-400">Acceso a alimento</span>
                <span className="font-semibold text-teal-300">
                  {Math.round((state.ultimaSalidaEconomica.accesoComida[selectedNpc.id] ?? 1) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
