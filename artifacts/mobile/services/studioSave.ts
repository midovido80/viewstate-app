import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import {
  validateSeekerRequirement,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  validateProperty,
  type RequirementValidationIssue,
} from '@workspace/property-domain';
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
  requirementsEquivalent,
  type RequirementSaveOutcome,
  type RequirementSaveStore,
} from '@/services/requirementSaveOutcome';
import type { PropertyStore } from '@/services/persistence';
import {
  PROPERTY_SOURCE_ROLES,
  type Person,
  type PersonStore,
  type PropertySource,
  type PropertySourceRole,
} from '@/services/people';
import { getAreaById } from '@/constants/kuwait-areas';

export interface StudioRequirementStore extends RequirementSaveStore {
  getPerson(id: string): Promise<Person | null>;
}

export interface StudioPropertyStore extends Pick<
  PropertyStore,
  'saveProperty' | 'getProperty' | 'getProperties' | 'compareAndUpdate'
> {}

export interface StudioPropertySourceStore extends Pick<
  PersonStore,
  'getPerson' | 'getPropertySource' | 'getLinksForProperty' | 'linkPersonToProperty' | 'setPropertySource'
> {}

export interface StudioPersonSourceContext {
  readonly personId: string;
  readonly role: PropertySourceRole;
}

export function getStudioPersonSourceRole(
  person: Person,
  requestedRole?: string,
): PropertySourceRole | null {
  const eligibleRoles = person.classifications.filter((classification): classification is PropertySourceRole =>
    PROPERTY_SOURCE_ROLES.includes(classification as PropertySourceRole));
  if (requestedRole !== undefined) {
    return PROPERTY_SOURCE_ROLES.includes(requestedRole as PropertySourceRole)
      ? requestedRole as PropertySourceRole
      : null;
  }
  return eligibleRoles.length === 1 ? eligibleRoles[0] : null;
}

/** Resolve the exact Person and source role before a Person-origin Property write. */
export async function resolveStudioPersonSourceContext(
  personId: string,
  requestedRole: string | undefined,
  store: Pick<StudioPropertySourceStore, 'getPerson'>,
): Promise<StudioPersonSourceContext> {
  const person = await store.getPerson(personId);
  if (!person || person.id !== personId) throw new Error('STUDIO_SOURCE_PERSON_NOT_FOUND');
  const role = getStudioPersonSourceRole(person, requestedRole);
  if (!role) throw new Error('STUDIO_SOURCE_ROLE_NOT_AVAILABLE');
  return { personId: person.id, role };
}

/** Idempotently keep one source relation and one Person-property link for a saved Studio. */
export async function ensureStudioPropertySourceLink(
  propertyCoreId: string,
  personId: string,
  role: PropertySourceRole,
  store: StudioPropertySourceStore,
): Promise<void> {
  const [person, source, links] = await Promise.all([
    store.getPerson(personId),
    store.getPropertySource(propertyCoreId),
    store.getLinksForProperty(propertyCoreId),
  ]);
  if (!person) throw new Error('STUDIO_SOURCE_PERSON_NOT_FOUND');
  if (source && source.personId !== personId) throw new Error('STUDIO_SOURCE_PERSON_CONFLICT');
  const existingLinks = links.filter(link => link.personId === personId);
  if (existingLinks.length > 1) throw new Error('STUDIO_SOURCE_DUPLICATE_PERSON_PROPERTY_LINK');
  const alreadyLinked = existingLinks.length === 1;
  const alreadySourced = source?.personId === personId && source.role === role;
  if (!alreadyLinked) {
    try {
      await store.linkPersonToProperty({ personId, propertyCoreId });
    } catch (error) {
      // A rejected write may have committed. Confirm the exact relation before
      // allowing a caller to retry the same Person/property pair.
      const readback = await store.getLinksForProperty(propertyCoreId);
      const exactLinks = readback.filter(link => link.personId === personId);
      if (exactLinks.length !== 1) throw error;
    }
  }
  if (!alreadySourced) {
    try {
      await store.setPropertySource({ propertyCoreId, personId, role } satisfies PropertySource);
    } catch (error) {
      const readback = await store.getPropertySource(propertyCoreId);
      if (readback?.personId !== personId || readback.role !== role) throw error;
    }
  }

  const [readbackSource, readbackLinks] = await Promise.all([
    store.getPropertySource(propertyCoreId),
    store.getLinksForProperty(propertyCoreId),
  ]);
  const exactReadbackLinks = readbackLinks.filter(link => link.personId === personId);
  if (readbackSource?.personId !== personId || readbackSource.role !== role
    || exactReadbackLinks.length !== 1) {
    throw new Error('STUDIO_SOURCE_LINK_READBACK_FAILED');
  }
}

export type StudioPropertySaveResult =
  | { readonly status: 'saved'; readonly property: Property }
  | { readonly status: 'saved_readback_failed'; readonly propertyId: string }
  | { readonly status: 'recovery_required'; readonly propertyId: string; readonly reason: string }
  | { readonly status: 'conflict'; readonly propertyId: string }
  | { readonly status: 'storage_failure'; readonly propertyId: string; readonly retryAllowed: boolean };

/** Source validation runs before saveStudioProperty can persist any candidate. */
export async function saveStudioPropertyFromPersonSource(options: {
  readonly candidate: Property;
  readonly baseline?: Property | null;
  readonly store: StudioPropertyStore & StudioPropertySourceStore;
  readonly personId: string;
  readonly requestedRole?: string;
  readonly storage?: UpdateStorage;
}): Promise<{
  readonly outcome: StudioPropertySaveResult;
  readonly sourceContext: StudioPersonSourceContext;
}> {
  const sourceContext = await resolveStudioPersonSourceContext(
    options.personId,
    options.requestedRole,
    options.store,
  );
  const outcome = await saveStudioProperty(options);
  return { outcome, sourceContext };
}

export type StudioRequirementSaveResult =
  | Exclude<RequirementSaveOutcome, { readonly status: 'saved' }>
  | { readonly status: 'saved'; readonly requirement: SeekerRequirement }
  | { readonly status: 'invalid_requirement'; readonly issue?: RequirementValidationIssue };

export function basicStudioProperty(property: Property): Property {
  return { core: property.core, activeOffer: property.activeOffer };
}

function studioTypeDetailsRecord(
  typeDetails: Property['typeDetails'],
): Record<string, unknown> {
  return typeDetails ? Object.fromEntries(Object.entries(typeDetails)) : {};
}

function studioCompatibleTypeDetails(property: Property): Property {
  if (!property.typeDetails) return property;
  const details = studioTypeDetailsRecord(property.typeDetails);
  for (const key of Object.keys(details)) {
    if (
      PROPERTY_DETAIL_FIELD_DEFINITIONS.some(definition => definition.field === key)
      && !PROPERTY_DETAIL_FIELD_DEFINITIONS.some(
        definition => definition.field === key && definition.appliesTo.includes('apartment'),
      )
    ) delete details[key];
  }
  return {
    ...property,
    typeDetails: Object.keys(details).length
      ? details as unknown as Property['typeDetails']
      : undefined,
  };
}

/** Preserve edit-only metadata while keeping legacy top-level area canonical. */
export function prepareStudioPropertyEditCandidate(
  baseline: Property,
  candidate: Property,
): Property {
  const compatibleBaseline = studioCompatibleTypeDetails(baseline);
  const details = studioTypeDetailsRecord(compatibleBaseline.typeDetails);
  const studioCompatibleFields = new Set(
    PROPERTY_DETAIL_FIELD_DEFINITIONS
      .filter(definition => definition.appliesTo.includes('apartment'))
      .map(definition => definition.field),
  );
  for (const key of [
    'propertyType', 'apartmentSubtype', 'studioRoomCount', 'builtUpAreaSquareMeters',
    'bathroomCount', 'floorNumber', 'hasKitchen', 'hasHall', 'hasParking',
    'hasBalcony', 'hasElevator',
  ]) delete details[key];
  for (const [key, value] of Object.entries(candidate.typeDetails ?? {})) {
    if (
      key === 'propertyType'
      || !PROPERTY_DETAIL_FIELD_DEFINITIONS.some(definition => definition.field === key)
      || studioCompatibleFields.has(key as typeof PROPERTY_DETAIL_FIELD_DEFINITIONS[number]['field'])
    ) details[key] = value;
  }
  const locationEnrichment = { ...(compatibleBaseline.locationEnrichment ?? {}) };
  delete locationEnrichment.mapsLink;
  if (candidate.locationEnrichment?.mapsLink) {
    locationEnrichment.mapsLink = candidate.locationEnrichment.mapsLink;
  }
  const core = { ...compatibleBaseline.core, ...candidate.core };
  if (!candidate.core.description) delete (core as { description?: Property['core']['description'] }).description;
  if (!candidate.core.privateNotes) delete (core as { privateNotes?: Property['core']['privateNotes'] }).privateNotes;
  const hasCanonicalTopLevelArea = compatibleBaseline.areaSquareMeters !== undefined;
  if (hasCanonicalTopLevelArea) delete details.builtUpAreaSquareMeters;
  const merged: Property = {
    ...compatibleBaseline,
    ...candidate,
    core,
    activeOffer: candidate.activeOffer,
    typeDetails: Object.keys(details).length ? details as unknown as Property['typeDetails'] : undefined,
    ...(Object.keys(locationEnrichment).length ? { locationEnrichment } : {}),
    ...(!Object.keys(locationEnrichment).length ? { locationEnrichment: undefined } : {}),
  };
  if (hasCanonicalTopLevelArea) {
    const area = studioTypeDetailsRecord(candidate.typeDetails).builtUpAreaSquareMeters;
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
  if (!validateProperty(candidate).ok) return { status: 'conflict', propertyId: id };
  let newlyPreparedDraft: ReturnType<typeof createEditDraft> | null = null;
  try {
    let operation = await loadPropertyUpdateOperation(storage);
    if (operation) {
      if (!exactPropertyEqual(operation.baseline, baseline)
        || !exactPropertyEqual(operation.candidate, candidate)) {
        return { status: 'recovery_required', propertyId: id, reason: 'another_update_pending' };
      }
    } else {
      const editBaseline = await prepareSafeStudioEditBaseline(baseline, store);
      if ('status' in editBaseline) {
        return editBaseline.status === 'conflict'
          ? { status: 'conflict', propertyId: id }
          : { status: 'recovery_required', propertyId: id, reason: editBaseline.reason };
      }
      const draft = createEditDraft(editBaseline.baseline);
      if (!await savePropertyEditDraft(draft, null, storage)) {
        return { status: 'recovery_required', propertyId: id, reason: 'edit_draft_conflict' };
      }
      newlyPreparedDraft = draft;
      operation = createPropertyUpdateOperation({
        operationId: `${id}:studio:${Date.now()}`,
        baseline: editBaseline.baseline,
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

async function prepareSafeStudioEditBaseline(
  baseline: Property,
  store: StudioPropertyStore,
): Promise<
  | { readonly baseline: Property }
  | { readonly status: 'conflict' }
  | { readonly status: 'recovery_required'; readonly reason: string }
> {
  const normalized = studioCompatibleTypeDetails(baseline);
  if (exactPropertyEqual(normalized, baseline)) return { baseline };
  if (!validateProperty(normalized).ok) return { status: 'conflict' };

  let didUpdate = false;
  try {
    didUpdate = await store.compareAndUpdate(baseline, normalized);
  } catch {
    // Resolve a rejected CAS by exact-ID readback. Do not continue on a
    // different record or assume that the normalization did not commit.
    try {
      const readback = await store.getProperty(baseline.core.id);
      if (readback && exactPropertyEqual(readback, normalized)) return { baseline: normalized };
      return readback !== null && exactPropertyEqual(readback, baseline)
        ? { status: 'recovery_required', reason: 'legacy_details_normalization_unconfirmed' }
        : { status: 'conflict' };
    } catch {
      return { status: 'recovery_required', reason: 'legacy_details_normalization_unconfirmed' };
    }
  }

  try {
    const readback = await store.getProperty(baseline.core.id);
    if (readback && exactPropertyEqual(readback, normalized)) return { baseline: normalized };
    if (!didUpdate && readback && !exactPropertyEqual(readback, baseline)) {
      return { status: 'conflict' };
    }
    return didUpdate
      ? { status: 'recovery_required', reason: 'legacy_details_normalization_readback_failed' }
      : { status: 'conflict' };
  } catch {
    return { status: 'recovery_required', reason: 'legacy_details_normalization_readback_failed' };
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

/** Validate the canonical Requirement contract and seeker ownership before writing. */
export async function saveStudioRequirement(options: {
  readonly candidate: SeekerRequirement;
  readonly baseline: SeekerRequirement | null;
  readonly store: StudioRequirementStore;
  readonly navigate: () => void | Promise<void>;
}): Promise<StudioRequirementSaveResult> {
  const validation = validateSeekerRequirement(options.candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  if (!validation.ok) return { status: 'invalid_requirement', issue: validation.issues[0] };
  if (options.baseline && (
    options.baseline.id !== options.candidate.id
    || options.baseline.seekerId !== options.candidate.seekerId
  )) return { status: 'edit_conflict' };

  if (options.candidate.seekerId !== undefined) {
    try {
      const person = await options.store.getPerson(options.candidate.seekerId);
      if (!person) return { status: 'missing_person' };
      if (!person.classifications?.includes('seeker')) return { status: 'non_seeker' };
    } catch {
      return { status: 'storage_failure', retryAllowed: true };
    }
  }

  // Use the canonical save path for ownership, exact-ID resolution, and CAS
  // edits. Navigation is deferred until the normalized stored value is fetched.
  const outcome = await savePersonRequirement({
    ...options,
    navigate: () => undefined,
  });
  if (outcome.status !== 'saved') return outcome;

  let requirement: SeekerRequirement | null;
  try {
    requirement = await options.store.getRequirement(options.candidate.id);
  } catch {
    return { status: 'saved_readback_failed' };
  }
  if (!requirementsEquivalent(requirement, options.candidate)) {
    return { status: 'saved_readback_failed' };
  }
  try {
    await options.navigate();
    return { status: 'saved', requirement: requirement! };
  } catch {
    return { status: 'saved_navigation_failed' };
  }
}