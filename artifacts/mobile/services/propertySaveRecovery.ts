import type { Property, PropertyDraft } from '@workspace/property-domain';
import { validateProperty } from '@workspace/property-domain';

export const PROPERTY_SAVE_OPERATION_KEY = '@viewstate_property_save_operation';

export interface RecoveryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PropertySaveOperationV1 {
  version: 1;
  operationId: string;
  draftGeneration: {
    propertyCoreId: string;
    offerId: string;
  };
  draftSnapshot: PropertyDraft;
  targetProperty: Property;
  preparedAt: string;
}

export class SaveRecoveryReadError extends Error {
  constructor(cause: unknown) {
    super('The pending property save operation could not be read.');
    this.name = 'SaveRecoveryReadError';
    this.cause = cause;
  }
}

export class PendingSaveOperationExistsError extends Error {
  constructor() {
    super('An unresolved property save operation already exists.');
    this.name = 'PendingSaveOperationExistsError';
  }
}

export type SavedPropertyAssessment = 'not_saved' | 'saved' | 'conflict';
export type DraftCleanupResult = 'replaced' | 'newer';
export type SaveRecoveryResult =
  | { status: 'complete'; savedNow: boolean; newerDraftPreserved: boolean }
  | { status: 'retry_required' }
  | { status: 'save_failed'; error: unknown }
  | { status: 'cleanup_failed'; error: unknown }
  | { status: 'conflict' }
  | { status: 'unresolved_draft' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeRecoveryValue(value: unknown): string {
  return JSON.stringify(value);
}

export function createPropertySaveOperation(options: {
  operationId: string;
  draft: PropertyDraft;
  targetProperty: Property;
  preparedAt: string;
}): PropertySaveOperationV1 {
  const propertyCoreId = options.draft.propertyCoreId;
  const offerId = options.draft.offerId;
  if (!propertyCoreId || !offerId) {
    throw new Error('A complete draft identity is required for save recovery.');
  }

  const validation = validateProperty(options.targetProperty);
  if (!validation.ok) {
    throw new Error('A valid property is required for save recovery.');
  }
  if (
    options.targetProperty.core.id !== propertyCoreId
    || options.targetProperty.activeOffer.id !== offerId
    || options.targetProperty.activeOffer.propertyCoreId !== propertyCoreId
  ) {
    throw new Error('The property and draft identities must match.');
  }

  return {
    version: 1,
    operationId: options.operationId,
    draftGeneration: { propertyCoreId, offerId },
    draftSnapshot: JSON.parse(serializeRecoveryValue(options.draft)) as PropertyDraft,
    targetProperty: JSON.parse(serializeRecoveryValue(options.targetProperty)) as Property,
    preparedAt: options.preparedAt,
  };
}

export function parsePropertySaveOperation(raw: string): PropertySaveOperationV1 {
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      !isRecord(value)
      || value.version !== 1
      || typeof value.operationId !== 'string'
      || value.operationId.length === 0
      || typeof value.preparedAt !== 'string'
      || !isRecord(value.draftGeneration)
      || typeof value.draftGeneration.propertyCoreId !== 'string'
      || typeof value.draftGeneration.offerId !== 'string'
      || !isRecord(value.draftSnapshot)
      || !isRecord(value.targetProperty)
    ) {
      throw new Error('The pending save operation has an invalid shape.');
    }

    const operation = value as unknown as PropertySaveOperationV1;
    const validation = validateProperty(operation.targetProperty);
    if (
      !validation.ok
      || operation.draftSnapshot.propertyCoreId !== operation.draftGeneration.propertyCoreId
      || operation.draftSnapshot.offerId !== operation.draftGeneration.offerId
      || operation.targetProperty.core.id !== operation.draftGeneration.propertyCoreId
      || operation.targetProperty.activeOffer.id !== operation.draftGeneration.offerId
      || operation.targetProperty.activeOffer.propertyCoreId !== operation.draftGeneration.propertyCoreId
    ) {
      throw new Error('The pending save operation is inconsistent.');
    }
    return operation;
  } catch (error) {
    throw new SaveRecoveryReadError(error);
  }
}

export async function loadPropertySaveOperation(
  storage: RecoveryStorage,
): Promise<PropertySaveOperationV1 | null> {
  const raw = await storage.getItem(PROPERTY_SAVE_OPERATION_KEY);
  return raw === null ? null : parsePropertySaveOperation(raw);
}

export async function persistPropertySaveOperation(
  storage: RecoveryStorage,
  operation: PropertySaveOperationV1,
): Promise<void> {
  const existing = await storage.getItem(PROPERTY_SAVE_OPERATION_KEY);
  const serialized = serializeRecoveryValue(operation);
  if (existing !== null && existing !== serialized) {
    throw new PendingSaveOperationExistsError();
  }
  if (existing === null) {
    await storage.setItem(PROPERTY_SAVE_OPERATION_KEY, serialized);
  }
}

export async function clearPropertySaveOperation(
  storage: RecoveryStorage,
  operation: PropertySaveOperationV1,
): Promise<boolean> {
  const existing = await storage.getItem(PROPERTY_SAVE_OPERATION_KEY);
  if (existing === null) return true;
  const parsed = parsePropertySaveOperation(existing);
  if (
    parsed.operationId !== operation.operationId
    || serializeRecoveryValue(parsed) !== serializeRecoveryValue(operation)
  ) {
    return false;
  }
  await storage.removeItem(PROPERTY_SAVE_OPERATION_KEY);
  return true;
}

export function assessSavedProperty(
  operation: PropertySaveOperationV1,
  properties: readonly Property[],
): SavedPropertyAssessment {
  const matching = properties.filter(
    property => property.core.id === operation.targetProperty.core.id,
  );
  if (matching.length === 0) return 'not_saved';
  if (matching.length !== 1) return 'conflict';
  return serializeRecoveryValue(matching[0]) === serializeRecoveryValue(operation.targetProperty)
    ? 'saved'
    : 'conflict';
}

export function draftMatchesOperation(
  draft: PropertyDraft,
  operation: PropertySaveOperationV1,
): boolean {
  return serializeRecoveryValue(draft) === serializeRecoveryValue(operation.draftSnapshot);
}

export async function executePropertySaveRecovery(options: {
  operation: PropertySaveOperationV1;
  allowSave: boolean;
  getProperties: () => Promise<Property[]>;
  saveProperty: (property: Property) => Promise<void>;
  getDraft: () => PropertyDraft;
  cleanupDraft: (expectedDraftSnapshot: string) => Promise<DraftCleanupResult>;
  clearOperation: (operation: PropertySaveOperationV1) => Promise<boolean>;
}): Promise<SaveRecoveryResult> {
  let assessment: SavedPropertyAssessment;
  try {
    assessment = assessSavedProperty(options.operation, await options.getProperties());
  } catch (error) {
    return { status: 'save_failed', error };
  }

  let savedNow = false;
  if (assessment === 'conflict') return { status: 'conflict' };
  if (assessment === 'not_saved') {
    if (!options.allowSave) return { status: 'retry_required' };
    if (!draftMatchesOperation(options.getDraft(), options.operation)) {
      return { status: 'unresolved_draft' };
    }
    try {
      await options.saveProperty(options.operation.targetProperty);
      savedNow = true;
      assessment = assessSavedProperty(options.operation, await options.getProperties());
    } catch (error) {
      return { status: 'save_failed', error };
    }
    if (assessment !== 'saved') {
      return assessment === 'conflict'
        ? { status: 'conflict' }
        : { status: 'save_failed', error: new Error('The property save could not be confirmed.') };
    }
  }

  let cleanupResult: DraftCleanupResult;
  try {
    cleanupResult = draftMatchesOperation(options.getDraft(), options.operation)
      ? await options.cleanupDraft(serializeRecoveryValue(options.operation.draftSnapshot))
      : 'newer';
  } catch (error) {
    return { status: 'cleanup_failed', error };
  }

  try {
    const cleared = await options.clearOperation(options.operation);
    if (!cleared) {
      return {
        status: 'cleanup_failed',
        error: new PendingSaveOperationExistsError(),
      };
    }
  } catch (error) {
    return { status: 'cleanup_failed', error };
  }

  return {
    status: 'complete',
    savedNow,
    newerDraftPreserved: cleanupResult === 'newer',
  };
}