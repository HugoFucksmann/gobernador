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

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

  app.post('/api/ai/thought', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const { npc, contexto } = req.body;
      const prompt = `Eres el motor narrativo de un juego de simulación comunitaria llamado "El Gobernador".
Genera el pensamiento interno breve (máximo 2 oraciones, en primera persona, español rioplatense/neutro natural) de este habitante según su estado real:
- Nombre: ${npc.nombre}, ${npc.edad} años, rol: ${npc.rol}
- Personalidad: valentía ${npc.personalidad.valentia}, laboriosidad ${npc.personalidad.laboriosidad}, codicia ${npc.personalidad.codicia}, rebeldía ${npc.personalidad.rebeldia}, resiliencia ${npc.personalidad.resiliencia}
- Estado actual (0-100): salud ${Math.round(npc.variables.salud)}, hambre ${Math.round(npc.variables.hambre)}, miedo ${Math.round(npc.variables.miedo)}, satisfacción ${Math.round(npc.variables.satisfaccion)}, lealtad ${Math.round(npc.variables.lealtad)}
- Dinero: ${Math.round(npc.dinero)} | Acción actual: ${npc.accionActual || 'rutina habitual'}
- Modificadores recientes: ${(npc.modificadores || []).join('; ') || 'ninguno'}
- Contexto del pueblo (Día ${contexto.dia}): ${contexto.resumen}`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pensamiento: {
                type: Type.STRING,
                description: 'Pensamiento breve en primera persona (1 o 2 oraciones).',
              },
            },
            required: ['pensamiento'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ pensamiento: parsed.pensamiento || '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al generar pensamiento';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/press', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const { medio, periodista, noticia, comunidad } = req.body;
      const prompt = `Escribe una columna breve de prensa local para el medio "${medio.nombre}".
Reglas editoriales fijadas por el motor:
- Tema obligatorio: ${noticia.tema}
- Tono obligatorio: ${noticia.tono}
- Origen del hecho: ${noticia.origen}
- Línea editorial del medio: afinidad con el gobierno ${medio.afinidad_gobierno}/100, sensacionalismo ${medio.sensacionalismo}/100, credibilidad ${medio.credibilidad}/100, regulación estatal ${medio.regulacion}/100.
- Periodista autor: ${periodista.nombre} (rebeldía ${periodista.rebeldia}/100, satisfacción ${Math.round(periodista.satisfaccion)}/100).
- Situación real del pueblo (Día ${comunidad.dia}): población ${comunidad.poblacion}, satisfacción media ${Math.round(comunidad.satisfaccion_media)}%, hambre crítica ${Math.round(comunidad.hambre_critica_pct)}%, apoyo ${Math.round(comunidad.apoyo_pct)}%, inflación ${comunidad.inflacion}%, fenómenos activos: ${comunidad.fenomenos || 'ninguno'}.
- Hecho específico: ${noticia.detalle}

Devuelve un título periodístico corto (máx 10 palabras) y un texto breve de columna (2 a 3 oraciones).`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING, description: 'Titular breve y acorde al tono.' },
              texto: { type: Type.STRING, description: 'Cuerpo breve de 2 a 3 oraciones.' },
            },
            required: ['titulo', 'texto'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        titulo: parsed.titulo || '',
        texto: parsed.texto || '',
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
      const { npc, candidatas, contexto } = req.body;
      const lista = (candidatas as Array<{ id: string; nombre: string; descripcion: string }>)
        .map((c) => `- ${c.id}: ${c.nombre} (${c.descripcion})`)
        .join('\n');

      const prompt = `Elige UNA acción espontánea de la lista para este habitante y descríbela en 1 oración vívida y graciosa o realista.
Habitante: ${npc.nombre} (${npc.edad} años, ${npc.rol}).
Personalidad: rebeldía ${npc.personalidad.rebeldia}, laboriosidad ${npc.personalidad.laboriosidad}, codicia ${npc.personalidad.codicia}, valentía ${npc.personalidad.valentia}.
Estado: satisfacción ${Math.round(npc.variables.satisfaccion)}, hambre ${Math.round(npc.variables.hambre)}, miedo ${Math.round(npc.variables.miedo)}.
Contexto: Día ${contexto.dia}, ${contexto.resumen}.

Candidatas válidas (DEBE elegir exactamente uno de estos IDs):
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
              accionId: { type: Type.STRING, description: 'ID exacto de una de las candidatas.' },
              texto: { type: Type.STRING, description: 'Narración corta en tercera persona (1 oración).' },
            },
            required: ['accionId', 'texto'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        accionId: parsed.accionId || '',
        texto: parsed.texto || '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al elegir acción de IA';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/condition', async (req, res) => {
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    }

    try {
      const { disparador, candidatas, afectados, contexto } = req.body;
      const lista = (candidatas as Array<{ id: string; nombre: string; descripcion: string }>)
        .map((c) => `- ${c.id}: ${c.nombre} (${c.descripcion})`)
        .join('\n');

      const prompt = `Se disparó una consecuencia mecánica en la comunidad (${disparador}). NO puedes evitarla. Elige cómo se expresa entre las acciones válidas y narra brevemente lo que hacen los habitantes afectados.
Afectados (${afectados.cantidad} habitantes): ${afectados.muestra}.
Contexto: Día ${contexto.dia}, ${contexto.resumen}.

Acciones de condición válidas (DEBE elegir uno de estos IDs):
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
              accionId: { type: Type.STRING, description: 'ID exacto de la acción de condición.' },
              texto: { type: Type.STRING, description: 'Crónica breve de 1 oración sobre cómo se manifiesta.' },
            },
            required: ['accionId', 'texto'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        accionId: parsed.accionId || '',
        texto: parsed.texto || '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al narrar acción de condición';
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`El Gobernador server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
