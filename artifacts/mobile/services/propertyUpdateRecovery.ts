import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Property,
  PropertyType,
  Transaction,
  validateProperty,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { SerialTaskQueue } from '@/services/serialTaskQueue';

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

export async function loadPropertyEditDraft(
  propertyCoreId: string,
  storage: UpdateStorage = AsyncStorage,
): Promise<PropertyEditDraftV1 | null> {
  const raw = await storage.getItem(propertyEditDraftKey(propertyCoreId));
  if (raw === null) return null;
  try {
    return assertDraft(JSON.parse(raw), propertyCoreId);
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
    },
    writeGeneration: (generations.get(baseline.core.id) ?? 0) + 1,
  };
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
    if (
      baseline.activeOffer.transaction !== 'rent'
      || choices.rentalPeriodId !== baseline.activeOffer.rentalPeriodId
    ) {
      throw new Error('TRANSACTION_SCOPE_RENT_PERIOD');
    }
  }

  const candidate = clone(baseline) as unknown as {
    core: Record<string, unknown>;
    activeOffer: Record<string, unknown>;
  };
  candidate.core.propertyType = choices.propertyType;
  candidate.core.locationArea = {
    ...(baseline.core.locationArea as unknown as Record<string, unknown>),
    id: choices.locationAreaId,
  };
  candidate.activeOffer.transaction = choices.transaction;
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
    return value;
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
}): PropertyUpdateOperationV1 {
  const operation: PropertyUpdateOperationV1 = {
    version: 1,
    operationId: options.operationId,
    state: 'prepared',
    baseline: clone(options.baseline),
    candidate: clone(options.candidate),
    draftSnapshot: clone(options.draftSnapshot),
    preparedAt: options.preparedAt,
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

export async function executePropertyUpdateRecovery(options: {
  operation: PropertyUpdateOperationV1;
  allowUpdate: boolean;
  getProperty: (id: string) => Promise<Property | null>;
  compareAndUpdate: (baseline: Property, candidate: Property) => Promise<boolean>;
  storage?: UpdateStorage;
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
    operation = { ...operation, state: 'confirmed' };
  } else if (exactPropertyEqual(current, operation.baseline) && operation.state === 'prepared') {
    if (!options.allowUpdate) return { status: 'retry_required' };
    try {
      const preparedResult = await withStorageLock(
        storage,
        `viewstate-property-edit-draft:${operation.baseline.core.id}`,
        async () => {
          const latestDraft = await loadPropertyEditDraft(operation.baseline.core.id, storage);
          if (
            latestDraft === null
            || JSON.stringify(latestDraft) !== JSON.stringify(operation.draftSnapshot)
          ) return false;
          return options.compareAndUpdate(operation.baseline, operation.candidate);
        },
      );
      if (!preparedResult) return { status: 'conflict' };
      updatedNow = true;
      const confirmed = { ...operation, state: 'confirmed' as const };
      await replaceOperation(operation, confirmed, storage);
      operation = confirmed;
    } catch (error) {
      return error instanceof PropertyEditReadError
        ? { status: 'conflict' }
        : { status: 'update_failed', error };
    }
  } else {
    return { status: 'conflict' };
  }

  try {
    const draft = await loadPropertyEditDraft(operation.baseline.core.id, storage);
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