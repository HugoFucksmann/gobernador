import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL = 'gemini-4-hydrogen';

let cachedAi: { apiKey: string; client: GoogleGenAI } | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (cachedAi && cachedAi.apiKey === apiKey) {
    return cachedAi.client;
  }
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedAi = { apiKey, client };
  return client;
}

function safeParseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const ai = getAIClient();
    res.json({
      ok: true,
      aiAvailable: ai !== null,
      model: MODEL,
    });
  });

  app.post('/api/ai/press', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const body = req.body ?? {};
      const tema = String(body.tema ?? body.noticia?.tema ?? 'vecinos');
      const tono = String(body.tono ?? body.noticia?.tono ?? 'neutral');
      const medio = body.medio ?? { nombre: 'Prensa Local', afinidad_gobierno: 50, sensacionalismo: 50, credibilidad: 70 };
      const autor = typeof body.autor === 'string' ? body.autor : String(body.periodista?.nombre ?? 'Redacción');
      const datos = body.datos ?? { detalle: body.noticia?.detalle ?? '' };
      const plantilla = body.plantilla ?? { titulo: '', texto: '' };
      const rawMax = body.max_largo ?? {};
      const maxTitulo = Math.max(20, Math.min(140, Math.round(Number(rawMax.titulo) || 90)));
      const maxTexto = Math.max(80, Math.min(600, Math.round(Number(rawMax.texto) || 360)));

      const prompt = `Escribe una columna breve de prensa local para el medio "${medio.nombre}".
Reglas estrictas (CAOS_PRENSA §9):
- Tema obligatorio: ${tema}
- Tono obligatorio: ${tono}
- Autor: ${autor}
- Línea editorial del medio: afinidad con el gobierno ${medio.afinidad_gobierno}/100, sensacionalismo ${medio.sensacionalismo}/100, credibilidad ${medio.credibilidad}/100.
- Datos exactos del hecho (JSON): ${JSON.stringify(datos)}
- Plantilla base (úsalá SOLO como guía de estilo): Título "${plantilla.titulo}" | Texto "${plantilla.texto}"
- PROHIBIDO inventar números o nombres propios que no aparezcan explícitamente en datos, medio, autor o plantilla.
- Largo máximo obligatorio: título <= ${maxTitulo} caracteres, texto <= ${maxTexto} caracteres.`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING, description: `Titular breve (máx ${maxTitulo} caracteres).` },
              texto: { type: Type.STRING, description: `Cuerpo breve (máx ${maxTexto} caracteres) sin inventar datos.` },
            },
            required: ['titulo', 'texto'],
          },
        },
      });

      const parsed = safeParseJsonObject(response.text);
      if (!parsed) {
        return res.status(502).json({ error: 'Respuesta inválida del modelo de prensa' });
      }
      return res.json({
        titulo: typeof parsed.titulo === 'string' ? parsed.titulo : '',
        texto: typeof parsed.texto === 'string' ? parsed.texto : '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al generar columna de prensa';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/action', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const body = req.body ?? {};
      const npc = body.npc ?? {};
      const rasgos = npc.rasgos ?? npc.personalidad ?? {};
      const variables = npc.variables ?? {};
      const situacion: string[] = Array.isArray(body.situacion)
        ? body.situacion
        : body.contexto?.resumen
        ? [String(body.contexto.resumen)]
        : [];
      const candidatas = (Array.isArray(body.candidatas) ? body.candidatas : []) as Array<{
        id: string;
        descripcion: string;
      }>;
      const lista = candidatas.map((c) => `- ${c.id}: ${c.descripcion}`).join('\n');

      const prompt = `Actúa SOLO como clasificador de probabilidades (MOTOR §4). NO generes texto narrativo.
Habitante: rol ${npc.rol ?? 'vecino'}, zona ${npc.zona ?? 'centro'}.
Rasgos: ${JSON.stringify(rasgos)}.
Variables: ${JSON.stringify(variables)}.
Situación actual: ${situacion.join('; ') || 'jornada normal'}.

Candidatas válidas (devuelve un peso entre 0 y 1 para CADA id):
${lista}`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              probabilidades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: 'ID neutro exacto de la candidata (c1, c2...).' },
                    prob: { type: Type.NUMBER, description: 'Peso entre 0 y 1.' },
                  },
                  required: ['id', 'prob'],
                },
              },
            },
            required: ['probabilidades'],
          },
        },
      });

      const parsed = safeParseJsonObject(response.text);
      if (!parsed) {
        return res.status(502).json({ error: 'Respuesta inválida del clasificador' });
      }
      const probMap: Record<string, number> = {};
      if (Array.isArray(parsed.probabilidades)) {
        for (const item of parsed.probabilidades) {
          if (item && typeof item.id === 'string' && typeof item.prob === 'number' && Number.isFinite(item.prob)) {
            probMap[item.id] = item.prob > 1 && item.prob <= 100 ? item.prob / 100 : item.prob;
          }
        }
      }
      return res.json({
        ...probMap,
        probabilidades: probMap,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al clasificar acción';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/condition', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const body = req.body ?? {};
      const disparador = String(body.disparador ?? 'descontento');
      const afectados = body.afectados ?? { cantidad: 1 };
      const situacion: string[] = Array.isArray(body.situacion)
        ? body.situacion
        : body.contexto?.resumen
        ? [String(body.contexto.resumen)]
        : [];
      const candidatas = (Array.isArray(body.candidatas) ? body.candidatas : []) as Array<{
        id: string;
        descripcion: string;
      }>;
      const lista = candidatas.map((c) => `- ${c.id}: ${c.descripcion}`).join('\n');

      const prompt = `Actúa SOLO como clasificador de probabilidades (MOTOR §4). Se disparó una acción de condición (${disparador}). NO puedes evitarla ni generar texto narrativo. Devuelve un peso entre 0 y 1 para cada id.
Afectados: ${afectados.cantidad} habitantes${afectados.muestra ? ` (${afectados.muestra})` : ''}.
Situación actual: ${situacion.join('; ') || 'tensión social'}.

Acciones de condición válidas:
${lista}`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              probabilidades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: 'ID neutro exacto de la acción de condición (c1, c2...).' },
                    prob: { type: Type.NUMBER, description: 'Peso entre 0 y 1.' },
                  },
                  required: ['id', 'prob'],
                },
              },
            },
            required: ['probabilidades'],
          },
        },
      });

      const parsed = safeParseJsonObject(response.text);
      if (!parsed) {
        return res.status(502).json({ error: 'Respuesta inválida del clasificador de condición' });
      }
      const probMap: Record<string, number> = {};
      if (Array.isArray(parsed.probabilidades)) {
        for (const item of parsed.probabilidades) {
          if (item && typeof item.id === 'string' && typeof item.prob === 'number' && Number.isFinite(item.prob)) {
            probMap[item.id] = item.prob > 1 && item.prob <= 100 ? item.prob / 100 : item.prob;
          }
        }
      }
      return res.json({
        ...probMap,
        probabilidades: probMap,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al clasificar acción de condición';
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`El Gobernador server running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer();
