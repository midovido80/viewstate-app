import {
  createImportInbox,
  type ImportEntry,
  type ImportStorage,
} from "./importInbox";
import {
  assertImportNotCancelled,
  formImportId,
} from "./importCancellationState";
import { createFormSession, type FormSessionStorage } from "./formSession";
import { SerialTaskQueue } from "./serialTaskQueue";
import { discardUnstoredCaptureDetails } from "./propertyCaptureSave";
import {
  PROPERTY_SAVE_OPERATION_KEY,
  parsePropertySaveOperation,
} from "./propertySaveRecovery";

type Storage = ImportStorage &
  FormSessionStorage & { getAllKeys?(): Promise<readonly string[]> };
const queues = new WeakMap<object, Map<string, SerialTaskQueue>>();
async function locked<T>(
  storage: Storage,
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  let map = queues.get(storage);
  if (!map) {
    map = new Map();
    queues.set(storage, map);
  }
  let queue = map.get(id);
  if (!queue) {
    queue = new SerialTaskQueue();
    map.set(id, queue);
  }
  let result!: T;
  await queue.enqueue(async () => {
    result = await (storage.withExclusiveLock
      ? storage.withExclusiveLock("import-lifecycle:" + id, work)
      : work());
  });
  return result;
}
export function withActiveImport<T>(
  storage: Storage,
  id: string | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (!id) return work();
  return locked(storage, id, async () => {
    await assertImportNotCancelled(storage, id);
    if (
      !(await createImportInbox(storage).read()).some(
        (entry) => entry.id === id,
      )
    )
      throw Error("IMPORT_ENTRY_MISSING");
    return work();
  });
}

interface CancelOptions {
  storage: Storage;
  importId: string;
  store: {
    getProperty(id: string): Promise<unknown>;
    getRequirement(id: string): Promise<unknown>;
  };
  hasPendingSave?: (
    entry: Pick<ImportEntry, "targetId" | "targetKind" | "targetPath">,
  ) => boolean;
  clearDraft?: (
    entry: Pick<ImportEntry, "targetId" | "targetKind" | "targetPath">,
  ) => Promise<unknown>;
}
export async function cancelImport({
  storage,
  importId,
  store,
  hasPendingSave,
  clearDraft,
}: CancelOptions) {
  return locked(storage, importId, async () => {
    const inbox = createImportInbox(storage),
      journalKey =
        "@viewstate/import-cancel/v1/" + encodeURIComponent(importId);
    const raw = await storage.getItem(journalKey);
    const pending = raw
      ? (JSON.parse(raw) as {
          version: number;
          entry: Pick<ImportEntry, "targetId" | "targetKind" | "targetPath">;
          keys: string[];
        })
      : undefined;
    if (
      pending &&
      (pending.version !== 1 ||
        !pending.entry ||
        typeof pending.entry !== "object" ||
        !Array.isArray(pending.keys))
    )
      throw Error("IMPORT_CANCEL_JOURNAL_UNREADABLE");
    const entry =
      pending?.entry ??
      (await inbox.read()).find((entry) => entry.id === importId);
    if (!entry) {
      if (await inbox.isCancelled(importId)) return;
      throw Error("IMPORT_ENTRY_MISSING");
    }
    if (
      entry.targetId &&
      (await (entry.targetKind === "requirement"
        ? store.getRequirement(entry.targetId)
        : store.getProperty(entry.targetId)))
    )
      throw Error("IMPORT_ALREADY_SAVED");
    if (hasPendingSave?.(entry)) throw Error("IMPORT_SAVE_PENDING");
    if (entry.targetKind === "property" && entry.targetId) {
      const operation = await storage.getItem(PROPERTY_SAVE_OPERATION_KEY);
      if (
        operation &&
        parsePropertySaveOperation(operation).targetProperty.core.id ===
          entry.targetId
      )
        throw Error("IMPORT_SAVE_PENDING");
    }
    const prefix = "@viewstate/form-session/v1/";
    const keys = pending?.keys ?? [
      ...new Set([
        createFormSession(storage, `import-review:${importId}`).key,
        ...((await storage.getAllKeys?.()) ?? []).filter(
          (key) =>
            key.startsWith(prefix) &&
            formImportId(decodeURIComponent(key.slice(prefix.length))) ===
              importId,
        ),
      ]),
    ];
    if (
      (pending?.version !== undefined && pending.version !== 1) ||
      keys.some(
        (key) =>
          !key.startsWith(prefix) ||
          formImportId(decodeURIComponent(key.slice(prefix.length))) !==
            importId,
      )
    )
      throw Error("IMPORT_CANCEL_JOURNAL_UNREADABLE");
    const journal = JSON.stringify({
      version: 1,
      entry: {
        targetId: entry.targetId,
        targetKind: entry.targetKind,
        targetPath: entry.targetPath,
      },
      keys,
    });
    await storage.setItem(journalKey, journal);
    if ((await storage.getItem(journalKey)) !== journal)
      throw Error("IMPORT_CANCEL_UNCONFIRMED");
    await inbox.cancel(importId);
    await clearDraft?.(entry);
    if (entry.targetKind === "property" && entry.targetId)
      await discardUnstoredCaptureDetails(entry.targetId, store, {
        getItem: (key) => storage.getItem(key),
        setItem: (key, value) => storage.setItem(key, value),
        removeItem: async (key) => {
          if (storage.removeItem) await storage.removeItem(key);
          else await storage.setItem(key, "");
        },
      });
    for (const key of keys) {
      await createFormSession(
        storage,
        decodeURIComponent(key.slice(prefix.length)),
      ).clear();
    }
    if (storage.removeItem) await storage.removeItem(journalKey);
    else await storage.setItem(journalKey, "");
    if (await storage.getItem(journalKey))
      throw Error("IMPORT_CANCEL_UNCONFIRMED");
  });
}
export async function pendingImportCancellations(
  storage: Storage,
): Promise<string[]> {
  const prefix = "@viewstate/import-cancel/v1/";
  return ((await storage.getAllKeys?.()) ?? [])
    .filter((key) => key.startsWith(prefix))
    .map((key) => decodeURIComponent(key.slice(prefix.length)));
}
