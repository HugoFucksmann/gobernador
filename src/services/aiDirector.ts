import {
  ACTION_TABLE,
  DIRECTOR_CONSTANTS,
  ROLE_CATALOG,
  ZONE_IDS,
} from '../data/catalogs';
import { nextRand, nextSeqId } from '../engine/rng';
import {
  applyActionToNpc,
  applyPressArticleEffects,
  canRoleLeavePost,
  canTriggerSpontaneousChaos,
  getActivePhenomena,
  getAnnouncedPhenomena,
  hasOutOfPostEffect,
  MAX_BITACORA_ENTRIES,
  pickActionText,
  pickChaosCandidateNpc,
  planDailyPressPublications,
  PlannedPressPublication,
  resolveConditionWindowWithFallback,
  scoreActionAffinity,
  selectCandidateActions,
} from '../engine/simulation';
import {
  ActionDefinition,
  ClassifierRecord,
  GameState,
  NewsArticle,
  Npc,
  PressFact,
} from '../types/game';
import { AiStatus } from '../types/ui';

interface AiDirectorResult {
  type: 'press' | 'action' | 'condition';
  apply: (state: GameState) => boolean | void;
  source: 'ia' | 'plantilla';
  status: AiStatus;
}

interface NeutralCandidate {
  id: string;
  descripcion: string;
  action: ActionDefinition;
}

const PRESS_MAX_TITULO = 90;
const PRESS_MAX_TEXTO = 360;

const COMMON_CAPITALIZED_WORDS = new Set([
  'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Unos', 'Unas', 'De', 'Del', 'Al',
  'En', 'Con', 'Sin', 'Por', 'Para', 'Sobre', 'Entre', 'Ante', 'Desde', 'Hasta',
  'Productora', 'Alimento', 'Comercio', 'Empresa', 'Palacio', 'Municipio', 'Gobierno',
  'Estado', 'Centro', 'Cívico', 'Norte', 'Este', 'Sur', 'Oeste', 'Valle',
  'Seguridad', 'Salud', 'Obras', 'Infraestructura', 'Prensa', 'Economía',
  'Sequía', 'Plaga', 'Pandemia', 'Brote', 'Alerta', 'Impago', 'Huelga', 'Protesta', 'Saqueo',
]);

let aiDisabledForSession = false;
let lastAiLatencyMs = 0;
let lastAiCallSource: 'ia' | 'plantilla' | null = null;

export function getAiRuntimeStatus(usarIaGemini: boolean, serverAvailable: boolean): AiStatus {
  if (!usarIaGemini || !serverAvailable || aiDisabledForSession) return 'plantilla';
  if (lastAiCallSource === 'plantilla') return 'plantilla';
  if (lastAiLatencyMs > DIRECTOR_CONSTANTS.plazoClasificadorMs) return 'lenta';
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
  return lastAiLatencyMs > DIRECTOR_CONSTANTS.plazoClasificadorMs ? 'lenta' : 'activa';
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
  normalizedProbs?: Map<string, number>
): ActionDefinition {
  if (candidatas.length === 1) return candidatas[0];

  const useClassifierProbs = normalizedProbs && normalizedProbs.size > 0;
  const weights = candidatas.map((c) => {
    if (useClassifierProbs) {
      return normalizedProbs.get(c.id) ?? 0;
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

async function fetchWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function normalizeNumberToken(raw: string): string {
  return raw.replace(',', '.');
}

function collectProperTokens(src: string | undefined, target: Set<string>): void {
  if (!src) return;
  const tokens = src.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}/g) || [];
  for (const tok of tokens) {
    target.add(tok);
    target.add(tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase());
  }
}

function buildBaseProperWords(state: GameState): Set<string> {
  const words = new Set<string>(COMMON_CAPITALIZED_WORDS);
  for (const z of ZONE_IDS) collectProperTokens(z, words);
  for (const m of state.medios) collectProperTokens(m.nombre, words);
  for (const n of state.npcs) collectProperTokens(n.nombre, words);
  return words;
}

function validateGeneratedArticle(
  titulo: string,
  texto: string,
  plan: PlannedPressPublication,
  baseProperWords: Set<string>
): boolean {
  const cleanTitle = titulo.trim();
  const cleanText = texto.trim();
  if (!cleanTitle || !cleanText) return false;
  if (cleanTitle.length > PRESS_MAX_TITULO || cleanText.length > PRESS_MAX_TEXTO) return false;

  const allowedNumbers = new Set<string>();
  const collectNums = (src: string) => {
    const matches = src.match(/\d+(?:[.,]\d+)?/g) || [];
    for (const m of matches) {
      const norm = normalizeNumberToken(m);
      allowedNumbers.add(norm);
      const parsed = Number(norm);
      if (Number.isFinite(parsed)) {
        allowedNumbers.add(String(Math.round(parsed)));
        allowedNumbers.add(String(parsed));
      }
    }
  };
  collectNums(JSON.stringify(plan.fact.datos));
  collectNums(plan.medio.nombre);
  collectNums(plan.autor.nombre);
  collectNums(plan.templateTitulo);
  collectNums(plan.templateTexto);

  const generatedNums = `${cleanTitle} ${cleanText}`.match(/\d+(?:[.,]\d+)?/g) || [];
  for (const num of generatedNums) {
    const norm = normalizeNumberToken(num);
    if (!allowedNumbers.has(norm) && !allowedNumbers.has(String(Number(norm)))) {
      return false;
    }
  }

  const allowedProperWords = new Set<string>(baseProperWords);
  collectProperTokens(plan.medio.nombre, allowedProperWords);
  collectProperTokens(plan.autor.nombre, allowedProperWords);
  collectProperTokens(plan.templateTitulo, allowedProperWords);
  collectProperTokens(plan.templateTexto, allowedProperWords);
  collectProperTokens(JSON.stringify(plan.fact.datos), allowedProperWords);

  const checkTextProperNouns = (str: string): boolean => {
    const regex = /(^|[.!?¡¿]\s+|:\s+|[«"']\s*)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(str)) !== null) {
      const isSentenceStart = Boolean(m[1]) || m.index === 0;
      const word = m[2];
      if (isSentenceStart) continue;
      if (!allowedProperWords.has(word)) {
        return false;
      }
    }
    return true;
  };

  return checkTextProperNouns(cleanTitle) && checkTextProperNouns(cleanText);
}

function buildArticleFromPlan(
  plan: PlannedPressPublication,
  dia: number,
  articleId: string,
  tituloOverride?: string,
  textoOverride?: string,
  textoOrigen: 'plantilla' | 'generativo' = 'plantilla'
): NewsArticle {
  return {
    id: articleId,
    dia,
    medioId: plan.medio.id,
    medioNombre: plan.medio.nombre,
    autorId: plan.autor.id,
    autorNombre: plan.autor.nombre,
    tema: plan.fact.tema,
    tono: plan.tono,
    alcance: plan.medio.alcancePct,
    credibilidad: plan.medio.credibilidad,
    titulo: (tituloOverride || plan.templateTitulo).slice(0, PRESS_MAX_TITULO),
    texto: (textoOverride || plan.templateTexto).slice(0, PRESS_MAX_TEXTO),
    origen: plan.fact.origen,
    causa: plan.fact.causa,
    textoOrigen,
    zona: plan.zoneNorm,
    zonaOrigen: plan.zoneNorm,
    fenomenoId: plan.fact.datos.fenomenoId,
    esAviso: plan.fact.datos.esAviso,
    vigenteHastaDia: plan.fact.datos.vigenteHastaDia,
  };
}

function buildSituationFacts(state: GameState, npc?: Npc): string[] {
  const facts: string[] = [];
  const active = getActivePhenomena(state);
  const announced = getAnnouncedPhenomena(state);

  for (const fen of active) {
    if (fen.tipo === 'plaga_zombie') facts.push('plaga zombie activa');
    else if (fen.tipo === 'sequia') facts.push('sequía en curso');
    else if (fen.tipo === 'plaga') facts.push('plaga agrícola en curso');
    else if (fen.tipo === 'pandemia') facts.push('pandemia en curso');
  }
  for (const fen of announced) {
    facts.push(`aviso de ${fen.nombre.toLowerCase()}`);
  }
  if (state.gobierno.finanzas.impago) {
    facts.push('impago estatal vigente');
  }
  if (state.alimento.diasStock < 3) {
    facts.push('escasez grave de alimento');
  }
  const activeFirms = state.firmas.filter((f) => f.activa);
  if (activeFirms.some((f) => f.ultimoTramo === 'despido')) {
    facts.push('despidos recientes en empresas');
  } else if (activeFirms.some((f) => f.ultimoTramo === 'recorte')) {
    facts.push('recorte de sueldos en empresas');
  }

  if (npc) {
    if (npc.variables.hambre > 60) facts.push('hambre alta');
    const hogar = state.hogares.find((h) => h.id === npc.hogarId);
    const despPP = hogar ? hogar.despensa / Math.max(1, hogar.miembros.length) : 2;
    if (despPP < 1.5) facts.push('despensa casi vacía');
    if (npc.variables.satisfaccion < 30) facts.push('descontento personal');
    if (npc.variables.miedo > 55) facts.push('miedo elevado');
  }

  return facts.length > 0 ? facts : ['jornada normal en la comunidad'];
}

function parseClassifierWeights(
  payload: unknown,
  neutralCandidates: NeutralCandidate[]
): Map<string, number> | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const rawSource: Record<string, unknown> =
    obj.probabilidades && typeof obj.probabilidades === 'object' && !Array.isArray(obj.probabilidades)
      ? (obj.probabilidades as Record<string, unknown>)
      : obj;

  const validNeutralIds = new Set(neutralCandidates.map((c) => c.id));
  const neutralToAction = new Map(neutralCandidates.map((c) => [c.id, c.action.id]));

  const entries: Array<[string, number]> = [];
  if (Array.isArray(obj.probabilidades)) {
    for (const item of obj.probabilidades) {
      if (item && typeof item === 'object') {
        const rec = item as { id?: unknown; prob?: unknown };
        if (typeof rec.id === 'string' && typeof rec.prob === 'number') {
          entries.push([rec.id, rec.prob]);
        }
      }
    }
  } else {
    for (const [k, v] of Object.entries(rawSource)) {
      if (k === 'probabilidades') continue;
      if (typeof v === 'number') {
        entries.push([k, v]);
      }
    }
  }

  if (entries.length === 0) return null;

  const mapped = new Map<string, number>();
  let sum = 0;
  for (const [neutralId, val] of entries) {
    if (!validNeutralIds.has(neutralId)) return null;
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1) return null;
    const actionId = neutralToAction.get(neutralId)!;
    mapped.set(actionId, val);
    sum += val;
  }

  if (sum <= 0) return null;

  const normalized = new Map<string, number>();
  for (const [actionId, val] of mapped.entries()) {
    normalized.set(actionId, val / sum);
  }
  return normalized;
}

function pushClassifierRecord(state: GameState, record: ClassifierRecord): void {
  state.clasificadorRegistro.unshift(record);
  if (state.clasificadorRegistro.length > 200) {
    state.clasificadorRegistro.length = 200;
  }
}

export async function dispatchPressJob(
  state: GameState,
  options?: { allowManualFallback?: boolean; signal?: AbortSignal }
): Promise<AiDirectorResult | null> {
  if (state.medios.length === 0) return null;
  const rng = { rngState: state.rngState, idSeq: state.idSeq };

  let planningState = state;
  if (state.colaHechosDia.length === 0 && options?.allowManualFallback) {
    const manualFact: PressFact = {
      id: nextSeqId(rng, `fact_manual_${state.reloj.dia}`),
      dia: state.reloj.dia,
      tema: 'vecinos',
      relevancia: 40,
      valencia: 'neutra',
      esDelGobierno: false,
      zona: 'centro',
      origen: 'manual:edicion',
      datos: {
        zona: 'centro',
        cifra: `${Math.round(state.gobierno.reserva)}`,
      },
    };
    planningState = {
      ...state,
      colaHechosDia: [manualFact],
    };
  }

  const planned = planDailyPressPublications(planningState, rng);
  if (planned.length === 0) return null;

  const articleIds = planned.map(() => nextSeqId(rng, `n_${state.reloj.dia}`));

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    lastAiCallSource = 'plantilla';
    const articles = planned.map((plan, idx) =>
      buildArticleFromPlan(plan, state.reloj.dia, articleIds[idx])
    );
    return {
      type: 'press',
      source: 'plantilla',
      status: 'plantilla',
      apply: (s) => {
        s.rngState = rng.rngState;
        s.idSeq = Math.max(s.idSeq, rng.idSeq);
        s.colaHechosDia = [];
        for (const art of articles) {
          applyPressArticleEffects(s, art);
        }
      },
    };
  }

  const baseProperWords = buildBaseProperWords(state);

  const results = await Promise.all(
    planned.map(async (plan, idx): Promise<{ article: NewsArticle; generative: boolean; status: AiStatus } | null> => {
      const articleId = articleIds[idx];
      if (options?.signal?.aborted) return null;
      if (aiDisabledForSession) {
        return {
          article: buildArticleFromPlan(plan, state.reloj.dia, articleId),
          generative: false,
          status: 'plantilla',
        };
      }
      const reqStartedAt = Date.now();
      try {
        const res = await fetchWithTimeout(
          '/api/ai/press',
          {
            tema: plan.fact.tema,
            tono: plan.tono,
            medio: {
              nombre: plan.medio.nombre,
              afinidad_gobierno: Math.round(plan.medio.lineaEditorial.afinidadGobierno),
              sensacionalismo: Math.round(plan.medio.lineaEditorial.sensacionalismo),
              credibilidad: Math.round(plan.medio.credibilidad),
            },
            autor: plan.autor.nombre,
            datos: plan.fact.datos,
            plantilla: {
              titulo: plan.templateTitulo,
              texto: plan.templateTexto,
            },
            max_largo: {
              titulo: PRESS_MAX_TITULO,
              texto: PRESS_MAX_TEXTO,
            },
          },
          DIRECTOR_CONSTANTS.plazoGenerativoMs,
          options?.signal
        );

        if (options?.signal?.aborted) return null;

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: '' }));
          if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
          return {
            article: buildArticleFromPlan(plan, state.reloj.dia, articleId),
            generative: false,
            status: recordAiCallOutcome('plantilla', reqStartedAt),
          };
        }

        const data = await res.json();
        const titulo = typeof data.titulo === 'string' ? data.titulo.trim() : '';
        const texto = typeof data.texto === 'string' ? data.texto.trim() : '';
        if (!validateGeneratedArticle(titulo, texto, plan, baseProperWords)) {
          return {
            article: buildArticleFromPlan(plan, state.reloj.dia, articleId),
            generative: false,
            status: recordAiCallOutcome('plantilla', reqStartedAt),
          };
        }

        return {
          article: buildArticleFromPlan(plan, state.reloj.dia, articleId, titulo, texto, 'generativo'),
          generative: true,
          status: recordAiCallOutcome('ia', reqStartedAt),
        };
      } catch {
        if (options?.signal?.aborted) return null;
        return {
          article: buildArticleFromPlan(plan, state.reloj.dia, articleId),
          generative: false,
          status: recordAiCallOutcome('plantilla', reqStartedAt),
        };
      }
    })
  );

  if (options?.signal?.aborted || results.some((r) => r === null)) {
    return null;
  }

  let anyGenerative = false;
  let lastStatus: AiStatus = 'plantilla';
  const articles: NewsArticle[] = [];
  for (const item of results) {
    if (!item) continue;
    articles.push(item.article);
    if (item.generative) anyGenerative = true;
    lastStatus = item.status;
  }

  return {
    type: 'press',
    source: anyGenerative ? 'ia' : 'plantilla',
    status: lastStatus,
    apply: (s) => {
      s.rngState = rng.rngState;
      s.idSeq = Math.max(s.idSeq, rng.idSeq);
      s.colaHechosDia = [];
      for (const art of articles) {
        applyPressArticleEffects(s, art);
      }
    },
  };
}

export async function dispatchSpontaneousActionJob(
  state: GameState,
  options?: { signal?: AbortSignal }
): Promise<AiDirectorResult | null> {
  if (options?.signal?.aborted) return null;
  const gate = canTriggerSpontaneousChaos(state);
  if (!gate.allowed) return null;

  const rng = { rngState: state.rngState, idSeq: state.idSeq };
  const probeState = Object.assign({}, state, { rngState: rng.rngState });
  const npc = pickChaosCandidateNpc(probeState);
  rng.rngState = probeState.rngState;
  if (!npc) return null;

  const candidatas = selectCandidateActions(npc, probeState);
  rng.rngState = probeState.rngState;
  if (candidatas.length === 0) return null;

  const dispatchedDay = state.reloj.dia;

  const applySelectedAction = (
    s: GameState,
    chosen: ActionDefinition,
    fuente: 'clasificador' | 'motor',
    latenciaMs?: number,
    rechazada?: boolean
  ): boolean => {
    if (s.reloj.dia - dispatchedDay > 5) return false;
    const target = s.npcs.find((n) => n.id === npc.id);
    if (!target || !target.vivo || target.hospital.internado || target.accionIa) return false;
    if (!canTriggerSpontaneousChaos(s).allowed) return false;
    if (chosen.tipo === 'espontanea' && hasOutOfPostEffect(chosen) && !canRoleLeavePost(s, target.rol)) {
      return false;
    }
    const roleName = ROLE_CATALOG[target.rol].nombre.toLowerCase();
    const texto = pickActionText(chosen, target.nombre, s, roleName, target.zona);
    applyActionToNpc(s, target, chosen, texto, fuente);
    s.caosTracker.accionesEnVentana += 1;
    pushClassifierRecord(s, {
      dia: s.reloj.dia,
      npcId: target.id,
      accionId: chosen.id,
      tipo: 'espontanea',
      origen: fuente,
      latenciaMs,
      rechazada,
    });
    s.bitacora.unshift({
      id: nextSeqId(s, `log_act_${s.reloj.dia}`),
      dia: s.reloj.dia,
      categoria: 'caos',
      origen: `accion:${chosen.id}/${fuente}`,
      simEventId: (target as Npc).accionIa?.focoEventId,
      titulo: `${target.nombre}: ${chosen.nombre}`,
      detalle: texto,
    });
    if (s.bitacora.length > MAX_BITACORA_ENTRIES) s.bitacora.length = MAX_BITACORA_ENTRIES;
    return true;
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
        return applySelectedAction(s, chosen, 'motor');
      },
    };
  }

  // Shuffle candidates & map to neutral IDs c1..cn (CAOS_PRENSA §9 / MOTOR §4)
  const shuffled = shuffleArray(candidatas, rng);
  const neutralCandidates: NeutralCandidate[] = shuffled.map((action, idx) => ({
    id: `c${idx + 1}`,
    descripcion: action.descripcion,
    action,
  }));
  const situacion = buildSituationFacts(state, npc);

  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      '/api/ai/action',
      {
        npc: {
          rasgos: npc.personalidad,
          variables: npc.variables,
          rol: npc.rol,
          zona: npc.zona,
        },
        situacion,
        candidatas: neutralCandidates.map((c) => ({
          id: c.id,
          descripcion: c.descripcion,
        })),
      },
      DIRECTOR_CONSTANTS.plazoClasificadorMs,
      options?.signal
    );

    if (options?.signal?.aborted) return null;

    const latencyMs = Math.max(0, Date.now() - startedAt);
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
          return applySelectedAction(s, chosen, 'motor', latencyMs, false);
        },
      };
    }

    const data = await res.json();
    const parsedProbs = parseClassifierWeights(data, neutralCandidates);
    if (!parsedProbs) {
      const status = recordAiCallOutcome('plantilla', startedAt);
      const chosen = pickWeightedCandidate(candidatas, npc, rng);
      return {
        type: 'action',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          return applySelectedAction(s, chosen, 'motor', latencyMs, true);
        },
      };
    }

    const status = recordAiCallOutcome('ia', startedAt);
    const chosen = pickWeightedCandidate(candidatas, npc, rng, parsedProbs);

    return {
      type: 'action',
      source: 'ia',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        return applySelectedAction(s, chosen, 'clasificador', latencyMs, false);
      },
    };
  } catch {
    if (options?.signal?.aborted) return null;
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const status = recordAiCallOutcome('plantilla', startedAt);
    const chosen = pickWeightedCandidate(candidatas, npc, rng);
    return {
      type: 'action',
      source: 'plantilla',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        return applySelectedAction(s, chosen, 'motor', latencyMs, false);
      },
    };
  }
}

export async function dispatchConditionJob(
  state: GameState,
  options?: { signal?: AbortSignal }
): Promise<AiDirectorResult | null> {
  if (options?.signal?.aborted) return null;
  const pending = state.ventanasCondicion.find((w) => w.estado === 'pendiente');
  if (!pending) return null;

  const rng = { rngState: state.rngState };
  const affectedIdSet = new Set(pending.npcIds);
  const sampleParts: string[] = [];
  for (const n of state.npcs) {
    if (affectedIdSet.has(n.id)) {
      sampleParts.push(`${n.nombre} (${n.rol})`);
      if (sampleParts.length >= 4) break;
    }
  }
  const muestra = sampleParts.join(', ');
  const candidatas =
    pending.candidatas.length > 0
      ? pending.candidatas
      : [ACTION_TABLE.find((a) => a.tipo === 'condicion')!];

  const recordCond = (
    s: GameState,
    actionId: string,
    fuente: 'clasificador' | 'motor',
    latenciaMs?: number,
    rechazada?: boolean
  ) => {
    pushClassifierRecord(s, {
      dia: s.reloj.dia,
      npcId: pending.npcIds[0] || 'grupo',
      accionId: actionId,
      tipo: 'condicion',
      origen: fuente,
      latenciaMs,
      rechazada,
    });
  };

  if (!state.config.usarIaGemini || aiDisabledForSession) {
    lastAiCallSource = 'plantilla';
    const chosen = pickWeightedCandidate(candidatas, null, rng);
    return {
      type: 'condition',
      source: 'plantilla',
      status: 'plantilla',
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'motor');
        recordCond(s, chosen.id, 'motor');
      },
    };
  }

  const shuffled = shuffleArray(candidatas, rng);
  const neutralCandidates: NeutralCandidate[] = shuffled.map((action, idx) => ({
    id: `c${idx + 1}`,
    descripcion: action.descripcion,
    action,
  }));
  const situacion = buildSituationFacts(state);
  const startedAt = Date.now();

  try {
    const res = await fetchWithTimeout(
      '/api/ai/condition',
      {
        disparador: pending.disparador,
        afectados: {
          cantidad: pending.intensidadCantidad,
          muestra,
        },
        situacion,
        candidatas: neutralCandidates.map((c) => ({
          id: c.id,
          descripcion: c.descripcion,
        })),
      },
      DIRECTOR_CONSTANTS.plazoClasificadorMs,
      options?.signal
    );

    if (options?.signal?.aborted) return null;

    const latencyMs = Math.max(0, Date.now() - startedAt);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '' }));
      if (shouldDisableAi(res.status, errData.error)) aiDisabledForSession = true;
      const status = recordAiCallOutcome('plantilla', startedAt);
      const chosen = pickWeightedCandidate(candidatas, null, rng);
      return {
        type: 'condition',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'motor');
          recordCond(s, chosen.id, 'motor', latencyMs, false);
        },
      };
    }

    const data = await res.json();
    const parsedProbs = parseClassifierWeights(data, neutralCandidates);
    if (!parsedProbs) {
      const status = recordAiCallOutcome('plantilla', startedAt);
      const chosen = pickWeightedCandidate(candidatas, null, rng);
      return {
        type: 'condition',
        source: 'plantilla',
        status,
        apply: (s) => {
          s.rngState = rng.rngState;
          resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'motor');
          recordCond(s, chosen.id, 'motor', latencyMs, true);
        },
      };
    }

    const status = recordAiCallOutcome('ia', startedAt);
    const chosen = pickWeightedCandidate(candidatas, null, rng, parsedProbs);
    return {
      type: 'condition',
      source: 'ia',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'clasificador');
        recordCond(s, chosen.id, 'clasificador', latencyMs, false);
      },
    };
  } catch {
    if (options?.signal?.aborted) return null;
    const latencyMs = Math.max(0, Date.now() - startedAt);
    const status = recordAiCallOutcome('plantilla', startedAt);
    const chosen = pickWeightedCandidate(candidatas, null, rng);
    return {
      type: 'condition',
      source: 'plantilla',
      status,
      apply: (s) => {
        s.rngState = rng.rngState;
        resolveConditionWindowWithFallback(s, pending.id, chosen.id, 'motor');
        recordCond(s, chosen.id, 'motor', latencyMs, false);
      },
    };
  }
}
