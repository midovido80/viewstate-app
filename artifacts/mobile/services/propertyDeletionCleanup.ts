import type { Property } from "@workspace/property-domain";
import { ASSISTANT_STORAGE_KEY, decodeAssistant } from "./dailyAssistant";
import type { PropertyStore } from "./persistence";
import type { PersonStore } from "./people";
import type { RequirementStore } from "./requirementPersistence";
import type { createAssistantRepository } from "./dailyAssistantRepository";
import type { createMatchNoticeRepository } from "./matchNotifications";

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
const keyFor = (id: string) =>
  `@viewstate/property-delete-cleanup/v1/${encodeURIComponent(id)}`;
/** Write before deleting metadata, so interruption never loses the owned-file list. */
export async function queuePropertyDeletionCleanup(
  property: Property,
  storage: Storage,
) {
  const key = keyFor(property.core.id);
  const raw = JSON.stringify({
    version: 1,
    id: property.core.id,
    uris: [...new Set((property.attachments ?? []).map((a) => a.managedUri))],
  });
  await storage.setItem(key, raw);
  if ((await storage.getItem(key)) !== raw)
    throw new Error("DELETE_CLEANUP_WRITE_FAILED");
}
function mediaReferences(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => mediaReferences(v, result));
  else if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if ((key === "managedUri" || key === "uri") && typeof child === "string")
        result.add(child);
      else mediaReferences(child, result);
    }
  return result;
}
/** Idempotent, account-scoped cleanup; a failed file removal stays queued for next launch. */
export async function cleanupDeletedProperties(options: {
  store: PropertyStore & PersonStore & RequirementStore;
  storage: Storage;
  assistant: ReturnType<typeof createAssistantRepository>;
  notices: ReturnType<typeof createMatchNoticeRepository>;
  deleteFile(uri: string): Promise<void>;
}) {
  const { store, storage, assistant, notices } = options;
  const ids = new Set((await store.getDeletedPropertyIds?.()) ?? []);
  if (!ids.size) return;
  const current = decodeAssistant(await storage.getItem(ASSISTANT_STORAGE_KEY));
  if (
    current.tasks.some((t) => ids.has(t.propertyId)) ||
    Object.keys(current.availability).some((id) => ids.has(id))
  ) {
    await assistant.load();
    await assistant.update((state) => {
      const tasks = state.tasks.filter((t) => !ids.has(t.propertyId));
      const removedTasks = new Set(
        state.tasks.filter((t) => ids.has(t.propertyId)).map((t) => t.id),
      );
      return {
        ...state,
        tasks,
        availability: Object.fromEntries(
          Object.entries(state.availability).filter(([id]) => !ids.has(id)),
        ),
        contacts: Object.fromEntries(
          Object.entries(state.contacts).filter(
            ([, value]) => !removedTasks.has(value.taskId),
          ),
        ),
      };
    });
  }
  await notices.load();
  await notices.update((state) => ({
    ...state,
    entries: state.entries.filter((n) => !ids.has(n.propertyId)),
    seen: Object.fromEntries(
      Object.entries(state.seen).filter(([pair]) => {
        try {
          const values = JSON.parse(pair);
          return !Array.isArray(values) || !ids.has(values[1]);
        } catch {
          return true;
        }
      }),
    ),
  }));
  const references = mediaReferences([
    await store.getProperties(),
    await store.getRequirements(),
  ]);
  const inbox = await storage.getItem("@viewstate/import-inbox/v1");
  if (inbox) {
    const decoded = JSON.parse(inbox);
    // Only original inbox media is separately owned; receipt targetFiles are not originals.
    const entries = Array.isArray(decoded) ? decoded : (decoded.entries ?? []);
    mediaReferences(
      entries.map((entry: { files?: unknown }) => entry.files),
      references,
    );
  }
  for (const id of ids) {
    const key = keyFor(id),
      raw = await storage.getItem(key);
    if (!raw) continue;
    const entry = JSON.parse(raw);
    if (
      entry.version !== 1 ||
      entry.id !== id ||
      !Array.isArray(entry.uris) ||
      entry.uris.some((uri: unknown) => typeof uri !== "string")
    )
      throw new Error("DELETE_CLEANUP_DAMAGED");
    for (const uri of entry.uris as string[])
      if (!references.has(uri)) await options.deleteFile(uri);
    await storage.setItem(key, "");
    if ((await storage.getItem(key)) !== "")
      throw new Error("DELETE_CLEANUP_WRITE_FAILED");
  }
}
