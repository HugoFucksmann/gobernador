import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Crosshair,
  Hammer,
  HeartPulse,
  IdCard,
  Landmark,
  Lock,
  Newspaper,
  Store,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  BUILDING_CATALOG,
  DISTRICT_BY_ID,
  GOVERNOR_BUILDABLE_TYPES,
  OBRAS_LEVEL_TABLE,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../../data/catalogs';
import { getNpcDistrictName } from '../../engine/npcInsights';
import { getBuildingJobCaps, sumPeriodExpenses } from '../../engine/policies';
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
  BuildingType,
  CommunityDerived,
  DistrictId,
  GameState,
  Npc,
  Parcela,
  PersonalityTrait,
} from '../../types/game';
import { LandmarkId, WindowId } from '../../types/ui';
import { HintIcon, UiTooltip } from './UiTooltip';

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
  difunde: 'Rumor',
  repara: 'Repara',
  cuida: 'Cuida',
  toma: 'Toma alimento',
};

const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  valentia: 'Valentía',
  laboriosidad: 'Laboriosidad',
  codicia: 'Codicia',
  rebeldia: 'Rebeldía',
  resiliencia: 'Resiliencia',
};

interface SideInspectorPanelProps {
  state: GameState;
  derived: CommunityDerived;
  selectedNpc: Npc | null;
  selectedParcela: Parcela | null;
  selectedLandmark: LandmarkId | null;
  sideBuildOpen: boolean;
  followSelected: boolean;
  aiBusy: boolean;
  onToggleFollow: () => void;
  onClosePanel: () => void;
  onSelectParcela: (parcelaId: string) => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onBuildInParcela: (parcelaId: string, tipo: BuildingType) => { ok: boolean; error?: string };
  onDemolishParcela: (parcelaId: string) => { ok: boolean; error?: string };
  onRespondDemand: (demandId: string, accept: boolean) => { ok: boolean; error?: string };
  onOpenWindow: (win: WindowId) => void;
  onTriggerPress: () => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

type CitizenTab = 'estado' | 'actividad' | 'ficha';

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
      className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0"
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
        <path d="M14 19 L34 19 L32 12 L16 12 Z" fill="#3f3f46" />
      ) : npc.rol === 'ingeniero' ? (
        <path d="M14 19 Q24 9 34 19 Z" fill="#facc15" />
      ) : npc.rol === 'empresario' ? (
        <>
          <rect x="13" y="15" width="22" height="3" rx="1" fill="#18181b" />
          <rect x="17" y="9" width="14" height="6" rx="1" fill="#09090b" />
          <rect x="17" y="13.5" width="14" height="1.5" fill="#f59e0b" />
        </>
      ) : (
        <path
          d="M15 22 Q24 11 33 22 Q33 14 24 14 Q15 14 15 22 Z"
          fill={npc.rol === 'jubilado' ? '#e4e4e7' : '#3f3f46'}
        />
      )}
      <circle cx="20.5" cy="23.5" r="1.3" fill="#09090b" />
      <circle cx="27.5" cy="23.5" r="1.3" fill="#09090b" />
      {mood === 'happy' && (
        <path d="M20 28 Q24 31 28 28" fill="none" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {mood === 'neutral' && (
        <line x1="20.5" y1="28.5" x2="27.5" y2="28.5" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {mood === 'upset' && (
        <path d="M20 30 Q24 27 28 30" fill="none" stroke="#09090b" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
};

export const SideInspectorPanel: React.FC<SideInspectorPanelProps> = ({
  state,
  derived,
  selectedNpc,
  selectedParcela,
  selectedLandmark,
  sideBuildOpen,
  followSelected,
  aiBusy,
  onToggleFollow,
  onClosePanel,
  onSelectParcela,
  onJumpDistrict,
  onBuildInParcela,
  onDemolishParcela,
  onRespondDemand,
  onOpenWindow,
  onTriggerPress,
  onInspectCausal,
}) => {
  const [npcTab, setNpcTab] = useState<CitizenTab>('estado');
  const [buildFilter, setBuildFilter] = useState<'libres' | 'todas'>('libres');
  const [parcelError, setParcelError] = useState<string | null>(null);

  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const isG0 = govLevel === 'G0';
  const isG1 = govLevel === 'G1';

  const hasPanelOpen = Boolean(selectedNpc || selectedParcela || selectedLandmark || sideBuildOpen);

  // When no inspector is open, surface only urgent active actor demands cleanly in the same corner
  if (!hasPanelOpen) {
    if (state.demandasActivas.length === 0) return null;

    return (
      <aside className="pointer-events-auto fixed top-20 right-4 z-25 w-[340px] max-w-[calc(100vw-32px)] bg-zinc-900/95 backdrop-blur-md border border-amber-500/50 rounded-2xl p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Demandas ({state.demandasActivas.length})
          </span>
        </div>

        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {state.demandasActivas.map((dem) => (
            <div
              key={dem.id}
              className="space-y-2 pt-3 first:pt-0 border-t first:border-t-0 border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <UiTooltip text={`${dem.razon} · Si rechazas o vence: ${dem.amenaza}`} placement="left">
                  <span className="font-semibold text-sm text-white truncate cursor-help">
                    {dem.actorNombre}
                  </span>
                </UiTooltip>
                <span className="font-mono text-xs font-semibold text-amber-300 shrink-0 tabular-nums">
                  {dem.diasRestantes}d
                </span>
              </div>

              <div className="text-sm text-zinc-200 leading-snug">{dem.pedido.etiqueta}</div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <UiTooltip text={`Aceptar compromiso (${dem.diasCompromiso}d)`} placement="top">
                  <button
                    type="button"
                    disabled={isG0}
                    onClick={() => onRespondDemand(dem.id, true)}
                    className="w-full py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 transition-colors"
                  >
                    Aceptar
                  </button>
                </UiTooltip>
                <UiTooltip text={`Rechazar: ${dem.amenaza}`} placement="top">
                  <button
                    type="button"
                    disabled={isG0}
                    onClick={() => onRespondDemand(dem.id, false)}
                    className="w-full py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl disabled:opacity-40 transition-colors"
                  >
                    Rechazar
                  </button>
                </UiTooltip>
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  // Unified Header metadata for whichever entity opened the single side panel
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  let headerTitle = '';
  let headerSub = '';
  let HeaderIcon: React.ReactNode = null;

  if (selectedNpc) {
    headerTitle = selectedNpc.nombre;
    headerSub = `${ROLE_CATALOG[selectedNpc.rol].nombre} · ${selectedNpc.edad}a`;
    HeaderIcon = <User className="w-4 h-4 text-emerald-400" />;
  } else if (selectedParcela) {
    const distName = DISTRICT_BY_ID[selectedParcela.distrito]?.nombre ?? selectedParcela.distrito;
    headerTitle = selectedParcela.nombre;
    headerSub = `${distName} · Zona ${selectedParcela.zona}`;
    HeaderIcon = <Building2 className="w-4 h-4 text-emerald-400" />;
  } else if (selectedLandmark === 'palacio') {
    headerTitle = 'Palacio de Gobierno';
    headerSub = 'Sede ejecutiva';
    HeaderIcon = <Landmark className="w-4 h-4 text-emerald-400" />;
  } else if (selectedLandmark === 'prensa') {
    headerTitle = 'Redacción de Prensa';
    headerSub = `${state.medios.length} medio(s)`;
    HeaderIcon = <Newspaper className="w-4 h-4 text-amber-400" />;
  } else if (selectedLandmark === 'mercado') {
    headerTitle = 'Plaza del Mercado';
    headerSub = 'Abasto y comercio';
    HeaderIcon = <Store className="w-4 h-4 text-amber-400" />;
  } else {
    headerTitle = 'Construir';
    headerSub = `${derived.parcelasLibres} parcelas libres`;
    HeaderIcon = <Hammer className="w-4 h-4 text-emerald-400" />;
  }

  const handleClose = () => {
    setParcelError(null);
    onClosePanel();
  };

  return (
    <aside className="pointer-events-auto fixed top-20 right-4 z-25 w-[360px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-176px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      {/* Unified Panel Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0">{HeaderIcon}</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight truncate text-white">{headerTitle}</h2>
            <p className="text-xs text-zinc-400 truncate mt-0.5 capitalize">{headerSub}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          title="Cerrar panel"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Unified Scrollable Body */}
      <div className="p-5 overflow-y-auto space-y-4 text-sm">
        {/* 1. NPC VIEW */}
        {selectedNpc && (() => {
          const def = ROLE_CATALOG[selectedNpc.rol];
          const stage = getStage(selectedNpc.edad);
          const prod = Math.round(getNpcProductivity(selectedNpc, state) * 100);
          const districtName = getNpcDistrictName(selectedNpc);
          const zonesCount = getWorldZones(state).length;
          const effZone = getEffectiveZone(selectedNpc, zonesCount);

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <CitizenAvatar npc={selectedNpc} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs text-zinc-400 capitalize truncate">
                    {districtName} · Zona {effZone} · {stage}
                  </div>
                  <div className="text-sm font-medium text-zinc-100 truncate capitalize">
                    {selectedNpc.accionIa ? selectedNpc.accionIa.nombre : selectedNpc.mapa.accion}
                  </div>
                  {(selectedNpc.hospital.internado || selectedNpc.hospital.esperandoCama) && (
                    <div className="text-xs font-semibold text-amber-300">
                      {selectedNpc.hospital.internado
                        ? `Internado (${selectedNpc.hospital.diasInternado}d)`
                        : 'Esperando cama'}
                    </div>
                  )}
                </div>
                <UiTooltip text={followSelected ? 'Dejar de seguir' : 'Seguir con la cámara'} placement="left">
                  <button
                    type="button"
                    onClick={onToggleFollow}
                    aria-label="Seguir vecino"
                    className={`p-2.5 rounded-xl border transition-colors shrink-0 ${
                      followSelected
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    <Crosshair className="w-4 h-4" />
                  </button>
                </UiTooltip>
              </div>

              {/* 3 Tabs */}
              <div className="grid grid-cols-3 gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl">
                {(
                  [
                    { id: 'estado', label: 'Estado', icon: HeartPulse },
                    { id: 'actividad', label: 'Actividad', icon: Activity },
                    { id: 'ficha', label: 'Ficha', icon: IdCard },
                  ] as Array<{ id: CitizenTab; label: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((t) => {
                  const Icon = t.icon;
                  const active = npcTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNpcTab(t.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        active ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {npcTab === 'estado' && (
                <div className="space-y-3">
                  {(
                    [
                      { key: 'salud', label: 'Salud', val: selectedNpc.variables.salud, invert: false },
                      { key: 'hambre', label: 'Hambre', val: selectedNpc.variables.hambre, invert: true },
                      { key: 'miedo', label: 'Miedo', val: selectedNpc.variables.miedo, invert: true },
                      { key: 'satisfaccion', label: 'Ánimo', val: selectedNpc.variables.satisfaccion, invert: false },
                      { key: 'lealtad', label: 'Apoyo', val: selectedNpc.variables.lealtad, invert: false },
                    ] as const
                  ).map((item) => {
                    const v = Math.round(item.val);
                    const bad = item.invert ? v > 70 : v < 30;
                    const mid = item.invert ? v > 40 : v < 55;
                    const barColor = bad ? 'bg-rose-500' : mid ? 'bg-amber-400' : 'bg-emerald-500';
                    return (
                      <div key={item.key} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-300">{item.label}</span>
                          <span className="font-mono font-bold text-white tabular-nums">{v}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {npcTab === 'actividad' && (
                <div className="space-y-3">
                  {selectedNpc.accionIa ? (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-950/35 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-amber-300">
                          {selectedNpc.accionIa.nombre} · {selectedNpc.accionIa.diasRestantes}d
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onInspectCausal(
                              `${selectedNpc.nombre}: ${selectedNpc.accionIa!.nombre}`,
                              selectedNpc.accionIa!.causa || selectedNpc.accionIa!.origen,
                              selectedNpc.accionIa!.texto
                            )
                          }
                          className="text-xs font-semibold text-amber-300 hover:text-white underline shrink-0"
                        >
                          ¿Por qué?
                        </button>
                      </div>
                      <p className="text-xs text-zinc-200 leading-relaxed">{selectedNpc.accionIa.texto}</p>
                      {selectedNpc.accionIa.efectos && selectedNpc.accionIa.efectos.length > 0 && (
                        <div className="text-xs text-zinc-400">
                          {selectedNpc.accionIa.efectos.map((ef) => EFFECT_LABELS[ef.id]).join(' · ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-zinc-800/60 rounded-xl p-3.5 text-sm text-zinc-200 capitalize">
                      {selectedNpc.hospital.internado
                        ? `Internado (${selectedNpc.hospital.diasInternado}d)`
                        : selectedNpc.hospital.esperandoCama
                        ? 'Esperando cama'
                        : `${selectedNpc.mapa.accion} (${def.nombre})`}
                    </div>
                  )}

                  {selectedNpc.modificadores.length > 0 ? (
                    <div className="space-y-2 max-h-[180px] overflow-y-auto divide-y divide-zinc-800">
                      {selectedNpc.modificadores.map((mod) => (
                        <div key={mod.id} className="pt-2.5 first:pt-0 flex items-start justify-between gap-2 text-xs">
                          <span className="text-zinc-200 leading-snug">
                            {mod.texto}{' '}
                            <span className="font-mono text-zinc-500">({mod.diasRestantes}d)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onInspectCausal(
                                `Modificador de ${selectedNpc.nombre}`,
                                mod.causa || mod.origen,
                                mod.texto
                              )
                            }
                            className="text-emerald-400 hover:text-white underline shrink-0 font-semibold"
                          >
                            ¿Por qué?
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">Sin eventos activos hoy.</div>
                  )}
                </div>
              )}

              {npcTab === 'ficha' && (
                <div className="space-y-4">
                  <div className="space-y-2 font-mono tabular-nums text-sm pb-3 border-b border-zinc-800">
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Productividad</span>
                      <span className="font-semibold text-white">{prod}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Ingreso</span>
                      <span className="font-semibold text-emerald-400">
                        ${selectedNpc.economia.ultimoIngresoNeto.toFixed(1)}/d
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Ahorros</span>
                      <span className="font-semibold text-white">${selectedNpc.economia.dinero.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Despensa</span>
                      <span
                        className={`font-semibold ${
                          selectedNpc.economia.despensa < 1.5 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {selectedNpc.economia.despensa.toFixed(1)}d
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Acceso comida</span>
                      <span className="font-semibold text-zinc-200">
                        {Math.round((state.ultimaSalidaEconomica.accesoComida[selectedNpc.id] ?? 1) * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Educación</span>
                      <span className="font-semibold text-white">N{selectedNpc.educacion.nivel}/3</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-400">Rasgos</div>
                    {(Object.keys(TRAIT_LABELS) as PersonalityTrait[]).map((trait) => {
                      const base = selectedNpc.personalidad[trait];
                      const eff = Math.round(getEffectiveTrait(selectedNpc, trait));
                      const delta = Math.round(getModifierDelta(selectedNpc, trait));
                      return (
                        <div key={trait} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">{TRAIT_LABELS[trait]}</span>
                          <span className="font-mono tabular-nums text-white font-semibold">
                            {base}
                            {delta !== 0 && (
                              <span className={delta > 0 ? 'text-amber-300 ml-1' : 'text-emerald-400 ml-1'}>
                                → {eff}
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
          );
        })()}

        {/* 2. PARCELA / EDIFICIO EN PARCELA VIEW */}
        {selectedParcela && (() => {
          const b = selectedParcela.edificio;
          const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
          const hito = selectedParcela.hitoRequerido
            ? preset.hitos.find((h) => h.id === selectedParcela.hitoRequerido)
            : undefined;
          const obrasRow = OBRAS_LEVEL_TABLE[state.gobierno.palancasVigentes.nivelObras];
          const infraFactor = state.gobierno.indicadores.infraestructura < 30 ? 1.35 : 1.0;

          return (
            <div className="space-y-4">
              {parcelError && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-rose-200">
                  {parcelError}
                </div>
              )}

              {selectedParcela.estado === 'bloqueada' && (
                <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-zinc-200">
                    <Lock className="w-4 h-4 text-zinc-400" />
                    <span>Bloqueada</span>
                  </div>
                  <div className="text-xs text-zinc-300">
                    {hito ? hito.nombre : 'Se habilita por progreso.'}
                  </div>
                  {hito && (
                    <>
                      <div className="text-xs text-zinc-400">{hito.descripcion}</div>
                      <div className="font-mono text-xs text-amber-300 tabular-nums pt-1">
                        Racha: {state.hitosRacha[hito.id] ?? 0}/{hito.condicion.periodos} períodos
                      </div>
                    </>
                  )}
                </div>
              )}

              {selectedParcela.estado === 'libre' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400">Parcela disponible</span>
                    <span className="font-mono text-zinc-300 tabular-nums">
                      Caja ${Math.round(state.gobierno.reserva)}
                    </span>
                  </div>

                  {isG0 && (
                    <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded-xl p-3">
                      Modo G0: sin construcción manual.
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {GOVERNOR_BUILDABLE_TYPES.map((tipo) => {
                      const def = BUILDING_CATALOG[tipo];
                      const gatedG2 = Boolean(def.requiereG2) && isG1;
                      const noFunds = state.gobierno.reserva < def.costoObra;
                      const estDays = Math.max(
                        1,
                        Math.round(def.diasObra * obrasRow.diasObraFactor * infraFactor)
                      );
                      const disabled = isG0 || gatedG2 || noFunds;

                      return (
                        <div
                          key={tipo}
                          className="bg-zinc-800/65 hover:bg-zinc-800 border border-zinc-700/70 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white truncate">{def.nombre}</span>
                              <HintIcon
                                text={`${def.descripcion} · Mant. $${def.mantenimientoPeriodo}/per${def.requiereG2 ? ' · Requiere G2+' : ''}`}
                                placement="left"
                              />
                            </div>
                            <div className="font-mono text-xs text-amber-300 tabular-nums">
                              ${def.costoObra} · {estDays}d
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              setParcelError(null);
                              const res = onBuildInParcela(selectedParcela.id, tipo);
                              if (!res.ok) setParcelError(res.error ?? 'No se pudo construir.');
                            }}
                            className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors"
                          >
                            {gatedG2 ? 'G2+' : noFunds ? 'Sin caja' : 'Construir'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(selectedParcela.estado === 'en_obra' || selectedParcela.estado === 'ocupada') && b && bDef && (
                <div className="space-y-4">
                  <div className="bg-zinc-800/65 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-white truncate">{bDef.nombre}</span>
                        <HintIcon text={bDef.descripcion} placement="left" />
                      </div>
                      <span className="text-xs text-zinc-400 shrink-0">
                        {b.dueno === 'estado' ? 'Público' : b.dueno === 'alimento' ? 'Alimento' : 'Comercio'}
                      </span>
                    </div>

                    {b.estado === 'en_obra' ? (
                      <div className="flex items-center gap-2 text-sm text-amber-300 font-semibold">
                        <Hammer className="w-4 h-4 shrink-0" />
                        <span>
                          En obra · {b.diasObraRestantes}/{b.diasObraTotal}d
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-emerald-400 font-semibold">
                        Operativo
                        {b.diasRestantesCampana !== undefined && (
                          <span className="text-amber-300 ml-2 font-mono">
                            · {b.diasRestantesCampana}d
                          </span>
                        )}
                      </div>
                    )}

                    {bDef.mantenimientoPeriodo > 0 && (
                      <div className="font-mono text-xs text-zinc-400 tabular-nums">
                        Mantenimiento: ${bDef.mantenimientoPeriodo}/per
                      </div>
                    )}
                  </div>

                  {b.dueno === 'estado' && !isG0 && (
                    <UiTooltip text="Demoler edificio sin reembolso" placement="top">
                      <button
                        type="button"
                        onClick={() => {
                          setParcelError(null);
                          const res = onDemolishParcela(selectedParcela.id);
                          if (!res.ok) setParcelError(res.error ?? 'No se pudo demoler.');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold bg-rose-600/85 hover:bg-rose-500 text-white rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Demoler
                      </button>
                    </UiTooltip>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* 3. LANDMARK EDIFICIO VIEWS (Palacio / Prensa / Mercado) */}
        {selectedLandmark === 'palacio' && (() => {
          const fin = state.gobierno.finanzas;
          const lastGastos = sumPeriodExpenses(fin);
          const caps = getBuildingJobCaps(
            state.parcelas,
            derived.poblacion,
            state.gobierno.palancasVigentes.nivelObras,
            state.config.poblacionInicial,
            state.gobierno.cuposFijos
          );
          const empPub =
            derived.roles.policia +
            derived.roles.medico +
            derived.roles.ingeniero +
            derived.roles.estatal +
            derived.roles.docente;
          const totalPubCaps = caps.policia + caps.medico + caps.ingeniero + caps.estatal + caps.docente;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Reserva</span>
                  <span className="text-base font-bold text-white">${Math.round(state.gobierno.reserva)}</span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Último cierre</span>
                  <span className={`text-base font-bold ${fin.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fin.saldo >= 0 ? '+' : ''}${fin.saldo.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Ing. / Gas.</span>
                  <span className="text-xs text-zinc-200">
                    +${fin.ingresos.toFixed(0)} / -${lastGastos.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-xs text-zinc-400 block">Personal púb.</span>
                  <span className="text-xs text-zinc-200">
                    {empPub}/{totalPubCaps}
                  </span>
                </div>
              </div>

              {state.demandasActivas.length > 0 && (
                <div className="rounded-xl bg-amber-950/40 border border-amber-500/40 p-3 text-xs text-amber-200">
                  {state.demandasActivas.length} demanda(s) esperando respuesta en Ciudad.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenWindow('palancas')}
                  className="py-2.5 px-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors"
                >
                  Palancas
                </button>
                <button
                  type="button"
                  onClick={() => onOpenWindow('ciudad')}
                  className="py-2.5 px-3 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl transition-colors"
                >
                  Ciudad
                </button>
              </div>
            </div>
          );
        })()}

        {selectedLandmark === 'prensa' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Últimos titulares</span>
              <span className="font-mono text-zinc-300">
                Pauta ${Math.round(state.gobierno.palancasVigentes.prensa)}/per
              </span>
            </div>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {state.noticias.slice(0, 4).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onInspectCausal(`${n.medioNombre}: ${n.titulo}`, n.causa || `noticia:${n.id}`, n.texto)}
                  className="w-full text-left bg-zinc-800/60 hover:bg-zinc-800 rounded-xl p-3 transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{n.medioNombre}</span>
                    <span className="font-mono">D{n.dia}</span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-100 leading-snug">{n.titulo}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={aiBusy || state.resultado.estado !== 'jugando'}
                onClick={onTriggerPress}
                className="py-2.5 px-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 transition-colors"
              >
                Publicar hoy
              </button>
              <button
                type="button"
                onClick={() => onOpenWindow('gaceta')}
                className="py-2.5 px-3 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl transition-colors"
              >
                Ver Gaceta
              </button>
            </div>
          </div>
        )}

        {selectedLandmark === 'mercado' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
              <div>
                <span className="font-sans text-xs text-zinc-400 block">Stock comida</span>
                <span className="text-base font-bold text-white">
                  {state.alimento.diasStock.toFixed(0)}d
                </span>
              </div>
              <div>
                <span className="font-sans text-xs text-zinc-400 block">Precio venta</span>
                <span className="text-base font-bold text-amber-300">
                  ${state.alimento.precio.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="font-sans text-xs text-zinc-400 block">Productora</span>
                <span className="text-xs text-zinc-200">
                  Sueldos {Math.round(state.empresas.alimento.factor * 100)}%
                </span>
              </div>
              <div>
                <span className="font-sans text-xs text-zinc-400 block">Comercio</span>
                <span className="text-xs text-zinc-200">
                  Sueldos {Math.round(state.empresas.comercio.factor * 100)}%
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenWindow('economia')}
              className="w-full py-2.5 px-4 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors"
            >
              Abrir Economía
            </button>
          </div>
        )}

        {/* 4. CONSTRUIR LIST (opened from BottomDock Construir) */}
        {sideBuildOpen && !selectedNpc && !selectedParcela && !selectedLandmark && (() => {
          const sorted = [...state.parcelas].sort((a, b) => a.orden - b.orden);
          const filtered =
            buildFilter === 'libres' ? sorted.filter((p) => p.estado === 'libre') : sorted;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBuildFilter('libres')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    buildFilter === 'libres' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Libres ({derived.parcelasLibres})
                </button>
                <button
                  type="button"
                  onClick={() => setBuildFilter('todas')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    buildFilter === 'todas' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Todas ({sorted.length})
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400 bg-zinc-800/40 rounded-xl">
                  No hay parcelas libres disponibles.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {filtered.map((p) => {
                    const b = p.edificio;
                    const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
                    const statusText =
                      p.estado === 'libre'
                        ? 'Libre'
                        : p.estado === 'bloqueada'
                        ? 'Bloqueada'
                        : p.estado === 'en_obra' && b && bDef
                        ? `${bDef.nombre} · ${b.diasObraRestantes}d`
                        : bDef
                        ? bDef.nombre
                        : 'Ocupada';
                    const statusTone =
                      p.estado === 'libre'
                        ? 'text-emerald-400'
                        : p.estado === 'en_obra'
                        ? 'text-amber-300'
                        : p.estado === 'bloqueada'
                        ? 'text-zinc-500'
                        : 'text-zinc-300';

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectParcela(p.id);
                          onJumpDistrict(p.distrito);
                        }}
                        className="w-full text-left bg-zinc-800/65 hover:bg-zinc-800 border border-zinc-700/70 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">{p.nombre}</div>
                          <div className={`text-xs mt-0.5 ${statusTone}`}>{statusText}</div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-400 shrink-0">
                          {p.estado === 'libre' ? 'Elegir' : 'Ver'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </aside>
  );
};
