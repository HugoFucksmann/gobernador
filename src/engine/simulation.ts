import {
  ACTION_TABLE,
  DISTRICTS,
  ECON_CONSTANTS,
  FISCAL_PERIOD_DAYS,
  LEVER_MAX_CHANGE_PCT,
  PRIVATE_ROLES,
  PUBLIC_ROLES,
  ROLE_CATALOG,
  ROLE_GROUPS,
  SCENARIO_PRESETS,
} from '../data/catalogs';
import {
  ActionDefinition,
  ClimatePhenomenon,
  CommunityDerived,
  EventLogEntry,
  GameState,
  Modifier,
  NewsArticle,
  NewsTone,
  Npc,
  NpcVariable,
  PersonalityTrait,
  PhenomenonType,
  PublicRoleId,
  RoleGroupId,
  RoleId,
  ServiceAreaId,
  SimEvent,
  TaxableGroupId,
  ZoneId,
} from '../types/game';
import { getCityErrandPosition, getDistrictPosition } from './worldGenerator';

export const TICKS_PER_DAY = 120;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getStage(edad: number): 'menor' | 'adulto' | 'jubilado' {
  if (edad < 18) return 'menor';
  if (edad >= 65) return 'jubilado';
  return 'adulto';
}

export function getEffectiveTrait(npc: Npc, trait: PersonalityTrait): number {
  let delta = 0;
  for (const mod of npc.modificadores) {
    if (mod.duracionDias <= 0) continue;
    const val = mod.afecta[trait];
    if (typeof val === 'number') delta += val;
  }
  return clamp(npc.personalidad[trait] + delta, 0, 100);
}

export function getModifierDelta(npc: Npc, key: PersonalityTrait | NpcVariable | 'productividad'): number {
  let delta = 0;
  for (const mod of npc.modificadores) {
    if (mod.duracionDias <= 0) continue;
    const val = mod.afecta[key];
    if (typeof val === 'number') delta += val;
  }
  return delta;
}

export function getActivePhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => dia >= f.inicioDia && dia < f.inicioDia + f.duracionDias
  );
}

export function getAnnouncedPhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter((f) => {
    const aviso = f.avisoDias ?? 0;
    return aviso > 0 && dia >= f.inicioDia - aviso && dia < f.inicioDia;
  });
}

export function getEffectiveZone(npc: Npc, zonesCount: number): ZoneId {
  if (zonesCount <= 1) return 'centro';
  if (npc.hospital.internado) return 'centro';
  if (npc.accionIa?.zonaDestino) return npc.accionIa.zonaDestino;
  return npc.zona || 'centro';
}

const shortestPathCache = new Map<string, ZoneId[]>();

export function shortestZonePath(
  from: ZoneId,
  to: ZoneId,
  zonas: Record<ZoneId, { vecinas: ZoneId[] }>
): ZoneId[] {
  if (from === to) return [from];
  const order = Object.keys(zonas) as ZoneId[];
  const cacheKey = `${from}|${to}|${order.join(',')}`;
  const cached = shortestPathCache.get(cacheKey);
  if (cached) return cached;

  const visited = new Set<ZoneId>([from]);
  const parent: Partial<Record<ZoneId, ZoneId>> = {};
  const queue: ZoneId[] = [from];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const rawNeighbors = zonas[curr]?.vecinas || [];
    const orderedNeighbors = order.filter((z) => rawNeighbors.includes(z));
    for (const next of orderedNeighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent[next] = curr;
      if (next === to) {
        const path: ZoneId[] = [to];
        let step: ZoneId | undefined = to;
        while (step && step !== from) {
          step = parent[step];
          if (step) path.unshift(step);
        }
        shortestPathCache.set(cacheKey, path);
        return path;
      }
      queue.push(next);
    }
  }
  const fallback = [from, to];
  shortestPathCache.set(cacheKey, fallback);
  return fallback;
}

export function emitSimEvent(state: GameState, event: SimEvent): void {
  state.eventosDiaActual.push(event);
  state.eventos.unshift(event);
  if (state.eventos.length > 300) {
    state.eventos.length = 300;
  }
}

export function computeAmenazaPercibida(state: GameState): Record<ZoneId, number> {
  const dia = state.reloj.dia;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  const minHitDay = dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;

  const result: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };

  const trackedPhenomena = state.clima.fenomenos.filter((f) => {
    const aviso = f.avisoDias ?? 0;
    return f.origen && dia >= f.inicioDia - aviso && dia < f.inicioDia + f.duracionDias;
  });

  for (const z of zones) {
    // 1. Best valid notice news score for phenomena originating in z
    let avisoVal = 0;
    const hasPhenomInZone = trackedPhenomena.some((f) => f.origen === z);
    if (hasPhenomInZone) {
      for (const n of state.noticias) {
        if (
          n.esAviso &&
          n.zonaOrigen === z &&
          (n.vigenteHastaDia === undefined || dia < n.vigenteHastaDia)
        ) {
          const medio = state.medios.find((m) => m.id === n.medioId);
          const cred = n.credibilidad ?? medio?.credibilidad ?? 60;
          const score = (n.alcance * cred) / 100;
          if (score > avisoVal) avisoVal = score;
        }
      }
    }

    // 2. Recent hits in last 5 days
    const hits = (state.golpesPorZonaHistorial[z] || []).filter((d) => d > minHitDay && d <= dia).length;
    const golpesVal = Math.min(100, ECON_CONSTANTS.golpeAmenazaPeso * hits);

    result[z] = Number(Math.max(avisoVal, golpesVal).toFixed(1));
  }

  return result;
}

export function computeZoneDefense(state: GameState): Record<ZoneId, number> {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  const nZones = Math.max(1, zones.length);
  const seguridad = state.gobierno.indicadores.seguridad;
  const c = ECON_CONSTANTS.movilidadDefensa;

  const policeCounts: Record<ZoneId, number> = {
    centro: 0,
    norte: 0,
    este: 0,
    sur: 0,
    oeste: 0,
  };
  let totalPolice = 0;
  for (const npc of state.npcs) {
    if (npc.vivo && npc.rol === 'policia' && !npc.hospital.internado) {
      const z = getEffectiveZone(npc, nZones);
      policeCounts[z] = (policeCounts[z] || 0) + 1;
      totalPolice++;
    }
  }

  const def: Record<ZoneId, number> = {
    centro: seguridad,
    norte: seguridad,
    este: seguridad,
    sur: seguridad,
    oeste: seguridad,
  };

  for (const z of zones) {
    const parte = totalPolice > 0 ? policeCounts[z] / totalPolice : 1 / nZones;
    def[z] = Number(clamp(seguridad * (1 - c + c * nZones * parte), 0, 100).toFixed(1));
  }
  return def;
}

export function deriveCommunityStats(state: GameState): CommunityDerived {
  const vivosList = state.npcs.filter((n) => n.vivo);
  const vivos = vivosList.length;
  const bajas = state.npcs.length - vivos;

  const roles: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    desempleado: 0,
    jubilado: 0,
  };

  const defensa = computeZoneDefense(state);
  const amenazaPercibida = computeAmenazaPercibida(state);

  if (vivos === 0) {
    return {
      poblacion: 0,
      vivos: 0,
      bajas,
      satisfaccionMedia: 0,
      apoyoPct: 0,
      descontentosPct: 0,
      hambreCriticaPct: 0,
      sinDineroPct: 0,
      hospitalOcupacionPct: 0,
      camasHospital: 1,
      internados: 0,
      esperandoCama: 0,
      defensa,
      amenazaPercibida,
      productividadTotal: 0,
      roles,
    };
  }

  let sumSat = 0;
  let apoyoCount = 0;
  let descontentosCount = 0;
  let hambreCriticaCount = 0;
  let sinDineroCount = 0;
  let prodTotal = 0;
  let medicosActivos = 0;
  let internados = 0;
  let esperandoCama = 0;

  for (const npc of vivosList) {
    roles[npc.rol]++;
    sumSat += npc.variables.satisfaccion;
    if (npc.variables.lealtad >= 50) apoyoCount++;
    if (npc.variables.satisfaccion < 30) descontentosCount++;
    if (npc.variables.hambre > 80) hambreCriticaCount++;
    if (npc.hospital.internado) internados++;
    else if (npc.hospital.esperandoCama) esperandoCama++;
    if (npc.rol === 'medico' && !npc.hospital.internado && !npc.accionIa?.reemplazaTrabajo) {
      medicosActivos++;
    }
    if (state.config.economiaModulo === 'simple') {
      if ((state.ultimaSalidaEconomica.accesoComida[npc.id] ?? 1) < 0.7) sinDineroCount++;
    } else if (npc.economia.dinero < state.alimento.precio) {
      sinDineroCount++;
    }
    prodTotal += getNpcProductivity(npc, state) * 100;
  }

  const camasHospital = Math.max(1, medicosActivos * ECON_CONSTANTS.pacientesPorMedico);
  const hospitalOcupacionPct = Number((((internados + esperandoCama) / camasHospital) * 100).toFixed(1));

  return {
    poblacion: vivos,
    vivos,
    bajas,
    satisfaccionMedia: Number((sumSat / vivos).toFixed(1)),
    apoyoPct: Number(((apoyoCount / vivos) * 100).toFixed(1)),
    descontentosPct: Number(((descontentosCount / vivos) * 100).toFixed(1)),
    hambreCriticaPct: Number(((hambreCriticaCount / vivos) * 100).toFixed(1)),
    sinDineroPct: Number(((sinDineroCount / vivos) * 100).toFixed(1)),
    hospitalOcupacionPct,
    camasHospital,
    internados,
    esperandoCama,
    defensa,
    amenazaPercibida,
    productividadTotal: Math.round(prodTotal),
    roles,
  };
}

export function getTaxRateForNpc(npc: Npc, state: GameState): number {
  const def = ROLE_CATALOG[npc.rol];
  if (def.grupo === 'sin_ingreso') return 0;
  if (state.config.economiaModulo === 'simple') {
    return state.gobierno.palancasVigentes.recaudacion.impuestoUnico;
  }
  return state.gobierno.palancasVigentes.recaudacion.impuestoGrupo[def.grupo as TaxableGroupId];
}

export function getNpcProductivity(npc: Npc, state: GameState): number {
  if (!npc.vivo) return 0;
  if (npc.hospital.internado) return 0;
  if (npc.accionIa?.reemplazaTrabajo) return 0;

  const lab = getEffectiveTrait(npc, 'laboriosidad') / 100;
  const salud = npc.variables.salud / 100;
  const sat = npc.variables.satisfaccion / 100;

  const infraFactor = 0.85 + 0.3 * (state.gobierno.indicadores.infraestructura / 100);
  const taxRate = getTaxRateForNpc(npc, state);
  const fiscalFactor =
    taxRate <= ECON_CONSTANTS.fiscalUmbral
      ? 1
      : Math.max(0.5, 1 - ECON_CONSTANTS.fiscalPendiente * (taxRate - ECON_CONSTANTS.fiscalUmbral));

  const modProd = getModifierDelta(npc, 'productividad') / 100;
  const impagoPenalty =
    ROLE_CATALOG[npc.rol].publico && state.gobierno.finanzas.impago ? 0.65 : 1;

  const raw =
    (0.35 + 0.65 * lab) *
    (0.45 + 0.55 * salud) *
    (0.55 + 0.45 * sat) *
    infraFactor *
    fiscalFactor *
    impagoPenalty +
    modProd;

  return clamp(raw, 0, 1.35);
}

function stepLever(current: number, target: number, min: number, max: number): number {
  const maxDelta = ((max - min) * LEVER_MAX_CHANGE_PCT) / 100;
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return Number((current + Math.sign(diff) * maxDelta).toFixed(2));
}

function applyLeverInertia(state: GameState): void {
  const cur = state.gobierno.palancasVigentes;
  const tgt = state.gobierno.palancasObjetivo;

  cur.recaudacion.impuestoUnico = stepLever(cur.recaudacion.impuestoUnico, tgt.recaudacion.impuestoUnico, 0, 60);
  (['agro', 'industria', 'comercio', 'publico'] as TaxableGroupId[]).forEach((g) => {
    cur.recaudacion.impuestoGrupo[g] = stepLever(cur.recaudacion.impuestoGrupo[g], tgt.recaudacion.impuestoGrupo[g], 0, 60);
  });

  cur.gasto.salarioPublico = stepLever(cur.gasto.salarioPublico, tgt.gasto.salarioPublico, 50, 150);
  (['salud', 'seguridad', 'infraestructura', 'educacion'] as ServiceAreaId[]).forEach((area) => {
    cur.gasto.presupuesto[area] = stepLever(cur.gasto.presupuesto[area], tgt.gasto.presupuesto[area], 0, 100);
  });
  cur.gasto.prensa = stepLever(cur.gasto.prensa, tgt.gasto.prensa, 0, 100);
  (['agro', 'industria', 'comercio', 'publico', 'sin_ingreso'] as RoleGroupId[]).forEach((g) => {
    cur.gasto.subsidios[g] = stepLever(cur.gasto.subsidios[g], tgt.gasto.subsidios[g], 0, 100);
  });

  // Normalize budget + subsidies + press <= 100 if inertia created slight overshoot
  const sumPct =
    Object.values(cur.gasto.presupuesto).reduce((a, b) => a + b, 0) +
    cur.gasto.prensa +
    Object.values(cur.gasto.subsidios).reduce((a, b) => a + b, 0);
  if (sumPct > 100) {
    const scale = 100 / sumPct;
    (['salud', 'seguridad', 'infraestructura', 'educacion'] as ServiceAreaId[]).forEach((a) => {
      cur.gasto.presupuesto[a] = Math.floor(cur.gasto.presupuesto[a] * scale);
    });
    cur.gasto.prensa = Math.floor(cur.gasto.prensa * scale);
    (['agro', 'industria', 'comercio', 'publico', 'sin_ingreso'] as RoleGroupId[]).forEach((g) => {
      cur.gasto.subsidios[g] = Math.floor(cur.gasto.subsidios[g] * scale);
    });
  }

  cur.alimento.racion = stepLever(cur.alimento.racion, tgt.alimento.racion, 50, 150);
  cur.alimento.garantiaAlimentaria = stepLever(cur.alimento.garantiaAlimentaria, tgt.alimento.garantiaAlimentaria, 0, 100);
  cur.alimento.intercambio = stepLever(cur.alimento.intercambio, tgt.alimento.intercambio, -100, 100);
  cur.finanzas.topeEmision = stepLever(cur.finanzas.topeEmision, tgt.finanzas.topeEmision, 0, 30);

  PUBLIC_ROLES.forEach((r) => {
    cur.cupos[r] = Math.round(stepLever(cur.cupos[r], tgt.cupos[r], 0, 30));
  });

  state.medios.forEach((m) => {
    const tMedia = state.gobierno.prensaObjetivo[m.id];
    if (tMedia) {
      m.intervencion.financiamiento = stepLever(m.intervencion.financiamiento, tMedia.financiamiento, 0, 100);
      m.intervencion.regulacion = stepLever(m.intervencion.regulacion, tMedia.regulacion, 0, 100);
    }
  });
}

function addLog(
  state: GameState,
  categoria: EventLogEntry['categoria'],
  origen: string,
  titulo: string,
  detalle: string
): void {
  state.bitacora.unshift({
    id: `log_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
    dia: state.reloj.dia,
    categoria,
    origen,
    titulo,
    detalle,
  });
  if (state.bitacora.length > 160) {
    state.bitacora.length = 160;
  }
}

export function applyModifierToNpc(npc: Npc, mod: Omit<Modifier, 'id' | 'diasRestantes'>): void {
  npc.modificadores.push({
    ...mod,
    id: `mod_${Math.random().toString(36).slice(2, 8)}`,
    diasRestantes: mod.duracionDias,
  });
  // Direct variable shifts applied immediately for hunger/health/etc. while trait modifiers act dynamically
  const varKeys: NpcVariable[] = ['salud', 'hambre', 'miedo', 'satisfaccion', 'lealtad'];
  for (const key of varKeys) {
    const val = mod.afecta[key];
    if (typeof val === 'number') {
      npc.variables[key] = clamp(npc.variables[key] + val * 0.6, 0, 100);
    }
  }
}

export function applyInstantModifierToNpc(
  npc: Npc,
  mod: {
    afecta: Partial<Record<NpcVariable, number>>;
    origen: string;
    texto: string;
    recordOnNpc?: boolean;
  }
): void {
  const varKeys: NpcVariable[] = ['salud', 'hambre', 'miedo', 'satisfaccion', 'lealtad'];
  for (const key of varKeys) {
    const val = mod.afecta[key];
    if (typeof val === 'number') {
      npc.variables[key] = clamp(npc.variables[key] + val, 0, 100);
    }
  }
  if (mod.recordOnNpc) {
    npc.modificadores.push({
      id: `imod_${Math.random().toString(36).slice(2, 8)}`,
      afecta: mod.afecta,
      duracionDias: 0,
      diasRestantes: 0,
      origen: mod.origen,
      texto: mod.texto,
    });
  }
}

export function applyActionToNpc(
  state: GameState,
  npc: Npc,
  action: ActionDefinition,
  texto: string,
  fuente: 'ia' | 'respaldo'
): void {
  const [minD, maxD] = action.duracionDias;
  const maxAllowed = action.tipo === 'espontanea' ? state.config.caos.duracionMaxDias : maxD;
  const duracion = clamp(
    Math.round(minD + Math.random() * (maxD - minD)),
    1,
    maxAllowed
  );
  const origen = `accion:${action.id}/${fuente}`;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;
  const zonaDestino = zonesCount > 1 ? action.efecto.zonaDestino : undefined;

  npc.accionIa = {
    id: action.id,
    nombre: action.nombre,
    tipo: action.tipo,
    reemplazaTrabajo: action.efecto.reemplazaTrabajo,
    zonaDestino,
    diasRestantes: duracion,
    duracionTotal: duracion,
    origen,
    texto,
  };

  emitSimEvent(state, {
    id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
    dia: state.reloj.dia,
    tipo: 'accion_inicio',
    zona: getEffectiveZone(npc, zonesCount),
    accion: action.id,
    npcIds: [npc.id],
    zonaDestino: zonaDestino ?? npc.zona,
    causa: origen,
  });

  // Redirect NPC toward plaza/civic center if protest/strike/preach
  if (['protesta', 'huelga', 'predicar', 'saqueo'].includes(action.id)) {
    const plaza = DISTRICTS.find((d) => d.id === (action.id === 'huelga' ? 'civico' : 'mercado'))!;
    npc.mapa.destino = {
      x: plaza.x + 30 + Math.random() * (plaza.w - 60),
      y: plaza.y + 45 + Math.random() * (plaza.h - 70),
    };
  }
  npc.mapa.accion = action.nombre.toLowerCase();

  if (action.efecto.variables) {
    applyModifierToNpc(npc, {
      afecta: action.efecto.variables,
      duracionDias: duracion,
      origen,
      texto,
    });
  }

  // Optional social rumor affecting nearby / same-zone subset of community
  if (action.efecto.rumorSocial) {
    const rumor = action.efecto.rumorSocial;
    const npcEffZone = getEffectiveZone(npc, zonesCount);
    const vivos = state.npcs.filter((n) => n.vivo && n.id !== npc.id && !n.hospital.internado);
    const affectedCount = Math.max(1, Math.round(vivos.length * rumor.radioPct));
    const prioritized = [...vivos].sort((a, b) => {
      const sameA = getEffectiveZone(a, zonesCount) === npcEffZone ? 0 : 1;
      const sameB = getEffectiveZone(b, zonesCount) === npcEffZone ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      const distA = Math.hypot(a.mapa.x - npc.mapa.x, a.mapa.y - npc.mapa.y);
      const distB = Math.hypot(b.mapa.x - npc.mapa.x, b.mapa.y - npc.mapa.y);
      return distA - distB;
    });
    for (let i = 0; i < Math.min(affectedCount, prioritized.length); i++) {
      applyModifierToNpc(prioritized[i], {
        afecta: rumor.afecta,
        duracionDias: rumor.duracionDias,
        origen: `rumor:${action.id}/${npc.id}`,
        texto: rumor.texto,
      });
    }
  }

  // Contagion to 1 eligible NPC in the same effective zone (ESTADOS §7)
  if (action.contagio > 0 && Math.random() < action.contagio) {
    const npcEffZone = getEffectiveZone(npc, zonesCount);
    const nearby = state.npcs.find(
      (other) =>
        other.vivo &&
        !other.hospital.internado &&
        other.id !== npc.id &&
        !other.accionIa &&
        isNpcEligibleForAction(other, action) &&
        getEffectiveZone(other, zonesCount) === npcEffZone
    );
    if (nearby) {
      const copyText = action.textoBase.replace('{nombre}', nearby.nombre);
      nearby.accionIa = {
        id: action.id,
        nombre: action.nombre,
        tipo: action.tipo,
        reemplazaTrabajo: action.efecto.reemplazaTrabajo,
        zonaDestino,
        diasRestantes: Math.max(1, duracion - 1),
        duracionTotal: duracion,
        origen: `contagio:${action.id}/${npc.id}`,
        texto: copyText,
      };
      nearby.mapa.accion = action.nombre.toLowerCase();
      emitSimEvent(state, {
        id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
        dia: state.reloj.dia,
        tipo: 'accion_inicio',
        zona: getEffectiveZone(nearby, zonesCount),
        accion: action.id,
        npcIds: [nearby.id],
        zonaDestino: zonaDestino ?? nearby.zona,
        causa: `contagio:${action.id}/${npc.id}`,
      });
    }
  }
}

export function isNpcEligibleForAction(npc: Npc, action: ActionDefinition): boolean {
  if (!npc.vivo || npc.hospital.internado) return false;
  const stage = getStage(npc.edad);
  if (action.requisitos.etapa && stage !== action.requisitos.etapa) return false;
  if (action.requisitos.publico && !ROLE_CATALOG[npc.rol].publico) return false;
  if (action.requisitos.rolNoEn && action.requisitos.rolNoEn.includes(npc.rol)) return false;
  return true;
}

export function scoreActionAffinity(npc: Npc, action: ActionDefinition): number {
  let score = 50;
  for (const [trait, dir] of Object.entries(action.afinidad)) {
    const val = getEffectiveTrait(npc, trait as PersonalityTrait);
    score += dir === '+' ? val * 0.5 : (100 - val) * 0.5;
  }
  return Math.max(5, score);
}

export function selectCandidateActions(npc: Npc): ActionDefinition[] {
  const valid = ACTION_TABLE.filter((a) => a.tipo === 'espontanea' && isNpcEligibleForAction(npc, a));
  return valid
    .map((a) => ({ a, w: scoreActionAffinity(npc, a) + Math.random() * 25 }))
    .sort((x, y) => y.w - x.w)
    .slice(0, 8)
    .map((x) => x.a);
}

export function canTriggerSpontaneousChaos(state: GameState): {
  allowed: boolean;
  reason?: string;
} {
  const derived = deriveCommunityStats(state);
  const limits = state.config.caos;
  if (derived.satisfaccionMedia < limits.respiroSiSatisfaccionMediaMenorA) {
    return { allowed: false, reason: 'respiro' };
  }
  if (state.caosTracker.accionesEnVentana >= limits.maxAccionesPorPeriodo) {
    return { allowed: false, reason: 'tope_periodo' };
  }
  return { allowed: true };
}

export function pickChaosCandidateNpc(state: GameState): Npc | null {
  const limits = state.config.caos;
  const vivos = state.npcs.filter(
    (n) => n.vivo && !n.hospital.internado && !n.accionIa && getStage(n.edad) === 'adulto'
  );
  if (vivos.length === 0) return null;

  // Check role out-of-post cap
  const roleCounts: Record<string, number> = {};
  const roleOutCounts: Record<string, number> = {};
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    roleCounts[n.rol] = (roleCounts[n.rol] || 0) + 1;
    if (n.accionIa?.reemplazaTrabajo) {
      roleOutCounts[n.rol] = (roleOutCounts[n.rol] || 0) + 1;
    }
  }

  const eligible = vivos.filter((n) => {
    const total = roleCounts[n.rol] || 1;
    const out = roleOutCounts[n.rol] || 0;
    return ((out + 1) / total) * 100 <= limits.maxPctRolFueraDePuesto || out === 0;
  });
  if (eligible.length === 0) return null;

  // Interest score: extreme traits, low satisfaction, recent modifiers
  const scored = eligible.map((n) => {
    const interest =
      getEffectiveTrait(n, 'rebeldia') * 0.6 +
      (100 - n.variables.satisfaccion) * 0.4 +
      n.modificadores.length * 12 +
      Math.random() * 35;
    return { n, interest };
  });
  scored.sort((a, b) => b.interest - a.interest);
  const topPool = scored.slice(0, Math.min(6, scored.length));
  return topPool[Math.floor(Math.random() * topPool.length)].n;
}

export function resolveConditionWindowWithFallback(
  state: GameState,
  windowId: string,
  chosenActionId?: string,
  chosenText?: string,
  fuente: 'ia' | 'respaldo' = 'respaldo'
): void {
  const win = state.ventanasCondicion.find((w) => w.id === windowId);
  if (!win || win.estado === 'resuelta') return;

  const action =
    win.candidatas.find((c) => c.id === chosenActionId) ||
    win.candidatas[0] ||
    ACTION_TABLE.find((a) => a.tipo === 'condicion')!;

  const targets = state.npcs.filter((n) => n.vivo && !n.hospital.internado && win.npcIds.includes(n.id));
  for (const npc of targets) {
    const text = chosenText
      ? chosenText.replace('{nombre}', npc.nombre)
      : action.textoBase.replace('{nombre}', npc.nombre);
    applyActionToNpc(state, npc, action, text, fuente);
  }

  win.estado = 'resuelta';
  addLog(
    state,
    'condicion',
    `accion:${action.id}/${fuente}`,
    `${action.nombre} (${targets.length} habitantes)`,
    chosenText || `Desencadenado por ${win.disparador}. Resuelto por ${fuente === 'ia' ? 'Director de IA' : 'motor de respaldo'}.`
  );
}

export function applyPressArticleEffects(state: GameState, article: NewsArticle): void {
  const medio = state.medios.find((m) => m.id === article.medioId);
  if (!medio) return;

  const enrichedArticle: NewsArticle = {
    ...article,
    credibilidad: article.credibilidad ?? medio.credibilidad,
  };

  // Anti-loop: repeated topic reduces impact
  const recentSameTopic = state.noticias.filter(
    (n) => n.tema === enrichedArticle.tema && state.reloj.dia - n.dia <= 10
  ).length;
  const repetitionDamp = Math.max(0.3, 1 - recentSameTopic * 0.25);
  const impactScale = (medio.alcancePct / 100) * (medio.credibilidad / 100) * repetitionDamp;

  const vivos = state.npcs.filter((n) => n.vivo);
  const consumersCount = Math.max(1, Math.round(vivos.length * (medio.alcancePct / 100)));

  // NPCs consume based on personality/loyalty affinity with outlet
  const sortedConsumers = [...vivos]
    .map((n) => {
      const affinityDiff = Math.abs(n.variables.lealtad - medio.lineaEditorial.afinidadGobierno);
      const sensMatch = medio.lineaEditorial.sensacionalismo * 0.2;
      return { n, score: 100 - affinityDiff + sensMatch + Math.random() * 25 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, consumersCount)
    .map((x) => x.n);

  const afecta: Partial<Record<PersonalityTrait | NpcVariable, number>> = {};
  if (enrichedArticle.tono === 'alarmista') {
    afecta.miedo = Math.round(10 * impactScale);
    afecta.lealtad = -Math.round(5 * impactScale);
  } else if (enrichedArticle.tono === 'critico') {
    afecta.lealtad = -Math.round(9 * impactScale);
    afecta.rebeldia = Math.round(6 * impactScale);
  } else if (enrichedArticle.tono === 'favorable') {
    afecta.lealtad = Math.round(8 * impactScale);
    afecta.miedo = -Math.round(4 * impactScale);
  } else {
    afecta.miedo = Math.round(2 * impactScale);
  }

  for (const npc of sortedConsumers) {
    applyModifierToNpc(npc, {
      afecta,
      duracionDias: 4,
      origen: `noticia:${enrichedArticle.id}`,
      texto: `Leyó "${enrichedArticle.titulo}" en ${medio.nombre}`,
    });
  }

  state.noticias.unshift(enrichedArticle);
  if (state.noticias.length > 50) state.noticias.length = 50;
}

function stepNpcPositions(state: GameState, dtTicks: number): void {
  const baseSpeed = ((5.6 * 10) / TICKS_PER_DAY) * dtTicks;
  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    const isUrgent = Boolean(
      npc.accionIa && ['protesta', 'huelga', 'saqueo'].includes(npc.accionIa.id)
    );
    const speed = isUrgent ? baseSpeed * 1.35 : npc.rol === 'policia' ? baseSpeed * 1.25 : baseSpeed;
    const dx = npc.mapa.destino.x - npc.mapa.x;
    const dy = npc.mapa.destino.y - npc.mapa.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= speed + 1.5) {
      npc.mapa.x = npc.mapa.destino.x;
      npc.mapa.y = npc.mapa.destino.y;
      if (Math.random() < 0.42) {
        if (npc.accionIa && ['protesta', 'huelga', 'predicar', 'saqueo'].includes(npc.accionIa.id)) {
          const zoneId = npc.accionIa.id === 'huelga' ? 'civico' : 'mercado';
          const zone = DISTRICTS.find((d) => d.id === zoneId)!;
          npc.mapa.destino = {
            x: zone.x + 40 + Math.random() * (zone.w - 80),
            y: zone.y + 60 + Math.random() * (zone.h - 90),
          };
        } else if (npc.accionIa?.id === 'organizar_fiesta') {
          const zone = DISTRICTS.find((d) => d.id === 'residencial')!;
          npc.mapa.destino = {
            x: zone.x + 50 + Math.random() * (zone.w - 100),
            y: zone.y + 240 + Math.random() * (zone.h - 280),
          };
        } else if (npc.variables.hambre > 75 && Math.random() < 0.65) {
          const market = DISTRICTS.find((d) => d.id === 'mercado')!;
          npc.mapa.destino = {
            x: market.x + 42 + Math.random() * (market.w - 84),
            y: market.y + 66 + Math.random() * (market.h - 94),
          };
          if (!npc.accionIa) npc.mapa.accion = 'buscando alimento';
        } else {
          const nextSpot = getCityErrandPosition(npc.rol);
          npc.mapa.destino = { x: nextSpot.x, y: nextSpot.y };
          if (!npc.accionIa) {
            npc.mapa.accion = nextSpot.accion;
          }
        }
      }
    } else {
      let moveX = dx / dist;
      let moveY = dy / dist;
      if (dist > 140) {
        const nearAvenueX = Math.abs(npc.mapa.x - 355) < 16 || Math.abs(npc.mapa.x - 665) < 16;
        const nearAvenueY = Math.abs(npc.mapa.y - 295) < 16;
        if (!nearAvenueX && !nearAvenueY) {
          if (Math.abs(dx) > Math.abs(dy)) {
            moveY *= 1.18;
          } else {
            moveX *= 1.18;
          }
          const norm = Math.hypot(moveX, moveY) || 1;
          moveX /= norm;
          moveY /= norm;
        }
      }
      npc.mapa.x += moveX * speed;
      npc.mapa.y += moveY * speed;
    }
  }
}

function updateServiceCoverage(state: GameState): void {
  const vivos = Math.max(1, state.npcs.filter((n) => n.vivo).length);
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const getTargetCov = (role: PublicRoleId | 'comercio'): number =>
    preset.objetivoCobertura?.[role] ?? ECON_CONSTANTS.objetivoCobertura[role];

  const counts: Record<PublicRoleId | 'comerciante', number> = {
    policia: 0,
    estatal: 0,
    docente: 0,
    medico: 0,
    ingeniero: 0,
    comerciante: 0,
  };
  for (const n of state.npcs) {
    if (!n.vivo || n.hospital.internado) continue;
    if (n.rol in counts && !n.accionIa?.reemplazaTrabajo) {
      counts[n.rol as keyof typeof counts]++;
    }
  }
  state.gobierno.coberturas = {
    policia: clamp(counts.policia / Math.max(1, vivos * getTargetCov('policia')), 0, 1),
    estatal: clamp(counts.estatal / Math.max(1, vivos * getTargetCov('estatal')), 0, 1),
    docente: clamp(counts.docente / Math.max(1, vivos * getTargetCov('docente')), 0, 1),
    medico: clamp(counts.medico / Math.max(1, vivos * getTargetCov('medico')), 0, 1),
    ingeniero: clamp(counts.ingeniero / Math.max(1, vivos * getTargetCov('ingeniero')), 0, 1),
    comercio: clamp(counts.comerciante / Math.max(1, vivos * getTargetCov('comercio')), 0, 1),
  };
}

function handleRolesAndAging(state: GameState): void {
  const isNewYear = state.reloj.dia % 365 === 0;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const popScale = Math.max(0.6, state.npcs.filter((n) => n.vivo).length / 100);

  const counts: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    desempleado: 0,
    jubilado: 0,
  };
  for (const n of state.npcs) {
    if (n.vivo) counts[n.rol]++;
  }

  // Obrero effective cap: min(tope_privado[obrero], comerciantes * empleados_por_comerciante)
  const privateMaxObrero = Math.round(preset.topesPrivados.obrero * popScale);
  const effectiveObreroCap = Math.min(privateMaxObrero, counts.comerciante * ECON_CONSTANTS.empleadosPorComerciante);

  // If merchants dropped, excess obreros become desempleado
  if (counts.obrero > effectiveObreroCap) {
    let toLayOff = counts.obrero - effectiveObreroCap;
    for (const n of state.npcs) {
      if (toLayOff <= 0) break;
      if (n.vivo && n.rol === 'obrero') {
        n.rol = 'desempleado';
        counts.obrero--;
        counts.desempleado++;
        toLayOff--;
      }
    }
  }

  // If public cupos were lowered below current headcount, excess become desempleado
  for (const pRole of PUBLIC_ROLES) {
    const cap = state.gobierno.palancasVigentes.cupos[pRole];
    if (counts[pRole] > cap) {
      let toLayOff = counts[pRole] - cap;
      for (const n of state.npcs) {
        if (toLayOff <= 0) break;
        if (n.vivo && n.rol === pRole) {
          n.rol = 'desempleado';
          counts[pRole]--;
          counts.desempleado++;
          toLayOff--;
        }
      }
    }
  }

  const educSpeed = 0.7 + (state.gobierno.indicadores.educacion / 100) * 1.1;

  for (const npc of state.npcs) {
    if (!npc.vivo) continue;

    if (isNewYear) {
      npc.edad += 1;
      if (npc.edad >= 65 && npc.rol !== 'jubilado') {
        counts[npc.rol]--;
        npc.rol = 'jubilado';
        counts.jubilado++;
        npc.mapa.accion = 'jubilado';
      } else if (npc.edad === 18 && npc.rol === 'estudiante') {
        counts.estudiante--;
        npc.rol = 'desempleado';
        counts.desempleado++;
      }
    }

    if (npc.rol === 'estudiante' && npc.educacion.nivel < 3) {
      npc.educacion.progreso += educSpeed;
      if (npc.educacion.progreso >= 100) {
        npc.educacion.progreso = 0;
        npc.educacion.nivel = Math.min(3, npc.educacion.nivel + 1);
      }
    }

    // Periodically unemployed adults (or students > 18) seek open roles by affinity
    if (npc.rol === 'desempleado' && state.reloj.dia % 3 === 0) {
      const candidateRoles: Array<{ rol: RoleId; score: number }> = [];

      for (const pRole of PUBLIC_ROLES) {
        const cap = state.gobierno.palancasVigentes.cupos[pRole];
        const def = ROLE_CATALOG[pRole];
        if (counts[pRole] < cap && npc.educacion.nivel >= def.educMin) {
          const traitVal = def.afinidad ? getEffectiveTrait(npc, def.afinidad) : 50;
          candidateRoles.push({ rol: pRole, score: traitVal + state.gobierno.palancasVigentes.gasto.salarioPublico * 0.25 });
        }
      }

      for (const privRole of PRIVATE_ROLES) {
        const cap =
          privRole === 'obrero'
            ? effectiveObreroCap
            : Math.round(preset.topesPrivados[privRole] * popScale);
        const def = ROLE_CATALOG[privRole];
        if (counts[privRole] < cap && npc.educacion.nivel >= def.educMin) {
          const traitVal = def.afinidad ? getEffectiveTrait(npc, def.afinidad) : 50;
          candidateRoles.push({ rol: privRole, score: traitVal });
        }
      }

      if (candidateRoles.length > 0) {
        candidateRoles.sort((a, b) => b.score - a.score);
        const chosen = candidateRoles[0].rol;
        counts.desempleado--;
        counts[chosen]++;
        npc.rol = chosen;
        const allowedZones = preset.zonaPorRol[chosen] || ['centro'];
        if (!allowedZones.includes(npc.zona)) {
          npc.zona = allowedZones[counts[chosen] % allowedZones.length];
        }
        npc.mapa.destino = getDistrictPosition(chosen);
        npc.mapa.accion = 'trabajando';
      }
    }
  }

  // Adults can also switch into open public cupos by affinity (ESTADOS §2), up to 2 per 3 days, without emptying roles
  if (state.reloj.dia % 3 === 0) {
    let transfersLeft = 2;
    const vacantPublic = PUBLIC_ROLES.filter((pRole) => counts[pRole] < state.gobierno.palancasVigentes.cupos[pRole]);
    for (const pRole of vacantPublic) {
      while (transfersLeft > 0 && counts[pRole] < state.gobierno.palancasVigentes.cupos[pRole]) {
        const def = ROLE_CATALOG[pRole];
        const minKeep = (r: RoleId) => (r === 'agricultor' ? 25 : 2);
        const eligible = state.npcs.filter((n) => {
          if (!n.vivo || n.hospital.internado || n.accionIa) return false;
          if (ROLE_CATALOG[n.rol].publico || n.rol === 'estudiante' || n.rol === 'jubilado' || n.rol === 'desempleado') return false;
          if (counts[n.rol] <= minKeep(n.rol)) return false;
          if (n.rol === 'comerciante' && (counts.comerciante - 1) * ECON_CONSTANTS.empleadosPorComerciante < counts.obrero) return false;
          return n.educacion.nivel >= def.educMin && n.edad >= def.edadMin && (def.edadMax === null || n.edad <= def.edadMax);
        });
        if (eligible.length === 0) break;
        eligible.sort((a, b) => {
          const traitA = def.afinidad ? getEffectiveTrait(a, def.afinidad) : 50;
          const traitB = def.afinidad ? getEffectiveTrait(b, def.afinidad) : 50;
          return traitB - traitA;
        });
        const chosenNpc = eligible[0];
        counts[chosenNpc.rol]--;
        counts[pRole]++;
        chosenNpc.rol = pRole;
        const allowedZones = preset.zonaPorRol[pRole] || ['centro'];
        chosenNpc.zona = allowedZones[counts[pRole] % allowedZones.length];
        chosenNpc.mapa.destino = getDistrictPosition(pRole);
        chosenNpc.mapa.accion = 'trabajando';
        transfersLeft--;
      }
      if (transfersLeft <= 0) break;
    }
  }
}

function killNpc(state: GameState, npc: Npc, causa: string, zonesCount: number): void {
  if (!npc.vivo) return;
  const effZone = getEffectiveZone(npc, zonesCount);
  const wasWaitingBed = npc.hospital.esperandoCama;
  npc.vivo = false;
  npc.hospital.internado = false;
  npc.hospital.esperandoCama = false;
  npc.accionIa = null;
  npc.mapa.accion = 'fallecido';

  for (const medio of state.medios) {
    const idx = medio.columnistas.indexOf(npc.id);
    if (idx !== -1) medio.columnistas.splice(idx, 1);
  }

  emitSimEvent(state, {
    id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
    dia: state.reloj.dia,
    tipo: 'muerte',
    zona: effZone,
    npcId: npc.id,
    causa,
    ...(wasWaitingBed ? { esperandoCama: true } : {}),
  });
}

function runPoliceRelocation(state: GameState): void {
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zones = Object.keys(preset.zonas) as ZoneId[];
  if (zones.length <= 1) return;

  const amenaza = computeAmenazaPercibida(state);
  const totalAmenaza = zones.reduce((acc, z) => acc + amenaza[z], 0);
  if (totalAmenaza > 0) {
    const policias = state.npcs.filter(
      (n) => n.vivo && n.rol === 'policia' && !n.hospital.internado
    );
    if (policias.length > 0) {
      const exactMove = policias.length * (ECON_CONSTANTS.reubicacionPoliciasPct / 100);
      const countToMove =
        Math.floor(exactMove) + (Math.random() < exactMove - Math.floor(exactMove) ? 1 : 0);

      const movedByRoute = new Map<string, string[]>();
      const pool = [...policias];

      for (let i = 0; i < countToMove && pool.length > 0; i++) {
        // Pick target zone proportional to perceived threat
        let r = Math.random() * totalAmenaza;
        let targetZone: ZoneId = zones[0];
        for (const z of zones) {
          r -= amenaza[z];
          if (r <= 0) {
            targetZone = z;
            break;
          }
        }

        // Prefer moving a policeman not already in targetZone
        const candidateIdxs: number[] = [];
        for (let k = 0; k < pool.length; k++) {
          if (pool[k].zona !== targetZone) candidateIdxs.push(k);
        }
        if (candidateIdxs.length === 0) continue;

        const pickIdx = candidateIdxs[Math.floor(Math.random() * candidateIdxs.length)];
        const chosen = pool.splice(pickIdx, 1)[0];
        const deZona = chosen.zona;
        chosen.zona = targetZone;

        const key = `${deZona}->${targetZone}`;
        const list = movedByRoute.get(key) || [];
        list.push(chosen.id);
        movedByRoute.set(key, list);
      }

      for (const [routeKey, npcIds] of movedByRoute.entries()) {
        const [deZona, aZona] = routeKey.split('->') as [ZoneId, ZoneId];
        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'reubicacion',
          zona: aZona,
          npcs: npcIds,
          deZona,
          aZona,
          causa: 'amenaza:reubicacion',
        });
      }
    }
  }

  // Emit daily defensa change events
  const def = computeZoneDefense(state);
  for (const z of zones) {
    if (Math.round(def[z]) !== Math.round(state.ultimaDefensaZona[z])) {
      state.ultimaDefensaZona[z] = def[z];
      emitSimEvent(state, {
        id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
        dia: state.reloj.dia,
        tipo: 'defensa',
        zona: z,
        valor: def[z],
        causa: 'seguridad:zona',
      });
    }
  }
}

function runDailyEconomyAndNeeds(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  const mod = state.config.economiaModulo;
  const pal = state.gobierno.palancasVigentes;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;
  const activePhenomena = getActivePhenomena(state);

  // Climate modifiers (active phenomena only)
  let agroClimaFactor = 1;
  let climaPrecioFactor = 1;

  for (const fen of activePhenomena) {
    const k = fen.intensidad / 100;
    if (fen.tipo === 'sequia') {
      agroClimaFactor *= 1 - ECON_CONSTANTS.coefSequiaProduccion * k;
      climaPrecioFactor *= 1 + ECON_CONSTANTS.coefSequiaPrecio * k;
    } else if (fen.tipo === 'plaga') {
      agroClimaFactor *= 1 - ECON_CONSTANTS.coefPlagaProduccion * k;
      climaPrecioFactor *= 1 + ECON_CONSTANTS.coefPlagaPrecio * k;
    }
  }

  // 1. Food production
  let produccionAlimento = 0;
  for (const npc of vivos) {
    if (npc.rol === 'agricultor') {
      const prod = getNpcProductivity(npc, state);
      produccionAlimento += ECON_CONSTANTS.produccionBaseAgricultor * prod * agroClimaFactor;
    }
  }
  state.alimento.stock += produccionAlimento;
  state.alimento.produccionDiaria = Number(produccionAlimento.toFixed(1));

  // 2. External Trade (Intercambio)
  let comprasAlimentoDia = 0;
  let ventasAlimentoDia = 0;
  const tradeLever = pal.alimento.intercambio;
  const maxTradeUnits = pop * 0.4 * state.gobierno.coberturas.comercio;
  const externalPriceBase =
    ECON_CONSTANTS.precioBaseAlimento * (1 + state.gobierno.inflacion / 100) * climaPrecioFactor;

  if (tradeLever > 5 && maxTradeUnits > 0) {
    const units = maxTradeUnits * (tradeLever / 100);
    state.alimento.stock += units;
    comprasAlimentoDia = units * (externalPriceBase * 1.3);
  } else if (tradeLever < -5 && maxTradeUnits > 0 && state.alimento.stock > pop) {
    const units = Math.min(maxTradeUnits * (Math.abs(tradeLever) / 100), state.alimento.stock - pop * 0.5);
    if (units > 0) {
      state.alimento.stock -= units;
      ventasAlimentoDia = units * externalPriceBase;
    }
  }

  // 3. Food Price & Consumption
  const diasStockRaw = state.alimento.stock / Math.max(1, pop);
  state.alimento.diasStock = Number(diasStockRaw.toFixed(1));

  let precioAlimento = ECON_CONSTANTS.precioBaseAlimento;
  if (mod !== 'simple') {
    const escasezFactor =
      diasStockRaw >= 12 ? 1.0 : diasStockRaw >= 5 ? 1 + (12 - diasStockRaw) * 0.12 : 1.84 + (5 - diasStockRaw) * 0.35;
    const inflFactor = mod === 'fiscal' ? 1 + state.gobierno.inflacion / 100 : 1 + preset.inflacionInicial / 100;
    precioAlimento = Number((ECON_CONSTANTS.precioBaseAlimento * escasezFactor * climaPrecioFactor * inflFactor).toFixed(2));
  }
  state.alimento.precio = precioAlimento;

  const accesoComida: Record<string, number> = {};
  const poderAdquisitivo: Record<string, number> = {};
  let garantiaAlimentariaDia = 0;

  if (mod === 'simple') {
    const racionFactor = pal.alimento.racion / 100;
    const demanda = pop * ECON_CONSTANTS.consumoPorNpc * racionFactor;
    state.alimento.consumoDiario = Number(demanda.toFixed(1));
    const ratioStock = demanda > 0 ? Math.min(1, state.alimento.stock / demanda) : 1;
    state.alimento.stock = Math.max(0, state.alimento.stock - Math.min(state.alimento.stock, demanda));

    for (const npc of vivos) {
      accesoComida[npc.id] = clamp(ratioStock * racionFactor, 0, 1.25);
    }
  } else {
    state.alimento.consumoDiario = pop * ECON_CONSTANTS.consumoPorNpc;
    const stockRatio = state.alimento.stock >= state.alimento.consumoDiario ? 1 : state.alimento.stock / Math.max(1, state.alimento.consumoDiario);
    state.alimento.stock = Math.max(0, state.alimento.stock - Math.min(state.alimento.stock, state.alimento.consumoDiario));

    const garantiaPct = pal.alimento.garantiaAlimentaria / 100;
    for (const npc of vivos) {
      const stage = getStage(npc.edad);
      if (stage === 'menor') {
        garantiaAlimentariaDia += precioAlimento;
        accesoComida[npc.id] = stockRatio;
      } else if (npc.economia.dinero >= precioAlimento) {
        npc.economia.dinero -= precioAlimento;
        accesoComida[npc.id] = stockRatio;
      } else {
        const faltante = Math.max(0, precioAlimento - npc.economia.dinero);
        const cubierto = faltante * garantiaPct;
        garantiaAlimentariaDia += cubierto;
        const pagoTotal = npc.economia.dinero + cubierto;
        npc.economia.dinero = 0;
        accesoComida[npc.id] = clamp((pagoTotal / Math.max(0.01, precioAlimento)) * stockRatio, 0, 1);
      }
    }
  }

  // 4. Incomes, Taxes, Payroll, Pensions & Living Expenses
  const salarioPublicoDia = ECON_CONSTANTS.salarioBasePublico * (pal.gasto.salarioPublico / 100);
  const comerciantesCount = Math.max(1, vivos.filter((n) => n.rol === 'comerciante').length);
  const volumenVentasComercio = (mod === 'simple' ? 0 : pop * precioAlimento) + ventasAlimentoDia + comprasAlimentoDia;
  const comisionPorComerciante = (volumenVentasComercio * ECON_CONSTANTS.comisionComercioFactor) / comerciantesCount;

  let impuestosDia = 0;
  let nominaDia = 0;
  let pensionesDia = 0;
  const inflDiaria = mod === 'fiscal' ? state.gobierno.inflacion / 100 / 365 : 0;

  for (const npc of vivos) {
    const def = ROLE_CATALOG[npc.rol];
    const taxRate = getTaxRateForNpc(npc, state);
    let bruto = 0;

    if (def.publico) {
      if (!state.gobierno.finanzas.impago) {
        bruto = salarioPublicoDia;
        nominaDia += bruto;
      }
    } else if (npc.rol === 'jubilado') {
      if (mod !== 'simple') {
        bruto = ECON_CONSTANTS.pensionBase;
        pensionesDia += bruto;
      }
    } else if (def.ingreso && !npc.hospital.internado) {
      const prod = getNpcProductivity(npc, state);
      const [minI, maxI] = def.ingreso;
      bruto = (minI + npc.economia.ingresoPos * (maxI - minI)) * prod;
      if (npc.rol === 'comerciante') {
        bruto += comisionPorComerciante * Math.min(1, prod + 0.2);
      }
    }

    const impuesto = bruto * (taxRate / 100);
    const neto = bruto - impuesto;
    impuestosDia += impuesto;
    npc.economia.ultimoIngresoNeto = Number(neto.toFixed(2));

    if (mod === 'simple') {
      const subPct = pal.gasto.subsidios[def.grupo] || 0;
      const subBonus = Math.sqrt(subPct) * ECON_CONSTANTS.coefSubsidioSimple;
      const codiciaFactor = 0.6 + 0.8 * (getEffectiveTrait(npc, 'codicia') / 100);
      const taxPenalty = taxRate * ECON_CONSTANTS.coefImpuestoSimple * codiciaFactor;
      const empPenalty = npc.rol === 'desempleado' ? 18 : 0;
      poderAdquisitivo[npc.id] = clamp(56 + subBonus - taxPenalty - empPenalty, 0, 100);
    } else {
      const codicia = getEffectiveTrait(npc, 'codicia') / 100;
      const gastoVidaPct = 0.45 - 0.15 * codicia;
      const ahorroNeto = neto * (1 - gastoVidaPct);
      npc.economia.dinero = Math.max(0, npc.economia.dinero * (1 - inflDiaria) + ahorroNeto);

      const dineroTarget = precioAlimento * 20;
      const wealthScore = clamp((npc.economia.dinero / Math.max(1, dineroTarget)) * 65 + (neto / 18) * 30, 0, 100);
      poderAdquisitivo[npc.id] = npc.rol === 'desempleado' ? Math.min(wealthScore, 35) : wealthScore;
    }
  }

  const adminLoss = (1 - state.gobierno.coberturas.estatal) * ECON_CONSTANTS.perdidaAdminMax;
  const impuestosNetosDia = impuestosDia * (1 - adminLoss);

  const acum = state.gobierno.acumuladoPeriodo;
  acum.dias += 1;
  acum.impuestos += impuestosNetosDia;
  acum.ventasAlimento += ventasAlimentoDia;
  acum.nomina += nominaDia;
  acum.pensiones += pensionesDia;
  acum.garantiaAlimentaria += garantiaAlimentariaDia;
  acum.comprasAlimento += comprasAlimentoDia;

  const estDispDia =
    impuestosNetosDia + ventasAlimentoDia - (nominaDia + pensionesDia + garantiaAlimentariaDia + comprasAlimentoDia);

  state.ultimaSalidaEconomica = {
    accesoComida,
    poderAdquisitivo,
    disponibleDiarioEstimado: Number(estDispDia.toFixed(1)),
    precioAlimento,
    inflacion: state.gobierno.inflacion,
  };

  // 5. Hunger update before Health sequence
  for (const npc of vivos) {
    const acceso = accesoComida[npc.id] ?? 1;
    if (acceso >= 0.98) {
      npc.variables.hambre = clamp(
        npc.variables.hambre - ECON_CONSTANTS.coefHambreBaja * (acceso > 1.05 ? 1.2 : 1),
        0,
        100
      );
    } else {
      npc.variables.hambre = clamp(
        npc.variables.hambre + (1 - acceso) * ECON_CONSTANTS.coefHambreSubida,
        0,
        100
      );
    }
  }

  // 6. Individual Health & Hospital Sequence (ESTADOS §5 & §12):
  // (1) Phenomenon attacks
  const defensa = computeZoneDefense(state);
  const attackPhenomena = activePhenomena.filter(
    (f) => f.tipo === 'plaga_zombie' || f.tipo === 'pandemia'
  );

  for (const fen of attackPhenomena) {
    const cfg =
      fen.tipo === 'plaga_zombie'
        ? ECON_CONSTANTS.fenomenosSalud.plaga_zombie
        : ECON_CONSTANTS.fenomenosSalud.pandemia;
    const causa = `clima:${fen.tipo}`;

    for (const npc of vivos) {
      if (!npc.vivo || npc.hospital.internado) continue;
      const effZone = getEffectiveZone(npc, zonesCount);
      const path =
        fen.origen && zonesCount > 1
          ? shortestZonePath(fen.origen, effZone, preset.zonas)
          : [effZone];
      const dist = fen.origen && zonesCount > 1 ? path.length - 1 : 0;
      const prob = clamp(
        cfg.exposicionMax * (fen.intensidad / 100) * Math.pow(cfg.atenuacion, dist),
        0,
        1
      );
      if (Math.random() >= prob) continue;

      let repelledZone: ZoneId | null = null;
      if (cfg.usaProteccion) {
        for (const z of path) {
          const repelProb = clamp(ECON_CONSTANTS.proteccionMaxZona * (defensa[z] / 100), 0, 0.99);
          if (Math.random() < repelProb) {
            repelledZone = z;
            break;
          }
        }
      }

      if (repelledZone) {
        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'ataque',
          zona: repelledZone,
          zonaOrigen: fen.origen,
          zonaDestino: effZone,
          resultado: 'repelido',
          npcId: npc.id,
          causa,
        });
      } else {
        const dano = Math.round(cfg.danoMin + Math.random() * (cfg.danoMax - cfg.danoMin));
        applyInstantModifierToNpc(npc, {
          afecta: { salud: -dano },
          origen: causa,
          texto: `Recibió golpe (${fen.nombre}, -${dano} salud)`,
          recordOnNpc: true,
        });
        npc.ultimoGolpeOrigen = causa;
        state.golpesPorZonaHistorial[effZone].push(state.reloj.dia);

        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'ataque',
          zona: effZone,
          zonaOrigen: fen.origen,
          zonaDestino: effZone,
          resultado: 'golpe',
          npcId: npc.id,
          causa,
        });
        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'golpe',
          zona: effZone,
          npcId: npc.id,
          dano,
          causa,
        });
      }
    }
  }

  // (2) Critical hunger damage (hambre > 80 -> -2, aggregated daily cause)
  let hungerDamageCount = 0;
  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.variables.hambre > 80) {
      applyInstantModifierToNpc(npc, {
        afecta: { salud: -ECON_CONSTANTS.coefDanoHambreCritica },
        origen: 'hambre:critica',
        texto: 'Daño por hambre crítica',
        recordOnNpc: false,
      });
      hungerDamageCount++;
      if (npc.variables.salud <= 0 && !npc.ultimoGolpeOrigen) {
        npc.ultimoGolpeOrigen = 'hambre:critica';
      }
    }
    if (npc.variables.salud <= 0) {
      killNpc(state, npc, npc.ultimoGolpeOrigen || 'salud:cero', zonesCount);
    }
  }
  if (hungerDamageCount > 0) {
    addLog(
      state,
      'sistema',
      'hambre:critica',
      `Daño por hambre crítica (${hungerDamageCount} habitantes)`,
      `Modificador instantáneo -${ECON_CONSTANTS.coefDanoHambreCritica} salud aplicado a ${hungerDamageCount} NPCs.`
    );
  }

  // (3) Hospital admission (ESTADOS §12)
  let medicosActivos = 0;
  let currentInternados = 0;
  const candidatesHospital: Npc[] = [];

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.rol === 'medico' && !npc.hospital.internado && !npc.accionIa?.reemplazaTrabajo) {
      medicosActivos++;
    }
    if (npc.hospital.internado) {
      currentInternados++;
      npc.hospital.esperandoCama = false;
    } else {
      npc.hospital.esperandoCama = false;
      if (npc.variables.salud < ECON_CONSTANTS.umbralHospital) {
        candidatesHospital.push(npc);
      }
    }
  }

  const camas = Math.max(1, medicosActivos * ECON_CONSTANTS.pacientesPorMedico);
  let freeBeds = Math.max(0, camas - currentInternados);
  candidatesHospital.sort((a, b) => a.variables.salud - b.variables.salud);

  for (const npc of candidatesHospital) {
    if (freeBeds > 0) {
      freeBeds--;
      npc.hospital.internado = true;
      npc.hospital.esperandoCama = false;
      npc.hospital.diasInternado = 0;
      npc.accionIa = null;
      npc.mapa.accion = 'internado en hospital';
      emitSimEvent(state, {
        id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
        dia: state.reloj.dia,
        tipo: 'internacion',
        zona: 'centro',
        npcId: npc.id,
        causa: npc.ultimoGolpeOrigen || 'salud:baja',
      });
    } else {
      npc.hospital.esperandoCama = true;
    }
  }

  // (4) Cure (interned & natural outside, instant modifiers aggregated daily) + (5) Death check
  const saludService = state.gobierno.indicadores.salud / 100;
  const curaInternadoDia = ECON_CONSTANTS.curaBaseHospital * (0.5 + 0.5 * saludService);
  let hospitalCuredCount = 0;
  let naturalCuredCount = 0;

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    if (npc.hospital.internado) {
      applyInstantModifierToNpc(npc, {
        afecta: { salud: curaInternadoDia },
        origen: 'hospital:cura',
        texto: 'Atención hospitalaria diaria',
        recordOnNpc: false,
      });
      hospitalCuredCount++;
      npc.hospital.diasInternado += 1;
      if (npc.variables.salud >= ECON_CONSTANTS.altaHospital) {
        npc.hospital.internado = false;
        npc.hospital.diasInternado = 0;
        npc.ultimoGolpeOrigen = undefined;
        npc.mapa.accion =
          npc.rol === 'estudiante' ? 'estudiando' : npc.rol === 'jubilado' || npc.rol === 'desempleado' ? 'paseando' : 'trabajando';
        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'alta',
          zona: 'centro',
          npcId: npc.id,
          causa: 'hospital:alta',
        });
      }
    } else if (npc.variables.hambre < 50 && npc.variables.salud < 100) {
      applyInstantModifierToNpc(npc, {
        afecta: { salud: ECON_CONSTANTS.curaNaturalSalud },
        origen: 'salud:cura_natural',
        texto: 'Recuperación natural diaria',
        recordOnNpc: false,
      });
      naturalCuredCount++;
    }

    if (npc.variables.salud <= 0) {
      killNpc(state, npc, npc.ultimoGolpeOrigen || 'salud:cero', zonesCount);
    }
  }
  if (hospitalCuredCount > 0 || naturalCuredCount > 0) {
    addLog(
      state,
      'sistema',
      'salud:cura_diaria',
      `Curas diarias (${hospitalCuredCount} hospital, ${naturalCuredCount} natural)`,
      `Hospital +${curaInternadoDia.toFixed(1)} salud; natural +${ECON_CONSTANTS.curaNaturalSalud} salud.`
    );
  }

  // 7. Fear, Satisfaction & Loyalty for surviving NPCs
  const segService = state.gobierno.indicadores.seguridad / 100;
  const activeZombies = activePhenomena.filter((f) => f.tipo === 'plaga_zombie');

  for (const npc of vivos) {
    if (!npc.vivo) continue;
    const poder = poderAdquisitivo[npc.id] ?? 50;
    const val = getEffectiveTrait(npc, 'valentia') / 100;
    const res = getEffectiveTrait(npc, 'resiliencia') / 100;
    const reb = getEffectiveTrait(npc, 'rebeldia') / 100;
    const cod = getEffectiveTrait(npc, 'codicia') / 100;

    // Fear (ESTADOS §12)
    const modMiedo = getModifierDelta(npc, 'miedo') * 0.15;
    let targetMiedo: number;
    if (activeZombies.length > 0) {
      const effZone = getEffectiveZone(npc, zonesCount);
      const zoneDef = defensa[effZone] ?? state.gobierno.indicadores.seguridad;
      let maxZombieFear = 0;
      for (const fen of activeZombies) {
        const dist =
          fen.origen && zonesCount > 1
            ? shortestZonePath(fen.origen, effZone, preset.zonas).length - 1
            : 0;
        const valFear =
          fen.intensidad *
          Math.pow(ECON_CONSTANTS.fenomenosSalud.plaga_zombie.atenuacion, dist) *
          (1 - zoneDef / 100) *
          (1 - 0.5 * val);
        if (valFear > maxZombieFear) maxZombieFear = valFear;
      }
      targetMiedo = clamp(
        maxZombieFear + (npc.variables.hambre > 60 ? 12 : 0) + modMiedo,
        0,
        100
      );
    } else {
      targetMiedo = clamp(
        14 + (npc.variables.hambre > 60 ? 15 : 0) - segService * 18 - val * 12 + modMiedo,
        0,
        100
      );
    }
    npc.variables.miedo = clamp(
      npc.variables.miedo + (targetMiedo - npc.variables.miedo) * 0.25,
      0,
      100
    );

    // Satisfaction (inertia via resilience)
    const taxRate = getTaxRateForNpc(npc, state);
    const taxDrag = (taxRate / 60) * (12 + 12 * cod);
    const inflDrag = mod === 'fiscal' ? Math.max(0, state.gobierno.inflacion - 10) * 0.35 : 0;
    const desempDrag = npc.rol === 'desempleado' ? 16 : 0;
    const modSat = getModifierDelta(npc, 'satisfaccion') * 0.3;

    const targetSat = clamp(
      52 +
        (poder - 50) * 0.45 +
        saludService * 10 +
        (state.gobierno.indicadores.infraestructura / 100) * 6 -
        npc.variables.hambre * 0.48 -
        npc.variables.miedo * 0.28 -
        (100 - npc.variables.salud) * 0.25 -
        taxDrag -
        inflDrag -
        desempDrag +
        modSat,
      0,
      100
    );
    const inertia = 0.12 + 0.08 * (1 - res);
    npc.variables.satisfaccion = clamp(
      npc.variables.satisfaccion + (targetSat - npc.variables.satisfaccion) * inertia,
      0,
      100
    );

    // Loyalty follows satisfaction with lag; rebeldia amplifies drops
    const modLealtad = getModifierDelta(npc, 'lealtad') * 0.25;
    const targetLealtad = clamp(npc.variables.satisfaccion + modLealtad - reb * 10, 0, 100);
    const diffLealtad = targetLealtad - npc.variables.lealtad;
    const lagRate = diffLealtad < 0 ? 0.12 * (1 + reb * 0.8) : 0.08;
    npc.variables.lealtad = clamp(npc.variables.lealtad + diffLealtad * lagRate, 0, 100);
  }
}

function settleFiscalPeriod(state: GameState): void {
  const acum = state.gobierno.acumuladoPeriodo;
  const pal = state.gobierno.palancasVigentes;
  const mod = state.config.economiaModulo;
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = Math.max(1, vivos.length);

  // Daily inflation erosion on reserve if fiscal
  if (mod === 'fiscal' && state.gobierno.inflacion > 0) {
    const erosion = (state.gobierno.inflacion / 100 / 52);
    state.gobierno.reserva = Math.max(0, state.gobierno.reserva * (1 - erosion));
  }

  const ingresos = acum.impuestos + acum.ventasAlimento;
  const obligatorios = acum.nomina + acum.pensiones + acum.garantiaAlimentaria + acum.comprasAlimento;
  const disponible = ingresos - obligatorios;

  let deficit = 0;
  let emision = 0;
  let impago = false;
  let presupuestoAsignado = 0;
  let subsidiosAsignados = 0;
  let prensaAsignada = 0;
  let aReserva = 0;

  if (disponible >= 0) {
    const areaPcts = pal.gasto.presupuesto;
    const subPcts = pal.gasto.subsidios;
    const prensaPct = pal.gasto.prensa;

    const totalAssignedPct =
      areaPcts.salud +
      areaPcts.seguridad +
      areaPcts.infraestructura +
      areaPcts.educacion +
      prensaPct +
      Object.values(subPcts).reduce((a, b) => a + b, 0);

    const effectiveAssignedPct = Math.min(100, totalAssignedPct);
    const adminEfficiency = 1 - (1 - state.gobierno.coberturas.estatal) * ECON_CONSTANTS.perdidaAdminMax;

    // Update Service Indicators
    const costoBase = pop * ECON_CONSTANTS.costoBaseServicioPorPoblacion * FISCAL_PERIOD_DAYS;
    const areaToCoverage: Record<ServiceAreaId, number> = {
      salud: state.gobierno.coberturas.medico,
      seguridad: state.gobierno.coberturas.policia,
      infraestructura: state.gobierno.coberturas.ingeniero,
      educacion: state.gobierno.coberturas.docente,
    };

    (['salud', 'seguridad', 'infraestructura', 'educacion'] as ServiceAreaId[]).forEach((area) => {
      const monto = disponible * (areaPcts[area] / 100) * adminEfficiency;
      presupuestoAsignado += monto;
      const ratio = monto / Math.max(1, costoBase);
      const inversion = ratio <= 1 ? ratio : 1 + Math.sqrt(ratio - 1) * 0.5;
      const gain = areaToCoverage[area] * inversion * 6.5;
      const decay = 4.2;
      state.gobierno.indicadores[area] = clamp(
        Number((state.gobierno.indicadores[area] + gain - decay).toFixed(1)),
        0,
        100
      );
    });

    // Subsidies
    (['agro', 'industria', 'comercio', 'publico', 'sin_ingreso'] as RoleGroupId[]).forEach((grp) => {
      const pct = subPcts[grp] || 0;
      if (pct <= 0) return;
      const monto = disponible * (pct / 100);
      subsidiosAsignados += monto;
      const members = vivos.filter((n) => ROLE_CATALOG[n.rol].grupo === grp);
      if (members.length > 0) {
        const perNpc = monto / members.length;
        for (const npc of members) {
          if (mod === 'simple') {
            npc.variables.satisfaccion = clamp(
              npc.variables.satisfaccion +
                Math.min(
                  ECON_CONSTANTS.topeSatisfaccionSubsidioSimple,
                  Math.sqrt(perNpc) * ECON_CONSTANTS.coefSatisfaccionSubsidioSimple
                ),
              0,
              100
            );
          } else {
            npc.economia.dinero += perNpc;
          }
        }
      }
    });

    // Press Financing
    prensaAsignada = disponible * (prensaPct / 100);
    for (const medio of state.medios) {
      const fondos = prensaAsignada * (medio.intervencion.financiamiento / 100);
      medio.finanzas.fondosEstado = Number(fondos.toFixed(1));
      medio.finanzas.dependenciaPct = Number(
        ((fondos / Math.max(1, medio.finanzas.ingresosPropios + fondos)) * 100).toFixed(1)
      );
      const targetReach = clamp(14 + Math.sqrt(fondos) * 11.5, 12, 95);
      medio.alcancePct = Math.round(medio.alcancePct + (targetReach - medio.alcancePct) * 0.35);

      // Dependency raises government affinity and slightly erodes credibility if noticeable
      if (medio.finanzas.dependenciaPct > 35) {
        medio.lineaEditorial.afinidadGobierno = clamp(medio.lineaEditorial.afinidadGobierno + 2.5, 0, 100);
        medio.credibilidad = clamp(medio.credibilidad - (medio.finanzas.dependenciaPct - 35) * 0.08, 15, 98);
      } else {
        medio.credibilidad = clamp(medio.credibilidad + 0.6, 15, 98);
      }

      // Regulation reduces sensationalism and credibility, increases rebeldia modifier on consumers
      const reg = medio.intervencion.regulacion;
      if (reg > 25) {
        medio.lineaEditorial.sensacionalismo = clamp(medio.lineaEditorial.sensacionalismo - (reg - 25) * 0.12, 10, 95);
        medio.credibilidad = clamp(medio.credibilidad - (reg - 25) * 0.09, 15, 98);
      }
    }

    aReserva = disponible * ((100 - effectiveAssignedPct) / 100);
    state.gobierno.reserva = Number((state.gobierno.reserva + aReserva).toFixed(1));
    if (mod === 'fiscal') {
      // Natural inflation decay without printing
      state.gobierno.inflacion = Math.max(2, Number((state.gobierno.inflacion * 0.94).toFixed(1)));
    }
  } else {
    // Deficit!
    deficit = Math.abs(disponible);
    let remaining = deficit;

    // 1. Reserve
    if (state.gobierno.reserva > 0) {
      const used = Math.min(state.gobierno.reserva, remaining);
      state.gobierno.reserva = Number((state.gobierno.reserva - used).toFixed(1));
      remaining -= used;
    }

    // 2. Fiscal Emission (only in fiscal module)
    if (remaining > 0 && mod === 'fiscal') {
      const maxEmit = Math.max(0, ingresos) * (pal.finanzas.topeEmision / 100);
      emision = Math.min(remaining, maxEmit);
      remaining -= emision;
      if (emision > 0) {
        const inflJump = (emision / Math.max(100, pop * 12)) * 28;
        state.gobierno.inflacion = clamp(Number((state.gobierno.inflacion + inflJump).toFixed(1)), 0, 300);
        addLog(
          state,
          'economia',
          'finanzas:emision',
          `Emisión monetaria de $${emision.toFixed(0)}`,
          `Cubre déficit fiscal pero eleva la inflación a ${state.gobierno.inflacion.toFixed(1)}%.`
        );
      }
    }

    // 3. Impago!
    if (remaining > 0.5) {
      impago = true;
      for (const npc of vivos) {
        if (ROLE_CATALOG[npc.rol].publico) {
          npc.variables.satisfaccion = clamp(npc.variables.satisfaccion - 14, 0, 100);
          npc.variables.lealtad = clamp(npc.variables.lealtad - 12, 0, 100);
        }
      }
      addLog(
        state,
        'economia',
        'finanzas:impago',
        'Impago de nómina pública',
        `Faltaron $${remaining.toFixed(0)} para cubrir los gastos obligatorios del período.`
      );
    }

    // Services decay without budget
    (['salud', 'seguridad', 'infraestructura', 'educacion'] as ServiceAreaId[]).forEach((area) => {
      state.gobierno.indicadores[area] = clamp(Number((state.gobierno.indicadores[area] - 4.2).toFixed(1)), 0, 100);
    });
  }

  // Apply regulation rebeldia modifier if regulation > 40
  for (const medio of state.medios) {
    if (medio.intervencion.regulacion > 40) {
      const sample = vivos.slice(0, Math.round(vivos.length * (medio.alcancePct / 100) * 0.4));
      for (const npc of sample) {
        applyModifierToNpc(npc, {
          afecta: { rebeldia: Math.round((medio.intervencion.regulacion - 40) * 0.15) },
          duracionDias: FISCAL_PERIOD_DAYS,
          origen: `prensa:regulacion/${medio.id}`,
          texto: `Molesto por la regulación estatal sobre ${medio.nombre}`,
        });
      }
    }
  }

  state.gobierno.finanzas = {
    ingresos: Number(ingresos.toFixed(1)),
    impuestos: Number(acum.impuestos.toFixed(1)),
    ventasAlimento: Number(acum.ventasAlimento.toFixed(1)),
    nomina: Number(acum.nomina.toFixed(1)),
    pensiones: Number(acum.pensiones.toFixed(1)),
    garantiaAlimentaria: Number(acum.garantiaAlimentaria.toFixed(1)),
    comprasAlimento: Number(acum.comprasAlimento.toFixed(1)),
    disponible: Number(disponible.toFixed(1)),
    presupuestoAsignado: Number(presupuestoAsignado.toFixed(1)),
    subsidiosAsignados: Number(subsidiosAsignados.toFixed(1)),
    prensaAsignada: Number(prensaAsignada.toFixed(1)),
    aReserva: Number(aReserva.toFixed(1)),
    deficit: Number(deficit.toFixed(1)),
    emision: Number(emision.toFixed(1)),
    impago,
  };

  state.gobierno.acumuladoPeriodo = {
    dias: 0,
    impuestos: 0,
    ventasAlimento: 0,
    nomina: 0,
    pensiones: 0,
    garantiaAlimentaria: 0,
    comprasAlimento: 0,
  };

  // Apply 20% max change per period toward Governor's target levers
  applyLeverInertia(state);
}

function updateClimate(state: GameState): void {
  const dia = state.reloj.dia;
  const remaining: ClimatePhenomenon[] = [];

  for (const fen of state.clima.fenomenos) {
    if (dia < fen.inicioDia + fen.duracionDias) {
      if (fen.crecimientoDia && dia > fen.inicioDia && dia >= fen.inicioDia) {
        fen.intensidad = clamp(Number((fen.intensidad + fen.crecimientoDia).toFixed(2)), 0, 100);
      }
      if (
        (fen.avisoDias ?? 0) > 0 &&
        dia >= fen.inicioDia - (fen.avisoDias ?? 0) &&
        dia < fen.inicioDia &&
        !state.avisosEmitidos.includes(fen.id)
      ) {
        state.avisosEmitidos.push(fen.id);
        emitSimEvent(state, {
          id: `ev_${dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia,
          tipo: 'aviso',
          zona: fen.origen ?? 'centro',
          fenomeno: fen.nombre,
          diasRestantes: fen.inicioDia - dia,
          causa: `clima:${fen.tipo}`,
        });
        addLog(
          state,
          'clima',
          `clima:${fen.tipo}`,
          `Aviso: ${fen.nombre} en ${fen.origen ?? 'valle'}`,
          `Faltan ${fen.inicioDia - dia} días para su llegada estimada.`
        );
      } else if (dia === fen.inicioDia && fen.inicioDia > 1) {
        addLog(
          state,
          'clima',
          `clima:${fen.tipo}`,
          `Comienza ${fen.nombre} (intensidad ${Math.round(fen.intensidad)}%)`,
          `Origen: ${fen.origen ?? 'general'} · Duración estimada ${fen.duracionDias} días.`
        );
      }
      remaining.push(fen);
    } else {
      addLog(
        state,
        'clima',
        `clima:${fen.tipo}`,
        `Finaliza ${fen.nombre}`,
        'Las condiciones climáticas regresan a la normalidad.'
      );
    }
  }
  state.clima.fenomenos = remaining;

  if (dia >= state.clima.proximoEventoDia) {
    const pool: PhenomenonType[] =
      state.config.escenarioId === 'zombies' ? ['sequia', 'plaga'] : ['sequia', 'plaga', 'pandemia'];
    const tipo = pool[Math.floor(Math.random() * pool.length)];
    const names: Record<PhenomenonType, string> = {
      sequia: 'Sequía Estacional',
      plaga: 'Plaga de Cultivos',
      pandemia: 'Brote Gripal Comunitario',
      plaga_zombie: 'Oleada Zombie',
    };
    const duracion = 14 + Math.floor(Math.random() * 14);
    const intensidad = 35 + Math.floor(Math.random() * 35);
    state.clima.fenomenos.push({
      id: `fen_${dia}`,
      tipo,
      nombre: names[tipo],
      intensidad,
      inicioDia: dia,
      duracionDias: duracion,
    });
    state.clima.proximoEventoDia = dia + duracion + 18 + Math.floor(Math.random() * 20);
    addLog(
      state,
      'clima',
      `clima:${tipo}`,
      `Comienza ${names[tipo]} (intensidad ${intensidad}%)`,
      `Se estima una duración de ${duracion} días.`
    );
  }
}

function checkConditionTriggers(state: GameState, preDerived?: CommunityDerived): void {
  const derived = preDerived ?? deriveCommunityStats(state);
  const dia = state.reloj.dia;

  // Resolve expired condition windows automatically via motor fallback
  for (const win of state.ventanasCondicion) {
    if (win.estado === 'pendiente' && dia >= win.diaLimite) {
      resolveConditionWindowWithFallback(state, win.id, undefined, undefined, 'respaldo');
    }
  }

  // Trigger: Impago -> Huelga
  if (state.gobierno.finanzas.impago && dia >= state.cooldownsCondicion.impago) {
    const huelga = ACTION_TABLE.find((a) => a.id === 'huelga')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, huelga)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(1, Math.ceil(elegibles.length * 0.45));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, huelga) - scoreActionAffinity(a, huelga))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_impago_${dia}`,
        disparador: 'impago',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [huelga],
        npcIds: elegidos,
        estado: 'pendiente',
      });
      state.cooldownsCondicion.impago = dia + 7;
    }
  }

  // Trigger: Descontentos > 30% -> Protesta
  if (derived.descontentosPct > 30 && dia >= state.cooldownsCondicion.descontento) {
    const protesta = ACTION_TABLE.find((a) => a.id === 'protesta')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, protesta)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(2, Math.round(elegibles.length * 0.14));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, protesta) - scoreActionAffinity(a, protesta))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_descontento_${dia}`,
        disparador: 'descontento',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [protesta],
        npcIds: elegidos,
        estado: 'pendiente',
      });
      state.cooldownsCondicion.descontento = dia + 9;
    }
  }

  // Trigger: Hambre Crítica > 20% -> Saqueo
  if (derived.hambreCriticaPct > 20 && dia >= state.cooldownsCondicion.hambre) {
    const saqueo = ACTION_TABLE.find((a) => a.id === 'saqueo')!;
    const elegibles = state.npcs.filter(
      (n) => n.vivo && !n.hospital.internado && !n.accionIa && isNpcEligibleForAction(n, saqueo)
    );
    if (elegibles.length > 0) {
      const cantidad = Math.max(2, Math.round(elegibles.length * 0.12));
      const elegidos = [...elegibles]
        .sort((a, b) => scoreActionAffinity(b, saqueo) - scoreActionAffinity(a, saqueo))
        .slice(0, cantidad)
        .map((n) => n.id);
      state.ventanasCondicion.push({
        id: `cond_hambre_${dia}`,
        disparador: 'hambre',
        diaInicio: dia,
        diaLimite: dia + 1,
        intensidadCantidad: cantidad,
        candidatas: [saqueo],
        npcIds: elegidos,
        estado: 'pendiente',
      });
      state.cooldownsCondicion.hambre = dia + 8;
    }
  }

  if (state.ventanasCondicion.length > 15) {
    state.ventanasCondicion = state.ventanasCondicion.slice(-10);
  }
}

function evaluateObjective(state: GameState, preDerived?: CommunityDerived): void {
  if (state.resultado.estado !== 'jugando') return;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const derived = preDerived ?? deriveCommunityStats(state);

  const getMetric = (m: 'apoyoPct' | 'hambreCriticaPct' | 'poblacion') => {
    if (m === 'apoyoPct') return derived.apoyoPct;
    if (m === 'hambreCriticaPct') return derived.hambreCriticaPct;
    return derived.poblacion;
  };

  const checkCond = (val: number, op: '>=' | '>' | '<' | '<=', threshold: number): boolean => {
    if (op === '>=') return val >= threshold;
    if (op === '>') return val > threshold;
    if (op === '<') return val < threshold;
    return val <= threshold;
  };

  const defeatVal = getMetric(preset.derrota.metrica);
  if (checkCond(defeatVal, preset.derrota.op, preset.derrota.umbral)) {
    state.resultado = {
      estado: 'derrota',
      razon: preset.derrota.descripcion,
      diaFinal: state.reloj.dia,
    };
    addLog(state, 'sistema', 'objetivo:derrota', 'Fin de partida: Derrota', preset.derrota.descripcion);
    return;
  }

  const plazo = preset.victoria.plazoDia ?? 365;
  if (state.reloj.dia >= plazo) {
    const vicVal = getMetric(preset.victoria.metrica);
    if (checkCond(vicVal, preset.victoria.op, preset.victoria.umbral)) {
      state.resultado = {
        estado: 'victoria',
        razon: preset.victoria.descripcion,
        diaFinal: state.reloj.dia,
      };
      addLog(state, 'sistema', 'objetivo:victoria', 'Fin de partida: Victoria', preset.victoria.descripcion);
    } else {
      state.resultado = {
        estado: 'derrota',
        razon: `No se cumplió la meta al día ${plazo}: ${preset.victoria.descripcion}`,
        diaFinal: state.reloj.dia,
      };
      addLog(state, 'sistema', 'objetivo:derrota', 'Fin de partida: Derrota', `Meta no alcanzada al día ${plazo}.`);
    }
  }
}

function advanceDay(state: GameState): void {
  state.reloj.dia += 1;
  state.reloj.anio = Math.floor((state.reloj.dia - 1) / 365) + 1;
  state.reloj.diasEnPeriodoFiscal += 1;
  state.eventosDiaActual = [];

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const zonesCount = Object.keys(preset.zonas).length;

  // Prune hit history older than 5-day threat window
  const minHitKeep = state.reloj.dia - ECON_CONSTANTS.golpeAmenazaVentanaDias;
  for (const z of Object.keys(state.golpesPorZonaHistorial) as ZoneId[]) {
    state.golpesPorZonaHistorial[z] = state.golpesPorZonaHistorial[z].filter((d) => d > minHitKeep);
  }

  // Decay modifiers & active AI actions
  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    npc.modificadores = npc.modificadores
      .map((m) => ({ ...m, diasRestantes: m.diasRestantes - 1 }))
      .filter((m) => m.diasRestantes > 0);

    if (npc.accionIa) {
      npc.accionIa.diasRestantes -= 1;
      if (npc.accionIa.diasRestantes <= 0) {
        const ended = npc.accionIa;
        npc.accionIa = null;
        npc.mapa.accion =
          npc.rol === 'estudiante' ? 'estudiando' : npc.rol === 'jubilado' || npc.rol === 'desempleado' ? 'paseando' : 'trabajando';
        npc.mapa.destino = getDistrictPosition(npc.rol);
        emitSimEvent(state, {
          id: `ev_${state.reloj.dia}_${Math.random().toString(36).slice(2, 7)}`,
          dia: state.reloj.dia,
          tipo: 'accion_fin',
          zona: npc.zona,
          accion: ended.id,
          npcIds: [npc.id],
          zonaDestino: ended.zonaDestino ?? npc.zona,
          causa: ended.origen,
        });
      }
    }
  }

  // Update chaos window
  if (state.reloj.dia - state.caosTracker.ventanaInicioDia >= state.config.caos.periodoDias) {
    state.caosTracker.ventanaInicioDia = state.reloj.dia;
    state.caosTracker.accionesEnVentana = 0;
  }

  updateServiceCoverage(state);
  handleRolesAndAging(state);
  updateClimate(state);
  runPoliceRelocation(state);
  runDailyEconomyAndNeeds(state);

  if (state.reloj.diasEnPeriodoFiscal >= FISCAL_PERIOD_DAYS) {
    settleFiscalPeriod(state);
    state.reloj.diasEnPeriodoFiscal = 0;
    state.reloj.periodoFiscal += 1;
  }

  const derived = deriveCommunityStats(state);
  state.caosTracker.respiroActivo =
    derived.satisfaccionMedia < state.config.caos.respiroSiSatisfaccionMediaMenorA;

  checkConditionTriggers(state, derived);
  evaluateObjective(state, derived);

  // Clean up any unused zonesCount ref by keeping consistent signature
  void zonesCount;

  state.historial.push({
    dia: state.reloj.dia,
    reserva: Math.round(state.gobierno.reserva),
    inflacion: state.gobierno.inflacion,
    satisfaccion: derived.satisfaccionMedia,
    apoyo: derived.apoyoPct,
    hambreCritica: derived.hambreCriticaPct,
    stockDias: state.alimento.diasStock,
    poblacion: derived.poblacion,
  });
  if (state.historial.length > 200) {
    state.historial.shift();
  }
}

export function stepSimulation(state: GameState, ticksToRun: number): GameState {
  if (state.resultado.estado !== 'jugando' || ticksToRun <= 0) return state;

  const startTick = state.reloj.tick;
  const crossesDay =
    Math.floor((startTick + ticksToRun) / TICKS_PER_DAY) > Math.floor(startTick / TICKS_PER_DAY);

  // Fast path: pure movement ticks do not need to deep-clone history, logs, news, or modifiers
  if (!crossesDay) {
    const nextNpcs = state.npcs.map((npc) =>
      npc.vivo
        ? {
            ...npc,
            mapa: {
              ...npc.mapa,
              destino: { ...npc.mapa.destino },
            },
          }
        : npc
    );
    const next: GameState = {
      ...state,
      reloj: {
        ...state.reloj,
        tick: startTick + ticksToRun,
      },
      npcs: nextNpcs,
    };
    stepNpcPositions(next, ticksToRun);
    return next;
  }

  const next = structuredClone(state);
  let remaining = ticksToRun;
  while (remaining > 0 && next.resultado.estado === 'jugando') {
    const remToBoundary = TICKS_PER_DAY - (next.reloj.tick % TICKS_PER_DAY);
    if (remaining >= remToBoundary) {
      next.reloj.tick += remToBoundary;
      stepNpcPositions(next, remToBoundary);
      remaining -= remToBoundary;
      advanceDay(next);
    } else {
      next.reloj.tick += remaining;
      stepNpcPositions(next, remaining);
      remaining = 0;
    }
  }
  return next;
}

export function stepHeadlessDay(state: GameState): void {
  if (state.resultado.estado !== 'jugando') return;
  state.reloj.tick += TICKS_PER_DAY;
  advanceDay(state);
}

export function pickPressTopicAndTone(state: GameState): {
  tema: string;
  tono: NewsTone;
  origen: string;
  detalle: string;
  zonaOrigen?: ZoneId;
  fenomenoId?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
} {
  const derived = deriveCommunityStats(state);
  const dia = state.reloj.dia;

  // Priority 1: Newly announced threat in its avisoDias window (so press alerts citizens before arrival)
  const announced = getAnnouncedPhenomena(state).filter((f) => f.origen);
  for (const fen of announced) {
    const alreadyCoveredRecently = state.noticias.some(
      (n) => n.esAviso && n.fenomenoId === fen.id && dia - n.dia <= 3
    );
    if (!alreadyCoveredRecently) {
      const daysLeft = fen.inicioDia - dia;
      return {
        tema: fen.tipo,
        tono: 'alarmista',
        origen: `clima:${fen.tipo}`,
        detalle: `Alerta temprana: ${fen.nombre} se aproxima por la zona ${fen.origen} en ${daysLeft} días (intensidad estimada ${Math.round(fen.intensidad)}%).`,
        zonaOrigen: fen.origen,
        fenomenoId: fen.id,
        esAviso: true,
        vigenteHastaDia: fen.inicioDia + fen.duracionDias,
      };
    }
  }

  if (state.gobierno.finanzas.impago) {
    return {
      tema: 'impago',
      tono: 'alarmista',
      origen: 'estado:impago_nomina',
      detalle: 'El estado no pudo cubrir la nómina de los trabajadores públicos en el último cierre fiscal.',
    };
  }
  if (derived.hambreCriticaPct > 15) {
    return {
      tema: 'hambre',
      tono: 'alarmista',
      origen: 'estado:hambre_critica',
      detalle: `El ${derived.hambreCriticaPct}% de la población padece hambre crítica y quedan ${state.alimento.diasStock} días de reserva alimentaria.`,
    };
  }

  const active = getActivePhenomena(state);
  if (active.length > 0) {
    // Prefer phenomenon with origen that hasn't been covered as notice yet, else highest intensity
    const fen =
      active.find(
        (f) => f.origen && !state.noticias.some((n) => n.esAviso && n.fenomenoId === f.id && dia - n.dia <= 5)
      ) || active[0];
    return {
      tema: fen.tipo,
      tono: fen.intensidad > 50 ? 'alarmista' : 'critico',
      origen: `clima:${fen.tipo}`,
      detalle: `Persiste ${fen.nombre}${fen.origen ? ` desde ${fen.origen}` : ''} con una intensidad del ${Math.round(fen.intensidad)}%.`,
      zonaOrigen: fen.origen,
      fenomenoId: fen.id,
      esAviso: Boolean(fen.origen),
      vigenteHastaDia: fen.origen ? fen.inicioDia + fen.duracionDias : undefined,
    };
  }

  if (derived.descontentosPct > 25) {
    return {
      tema: 'malestar_social',
      tono: 'critico',
      origen: 'estado:descontento_alto',
      detalle: `Un ${derived.descontentosPct}% de los vecinos expresa fuerte malestar con la situación actual.`,
    };
  }
  if (state.config.economiaModulo === 'fiscal' && state.gobierno.inflacion > 25) {
    return {
      tema: 'inflacion',
      tono: 'critico',
      origen: 'economia:inflacion_alta',
      detalle: `La inflación alcanza ${state.gobierno.inflacion.toFixed(1)}% y encarece el costo de la comida ($${state.alimento.precio.toFixed(2)}).`,
    };
  }
  const latestActionNpc = state.npcs.find((n) => n.vivo && n.accionIa);
  if (latestActionNpc && latestActionNpc.accionIa) {
    return {
      tema: 'vida_comunitaria',
      tono: 'informativo',
      origen: latestActionNpc.accionIa.origen,
      detalle: latestActionNpc.accionIa.texto,
    };
  }
  if (derived.apoyoPct >= 60) {
    return {
      tema: 'gestion_y_clima_social',
      tono: 'favorable',
      origen: 'estado:consenso_social',
      detalle: `El apoyo al gobernador se sostiene en ${derived.apoyoPct}% con una satisfacción media de ${derived.satisfaccionMedia}%.`,
    };
  }
  return {
    tema: 'coyuntura_local',
    tono: 'informativo',
    origen: 'estado:rutina',
    detalle: `La comunidad cierra la jornada con ${derived.poblacion} habitantes y ${state.alimento.diasStock} días de alimento en stock.`,
  };
}
