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
  GovernorLevers,
  MediaOutlet,
  Modifier,
  NewsArticle,
  NewsTone,
  Npc,
  NpcVariable,
  PendingConditionWindow,
  PersonalityTrait,
  PhenomenonType,
  PublicRoleId,
  RoleGroupId,
  RoleId,
  ServiceAreaId,
  TaxableGroupId,
} from '../types/game';
import { getCityErrandPosition, getDistrictPosition } from './worldGenerator';

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
    const val = mod.afecta[trait];
    if (typeof val === 'number') delta += val;
  }
  return clamp(npc.personalidad[trait] + delta, 0, 100);
}

export function getModifierDelta(npc: Npc, key: PersonalityTrait | NpcVariable | 'productividad'): number {
  let delta = 0;
  for (const mod of npc.modificadores) {
    const val = mod.afecta[key];
    if (typeof val === 'number') delta += val;
  }
  return delta;
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

  for (const npc of vivosList) {
    roles[npc.rol]++;
    sumSat += npc.variables.satisfaccion;
    if (npc.variables.lealtad >= 50) apoyoCount++;
    if (npc.variables.satisfaccion < 30) descontentosCount++;
    if (npc.variables.hambre > 80) hambreCriticaCount++;
    if (state.config.economiaModulo === 'simple') {
      if ((state.ultimaSalidaEconomica.accesoComida[npc.id] ?? 1) < 0.7) sinDineroCount++;
    } else if (npc.economia.dinero < state.alimento.precio) {
      sinDineroCount++;
    }
    prodTotal += getNpcProductivity(npc, state) * 100;
  }

  return {
    poblacion: vivos,
    vivos,
    bajas,
    satisfaccionMedia: Number((sumSat / vivos).toFixed(1)),
    apoyoPct: Number(((apoyoCount / vivos) * 100).toFixed(1)),
    descontentosPct: Number(((descontentosCount / vivos) * 100).toFixed(1)),
    hambreCriticaPct: Number(((hambreCriticaCount / vivos) * 100).toFixed(1)),
    sinDineroPct: Number(((sinDineroCount / vivos) * 100).toFixed(1)),
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
  if (npc.accionIa?.reemplazaTrabajo) return 0;

  const lab = getEffectiveTrait(npc, 'laboriosidad') / 100;
  const salud = npc.variables.salud / 100;
  const sat = npc.variables.satisfaccion / 100;

  let climaFactor = 1;
  for (const fen of state.clima.fenomenos) {
    if (fen.tipo === 'pandemia') climaFactor *= 1 - (fen.intensidad / 100) * 0.35;
    if (fen.tipo === 'plaga_zombie') climaFactor *= 1 - (fen.intensidad / 100) * 0.15;
  }

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
    climaFactor *
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

  npc.accionIa = {
    id: action.id,
    nombre: action.nombre,
    tipo: action.tipo,
    reemplazaTrabajo: action.efecto.reemplazaTrabajo,
    diasRestantes: duracion,
    duracionTotal: duracion,
    origen,
    texto,
  };

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

  // Optional social rumor affecting nearby / random subset of community
  if (action.efecto.rumorSocial) {
    const rumor = action.efecto.rumorSocial;
    const vivos = state.npcs.filter((n) => n.vivo && n.id !== npc.id);
    const affectedCount = Math.max(1, Math.round(vivos.length * rumor.radioPct));
    const shuffled = [...vivos].sort((a, b) => {
      const distA = Math.hypot(a.mapa.x - npc.mapa.x, a.mapa.y - npc.mapa.y);
      const distB = Math.hypot(b.mapa.x - npc.mapa.x, b.mapa.y - npc.mapa.y);
      return distA - distB;
    });
    for (let i = 0; i < Math.min(affectedCount, shuffled.length); i++) {
      applyModifierToNpc(shuffled[i], {
        afecta: rumor.afecta,
        duracionDias: rumor.duracionDias,
        origen: `rumor:${action.id}/${npc.id}`,
        texto: rumor.texto,
      });
    }
  }

  // Contagion to 1 nearby eligible NPC if probability hits
  if (action.contagio > 0 && Math.random() < action.contagio) {
    const nearby = state.npcs.find(
      (other) =>
        other.vivo &&
        other.id !== npc.id &&
        !other.accionIa &&
        isNpcEligibleForAction(other, action) &&
        Math.hypot(other.mapa.x - npc.mapa.x, other.mapa.y - npc.mapa.y) < 120
    );
    if (nearby) {
      const copyText = action.textoBase.replace('{nombre}', nearby.nombre);
      nearby.accionIa = {
        id: action.id,
        nombre: action.nombre,
        tipo: action.tipo,
        reemplazaTrabajo: action.efecto.reemplazaTrabajo,
        diasRestantes: Math.max(1, duracion - 1),
        duracionTotal: duracion,
        origen: `contagio:${action.id}/${npc.id}`,
        texto: copyText,
      };
      nearby.mapa.accion = action.nombre.toLowerCase();
    }
  }
}

export function isNpcEligibleForAction(npc: Npc, action: ActionDefinition): boolean {
  if (!npc.vivo) return false;
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
  const vivos = state.npcs.filter((n) => n.vivo && !n.accionIa && getStage(n.edad) === 'adulto');
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

  const targets = state.npcs.filter((n) => n.vivo && win.npcIds.includes(n.id));
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

  // Anti-loop: repeated topic reduces impact
  const recentSameTopic = state.noticias.filter(
    (n) => n.tema === article.tema && state.reloj.dia - n.dia <= 10
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
  if (article.tono === 'alarmista') {
    afecta.miedo = Math.round(10 * impactScale);
    afecta.lealtad = -Math.round(5 * impactScale);
  } else if (article.tono === 'critico') {
    afecta.lealtad = -Math.round(9 * impactScale);
    afecta.rebeldia = Math.round(6 * impactScale);
  } else if (article.tono === 'favorable') {
    afecta.lealtad = Math.round(8 * impactScale);
    afecta.miedo = -Math.round(4 * impactScale);
  } else {
    afecta.miedo = Math.round(2 * impactScale);
  }

  for (const npc of sortedConsumers) {
    applyModifierToNpc(npc, {
      afecta,
      duracionDias: 4,
      origen: `noticia:${article.id}`,
      texto: `Leyó "${article.titulo}" en ${medio.nombre}`,
    });
  }

  state.noticias.unshift(article);
  if (state.noticias.length > 40) state.noticias.length = 40;
}

function stepNpcPositions(state: GameState, dtTicks: number): void {
  const baseSpeed = 5.6 * dtTicks;
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
      // Street-aligned movement bias when crossing districts so citizens use avenues
      let moveX = dx / dist;
      let moveY = dy / dist;
      if (dist > 140) {
        const nearAvenueX = Math.abs(npc.mapa.x - 355) < 16 || Math.abs(npc.mapa.x - 665) < 16;
        const nearAvenueY = Math.abs(npc.mapa.y - 295) < 16;
        if (!nearAvenueX && !nearAvenueY) {
          // Slight pull toward nearest axis
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
  const counts: Record<PublicRoleId | 'comerciante', number> = {
    policia: 0,
    estatal: 0,
    docente: 0,
    medico: 0,
    ingeniero: 0,
    comerciante: 0,
  };
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    if (n.rol in counts && !n.accionIa?.reemplazaTrabajo) {
      counts[n.rol as keyof typeof counts]++;
    }
  }
  state.gobierno.coberturas = {
    policia: clamp(counts.policia / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.policia), 0, 1),
    estatal: clamp(counts.estatal / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.estatal), 0, 1),
    docente: clamp(counts.docente / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.docente), 0, 1),
    medico: clamp(counts.medico / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.medico), 0, 1),
    ingeniero: clamp(counts.ingeniero / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.ingeniero), 0, 1),
    comercio: clamp(counts.comerciante / Math.max(1, vivos * ECON_CONSTANTS.objetivoCobertura.comercio), 0, 1),
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
        npc.mapa.destino = getDistrictPosition(chosen);
        npc.mapa.accion = 'trabajando';
      }
    }
  }
}

function runDailyEconomyAndNeeds(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  const mod = state.config.economiaModulo;
  const pal = state.gobierno.palancasVigentes;

  // Climate modifiers
  let agroClimaFactor = 1;
  let climaPrecioFactor = 1;
  let saludClimaDelta = 0;
  let miedoClimaDelta = 0;

  for (const fen of state.clima.fenomenos) {
    const k = fen.intensidad / 100;
    if (fen.tipo === 'sequia') {
      agroClimaFactor *= 1 - 0.5 * k;
      climaPrecioFactor *= 1 + 0.65 * k;
    } else if (fen.tipo === 'plaga') {
      agroClimaFactor *= 1 - 0.45 * k;
      climaPrecioFactor *= 1 + 0.5 * k;
    } else if (fen.tipo === 'pandemia') {
      saludClimaDelta -= 1.8 * k;
    } else if (fen.tipo === 'plaga_zombie') {
      const secMitigation = 0.3 + 0.7 * (state.gobierno.indicadores.seguridad / 100);
      saludClimaDelta -= (2.1 * k) / secMitigation;
      miedoClimaDelta += 1.6 * k;
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
  const tradeLever = pal.alimento.intercambio; // -100..100
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
    const inflFactor = mod === 'fiscal' ? 1 + state.gobierno.inflacion / 100 : 1 + SCENARIO_PRESETS[state.config.escenarioId].inflacionInicial / 100;
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

  // Weekly subsidy per capita estimate for `simple` poderAdquisitivo
  const totalPopByGroup: Record<RoleGroupId, number> = { agro: 0, industria: 0, comercio: 0, publico: 0, sin_ingreso: 0 };
  for (const n of vivos) totalPopByGroup[ROLE_CATALOG[n.rol].grupo]++;

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
    } else if (def.ingreso) {
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
      const gastoVidaPct = 0.45 - 0.15 * codicia; // greedy NPCs spend less on lifestyle
      const ahorroNeto = neto * (1 - gastoVidaPct);
      npc.economia.dinero = Math.max(0, npc.economia.dinero * (1 - inflDiaria) + ahorroNeto);

      const dineroTarget = precioAlimento * 20;
      const wealthScore = clamp((npc.economia.dinero / Math.max(1, dineroTarget)) * 65 + (neto / 18) * 30, 0, 100);
      poderAdquisitivo[npc.id] = npc.rol === 'desempleado' ? Math.min(wealthScore, 35) : wealthScore;
    }
  }

  // Administration loss on collected taxes
  const adminLoss = (1 - state.gobierno.coberturas.estatal) * ECON_CONSTANTS.perdidaAdminMax;
  const impuestosNetosDia = impuestosDia * (1 - adminLoss);

  // Accumulate into fiscal period
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

  // 5. Update NPC Variables (Hunger, Health, Fear, Satisfaction, Loyalty)
  const saludService = state.gobierno.indicadores.salud / 100;
  const segService = state.gobierno.indicadores.seguridad / 100;

  for (const npc of vivos) {
    const acceso = accesoComida[npc.id] ?? 1;
    const poder = poderAdquisitivo[npc.id] ?? 50;
    const val = getEffectiveTrait(npc, 'valentia') / 100;
    const res = getEffectiveTrait(npc, 'resiliencia') / 100;
    const reb = getEffectiveTrait(npc, 'rebeldia') / 100;
    const cod = getEffectiveTrait(npc, 'codicia') / 100;

    // Hunger
    if (acceso >= 0.98) {
      npc.variables.hambre = clamp(npc.variables.hambre - 14 * (acceso > 1.05 ? 1.2 : 1), 0, 100);
    } else {
      npc.variables.hambre = clamp(npc.variables.hambre + (1 - acceso) * 26, 0, 100);
    }

    // Health
    let saludDelta = 0.6 + saludService * 1.4;
    if (npc.variables.hambre > 75) {
      saludDelta -= ((npc.variables.hambre - 75) / 25) * 3.8;
    }
    saludDelta += saludClimaDelta * (1 - 0.35 * res);
    npc.variables.salud = clamp(npc.variables.salud + saludDelta, 0, 100);

    if (npc.variables.salud <= 0) {
      npc.vivo = false;
      npc.mapa.accion = 'fallecido';
      continue;
    }

    // Fear
    const modMiedo = getModifierDelta(npc, 'miedo') * 0.15;
    const targetMiedo = clamp(
      14 + miedoClimaDelta * 12 + (npc.variables.hambre > 60 ? 15 : 0) - segService * 18 - val * 12 + modMiedo,
      0,
      100
    );
    npc.variables.miedo = clamp(npc.variables.miedo + (targetMiedo - npc.variables.miedo) * 0.25, 0, 100);

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
    npc.variables.satisfaccion = clamp(npc.variables.satisfaccion + (targetSat - npc.variables.satisfaccion) * inertia, 0, 100);

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
            npc.variables.satisfaccion = clamp(npc.variables.satisfaccion + Math.min(12, Math.sqrt(perNpc) * 1.8), 0, 100);
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
      const targetReach = clamp(32 + Math.sqrt(fondos) * 5.2, 25, 95);
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
  // Expire finished phenomena & escalate zombies
  const remaining: ClimatePhenomenon[] = [];
  for (const fen of state.clima.fenomenos) {
    if (fen.tipo === 'plaga_zombie') {
      fen.intensidad = clamp(Number((fen.intensidad + 0.36).toFixed(1)), 10, 100);
      remaining.push(fen);
    } else if (dia < fen.inicioDia + fen.duracionDias) {
      remaining.push(fen);
    } else {
      addLog(state, 'clima', `clima:${fen.tipo}`, `Finaliza ${fen.nombre}`, 'Las condiciones climáticas regresan a la normalidad.');
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

function checkConditionTriggers(state: GameState): void {
  const derived = deriveCommunityStats(state);
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
    const elegibles = state.npcs.filter((n) => n.vivo && !n.accionIa && isNpcEligibleForAction(n, huelga));
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
    const elegibles = state.npcs.filter((n) => n.vivo && !n.accionIa && isNpcEligibleForAction(n, protesta));
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
    const elegibles = state.npcs.filter((n) => n.vivo && !n.accionIa && isNpcEligibleForAction(n, saqueo));
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

  // Clean up old resolved windows
  if (state.ventanasCondicion.length > 15) {
    state.ventanasCondicion = state.ventanasCondicion.slice(-10);
  }
}

function evaluateObjective(state: GameState): void {
  if (state.resultado.estado !== 'jugando') return;
  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const derived = deriveCommunityStats(state);

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

  // Decay modifiers & active AI actions
  for (const npc of state.npcs) {
    if (!npc.vivo) continue;
    npc.modificadores = npc.modificadores
      .map((m) => ({ ...m, diasRestantes: m.diasRestantes - 1 }))
      .filter((m) => m.diasRestantes > 0);

    if (npc.accionIa) {
      npc.accionIa.diasRestantes -= 1;
      if (npc.accionIa.diasRestantes <= 0) {
        npc.accionIa = null;
        npc.mapa.accion =
          npc.rol === 'estudiante' ? 'estudiando' : npc.rol === 'jubilado' || npc.rol === 'desempleado' ? 'paseando' : 'trabajando';
        npc.mapa.destino = getDistrictPosition(npc.rol);
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
  runDailyEconomyAndNeeds(state);

  if (state.reloj.diasEnPeriodoFiscal >= FISCAL_PERIOD_DAYS) {
    settleFiscalPeriod(state);
    state.reloj.diasEnPeriodoFiscal = 0;
    state.reloj.periodoFiscal += 1;
  }

  const derived = deriveCommunityStats(state);
  state.caosTracker.respiroActivo =
    derived.satisfaccionMedia < state.config.caos.respiroSiSatisfaccionMediaMenorA;

  checkConditionTriggers(state);
  evaluateObjective(state);

  // Record history point every day (keep up to 180 recent points)
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

export const TICKS_PER_DAY = 10;

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
  for (let i = 0; i < ticksToRun; i++) {
    if (next.resultado.estado !== 'jugando') break;
    next.reloj.tick += 1;
    stepNpcPositions(next, 1);
    if (next.reloj.tick % TICKS_PER_DAY === 0) {
      advanceDay(next);
    }
  }
  return next;
}

export function pickPressTopicAndTone(state: GameState): {
  tema: string;
  tono: NewsTone;
  origen: string;
  detalle: string;
} {
  const derived = deriveCommunityStats(state);
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
  if (state.clima.fenomenos.length > 0) {
    const fen = state.clima.fenomenos[0];
    return {
      tema: fen.tipo,
      tono: fen.intensidad > 50 ? 'alarmista' : 'critico',
      origen: `clima:${fen.tipo}`,
      detalle: `Persiste ${fen.nombre} con una intensidad del ${Math.round(fen.intensidad)}%.`,
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
