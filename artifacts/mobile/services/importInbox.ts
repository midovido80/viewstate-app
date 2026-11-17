import { SerialTaskQueue } from "./serialTaskQueue";
import { sameImportText, type ImportFacts } from "./messageImport";
import type { LocalAttachment } from "./attachmentOperations";

export interface ImportEntry {
  id: string;
  createdAt: string;
  text: string;
  ocrText?: string;
  files: LocalAttachment[];
  facts?: ImportFacts;
  status: "received" | "reviewed" | "transferred";
  targetId?: string;
  targetPath?: string;
  targetKind?: "property" | "requirement";
  targetFiles?: LocalAttachment[];
  splitIds?: string[];
  mergedInto?: string;
  /** An acknowledged duplicate may intentionally describe a separate offer. */
  duplicateConfirmed?: boolean;
}
export interface ImportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  withExclusiveLock?<T>(name: string, work: () => Promise<T>): Promise<T>;
}
export function importTarget(entry: Pick<ImportEntry, "targetPath">): {
  pathname: string;
  params: Record<string, string>;
} {
  if (!entry.targetPath) throw Error("IMPORT_TARGET_MISSING");
  const value = JSON.parse(entry.targetPath);
  if (
    ![
      "/capture",
      "/capture/price",
      "/capture/studio",
      "/requirement/new",
    ].includes(value?.pathname) ||
    !value.params ||
    typeof value.params !== "object" ||
    Array.isArray(value.params) ||
    Object.values(value.params).some((v) => typeof v !== "string")
  )
    throw Error("IMPORT_TARGET_INVALID");
  return { pathname: value.pathname, params: value.params };
}
const KEY = "@viewstate/import-inbox/v1";
const queues = new WeakMap<object, SerialTaskQueue>();
const listeners = new WeakMap<object, Set<() => void>>();
function validEntry(v: any): v is ImportEntry {
  return (
    v &&
    typeof v.id === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) &&
    typeof v.createdAt === "string" &&
    typeof v.text === "string" &&
    v.text.length <= 40000 &&
    (v.ocrText === undefined ||
      (typeof v.ocrText === "string" && v.ocrText.length <= 40000)) &&
    (v.facts === undefined ||
      (v.facts &&
        Array.isArray(v.facts.areaIds) &&
        v.facts.areaIds.every((a: unknown) => typeof a === "string") &&
        Array.isArray(v.facts.warnings) &&
        v.facts.warnings.every((a: unknown) => typeof a === "string") &&
        v.facts.details &&
        typeof v.facts.details === "object" &&
        !Array.isArray(v.facts.details) &&
        Object.values(v.facts.details).every((a) => typeof a === "string"))) &&
    ["received", "reviewed", "transferred"].includes(v.status) &&
    Array.isArray(v.files) &&
    v.files.length <= 20 &&
    v.files.every(
      (f: any) =>
        typeof f.id === "string" &&
        typeof f.uri === "string" &&
        typeof f.originalName === "string" &&
        typeof f.mimeType === "string" &&
        ["image", "video", "pdf"].includes(f.kind),
    )
  );
}
/** Private account-scoped intake. Deliberately excluded from workspace cloud snapshots. */
export function createImportInbox(storage: ImportStorage) {
  if (!queues.has(storage)) queues.set(storage, new SerialTaskQueue());
  if (!listeners.has(storage)) listeners.set(storage, new Set());
  const read = async (): Promise<ImportEntry[]> => {
    const raw = await storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== 1 ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.every(validEntry)
    )
      throw Error("IMPORT_INBOX_UNREADABLE");
    return parsed.entries;
  };
  const change = async (work: (entries: ImportEntry[]) => ImportEntry[]) => {
    let result: ImportEntry[] = [];
    const commit = async () => {
      result = work(await read());
      if (!result.every(validEntry)) throw Error("IMPORT_ENTRY_INVALID");
      const raw = JSON.stringify({ version: 1, entries: result });
      await storage.setItem(KEY, raw);
      if ((await storage.getItem(KEY)) !== raw)
        throw Error("IMPORT_WRITE_UNCONFIRMED");
      listeners.get(storage)!.forEach((fn) => fn());
    };
    await queues.get(storage)!.enqueue(async () => {
      if (storage.withExclusiveLock)
        await storage.withExclusiveLock("import-inbox-v1", commit);
      else await commit();
    });
    return result;
  };
  return {
    read,
    subscribe(fn: () => void) {
      listeners.get(storage)!.add(fn);
      return () => {
        listeners.get(storage)!.delete(fn);
      };
    },
    add: (entry: ImportEntry) =>
      change((entries) =>
        entries.some((e) => e.id === entry.id) ? entries : [...entries, entry],
      ),
    update: (entry: ImportEntry) =>
      change((entries) => {
        const previous = entries.find((e) => e.id === entry.id);
        if (!previous) throw Error("IMPORT_ENTRY_MISSING");
        if (
          (previous.targetId && previous.targetId !== entry.targetId) ||
          (previous.status === "transferred" && entry.status !== "transferred")
        )
          throw Error("IMPORT_HANDOFF_CONFLICT");
        return entries.map((e) => (e.id === entry.id ? entry : e));
      }),
    remove: (id: string) =>
      change((entries) => entries.filter((e) => e.id !== id)),
    duplicates: async (entry: ImportEntry) =>
      (await read()).filter(
        (e) => e.id !== entry.id && sameImportText(e.text, entry.text),
      ),
  };
}

export function parseNativeDelivery(value: unknown): {
  id: string;
  text: string;
  files: { uri: string; name: string; mimeType: string }[];
} {
  const v = value as any;
  if (
    !v ||
    typeof v.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) ||
    typeof v.text !== "string" ||
    v.text.length > 40000 ||
    !Array.isArray(v.files) ||
    v.files.length > 20
  )
    throw Error("IMPORT_DELIVERY_INVALID");
  for (const f of v.files) {
    if (
      !f ||
      typeof f.uri !== "string" ||
      !f.uri.startsWith("file:") ||
      typeof f.name !== "string" ||
      typeof f.mimeType !== "string" ||
      !/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime)|application\/pdf)$/.test(
        f.mimeType,
      )
    )
      throw Error("IMPORT_FILE_UNSUPPORTED");
  }
  if (!v.text.trim() && !v.files.length) throw Error("IMPORT_EMPTY");
  return { id: v.id, text: v.text, files: v.files };
}
