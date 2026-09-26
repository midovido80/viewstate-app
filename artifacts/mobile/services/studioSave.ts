import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import {
  persistCapturedDetails,
  loadPreparedCapturedDetails,
  recoverPreparedCapturedDetails,
} from '@/services/propertyCaptureSave';
import {
  createEditDraft,
  createPropertyUpdateOperation,
  discardPropertyEditDraft,
  executePropertyUpdateRecovery,
  exactPropertyEqual,
  loadPropertyUpdateOperation,
  persistPropertyUpdateOperation,
  savePropertyEditDraft,
  type UpdateStorage,
} from '@/services/propertyUpdateRecovery';
import {
  savePersonRequirement,
  type RequirementSaveOutcome,
  type RequirementSaveStore,
} from '@/services/requirementSaveOutcome';
import type { PropertyStore } from '@/services/persistence';
import type { Person } from '@/services/people';

export interface StudioRequirementStore extends RequirementSaveStore {
  getPerson(id: string): Promise<Person | null>;
}

export interface StudioPropertyStore extends Pick<
  PropertyStore,
  'saveProperty' | 'getProperty' | 'getProperties' | 'compareAndUpdate'
> {}

export type StudioPropertySaveResult =
  | { readonly status: 'saved'; readonly property: Property }
  | { readonly status: 'saved_readback_failed'; readonly propertyId: string }
  | { readonly status: 'recovery_required'; readonly propertyId: string; readonly reason: string }
  | { readonly status: 'conflict'; readonly propertyId: string }
  | { readonly status: 'storage_failure'; readonly propertyId: string; readonly retryAllowed: boolean };

export type StudioRequirementSaveResult = RequirementSaveOutcome;

export function basicStudioProperty(property: Property): Property {
  return { core: property.core, activeOffer: property.activeOffer };
}

/** Preserve edit-only metadata while keeping legacy top-level area canonical. */
export function prepareStudioPropertyEditCandidate(
  baseline: Property,
  candidate: Property,
): Property {
  const details = { ...((baseline.typeDetails ?? {}) as Record<string, unknown>) };
  for (const key of [
    'propertyType', 'apartmentSubtype', 'studioRoomCount', 'builtUpAreaSquareMeters',
    'bathroomCount', 'floorNumber', 'hasKitchen', 'hasHall', 'hasParking',
    'hasBalcony', 'hasElevator',
  ]) delete details[key];
  Object.assign(details, candidate.typeDetails ?? {});
  const locationEnrichment = { ...(baseline.locationEnrichment ?? {}) };
  delete locationEnrichment.mapsLink;
  if (candidate.locationEnrichment?.mapsLink) {
    locationEnrichment.mapsLink = candidate.locationEnrichment.mapsLink;
  }
  const core = { ...baseline.core, ...candidate.core };
  if (!candidate.core.description) delete (core as { description?: Property['core']['description'] }).description;
  const hasCanonicalTopLevelArea = baseline.areaSquareMeters !== undefined;
  if (hasCanonicalTopLevelArea) delete details.builtUpAreaSquareMeters;
  const merged: Property = {
    ...baseline,
    ...candidate,
    core,
    activeOffer: candidate.activeOffer,
    typeDetails: Object.keys(details).length ? details as unknown as Property['typeDetails'] : undefined,
    ...(Object.keys(locationEnrichment).length ? { locationEnrichment } : {}),
    ...(!Object.keys(locationEnrichment).length ? { locationEnrichment: undefined } : {}),
  };
  if (hasCanonicalTopLevelArea) {
    const area = ((candidate.typeDetails ?? {}) as Record<string, unknown>).builtUpAreaSquareMeters;
    const mutable = merged as unknown as { areaSquareMeters?: number; areaUnit?: 'square_meter' | 'square_foot' };
    if (typeof area !== 'number') {
      delete mutable.areaSquareMeters;
      delete mutable.areaUnit;
    } else {
      mutable.areaSquareMeters = area;
      mutable.areaUnit = 'square_meter';
    }
  }
  return merged;
}

/**
 * New Studio offers use the established BASIC-first capture contract. A
 * rejected write is always resolved by its exact ID before any retry is
 * enabled; details are then committed through the existing evidence/CAS path.
 */
export async function saveStudioProperty(options: {
  readonly candidate: Property;
  readonly baseline?: Property | null;
  readonly store: StudioPropertyStore;
  readonly storage?: UpdateStorage;
}): Promise<StudioPropertySaveResult> {
  const { candidate, baseline = null, store } = options;
  const storage = options.storage ?? AsyncStorage;
  const id = candidate.core.id;

  if (baseline) {
    if (baseline.core.id !== id) return { status: 'conflict', propertyId: id };
    return saveStudioPropertyEdit({ candidate, baseline, store, storage });
  }

  const basic = basicStudioProperty(candidate);
  let current: Property | null;
  try {
    current = await store.getProperty(id);
  } catch {
    return { status: 'storage_failure', propertyId: id, retryAllowed: false };
  }
  if (current && !exactPropertyEqual(current, basic) && !exactPropertyEqual(current, candidate)) {
    return { status: 'conflict', propertyId: id };
  }

  if (!current) {
    try {
      await store.saveProperty(basic);
    } catch {
      // saveProperty is idempotent only for the exact same value. Resolve a
      // rejected commit by exact-ID readback before allowing another write.
      try {
        current = await store.getProperty(id);
      } catch {
        return { status: 'storage_failure', propertyId: id, retryAllowed: false };
      }
      if (!current) return { status: 'storage_failure', propertyId: id, retryAllowed: true };
      if (!exactPropertyEqual(current, basic) && !exactPropertyEqual(current, candidate)) {
        return { status: 'conflict', propertyId: id };
      }
    }
  }

  try {
    current = await store.getProperty(id);
  } catch {
    return { status: 'saved_readback_failed', propertyId: id };
  }
  if (!current) return { status: 'saved_readback_failed', propertyId: id };
  if (exactPropertyEqual(current, candidate)) return { status: 'saved', property: current };
  if (!exactPropertyEqual(current, basic)) return { status: 'conflict', propertyId: id };

  try {
    const saved = await persistCapturedDetails(store, basic, candidate, storage);
    const readback = await store.getProperty(id);
    if (!readback || !exactPropertyEqual(readback, saved) || !exactPropertyEqual(readback, candidate)) {
      return { status: 'saved_readback_failed', propertyId: id };
    }
    return { status: 'saved', property: readback };
  } catch {
    // The durable details pointer lets the explicit retry finish only this
    // exact candidate without issuing another BASIC insert.
    return { status: 'recovery_required', propertyId: id, reason: 'details_pending' };
  }
}

async function saveStudioPropertyEdit(options: {
  readonly candidate: Property;
  readonly baseline: Property;
  readonly store: StudioPropertyStore;
  readonly storage: UpdateStorage;
}): Promise<StudioPropertySaveResult> {
  const { candidate, baseline, store, storage } = options;
  const id = baseline.core.id;
  let newlyPreparedDraft: ReturnType<typeof createEditDraft> | null = null;
  try {
    let operation = await loadPropertyUpdateOperation(storage);
    if (operation) {
      if (!exactPropertyEqual(operation.baseline, baseline)
        || !exactPropertyEqual(operation.candidate, candidate)) {
        return { status: 'recovery_required', propertyId: id, reason: 'another_update_pending' };
      }
    } else {
      const draft = createEditDraft(baseline);
      if (!await savePropertyEditDraft(draft, null, storage)) {
        return { status: 'recovery_required', propertyId: id, reason: 'edit_draft_conflict' };
      }
      newlyPreparedDraft = draft;
      operation = createPropertyUpdateOperation({
        operationId: `${id}:studio:${Date.now()}`,
        baseline,
        candidate,
        draftSnapshot: draft,
        preparedAt: new Date().toISOString(),
      });
      await persistPropertyUpdateOperation(operation, storage);
    }
    const outcome = await executePropertyUpdateRecovery({
      operation,
      allowUpdate: true,
      getProperty: propertyId => store.getProperty(propertyId),
      compareAndUpdate: (expected, replacement) => store.compareAndUpdate(expected, replacement),
      storage,
    });
    if (outcome.status === 'complete') {
      const readback = await store.getProperty(id);
      if (!readback || !exactPropertyEqual(readback, candidate)) {
        return { status: 'saved_readback_failed', propertyId: id };
      }
      return { status: 'saved', property: readback };
    }
    if (outcome.status === 'conflict') return { status: 'conflict', propertyId: id };
    return {
      status: 'recovery_required',
      propertyId: id,
      reason: outcome.status,
    };
  } catch {
    try {
      const pending = await loadPropertyUpdateOperation(storage);
      if (!pending && newlyPreparedDraft) {
        await discardPropertyEditDraft(id, newlyPreparedDraft, storage);
      }
    } catch {
      // Preserve unreadable or uncertain evidence and keep edits blocked.
    }
    return { status: 'recovery_required', propertyId: id, reason: 'update_operation_pending' };
  }
}

/** Retry only the durable offered-property recovery; it never changes IDs. */
export async function retryStudioPropertyRecovery(options: {
  readonly propertyId: string;
  readonly candidate: Property;
  readonly baseline: Property | null;
  readonly store: StudioPropertyStore;
  readonly storage?: UpdateStorage;
}): Promise<StudioPropertySaveResult> {
  const storage = options.storage ?? AsyncStorage;
  const { propertyId, store } = options;
  try {
    const operation = await loadPropertyUpdateOperation(storage);
    if (operation) {
      if (
        !options.baseline
        || options.baseline.core.id !== propertyId
        || operation.baseline.core.id !== propertyId
        || !exactPropertyEqual(operation.baseline, options.baseline)
        || !exactPropertyEqual(operation.candidate, options.candidate)
      ) {
        return { status: 'recovery_required', propertyId, reason: 'pending_operation_mismatch' };
      }
      const result = await executePropertyUpdateRecovery({
        operation,
        allowUpdate: true,
        getProperty: id => store.getProperty(id),
        compareAndUpdate: (baseline, candidate) => store.compareAndUpdate(baseline, candidate),
        storage,
      });
      if (result.status === 'complete') {
        const property = await store.getProperty(propertyId);
        return property && exactPropertyEqual(property, operation.candidate)
          ? { status: 'saved', property }
          : { status: 'saved_readback_failed', propertyId };
      }
      return result.status === 'conflict'
        ? { status: 'conflict', propertyId }
        : { status: 'recovery_required', propertyId, reason: result.status };
    }

    if (options.baseline) {
      const current = await store.getProperty(propertyId);
      return current && exactPropertyEqual(current, options.candidate)
        ? { status: 'saved', property: current }
        : { status: 'recovery_required', propertyId, reason: 'missing_update_operation' };
    }

    const prepared = await loadPreparedCapturedDetails(propertyId, storage);
    if (prepared && (
      !exactPropertyEqual(prepared.baseline, basicStudioProperty(options.candidate))
      || !exactPropertyEqual(prepared.candidate, options.candidate)
    )) {
      return { status: 'recovery_required', propertyId, reason: 'capture_candidate_mismatch' };
    }
    const pending = await recoverPreparedCapturedDetails(store, storage);
    if (pending.status !== 'none' && pending.propertyCoreId !== propertyId) {
      return { status: 'recovery_required', propertyId, reason: 'another_capture_pending' };
    }
    if (pending.status === 'complete' && pending.propertyCoreId === propertyId) {
      const property = await store.getProperty(propertyId);
      return property && exactPropertyEqual(property, options.candidate)
        ? { status: 'saved', property }
        : { status: 'recovery_required', propertyId, reason: 'candidate_mismatch' };
    }
    if (pending.status === 'conflict' || pending.status === 'missing_basic') {
      return { status: 'conflict', propertyId };
    }
    const current = await store.getProperty(propertyId);
    if (!current) return { status: 'saved_readback_failed', propertyId };
    if (exactPropertyEqual(current, options.candidate)) {
      return { status: 'saved', property: current };
    }
    if (
      exactPropertyEqual(current, basicStudioProperty(options.candidate))
    ) {
      const saved = await persistCapturedDetails(store, current, options.candidate, storage);
      const readback = await store.getProperty(propertyId);
      return readback && exactPropertyEqual(readback, saved)
        ? { status: 'saved', property: readback }
        : { status: 'saved_readback_failed', propertyId };
    }
    return { status: 'storage_failure', propertyId, retryAllowed: false };
  } catch {
    return { status: 'storage_failure', propertyId, retryAllowed: false };
  }
}

/** Verifies the referenced real Person exists before saving. */
export async function saveStudioRequirement(options: {
  readonly candidate: SeekerRequirement;
  readonly baseline: SeekerRequirement | null;
  readonly store: StudioRequirementStore;
  readonly navigate: () => void | Promise<void>;
}): Promise<StudioRequirementSaveResult> {
  try {
    const person = await options.store.getPerson(options.candidate.seekerId);
    if (!person) return { status: 'missing_person' };
  } catch {
    return { status: 'storage_failure', retryAllowed: false };
  }
  return savePersonRequirement(options);
}