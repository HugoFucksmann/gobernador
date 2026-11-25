import { ACTION_TABLE } from '../data/catalogs';
import { nextRand, nextSeqId } from '../engine/rng';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canRoleLeavePost,
  canTriggerSpontaneousChaos,
  deriveCommunityStats,
  hasOutOfPostEffect,
  pickActionText,
  pickChaosCandidateNpc,
  pickPressTopicAndTone,
  resolveConditionWindowWithFallback,
  scoreActionAffinity,
  selectCandidateActions,
} from '../engine/simulation';
import { ActionDefinition, GameState, NewsArticle, Npc } from '../types/game';
import { AiStatus } from '../types/ui';

export interface AiDirectorResult {
  type: 'press' | 'action' | 'condition';
  apply: (state: GameState) => void;
  source: 'ia' | 'plantilla';
  status: AiStatus;
}

interface ClassifierProbItem {
  id?: string;
  prob?: number;
}

let aiDisabledForSession = false;
let lastAiLatencyMs = 0;
let lastAiCallSource: 'ia' | 'plantilla' | null = null;

export function getAiRuntimeStatus(usarIaGemini: boolean, serverAvailable: boolean): AiStatus {
  if (!usarIaGemini || !serverAvailable || aiDisabledForSession) return 'plantilla';
  if (lastAiCallSource === 'plantilla') return 'plantilla';
  if (lastAiLatencyMs > 4500) return 'lenta';
  return 'activa';
}

export function resetAiSessionError(): void {
  aiDisabledForSession = false;
  lastAiCallSource = null;
  lastAiLatencyMs = 0;
}

function recordAiCallOutcome(source: 'ia' | 'plantilla', startedAt: number): AiStatus {
  lastAiLatencyMs = Math.max(0, Date.now() - startedAt);
  lastAiCallSource = source;
  if (source === 'plantilla') return 'plantilla';
  return lastAiLatencyMs > 4500 ? 'lenta' : 'activa';
}

function shouldDisableAi(status: number, errMessage?: string): boolean {
  if (status === 402 || status === 403 || status === 429 || status === 503) return true;
  if (!errMessage) return false;
  const lower = errMessage.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('credit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('billing') ||
    lower.includes('api_key')
  );
}

function shuffleArray<T>(items: T[], rng: { rngState: number }): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(rng) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickWeightedCandidate(
  candidatas: ActionDefinition[],
  npc: Npc | null,
  rng: { rngState: number },
  probabilidades?: ClassifierProbItem[]
): ActionDefinition {
  if (candidatas.length === 1) return candidatas[0];

  const probMap = new Map<string, number>();
  if (Array.isArray(probabilidades)) {
    for (const item of probabilidades) {
      if (item && typeof item.id === 'string' && typeof item.prob === 'number' && Number.isFinite(item.prob)) {
        probMap.set(item.id, Math.max(0, item.prob));
      }
    }
  }

  const useClassifierProbs = probMap.size > 0;
  const weights = candidatas.map((c) => {
    if (useClassifierProbs) {
      return probMap.get(c.id) ?? 0;
    }
    return npc ? scoreActionAffinity(npc, c) : 50;
  });

  const total = weights.reduce((acc, w) => acc + w, 0);
  if (total <= 0) {
    return candidatas[Math.floor(nextRand(rng) * candidatas.length)];
  }

  let r = nextRand(rng) * total;
  for (let i = 0; i < candidatas.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidatas[i];
  }
  return candidatas[candidatas.length - 1];
}

async function fetchWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildTemplatePress(
  state: GameState,
  medioId: string,
  periodistaId: string,
  topic: ReturnType<typeof pickPressTopicAndTone>,
  rng: { rngState: number; idSeq: number }
): NewsArticle {
  const medio = state.medios.find((m) => m.id === medioId) || state.medios[0];
  const autor = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];

  const titlesByKey: Record<string, string[]> = {
    'impago:alarmista': [
      'Cuentas en rojo: salarios públicos sin liquidar',
      'Tensión en el Centro Cívico por impago estatal',
      'Faltan fondos en tesorería y peligran los haberes públicos',
    ],
    'hambre:alarmista': [
      'Alarma por escasez en las mesas del valle',
      'Crece la preocupación por el stock de alimentos',
      'El hambre crítica golpea a los barrios y exige respuestas',
    ],
    'sequia:alarmista': [
      'La sequía golpea los campos y encarece el grano',
      'Productores en alerta ante la falta de lluvias',
      'Suelos resecos amenazan la cosecha de las próximas semanas',
    ],
    'sequia:critico': [
      'Persiste el déficit hídrico sobre la producción agrícola',
      'El campo acusa el impacto sostenido de la sequía',
    ],
    'plaga:alarmista': [
      'Plaga agrícola amenaza la cosecha semanal',
      'El campo exige respuestas frente al avance de la plaga',
      'Cultivos comprometidos por un brote severo en el valle',
    ],
    'plaga:critico': [
      'La plaga rural sigue presionando el precio de los víveres',
      'Preocupación en los lotes por la caída de rendimientos',
    ],
    'pandemia:alarmista': [
      'Aumentan las consultas por el brote sanitario',
      'El sistema de salud bajo presión por contagios',
      'Alerta sanitaria: crecen los ingresos en la clínica local',
    ],
    'pandemia:critico': [
      'La clínica sigue exigida por los casos en curso',
      'Vecinos reclaman refuerzos médicos ante el cuadro sanitario',
    ],
    'plaga_zombie:alarmista': [
      'Crece la tensión en el perímetro ante el brote',
      'Vecinos piden mayor presencia policial en las calles',
      'Alerta en los límites del valle por avance de la amenaza',
    ],
    'plaga_zombie:critico': [
      'Se mantiene la vigilancia sobre el perímetro afectado',
      'La comunidad sigue atenta a la defensa de los accesos',
    ],
    'malestar_social:critico': [
      'Crece el malestar vecinal frente al despacho',
      'Sectores locales reclaman cambios en el rumbo económico',
      'El descontento social gana la calle en distintos barrios',
    ],
    'inflacion:critico': [
      'Los precios suben y erosionan el bolsillo diario',
      'La emisión monetaria reaviva la escalada de precios',
      'Inquietud en el mercado por la pérdida de poder de compra',
    ],
    'gestion_y_clima_social:favorable': [
      'Clima de estabilidad acompaña la gestión local',
      'Mayoría vecinal respalda el rumbo actual del municipio',
      'Balance positivo en los barrios tras el último cierre',
    ],
    'vida_comunitaria:informativo': [
      'Movimiento inusual anima la jornada en el valle',
      'Vecinos protagonizan la nota de color de la semana',
      'Crónica barrial: postales y gestos de la comunidad',
    ],
  };

  const compositeKey = `${topic.tema}:${topic.tono}`;
  const fallbackTitles = [
    'Crónica de la jornada en la comunidad',
    'Pulso diario de la economía y los barrios',
    'Resumen de actualidad desde el centro cívico',
  ];
  const titlePool = titlesByKey[compositeKey] || titlesByKey[`${topic.tema}:alarmista`] || fallbackTitles;
  const titulo = titlePool[Math.floor(nextRand(rng) * titlePool.length)];

  const bodyVariantsByTone: Record<string, string[]> = {
    alarmista: [
      `${topic.detalle} En la redacción de ${medio.nombre}, ${autor.nombre} advierte que la situación exige medidas urgentes.`,
      `${topic.detalle} Voces consultadas por ${autor.nombre} señalan preocupación creciente si no se corrige el rumbo en los próximos días.`,
      `${topic.detalle} Según reporta ${medio.nombre}, los vecinos siguen minuto a minuto las decisiones del palacio.`,
    ],
    critico: [
      `${topic.detalle} Para ${autor.nombre} en ${medio.nombre}, el margen de maniobra del despacho se achica.`,
      `${topic.detalle} En su análisis de hoy, ${medio.nombre} remarca el desgaste acumulado en los distintos sectores.`,
      `${topic.detalle} Desde las columnas de ${medio.nombre} piden mayor claridad sobre el próximo cierre fiscal.`,
    ],
    favorable: [
      `${topic.detalle} Desde ${medio.nombre}, ${autor.nombre} destaca que la calma actual favorece la actividad diaria.`,
      `${topic.detalle} Los reportes recogidos por ${autor.nombre} reflejan confianza moderada entre productores y familias.`,
    ],
    informativo: [
      `${topic.detalle} Crónica firmada por ${autor.nombre} para la edición de hoy de ${medio.nombre}.`,
      `${topic.detalle} Así lo consigna el relevamiento cotidiano de ${medio.nombre} por las zonas del valle.`,
      `${topic.detalle} Un pantallazo de la jornada local en la pluma de ${autor.nombre}.`,
    ],
  };

  const bodyPool = bodyVariantsByTone[topic.tono] || bodyVariantsByTone.informativo;
  const texto = bodyPool[Math.floor(nextRand(rng) * bodyPool.length)];

  return {
    id: nextSeqId(rng, `n_${state.reloj.dia}`),
    dia: state.reloj.dia,
    medioId: medio.id,
    medioNombre: medio.nombre,
    autorId: autor.id,
    autorNombre: autor.nombre,
    tema: topic.tema,
    tono: topic.tono,
    alcance: medio.alcancePct,
    credibilidad: medio.credibilidad,
    titulo,
    texto,
    origen: topic.origen,
    textoOrigen: 'plantilla',
    zonaOrigen: topic.zonaOrigen,
    fenomenoId: topic.fenomenoId,
    esAviso: topic.esAviso,
    vigenteHastaDia: topic.vigenteHastaDia,
  };
}

export async function dispatchPressJob(state: GameState): Promise<AiDirectorResult | null> {
  if (state.medios.length === 0) return null;
  const rng = { rngState: state.rngState, idSeq: state.idSeq };
  const medio = state.medios[Math.floor(nextRand(rng) * state.medios.length)];
  const periodistaId = medio.columnistas[0] || state.npcs.find((n) => n.vivo)?.id;
  if (!periodistaId) return null;
  const periodista = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];

  const topic = pickPressTopicAndTone(state);
  const derived = deriveCommunityStats(state);

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    lastAiCallSource = 'plantilla';
    const article = buildTemplatePress(state, medio.id, periodista.id, topic, rng);
    return {
      type: 'press',
      source: 'plantilla',
      status: 'plantilla',
      apply: (s) => {
        s.rngState = rng.rngState;
        s.idSeq = Math.max(s.idSeq, rng.idSeq);
        applyPressArticleEffects(s, article);
      },
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      '/api/ai/press',
      {
        medio: {
          nombre: medio.nombre,
          afinidad_gobierno: Math.round(medio.lineaEditorial.afinidadGobierno),
          sensacionalismo: Math.round(medio.lineaEditorial.sensacionalismo),
          credibilidad: Math.round(medio.credibilidad),
          regulacion: Math.round(medio.intervencion.regulacion),
        },
        periodista: {
          nombre: periodista.nombre,
          rebeldia: periodista.personalidad.rebeldia,
          satisfaccion: periodista.variables.satisfaccion,
        },
        noticia: {
          tema: topic.tema,
          tono: topic.tono,
          origen: topic.origen,
          detalle: topic.detalle,
        },
        comunidad: {
          dia: state.reloj.dia,
          poblacion: derived.poblacion,
          satisfaccion_media: derived.satisfaccionMedia,
          hambre_critica_pct: derived.hambreCriticaPct,
          apoyo_pct: derived.apoyoPct,
          inflacion: state.gobierno.inflacion,
          fenomenos: state.clima.fenomenos.map((f) => `${f.nombre} (${Math.round(f.intensidad)}%)`).join(', '),
        },
      },
      15000
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const status = recordAiCallOutcome('plantilla', startedAt);
      const fallback = buildTemplatePress(state, medio.id, periodista.id, topic, rng);
      return {
        type: 'press',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          s.idSeq = Math.max(s.idSeq, rng.idSeq);
          applyPressArticleEffects(s, fallback);
        },
      };
    }

    const data = await res.json();
    const validGen = typeof data.titulo === 'string' && data.titulo.trim() && typeof data.texto === 'string' && data.texto.trim();
    if (!validGen) {
      const status = recordAiCallOutcome('plantilla', startedAt);
      const fallback = buildTemplatePress(state, medio.id, periodista.id, topic, rng);
      return {
        type: 'press',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          s.idSeq = Math.max(s.idSeq, rng.idSeq);
          applyPressArticleEffects(s, fallback);
        },
      };
    }

    const status = recordAiCallOutcome('ia', startedAt);
    const article: NewsArticle = {
      id: nextSeqId(rng, `n_${state.reloj.dia}`),
      dia: state.reloj.dia,
      medioId: medio.id,
      medioNombre: medio.nombre,
      autorId: periodista.id,
      autorNombre: periodista.nombre,
      tema: topic.tema,
      tono: topic.tono,
      alcance: medio.alcancePct,
      credibilidad: medio.credibilidad,
      titulo: data.titulo.trim(),
      texto: data.texto.trim(),
      origen: topic.origen,
      textoOrigen: 'generativo',
      zonaOrigen: topic.zonaOrigen,
      fenomenoId: topic.fenomenoId,
      esAviso: topic.esAviso,
      vigenteHastaDia: topic.vigenteHastaDia,
    };
    return {
      type: 'press',
      source: 'ia',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        s.idSeq = Math.max(s.idSeq, rng.idSeq);
        applyPressArticleEffects(s, article);
      },
    };
  } catch {
    const status = recordAiCallOutcome('plantilla', startedAt);
    const fallback = buildTemplatePress(state, medio.id, periodista.id, topic, rng);
    return {
      type: 'press',
      source: 'plantilla',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        s.idSeq = Math.max(s.idSeq, rng.idSeq);
        applyPressArticleEffects(s, fallback);
      },
    };
  }
}

export async function dispatchSpontaneousActionJob(state: GameState): Promise<AiDirectorResult | null> {
  const gate = canTriggerSpontaneousChaos(state);
  if (!gate.allowed) return null;

  const rng = { rngState: state.rngState, idSeq: state.idSeq };
  const npc = pickChaosCandidateNpc(state);
  if (!npc) return null;

  const candidatas = selectCandidateActions(npc, state);
  if (candidatas.length === 0) return null;

  const dispatchedDay = state.reloj.dia;
  const derived = deriveCommunityStats(state);

  const applySelectedAction = (
    s: GameState,
    chosen: ActionDefinition,
    fuente: 'clasificador' | 'motor'
  ) => {
    if (s.reloj.dia - dispatchedDay > 5) return;
    const target = s.npcs.find((n) => n.id === npc.id);
    if (!target || !target.vivo || target.hospital.internado || target.accionIa) return;
    if (!canTriggerSpontaneousChaos(s).allowed) return;
    if (chosen.tipo === 'espontanea' && hasOutOfPostEffect(chosen) && !canRoleLeavePost(s, target.rol)) return;
    const texto = pickActionText(chosen, target.nombre, s);
    applyActionToNpc(s, target, chosen, texto, fuente);
    s.caosTracker.accionesEnVentana += 1;
    s.bitacora.unshift({
      id: nextSeqId(s, `log_act_${s.reloj.dia}`),
      dia: s.reloj.dia,
      categoria: 'caos',
      origen: `accion:${chosen.id}/${fuente}`,
      titulo: `${target.nombre}: ${chosen.nombre}`,
      detalle: texto,
    });
    if (s.bitacora.length > 160) s.bitacora.length = 160;
  };

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    lastAiCallSource = 'plantilla';
    const chosen = pickWeightedCandidate(candidatas, npc, rng);
    return {
      type: 'action',
      source: 'plantilla',
      status: 'plantilla',
      apply: (s) => {
        s.rngState = rng.rngState;
        applySelectedAction(s, chosen, 'motor');
      },
    };
  }

  // Shuffle candidates before sending to classifier (ESTADOS §9)
  const shuffled = shuffleArray(candidatas, rng);
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      '/api/ai/action',
      {
        npc: {
          nombre: npc.nombre,
          edad: npc.edad,
          rol: npc.rol,
          personalidad: npc.personalidad,
          variables: npc.variables,
        },
        candidatas: shuffled.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          descripcion: c.descripcion,
        })),
        contexto: {
          dia: state.reloj.dia,
          resumen: `Satisfacción media ${derived.satisfaccionMedia}%, hambre crítica ${derived.hambreCriticaPct}%, fenómenos: ${
            state.clima.fenomenos.map((f) => f.nombre).join(', ') || 'ninguno'
          }`,
        },
      },
      15000
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const status = recordAiCallOutcome('plantilla', startedAt);
      const chosen = pickWeightedCandidate(candidatas, npc, rng);
      return {
        type: 'action',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          applySelectedAction(s, chosen, 'motor');
        },
      };
    }

    const data = await res.json();
    const status = recordAiCallOutcome('ia', startedAt);
    const chosen = pickWeightedCandidate(candidatas, npc, rng, data.probabilidades);

    return {
      type: 'action',
      source: 'ia',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        applySelectedAction(s, chosen, 'clasificador');
      },
    };
  } catch {
    const status = recordAiCallOutcome('plantilla', startedAt);
    const chosen = pickWeightedCandidate(candidatas, npc, rng);
    return {
      type: 'action',
      source: 'plantilla',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        applySelectedAction(s, chosen, 'motor');
      },
    };
  }
}

export async function dispatchConditionJob(state: GameState): Promise<AiDirectorResult | null> {
  const pending = state.ventanasCondicion.find((w) => w.estado === 'pendiente');
  if (!pending) return null;

  const rng = { rngState: state.rngState };
  const affectedNpcs = state.npcs.filter((n) => pending.npcIds.includes(n.id));
  const muestra = affectedNpcs
    .slice(0, 4)
    .map((n) => `${n.nombre} (${n.rol})`)
    .join(', ');

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    lastAiCallSource = 'plantilla';
    const chosen = pickWeightedCandidate(
      pending.candidatas.length > 0 ? pending.candidatas : [ACTION_TABLE.find((a) => a.tipo === 'condicion')!],
      null,
      rng
    );
    return {
      type: 'condition',
      source: 'plantilla',
      status: 'plantilla',
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'motor');
      },
    };
  }

  const shuffled = shuffleArray(pending.candidatas, rng);
  const derived = deriveCommunityStats(state);
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      '/api/ai/condition',
      {
        disparador: pending.disparador,
        candidatas: shuffled.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          descripcion: c.descripcion,
        })),
        afectados: {
          cantidad: pending.intensidadCantidad,
          muestra,
        },
        contexto: {
          dia: state.reloj.dia,
          resumen: `Satisfacción media ${derived.satisfaccionMedia}%, hambre crítica ${derived.hambreCriticaPct}%, impago: ${state.gobierno.finanzas.impago}.`,
        },
      },
      30000
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const status = recordAiCallOutcome('plantilla', startedAt);
      return {
        type: 'condition',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          resolveConditionWindowWithFallback(s, pending.id, undefined, 'motor');
        },
      };
    }

    const data = await res.json();
    const status = recordAiCallOutcome('ia', startedAt);
    const chosen = pickWeightedCandidate(pending.candidatas, null, rng, data.probabilidades);
    return {
      type: 'condition',
      source: 'ia',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'clasificador');
      },
    };
  } catch {
    const status = recordAiCallOutcome('plantilla', startedAt);
    return {
      type: 'condition',
      source: 'plantilla',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, undefined, 'motor');
      },
    };
  }
}
