import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudRain, Compass, GitBranch, Search } from 'lucide-react';
import { ROLE_CATALOG, SCENARIO_PRESETS, ZONE_TO_DISTRICT } from '../../data/catalogs';
import {
  getActivePhenomena,
  getAnnouncedPhenomena,
  getEffectiveZone,
  getWorldZones,
} from '../../engine/simulation';
import {
  CommunityDerived,
  DistrictId,
  EventLogEntry,
  GameState,
  RoleId,
} from '../../types/game';
import { CityTab } from '../../types/ui';
import { RctWindow } from './RctWindow';

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
  onInspectCausal,
}) => {
  const [cityTab, setCityTab] = useState<CityTab>('alertas');
  const [logFilter, setLogFilter] = useState<EventLogEntry['categoria'] | 'todas'>('todas');
  const [npcQuery, setNpcQuery] = useState<string>('');

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
      title: alcanzaNomina ? 'Impago de nómina pública' : 'Recorte en gastos discrecionales por déficit',
      detail: alcanzaNomina
        ? 'El faltante en el último cierre alcanzó los sueldos públicos y puede disparar huelgas.'
        : 'El faltante recortó prensa, operación de servicios o ayuda social, sin afectar la nómina.',
      district: 'civico',
      causalRef: ev?.id,
    });
  }
  if (derived.hospitalOcupacionPct > 100) {
    const ev = state.eventos.find((e) => e.tipo === 'hospital_saturado');
    activeAlerts.push({
      id: 'al_hosp',
      severity: 'critica',
      title: `Hospital saturado (${derived.hospitalOcupacionPct}%)`,
      detail: `${derived.internados}/${derived.camasHospital} camas ocupadas · ${derived.esperandoCama} esperando.`,
      district: 'civico',
      causalRef: ev?.id,
    });
  }
  if (derived.hambreCriticaPct > 20) {
    activeAlerts.push({
      id: 'al_hambre',
      severity: 'critica',
      title: `Hambre crítica en ${derived.hambreCriticaPct}% de vecinos`,
      detail: 'Supera el umbral de saqueos (> 20%) y reduce apoyo y salud.',
      district: 'campos',
    });
  }
  if (derived.descontentosPct > 30) {
    activeAlerts.push({
      id: 'al_malestar',
      severity: 'critica',
      title: `Malestar social elevado (${derived.descontentosPct}%)`,
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
      detail: fen.origen ? `Origen estimado: zona ${fen.origen}.` : 'Prepara reservas y cobertura.',
      district: fen.origen ? ZONE_TO_DISTRICT[fen.origen] : 'all',
    });
  }
  for (const fen of activeFenomenos) {
    const ev = state.eventos.find((e) => e.tipo === 'fenomeno_inicio' && e.fenomenoId === fen.id);
    activeAlerts.push({
      id: `al_act_${fen.id}`,
      severity: fen.tipo === 'plaga_zombie' || fen.tipo === 'pandemia' ? 'critica' : 'aviso',
      title: `Activo: ${fen.nombre} (${Math.round(fen.intensidad)}%)`,
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
      title: `Ataque en zona ${ev.zona} (${npc?.nombre || 'vecino'})`,
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

  return (
    <div className="pointer-events-none fixed top-14 left-3 md:left-[260px]" style={{ zIndex }}>
      <RctWindow
        title="Ciudad, Alertas y Zonas"
        subtitle={`${activeAlerts.length} alerta(s) · ${derived.poblacion} vivos · Caos ${state.caosTracker.accionesEnVentana}/${state.config.caos.maxAccionesPorPeriodo}`}
        tone="blue"
        icon={<Compass className="w-3.5 h-3.5" />}
        zIndex={zIndex}
        onFocus={onFocus}
        onClose={onClose}
        className="w-[460px] max-w-[calc(100vw-24px)]"
      >
        <div className="p-3.5 max-h-[calc(100vh-115px)] overflow-y-auto space-y-3">
          <div className="grid grid-cols-3 gap-1 bg-slate-800/70 p-1 rounded border border-slate-700/80 text-xs">
            {(
              [
                { id: 'alertas', label: `Alertas y Zonas (${activeAlerts.length})` },
                { id: 'vecinos', label: `Vecinos (${derived.poblacion})` },
                { id: 'bitacora', label: 'Objetivo y Bitácora' },
              ] as Array<{ id: CityTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCityTab(t.id)}
                className={`py-1 px-1.5 rounded-sm font-semibold transition-colors truncate ${
                  cityTab === t.id ? 'bg-sky-700 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {cityTab === 'alertas' && (
            <div className="space-y-3">
              {activeAlerts.length === 0 ? (
                <div className="py-4 text-xs text-slate-400 text-center bg-slate-800/30 rounded border border-slate-800">
                  Sin alertas críticas ni avisos climáticos activos hoy.
                </div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {activeAlerts.map((al) => (
                    <div
                      key={al.id}
                      className={`rounded-md p-2.5 border text-xs space-y-1 ${
                        al.severity === 'critica'
                          ? 'bg-rose-950/35 border-rose-700/60'
                          : 'bg-amber-950/30 border-amber-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              al.severity === 'critica' ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          />
                          <span>{al.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {al.district && (
                            <button
                              type="button"
                              onClick={() => onJumpDistrict(al.district!)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-sm"
                            >
                              Ir
                            </button>
                          )}
                          {al.causalRef && (
                            <button
                              type="button"
                              onClick={() => onInspectCausal(al.title, al.causalRef, al.detail)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded-sm"
                            >
                              ¿Por qué?
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300">{al.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {(activeFenomenos.length > 0 || announcedFenomenos.length > 0) && (
                <div className="bg-slate-800/45 border border-slate-800 rounded p-2.5 space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                    <CloudRain className="w-3.5 h-3.5" />
                    Clima y amenazas
                  </div>
                  {activeFenomenos.map((f) => (
                    <div key={f.id} className="text-slate-200">
                      • <strong>{f.nombre}</strong> ({Math.round(f.intensidad)}%)
                      {f.origen ? ` · origen zona ${f.origen}` : ''}
                    </div>
                  ))}
                  {announcedFenomenos.map((f) => (
                    <div key={f.id} className="text-slate-400">
                      • Aviso: {f.nombre} en {Math.max(1, f.inicioDia - state.reloj.dia)}d
                      {f.origen ? ` (zona ${f.origen})` : ''}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-300">Estado por zona (clic para enfocar)</div>
                <div className="space-y-1 font-mono text-[11px] tabular-nums">
                  <div className="grid grid-cols-5 text-[10px] text-slate-400 font-sans border-b border-slate-800 pb-1">
                    <span>Zona</span>
                    <span className="text-right">Defensa</span>
                    <span className="text-right">Orden</span>
                    <span className="text-right">Integridad</span>
                    <span className="text-right">Amenaza</span>
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
                        className="w-full grid grid-cols-5 items-center py-1 px-1 rounded hover:bg-slate-800/70 text-left"
                      >
                        <span className="font-sans capitalize text-slate-200">{z}</span>
                        <span className={`text-right ${def < 35 ? 'text-rose-400 font-semibold' : 'text-teal-300'}`}>
                          {def}%
                        </span>
                        <span className={`text-right ${ord < 35 ? 'text-amber-400 font-semibold' : 'text-sky-300'}`}>
                          {ord}%
                        </span>
                        <span className={`text-right ${integ < 60 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}`}>
                          {integ}%
                        </span>
                        <span className={`text-right ${amen >= 50 ? 'text-rose-400 font-semibold' : 'text-slate-300'}`}>
                          {amen}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {cityTab === 'vecinos' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-200">Buscar vecino</span>
                <div className="relative flex-1 max-w-[240px]">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                  <input
                    type="text"
                    value={npcQuery}
                    onChange={(e) => setNpcQuery(e.target.value)}
                    placeholder="Nombre, rol o zona…"
                    className="w-full bg-slate-800 border border-slate-700 rounded pl-6 pr-2 py-1 text-[11px] text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="max-h-[190px] overflow-y-auto divide-y divide-slate-800/80 bg-slate-800/35 border border-slate-800 rounded-md">
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
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-slate-800 text-[11px]"
                    >
                      <span className="truncate text-slate-100">
                        <strong>{n.nombre}</strong>{' '}
                        <span className="text-slate-400">
                          ({ROLE_CATALOG[n.rol].nombre} · {z})
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0 ml-2">
                        S:{Math.round(n.variables.salud)} H:{Math.round(n.variables.hambre)}
                      </span>
                    </button>
                  ));
                })()}
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-300">
                  Profesiones (clic para seguir un vecino)
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(ROLE_CATALOG) as RoleId[]).map((rId) => {
                    const def = ROLE_CATALOG[rId];
                    const count = derived.roles[rId];
                    return (
                      <button
                        key={rId}
                        type="button"
                        disabled={count === 0}
                        onClick={() => onSelectRoleSample(rId)}
                        className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-800 disabled:opacity-35 text-left border border-slate-800 text-[11px]"
                      >
                        <span className="flex items-center gap-2 truncate text-slate-200">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: def.color }} />
                          <span className="truncate">{def.nombre}</span>
                        </span>
                        <span className="font-mono text-slate-400 tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {cityTab === 'bitacora' && (
            <div className="space-y-3">
              <div className="bg-slate-800/45 border border-slate-800 rounded-md p-2.5 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{preset.nombre}</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    <span
                      className={
                        estadoObjetivo === 'Cumplido'
                          ? 'text-emerald-400 font-semibold'
                          : estadoObjetivo === 'Perdido'
                          ? 'text-rose-400 font-semibold'
                          : 'text-amber-300 font-semibold'
                      }
                    >
                      {estadoObjetivo}
                    </span>
                    <span className="text-slate-400 ml-2">
                      D{state.reloj.dia}/{preset.victoria.plazoDia ?? 365}
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">{preset.victoria.descripcion}</p>
                <p className="text-[11px] text-rose-300/90">Derrota: {preset.derrota.descripcion}</p>
              </div>

              <div className="flex flex-wrap gap-1">
                {(['todas', 'caos', 'condicion', 'economia', 'clima', 'prensa'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLogFilter(c)}
                    className={`px-2 py-0.5 text-[11px] rounded capitalize ${
                      logFilter === c
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {c === 'todas' ? 'Todas' : c === 'condicion' ? 'Condición' : c === 'economia' ? 'Economía' : c}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-slate-800 max-h-[260px] overflow-y-auto pr-1">
                {state.bitacora
                  .filter((e) => logFilter === 'todas' || e.categoria === logFilter)
                  .slice(0, 40)
                  .map((entry) => (
                    <div key={entry.id} className="py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">{entry.titulo}</span>
                        <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0">
                          D{entry.dia}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{entry.detalle}</p>
                      {(entry.simEventId || entry.causa) && (
                        <div className="flex justify-end mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectCausal(
                                entry.titulo,
                                entry.simEventId || entry.causa,
                                entry.detalle
                              )
                            }
                            className="flex items-center gap-1 text-[10px] font-semibold text-teal-400 hover:underline"
                          >
                            <GitBranch className="w-3 h-3" />
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
