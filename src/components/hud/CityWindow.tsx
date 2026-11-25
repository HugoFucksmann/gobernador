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
  Search,
  Trash2,
} from 'lucide-react';
import {
  BUILDING_CATALOG,
  DISTRICT_BY_ID,
  ROLE_CATALOG,
  SCENARIO_PRESETS,
  ZONE_TO_DISTRICT,
} from '../../data/catalogs';
import {
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveZone,
  getWorldZones,
} from '../../engine/simulation';
import {
  BuildingType,
  CommunityDerived,
  DistrictId,
  EventLogEntry,
  GameState,
  RoleId,
} from '../../types/game';
import { CityTab } from '../../types/ui';
import { RctWindow } from './RctWindow';
import { UiTooltip } from './UiTooltip';

interface CityWindowProps {
  state: GameState;
  derived: CommunityDerived;
  zIndex: number;
  ciudadTabRequest?: { tab: CityTab; seq: number } | null;
  onFocus: () => void;
  onClose: () => void;
  onJumpDistrict: (d: DistrictId | 'all') => void;
  onSelectRoleSample: (role: RoleId) => void;
  onSelectNpc: (npcId: string) => void;
  onSelectParcela: (parcelaId: string) => void;
  onBuildInParcela: (parcelaId: string, tipo: BuildingType) => { ok: boolean; error?: string };
  onDemolishParcela: (parcelaId: string) => { ok: boolean; error?: string };
  onRespondDemand: (demandId: string, accept: boolean) => { ok: boolean; error?: string };
  onInspectCausal: (title: string, ref?: string, fallbackText?: string) => void;
}

export const CityWindow: React.FC<CityWindowProps> = ({
  state,
  derived,
  zIndex,
  ciudadTabRequest,
  onFocus,
  onClose,
  onJumpDistrict,
  onSelectRoleSample,
  onSelectNpc,
  onSelectParcela,
  onDemolishParcela,
  onRespondDemand,
  onInspectCausal,
}) => {
  const [cityTab, setCityTab] = useState<CityTab>('alertas');
  const [logFilter, setLogFilter] = useState<EventLogEntry['categoria'] | 'todas'>('todas');
  const [npcQuery, setNpcQuery] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (ciudadTabRequest?.tab) {
      setCityTab(ciudadTabRequest.tab);
    }
  }, [ciudadTabRequest]);

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zoneIds = getWorldZones(state);
  const zonesCount = zoneIds.length;
  const activeFenomenos = getActivePhenomena(state);
  const announcedFenomenos = getAnnouncedPhenomena(state);
  const govLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');
  const isG0 = govLevel === 'G0';

  const activeAlerts: Array<{
    id: string;
    severity: 'critica' | 'aviso';
    title: string;
    detail: string;
    district?: DistrictId | 'all';
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
      district: 'civico',
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
      district: 'civico',
      causalRef: ev?.id,
    });
  }
  if (derived.hambreCriticaPct > 20) {
    activeAlerts.push({
      id: 'al_hambre',
      severity: 'critica',
      title: `Hambre crítica (${derived.hambreCriticaPct}%)`,
      detail: 'Supera el umbral de saqueos (> 20%) y daña salud y apoyo.',
      district: 'campos',
    });
  }
  if (derived.descontentosPct > 30) {
    activeAlerts.push({
      id: 'al_malestar',
      severity: 'critica',
      title: `Malestar alto (${derived.descontentosPct}%)`,
      detail: 'Supera el umbral de protestas (> 30%).',
      district: 'mercado',
    });
  }
  for (const fen of announcedFenomenos) {
    const daysTo = Math.max(1, fen.inicioDia - state.reloj.dia);
    activeAlerts.push({
      id: `al_warn_${fen.id}`,
      severity: 'aviso',
      title: `Aviso: ${fen.nombre} en ${daysTo}d`,
      detail: fen.origen ? `Zona estimada: ${fen.origen}.` : 'Prepara reservas.',
      district: fen.origen ? ZONE_TO_DISTRICT[fen.origen] : 'all',
    });
  }
  for (const fen of activeFenomenos) {
    const ev = state.eventos.find((e) => e.tipo === 'fenomeno_inicio' && e.fenomenoId === fen.id);
    activeAlerts.push({
      id: `al_act_${fen.id}`,
      severity: fen.tipo === 'plaga_zombie' || fen.tipo === 'pandemia' ? 'critica' : 'aviso',
      title: `${fen.nombre} (${Math.round(fen.intensidad)}%)`,
      detail: fen.origen ? `Foco en zona ${fen.origen}.` : 'Afecta a toda la comunidad.',
      district: fen.origen ? ZONE_TO_DISTRICT[fen.origen] : 'all',
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
      district: ZONE_TO_DISTRICT[ev.zona],
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

  return (
    <div className="pointer-events-none fixed top-20 left-4 md:left-[260px]" style={{ zIndex }}>
      <RctWindow
        title="Ciudad"
        subtitle={`${totalAlertsBadge} alertas · ${derived.edificiosActivos} obras · ${derived.parcelasLibres} libres`}
        tone="green"
        icon={<Compass className="w-4 h-4" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[500px] max-w-[calc(100vw-32px)]"
      >
        <div className="p-5 max-h-[calc(100vh-195px)] overflow-y-auto space-y-4">
          <div className="grid grid-cols-4 gap-1.5 bg-zinc-800/80 p-1.5 rounded-xl text-xs">
            {(
              [
                { id: 'alertas', label: `Alertas (${totalAlertsBadge})` },
                { id: 'obras', label: `Parcelas (${derived.parcelasLibres})` },
                { id: 'vecinos', label: `Vecinos (${derived.poblacion})` },
                { id: 'bitacora', label: 'Bitácora' },
              ] as Array<{ id: CityTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCityTab(t.id)}
                className={`py-2 px-2 rounded-lg font-semibold transition-colors truncate ${
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
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isG0}
                          onClick={() => {
                            const res = onRespondDemand(dem.id, true);
                            if (!res.ok) setActionError(res.error ?? 'No se pudo aceptar.');
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-40"
                        >
                          Aceptar
                        </button>
                        <button
                          type="button"
                          disabled={isG0}
                          onClick={() => {
                            const res = onRespondDemand(dem.id, false);
                            if (!res.ok) setActionError(res.error ?? 'No se pudo rechazar.');
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl disabled:opacity-40"
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
                          {al.district && (
                            <button
                              type="button"
                              onClick={() => onJumpDistrict(al.district!)}
                              className="px-2.5 py-1 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg"
                            >
                              Ir
                            </button>
                          )}
                          {al.causalRef && (
                            <button
                              type="button"
                              onClick={() => onInspectCausal(al.title, al.causalRef, al.detail)}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
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

              {/* Zones Table */}
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <div className="text-xs font-semibold text-zinc-400">Zonas</div>
                <div className="space-y-1 font-mono text-xs tabular-nums">
                  <div className="grid grid-cols-5 text-zinc-500 font-sans pb-1 border-b border-zinc-800">
                    <span>Zona</span>
                    <span className="text-right">Def.</span>
                    <span className="text-right">Orden</span>
                    <span className="text-right">Integ.</span>
                    <span className="text-right">Amen.</span>
                  </div>
                  {zoneIds.map((z) => {
                    const def = Math.round(derived.defensa[z] ?? 0);
                    const ord = Math.round(derived.orden?.[z] ?? 0);
                    const integ = Math.round(state.gobierno.integridad?.[z] ?? 100);
                    const amen = Math.round(derived.amenazaPercibida[z] ?? 0);
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => onJumpDistrict(ZONE_TO_DISTRICT[z])}
                        className="w-full grid grid-cols-5 items-center py-2 px-1.5 rounded-xl hover:bg-zinc-800/70 text-left transition-colors"
                      >
                        <span className="font-sans capitalize text-zinc-200 font-medium">{z}</span>
                        <span className={`text-right ${def < 35 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                          {def}%
                        </span>
                        <span className={`text-right ${ord < 35 ? 'text-amber-300 font-bold' : 'text-zinc-200'}`}>
                          {ord}%
                        </span>
                        <span className={`text-right ${integ < 60 ? 'text-amber-300 font-bold' : 'text-emerald-400'}`}>
                          {integ}%
                        </span>
                        <span className={`text-right ${amen >= 50 ? 'text-rose-400 font-bold' : 'text-zinc-300'}`}>
                          {amen}%
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
              <div className="grid grid-cols-3 gap-3 bg-zinc-800/55 rounded-xl p-3 font-mono tabular-nums text-xs">
                <div>
                  <span className="font-sans text-zinc-400 block">Activas</span>
                  <span className="font-bold text-white text-sm">{derived.edificiosActivos}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Libres</span>
                  <span className="font-bold text-emerald-400 text-sm">{derived.parcelasLibres}</span>
                </div>
                <div>
                  <span className="font-sans text-zinc-400 block">Camas</span>
                  <span className={`font-bold text-sm ${derived.hospitalesLlenos > 0 ? 'text-rose-400' : 'text-white'}`}>
                    {derived.internados}/{derived.capacidadHospitalTotal}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {sortedParcelas.map((p) => {
                  const b = p.edificio;
                  const bDef = b ? BUILDING_CATALOG[b.tipo] : null;
                  const hito = p.hitoRequerido
                    ? preset.hitos.find((h) => h.id === p.hitoRequerido)
                    : undefined;
                  const distName = DISTRICT_BY_ID[p.distrito]?.nombre ?? p.distrito;
                  return (
                    <div
                      key={p.id}
                      className="bg-zinc-800/55 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <UiTooltip text={`${p.zona} · ${distName}`}>
                          <div className="flex items-center gap-2 font-semibold text-white truncate cursor-help">
                            <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">{p.nombre}</span>
                          </div>
                        </UiTooltip>
                        <div className="text-xs mt-1">
                          {p.estado === 'bloqueada' && (
                            <span className="text-zinc-400 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-zinc-500" />
                              {hito?.nombre ?? p.hitoRequerido}
                            </span>
                          )}
                          {p.estado === 'libre' && (
                            <span className="text-emerald-400 font-medium">Libre</span>
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
                        {p.estado !== 'bloqueada' && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectParcela(p.id);
                              onJumpDistrict(p.distrito);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-xl ${
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
                            className="p-2 rounded-xl bg-rose-950/70 hover:bg-rose-800 text-rose-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {preset.hitos.length > 0 && (
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <div className="text-xs font-semibold text-zinc-400">Hitos</div>
                  {preset.hitos.map((h) => {
                    const done = state.hitosCumplidos.includes(h.id);
                    const streak = state.hitosRacha[h.id] ?? 0;
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
                            {done ? 'OK' : `${streak}/${h.condicion.periodos}`}
                          </span>
                        </div>
                      </UiTooltip>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {cityTab === 'vecinos' && (
            <div className="space-y-4 text-sm">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={npcQuery}
                  onChange={(e) => setNpcQuery(e.target.value)}
                  placeholder="Buscar vecino, oficio o zona…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="max-h-[200px] overflow-y-auto divide-y divide-zinc-800 bg-zinc-800/45 rounded-xl">
                {(() => {
                  const q = npcQuery.trim().toLowerCase();
                  const matches: Array<{ npc: (typeof state.npcs)[number]; z: ReturnType<typeof getEffectiveZone> }> = [];
                  for (const n of state.npcs) {
                    if (!n.vivo) continue;
                    const z = getEffectiveZone(n, zonesCount);
                    if (q) {
                      const roleLabel = ROLE_CATALOG[n.rol].nombre.toLowerCase();
                      if (
                        !n.nombre.toLowerCase().includes(q) &&
                        !roleLabel.includes(q) &&
                        !z.includes(q)
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
                        <strong>{n.nombre}</strong>{' '}
                        <span className="text-zinc-400">
                          · {ROLE_CATALOG[n.rol].nombre} · {z}
                        </span>
                      </span>
                      <span className="font-mono text-zinc-400 tabular-nums shrink-0 ml-2">
                        {Math.round(n.variables.salud)}% / {Math.round(n.variables.hambre)}%
                      </span>
                    </button>
                  ));
                })()}
              </div>

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
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: def.color }} />
                          <span className="truncate">{def.nombre}</span>
                        </span>
                        <span className="font-mono text-zinc-400 tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {cityTab === 'bitacora' && (
            <div className="space-y-4">
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

              <div className="flex flex-wrap gap-1.5">
                {(['todas', 'gobernador', 'caos', 'condicion', 'economia', 'clima', 'prensa'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLogFilter(c)}
                    className={`px-3 py-1.5 text-xs rounded-xl capitalize transition-colors ${
                      logFilter === c
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'bg-zinc-800 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {c === 'todas' ? 'Todas' : c === 'condicion' ? 'Condición' : c === 'economia' ? 'Economía' : c}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-zinc-800 max-h-[260px] overflow-y-auto pr-1">
                {state.bitacora
                  .filter((e) => logFilter === 'todas' || e.categoria === logFilter)
                  .slice(0, 40)
                  .map((entry) => (
                    <div key={entry.id} className="py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-100">{entry.titulo}</span>
                        <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0">
                          D{entry.dia}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-xs mt-1">{entry.detalle}</p>
                      {(entry.simEventId || entry.causa) && (
                        <div className="flex justify-end mt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectCausal(
                                entry.titulo,
                                entry.simEventId || entry.causa,
                                entry.detalle
                              )
                            }
                            className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            ¿Por qué?
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </RctWindow>
    </div>
  );
};
