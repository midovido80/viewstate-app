export interface FormSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}
const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
/** Local account-bound drafts only. Never business records or sync payloads. */
export function createFormSession(
  storage: FormSessionStorage,
  identity: string,
) {
  const key = "@viewstate/form-session/v1/" + encodeURIComponent(identity);
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    let map = queues.get(storage);
    if (!map) {
      map = new Map();
      queues.set(storage, map);
    }
    const task = (map.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    map.set(key, task);
    return task;
  };
  return {
    key,
    read: <T>() =>
      queue(async (): Promise<T | null> => {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
          parsed?.version !== 1 ||
          !parsed.value ||
          typeof parsed.value !== "object" ||
          Array.isArray(parsed.value)
        )
          throw Error("FORM_SESSION_UNREADABLE");
        return parsed.value as T;
      }),
    write: (value: unknown) => {
      const raw = JSON.stringify({ version: 1, value });
      return queue(async () => {
        await storage.setItem(key, raw);
        if ((await storage.getItem(key)) !== raw)
          throw Error("FORM_SESSION_UNCONFIRMED");
      });
    },
    clear: () =>
      queue(async () => {
        if (storage.removeItem) await storage.removeItem(key);
        else await storage.setItem(key, "");
        if (await storage.getItem(key))
          throw Error("FORM_SESSION_CLEAR_UNCONFIRMED");
      }),
  };
}
