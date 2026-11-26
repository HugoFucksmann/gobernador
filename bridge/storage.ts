// localStorage mínimo respaldado por archivos (.json.gz, escritura atómica en segundo plano).
// El motor guarda con window.localStorage; en el proceso local de la fase 1 lo reemplazamos por esto
// sin tocar el motor (MOTOR §3: un archivo por guardado, JSON versionado y comprimido).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export function installFileStorage(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const cache = new Map<string, string>();
  const file = (key: string) => path.join(dir, `${key}.json.gz`);
  const pending = new Map<string, string>();
  let writing = false;

  const flush = async () => {
    if (writing) return;
    writing = true;
    try {
      while (pending.size > 0) {
        const [key, value] = pending.entries().next().value as [string, string];
        pending.delete(key);
        const tmp = file(key) + '.tmp';
        const buf = await new Promise<Buffer>((res, rej) => zlib.gzip(Buffer.from(value, 'utf8'), (e, b) => (e ? rej(e) : res(b))));
        await fs.promises.writeFile(tmp, buf);
        await fs.promises.rename(tmp, file(key));
      }
    } catch (e) {
      console.error('[guardado] error', e);
    } finally {
      writing = false;
    }
  };

  const storage = {
    getItem(key: string): string | null {
      if (cache.has(key)) return cache.get(key)!;
      try {
        const raw = zlib.gunzipSync(fs.readFileSync(file(key))).toString('utf8');
        cache.set(key, raw);
        return raw;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      cache.set(key, value);
      pending.set(key, value);
      void flush();
    },
    removeItem(key: string): void {
      cache.delete(key);
      try { fs.unlinkSync(file(key)); } catch { /* nada */ }
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
}
