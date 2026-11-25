import React, { useState } from 'react';
import {
  Activity,
  Crosshair,
  HeartPulse,
  IdCard,
  Newspaper,
  User,
  Users,
} from 'lucide-react';
import { ROLE_CATALOG } from '../../data/catalogs';
import { getNpcDistrictName } from '../../engine/npcInsights';
import {
  getEffectiveTrait,
  getEffectiveZone,
  getModifierDelta,
  getNpcProductivity,
  getStage,
  getWorldZones,
} from '../../engine/simulation';
import {
  ActionEffectId,
  CommunityDerived,
  GameState,
  Npc,
  PersonalityTrait,
} from '../../types/game';
import { RctWindow } from './RctWindow';

const EFFECT_LABELS: Record<ActionEffectId, string> = {
  fuera_de_puesto: 'Fuera de puesto',
  anima: 'Ánimo',
  agita: 'Agita zona',
  acapara: 'Acapara',
  moviliza: 'Moviliza',
  decorativa: 'Decorativa',
  gasta: 'Gasta',
  ahorra: 'Ahorra',
  comparte: 'Comparte',
  difunde: 'Difunde rumor',
  repara: 'Repara zona',
  cuida: 'Cuida vecinos',
  toma: 'Toma alimento',
};

interface CitizenCardProps {
  state: GameState;
  derived: CommunityDerived;
  selectedNpc: Npc | null;
  followSelected: boolean;
  onToggleFollow: () => void;
  onClearSelection: () => void;
  onOpenCommunityDrawer: () => void;
  onOpenGazette: () => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

type CitizenTab = 'estado' | 'actividad' | 'ficha';

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
      className="w-11 h-11 rounded bg-slate-800 border border-slate-700 shrink-0"
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
      ) : npc.rol === 'empresario' ? (
        <>
          <rect x="13" y="15" width="22" height="3" rx="1" fill="#1e293b" />
          <rect x="17" y="9" width="14" height="6" rx="1" fill="#0f172a" />
          <rect x="17" y="13.5" width="14" height="1.5" fill="#f59e0b" />
        </>
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
  onToggleFollow,
  onClearSelection,
  onOpenCommunityDrawer,
  onOpenGazette,
  onInspectCausal,
}) => {
  const [tab, setTab] = useState<CitizenTab>('estado');
  const [sideMode, setSideMode] = useState<'pulso' | 'noticias'>('pulso');

  if (!selectedNpc) {
    return (
      <div className="pointer-events-auto fixed top-14 right-3 z-20 bg-slate-900/92 backdrop-blur-md border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl text-xs w-[240px]">
        <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded border border-slate-700/80 text-[11px]">
            <button
              type="button"
              onClick={() => setSideMode('pulso')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-sm font-semibold ${
                sideMode === 'pulso' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              Pulso
            </button>
            <button
              type="button"
              onClick={() => setSideMode('noticias')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-sm font-semibold ${
                sideMode === 'noticias' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Newspaper className="w-3 h-3" />
              Noticias
            </button>
          </div>
          <button
            type="button"
            onClick={sideMode === 'pulso' ? onOpenCommunityDrawer : onOpenGazette}
            className="text-[11px] text-teal-300 hover:text-white font-medium"
          >
            {sideMode === 'pulso' ? 'Vecinos' : 'Gaceta'}
          </button>
        </div>

        {sideMode === 'pulso' ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-[11px]">
            <div className="flex justify-between">
              <span className="font-sans text-slate-400">Ánimo</span>
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
        ) : (
          <div className="space-y-1.5 max-h-[190px] overflow-y-auto divide-y divide-slate-800/80">
            {state.noticias.slice(0, 4).map((n) => (
              <div key={n.id} className="pt-1.5 first:pt-0">
                <button
                  type="button"
                  onClick={() => onInspectCausal(`${n.medioNombre}: ${n.titulo}`, n.causa || `noticia:${n.id}`, n.texto)}
                  className="text-left hover:text-teal-300 transition-colors"
                >
                  <div className="text-[10px] text-slate-400">
                    {n.medioNombre} · D{n.dia}
                  </div>
                  <div className="text-[11px] font-medium text-slate-100 leading-snug line-clamp-2">
                    {n.titulo}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const def = ROLE_CATALOG[selectedNpc.rol];
  const stage = getStage(selectedNpc.edad);
  const prod = Math.round(getNpcProductivity(selectedNpc, state) * 100);
  const districtName = getNpcDistrictName(selectedNpc);
  const zonesCount = getWorldZones(state).length;
  const effZone = getEffectiveZone(selectedNpc, zonesCount);

  return (
    <div className="pointer-events-none fixed top-14 right-3 z-20">
      <RctWindow
        title={selectedNpc.nombre}
        subtitle={`${def.nombre} · ${selectedNpc.edad} años (${stage})`}
        tone="teal"
        icon={<User className="w-3.5 h-3.5" />}
        onClose={onClearSelection}
        className="w-[296px]"
      >
        <div className="p-3 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <CitizenAvatar npc={selectedNpc} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[11px] text-teal-300 truncate capitalize font-medium">
                {districtName} · Zona {effZone}
              </div>
              <div className="text-[11px] text-slate-300 truncate capitalize">
                {selectedNpc.accionIa ? selectedNpc.accionIa.nombre : selectedNpc.mapa.accion}
              </div>
              {(selectedNpc.hospital.internado || selectedNpc.hospital.esperandoCama) && (
                <div className="text-[10px] font-semibold text-sky-300">
                  {selectedNpc.hospital.internado
                    ? `Internado en clínica (${selectedNpc.hospital.diasInternado}d)`
                    : 'Esperando cama en hospital'}
                </div>
              )}
              <button
                type="button"
                onClick={onToggleFollow}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  followSelected
                    ? 'bg-teal-700 border-teal-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                {followSelected ? 'Siguiendo cámara' : 'Seguir vecino'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-800/70 p-1 rounded border border-slate-700/80">
            {(
              [
                { id: 'estado', label: 'Estado', icon: HeartPulse },
                { id: 'actividad', label: 'Actividad', icon: Activity },
                { id: 'ficha', label: 'Ficha', icon: IdCard },
              ] as Array<{ id: CitizenTab; label: string; icon: React.ComponentType<{ className?: string }> }>
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center justify-center gap-1.5 py-1 rounded-sm text-[11px] font-semibold transition-colors ${
                    active ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === 'estado' && (
            <div className="space-y-2">
              {(
                [
                  { key: 'salud', label: 'Salud', val: selectedNpc.variables.salud, invert: false },
                  { key: 'hambre', label: 'Hambre', val: selectedNpc.variables.hambre, invert: true },
                  { key: 'miedo', label: 'Miedo', val: selectedNpc.variables.miedo, invert: true },
                  { key: 'satisfaccion', label: 'Satisfacción', val: selectedNpc.variables.satisfaccion, invert: false },
                  { key: 'lealtad', label: 'Apoyo electoral', val: selectedNpc.variables.lealtad, invert: false },
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

          {tab === 'actividad' && (
            <div className="space-y-2.5 text-xs">
              {selectedNpc.accionIa ? (
                <div className="border border-amber-500/40 bg-amber-950/35 rounded p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-amber-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {selectedNpc.accionIa.nombre} ({selectedNpc.accionIa.diasRestantes}d)
                      </span>
                      {selectedNpc.accionIa.origen.endsWith('/contagio') && (
                        <span className="px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded-sm bg-amber-900/70 text-amber-200 border border-amber-500/40">
                          Por contagio
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onInspectCausal(
                          `${selectedNpc.nombre}: ${selectedNpc.accionIa!.nombre}`,
                          selectedNpc.accionIa!.causa || selectedNpc.accionIa!.origen,
                          selectedNpc.accionIa!.texto
                        )
                      }
                      className="text-[10px] font-semibold text-amber-300 hover:text-white underline shrink-0"
                    >
                      ¿Por qué?
                    </button>
                  </div>
                  <p className="text-amber-100/90 text-[11px] mt-0.5">{selectedNpc.accionIa.texto}</p>
                  {selectedNpc.accionIa.efectos && selectedNpc.accionIa.efectos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selectedNpc.accionIa.efectos.map((ef, idx) => (
                        <span
                          key={`${ef.id}-${idx}`}
                          className="px-1.5 py-0.5 text-[10px] rounded-sm bg-slate-900/80 text-slate-300 border border-slate-700/80"
                        >
                          {EFFECT_LABELS[ef.id]}
                          {ef.intensidad ? ` (${ef.intensidad})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-800/45 rounded p-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">
                    Actividad actual
                  </div>
                  <p className="text-slate-200 text-[11px] capitalize">
                    {selectedNpc.hospital.internado
                      ? `Internado en clínica (${selectedNpc.hospital.diasInternado}d)`
                      : selectedNpc.hospital.esperandoCama
                      ? 'Esperando cama disponible en hospital'
                      : `${selectedNpc.mapa.accion} (${def.nombre} · zona ${effZone})`}
                  </p>
                </div>
              )}

              {selectedNpc.modificadores.length > 0 ? (
                <div className="space-y-1 max-h-[155px] overflow-y-auto divide-y divide-slate-800/70">
                  {selectedNpc.modificadores.map((mod) => (
                    <div key={mod.id} className="pt-1.5 first:pt-0 text-[11px]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-200">{mod.texto}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onInspectCausal(
                              `Modificador de ${selectedNpc.nombre}`,
                              mod.causa || mod.origen,
                              mod.texto
                            )
                          }
                          className="text-[10px] text-teal-400 hover:text-white underline shrink-0"
                        >
                          ¿Por qué?
                        </button>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {mod.origen} · {mod.diasRestantes}d
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic px-1">
                  Sin modificadores activos hoy.
                </div>
              )}
            </div>
          )}

          {tab === 'ficha' && (
            <div className="space-y-3 text-[11px]">
              <div className="space-y-1 font-mono tabular-nums pb-2 border-b border-slate-800">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Productividad</span>
                  <span className="font-semibold text-white">{prod}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Ingreso neto diario</span>
                  <span className="font-semibold text-emerald-400">
                    ${selectedNpc.economia.ultimoIngresoNeto.toFixed(1)}/d
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Ahorros</span>
                  <span className="font-semibold text-white">${selectedNpc.economia.dinero.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Despensa en casa</span>
                  <span
                    className={`font-semibold ${
                      selectedNpc.economia.despensa < 1.5 ? 'text-rose-400' : 'text-teal-300'
                    }`}
                  >
                    {selectedNpc.economia.despensa.toFixed(1)} d
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Propensión al gasto</span>
                  <span className="font-semibold text-slate-200">
                    {Math.round(selectedNpc.economia.propensionGasto * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Acceso a alimento</span>
                  <span className="font-semibold text-teal-300">
                    {Math.round((state.ultimaSalidaEconomica.accesoComida[selectedNpc.id] ?? 1) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-400">Nivel educativo</span>
                  <span className="font-semibold text-white">Nivel {selectedNpc.educacion.nivel}/3</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Rasgos personales
                </div>
                {(Object.keys(TRAIT_LABELS) as PersonalityTrait[]).map((trait) => {
                  const base = selectedNpc.personalidad[trait];
                  const eff = Math.round(getEffectiveTrait(selectedNpc, trait));
                  const delta = Math.round(getModifierDelta(selectedNpc, trait));
                  return (
                    <div key={trait} className="flex items-center justify-between py-0.5">
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
              </div>
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
