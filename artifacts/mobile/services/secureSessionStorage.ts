/** Supabase's session is sensitive. Native pieces live only in SecureStore. */
export interface SecretStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
// At most 1,600 UTF-8 bytes per chunk, including emoji and non-Latin names.
const CHUNK_SIZE = 400;
const MAX_CHUNKS = 64;
interface Manifest { version: 1; generation: string; chunks: number }
function decodeManifest(raw: string | null): Manifest | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as Manifest;
  if (value.version !== 1 || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.generation)
    || !Number.isInteger(value.chunks) || value.chunks < 1 || value.chunks > MAX_CHUNKS) throw new Error('SESSION_STORAGE_DAMAGED');
  return value;
}
/** Write chunks first, then commit a manifest. A failed write keeps the prior session. */
export function createSecureSessionStorage(source: SecretStorage, createGeneration: () => string): SecretStorage {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.catch(() => undefined).then(work);
    queue = result;
    return result;
  };
  const manifestKey = (key: string) => {
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(key)) throw new Error('INVALID_SESSION_KEY');
    return `vs_auth_${key}_manifest`;
  };
  const pieceKey = (key: string, m: Manifest, i: number) => `${manifestKey(key)}_${m.generation}_${i}`;
  const cleanup = (key: string, m: Manifest) => Promise.all(Array.from({ length: m.chunks }, (_, i) =>
    source.removeItem(pieceKey(key, m, i)).catch(() => undefined)));
  return {
    getItem: key => enqueue(async () => {
      const m = decodeManifest(await source.getItem(manifestKey(key)));
      if (!m) return null;
      const pieces = await Promise.all(Array.from({ length: m.chunks }, (_, i) => source.getItem(pieceKey(key, m, i))));
      if (pieces.some(x => x === null)) throw new Error('SESSION_STORAGE_DAMAGED');
      return pieces.join('');
    }),
    setItem: (key, value) => enqueue(async () => {
      if (value.length > MAX_CHUNKS * CHUNK_SIZE) throw new Error('SESSION_STORAGE_LIMIT');
      const old = decodeManifest(await source.getItem(manifestKey(key)));
      const characters = Array.from(value);
      const m: Manifest = { version: 1, generation: createGeneration(), chunks: Math.max(1, Math.ceil(characters.length / CHUNK_SIZE)) };
      decodeManifest(JSON.stringify(m));
      if (old?.generation === m.generation) throw new Error('SESSION_STORAGE_GENERATION_REUSED');
      try {
        for (let i = 0; i < m.chunks; i++) await source.setItem(pieceKey(key, m, i), characters.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join(''));
        await source.setItem(manifestKey(key), JSON.stringify(m));
      } catch (error) { await cleanup(key, m); throw error; }
      if (old) await cleanup(key, old);
    }),
    removeItem: key => enqueue(async () => {
      let m: Manifest | null = null;
      // Explicit sign-out can clear a damaged pointer, too. Never restore or guess it.
      try { m = decodeManifest(await source.getItem(manifestKey(key))); } catch { /* remove the pointer below */ }
      // Remove the pointer before best-effort chunk cleanup. Orphan chunks cannot restore a login.
      await source.removeItem(manifestKey(key));
      if (m) await cleanup(key, m);
    }),
  };
}
