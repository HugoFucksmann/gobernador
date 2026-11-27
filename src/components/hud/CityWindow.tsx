import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudRain,
  Compass,
  GitBranch,
  Hammer,
  Lock,
  Route,
  Search,
  Trash2,
} from 'lucide-react';
import {
  BUILDING_CATALOG,
  DISTRICT_BY_ID,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
} from '../../data/catalogs';
import {
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveZone,
  getWorldZones,
} from '../../engine/simulation';
import { isViaConnectableToNetwork } from '../../engine/worldHelpers';
import {
  BuildingType,
  CommunityDerived,
  DistrictId,
  GameState,
  RoleId,
  SimEvent,
  ZoneId,
} from '../../types/game';
import { CityTab, MapHoverPreview } from '../../types/ui';
import { RctWindow } from './RctWindow';
import { UiTooltip } from './UiTooltip';

type FactCategoryFilter =
  | 'todas'
  | 'vida'
  | 'familia'
  | 'mercado'
  | 'vivienda'
  | 'obras'
  | 'clima'
  | 'caos'
  | 'prensa';

function classifyFactCategory(
  simEvent: SimEvent | undefined,
  bitCat?: string,
  titulo = '',
  detalle = ''
): Exclude<FactCategoryFilter, 'todas'> {
  if (simEvent) {
    switch (simEvent.tipo) {
      case 'muerte':
      case 'nacimiento':
      case 'migracion_llegada':
      case 'migracion_salida':
      case 'hospital_saturado':
      case 'internacion':
      case 'alta':
        return 'vida';
      case 'capacitacion_inicio':
      case 'capacitacion_fin':
        return 'mercado';
      case 'pareja':
      case 'separacion':
      case 'hogar_nuevo':
      case 'hogar_disuelto':
      case 'herencia':
        return 'familia';
      case 'firma_fundada':
      case 'firma_compra':
      case 'firma_quiebra':
      case 'monopolio':
      case 'impago':
      case 'empresa_aumento':
      case 'empresa_recorte':
      case 'empresa_despido':
        return 'mercado';
      case 'desalojo':
      case 'mudanza':
      case 'calle_inicio':
      case 'calle_fin':
      case 'casa_construida':
      case 'casa_estado':
        return 'vivienda';
      case 'obra_inicio':
      case 'obra_fin':
      case 'demolicion':
      case 'via_inicio':
      case 'via_fin':
      case 'via_estado':
      case 'ruta_cortada':
      case 'zona_abierta':
        return 'obras';
      case 'fenomeno_inicio':
      case 'fenomeno_fin':
      case 'aviso':
        return 'clima';
      case 'accion_inicio':
      case 'golpe':
      case 'demanda':
      case 'medida':
        return 'caos';
      case 'noticia':
      case 'medio_cambio_linea':
      case 'medio_cierre':
        return 'prensa';
      default:
        break;
    }
  }
  const hay = `${titulo} ${detalle}`.toLowerCase();
  if (bitCat === 'clima') return 'clima';
  if (bitCat === 'caos') return 'caos';
  if (bitCat === 'prensa') return 'prensa';
  if (hay.includes('vivienda') || hay.includes('casa') || hay.includes('alquiler') || hay.includes('desaloj')) {
    return 'vivienda';
  }
  if (hay.includes('obra') || hay.includes('vía') || hay.includes('parcela') || hay.includes('puente')) {
    return 'obras';
  }
  if (hay.includes('pareja') || hay.includes('herencia') || hay.includes('hogar')) return 'familia';
  if (hay.includes('naci') || hay.includes('muert') || hay.includes('fallec') || hay.includes('salud')) return 'vida';
  if (bitCat === 'economia') return 'mercado';
  return 'vida';
}

function describeSimEvent(ev: SimEvent, state: GameState): { titulo: string; detalle: string } | null {
  const getFirmaName = (id: string) => state.firmas.find((f) => f.id === id)?.nombre ?? id;
  switch (ev.tipo) {
    case 'nacimiento':
      return { titulo: 'Nacimiento', detalle: `Nuevo integrante en zona ${ev.zona}.` };
    case 'muerte':
      return {
        titulo: `Fallecimiento (${ev.esNatural ? 'natural' : ev.esperandoCama ? 'sin cama' : 'salud/golpe'})`,
        detalle: `Ocurrido en zona ${ev.zona}.`,
      };
    case 'pareja':
      return { titulo: 'Nueva pareja / hogar', detalle: `Formación de hogar en zona ${ev.zona}.` };
    case 'herencia':
      return { titulo: 'Herencia registrada', detalle: `Bienes transferidos en zona ${ev.zona}.` };
    case 'desalojo':
      return { titulo: 'Desalojo de vivienda', detalle: `Hogar acumula ${ev.periodosSinPagar} impago(s) en ${ev.zona}.` };
    case 'calle_inicio':
      return { titulo: 'Hogar en situación de calle', detalle: `Sin vivienda en zona ${ev.zona}.` };
    case 'casa_construida':
      return { titulo: 'Vivienda construida', detalle: `Nueva ${ev.tipoCasa} en zona ${ev.zona}.` };
    case 'firma_fundada':
      return { titulo: `Firma fundada: ${getFirmaName(ev.firmaId)}`, detalle: `Rubro ${ev.rubro} en zona ${ev.zona}.` };
    case 'firma_compra':
      return { titulo: `Compra de local (${getFirmaName(ev.compradorId)})`, detalle: `Expansión en zona ${ev.zona}.` };
    case 'firma_quiebra':
      return { titulo: `Quiebra: ${getFirmaName(ev.firmaId)}`, detalle: `Cierre de actividad en zona ${ev.zona}.` };
    case 'monopolio':
      return {
        titulo: `Concentración (${getFirmaName(ev.firmaId)})`,
        detalle: `${Math.round(ev.cuota * 100)}% en ${ev.rubro}.`,
      };
    case 'obra_fin':
      return { titulo: `Obra terminada (${ev.edificio})`, detalle: `Habilitada en zona ${ev.zona}.` };
    case 'via_fin':
      return { titulo: `Vía habilitada`, detalle: `Conexión completada en zona ${ev.zona}.` };
    case 'ruta_cortada':
      return { titulo: `Ruta cortada`, detalle: `Tramo interrumpido en zona ${ev.zona}.` };
    case 'via_estado':
      return { titulo: `Estado de vía (${Math.round(ev.estado)}%)`, detalle: `Condición vial en zona ${ev.zona}.` };
    case 'zona_abierta':
      return { titulo: `Zona habilitada`, detalle: `Nueva conexión urbana en ${ev.zona}.` };
    case 'migracion_llegada':
      return { titulo: `Inmigración`, detalle: `Nuevo hogar incorporado en zona ${ev.zona}.` };
    case 'migracion_salida':
      return { titulo: `Emigración`, detalle: `Salida de vecino/hogar desde zona ${ev.zona}.` };
    case 'capacitacion_inicio':
      return { titulo: `Inicio de capacitación`, detalle: `Formación hacia ${ev.rolObjetivo} en ${ev.zona}.` };
    case 'capacitacion_fin':
      return { titulo: `Capacitación completada`, detalle: `Nuevo ${ev.rolObjetivo} en ${ev.zona}.` };
    default:
      return null;
  }
}

interface CityWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  ciudadTabRequest?: { tab: CityTab; seq: number } | null;
  onFocus: () => void;
  onClose: () => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onJumpZone: (z: ZoneId | 'all') => void;
  onSelectRoleSample: (role: RoleId) => void;
  onSelectNpc: (npcId: string) => void;
  onSelectHogar?: (hogarId: string) => void;
  onSelectParcela: (parcelaId: string) => void;
  onSelectTramo: (tramoId: string) => void;
  onBuildInParcela: (parcelaId: string, tipo: BuildingType) => { ok: boolean; error?: string };
  onBuildVia: (tramoId: string) => { ok: boolean; error?: string };
  onDemolishParcela: (parcelaId: string) => { ok: boolean; error?: string };
  onRespondDemand: (demandId: string, accept: boolean) => { ok: boolean; error?: string };
  onCounterOffer: (demandId: string) => { ok: boolean; aceptada?: boolean; error?: string; texto?: string };
  onHoverPreview?: (preview: MapHoverPreview | null) => void;
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

export const CityWindow: React.FC<CityWindowProps> = ({
  state,
  derived,
  zIndex,
  ciudadTabRequest,
  onFocus,
  onClose,
  onJumpZone,
  onSelectRoleSample,
  onSelectNpc,
  onSelectHogar,
  onSelectParcela,
  onSelectTramo,
  onBuildVia,
  onDemolishParcela,
  onRespondDemand,
  onCounterOffer,
  onHoverPreview,
  onInspectCausal,
}) => {
  const [cityTab, setCityTab] = useState<CityTab>('alertas');
  const [logFilter, setLogFilter] = useState<FactCategoryFilter>('todas');
  const [logZoneFilter, setLogZoneFilter] = useState<ZoneId | 'todas'>('todas');
  const [vecinosView, setVecinosView] = useState<'personas' | 'hogares'>('personas');
  const [npcQuery, setNpcQuery] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (ciudadTabRequest?.tab) {
      setCityTab(ciudadTabRequest.tab);
    }
  }, [ciudadTabRequest]);

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zoneIds = getWorldZones(state);
  const allZoneDefs = Object.values(state.zonas);
  const zonesCount = zoneIds.length;
  const activeFenomenos = getActivePhenomena(state);
  const announcedFenomenos = getAnnouncedPhenomena(state);
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const isG0 = govLevel === 'G0' || Boolean(state.config.estadoAutomatico);
  const isG1 = govLevel === 'G1';
  const isG3 = govLevel === 'G3';

  const activeAlerts: Array<{
    id: string;
    severity: 'critica' | 'aviso';
    title: string;
    detail: string;
    zona?: ZoneId | 'all';
    causalRef?: string;
  }> = [];

  if (state.gobierno.finanzas.impago) {
    const ev = state.eventos.find((e) => e.tipo === 'impago');
    const alcanzaNomina = state.gobierno.finanzas.alcanzaNomina;
    activeAlerts.push({
      id: 'al_impago',
      severity: 'critica',
      title: alcanzaNomina ? 'Impago de nómina' : 'Recorte por déficit',
      detail: alcanzaNomina
        ? 'El faltante en el cierre afectó sueldos públicos y puede disparar huelgas.'
        : 'El faltante recortó gastos discrecionales sin afectar la nómina.',
      zona: 'centro',
      causalRef: ev?.id,
    });
  }
  if (derived.hospitalOcupacionPct > 100) {
    const ev = state.eventos.find((e) => e.tipo === 'hospital_saturado');
    activeAlerts.push({
      id: 'al_hosp',
      severity: 'critica',
      title: `Hospitales llenos (${derived.hospitalOcupacionPct}%)`,
      detail: `${derived.internados}/${derived.capacidadHospitalTotal} camas · ${derived.esperandoCama} esperando.`,
      zona: 'centro',
      causalRef: ev?.id,
    });
  }
  if ((derived.tramosCortados ?? 0) > 0) {
    activeAlerts.push({
      id: 'al_vias_cut',
      severity: 'critica',
      title: `${derived.tramosCortados} vía(s) cortada(s)`,
      detail: 'Parcelas conectadas quedan aisladas hasta que Ingeniería las repare.',
      zona: 'all',
    });
  }
  if (derived.callePct > 12) {
    activeAlerts.push({
      id: 'al_calle',
      severity: 'aviso',
      title: `Hogares sin vivienda (${derived.callePct}%)`,
      detail: 'Eleva ocupaciones y daño en salud.',
      zona: 'centro',
    });
  }
  if (derived.hambreCriticaPct > 20) {
    activeAlerts.push({
      id: 'al_hambre',
      severity: 'critica',
      title: `Hambre crítica (${derived.hambreCriticaPct}%)`,
      detail: 'Supera el umbral de saqueos (> 20%) y daña salud y apoyo.',
      zona: 'oeste',
    });
  }
  if (derived.descontentosPct > 30) {
    activeAlerts.push({
      id: 'al_malestar',
      severity: 'critica',
      title: `Malestar alto (${derived.descontentosPct}%)`,
      detail: 'Supera el umbral de protestas (> 30%).',
      zona: 'este',
    });
  }
  for (const fen of announcedFenomenos) {
    const daysTo = Math.max(1, fen.inicioDia - state.reloj.dia);
    activeAlerts.push({
      id: `al_warn_${fen.id}`,
      severity: 'aviso',
      title: `Aviso: ${fen.nombre} en ${daysTo}d`,
      detail: fen.origen ? `Zona estimada: ${fen.origen}.` : 'Prepara reservas.',
      zona: fen.origen ?? 'all',
    });
  }
  for (const fen of activeFenomenos) {
    const ev = state.eventos.find((e) => e.tipo === 'fenomeno_inicio' && e.fenomenoId === fen.id);
    activeAlerts.push({
      id: `al_act_${fen.id}`,
      severity: fen.tipo === 'plaga_zombie' || fen.tipo === 'pandemia' ? 'critica' : 'aviso',
      title: `${fen.nombre} (${Math.round(fen.intensidad)}%)`,
      detail: fen.origen ? `Foco en zona ${fen.origen}.` : 'Afecta a toda la comunidad.',
      zona: fen.origen ?? 'all',
      causalRef: ev?.id || `clima:${fen.tipo}`,
    });
  }
  let hitAlerts = 0;
  for (const ev of state.eventos) {
    if (ev.tipo !== 'golpe' || state.reloj.dia - ev.dia > 3) continue;
    const npc = state.npcs.find((n) => n.id === ev.npcId);
    activeAlerts.push({
      id: `al_hit_${ev.id}`,
      severity: 'critica',
      title: `Ataque en ${ev.zona} (${npc?.nombre || 'vecino'})`,
      detail: `Daño -${ev.dano} salud (Día ${ev.dia}).`,
      zona: ev.zona,
      causalRef: ev.id,
    });
    hitAlerts += 1;
    if (hitAlerts >= 3) break;
  }

  const objetivoPerdido = state.eventos.find((e) => e.tipo === 'objetivo_perdido');
  const estadoObjetivo = state.resultado.victoriaCumplida
    ? 'Cumplido'
    : objetivoPerdido
    ? 'Perdido'
    : 'Pendiente';

  const totalAlertsBadge = activeAlerts.length + state.demandasActivas.length;
  const sortedParcelas = [...state.parcelas].sort((a, b) => a.orden - b.orden);
  const tramosUnbuilt = state.tramos.filter((t) => !t.construida);

  return (
    <div className="pointer-events-none fixed top-20 left-4 md:left-[260px]" style={{ zIndex }}>
      <RctWindow
        title="Ciudad y Vías"
        subtitle={`${totalAlertsBadge} alertas · ${derived.edificiosActivos} obras · ${derived.parcelasLibres} libres`}
        tone="green"
        icon={<Compass className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={() => {
          onHoverPreview?.(null);
          onClose();
        }}
        className="w-[540px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="grid grid-cols-5 gap-1 bg-zinc-800/80 p-1.5 rounded-xl text-xs">
            {(
              [
                { id: 'alertas', label: `Alertas (${totalAlertsBadge})` },
                { id: 'obras', label: `Parcelas (${derived.parcelasLibres})` },
                { id: 'vias', label: `Vías (${tramosUnbuilt.length})` },
                { id: 'vecinos', label: `Vecinos (${derived.poblacion})` },
                { id: 'bitacora', label: 'Bitácora' },
              ] as Array<{ id: CityTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCityTab(t.id)}
                className={`py-2 px-1.5 rounded-lg font-semibold transition-colors truncate ${
                  cityTab === t.id ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {actionError && (
            <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl px-3.5 py-2 text-xs text-rose-200 flex items-center justify-between gap-2">
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-300 hover:text-white font-semibold"
              >
                Cerrar
              </button>
            </div>
          )}

          {cityTab === 'alertas' && (
            <div className="space-y-4">
              {state.demandasActivas.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-amber-300">
                    Demandas ({state.demandasActivas.length})
                  </div>
                  {state.demandasActivas.map((dem) => (
                    <div
                      key={dem.id}
                      className="rounded-xl p-3.5 border border-amber-500/50 bg-amber-950/35 text-sm space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <UiTooltip text={`${dem.razon} · Si rechazas: ${dem.amenaza}`}>
                          <div className="font-semibold text-white cursor-help">
                            {dem.actorNombre}: {dem.pedido.etiqueta}
                          </div>
                        </UiTooltip>
                        <span className="font-mono text-xs font-semibold text-amber-300 shrink-0 tabular-nums">
                          {dem.diasRestantes}d
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isG0}
                          onClick={() => {
                            const res = onRespondDemand(dem.id, true);
                            if (!res.ok) setActionError(res.error ?? 'No se pudo aceptar.');
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          Aceptar
                        </button>
                        {isG3 && (
                          <button
                            type="button"
                            disabled={isG0}
                            onClick={() => {
                              const res = onCounterOffer(dem.id);
                              if (!res.ok) setActionError(res.error ?? 'No se pudo contraofertar.');
                              else if (res.texto) setActionError(res.texto);
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
                          >
                            Contraoferta
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isG0}
                          onClick={() => {
                            const res = onRespondDemand(dem.id, false);
                            if (!res.ok) setActionError(res.error ?? 'No se pudo rechazar.');
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(state.medidasVigentes.length > 0 || state.bloqueosPalanca.length > 0) && (
                <div className="bg-zinc-800/55 rounded-xl p-3.5 space-y-1.5 text-xs">
                  <div className="font-semibold text-zinc-200">Vigentes</div>
                  {state.bloqueosPalanca.map((b) => (
                    <div key={`${b.palanca}-${b.demandaId}`} className="flex items-center justify-between text-amber-300">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        {b.motivo}
                      </span>
                      <span className="font-mono tabular-nums">D{b.hastaDia}</span>
                    </div>
                  ))}
                  {state.medidasVigentes.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-rose-300">
                      <span>{m.descripcion}</span>
                      <span className="font-mono shrink-0 ml-2 tabular-nums">D{m.hastaDia}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeAlerts.length === 0 ? (
                <div className="py-5 text-sm text-zinc-400 text-center bg-zinc-800/40 rounded-xl">
                  Sin alertas hoy.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {activeAlerts.map((al) => (
                    <UiTooltip key={al.id} text={al.detail} placement="top" className="w-full">
                      <div
                        className={`w-full rounded-xl p-3.5 border text-sm flex items-center justify-between gap-3 ${
                          al.severity === 'critica'
                            ? 'bg-rose-950/35 border-rose-500/45'
                            : 'bg-amber-950/30 border-amber-500/45'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-white min-w-0">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              al.severity === 'critica' ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          />
                          <span className="truncate">{al.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {al.zona && (
                            <button
                              type="button"
                              onClick={() => onJumpZone(al.zona!)}
                              className="px-2.5 py-1 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg whitespace-nowrap"
                            >
                              Ir
                            </button>
                          )}
                          {al.causalRef && (
                            <button
                              type="button"
                              onClick={() => onInspectCausal(al.title, al.causalRef, al.detail)}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg whitespace-nowrap"
                            >
                              ¿Por qué?
                            </button>
                          )}
                        </div>
                      </div>
                    </UiTooltip>
                  ))}
                </div>
              )}

              {(activeFenomenos.length > 0 || announcedFenomenos.length > 0) && (
                <div className="bg-zinc-800/55 rounded-xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <CloudRain className="w-4 h-4" />
                    Clima
                  </div>
                  {activeFenomenos.map((f) => (
                    <div key={f.id} className="text-zinc-200">
                      {f.nombre} ({Math.round(f.intensidad)}%)
                      {f.origen ? ` · ${f.origen}` : ''}
                    </div>
                  ))}
                  {announcedFenomenos.map((f) => (
                    <div key={f.id} className="text-zinc-400">
                      Aviso: {f.nombre} en {Math.max(1, f.inicioDia - state.reloj.dia)}d
                      {f.origen ? ` · ${f.origen}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Zones Table (all active + no_urbanizada zones) */}
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <div className="text-xs font-semibold text-zinc-400">Zonas ({allZoneDefs.length})</div>
                <div className="space-y-1 font-mono text-xs tabular-nums">
                  <div className="grid grid-cols-6 text-zinc-500 font-sans pb-1 border-b border-zinc-800">
                    <span className="col-span-2">Zona</span>
                    <span className="text-right">Def.</span>
                    <span className="text-right">Orden</span>
                    <span className="text-right">Integ.</span>
                    <span className="text-right">Suelo</span>
                  </div>
                  {allZoneDefs.map((zDef) => {
                    const z = zDef.id;
                    const noUrb = zDef.estado === 'no_urbanizada';
                    const def = Math.round(derived.defensa[z] ?? 0);
                    const ord = Math.round(derived.orden?.[z] ?? 0);
                    const integ = Math.round(state.gobierno.integridad?.[z] ?? 100);
                    const dem = (state.demandaSuelo?.[`${z}:residencial`] ?? 1).toFixed(2);
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => onJumpZone(z)}
                        onMouseEnter={() => onHoverPreview?.({ zona: z })}
                        onMouseLeave={() => onHoverPreview?.(null)}
                        className="w-full grid grid-cols-6 items-center py-2 px-1.5 rounded-xl hover:bg-zinc-800/70 text-left transition-colors"
                      >
                        <span className="col-span-2 font-sans text-zinc-200 font-medium truncate">
                          {zDef.nombre}
                          {noUrb ? ' (virgen)' : ''}
                        </span>
                        <span className={`text-right ${noUrb ? 'text-zinc-500' : def < 35 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                          {noUrb ? '—' : `${def}%`}
                        </span>
                        <span className={`text-right ${noUrb ? 'text-zinc-500' : ord < 35 ? 'text-amber-300 font-bold' : 'text-zinc-200'}`}>
                          {noUrb ? '—' : `${ord}%`}
                        </span>
                        <span className={`text-right ${noUrb ? 'text-zinc-500' : integ < 60 ? 'text-amber-300 font-bold' : 'text-emerald-400'}`}>
                          {noUrb ? '—' : `${integ}%`}
                        </span>
                        <span className={`text-right ${Number(dem) >= 1.5 ? 'text-amber-300 font-bold' : 'text-zinc-300'}`}>
                          {dem}x
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {cityTab === 'obras' && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-4 gap-2 bg-zinc-800/55 rounded-xl p-3 font-mono tabular-nums text-xs">
                <div>
                  <span className="font-sans text-zinc-400 block">Activas</span>
                  <span className="font-bold text-white text-sm">{derived.edificiosActivos}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Libres</span>
                  <span className="font-bold text-emerald-400 text-sm">{derived.parcelasLibres}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Sin vía</span>
                  <span className="font-bold text-zinc-300 text-sm">{derived.parcelasSinCalle ?? 0}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Camas</span>
                  <span className={`font-bold text-sm ${derived.hospitalesLlenos > 0 ? 'text-rose-400' : 'text-white'}`}>
                    {derived.internados}/{derived.capacidadHospitalTotal}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {sortedParcelas.map((p) => {
                  const b = p.edificio;
                  const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
                  const distName = DISTRICT_BY_ID[p.distrito]?.nombre ?? p.distrito;
                  const zoneName = state.zonas[p.zona]?.nombre ?? p.zona;
                  const openingVia = p.tramoAperturaId
                    ? state.tramos.find((t) => t.id === p.tramoAperturaId)
                    : undefined;

                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => onHoverPreview?.({ parcelaId: p.id })}
                      onMouseLeave={() => onHoverPreview?.(null)}
                      className="bg-zinc-800/55 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <UiTooltip text={`${zoneName} · ${distName}`}>
                          <div className="flex items-center gap-2 font-semibold text-white truncate cursor-help">
                            <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">{p.nombre}</span>
                          </div>
                        </UiTooltip>
                        <div className="text-xs mt-1">
                          {p.estado === 'sin_calle' && (
                            <span className="text-zinc-400 flex items-center gap-1.5">
                              <Route className="w-3.5 h-3.5 text-zinc-500" />
                              Requiere vía{openingVia ? `: ${openingVia.nombre}` : ''}
                            </span>
                          )}
                          {p.estado === 'libre' && (
                            <span className="text-emerald-400 font-medium">Libre · {zoneName}</span>
                          )}
                          {p.estado === 'en_obra' && b && bDef && (
                            <span className="text-amber-300 flex items-center gap-1.5">
                              <Hammer className="w-3.5 h-3.5" />
                              {bDef.nombre} · {b.diasObraRestantes}d
                            </span>
                          )}
                          {p.estado === 'ocupada' && b && bDef && (
                            <span className="text-zinc-300">
                              {bDef.nombre}
                              {b.diasRestantesCampana !== undefined ? ` · ${b.diasRestantesCampana}d` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {p.estado === 'sin_calle' && openingVia && !openingVia.construida && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectTramo(openingVia.id);
                              onJumpZone(openingVia.zonaA);
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-amber-600/80 hover:bg-amber-500 text-white rounded-xl whitespace-nowrap shrink-0"
                          >
                            Ver vía
                          </button>
                        )}
                        {p.estado !== 'sin_calle' && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectParcela(p.id);
                              onJumpZone(p.zona);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 ${
                              p.estado === 'libre'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                            }`}
                          >
                            {p.estado === 'libre' ? 'Construir' : 'Ver'}
                          </button>
                        )}
                        {b && b.dueno === 'estado' && !isG0 && (
                          <button
                            type="button"
                            title="Demoler"
                            onClick={() => {
                              const res = onDemolishParcela(p.id);
                              if (!res.ok) setActionError(res.error ?? 'No se pudo demoler.');
                            }}
                            className="p-2 rounded-xl bg-rose-950/70 hover:bg-rose-800 text-rose-200 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isG0 && preset.hitos.length > 0 && (
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <div className="text-xs font-semibold text-zinc-400">Hitos</div>
                  {preset.hitos.map((h) => {
                    const done = state.hitosCumplidos.includes(h.id);
                    return (
                      <UiTooltip key={h.id} text={h.descripcion} placement="top" className="w-full">
                        <div
                          className={`w-full rounded-xl px-3.5 py-2.5 border text-xs flex items-center justify-between gap-2 ${
                            done
                              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                              : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-300'
                          }`}
                        >
                          <span className="font-semibold flex items-center gap-2">
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                            )}
                            <span>{h.nombre}</span>
                          </span>
                          <span className="font-mono shrink-0 tabular-nums">
                            {done ? 'Cumplido' : 'Pendiente'}
                          </span>
                        </div>
                      </UiTooltip>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {cityTab === 'vias' && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-4 gap-2 bg-zinc-800/55 rounded-xl p-3 font-mono tabular-nums text-xs">
                <div>
                  <span className="font-sans text-zinc-400 block">Activas</span>
                  <span className="font-bold text-white text-sm">
                    {state.tramos.filter((t) => t.construida).length}/{state.tramos.length}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Cortadas</span>
                  <span className={`font-bold text-sm ${(derived.tramosCortados ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {derived.tramosCortados ?? 0}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Mal estado</span>
                  <span className={`font-bold text-sm ${(derived.tramosEnMalEstado ?? 0) > 0 ? 'text-amber-300' : 'text-zinc-200'}`}>
                    {derived.tramosEnMalEstado ?? 0}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Vírgenes</span>
                  <span className="font-bold text-zinc-200 text-sm">{derived.zonasNoUrbanizadas ?? 0}</span>
                </div>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {[...state.tramos]
                  .sort((a, b) => Number(a.construida) - Number(b.construida))
                  .map((t) => {
                    const connectable = isViaConnectableToNetwork(state, t);
                    const isOpenable = !t.construida && !t.enObra && connectable;
                    const noFunds = state.gobierno.reserva < t.costoObra;
                    const viaBlockedByGov = isG0 || isG1;
                    const zA = state.zonas[t.zonaA]?.nombre ?? t.zonaA;
                    const zB = t.zonaB ? state.zonas[t.zonaB]?.nombre ?? t.zonaB : null;

                    return (
                      <div
                        key={t.id}
                        onMouseEnter={() => onHoverPreview?.({ tramoId: t.id })}
                        onMouseLeave={() => onHoverPreview?.(null)}
                        className="bg-zinc-800/55 border border-zinc-700/60 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 font-semibold text-white truncate">
                            <Route className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="truncate">{t.nombre}</span>
                          </div>
                          <div className="text-xs text-zinc-400 truncate">
                            {t.tipo} · {zA}
                            {zB ? ` ↔ ${zB}` : ''}
                            {t.parcelasAbiertas.length > 0 ? ` · +${t.parcelasAbiertas.length} parc.` : ''}
                            {t.zonaAbierta ? ` · Abre ${state.zonas[t.zonaAbierta]?.nombre ?? t.zonaAbierta}` : ''}
                          </div>
                          <div className="text-xs font-mono tabular-nums">
                            {t.construida ? (
                              <span
                                className={
                                  t.estado <= 0
                                    ? 'text-rose-400 font-semibold'
                                    : t.estado < 50
                                    ? 'text-amber-300'
                                    : 'text-emerald-400'
                                }
                              >
                                Estado {Math.round(t.estado)}% · Mant. ${t.mantenimientoPeriodo}/per
                              </span>
                            ) : t.enObra ? (
                              <span className="text-amber-300">
                                En obra · {t.diasObraRestantes}/{t.diasObraTotal}d
                              </span>
                            ) : (
                              <span className={connectable ? 'text-amber-200' : 'text-zinc-500'}>
                                ${t.costoObra} · {t.diasObraTotal}d · Mant. ${t.mantenimientoPeriodo}/per
                                {!connectable ? ' · Sin conexión' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectTramo(t.id);
                              onJumpZone(t.zonaA);
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl whitespace-nowrap shrink-0"
                          >
                            Ver
                          </button>
                          {isOpenable && (
                            <button
                              type="button"
                              disabled={viaBlockedByGov || noFunds}
                              onClick={() => {
                                const res = onBuildVia(t.id);
                                if (!res.ok) setActionError(res.error ?? 'No se pudo construir vía.');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
                            >
                              {viaBlockedByGov ? 'G2+' : noFunds ? 'Sin caja' : 'Construir'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {cityTab === 'vecinos' && (() => {
            const ageBuckets = [
              { label: '0–17', min: 0, max: 17, count: 0 },
              { label: '18–34', min: 18, max: 34, count: 0 },
              { label: '35–54', min: 35, max: 54, count: 0 },
              { label: '55–64', min: 55, max: 64, count: 0 },
              { label: '65+', min: 65, max: 200, count: 0 },
            ];
            let acogidaCount = 0;
            for (const n of state.npcs) {
              if (!n.vivo) continue;
              const b = ageBuckets.find((k) => n.edad >= k.min && n.edad <= k.max);
              if (b) b.count += 1;
            }
            for (const h of state.hogares) {
              if (h.estado === 'acogida') acogidaCount += 1;
            }
            const maxBucket = Math.max(1, ...ageBuckets.map((b) => b.count));

            return (
              <div className="space-y-4 text-sm">
                {/* Demographic Summary + Age Pyramid */}
                <div className="bg-zinc-800/55 rounded-xl p-3.5 space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="font-sans text-zinc-400 block">Edad media</span>
                      <span className="font-bold text-white">{derived.edadMedia.toFixed(1)}a</span>
                    </div>
                    <div>
                      <span className="font-sans text-zinc-400 block">Natalidad</span>
                      <span className="font-bold text-emerald-400">{derived.natalidad.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="font-sans text-zinc-400 block">Mortalidad</span>
                      <span className="font-bold text-rose-400">{derived.mortalidad.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="font-sans text-zinc-400 block">Acogida</span>
                      <span className="font-bold text-amber-300">{acogidaCount} hog.</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {ageBuckets.map((b) => {
                      const pct = Math.round((b.count / Math.max(1, derived.poblacion)) * 100);
                      const barW = Math.round((b.count / maxBucket) * 100);
                      return (
                        <div key={b.label} className="grid grid-cols-[44px_1fr_54px] items-center gap-2 text-[11px] font-mono tabular-nums">
                          <span className="text-zinc-400">{b.label}</span>
                          <div className="h-2 bg-zinc-900 rounded-sm overflow-hidden">
                            <div className="h-full bg-emerald-500/85 rounded-sm" style={{ width: `${barW}%` }} />
                          </div>
                          <span className="text-right text-zinc-300">{b.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Personas / Hogares toggle */}
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-2 gap-1 bg-zinc-800/80 p-1 rounded-xl text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setVecinosView('personas')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                        vecinosView === 'personas' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Personas
                    </button>
                    <button
                      type="button"
                      onClick={() => setVecinosView('hogares')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                        vecinosView === 'hogares' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Hogares ({state.hogares.length})
                    </button>
                  </div>
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={npcQuery}
                      onChange={(e) => setNpcQuery(e.target.value)}
                      placeholder={
                        vecinosView === 'personas'
                          ? 'Buscar vecino, oficio o zona…'
                          : 'Buscar hogar o zona…'
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {vecinosView === 'personas' ? (
                  <div className="max-h-[190px] overflow-y-auto divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl">
                    {(() => {
                      const q = npcQuery.trim().toLowerCase();
                      const matches: Array<{ npc: (typeof state.npcs)[number]; z: ReturnType<typeof getEffectiveZone> }> = [];
                      for (const n of state.npcs) {
                        if (!n.vivo) continue;
                        const z = getEffectiveZone(n, zonesCount);
                        if (q) {
                          const roleLabel = ROLE_CATALOG[n.rol].nombre.toLowerCase();
                          const zName = (state.zonas[z]?.nombre ?? z).toLowerCase();
                          if (
                            !`${n.nombre} ${n.apellido}`.toLowerCase().includes(q) &&
                            !roleLabel.includes(q) &&
                            !z.includes(q) &&
                            !zName.includes(q)
                          ) {
                            continue;
                          }
                        }
                        matches.push({ npc: n, z });
                        if (matches.length >= 45) break;
                      }
                      return matches.map(({ npc: n, z }) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onSelectNpc(n.id)}
                          className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800 text-xs transition-colors"
                        >
                          <span className="truncate text-zinc-100">
                            <strong>{n.nombre} {n.apellido}</strong>{' '}
                            <span className="text-zinc-400">
                              · {ROLE_CATALOG[n.rol].nombre} · {state.zonas[z]?.nombre ?? z}
                            </span>
                          </span>
                          <span className="font-mono text-zinc-400 tabular-nums shrink-0 ml-2">
                            {Math.round(n.variables.salud)}% / {Math.round(n.variables.hambre)}%
                          </span>
                        </button>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="max-h-[190px] overflow-y-auto divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl">
                    {(() => {
                      const q = npcQuery.trim().toLowerCase();
                      const npcById = new Map(state.npcs.map((n) => [n.id, n]));
                      const matches = state.hogares
                        .filter((h) => {
                          if (!q) return true;
                          const zName = (state.zonas[h.zona]?.nombre ?? h.zona).toLowerCase();
                          const memberNames = h.miembros
                            .map((id) => {
                              const m = npcById.get(id);
                              return m ? `${m.nombre} ${m.apellido}` : '';
                            })
                            .join(' ')
                            .toLowerCase();
                          return (
                            h.id.toLowerCase().includes(q) ||
                            zName.includes(q) ||
                            h.estado.includes(q) ||
                            memberNames.includes(q)
                          );
                        })
                        .slice(0, 45);
                      return matches.map((h) => {
                        const head = npcById.get(h.miembros[0]);
                        const label = head ? `Familia ${head.apellido} (${head.nombre})` : h.id;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onSelectHogar?.(h.id)}
                            className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800 text-xs transition-colors"
                          >
                            <span className="truncate text-zinc-100">
                              <strong>{label}</strong>{' '}
                              <span className="text-zinc-400">
                                · {h.miembros.length} p. · {state.zonas[h.zona]?.nombre ?? h.zona}
                              </span>
                            </span>
                            <span
                              className={`font-mono tabular-nums shrink-0 ml-2 ${
                                h.estado === 'calle'
                                  ? 'text-rose-400 font-semibold'
                                  : h.estado === 'acogida'
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }`}
                            >
                              ${h.dinero.toFixed(0)} · {h.estado === 'con_casa' ? 'Casa' : h.estado}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <div className="text-xs font-semibold text-zinc-400">Oficios</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(ROLE_CATALOG) as RoleId[]).map((rId) => {
                      const def = ROLE_CATALOG[rId];
                      const count = derived.roles[rId];
                      return (
                        <button
                          key={rId}
                          type="button"
                          disabled={count === 0}
                          onClick={() => onSelectRoleSample(rId)}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 disabled:opacity-35 text-left text-xs transition-colors"
                        >
                          <span className="flex items-center gap-2 truncate text-zinc-200">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: def.color }} />
                            <span className="truncate">{def.nombre}</span>
                          </span>
                          <span className="font-mono text-zinc-400 tabular-nums">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {cityTab === 'bitacora' && (() => {
            const simById = new Map(state.eventos.map((ev) => [ev.id, ev]));
            const seenSimIds = new Set<string>();
            interface FactItem {
              id: string;
              dia: number;
              category: Exclude<FactCategoryFilter, 'todas'>;
              zona?: ZoneId;
              titulo: string;
              detalle: string;
              causalRef?: string;
            }
            const facts: FactItem[] = [];
            for (const entry of state.bitacora) {
              const simEv = entry.simEventId ? simById.get(entry.simEventId) : undefined;
              if (simEv) seenSimIds.add(simEv.id);
              const cat = classifyFactCategory(simEv, entry.categoria, entry.titulo, entry.detalle);
              facts.push({
                id: entry.id,
                dia: entry.dia,
                category: cat,
                zona: simEv?.zona,
                titulo: entry.titulo,
                detalle: entry.detalle,
                causalRef: entry.simEventId || entry.causa,
              });
            }
            for (const ev of state.eventos) {
              if (seenSimIds.has(ev.id)) continue;
              const desc = describeSimEvent(ev, state);
              if (!desc) continue;
              facts.push({
                id: `ev_${ev.id}`,
                dia: ev.dia,
                category: classifyFactCategory(ev),
                zona: ev.zona,
                titulo: desc.titulo,
                detalle: desc.detalle,
                causalRef: ev.id,
              });
            }
            facts.sort((a, b) => b.dia - a.dia);

            const filteredFacts = facts
              .filter((f) => logFilter === 'todas' || f.category === logFilter)
              .filter((f) => logZoneFilter === 'todas' || f.zona === logZoneFilter)
              .slice(0, 50);

            return (
              <div className="space-y-4">
                {!isG0 && (
                  <UiTooltip
                    text={`Meta: ${preset.victoria.descripcion} · Derrota: ${preset.derrota.descripcion}`}
                    placement="top"
                    className="w-full"
                  >
                    <div className="w-full bg-zinc-800/55 rounded-xl p-3.5 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">{preset.nombre}</span>
                        <span className="font-mono text-xs tabular-nums">
                          <span
                            className={
                              estadoObjetivo === 'Cumplido'
                                ? 'text-emerald-400 font-bold'
                                : estadoObjetivo === 'Perdido'
                                ? 'text-rose-400 font-bold'
                                : 'text-amber-300 font-bold'
                            }
                          >
                            {estadoObjetivo}
                          </span>
                          <span className="text-zinc-400 ml-2">
                            D{state.reloj.dia}/{preset.victoria.plazoDia ?? 365}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300">{preset.victoria.descripcion}</p>
                    </div>
                  </UiTooltip>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    ['todas', 'vida', 'familia', 'mercado', 'vivienda', 'obras', 'clima', 'caos', 'prensa'] as const
                  ).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setLogFilter(c)}
                      className={`px-2.5 py-1 text-xs rounded-xl capitalize transition-colors whitespace-nowrap ${
                        logFilter === c
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <select
                    aria-label="Filtrar registro por zona"
                    value={logZoneFilter}
                    onChange={(e) => setLogZoneFilter(e.target.value as ZoneId | 'todas')}
                    className="ml-auto bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-xl px-2.5 py-1"
                  >
                    <option value="todas">Todas las zonas</option>
                    {allZoneDefs.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="divide-y divide-zinc-800 max-h-[260px] overflow-y-auto pr-1">
                  {filteredFacts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-400">
                      Sin hechos registrados para este filtro.
                    </div>
                  ) : (
                    filteredFacts.map((entry) => (
                      <div key={entry.id} className="py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-100">{entry.titulo}</span>
                          <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0">
                            D{entry.dia}
                          </span>
                        </div>
                        <p className="text-zinc-400 text-xs mt-1">{entry.detalle}</p>
                        {(entry.zona || entry.causalRef) && (
                          <div className="flex items-center justify-end gap-3 mt-1.5">
                            {entry.zona && (
                              <button
                                type="button"
                                onClick={() => onJumpZone(entry.zona!)}
                                className="text-xs font-semibold text-zinc-300 hover:text-white hover:underline whitespace-nowrap"
                              >
                                Ir ({state.zonas[entry.zona]?.nombre ?? entry.zona})
                              </button>
                            )}
                            {entry.causalRef && (
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectCausal(entry.titulo, entry.causalRef, entry.detalle)
                                }
                                className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline whitespace-nowrap"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                ¿Por qué?
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </RctWindow>
    </div>
  );
};
