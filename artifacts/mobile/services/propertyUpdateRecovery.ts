import { assertPropertyDetailsEditClassification, assertSavedPropertyClassificationUnchanged } from '@/services/savedPropertyClassification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Property,
  PropertyType,
  Transaction,
  PropertyDemoCaptureMetadata,
  CoordinatesMetadata,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  validateProperty,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { MARKET_CONFIG } from '@/constants/market';
import { SerialTaskQueue } from '@/services/serialTaskQueue';
import { optionalClassifiedLiteral } from '@/services/literalText';
import { getDemoCategory } from '@/services/propertyDemoCatalog';
import { isMappedTemplateField, projectPropertyFacts, squareFeetToSquareMeters } from '@/services/propertyFactProjection';
import type { AttachmentFileStore } from '@/services/attachmentOperations';
import { normalizeGoogleMapsLink } from '@/services/mapsLink';

export const PROPERTY_UPDATE_OPERATION_KEY = '@viewstate_property_update_operation_v1';
export const PROPERTY_EDIT_DRAFT_PREFIX = '@viewstate_property_edit_draft_v1:';

export interface UpdateStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PropertyEditChoices {
  propertyType: PropertyType;
  transaction: Transaction;
  priceAmount?: number;
  locationAreaId: string;
  rentalPeriodId?: string;
  demoMetadata?: PropertyDemoCaptureMetadata;
  nearbyServices?: readonly string[];
  areaSquareMeters?: number;
  areaUnit?: 'square_meter' | 'square_foot';
  block?: string;
  /** Canonical typed fields are hydrated into the same modern edit draft. */
  canonicalDetails?: Record<string, string>;
  description?: string;
  privateNotes?: string;
  paciNumber?: string;
  manualLocationText?: string;
  mapsLink?: string;
  coordinates?: CoordinatesMetadata;
  attachments?: Property['attachments'];
  newlyCopiedAttachmentUris?: readonly string[];
}

export interface PropertyEditDraftV1 {
  version: 1;
  propertyCoreId: string;
  baseline: Property;
  choices: PropertyEditChoices;
  writeGeneration: number;
}

export interface PropertyUpdateOperationV1 {
  version: 1;
  operationId: string;
  state: 'prepared' | 'confirmed';
  baseline: Property;
  candidate: Property;
  draftSnapshot: PropertyEditDraftV1;
  preparedAt: string;
  /** Additive V1-compatible attachment cleanup journal. */
  attachmentCleanup?: AttachmentCleanupEvidence;
}

export interface AttachmentCleanupEvidence {
  readonly newlyCopiedUris: readonly string[];
  readonly retiredManagedUris: readonly string[];
  readonly phase: 'before_cas' | 'after_cas';
  readonly status: 'pending' | 'retryable';
}

export class PropertyEditReadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PropertyEditReadError';
    this.cause = cause;
  }
}

export class PendingPropertyUpdateExistsError extends Error {
  constructor() {
    super('An unresolved property update operation already exists.');
    this.name = 'PendingPropertyUpdateExistsError';
  }
}

const draftWrites = new SerialTaskQueue();
const evidenceWrites = new SerialTaskQueue();
const generations = new Map<string, number>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const exactPropertyEqual = (left: Property, right: Property) =>
  JSON.stringify(left) === JSON.stringify(right);

function hasOnlyKeys(value: unknown, keys: readonly string[]): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
}

function isKnownLiteralShape(value: unknown): boolean {
  if (!hasOnlyKeys(value, ['value', 'privacy'])) return false;
  const literal = value as { privacy?: unknown };
  return hasOnlyKeys(literal.privacy, ['classification', 'disclosurePolicy']);
}

/** A conservative contract-shape guard used only when changing property type. */
export function canSafelyChangePropertyType(property: Property): boolean {
  if (
    property.typeDetails !== undefined
    || !hasOnlyKeys(property, ['core', 'activeOffer', 'typeDetails'])
    || !hasOnlyKeys(property.core, [
      'id', 'propertyType', 'locationArea', 'description', 'privateNotes',
      'ownerSource', 'exactLocation',
    ])
    || !hasOnlyKeys(property.core.locationArea, ['id'])
  ) return false;
  for (const key of ['description', 'privateNotes', 'ownerSource', 'exactLocation'] as const) {
    const literal = property.core[key];
    if (literal !== undefined && !isKnownLiteralShape(literal)) return false;
  }
  if (property.activeOffer.transaction === 'sale') {
    return hasOnlyKeys(property.activeOffer, ['id', 'propertyCoreId', 'transaction', 'salePrice'])
      && hasOnlyKeys(property.activeOffer.salePrice, ['amount', 'currencyCode']);
  }
  return hasOnlyKeys(property.activeOffer, [
    'id', 'propertyCoreId', 'transaction', 'rentalPrice', 'rentalPeriodId',
  ]) && hasOnlyKeys(property.activeOffer.rentalPrice, ['amount', 'currencyCode']);
}

export function propertyEditDraftKey(propertyCoreId: string) {
  return `${PROPERTY_EDIT_DRAFT_PREFIX}${encodeURIComponent(propertyCoreId)}`;
}

async function withStorageLock<T>(storage: UpdateStorage, name: string, work: () => Promise<T>): Promise<T> {
  const isBrowser = typeof document !== 'undefined' && typeof navigator !== 'undefined';
  if (storage !== AsyncStorage || !isBrowser) return work();
  const locks = (navigator as Navigator & { locks?: { request?: <R>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<R>) => Promise<R> } }).locks;
  if (!locks?.request) throw new Error('SAFE_WEB_MUTATION_UNSUPPORTED');
  return locks.request(name, { mode: 'exclusive' }, work);
}

function assertDraft(value: unknown, expectedId?: string): PropertyEditDraftV1 {
  if (
    typeof value !== 'object' || value === null
    || (value as PropertyEditDraftV1).version !== 1
    || typeof (value as PropertyEditDraftV1).propertyCoreId !== 'string'
    || typeof (value as PropertyEditDraftV1).writeGeneration !== 'number'
    || typeof (value as PropertyEditDraftV1).baseline !== 'object'
    || typeof (value as PropertyEditDraftV1).choices !== 'object'
  ) {
    throw new PropertyEditReadError('The stored property edit draft has an invalid shape.');
  }
  const draft = value as PropertyEditDraftV1;
  if (
    (expectedId !== undefined && draft.propertyCoreId !== expectedId)
    || draft.baseline.core?.id !== draft.propertyCoreId
  ) {
    throw new PropertyEditReadError('The stored property edit draft has inconsistent identity.');
  }
  return draft;
}

/** Backward-compatible draft hydration. Missing fields mean untouched legacy
 * state, never an instruction to clear the baseline. */
export function migratePropertyEditDraft(draft: PropertyEditDraftV1): PropertyEditDraftV1 {
  const choices = draft.choices as PropertyEditChoices;
  const baseline = draft.baseline;
  return {
    ...draft,
    choices: {
      ...choices,
      ...(Object.prototype.hasOwnProperty.call(choices, 'description') ? {} : { description: baseline.core.description?.value ?? '' }),
      ...(Object.prototype.hasOwnProperty.call(choices, 'privateNotes') ? {} : { privateNotes: baseline.core.privateNotes?.value ?? '' }),
      ...(Object.prototype.hasOwnProperty.call(choices, 'paciNumber') ? {} : { paciNumber: baseline.locationEnrichment?.paciNumber?.value ?? '' }),
      ...(Object.prototype.hasOwnProperty.call(choices, 'manualLocationText') ? {} : { manualLocationText: baseline.locationEnrichment?.manualLocationText?.value ?? '' }),
      ...(Object.prototype.hasOwnProperty.call(choices, 'mapsLink') ? {} : { mapsLink: baseline.locationEnrichment?.mapsLink?.value ?? '' }),
      ...(Object.prototype.hasOwnProperty.call(choices, 'attachments') ? {} : (baseline.attachments ? { attachments: clone(baseline.attachments) } : {})),
      ...(Object.prototype.hasOwnProperty.call(choices, 'canonicalDetails') ? {} : {
        canonicalDetails: Object.fromEntries(
          Object.entries((baseline.typeDetails ?? {}) as Record<string, unknown>)
            .filter(([key]) => PROPERTY_DETAIL_FIELD_DEFINITIONS.some(definition => definition.field === key))
            .map(([key, value]) => [key, typeof value === 'object' && value && 'value' in value
              ? String((value as { value: unknown }).value)
              : String(value)]),
        ),
      }),
    },
  };
}

export async function loadPropertyEditDraft(
  propertyCoreId: string,
  storage: UpdateStorage = AsyncStorage,
  migrate = true,
): Promise<PropertyEditDraftV1 | null> {
  const raw = await storage.getItem(propertyEditDraftKey(propertyCoreId));
  if (raw === null) return null;
  try {
    const draft = assertDraft(JSON.parse(raw), propertyCoreId);
    if (!migrate) return draft;
    const migrated = migratePropertyEditDraft(draft);
    const migratedSnapshot = JSON.stringify(migrated);
    if (migratedSnapshot !== raw) {
      await withStorageLock(storage, `viewstate-property-edit-draft:${propertyCoreId}`, async () => {
        const current = await storage.getItem(propertyEditDraftKey(propertyCoreId));
        if (current === raw) await storage.setItem(propertyEditDraftKey(propertyCoreId), migratedSnapshot);
      });
    }
    return migrated;
  } catch (error) {
    throw error instanceof PropertyEditReadError
      ? error
      : new PropertyEditReadError('The stored property edit draft could not be read.', error);
  }
}

export async function savePropertyEditDraft(
  draft: PropertyEditDraftV1,
  expectedOrStorage: PropertyEditDraftV1 | null | UpdateStorage = null,
  suppliedStorage: UpdateStorage = AsyncStorage,
): Promise<boolean> {
  const storage = expectedOrStorage && 'getItem' in expectedOrStorage
    ? expectedOrStorage as UpdateStorage
    : suppliedStorage;
  const expected = expectedOrStorage && 'getItem' in expectedOrStorage
    ? null
    : expectedOrStorage as PropertyEditDraftV1 | null;
  assertDraft(draft, draft.propertyCoreId);
  const id = draft.propertyCoreId;
  const knownGeneration = generations.get(id) ?? 0;
  if (draft.writeGeneration < knownGeneration) return false;
  const scheduledGeneration = draft.writeGeneration;
  generations.set(id, scheduledGeneration);
  const snapshot = JSON.stringify({ ...clone(draft), writeGeneration: scheduledGeneration });
  let saved = false;
  await draftWrites.enqueue(async () => {
    await withStorageLock(storage, `viewstate-property-edit-draft:${id}`, async () => {
      const key = propertyEditDraftKey(id);
      const current = await storage.getItem(key);
      const expectedSnapshot = expected === null ? null : JSON.stringify(expected);
      if (current !== expectedSnapshot) return;
      if (current !== null) {
        try {
          assertDraft(JSON.parse(current), id);
        } catch (error) {
          throw new PropertyEditReadError('The stored property edit draft could not be read.', error);
        }
      }
      await storage.setItem(key, snapshot);
      saved = true;
    });
  });
  return saved;
}

export async function discardPropertyEditDraft(
  propertyCoreId: string,
  expected: PropertyEditDraftV1,
  storage: UpdateStorage = AsyncStorage,
): Promise<boolean> {
  if (expected.propertyCoreId !== propertyCoreId) return false;
  const expectedGeneration = expected.writeGeneration;
  const nextGeneration = Math.max(generations.get(propertyCoreId) ?? 0, expectedGeneration) + 1;
  generations.set(propertyCoreId, nextGeneration);
  let discarded = false;
  await draftWrites.enqueue(async () => {
    await withStorageLock(storage, `viewstate-property-edit-draft:${propertyCoreId}`, async () => {
      const key = propertyEditDraftKey(propertyCoreId);
      const raw = await storage.getItem(key);
      if (raw !== JSON.stringify(expected)) return;
      try {
        assertDraft(JSON.parse(raw), propertyCoreId);
      } catch (error) {
        throw new PropertyEditReadError('The stored property edit draft could not be read.', error);
      }
      await storage.removeItem(key);
      discarded = true;
    });
  });
  return discarded;
}

export async function flushPropertyEditDraftWrites(): Promise<void> {
  await draftWrites.flush();
}

export function createEditDraft(baseline: Property): PropertyEditDraftV1 {
  const price = baseline.activeOffer.transaction === 'sale'
    ? baseline.activeOffer.salePrice
    : baseline.activeOffer.rentalPrice;
  const projected = projectPropertyFacts(baseline);
  return {
    version: 1,
    propertyCoreId: baseline.core.id,
    baseline: clone(baseline),
    choices: {
      propertyType: baseline.core.propertyType,
      transaction: baseline.activeOffer.transaction,
      priceAmount: price.amount,
      locationAreaId: baseline.core.locationArea.id,
      ...(baseline.activeOffer.transaction === 'rent'
        ? { rentalPeriodId: baseline.activeOffer.rentalPeriodId }
        : {}),
      ...(baseline.demoCapture ? { demoMetadata: clone(baseline.demoCapture) } : {}),
      ...(baseline.nearbyServices ? { nearbyServices: clone(baseline.nearbyServices) } : {}),
      ...(baseline.areaSquareMeters !== undefined ? {
        areaSquareMeters: baseline.areaUnit === 'square_foot' ? squareFeetToSquareMeters(baseline.areaSquareMeters) : baseline.areaSquareMeters,
        areaUnit: 'square_meter' as const,
      } : {}),
       ...(baseline.areaSquareMeters === undefined && projected.areaSquareMeters !== undefined
         ? { areaSquareMeters: projected.areaSquareMeters, areaUnit: projected.areaUnit }
        : {}),
      ...(baseline.core.block ? { block: baseline.core.block } : {}),
      canonicalDetails: {
        ...Object.fromEntries(
        Object.entries((baseline.typeDetails ?? {}) as Record<string, unknown>)
          .filter(([key]) => PROPERTY_DETAIL_FIELD_DEFINITIONS.some(definition => definition.field === key))
          .map(([key, value]) => [key, typeof value === 'object' && value && 'value' in value
            ? String((value as { value: unknown }).value)
            : String(value)]),
        ),
        ...Object.fromEntries(Object.entries(projected.templateFacts).map(([key, value]) => [key, String(value)])),
        ...((baseline.typeDetails as unknown as Record<string, unknown> | undefined)
          && typeof (baseline.typeDetails as unknown as Record<string, unknown>).clarification === 'object'
          && (baseline.typeDetails as unknown as Record<string, unknown>).clarification
          && 'value' in ((baseline.typeDetails as unknown as Record<string, unknown>).clarification as object)
          ? {
          clarification: String(((baseline.typeDetails as unknown as Record<string, unknown>).clarification as { value: unknown }).value),
          }
          : {}),
      },
      description: baseline.core.description?.value ?? '',
      privateNotes: baseline.core.privateNotes?.value ?? '',
      paciNumber: baseline.locationEnrichment?.paciNumber?.value ?? '',
      manualLocationText: baseline.locationEnrichment?.manualLocationText?.value ?? '',
      mapsLink: baseline.locationEnrichment?.mapsLink?.value ?? '',
      ...(baseline.locationEnrichment?.coordinates ? { coordinates: clone(baseline.locationEnrichment.coordinates) } : {}),
      ...(baseline.attachments ? { attachments: clone(baseline.attachments) } : {}),
    },
    writeGeneration: (generations.get(baseline.core.id) ?? 0) + 1,
  };
}

/** Candidate path for saved Property details; classification changes are not part of this workflow. */
export function buildPropertyDetailsUpdateCandidate(baseline: Property, choices: PropertyEditChoices): Property {
  assertPropertyDetailsEditClassification(baseline, choices);
  const candidate = buildPropertyUpdateCandidate(baseline, choices);
  assertSavedPropertyClassificationUnchanged(baseline, candidate);
  return candidate;
}

export function buildPropertyUpdateCandidate(
  baseline: Property,
  choices: PropertyEditChoices,
): Property {
  if (!getAreaById(choices.locationAreaId)) {
    throw new Error('INVALID_APPROVED_AREA');
  }
  if (!Number.isFinite(choices.priceAmount) || (choices.priceAmount ?? 0) <= 0) {
    throw new Error('INVALID_PRICE');
  }
  if (
    !canSafelyChangePropertyType(baseline)
    && choices.propertyType !== baseline.core.propertyType
  ) {
    throw new Error('INCOMPATIBLE_TYPE_DETAILS');
  }
  if (choices.transaction === 'rent') {
    const expectedRentalPeriodId = baseline.activeOffer.transaction === 'rent'
      ? baseline.activeOffer.rentalPeriodId
      : MARKET_CONFIG.defaultRentalPeriodId;
    if (choices.rentalPeriodId !== expectedRentalPeriodId) {
      throw new Error('TRANSACTION_SCOPE_RENT_PERIOD');
    }
  }

  const candidate = clone(baseline) as unknown as {
    [key: string]: unknown;
    core: Record<string, unknown>;
    activeOffer: Record<string, unknown>;
  };
  const hasCanonicalDetails = Object.prototype.hasOwnProperty.call(choices, 'canonicalDetails');
  const details = { ...((baseline.typeDetails ?? {}) as Record<string, unknown>) };
  const canonicalDetails = { ...(choices.canonicalDetails ?? {}) };
  const categoryForCandidate = getDemoCategory(choices.demoMetadata?.categoryId);
  for (const field of !hasCanonicalDetails ? categoryForCandidate?.numericFields ?? [] : []) {
    const legacy = choices.demoMetadata?.numericValues?.[field.id];
    if (isMappedTemplateField(field.id) && legacy !== undefined && canonicalDetails[field.id] === undefined) {
      canonicalDetails[field.id] = String(legacy);
    }
  }
  for (const field of !hasCanonicalDetails ? categoryForCandidate?.choices ?? [] : []) {
    const legacy = choices.demoMetadata?.choices?.[field.id];
    if (isMappedTemplateField(field.id) && legacy !== undefined && canonicalDetails[field.id] === undefined) {
      canonicalDetails[field.id] = legacy;
    }
  }
  const writesCanonicalDetails = hasCanonicalDetails || Object.keys(canonicalDetails).length > 0;
  if (writesCanonicalDetails) for (const definition of PROPERTY_DETAIL_FIELD_DEFINITIONS) delete details[definition.field];
  if (writesCanonicalDetails) details.propertyType = choices.propertyType;
  if (choices.propertyType === 'other_built_property' && choices.canonicalDetails?.clarification?.trim()) {
    details.clarification = {
      value: choices.canonicalDetails.clarification,
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    };
  }
  for (const definition of writesCanonicalDetails ? PROPERTY_DETAIL_FIELD_DEFINITIONS : []) {
    if (!definition.appliesTo.includes(choices.propertyType)) continue;
    const raw = canonicalDetails[definition.field];
    if (!raw?.trim() || definition.field === 'clarification') continue;
    if (definition.field === 'intendedUse' || definition.field === 'commercialActivity') {
      details[definition.field] = { value: raw, privacy: { classification: 'normal', disclosurePolicy: 'normal' } };
    } else if (definition.field === 'parkingTypes') {
      details[definition.field] = raw.split(',').filter(Boolean);
    } else if (definition.field === 'privateParkingCount' && !canonicalDetails.parkingTypes?.split(',').includes('private')) {
      continue;
    } else if (definition.field === 'floorUse' || definition.field === 'apartmentSubtype' || definition.field === 'furnishing' || definition.field === 'occupancy' || definition.field === 'propertyUse' || definition.field === 'buildingAgeBand' || definition.field === 'streetPosition' || definition.field === 'rentalOccupancy') {
      details[definition.field] = raw;
    } else if (definition.field.startsWith('has')) {
      details[definition.field] = raw === 'true';
    } else {
      details[definition.field] = Number(raw);
    }
  }
  if (Object.keys(details).length) candidate.typeDetails = details;
  else delete candidate.typeDetails;
  const hasDescription = Object.prototype.hasOwnProperty.call(choices, 'description');
  const hasPrivateNotes = Object.prototype.hasOwnProperty.call(choices, 'privateNotes');
  candidate.core.description = hasDescription
    ? optionalClassifiedLiteral(choices.description ?? '', { classification: 'normal', disclosurePolicy: 'normal' })
    : baseline.core.description;
  candidate.core.privateNotes = hasPrivateNotes
    ? optionalClassifiedLiteral(choices.privateNotes ?? '', { classification: 'private_notes', disclosurePolicy: 'never' })
    : baseline.core.privateNotes;
  if (candidate.core.description === undefined) delete candidate.core.description;
  if (candidate.core.privateNotes === undefined) delete candidate.core.privateNotes;
  const locationEnrichment = { ...((baseline.locationEnrichment ?? {}) as Record<string, unknown>) };
  const exactPrivacy = { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' } as const;
  for (const [key, value] of [
    ['paciNumber', choices.paciNumber],
    ['manualLocationText', choices.manualLocationText],
    ['mapsLink', choices.mapsLink],
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(choices, key)) continue;
    const normalizedValue = key === 'mapsLink' && value?.trim()
      ? normalizeGoogleMapsLink(value)
      : value;
    const literal = optionalClassifiedLiteral(normalizedValue ?? '', exactPrivacy);
    if (literal) locationEnrichment[key] = literal; else delete locationEnrichment[key];
  }
  if (Object.prototype.hasOwnProperty.call(choices, 'coordinates')) {
    if (choices.coordinates) locationEnrichment.coordinates = clone(choices.coordinates);
    else delete locationEnrichment.coordinates;
  }
  if (Object.keys(locationEnrichment).length) candidate.locationEnrichment = locationEnrichment;
  else delete candidate.locationEnrichment;
  candidate.attachments = Object.prototype.hasOwnProperty.call(choices, 'attachments')
    ? (choices.attachments?.length ? clone(choices.attachments) : undefined)
    : baseline.attachments;
  if (candidate.attachments === undefined) delete candidate.attachments;
  candidate.core.propertyType = choices.propertyType;
  candidate.core.locationArea = {
    ...(baseline.core.locationArea as unknown as Record<string, unknown>),
    id: choices.locationAreaId,
  };
  candidate.activeOffer.transaction = choices.transaction;
  if (choices.demoMetadata) {
    const demo = clone(choices.demoMetadata) as unknown as Record<string, unknown>;
    delete demo.areaSquareMeters;
    delete demo.areaUnit;
    const category = getDemoCategory(choices.demoMetadata.categoryId);
    const numericValues = { ...((demo.numericValues ?? {}) as Record<string, number>) };
    const choiceValues = { ...((demo.choices ?? {}) as Record<string, string>) };
    for (const field of category?.numericFields ?? []) {
      if (isMappedTemplateField(field.id) && hasCanonicalDetails) delete numericValues[field.id];
    }
    for (const field of category?.choices ?? []) {
      if (isMappedTemplateField(field.id) && hasCanonicalDetails) delete choiceValues[field.id];
    }
    if (Object.keys(numericValues).length) demo.numericValues = numericValues; else delete demo.numericValues;
    if (Object.keys(choiceValues).length) demo.choices = choiceValues; else delete demo.choices;
    candidate.demoCapture = demo;
  } else {
    delete candidate.demoCapture;
  }
  if (choices.nearbyServices !== undefined) candidate.nearbyServices = clone(choices.nearbyServices);
  else delete candidate.nearbyServices;
  if (choices.areaSquareMeters !== undefined) {
    candidate.areaSquareMeters = choices.areaUnit === 'square_foot'
      ? squareFeetToSquareMeters(choices.areaSquareMeters)
      : choices.areaSquareMeters;
    candidate.areaUnit = 'square_meter';
  } else {
    delete candidate.areaSquareMeters;
    delete candidate.areaUnit;
  }
  if (choices.block !== undefined) candidate.core.block = choices.block;
  else delete candidate.core.block;
  if (choices.transaction === 'sale') {
    delete candidate.activeOffer.rentalPrice;
    delete candidate.activeOffer.rentalPeriodId;
    candidate.activeOffer.salePrice = {
      ...((baseline.activeOffer.transaction === 'sale'
        ? baseline.activeOffer.salePrice
        : {}) as unknown as Record<string, unknown>),
      amount: choices.priceAmount!,
      currencyCode: 'KWD',
    };
  } else {
    delete candidate.activeOffer.salePrice;
    const rentalPeriodId = choices.rentalPeriodId;
    if (!rentalPeriodId?.trim()) throw new Error('MISSING_RENTAL_PERIOD');
    candidate.activeOffer.rentalPrice = {
      ...((baseline.activeOffer.transaction === 'rent'
        ? baseline.activeOffer.rentalPrice
        : {}) as unknown as Record<string, unknown>),
      amount: choices.priceAmount!,
      currencyCode: 'KWD',
    };
    candidate.activeOffer.rentalPeriodId = rentalPeriodId;
  }
  const validation = validateProperty(candidate as unknown as Property);
  if (!validation.ok) throw new Error(`DOMAIN_VALIDATION:${validation.issues.map(issue => issue.code).join(',')}`);
  return candidate as unknown as Property;
}

function parseOperation(raw: string): PropertyUpdateOperationV1 {
  try {
    const value = JSON.parse(raw) as PropertyUpdateOperationV1;
    if (
      value?.version !== 1
      || !value.operationId
      || (value.state !== 'prepared' && value.state !== 'confirmed')
      || !value.baseline || !value.candidate || !value.draftSnapshot
      || value.baseline.core.id !== value.candidate.core.id
      || value.baseline.core.id !== value.draftSnapshot.propertyCoreId
      || !validateProperty(value.baseline).ok
      || !validateProperty(value.candidate).ok
    ) throw new Error('invalid update operation');
    assertDraft(value.draftSnapshot, value.baseline.core.id);
    if (value.attachmentCleanup) {
      if (!Array.isArray(value.attachmentCleanup.newlyCopiedUris)
        || !Array.isArray(value.attachmentCleanup.retiredManagedUris)
        || !['before_cas', 'after_cas'].includes(value.attachmentCleanup.phase)
        || !['pending', 'retryable'].includes(value.attachmentCleanup.status)) throw new Error('invalid attachment cleanup');
    }
    return { ...value, attachmentCleanup: value.attachmentCleanup
      ? { ...value.attachmentCleanup, newlyCopiedUris: [...new Set(value.attachmentCleanup.newlyCopiedUris)], retiredManagedUris: [...new Set(value.attachmentCleanup.retiredManagedUris)] }
      : undefined };
  } catch (error) {
    throw new PropertyEditReadError('The pending property update could not be read.', error);
  }
}

export function createPropertyUpdateOperation(options: {
  operationId: string;
  baseline: Property;
  candidate: Property;
  draftSnapshot: PropertyEditDraftV1;
  preparedAt: string;
  attachmentCleanup?: AttachmentCleanupEvidence;
}): PropertyUpdateOperationV1 {
  const operation: PropertyUpdateOperationV1 = {
    version: 1,
    operationId: options.operationId,
    state: 'prepared',
    baseline: clone(options.baseline),
    candidate: clone(options.candidate),
    draftSnapshot: clone(options.draftSnapshot),
    preparedAt: options.preparedAt,
    ...(options.attachmentCleanup ? { attachmentCleanup: clone(options.attachmentCleanup) } : {}),
  };
  return parseOperation(JSON.stringify(operation));
}

export async function loadPropertyUpdateOperation(storage: UpdateStorage = AsyncStorage) {
  const raw = await storage.getItem(PROPERTY_UPDATE_OPERATION_KEY);
  return raw === null ? null : parseOperation(raw);
}

export async function persistPropertyUpdateOperation(
  operation: PropertyUpdateOperationV1,
  storage: UpdateStorage = AsyncStorage,
) {
  await evidenceWrites.enqueue(async () => {
    await withStorageLock(storage, 'viewstate-property-update-evidence', async () => {
      const raw = await storage.getItem(PROPERTY_UPDATE_OPERATION_KEY);
      const next = JSON.stringify(operation);
      if (raw !== null && raw !== next) throw new PendingPropertyUpdateExistsError();
      if (raw === null) await storage.setItem(PROPERTY_UPDATE_OPERATION_KEY, next);
    });
  });
}

async function replaceOperation(
  expected: PropertyUpdateOperationV1,
  replacement: PropertyUpdateOperationV1,
  storage: UpdateStorage,
) {
  await evidenceWrites.enqueue(async () => {
    await withStorageLock(storage, 'viewstate-property-update-evidence', async () => {
      const raw = await storage.getItem(PROPERTY_UPDATE_OPERATION_KEY);
      if (raw !== JSON.stringify(expected)) throw new PendingPropertyUpdateExistsError();
      await storage.setItem(PROPERTY_UPDATE_OPERATION_KEY, JSON.stringify(replacement));
    });
  });
}

export type PropertyUpdateRecoveryResult =
  | { status: 'retry_required' }
  | { status: 'conflict' }
  | { status: 'complete'; updatedNow: boolean }
  | { status: 'update_failed'; error: unknown }
  | { status: 'cleanup_failed'; error: unknown };

async function deleteExactUris(uris: readonly string[], fileStore?: AttachmentFileStore) {
  if (!fileStore) return;
  for (const uri of [...new Set(uris)]) {
    try {
      await fileStore.delete(uri);
    } catch (error) {
      if (error instanceof Error && (error.message === 'ATTACHMENT_FILE_MISSING' || error.message === 'ENOENT')) continue;
      throw error;
    }
  }
}

export async function executePropertyUpdateRecovery(options: {
  operation: PropertyUpdateOperationV1;
  allowUpdate: boolean;
  getProperty: (id: string) => Promise<Property | null>;
  compareAndUpdate: (baseline: Property, candidate: Property) => Promise<boolean>;
  storage?: UpdateStorage;
  attachmentFileStore?: AttachmentFileStore;
}): Promise<PropertyUpdateRecoveryResult> {
  const storage = options.storage ?? AsyncStorage;
  let current: Property | null;
  try {
    current = await options.getProperty(options.operation.baseline.core.id);
  } catch {
    return { status: 'conflict' };
  }
  if (current === null) return { status: 'conflict' };
  let operation = options.operation;
  let updatedNow = false;
  if (exactPropertyEqual(current, operation.candidate)) {
    operation = {
      ...operation,
      state: 'confirmed',
      ...(operation.attachmentCleanup ? {
        attachmentCleanup: { ...operation.attachmentCleanup, phase: 'after_cas' as const },
      } : {}),
    };
  } else if (exactPropertyEqual(current, operation.baseline) && operation.state === 'prepared') {
    if (!options.allowUpdate) return { status: 'retry_required' };
    try {
      const preparedResult = await withStorageLock(
        storage,
        `viewstate-property-edit-draft:${operation.baseline.core.id}`,
        async () => {
           const latestDraft = await loadPropertyEditDraft(operation.baseline.core.id, storage, false);
          if (
            latestDraft === null
            || JSON.stringify(latestDraft) !== JSON.stringify(operation.draftSnapshot)
          ) return false;
          return options.compareAndUpdate(operation.baseline, operation.candidate);
        },
      );
      if (!preparedResult) return { status: 'conflict' };
      updatedNow = true;
       const confirmed = {
         ...operation,
         state: 'confirmed' as const,
         ...(operation.attachmentCleanup ? {
           attachmentCleanup: { ...operation.attachmentCleanup, phase: 'after_cas' as const },
         } : {}),
       };
      await replaceOperation(operation, confirmed, storage);
      operation = confirmed;
    } catch (error) {
      return error instanceof PropertyEditReadError
        ? { status: 'conflict' }
        : { status: 'update_failed', error };
    }
  } else {
    try {
      if (operation.attachmentCleanup?.phase === 'before_cas') {
        await deleteExactUris(operation.attachmentCleanup.newlyCopiedUris, options.attachmentFileStore);
        await evidenceWrites.enqueue(async () => {
          await withStorageLock(storage, 'viewstate-property-update-evidence', async () => {
            const raw = await storage.getItem(PROPERTY_UPDATE_OPERATION_KEY);
            if (raw === JSON.stringify(operation)) await storage.removeItem(PROPERTY_UPDATE_OPERATION_KEY);
          });
        });
      }
      return { status: 'conflict' };
    } catch (error) {
      return { status: 'cleanup_failed', error };
    }
  }

  try {
    if (operation.attachmentCleanup?.phase === 'after_cas') {
      await deleteExactUris(operation.attachmentCleanup.retiredManagedUris, options.attachmentFileStore);
    }
    const draft = await loadPropertyEditDraft(operation.baseline.core.id, storage, false);
    if (
      draft
      && JSON.stringify(draft) === JSON.stringify(operation.draftSnapshot)
      && !await discardPropertyEditDraft(draft.propertyCoreId, draft, storage)
    ) {
      throw new Error('A newer property edit draft exists.');
    }
    await evidenceWrites.enqueue(async () => {
      await withStorageLock(storage, 'viewstate-property-update-evidence', async () => {
        const raw = await storage.getItem(PROPERTY_UPDATE_OPERATION_KEY);
        if (raw !== JSON.stringify(operation) && raw !== JSON.stringify(options.operation)) {
          throw new PendingPropertyUpdateExistsError();
        }
        await storage.removeItem(PROPERTY_UPDATE_OPERATION_KEY);
      });
    });
    return { status: 'complete', updatedNow };
  } catch (error) {
    return { status: 'cleanup_failed', error };
  }
}
