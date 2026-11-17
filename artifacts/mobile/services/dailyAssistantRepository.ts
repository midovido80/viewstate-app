import { ASSISTANT_STORAGE_KEY, AssistantError, decodeAssistant, type AssistantState } from './dailyAssistant';
export interface AssistantStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export type AssistantExclusive = <T>(work: () => Promise<T>) => Promise<T>;
/** A single writer queue per storage object; native callers share the exported singleton repository. */
const queues = new WeakMap<AssistantStorage, Promise<unknown>>();
export function createAssistantRepository(storage: AssistantStorage, exclusive?: AssistantExclusive) {
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const previous = queues.get(storage) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => exclusive ? exclusive(work) : work());
    queues.set(storage, run.catch(() => undefined)); return run;
  }
  let undo: { before: AssistantState; expectedRevision: number } | undefined;
  let uncertainWrite = false;
  async function read(): Promise<AssistantState> {
    return decodeAssistant(await storage.getItem(ASSISTANT_STORAGE_KEY));
  }
  async function write(next: AssistantState): Promise<AssistantState> {
    const raw = JSON.stringify(next); decodeAssistant(raw);
    try {
      await storage.setItem(ASSISTANT_STORAGE_KEY, raw);
      if (await storage.getItem(ASSISTANT_STORAGE_KEY) !== raw) throw new AssistantError('stale');
    } catch (error) { uncertainWrite = true; undo = undefined; throw error; }
    return next;
  }
  return {
    load: () => serialized(async () => { const value = await read(); uncertainWrite = false; undo = undefined; return value; }),
    update: (change: (value: AssistantState) => AssistantState) => serialized(async () => {
      if (uncertainWrite) throw new AssistantError('unavailable');
      const before = await read();
      const next = change(JSON.parse(JSON.stringify(before)) as AssistantState);
      const after = await write({ ...next, revision: before.revision + 1 });
      undo = { before, expectedRevision: after.revision }; return after;
    }),
    undo: () => serialized(async () => {
      if (!undo || uncertainWrite) throw new AssistantError('stale');
      const now = await read(); if (now.revision !== undo.expectedRevision) { undo = undefined; throw new AssistantError('stale'); }
      const before = undo.before;
      const next = { ...before, revision: now.revision + 1,
        tasks: before.tasks.map(t => ({ ...t, revision: Math.max(t.revision, now.tasks.find(n => n.id === t.id)?.revision ?? 0) + 1 })) };
      const saved = await write(next); undo = undefined; return saved;
    }),
    canUndo: () => !!undo && !uncertainWrite,
  };
}
