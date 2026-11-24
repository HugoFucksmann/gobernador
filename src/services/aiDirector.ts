import { ACTION_TABLE } from '../data/catalogs';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canTriggerSpontaneousChaos,
  deriveCommunityStats,
  pickChaosCandidateNpc,
  pickPressTopicAndTone,
  resolveConditionWindowWithFallback,
  selectCandidateActions,
} from '../engine/simulation';
import { GameState, NewsArticle, Npc } from '../types/game';

export interface AiDirectorResult {
  type: 'press' | 'action' | 'condition' | 'thought';
  apply: (state: GameState) => void;
  source: 'ia' | 'plantilla';
}

let aiDisabledForSession = false;

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

function buildTemplatePress(
  state: GameState,
  medioId: string,
  periodistaId: string,
  topic: ReturnType<typeof pickPressTopicAndTone>
): NewsArticle {
  const medio = state.medios.find((m) => m.id === medioId) || state.medios[0];
  const autor = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];
  const titlesByTopic: Record<string, string[]> = {
    impago: ['Cuentas en rojo: salarios públicos sin liquidar', 'Tensión en el Centro Cívico por impago estatal'],
    hambre: ['Alarma por escasez en las mesas del valle', 'Crece la preocupación por el stock de alimentos'],
    sequia: ['La sequía golpea los campos y encarece el grano', 'Productores en alerta ante la falta de lluvias'],
    plaga: ['Plaga agrícola amenaza la cosecha semanal', 'El campo exige respuestas frente al avance de la plaga'],
    pandemia: ['Aumentan las consultas por el brote sanitario', 'El sistema de salud bajo presión por contagios'],
    plaga_zombie: ['Crece la tensión en el perímetro ante el brote', 'Vecinos piden mayor presencia policial en las calles'],
    malestar_social: ['Crece el malestar vecinal frente al despacho', 'Sectores locales reclaman cambios en el rumbo económico'],
    inflacion: ['Los precios suben y erosionan el bolsillo diario', 'La emisión monetaria reaviva la escalada de precios'],
    gestion_y_clima_social: ['Clima de estabilidad acompaña la gestión local', 'Mayoría vecinal respalda el rumbo actual del municipio'],
  };
  const pool = titlesByTopic[topic.tema] || ['Crónica de la jornada en la comunidad', 'Pulso diario de la economía y los barrios'];
  const titulo = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: `n_${state.reloj.dia}_${Math.random().toString(36).slice(2, 6)}`,
    dia: state.reloj.dia,
    medioId: medio.id,
    medioNombre: medio.nombre,
    autorId: autor.id,
    autorNombre: autor.nombre,
    tema: topic.tema,
    tono: topic.tono,
    alcance: medio.alcancePct,
    titulo,
    texto: `${topic.detalle} Desde la redacción de ${medio.nombre}, ${autor.nombre} señala que el desenlace dependerá de las próximas decisiones fiscales.`,
    origen: topic.origen,
    fuente: 'plantilla',
  };
}

export function buildTemplateThought(npc: Npc, state: GameState): string {
  if (npc.accionIa) {
    return `Hoy no pienso volver a la rutina: ${npc.accionIa.texto.toLowerCase()}.`;
  }
  if (npc.variables.hambre > 70) {
    return `Lo único que me importa ahora es conseguir algo para comer; los precios están imposibles.`;
  }
  if (npc.variables.miedo > 65) {
    return `No se puede vivir tranquilo con tanta incertidumbre en las calles.`;
  }
  if (state.gobierno.finanzas.impago && npc.rol !== 'agricultor') {
    return `Si el estado no cumple con los pagos, toda la comunidad lo termina pagando.`;
  }
  if (npc.variables.satisfaccion >= 70) {
    return `El día viene tranquilo en el barrio; mientras haya trabajo y comida, vamos bien.`;
  }
  return `Sigo cumpliendo con mi tarea, aunque miro de reojo lo que decide el gobernador.`;
}

export async function requestNpcThought(
  npc: Npc,
  state: GameState
): Promise<{ texto: string; fuente: 'ia' | 'plantilla' }> {
  if (!state.config.usarIaGemini || aiDisabledForSession) {
    return { texto: buildTemplateThought(npc, state), fuente: 'plantilla' };
  }

  const derived = deriveCommunityStats(state);
  try {
    const res = await fetch('/api/ai/thought', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npc: {
          nombre: npc.nombre,
          edad: npc.edad,
          rol: npc.rol,
          personalidad: npc.personalidad,
          variables: npc.variables,
          dinero: npc.economia.dinero,
          accionActual: npc.accionIa?.texto || npc.mapa.accion,
          modificadores: npc.modificadores.slice(0, 3).map((m) => m.texto),
        },
        contexto: {
          dia: state.reloj.dia,
          resumen: `Población ${derived.poblacion}, satisfacción media ${derived.satisfaccionMedia}%, hambre crítica ${derived.hambreCriticaPct}%, inflación ${state.gobierno.inflacion}%.`,
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      return {
        texto: buildTemplateThought(npc, state),
        fuente: 'plantilla',
      };
    }

    const data = await res.json();
    if (data.pensamiento) {
      return { texto: data.pensamiento, fuente: 'ia' };
    }
    return { texto: buildTemplateThought(npc, state), fuente: 'plantilla' };
  } catch {
    return {
      texto: buildTemplateThought(npc, state),
      fuente: 'plantilla',
    };
  }
}

export async function dispatchPressJob(state: GameState): Promise<AiDirectorResult | null> {
  if (state.medios.length === 0) return null;
  const medio = state.medios[Math.floor(Math.random() * state.medios.length)];
  const periodistaId = medio.columnistas[0] || state.npcs.find((n) => n.vivo)?.id;
  if (!periodistaId) return null;
  const periodista = state.npcs.find((n) => n.id === periodistaId) || state.npcs[0];

  const topic = pickPressTopicAndTone(state);
  const derived = deriveCommunityStats(state);

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    const article = buildTemplatePress(state, medio.id, periodista.id, topic);
    return {
      type: 'press',
      source: 'plantilla',
      apply: (s) => applyPressArticleEffects(s, article),
    };
  }

  try {
    const res = await fetch('/api/ai/press', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const fallback = buildTemplatePress(state, medio.id, periodista.id, topic);
      return {
        type: 'press',
        source: 'plantilla',
        apply: (s) => applyPressArticleEffects(s, fallback),
      };
    }

    const data = await res.json();
    const article: NewsArticle = {
      id: `n_${state.reloj.dia}_${Math.random().toString(36).slice(2, 6)}`,
      dia: state.reloj.dia,
      medioId: medio.id,
      medioNombre: medio.nombre,
      autorId: periodista.id,
      autorNombre: periodista.nombre,
      tema: topic.tema,
      tono: topic.tono,
      alcance: medio.alcancePct,
      titulo: data.titulo || 'Edición del día',
      texto: data.texto || topic.detalle,
      origen: topic.origen,
      fuente: 'ia',
    };
    return {
      type: 'press',
      source: 'ia',
      apply: (s) => applyPressArticleEffects(s, article),
    };
  } catch {
    const fallback = buildTemplatePress(state, medio.id, periodista.id, topic);
    return {
      type: 'press',
      source: 'plantilla',
      apply: (s) => applyPressArticleEffects(s, fallback),
    };
  }
}

export async function dispatchSpontaneousActionJob(state: GameState): Promise<AiDirectorResult | null> {
  const gate = canTriggerSpontaneousChaos(state);
  if (!gate.allowed) return null;

  const npc = pickChaosCandidateNpc(state);
  if (!npc) return null;

  const candidatas = selectCandidateActions(npc);
  if (candidatas.length === 0) return null;

  const derived = deriveCommunityStats(state);
  const pickRandomFallback = () => {
    const chosen = candidatas[Math.floor(Math.random() * Math.min(3, candidatas.length))];
    return {
      chosen,
      texto: chosen.textoBase.replace('{nombre}', npc.nombre),
    };
  };

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    const { chosen, texto } = pickRandomFallback();
    return {
      type: 'action',
      source: 'plantilla',
      apply: (s) => {
        const target = s.npcs.find((n) => n.id === npc.id);
        if (!target || !target.vivo || target.accionIa) return;
        if (!canTriggerSpontaneousChaos(s).allowed) return;
        applyActionToNpc(s, target, chosen, texto, 'respaldo');
        s.caosTracker.accionesEnVentana += 1;
        s.bitacora.unshift({
          id: `log_act_${s.reloj.dia}_${Math.random().toString(36).slice(2, 6)}`,
          dia: s.reloj.dia,
          categoria: 'ia',
          origen: `accion:${chosen.id}/respaldo`,
          titulo: `${target.nombre}: ${chosen.nombre}`,
          detalle: texto,
        });
      },
    };
  }

  try {
    const res = await fetch('/api/ai/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npc: {
          nombre: npc.nombre,
          edad: npc.edad,
          rol: npc.rol,
          personalidad: npc.personalidad,
          variables: npc.variables,
        },
        candidatas: candidatas.map((c) => ({
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
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const { chosen, texto } = pickRandomFallback();
      return {
        type: 'action',
        source: 'plantilla',
        apply: (s) => {
          const target = s.npcs.find((n) => n.id === npc.id);
          if (!target || !target.vivo || target.accionIa) return;
          if (!canTriggerSpontaneousChaos(s).allowed) return;
          applyActionToNpc(s, target, chosen, texto, 'respaldo');
          s.caosTracker.accionesEnVentana += 1;
        },
      };
    }

    const data = await res.json();
    const chosen = candidatas.find((c) => c.id === data.accionId) || candidatas[0];
    const texto = data.texto || chosen.textoBase.replace('{nombre}', npc.nombre);

    return {
      type: 'action',
      source: 'ia',
      apply: (s) => {
        const target = s.npcs.find((n) => n.id === npc.id);
        if (!target || !target.vivo || target.accionIa) return;
        if (!canTriggerSpontaneousChaos(s).allowed) return;
        applyActionToNpc(s, target, chosen, texto, 'ia');
        s.caosTracker.accionesEnVentana += 1;
        s.bitacora.unshift({
          id: `log_act_${s.reloj.dia}_${Math.random().toString(36).slice(2, 6)}`,
          dia: s.reloj.dia,
          categoria: 'ia',
          origen: `accion:${chosen.id}/ia`,
          titulo: `${target.nombre}: ${chosen.nombre}`,
          detalle: texto,
        });
      },
    };
  } catch {
    const { chosen, texto } = pickRandomFallback();
    return {
      type: 'action',
      source: 'plantilla',
      apply: (s) => {
        const target = s.npcs.find((n) => n.id === npc.id);
        if (!target || !target.vivo || target.accionIa) return;
        if (!canTriggerSpontaneousChaos(s).allowed) return;
        applyActionToNpc(s, target, chosen, texto, 'respaldo');
        s.caosTracker.accionesEnVentana += 1;
      },
    };
  }
}

export async function dispatchConditionJob(state: GameState): Promise<AiDirectorResult | null> {
  const pending = state.ventanasCondicion.find((w) => w.estado === 'pendiente');
  if (!pending) return null;

  const affectedNpcs = state.npcs.filter((n) => pending.npcIds.includes(n.id));
  const muestra = affectedNpcs
    .slice(0, 4)
    .map((n) => `${n.nombre} (${n.rol})`)
    .join(', ');

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    const chosen = pending.candidatas[0] || ACTION_TABLE.find((a) => a.tipo === 'condicion')!;
    return {
      type: 'condition',
      source: 'plantilla',
      apply: (s) => resolveConditionWindowWithFallback(s, pending.id, chosen.id, undefined, 'respaldo'),
    };
  }

  const derived = deriveCommunityStats(state);
  try {
    const res = await fetch('/api/ai/condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disparador: pending.disparador,
        candidatas: pending.candidatas.map((c) => ({
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
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      return {
        type: 'condition',
        source: 'plantilla',
        apply: (s) => resolveConditionWindowWithFallback(s, pending.id, undefined, undefined, 'respaldo'),
      };
    }

    const data = await res.json();
    return {
      type: 'condition',
      source: 'ia',
      apply: (s) =>
        resolveConditionWindowWithFallback(s, pending.id, data.accionId, data.texto, 'ia'),
    };
  } catch {
    return {
      type: 'condition',
      source: 'plantilla',
      apply: (s) => resolveConditionWindowWithFallback(s, pending.id, undefined, undefined, 'respaldo'),
    };
  }
}
