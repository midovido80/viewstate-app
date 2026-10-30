import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearConfirmedPropertyEnrichmentDraft,
  exactEnrichmentDraft,
  loadPropertyEnrichmentDraft,
  savePropertyEnrichmentDraft,
  type PropertyEnrichmentDraftV1,
} from '@/services/propertyEnrichmentRecovery';
import type { Property } from '@workspace/property-domain';
import type { PropertyStore } from '@/services/persistence';
import type { EnrichmentStorage } from '@/services/propertyEnrichmentRecovery';

export const CAPTURE_DETAILS_POINTER_KEY = '@viewstate_property_capture_pending_v1';
interface CaptureDetailsPointerV1 {
  version: 1;
  propertyCoreId: string;
  evidence: PropertyEnrichmentDraftV1;
}
export type CaptureDetailsRecoveryResult =
  | { status: 'none' }
  | { status: 'missing_basic'; propertyCoreId: string }
  | { status: 'complete'; propertyCoreId: string }
  | { status: 'conflict'; propertyCoreId: string; reason: string };

async function loadPointer(storage: EnrichmentStorage): Promise<CaptureDetailsPointerV1 | null> {
  const raw = await storage.getItem(CAPTURE_DETAILS_POINTER_KEY);
  if (!raw) return null;
  const pointer = JSON.parse(raw) as CaptureDetailsPointerV1;
  if (
    pointer.version !== 1
    || !pointer.propertyCoreId
    || pointer.evidence?.version !== 1
    || pointer.evidence.propertyCoreId !== pointer.propertyCoreId
    || pointer.evidence.baseline?.core?.id !== pointer.propertyCoreId
    || pointer.evidence.candidate?.core?.id !== pointer.propertyCoreId
  ) {
    throw new Error('CAPTURE_DETAILS_POINTER_UNREADABLE');
  }
  return pointer;
}

async function clearPointer(pointer: CaptureDetailsPointerV1, storage: EnrichmentStorage): Promise<boolean> {
  const current = await loadPointer(storage);
  if (!current || JSON.stringify(current) !== JSON.stringify(pointer)) return false;
  await storage.removeItem(CAPTURE_DETAILS_POINTER_KEY);
  return true;
}

async function clearEvidenceIfCurrentOrAbsent(
  evidence: PropertyEnrichmentDraftV1,
  storage: EnrichmentStorage,
): Promise<boolean> {
  const current = await loadPropertyEnrichmentDraft(evidence.propertyCoreId, storage);
  if (!current) return true;
  if (!exactEnrichmentDraft(current, evidence)) return false;
  return clearConfirmedPropertyEnrichmentDraft(evidence, storage);
}

/**
 * The visible Capture Save remains BASIC-first. Details are then committed
 * through the same durable candidate/evidence/CAS contract used by editing.
 * If the second phase fails, its evidence remains recoverable by Enrich.
 */
export async function persistCapturedDetails(
  store: Pick<PropertyStore, 'compareAndUpdate'>,
  baseline: Property,
  candidate: Property,
  storage: EnrichmentStorage = AsyncStorage,
): Promise<Property> {
  if (JSON.stringify(baseline) === JSON.stringify(candidate)) return baseline;
  const evidence = await prepareCapturedDetails(baseline, candidate, storage);
  return finalizeCapturedDetails(store, evidence!, storage);
}

export async function prepareCapturedDetails(
  baseline: Property,
  candidate: Property,
  storage: EnrichmentStorage = AsyncStorage,
): Promise<PropertyEnrichmentDraftV1 | null> {
  if (JSON.stringify(baseline) === JSON.stringify(candidate)) return null;
  const evidence: PropertyEnrichmentDraftV1 = {
    version: 1,
    propertyCoreId: baseline.core.id,
    baseline,
    candidate,
    writeGeneration: 1,
  };
  const currentPointer = await loadPointer(storage);
  if (currentPointer && (
    currentPointer.propertyCoreId !== baseline.core.id
    || !exactEnrichmentDraft(currentPointer.evidence, evidence)
  )) {
    throw new Error('CAPTURE_DETAILS_POINTER_CONFLICT');
  }
  const existing = await loadPropertyEnrichmentDraft(baseline.core.id, storage);
  if (existing && (
    !exactEnrichmentDraft(existing.baseline, baseline)
    || !exactEnrichmentDraft(existing.candidate, candidate)
  )) {
    throw new Error('CAPTURE_DETAILS_DRAFT_CONFLICT');
  }
  let createdEvidence = false;
  if (!existing) {
    if (!await savePropertyEnrichmentDraft(evidence, null, storage)) {
      throw new Error('CAPTURE_DETAILS_DRAFT_CONFLICT');
    }
    createdEvidence = true;
  }
  try {
    await storage.setItem(CAPTURE_DETAILS_POINTER_KEY, JSON.stringify({
      version: 1,
      propertyCoreId: baseline.core.id,
      evidence: existing ?? evidence,
    } satisfies CaptureDetailsPointerV1));
  } catch (error) {
    if (createdEvidence) {
      await clearConfirmedPropertyEnrichmentDraft(evidence, storage);
    }
    throw error;
  }
  return existing ?? evidence;
}

export async function loadPreparedCapturedDetails(propertyCoreId: string, storage: EnrichmentStorage = AsyncStorage) {
  return loadPropertyEnrichmentDraft(propertyCoreId, storage);
}

export async function finalizeCapturedDetails(
  store: Pick<PropertyStore, 'compareAndUpdate'>,
  evidence: PropertyEnrichmentDraftV1,
  storage: EnrichmentStorage = AsyncStorage,
): Promise<Property> {
  if (!await store.compareAndUpdate(evidence.baseline, evidence.candidate)) {
    throw new Error('CAPTURE_DETAILS_PROPERTY_CHANGED');
  }
  if (!await clearEvidenceIfCurrentOrAbsent(evidence, storage)) {
    throw new Error('CAPTURE_DETAILS_CLEANUP_FAILED');
  }
  if (!await clearPointer({
    version: 1,
    propertyCoreId: evidence.propertyCoreId,
    evidence,
  }, storage)) {
    throw new Error('CAPTURE_DETAILS_POINTER_CLEANUP_FAILED');
  }
  return evidence.candidate;
}

export async function recoverPreparedCapturedDetails(
  store: Pick<PropertyStore, 'getProperties' | 'compareAndUpdate'>,
  storage: EnrichmentStorage = AsyncStorage,
): Promise<CaptureDetailsRecoveryResult> {
  const pointer = await loadPointer(storage);
  if (!pointer) return { status: 'none' };
  const storedEvidence = await loadPropertyEnrichmentDraft(pointer.propertyCoreId, storage);
  if (storedEvidence && !exactEnrichmentDraft(storedEvidence, pointer.evidence)) {
    return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'evidence_changed' };
  }
  const evidence = pointer.evidence;
  const current = (await store.getProperties()).find(property => property.core.id === pointer.propertyCoreId);
  if (!current) return { status: 'missing_basic', propertyCoreId: pointer.propertyCoreId };
  if (exactEnrichmentDraft(current, evidence.candidate)) {
    if (!await clearEvidenceIfCurrentOrAbsent(evidence, storage)) {
      return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'evidence_cleanup_failed' };
    }
    if (!await clearPointer(pointer, storage)) {
      return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'pointer_cleanup_failed' };
    }
    return { status: 'complete', propertyCoreId: pointer.propertyCoreId };
  }
  if (!exactEnrichmentDraft(current, evidence.baseline)) {
    return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'property_changed' };
  }
  if (!await store.compareAndUpdate(evidence.baseline, evidence.candidate)) {
    return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'compare_and_update_failed' };
  }
  if (!await clearEvidenceIfCurrentOrAbsent(evidence, storage)) {
    return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'evidence_cleanup_failed' };
  }
  if (!await clearPointer(pointer, storage)) {
    return { status: 'conflict', propertyCoreId: pointer.propertyCoreId, reason: 'pointer_cleanup_failed' };
  }
  return { status: 'complete', propertyCoreId: pointer.propertyCoreId };
}