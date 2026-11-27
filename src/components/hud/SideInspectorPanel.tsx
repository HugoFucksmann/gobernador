import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  Crosshair,
  Hammer,
  HeartPulse,
  Home,
  IdCard,
  MapPin,
  Newspaper,
  Route,
  Search,
  Store,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  AUTOPILOT_CONSTANTS,
  BUILDING_CATALOG,
  GOVERNOR_BUILDABLE_TYPES,
  OBRAS_LEVEL_TABLE,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
  SERVICE_RADIUS_CONSTANTS,
} from '../../data/catalogs';
import { interlocutor } from '../../engine/lecturaV2';
import { evaluateNpcTopMoodFactor, getNpcZoneName } from '../../utils/npcInsights';
import {
  getBuildingJobCaps,
  getGovernorLevel,
  isGovernorAtLeast,
  isObserverMode,
} from '../../engine/policies';
import {
  computeHospitalFacilities,
  getEffectiveTrait,
  getEffectiveZone,
  getModifierDelta,
  getNpcProductivity,
  getStage,
  getWorldZones,
  TICKS_PER_DAY,
} from '../../engine/simulation';
import {
  buildTraversableZoneStepMap,
  computeZoneServiceCoverage,
  getFranjaDia,
  getNpcDailyAgenda,
  getParcelLandPrice,
  getParcelTerrainTiles,
  getRubroDisplayName,
  getTerrainBuildCostInfo,
  getViaTerrainTiles,
  isViaConnectableToNetwork,
} from '../../engine/worldHelpers';
import { InspectorDirectoryTab } from '../../hooks/useGameSession';
import {
  ActionEffectId,
  BuildingDefinition,
  BuildingType,
  CommunityDerived,
  Firma,
  FirmPart,
  GameState,
  Hogar,
  MediaOutlet,
  Npc,
  Parcela,
  PersonalityTrait,
  ViaTramo,
  ZoneDefinition,
  ZoneId,
} from '../../types/game';
import { MapHoverPreview } from '../../types/ui';
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
  ocupa: 'Ocupa vivienda',
  boicotea: 'Boicotea firma',
  emprendedor: 'Emprende firma',
};

const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  valentia: 'Valentía',
  laboriosidad: 'Laboriosidad',
  codicia: 'Codicia',
  rebeldia: 'Rebeldía',
  resiliencia: 'Resiliencia',
  sociabilidad: 'Sociabilidad',
};

function describeBuilding(def: BuildingDefinition): string {
  const parts: string[] = [];
  if (def.rubro) parts.push(`Rubro: ${getRubroDisplayName(def.rubro)}`);
  if (def.capacidadCasa) parts.push(`Capacidad ${def.capacidadCasa} pers.`);
  if (def.camasHospital) parts.push(`${def.camasHospital} camas`);
  if (def.bonusDefensa) parts.push(`+${def.bonusDefensa} defensa zonal`);
  if (def.defensaMuralla) parts.push(`+${def.defensaMuralla} protección muralla`);
  if (def.siloExtraDias) parts.push(`+${def.siloExtraDias}d de capacidad de silo`);
  if (def.reduccionSequiaPct) parts.push(`-${def.reduccionSequiaPct}% impacto de sequía`);
  const roles = Object.entries(def.puestos)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([r, count]) => `${count} ${ROLE_CATALOG[r as keyof typeof ROLE_CATALOG]?.nombre ?? r}`);
  if (roles.length > 0) parts.push(`Puestos: ${roles.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : def.nombre;
}

function renderOwnerBadges(
  partes: FirmPart[],
  npcs: Npc[],
  onSelectNpc?: (npcId: string) => void
) {
  return partes.map((pt, idx) => {
    const ownerNpc = pt.tipo === 'npc' ? npcs.find((n) => n.id === pt.id) : undefined;
    return ownerNpc ? (
      <button
        key={`${pt.id}_${idx}`}
        type="button"
        onClick={() => onSelectNpc?.(ownerNpc.id)}
        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 rounded-lg"
      >
        {ownerNpc.nombre} {ownerNpc.apellido} ({Math.round(pt.pct)}%)
      </button>
    ) : (
      <span key={`${pt.id}_${idx}`} className="px-2.5 py-1 bg-zinc-800 text-zinc-300 rounded-lg">
        {pt.tipo === 'estado' ? 'Estado' : pt.id} ({Math.round(pt.pct)}%)
      </span>
    );
  });
}

interface SideInspectorPanelProps {
  state: GameState;
  derived: CommunityDerived;
  selectedNpc: Npc | null;
  selectedHogar?: Hogar | null;
  selectedParcela: Parcela | null;
  selectedFirma?: Firma | null;
  selectedTramo: ViaTramo | null;
  selectedZona?: ZoneDefinition | null;
  selectedMedio?: MediaOutlet | null;
  inspectorSearchOpen?: InspectorDirectoryTab | null;
  sideBuildOpen: boolean;
  followSelected: boolean;
  onToggleFollow: () => void;
  onClosePanel: () => void;
  onSelectNpc?: (npcId: string) => void;
  onSelectHogar?: (hogarId: string) => void;
  onSelectParcela: (parcelaId: string) => void;
  onSelectFirma?: (firmaId: string) => void;
  onSelectTramo: (tramoId: string) => void;
  onSelectZona?: (zonaId: ZoneId) => void;
  onOpenDirectory?: (tab: InspectorDirectoryTab) => void;
  onJumpZone: (z: ZoneId | 'all') => void;
  onHoverPreview?: (preview: MapHoverPreview | null) => void;
  onBuildInParcela: (parcelaId: string, tipo: BuildingType) => { ok: boolean; error?: string };
  onBuildVia: (tramoId: string) => { ok: boolean; error?: string };
  onDemolishParcela: (parcelaId: string) => { ok: boolean; error?: string };
  onRespondDemand: (demandId: string, accept: boolean) => { ok: boolean; error?: string };
  onCounterOffer: (demandId: string) => { ok: boolean; aceptada?: boolean; error?: string; texto?: string };
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
      ) : npc.rol === 'ingeniero' || npc.rol === 'constructor' ? (
        <path d="M14 19 Q24 9 34 19 Z" fill="#facc15" />
      ) : npc.rol === 'empresario' || npc.rol === 'inmobiliario' ? (
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
  selectedHogar = null,
  selectedParcela,
  selectedFirma = null,
  selectedTramo,
  selectedZona = null,
  selectedMedio = null,
  inspectorSearchOpen = null,
  sideBuildOpen,
  followSelected,
  onToggleFollow,
  onClosePanel,
  onSelectNpc,
  onSelectHogar,
  onSelectParcela,
  onSelectFirma,
  onSelectTramo,
  onSelectZona,
  onOpenDirectory,
  onJumpZone,
  onHoverPreview,
  onBuildInParcela,
  onBuildVia,
  onDemolishParcela,
  onRespondDemand,
  onCounterOffer,
  onInspectCausal,
}) => {
  const [npcTab, setNpcTab] = useState<CitizenTab>('estado');
  const [buildSection, setBuildSection] = useState<'parcelas' | 'vias'>('parcelas');
  const [buildFilter, setBuildFilter] = useState<'libres' | 'todas'>('libres');
  const [directoryQuery, setDirectoryQuery] = useState<string>('');
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [demandNote, setDemandNote] = useState<string | null>(null);

  const govLevel = getGovernorLevel(state.config);
  const isG0 = isObserverMode(state.config);
  const isG1OrG2 = govLevel === 'G1' || govLevel === 'G2';
  const isG2Plus = isGovernorAtLeast(state.config, 'G2');
  const isG4 = govLevel === 'G4';

  const hasPanelOpen = Boolean(
    selectedNpc ||
      selectedHogar ||
      selectedParcela ||
      selectedFirma ||
      selectedTramo ||
      selectedZona ||
      selectedMedio ||
      inspectorSearchOpen ||
      sideBuildOpen
  );

  const renderDemandsList = (compact = false) => (
    <div className={`space-y-3 ${compact ? 'max-h-[168px]' : 'max-h-[320px]'} overflow-y-auto pr-1`}>
      {demandNote && (
        <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-amber-200">
          {demandNote}
        </div>
      )}
      {state.demandasActivas.map((dem) => {
        const actorRel = state.actoresEstado?.[dem.actorId];
        return (
          <div
            key={dem.id}
            className="space-y-1.5 pt-2.5 first:pt-0 border-t first:border-t-0 border-zinc-800"
          >
            <div className="flex items-center justify-between gap-2">
              <UiTooltip text={`${dem.razon} · Si rechazas o vence: ${dem.amenaza}`} placement="left">
                <span className="font-semibold text-xs sm:text-sm text-white truncate cursor-help">
                  {dem.esExtorsion && <span className="text-rose-400 mr-1">Extorsión ·</span>}
                  {dem.actorNombre}
                  {actorRel && (
                    <span className="text-[11px] font-normal text-zinc-400 ml-1">
                      ({actorRel.postura})
                    </span>
                  )}
                </span>
              </UiTooltip>
              <span className="font-mono text-xs font-semibold text-amber-300 shrink-0 tabular-nums">
                {dem.diasRestantes}d
              </span>
            </div>

            <div className="text-xs sm:text-sm text-zinc-200 leading-snug">{dem.pedido.etiqueta}</div>

            <div className={`grid ${isG4 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 pt-0.5`}>
              <UiTooltip text={`Aceptar compromiso (${dem.diasCompromiso}d)`} placement="top">
                <button
                  type="button"
                  disabled={isG0}
                  onClick={() => {
                    setDemandNote(null);
                    onRespondDemand(dem.id, true);
                  }}
                  className="w-full py-1.5 px-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Aceptar
                </button>
              </UiTooltip>
              {isG4 && (
                <UiTooltip text="Proponer término medio (G4)" placement="top">
                  <button
                    type="button"
                    disabled={isG0}
                    onClick={() => {
                      const res = onCounterOffer(dem.id);
                      setDemandNote(res.texto ?? res.error ?? null);
                    }}
                    className="w-full py-1.5 px-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    Contraoferta
                  </button>
                </UiTooltip>
              )}
              <UiTooltip text={`Rechazar: ${dem.amenaza}`} placement="top">
                <button
                  type="button"
                  disabled={isG0}
                  onClick={() => {
                    setDemandNote(null);
                    onRespondDemand(dem.id, false);
                  }}
                  className="w-full py-1.5 px-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Rechazar
                </button>
              </UiTooltip>
            </div>
          </div>
        );
      })}
    </div>
  );

  // When no inspector is open, surface only urgent active actor demands cleanly (only in governor mode)
  if (!hasPanelOpen) {
    if (isG0 || state.demandasActivas.length === 0) return null;

    return (
      <aside className="pointer-events-auto fixed top-20 right-4 z-25 w-[350px] max-w-[calc(100vw-32px)] bg-zinc-900/95 backdrop-blur-md border border-amber-500/50 rounded-2xl p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Demandas ({state.demandasActivas.length})
          </span>
        </div>
        {renderDemandsList(false)}
      </aside>
    );
  }

  let headerTitle = '';
  let headerSub = '';
  let HeaderIcon: React.ReactNode = null;

  if (selectedNpc) {
    headerTitle = `${selectedNpc.nombre} ${selectedNpc.apellido}`;
    headerSub = `${ROLE_CATALOG[selectedNpc.rol].nombre} · ${selectedNpc.edad}a`;
    HeaderIcon = <User className="w-4 h-4 text-emerald-400" />;
  } else if (selectedHogar) {
    const head = state.npcs.find((n) => n.id === selectedHogar.miembros[0]);
    headerTitle = head ? `Hogar ${head.apellido}` : selectedHogar.id;
    headerSub = `${selectedHogar.miembros.length} integrante(s) · ${state.zonas[selectedHogar.zona]?.nombre ?? selectedHogar.zona}`;
    HeaderIcon = <Users className="w-4 h-4 text-emerald-400" />;
  } else if (selectedParcela) {
    const zName = state.zonas[selectedParcela.zona]?.nombre ?? selectedParcela.zona;
    headerTitle = selectedParcela.nombre;
    headerSub = `${zName} · ${selectedParcela.tipoParcela}${selectedParcela.clase ? ` · Lote ${selectedParcela.clase}` : ''}`;
    HeaderIcon = <Building2 className="w-4 h-4 text-emerald-400" />;
  } else if (selectedFirma) {
    headerTitle = selectedFirma.nombre;
    headerSub = `${getRubroDisplayName(selectedFirma.rubro)} · ${state.zonas[selectedFirma.zona]?.nombre ?? selectedFirma.zona}`;
    HeaderIcon = <Store className="w-4 h-4 text-amber-400" />;
  } else if (selectedTramo) {
    headerTitle = selectedTramo.nombre;
    headerSub = `Vía (${selectedTramo.tipo}) · ${state.zonas[selectedTramo.zonaA]?.nombre ?? selectedTramo.zonaA}`;
    HeaderIcon = <Route className="w-4 h-4 text-amber-400" />;
  } else if (selectedZona) {
    headerTitle = selectedZona.nombre;
    headerSub = `Zona (${selectedZona.caracter}) · ${selectedZona.estado === 'no_urbanizada' ? 'Sin urbanizar' : 'Urbanizada'}`;
    HeaderIcon = <MapPin className="w-4 h-4 text-emerald-400" />;
  } else if (selectedMedio) {
    const afin = selectedMedio.lineaEditorial.afinidadGobierno;
    headerTitle = selectedMedio.nombre;
    headerSub = `Medio · ${afin >= 60 ? 'Oficialista' : afin <= 40 ? 'Crítica' : 'Independiente'}`;
    HeaderIcon = <Newspaper className="w-4 h-4 text-amber-400" />;
  } else if (inspectorSearchOpen) {
    headerTitle = 'Explorar comunidad';
    headerSub = `${derived.poblacion} personas · ${state.hogares.length} hogares · ${derived.mercado.firmas} firmas`;
    HeaderIcon = <Search className="w-4 h-4 text-emerald-400" />;
  } else {
    headerTitle = 'Construir';
    headerSub = `${derived.parcelasLibres} parcelas libres`;
    HeaderIcon = <Hammer className="w-4 h-4 text-emerald-400" />;
  }

  const handleClose = () => {
    setParcelError(null);
    onHoverPreview?.(null);
    onClosePanel();
  };

  const connectableVias = state.tramos.filter(
    (t) => !t.construida && !t.enObra && isViaConnectableToNetwork(state, t)
  );

  return (
    <aside className="pointer-events-auto fixed top-20 right-4 z-25 w-[370px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-176px)] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
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

      {/* Pinned Urgent Demands when another panel is open (only in governor mode) */}
      {!isG0 && state.demandasActivas.length > 0 && (
        <div className="px-5 py-3 bg-amber-950/35 border-b border-amber-500/40 shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Demandas activas ({state.demandasActivas.length})</span>
          </div>
          {renderDemandsList(true)}
        </div>
      )}

      {/* Unified Scrollable Body */}
      <div className="p-5 overflow-y-auto space-y-4 text-sm">
        {/* 1. NPC VIEW */}
        {selectedNpc && (() => {
          const def = ROLE_CATALOG[selectedNpc.rol];
          const stage = getStage(selectedNpc.edad);
          const prod = Math.round(getNpcProductivity(selectedNpc, state) * 100);
          const districtName = getNpcZoneName(selectedNpc, state);
          const zonesCount = getWorldZones(state).length;
          const effZone = getEffectiveZone(selectedNpc, zonesCount);
          const hogar = state.hogares.find((h) => h.id === selectedNpc.hogarId);
          const casa = hogar?.casaId ? state.casas.find((c) => c.id === hogar.casaId) : undefined;
          const topFactor = evaluateNpcTopMoodFactor(selectedNpc, state);
          const employerFirm = selectedNpc.empleadorId
            ? state.firmas.find((f) => f.id === selectedNpc.empleadorId)
            : undefined;
          const notableInfo = state.lectura?.notables.find((nt) => nt.npcId === selectedNpc.id);

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <CitizenAvatar npc={selectedNpc} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs text-zinc-400 truncate flex items-center gap-1.5">
                    <span>
                      {districtName} ({effZone}) · {stage}
                    </span>
                    {notableInfo && (
                      <span className="inline-flex items-center gap-1 text-amber-300 font-semibold capitalize">
                        · <Award className="w-3 h-3" />
                        {notableInfo.tipo}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-zinc-100 truncate capitalize">
                    {selectedNpc.accionIa ? selectedNpc.accionIa.nombre : selectedNpc.mapa.accion}
                  </div>
                  <div className="text-xs text-amber-300 truncate">{topFactor}</div>
                  {selectedNpc.capacitacion && (
                    <div className="text-xs font-semibold text-sky-300">
                      Capacitándose: {ROLE_CATALOG[selectedNpc.capacitacion.rolObjetivo].nombre} ({selectedNpc.capacitacion.diasRestantes}d)
                    </div>
                  )}
                  {(selectedNpc.hospital.internado || selectedNpc.hospital.esperandoCama) && (
                    <div className="text-xs font-semibold text-rose-300">
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
                    { id: 'ficha', label: 'Hogar y Ficha', icon: IdCard },
                  ] as Array<{ id: CitizenTab; label: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((t) => {
                  const Icon = t.icon;
                  const active = npcTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNpcTab(t.id)}
                      className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        active ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.label}</span>
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
                        <div className="w-full h-2.5 bg-zinc-800 rounded-sm overflow-hidden">
                          <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {npcTab === 'actividad' && (() => {
                const agenda = getNpcDailyAgenda(state, selectedNpc);
                const curFranja = getFranjaDia(state.reloj.tick, TICKS_PER_DAY);

                return (
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
                            {selectedNpc.accionIa.efectos.map((ef) => EFFECT_LABELS[ef.id] ?? ef.id).join(' · ')}
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

                    {/* 5-franja daily agenda from simulation engine */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-zinc-400">Agenda del día</div>
                      <div className="space-y-1">
                        {agenda.map((slot) => {
                          const isCurrent = slot.franja === curFranja;
                          return (
                            <div
                              key={slot.franja}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                                isCurrent
                                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-100'
                                  : 'bg-zinc-800/45 text-zinc-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="font-mono text-[11px] text-zinc-400 mr-1.5">{slot.horario}</span>
                                <span className={isCurrent ? 'font-semibold text-white' : ''}>{slot.actividad}</span>
                              </div>
                              {slot.parcelaId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectParcela(slot.parcelaId!);
                                    onJumpZone(slot.zona);
                                  }}
                                  className="text-[11px] text-emerald-400 hover:underline shrink-0 whitespace-nowrap"
                                >
                                  {state.zonas[slot.zona]?.nombre ?? slot.zona}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onJumpZone(slot.zona)}
                                  className="text-[11px] text-zinc-400 hover:text-white shrink-0 whitespace-nowrap"
                                >
                                  {state.zonas[slot.zona]?.nombre ?? slot.zona}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {selectedNpc.ritmo && (
                      <div className="bg-zinc-800/45 border border-zinc-800 rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="font-semibold text-zinc-300">Ritmo y hábitos</div>
                        <div className="grid grid-cols-2 gap-1.5 text-zinc-300">
                          <span>
                            Turno: <strong className="text-white capitalize">{selectedNpc.ritmo.turno}</strong>
                          </span>
                          <span>
                            Cronotipo:{' '}
                            <strong className="text-white font-mono">
                              {selectedNpc.ritmo.cronotipo > 0 ? `+${selectedNpc.ritmo.cronotipo}` : selectedNpc.ritmo.cronotipo}h
                            </strong>
                          </span>
                          <span>
                            Libre hoy:{' '}
                            <strong className="text-emerald-300 capitalize">
                              {selectedNpc.ritmo.libreHoyActividad ?? 'descanso'}
                            </strong>
                          </span>
                          <span>
                            Hábitos: <strong className="text-white">{selectedNpc.ritmo.habitos.length}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {notableInfo && (() => {
                      const inter = interlocutor(state, selectedNpc.id);
                      const recentNotables = state.eventos
                        .filter(
                          (ev) =>
                            ev.notable &&
                            (('npcId' in ev && ev.npcId === selectedNpc.id) ||
                              ('duenoId' in ev && ev.duenoId === selectedNpc.id) ||
                              ('compradorId' in ev && ev.compradorId === selectedNpc.id))
                        )
                        .slice(-3)
                        .reverse();
                      return (
                        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between font-semibold text-amber-300">
                            <span className="flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5" />
                              Persona clave ({notableInfo.tipo})
                            </span>
                            <span className="font-mono">Peso {Math.round(notableInfo.peso)}</span>
                          </div>
                          <div className="text-zinc-200">{notableInfo.motivo}</div>
                          {inter && (
                            <div className="text-zinc-400">
                              Postura: {inter.posturaHaciaEstado > 0 ? '+' : ''}
                              {inter.posturaHaciaEstado} · {inter.intereses.join(', ')}
                            </div>
                          )}
                          {recentNotables.length > 0 && (
                            <div className="pt-1 space-y-1 border-t border-amber-500/20">
                              {recentNotables.map((ev) => (
                                <div key={ev.id} className="flex justify-between text-[11px] text-zinc-300">
                                  <span>{ev.tipo} (D{ev.dia})</span>
                                  <button
                                    type="button"
                                    onClick={() => onInspectCausal(`Hecho notable (D${ev.dia})`, ev.id)}
                                    className="text-emerald-400 hover:underline"
                                  >
                                    ¿Por qué?
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {selectedNpc.modificadores.length > 0 ? (
                      <div className="space-y-2 max-h-[160px] overflow-y-auto divide-y divide-zinc-800 pt-1">
                        {selectedNpc.modificadores.map((mod) => (
                          <div key={mod.id} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
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
                );
              })()}

              {npcTab === 'ficha' && (() => {
                const parents = (selectedNpc.padresIds ?? [])
                  .map((id: string) => state.npcs.find((n) => n.id === id))
                  .filter((n): n is Npc => Boolean(n));
                const pareja = selectedNpc.parejaId ? state.npcs.find((n) => n.id === selectedNpc.parejaId) : undefined;
                const hijos = state.npcs.filter(
                  (n) => n.vivo && (n.padresIds ?? []).includes(selectedNpc.id)
                );

                return (
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
                    {employerFirm && (
                      <div className="flex justify-between gap-2">
                        <span className="font-sans text-zinc-400">Empleador</span>
                        <button
                          type="button"
                          onClick={() => onSelectFirma?.(employerFirm.id)}
                          className="font-sans font-semibold text-emerald-400 hover:underline truncate"
                        >
                          {employerFirm.nombre}
                        </button>
                      </div>
                    )}
                    {hogar && (
                      <>
                        <div className="flex justify-between gap-2">
                          <span className="font-sans text-zinc-400">Hogar ({hogar.miembros.length} p.)</span>
                          <button
                            type="button"
                            onClick={() => onSelectHogar?.(hogar.id)}
                            className="font-semibold text-emerald-400 hover:underline"
                          >
                            Caja ${hogar.dinero.toFixed(1)}
                          </button>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-sans text-zinc-400">Despensa hogar</span>
                          <span
                            className={`font-semibold ${
                              hogar.despensa / Math.max(1, hogar.miembros.length) < 1.5
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {(hogar.despensa / Math.max(1, hogar.miembros.length)).toFixed(1)}d/p
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-sans text-zinc-400">Vivienda</span>
                          {casa?.parcelaId ? (
                            <button
                              type="button"
                              onClick={() => onSelectParcela(casa.parcelaId)}
                              className="font-sans font-semibold text-emerald-400 hover:underline truncate"
                            >
                              {BUILDING_CATALOG[casa.tipo].nombre} ({Math.round(casa.estado)}%)
                            </button>
                          ) : (
                            <span
                              className={`font-sans font-semibold ${
                                hogar.estado === 'calle'
                                  ? 'text-rose-400'
                                  : hogar.estado === 'acogida'
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {hogar.estado === 'calle'
                                ? 'En calle'
                                : hogar.estado === 'acogida'
                                ? 'Acogida'
                                : 'Con casa'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Acceso comida</span>
                      <span className="font-semibold text-zinc-200">
                        {Math.round((state.ultimaSalidaEconomica.accesoComida[selectedNpc.hogarId] ?? 1) * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-sans text-zinc-400">Educación</span>
                      <span className="font-semibold text-white">N{selectedNpc.educacion.nivel}/3</span>
                    </div>
                    {selectedNpc.partes.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="text-xs font-sans text-amber-300">Participaciones societarias</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNpc.partes.map((pt) => {
                            const f = state.firmas.find((fi) => fi.id === pt.firmaId);
                            return (
                              <button
                                key={pt.firmaId}
                                type="button"
                                onClick={() => onSelectFirma?.(pt.firmaId)}
                                className="px-2 py-0.5 text-[11px] font-sans bg-zinc-800 hover:bg-zinc-700 text-amber-200 rounded-lg"
                              >
                                {f?.nombre ?? pt.firmaId} ({Math.round(pt.pct)}%)
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {(parents.length > 0 || pareja || hijos.length > 0) && (
                    <div className="space-y-1.5 pb-3 border-b border-zinc-800">
                      <div className="text-xs font-semibold text-zinc-400">Familia</div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {pareja && pareja.vivo && (
                          <button
                            type="button"
                            onClick={() => onSelectNpc?.(pareja.id)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 rounded-lg"
                          >
                            Pareja: {pareja.nombre}
                          </button>
                        )}
                        {parents.map((p: Npc, idx: number) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={!p.vivo}
                            onClick={() => p.vivo && onSelectNpc?.(p.id)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg disabled:opacity-50"
                          >
                            Progenitor {idx + 1}: {p.nombre} {!p.vivo ? '(fallecido)' : ''}
                          </button>
                        ))}
                        {hijos.map((h: Npc) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onSelectNpc?.(h.id)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg"
                          >
                            Hijo/a: {h.nombre} ({h.edad}a)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                );
              })()}
            </div>
          );
        })()}

        {/* 2. PARCELA / EDIFICIO EN PARCELA VIEW */}
        {selectedParcela && (() => {
          const b = selectedParcela.edificio;
          const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
          const obrasRow = OBRAS_LEVEL_TABLE[state.gobierno.palancasVigentes.nivelObras];
          const infraFactor = state.gobierno.indicadores.infraestructura < 30 ? 1.35 : 1.0;
          const openingVia = selectedParcela.tramoAperturaId
            ? state.tramos.find((t) => t.id === selectedParcela.tramoAperturaId)
            : undefined;

          return (
            <div className="space-y-4">
              {parcelError && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-rose-200">
                  {parcelError}
                </div>
              )}

              {selectedParcela.estado === 'sin_calle' && (
                <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <Route className="w-4 h-4 shrink-0" />
                    <span>Requiere acceso vial</span>
                  </div>
                  <div className="text-xs text-zinc-300">
                    {openingVia
                      ? `Habilita el tramo "${openingVia.nombre}" ($${openingVia.costoObra}) para abrir esta parcela.`
                      : 'Necesita conexión a la red vial de la zona.'}
                  </div>
                  {openingVia && (
                    <button
                      type="button"
                      onClick={() => onSelectTramo(openingVia.id)}
                      className="px-3.5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors"
                    >
                      Inspeccionar vía
                    </button>
                  )}
                </div>
              )}

              {selectedParcela.estado === 'libre' && (() => {
                const terrainInfo = getTerrainBuildCostInfo(
                  state.mapaGrid,
                  getParcelTerrainTiles(state, selectedParcela)
                );
                const { precioLote: landPrice } = getParcelLandPrice(state, selectedParcela);
                return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400">
                      Parcela {selectedParcela.tipoParcela} ({selectedParcela.clase ?? 'M'}) disponible
                    </span>
                    <span className="font-mono text-zinc-300 tabular-nums">
                      Caja ${Math.round(state.gobierno.reserva)}
                    </span>
                  </div>

                  {!terrainInfo.buildable && (
                    <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-3 text-xs text-rose-200">
                      Terreno escarpado o agua: no edificable.
                    </div>
                  )}

                  {terrainInfo.buildable && Math.abs(terrainInfo.multiplier - 1) >= 0.02 && (
                    <div className="bg-zinc-800/55 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-amber-300">
                      Factor de terreno sobre costo de obra: ×{terrainInfo.multiplier.toFixed(2)}
                    </div>
                  )}

                  {selectedParcela.tipoParcela !== 'publica' ? (
                    <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3.5 text-xs text-zinc-300 space-y-1">
                      <div className="font-semibold text-white">Parcela de iniciativa privada</div>
                      <div>
                        Las constructoras, inmobiliarias y emprendedores construyen viviendas y comercios aquí según la demanda zonal ({(state.demandaSuelo[`${selectedParcela.zona}:${selectedParcela.tipoParcela}`] ?? 1).toFixed(2)}x) · Precio de lote: <span className="font-mono text-emerald-300">${landPrice}</span>.
                      </div>
                    </div>
                  ) : (
                    <>
                      {isG0 && (
                        <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/40 rounded-xl p-3">
                          Modo G0 / automático: sin construcción manual.
                        </div>
                      )}

                      <div className="space-y-2.5">
                        {(() => {
                          const stepMap = buildTraversableZoneStepMap(state);
                          const covMap =
                            state.coberturaServiciosPorZona ?? computeZoneServiceCoverage(state);
                          const preset = SCENARIO_PRESETS[state.config.escenarioId];
                          const activeZones = getWorldZones(state);
                          const zonePop: Record<string, number> = {};
                          for (const n of state.npcs) {
                            if (!n.vivo) continue;
                            zonePop[n.zona] = (zonePop[n.zona] ?? 0) + 1;
                          }

                          const hasBuilder = state.firmas.some((f) => f.activa && f.rubro === 'construccion');

                          return GOVERNOR_BUILDABLE_TYPES.map((tipo) => {
                            const def = BUILDING_CATALOG[tipo];
                            const baseEffective = def.costoObra * terrainInfo.multiplier;
                            const effectiveCost = Math.round(
                              hasBuilder ? baseEffective : baseEffective * AUTOPILOT_CONSTANTS.kObraDirecta
                            );
                            const gatedSuceso = Boolean(def.requiereG2) && isG1OrG2;
                            const unlockers = isG2Plus
                              ? (preset?.hitos ?? []).filter((h) => h.desbloquea?.includes(tipo))
                              : [];
                            const missingHito =
                              unlockers.length > 0 &&
                              !unlockers.some((h) => state.hitosCumplidos.includes(h.id))
                                ? unlockers[0]
                                : null;
                            const noFunds = state.gobierno.reserva < effectiveCost;
                            const baseDaysEst = Math.max(
                              1,
                              Math.round(def.diasObra * obrasRow.diasObraFactor * infraFactor)
                            );
                            const estDays = hasBuilder
                              ? baseDaysEst
                              : Math.max(1, Math.round(baseDaysEst * AUTOPILOT_CONSTANTS.kDiasObraDirecta));
                            const disabled =
                              isG0 ||
                              gatedSuceso ||
                              Boolean(missingHito) ||
                              noFunds ||
                              !terrainInfo.buildable;

                            const svcInfo =
                              tipo === 'escuela'
                                ? { key: 'escuela' as const, r: SERVICE_RADIUS_CONSTANTS.radioEscuela }
                                : tipo === 'universidad'
                                ? { key: 'universidad' as const, r: SERVICE_RADIUS_CONSTANTS.radioUniversidad }
                                : tipo === 'hospital' || tipo === 'hospital_campana'
                                ? { key: 'salud' as const, r: SERVICE_RADIUS_CONSTANTS.radioHospital }
                                : tipo === 'comisaria'
                                ? { key: 'policia' as const, r: SERVICE_RADIUS_CONSTANTS.radioComisaria }
                                : null;

                            let newlyCoveredPopulation: number | undefined;
                            if (svcInfo) {
                              let sum = 0;
                              for (const zk of activeZones) {
                                const dist = stepMap[selectedParcela.zona]?.[zk] ?? Infinity;
                                if (dist <= svcInfo.r) {
                                  const cov = covMap[zk]?.[svcInfo.key] ?? 0;
                                  sum += (zonePop[zk] ?? 0) * Math.max(0, 1 - cov);
                                }
                              }
                              newlyCoveredPopulation = Math.round(sum);
                            }

                            return (
                              <div
                                key={tipo}
                                onMouseEnter={() =>
                                  svcInfo
                                    ? onHoverPreview?.({
                                        parcelaId: selectedParcela.id,
                                        buildingType: tipo,
                                        newlyCoveredPopulation,
                                      })
                                    : onHoverPreview?.({ parcelaId: selectedParcela.id })
                                }
                                onMouseLeave={() => onHoverPreview?.(null)}
                                className="bg-zinc-800/65 hover:bg-zinc-800 border border-zinc-700/70 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-white truncate">{def.nombre}</span>
                                    <HintIcon
                                      text={`${describeBuilding(def)} · Mant. $${def.mantenimientoPeriodo}/per${
                                        def.requiereG2 ? ' · Suceso (G3+)' : ''
                                      }${missingHito ? ` · Requiere hito: ${missingHito.nombre}` : ''}`}
                                      placement="left"
                                    />
                                  </div>
                                  <div className="font-mono text-xs text-amber-300 tabular-nums">
                                    ${effectiveCost} · {estDays}d · Mant. ${def.mantenimientoPeriodo}/per
                                    {newlyCoveredPopulation !== undefined && newlyCoveredPopulation > 0 && (
                                      <span className="text-sky-300 ml-1.5">
                                        · +{newlyCoveredPopulation} sin cob.
                                      </span>
                                    )}
                                  </div>
                                  {missingHito && (
                                    <div className="text-[11px] text-amber-200/80 truncate">
                                      Hito: {missingHito.nombre}
                                    </div>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    setParcelError(null);
                                    const res = onBuildInParcela(selectedParcela.id, tipo);
                                    if (!res.ok) setParcelError(res.error ?? 'No se pudo construir.');
                                  }}
                                  className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors whitespace-nowrap"
                                >
                                  {!terrainInfo.buildable
                                    ? 'No apta'
                                    : gatedSuceso
                                    ? 'G3+'
                                    : missingHito
                                    ? 'Hito'
                                    : noFunds
                                    ? 'Sin caja'
                                    : 'Construir'}
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </>
                  )}
                </div>
                );
              })()}

              {(selectedParcela.estado === 'en_obra' || selectedParcela.estado === 'ocupada') && b && bDef && (() => {
                let statusLabel = 'Operativo';
                let statusTone = 'text-emerald-400';
                let staffLine: string | null = null;
                let bedsLine: string | null = null;
                const firm = b.firmaId ? state.firmas.find((f) => f.id === b.firmaId) : undefined;
                const casa = b.casaId ? state.casas.find((c) => c.id === b.casaId) : undefined;
                const tenantHogar = casa?.hogarId
                  ? state.hogares.find((h) => h.id === casa.hogarId)
                  : undefined;

                if (b.estado === 'ocupada') {
                  const caps = getBuildingJobCaps(
                    state.parcelas,
                    derived.poblacion,
                    state.gobierno.palancasVigentes.nivelObras,
                    state.gobierno.cuposFijos
                  );
                  const activeWorkers = state.npcs.filter(
                    (n) => n.vivo && !n.hospital.internado && !n.accionIa?.fueraDePuesto
                  );
                  const activeByRole = (role: keyof typeof derived.roles) =>
                    activeWorkers.filter((n) => n.rol === role).length;
                  const sameTypeActive = state.parcelas
                    .filter((p) => p.edificio?.estado === 'ocupada' && p.edificio.activo && p.edificio.tipo === b.tipo)
                    .sort((a, p2) => a.orden - p2.orden);
                  const bCount = Math.max(1, sameTypeActive.length);
                  const bIdx = Math.max(0, sameTypeActive.findIndex((p) => p.id === selectedParcela.id));
                  const shareOf = (total: number) =>
                    Math.floor(total / bCount) + (bIdx < total % bCount ? 1 : 0);

                  if (b.tipo === 'hospital' || b.tipo === 'hospital_campana') {
                    const medicosActivos = activeByRole('medico');
                    const { facilities } = computeHospitalFacilities(state);
                    const fac = facilities.find((f) => f.edificioId === b.id);
                    const bedsTotal = fac?.beds ?? 0;
                    const bedsUsed = fac?.occupied ?? 0;
                    bedsLine = `Camas: ${bedsUsed}/${bedsTotal}${
                      derived.esperandoCama > 0 ? ` · ${derived.esperandoCama} en espera` : ''
                    }`;

                    if (b.tipo === 'hospital') {
                      const docsHere = shareOf(medicosActivos);
                      const slotsHere = shareOf(caps.medico);
                      staffLine = `Médicos activos: ${docsHere}/${slotsHere}`;
                      if (docsHere === 0) {
                        statusLabel = 'Sin personal';
                        statusTone = 'text-rose-400';
                      } else if (bedsTotal > 0 && bedsUsed >= bedsTotal) {
                        statusLabel = 'Hospital lleno';
                        statusTone = 'text-amber-300';
                      }
                    } else if (bedsTotal > 0 && bedsUsed >= bedsTotal) {
                      statusLabel = 'Hospital lleno';
                      statusTone = 'text-amber-300';
                    }
                  } else if (b.tipo === 'comisaria') {
                    const active = shareOf(activeByRole('policia'));
                    const cap = shareOf(caps.policia);
                    staffLine = `Policías activos: ${active}/${cap}`;
                    if (active === 0) {
                      statusLabel = 'Sin personal';
                      statusTone = 'text-rose-400';
                    }
                  } else if (b.tipo === 'escuela') {
                    const active = shareOf(activeByRole('docente'));
                    const cap = shareOf(caps.docente);
                    staffLine = `Docentes activos: ${active}/${cap}`;
                    if (active === 0) {
                      statusLabel = 'Sin personal';
                      statusTone = 'text-rose-400';
                    }
                  } else if (b.tipo === 'oficina_publica') {
                    const active = shareOf(activeByRole('estatal'));
                    const cap = shareOf(caps.estatal);
                    staffLine = `Estatales activos: ${active}/${cap}`;
                    if (active === 0) {
                      statusLabel = 'Sin personal';
                      statusTone = 'text-rose-400';
                    }
                  } else if (casa) {
                    staffLine = tenantHogar
                      ? `Habitado (${tenantHogar.miembros.length}/${casa.capacidad} pers.) · Alq. $${casa.alquiler.toFixed(1)}/per`
                      : `Disponible · Alq. $${casa.alquiler.toFixed(1)}/per`;
                    statusLabel = `Estado vivienda ${Math.round(casa.estado)}%`;
                    statusTone =
                      casa.estado < 40 ? 'text-rose-400' : casa.estado < 70 ? 'text-amber-300' : 'text-emerald-400';
                  } else if (firm) {
                    staffLine = `${firm.nombre} · ${firm.empleados.length} emp. · Sueldo ${Math.round(firm.factor * 100)}%`;
                    if (!firm.activa) {
                      statusLabel = 'Cerrada';
                      statusTone = 'text-rose-400';
                    } else if (firm.factor < 0.95) {
                      statusLabel = `Recortando (${Math.round(firm.factor * 100)}%)`;
                      statusTone = 'text-amber-300';
                    }
                  }
                }

                return (
                  <div className="space-y-4">
                    <div className="bg-zinc-800/65 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-white truncate">{bDef.nombre}</span>
                          <HintIcon text={describeBuilding(bDef)} placement="left" />
                        </div>
                        <span className="text-xs text-zinc-400 shrink-0">
                          {b.dueno === 'estado' ? 'Público' : casa ? 'Vivienda' : firm ? getRubroDisplayName(firm.rubro) : 'Privado'}
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
                        <div className={`text-sm font-semibold ${statusTone}`}>
                          {statusLabel}
                          {b.diasRestantesCampana !== undefined && (
                            <span className="text-amber-300 ml-2 font-mono">
                              · {b.diasRestantesCampana}d restantes
                            </span>
                          )}
                        </div>
                      )}

                      {bedsLine && (
                        <div className="font-mono text-xs text-zinc-200 tabular-nums">{bedsLine}</div>
                      )}
                      {staffLine && (
                        <div className="font-mono text-xs text-zinc-300 tabular-nums">{staffLine}</div>
                      )}
                      {b.ventasHoy !== undefined && b.ventasHoy > 0 && (
                        <div className="font-mono text-xs text-emerald-400 tabular-nums">
                          Ventas hoy: ${b.ventasHoy.toFixed(1)}
                        </div>
                      )}
                      {firm && (
                        <button
                          type="button"
                          onClick={() => onSelectFirma?.(firm.id)}
                          className="flex items-center gap-1.5 text-xs text-amber-300 hover:underline font-medium"
                        >
                          <Store className="w-3.5 h-3.5" />
                          <span>Ver firma: {firm.nombre}</span>
                        </button>
                      )}
                      {tenantHogar && (
                        <button
                          type="button"
                          onClick={() => onSelectHogar?.(tenantHogar.id)}
                          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:underline font-medium"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Ver hogar ocupante ({tenantHogar.miembros.length} p.)</span>
                        </button>
                      )}
                      {casa && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <Home className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Dueño: {casa.dueno.tipo}</span>
                        </div>
                      )}
                      {bDef.mantenimientoPeriodo > 0 && b.dueno === 'estado' && (
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
                );
              })()}
            </div>
          );
        })()}

        {/* 3. VIA TRAMO VIEW */}
        {selectedTramo && (() => {
          const connectable = isViaConnectableToNetwork(state, selectedTramo);
          const canBuild = !selectedTramo.construida && !selectedTramo.enObra && connectable;
          const viaBlocked = isG0;
          const viaTerrain = getTerrainBuildCostInfo(
            state.mapaGrid,
            getViaTerrainTiles(state, selectedTramo),
            selectedTramo.tipo === 'puente'
          );
          const hasBuilder = state.firmas.some((f) => f.activa && f.rubro === 'construccion');
          const rawViaCost = Number(
            (selectedTramo.costoObra * viaTerrain.multiplier + viaTerrain.bridgeExtraCost).toFixed(2)
          );
          const effectiveViaCost = Math.round(
            hasBuilder ? rawViaCost : rawViaCost * AUTOPILOT_CONSTANTS.kObraDirecta
          );
          const noFunds = state.gobierno.reserva < effectiveViaCost;
          const zA = state.zonas[selectedTramo.zonaA]?.nombre ?? selectedTramo.zonaA;
          const zB = selectedTramo.zonaB
            ? state.zonas[selectedTramo.zonaB]?.nombre ?? selectedTramo.zonaB
            : null;

          return (
            <div className="space-y-4">
              {parcelError && (
                <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-rose-200">
                  {parcelError}
                </div>
              )}

              <div className="bg-zinc-800/65 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white capitalize">{selectedTramo.tipo}</span>
                  <span
                    className={`font-mono font-bold ${
                      selectedTramo.construida
                        ? selectedTramo.estado <= 0
                          ? 'text-rose-400'
                          : selectedTramo.estado < 50
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                        : selectedTramo.enObra
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                    }`}
                  >
                    {selectedTramo.construida
                      ? `Operativa · ${Math.round(selectedTramo.estado)}%`
                      : selectedTramo.enObra
                      ? `En obra (${selectedTramo.diasObraRestantes}d)`
                      : 'Sin construir'}
                  </span>
                </div>

                <div className="text-zinc-300">
                  Conecta: {zA}
                  {zB ? ` ↔ ${zB}` : ''} · Longitud {selectedTramo.longitud}m
                </div>
                {selectedTramo.parcelasAbiertas.length > 0 && (
                  <div className="text-emerald-300">
                    Habilita {selectedTramo.parcelasAbiertas.length} parcela(s) privada(s)/pública(s)
                  </div>
                )}
                {selectedTramo.zonaAbierta && (
                  <div className="text-amber-300">
                    Abre nueva zona urbanizable: {state.zonas[selectedTramo.zonaAbierta]?.nombre ?? selectedTramo.zonaAbierta}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-700/60 font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-zinc-400 block">Costo</span>
                    <span className="font-bold text-white">${effectiveViaCost}</span>
                  </div>
                  <div>
                    <span className="font-sans text-zinc-400 block">Plazo</span>
                    <span className="font-bold text-white">{selectedTramo.diasObraTotal}d</span>
                  </div>
                  <div>
                    <span className="font-sans text-zinc-400 block">Mant.</span>
                    <span className="font-bold text-amber-300">${selectedTramo.mantenimientoPeriodo}/per</span>
                  </div>
                </div>
              </div>

              {canBuild && (
                <button
                  type="button"
                  disabled={viaBlocked || noFunds}
                  onClick={() => {
                    setParcelError(null);
                    const res = onBuildVia(selectedTramo.id);
                    if (!res.ok) setParcelError(res.error ?? 'No se pudo iniciar la obra vial.');
                  }}
                  className="w-full py-2.5 px-4 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 transition-colors"
                >
                  {viaBlocked
                    ? 'Modo automático'
                    : noFunds
                    ? `Sin caja ($${effectiveViaCost})`
                    : `Construir vía ($${effectiveViaCost})`}
                </button>
              )}
            </div>
          );
        })()}

        {/* 4B. HOGAR VIEW */}
        {selectedHogar && (() => {
          const casa = selectedHogar.casaId
            ? state.casas.find((c) => c.id === selectedHogar.casaId)
            : undefined;
          const miembros = selectedHogar.miembros
            .map((id) => state.npcs.find((n) => n.id === id))
            .filter((n): n is Npc => Boolean(n && n.vivo));
          const despPP = selectedHogar.despensa / Math.max(1, miembros.length);

          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-zinc-400 block">Caja hogar</span>
                  <span className="text-base font-bold text-white">${selectedHogar.dinero.toFixed(1)}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Despensa</span>
                  <span className={`text-base font-bold ${despPP < 1.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {despPP.toFixed(1)}d/p
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Alquiler</span>
                  <span className="text-sm font-bold text-zinc-200">
                    {casa ? `$${casa.alquiler.toFixed(1)}/p` : '$0'}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Períodos sin pagar</span>
                  <span className={`text-sm font-bold ${selectedHogar.periodosSinPagar > 0 ? 'text-rose-400' : 'text-zinc-200'}`}>
                    {selectedHogar.periodosSinPagar}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-3.5 flex items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-400 block">Vivienda</span>
                  <span
                    className={`font-semibold text-sm ${
                      selectedHogar.estado === 'calle'
                        ? 'text-rose-400'
                        : selectedHogar.estado === 'acogida'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                    }`}
                  >
                    {selectedHogar.estado === 'calle'
                      ? 'En situación de calle'
                      : selectedHogar.estado === 'acogida'
                      ? 'Acogida estatal'
                      : casa
                      ? `${BUILDING_CATALOG[casa.tipo].nombre} (${Math.round(casa.estado)}%)`
                      : 'Con vivienda'}
                  </span>
                </div>
                {casa?.parcelaId && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectParcela(casa.parcelaId);
                      onJumpZone(selectedHogar.zona);
                    }}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-semibold shrink-0 whitespace-nowrap"
                  >
                    Ver lote
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-zinc-400">Integrantes ({miembros.length})</div>
                <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl">
                  {miembros.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectNpc?.(m.id)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-zinc-800 transition-colors"
                    >
                      <span className="truncate text-zinc-100">
                        <strong>{m.nombre} {m.apellido}</strong>{' '}
                        <span className="text-zinc-400">· {ROLE_CATALOG[m.rol].nombre} ({m.edad}a)</span>
                      </span>
                      <span className="font-mono text-zinc-400 tabular-nums shrink-0 ml-2">
                        Ánimo {Math.round(m.variables.satisfaccion)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 4C. FIRMA VIEW */}
        {selectedFirma && (() => {
          const empList = selectedFirma.empleados
            .map((id) => state.npcs.find((n) => n.id === id))
            .filter((n): n is Npc => Boolean(n && n.vivo));
          const locales = selectedFirma.locales
            .map((id) => state.parcelas.find((p) => p.id === id))
            .filter((p): p is Parcela => Boolean(p));

          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-zinc-400 block">Caja</span>
                  <span className="text-base font-bold text-white">${Math.round(selectedFirma.caja)}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Últ. ganancia</span>
                  <span
                    className={`text-base font-bold ${
                      selectedFirma.ultimaGanancia >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedFirma.ultimaGanancia >= 0 ? '+' : ''}${selectedFirma.ultimaGanancia.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Factor salarial</span>
                  <span className="text-sm font-bold text-amber-300">
                    {Math.round(selectedFirma.factor * 100)}%
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Estado</span>
                  <span className={`font-sans text-sm font-bold ${selectedFirma.activa ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedFirma.activa ? 'Activa' : 'Cerrada'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-zinc-400">Dueños ({selectedFirma.partes.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {renderOwnerBadges(selectedFirma.partes, state.npcs, onSelectNpc)}
                </div>
              </div>

              {Object.keys(selectedFirma.cuotaZona || {}).length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-zinc-400">Cuota por zona</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(selectedFirma.cuotaZona).map(([zKey, val]) => (
                      <button
                        key={zKey}
                        type="button"
                        onClick={() => {
                          onSelectZona?.(zKey as ZoneId);
                          onJumpZone(zKey as ZoneId);
                        }}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-mono tabular-nums"
                      >
                        {state.zonas[zKey]?.nombre ?? zKey}: {Math.round(val * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="font-semibold text-zinc-400">Locales ({locales.length})</div>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {locales.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectParcela(p.id);
                        onJumpZone(p.zona);
                      }}
                      className="w-full px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl flex items-center justify-between text-left"
                    >
                      <span className="font-medium text-zinc-100 truncate">
                        {p.edificio ? BUILDING_CATALOG[p.edificio.tipo].nombre : p.nombre}
                      </span>
                      <span className="text-zinc-400 shrink-0 ml-2">{state.zonas[p.zona]?.nombre ?? p.zona}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-zinc-400">Empleados ({empList.length})</div>
                <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl max-h-[150px] overflow-y-auto">
                  {empList.length === 0 ? (
                    <div className="p-3 text-zinc-500">Sin empleados contratados.</div>
                  ) : (
                    empList.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onSelectNpc?.(n.id)}
                        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-zinc-800"
                      >
                        <span className="text-zinc-100 truncate">
                          {n.nombre} {n.apellido} · <span className="text-zinc-400">{ROLE_CATALOG[n.rol].nombre}</span>
                        </span>
                        <span className="font-mono text-emerald-400 shrink-0 ml-2">
                          ${n.economia.ultimoIngresoNeto.toFixed(1)}/d
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedFirma.ultimaCausa && (
                <button
                  type="button"
                  onClick={() =>
                    onInspectCausal(
                      `${selectedFirma.nombre}: ${selectedFirma.ultimoTramo}`,
                      selectedFirma.ultimaCausa,
                      `Factor salarial ${Math.round(selectedFirma.factor * 100)}%`
                    )
                  }
                  className="text-xs font-semibold text-emerald-400 hover:underline"
                >
                  ¿Por qué? (último cambio)
                </button>
              )}
            </div>
          );
        })()}

        {/* 4D. ZONA VIEW */}
        {selectedZona && (() => {
          const z = selectedZona.id;
          const zNpcs = state.npcs.filter((n) => n.vivo && n.zona === z);
          const zHogares = state.hogares.filter((h) => h.zona === z);
          const zCalle = zHogares.filter((h) => h.estado === 'calle').length;
          const zFirms = state.firmas.filter((f) => f.activa && f.zona === z);
          const zCasas = state.casas.filter((c) => c.zona === z);
          const zOcupadas = zCasas.filter((c) => Boolean(c.hogarId)).length;
          const avgMood =
            zNpcs.length > 0
              ? Math.round(zNpcs.reduce((s, n) => s + n.variables.satisfaccion, 0) / zNpcs.length)
              : 0;
          const unemployed = zNpcs.filter((n) => n.rol === 'desempleado').length;
          const hungry = zNpcs.filter((n) => n.variables.hambre > 75).length;
          const alq = state.ultimaSalidaEconomica.alquilerMedio[z] ?? 0;
          const defVal = Math.round(derived.defensa[z] ?? 0);
          const ordVal = Math.round(derived.orden[z] ?? 0);

          let mainNeed = 'Sin urgencias críticas';
          if (selectedZona.estado === 'no_urbanizada') mainNeed = 'Requiere apertura vial';
          else if (hungry > zNpcs.length * 0.15) mainNeed = 'Falta abasto de alimento';
          else if (zCalle > 0) mainNeed = `Vivienda (${zCalle} hogar/es en calle)`;
          else if (unemployed > Math.max(2, zNpcs.length * 0.15)) mainNeed = `Empleo (${unemployed} sin trabajo)`;
          else if (ordVal < 40) mainNeed = 'Seguridad y orden zonal';
          else if (defVal < 35) mainNeed = 'Defensa baja';

          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-zinc-400 block">Población</span>
                  <span className="text-base font-bold text-white">{zNpcs.length}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Ánimo medio</span>
                  <span className={`text-base font-bold ${avgMood < 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {avgMood}%
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Viviendas</span>
                  <span className="text-sm font-bold text-zinc-200">
                    {zOcupadas}/{zCasas.length} · Calle {zCalle}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Alquiler medio</span>
                  <span className="text-sm font-bold text-amber-300">${alq.toFixed(1)}/p</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Desempleo</span>
                  <span className="text-sm font-bold text-zinc-200">{unemployed} vec.</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Def. / Orden</span>
                  <span className="text-sm font-bold text-zinc-200">
                    {defVal}% / {ordVal}%
                  </span>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-3.5 space-y-1">
                <div className="text-zinc-400">Necesidad principal</div>
                <div className="text-sm font-semibold text-amber-300">{mainNeed}</div>
              </div>

              {zFirms.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-zinc-400">Firmas en la zona ({zFirms.length})</div>
                  <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl max-h-[160px] overflow-y-auto">
                    {zFirms.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onSelectFirma?.(f.id)}
                        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-zinc-800"
                      >
                        <span className="text-zinc-100 truncate">
                          {f.nombre} · <span className="text-zinc-400">{getRubroDisplayName(f.rubro)}</span>
                        </span>
                        <span className="font-mono text-zinc-400 shrink-0 ml-2">{f.empleados.length} emp.</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => onJumpZone(z)}
                className="w-full py-2.5 px-4 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors"
              >
                Centrar cámara en {selectedZona.nombre}
              </button>
            </div>
          );
        })()}

        {/* 4E. MEDIO VIEW */}
        {selectedMedio && (() => {
          const firmaMedio = selectedMedio.firmaId
            ? state.firmas.find((f) => f.id === selectedMedio.firmaId)
            : undefined;
          const medioNotas = state.noticias.filter((n) => n.medioId === selectedMedio.id).slice(0, 6);
          const owners: FirmPart[] =
            firmaMedio?.partes ??
            selectedMedio.duenoNpcIds.map((id) => ({
              tipo: 'npc' as const,
              id,
              pct: Math.round(100 / Math.max(1, selectedMedio.duenoNpcIds.length)),
            }));

          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-zinc-800/60 rounded-xl p-3.5 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-zinc-400 block">Alcance</span>
                  <span className="text-base font-bold text-white">{Math.round(selectedMedio.alcancePct)}%</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Credibilidad</span>
                  <span className="text-base font-bold text-emerald-400">
                    {Math.round(selectedMedio.credibilidad)}%
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Dep. pauta</span>
                  <span className="text-sm font-bold text-amber-300">
                    {Math.round(selectedMedio.finanzas.dependenciaPct)}%
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Estado</span>
                  <span
                    className={`font-sans text-sm font-bold ${
                      selectedMedio.activa !== false ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedMedio.activa !== false ? 'Activo' : 'Cerrado'}
                  </span>
                </div>
              </div>

              {owners.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-zinc-400">Dueños</div>
                  <div className="flex flex-wrap gap-1.5">
                    {renderOwnerBadges(owners, state.npcs, onSelectNpc)}
                  </div>
                </div>
              )}

              {firmaMedio && (
                <button
                  type="button"
                  onClick={() => onSelectFirma?.(firmaMedio.id)}
                  className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold rounded-xl text-left flex items-center justify-between"
                >
                  <span>Ver firma: {firmaMedio.nombre}</span>
                  <span className="font-mono">{firmaMedio.empleados.length} emp.</span>
                </button>
              )}

              <div className="space-y-2">
                <div className="font-semibold text-zinc-400">Últimas notas ({medioNotas.length})</div>
                {medioNotas.length === 0 ? (
                  <div className="text-zinc-500">Sin notas recientes.</div>
                ) : (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {medioNotas.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() =>
                          onInspectCausal(`${n.medioNombre}: ${n.titulo}`, n.causa || `noticia:${n.id}`, n.texto)
                        }
                        className="w-full text-left bg-zinc-800/55 hover:bg-zinc-800 rounded-xl p-2.5 space-y-1"
                      >
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span>{n.tema}</span>
                          <span className="font-mono">D{n.dia}</span>
                        </div>
                        <div className="font-semibold text-zinc-100 leading-snug">{n.titulo}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 4F. EXPLORAR DIRECTORY (Personas / Hogares / Firmas) */}
        {inspectorSearchOpen &&
          !selectedNpc &&
          !selectedHogar &&
          !selectedParcela &&
          !selectedFirma &&
          !selectedTramo &&
          !selectedZona &&
          !selectedMedio && (() => {
            const q = directoryQuery.trim().toLowerCase();
            const npcById = new Map(state.npcs.map((n) => [n.id, n]));
            const zonesCount = getWorldZones(state).length;

            return (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-4 gap-1 bg-zinc-800/80 p-1 rounded-xl">
                  {(
                    [
                      { id: 'personas', label: 'Personas' },
                      { id: 'hogares', label: 'Hogares' },
                      { id: 'firmas', label: 'Firmas' },
                      { id: 'notables', label: 'Clave' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenDirectory?.(t.id)}
                      className={`py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                        inspectorSearchOpen === t.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={directoryQuery}
                    onChange={(e) => setDirectoryQuery(e.target.value)}
                    placeholder={`Buscar ${inspectorSearchOpen}…`}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl max-h-[360px] overflow-y-auto">
                  {inspectorSearchOpen === 'personas' &&
                    state.npcs
                      .filter((n) => {
                        if (!n.vivo) return false;
                        if (!q) return true;
                        const z = getEffectiveZone(n, zonesCount);
                        const zName = (state.zonas[z]?.nombre ?? z).toLowerCase();
                        return (
                          `${n.nombre} ${n.apellido}`.toLowerCase().includes(q) ||
                          ROLE_CATALOG[n.rol].nombre.toLowerCase().includes(q) ||
                          zName.includes(q)
                        );
                      })
                      .slice(0, 60)
                      .map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onSelectNpc?.(n.id)}
                          className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800"
                        >
                          <span className="truncate text-zinc-100">
                            <strong>{n.nombre} {n.apellido}</strong>{' '}
                            <span className="text-zinc-400">· {ROLE_CATALOG[n.rol].nombre}</span>
                          </span>
                          <span className="font-mono text-zinc-400 shrink-0 ml-2">
                            {n.edad}a · {Math.round(n.variables.satisfaccion)}%
                          </span>
                        </button>
                      ))}

                  {inspectorSearchOpen === 'hogares' &&
                    state.hogares
                      .filter((h) => {
                        if (!q) return true;
                        const zName = (state.zonas[h.zona]?.nombre ?? h.zona).toLowerCase();
                        const names = h.miembros
                          .map((id) => {
                            const m = npcById.get(id);
                            return m ? `${m.nombre} ${m.apellido}` : '';
                          })
                          .join(' ')
                          .toLowerCase();
                        return h.id.toLowerCase().includes(q) || zName.includes(q) || h.estado.includes(q) || names.includes(q);
                      })
                      .slice(0, 60)
                      .map((h) => {
                        const head = npcById.get(h.miembros[0]);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onSelectHogar?.(h.id)}
                            className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800"
                          >
                            <span className="truncate text-zinc-100">
                              <strong>{head ? `Familia ${head.apellido}` : h.id}</strong>{' '}
                              <span className="text-zinc-400">· {h.miembros.length} p.</span>
                            </span>
                            <span
                              className={`font-mono shrink-0 ml-2 ${
                                h.estado === 'calle'
                                  ? 'text-rose-400'
                                  : h.estado === 'acogida'
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }`}
                            >
                              ${h.dinero.toFixed(0)} · {h.estado === 'con_casa' ? 'Casa' : h.estado}
                            </span>
                          </button>
                        );
                      })}

                  {inspectorSearchOpen === 'firmas' &&
                    state.firmas
                      .filter((f) => {
                        if (!f.activa) return false;
                        if (!q) return true;
                        const zName = (state.zonas[f.zona]?.nombre ?? f.zona).toLowerCase();
                        return (
                          f.nombre.toLowerCase().includes(q) ||
                          getRubroDisplayName(f.rubro).toLowerCase().includes(q) ||
                          zName.includes(q)
                        );
                      })
                      .slice(0, 60)
                      .map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onSelectFirma?.(f.id)}
                          className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800"
                        >
                          <span className="truncate text-zinc-100">
                            <strong>{f.nombre}</strong>{' '}
                            <span className="text-zinc-400">· {getRubroDisplayName(f.rubro)}</span>
                          </span>
                          <span className="font-mono text-zinc-300 shrink-0 ml-2">
                            {f.empleados.length} emp. · ${Math.round(f.caja)}
                          </span>
                        </button>
                      ))}

                  {inspectorSearchOpen === 'notables' &&
                    (state.lectura?.notables ?? [])
                      .filter((nt) => {
                        if (!q) return true;
                        const zName = (state.zonas[nt.zona]?.nombre ?? nt.zona).toLowerCase();
                        return (
                          nt.nombre.toLowerCase().includes(q) ||
                          nt.tipo.toLowerCase().includes(q) ||
                          nt.motivo.toLowerCase().includes(q) ||
                          zName.includes(q)
                        );
                      })
                      .map((nt) => (
                        <button
                          key={nt.npcId}
                          type="button"
                          onClick={() => {
                            onSelectNpc?.(nt.npcId);
                            onJumpZone(nt.zona);
                          }}
                          className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800"
                        >
                          <span className="truncate text-zinc-100 flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <strong className="truncate">{nt.nombre}</strong>
                            <span className="text-zinc-400 truncate">· {nt.motivo}</span>
                          </span>
                          <span className="font-mono text-amber-300 shrink-0 ml-2">
                            {Math.round(nt.peso)}
                          </span>
                        </button>
                      ))}
                </div>
              </div>
            );
          })()}

        {/* 5. CONSTRUIR LIST (Parcelas + Vías conectables) */}
        {sideBuildOpen &&
          !selectedNpc &&
          !selectedHogar &&
          !selectedParcela &&
          !selectedFirma &&
          !selectedTramo &&
          !selectedZona &&
          !selectedMedio &&
          !inspectorSearchOpen && (() => {
          const sorted = [...state.parcelas].sort((a, b) => a.orden - b.orden);
          const filtered =
            buildFilter === 'libres' ? sorted.filter((p) => p.estado === 'libre') : sorted;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBuildSection('parcelas')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    buildSection === 'parcelas' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Parcelas ({derived.parcelasLibres})
                </button>
                <button
                  type="button"
                  onClick={() => setBuildSection('vias')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    buildSection === 'vias' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Vías ({connectableVias.length})
                </button>
              </div>

              {buildSection === 'parcelas' ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5 bg-zinc-800/50 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setBuildFilter('libres')}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        buildFilter === 'libres' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Libres ({derived.parcelasLibres})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuildFilter('todas')}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        buildFilter === 'todas' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
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
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                      {filtered.map((p) => {
                        const b = p.edificio;
                        const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
                        const statusText =
                          p.estado === 'libre'
                            ? `Libre (${p.tipoParcela})`
                            : p.estado === 'sin_calle'
                            ? 'Sin vía de acceso'
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
                            : p.estado === 'sin_calle'
                            ? 'text-zinc-500'
                            : 'text-zinc-300';

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseEnter={() => onHoverPreview?.({ parcelaId: p.id })}
                            onMouseLeave={() => onHoverPreview?.(null)}
                            onClick={() => {
                              onSelectParcela(p.id);
                              onJumpZone(p.zona);
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
                </>
              ) : connectableVias.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400 bg-zinc-800/40 rounded-xl">
                  No hay nuevas vías conectables por abrir en este momento.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {connectableVias.map((t) => {
                    const tInfo = getTerrainBuildCostInfo(
                      state.mapaGrid,
                      getViaTerrainTiles(state, t),
                      t.tipo === 'puente'
                    );
                    const hasBuilder = state.firmas.some((f) => f.activa && f.rubro === 'construccion');
                    const rawViaCost = Number((t.costoObra * tInfo.multiplier + tInfo.bridgeExtraCost).toFixed(2));
                    const effectiveViaCost = Math.round(
                      hasBuilder ? rawViaCost : rawViaCost * AUTOPILOT_CONSTANTS.kObraDirecta
                    );
                    const noFunds = state.gobierno.reserva < effectiveViaCost;
                    const viaBlocked = isG0;
                    return (
                      <div
                        key={t.id}
                        onMouseEnter={() => onHoverPreview?.({ tramoId: t.id })}
                        onMouseLeave={() => onHoverPreview?.(null)}
                        className="bg-zinc-800/65 hover:bg-zinc-800 border border-zinc-700/70 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTramo(t.id);
                            onJumpZone(t.zonaA);
                          }}
                          className="min-w-0 text-left"
                        >
                          <div className="font-semibold text-white truncate">{t.nombre}</div>
                          <div className="text-xs text-amber-300 font-mono tabular-nums mt-0.5">
                            ${effectiveViaCost} · {t.diasObraTotal}d · +{t.parcelasAbiertas.length} parc.
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={viaBlocked || noFunds}
                          onClick={() => {
                            const res = onBuildVia(t.id);
                            if (!res.ok) setParcelError(res.error ?? 'No se pudo iniciar la vía.');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          {viaBlocked ? 'Auto' : noFunds ? 'Sin caja' : 'Construir'}
                        </button>
                      </div>
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
