import AsyncStorage from '@react-native-async-storage/async-storage';
import { Property } from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';

export const PROPERTY_ENRICHMENT_DRAFT_PREFIX = '@viewstate_property_enrichment_draft_v1:';
export interface EnrichmentStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export interface PropertyEnrichmentDraftV1 {
  version: 1; propertyCoreId: string; baseline: Property; candidate: Property; writeGeneration: number;
}
export class PropertyEnrichmentReadError extends Error {}
const writes = new SerialTaskQueue();
const key = (id: string) => `${PROPERTY_ENRICHMENT_DRAFT_PREFIX}${encodeURIComponent(id)}`;
const exact = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function parse(raw: string, id: string): PropertyEnrichmentDraftV1 {
  try {
    const value = JSON.parse(raw) as PropertyEnrichmentDraftV1;
    if (value.version !== 1 || value.propertyCoreId !== id || value.baseline?.core?.id !== id || value.candidate?.core?.id !== id || typeof value.writeGeneration !== 'number') throw new Error('shape');
    return value;
  } catch (error) { throw new PropertyEnrichmentReadError('Unreadable enrichment draft', { cause: error }); }
}
export async function loadPropertyEnrichmentDraft(id: string, storage: EnrichmentStorage = AsyncStorage) {
  const raw = await storage.getItem(key(id)); return raw === null ? null : parse(raw, id);
}
/** Writes only when the supplied expected snapshot is still current. */
export async function savePropertyEnrichmentDraft(draft: PropertyEnrichmentDraftV1, expected: PropertyEnrichmentDraftV1 | null, storage: EnrichmentStorage = AsyncStorage) {
  const snapshot = JSON.stringify(draft); let saved = false;
  await writes.enqueue(async () => {
    const current = await storage.getItem(key(draft.propertyCoreId));
    // A queued newer generation may follow an older UI closure.  It may replace
    // only this property's same-baseline evidence, never another editor's data.
    if (current !== (expected ? JSON.stringify(expected) : null)) {
      if (current === null) return;
      const existing = parse(current, draft.propertyCoreId);
      if (!exact(existing.baseline, draft.baseline) || existing.writeGeneration >= draft.writeGeneration) return;
    }
    await storage.setItem(key(draft.propertyCoreId), snapshot); saved = true;
  });
  return saved;
}
export async function flushPropertyEnrichmentDraftWrites() { await writes.flush(); }
/** Never clears a newer draft; callers invoke this only after a confirmed CAS. */
export async function clearConfirmedPropertyEnrichmentDraft(draft: PropertyEnrichmentDraftV1, storage: EnrichmentStorage = AsyncStorage) {
  let cleared = false;
  await writes.enqueue(async () => {
    const current = await storage.getItem(key(draft.propertyCoreId));
    if (current !== JSON.stringify(draft)) return;
    await storage.removeItem(key(draft.propertyCoreId)); cleared = true;
  });
  return cleared;
}
export const exactEnrichmentDraft = exact;