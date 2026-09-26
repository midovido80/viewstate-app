import AsyncStorage from '@react-native-async-storage/async-storage';
import { SerialTaskQueue } from '@/services/serialTaskQueue';

export const REQUIREMENT_DRAFT_KEY_PREFIX = '@viewstate_requirement_draft_v1:';

export interface RequirementDraftPayload {
  readonly purpose: 'rent' | 'buy';
  readonly propertyType: string;
  readonly floorUse?: string;
  readonly areaMode?: 'specific_areas' | 'all_kuwait';
  readonly areaIds: readonly string[];
  readonly bedrooms: string;
  readonly bathrooms: string;
  readonly masterBedrooms: string;
  readonly occupancy?: string;
  readonly livingRooms: string;
  readonly parking: string;
  readonly floorNumber: string;
  readonly requiredArea: string;
  readonly driverRoom: boolean;
  readonly catalog: readonly unknown[];
  readonly amenities: readonly string[];
  readonly excludedAmenities: readonly string[];
  readonly services: readonly string[];
  readonly centralACPreference?: boolean;
  readonly constraintStrengths: Readonly<Record<string, string>>;
  readonly minimumBudget: string;
  readonly maximumBudget: string;
  readonly cadence: 'monthly' | 'yearly';
  readonly notes: string;
}

export interface RequirementDraftRecord {
  readonly version: 1;
  readonly ownerId: string;
  readonly draftId: string;
  readonly finalRequirementId: string;
  readonly revision: number;
  readonly payload: RequirementDraftPayload;
}

export interface RequirementDraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export class RequirementDraftStorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RequirementDraftStorageError';
    this.cause = cause;
  }
}

const writes = new SerialTaskQueue();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value: string) => value.length > 0 && value.trim() === value && value.length <= 256;
const keyFor = (ownerId: string, draftId: string) =>
  `${REQUIREMENT_DRAFT_KEY_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(draftId)}`;
const ownerPrefix = (ownerId: string) =>
  `${REQUIREMENT_DRAFT_KEY_PREFIX}${encodeURIComponent(ownerId)}:`;

function validPayload(value: unknown): value is RequirementDraftPayload {
  if (!isRecord(value)) return false;
  const strings = [
    'propertyType', 'bedrooms', 'bathrooms', 'masterBedrooms', 'livingRooms',
    'parking', 'floorNumber', 'requiredArea', 'minimumBudget', 'maximumBudget', 'notes',
  ];
  if (strings.some(field => typeof value[field] !== 'string')) return false;
  if (!['rent', 'buy'].includes(String(value.purpose))) return false;
  if (value.floorUse !== undefined && typeof value.floorUse !== 'string') return false;
  if (value.areaMode !== undefined && !['specific_areas', 'all_kuwait'].includes(String(value.areaMode))) return false;
  if (value.occupancy !== undefined && typeof value.occupancy !== 'string') return false;
  if (value.centralACPreference !== undefined && typeof value.centralACPreference !== 'boolean') return false;
  if (value.driverRoom !== true && value.driverRoom !== false) return false;
  if (!['monthly', 'yearly'].includes(String(value.cadence))) return false;
  if (!Array.isArray(value.areaIds) || !value.areaIds.every(item => typeof item === 'string')) return false;
  if (!Array.isArray(value.catalog)) return false;
  for (const field of ['amenities', 'excludedAmenities', 'services']) {
    if (!Array.isArray(value[field]) || !(value[field] as unknown[]).every(item => typeof item === 'string')) return false;
  }
  if (!isRecord(value.constraintStrengths)
      || Object.values(value.constraintStrengths).some(item => typeof item !== 'string')) return false;
  return true;
}

function parseRecord(raw: string, ownerId: string, draftId?: string): RequirementDraftRecord {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)
        || value.version !== 1
        || value.ownerId !== ownerId
        || typeof value.draftId !== 'string'
        || (draftId !== undefined && value.draftId !== draftId)
        || !validId(value.draftId)
        || typeof value.finalRequirementId !== 'string'
        || !validId(value.finalRequirementId)
        || typeof value.revision !== 'number'
        || !Number.isSafeInteger(value.revision)
        || !validPayload(value.payload)) {
      throw new Error('Stored draft identity or payload is invalid.');
    }
    return value as unknown as RequirementDraftRecord;
  } catch (error) {
    throw new RequirementDraftStorageError('The saved Requirement draft could not be read safely.', error);
  }
}

async function readDraft(
  ownerId: string,
  draftId: string,
  storage: RequirementDraftStorage,
): Promise<RequirementDraftRecord | null> {
  const raw = await storage.getItem(keyFor(ownerId, draftId));
  return raw === null ? null : parseRecord(raw, ownerId, draftId);
}

export async function saveRequirementDraft(input: {
  ownerId: string;
  draftId: string;
  finalRequirementId: string;
  payload: RequirementDraftPayload;
}, storage: RequirementDraftStorage = AsyncStorage): Promise<RequirementDraftRecord> {
  const { ownerId, draftId, finalRequirementId, payload } = input;
  if (!validId(ownerId) || !validId(draftId) || !validId(finalRequirementId) || !validPayload(payload)) {
    throw new RequirementDraftStorageError('The Requirement draft identity or fields are invalid.');
  }
  let saved: RequirementDraftRecord | null = null;
  await writes.enqueue(async () => {
    const key = keyFor(ownerId, draftId);
    const raw = await storage.getItem(key);
    const existing = raw === null ? null : parseRecord(raw, ownerId, draftId);
    if (existing && existing.finalRequirementId !== finalRequirementId) {
      throw new RequirementDraftStorageError('The Requirement draft finalization identity changed.');
    }
    const record: RequirementDraftRecord = {
      version: 1,
      ownerId,
      draftId,
      finalRequirementId,
      revision: Math.max(Date.now(), (existing?.revision ?? 0) + 1),
      payload,
    };
    await storage.setItem(key, JSON.stringify(record));
    saved = record;
  });
  if (!saved) throw new RequirementDraftStorageError('The Requirement draft could not be saved.');
  return saved;
}

export async function loadRequirementDraft(
  ownerId: string,
  draftId: string,
  storage: RequirementDraftStorage = AsyncStorage,
): Promise<RequirementDraftRecord | null> {
  if (!validId(ownerId) || !validId(draftId)) {
    throw new RequirementDraftStorageError('The Requirement draft identity is invalid.');
  }
  try {
    return await readDraft(ownerId, draftId, storage);
  } catch (error) {
    if (error instanceof RequirementDraftStorageError) throw error;
    throw new RequirementDraftStorageError('The Requirement draft could not be loaded.', error);
  }
}

export async function listRequirementDraftsForOwner(
  ownerId: string,
  storage: RequirementDraftStorage = AsyncStorage,
): Promise<RequirementDraftRecord[]> {
  if (!validId(ownerId)) throw new RequirementDraftStorageError('The Requirement draft owner is invalid.');
  try {
    const prefix = ownerPrefix(ownerId);
    const keys = (await storage.getAllKeys()).filter(key => key.startsWith(prefix));
    const records = await Promise.all(keys.map(async key => {
      const raw = await storage.getItem(key);
      if (raw === null) return null;
      const record = parseRecord(raw, ownerId);
      if (key !== keyFor(ownerId, record.draftId)) {
        throw new RequirementDraftStorageError('The saved Requirement draft key does not match its owner identity.');
      }
      return record;
    }));
    return records.filter((record): record is RequirementDraftRecord => record !== null)
      .sort((a, b) => b.revision - a.revision);
  } catch (error) {
    if (error instanceof RequirementDraftStorageError) throw error;
    throw new RequirementDraftStorageError('Requirement drafts could not be listed.', error);
  }
}

export async function clearRequirementDraftIfUnchanged(
  ownerId: string,
  draftId: string,
  expectedRevision: number,
  storage: RequirementDraftStorage = AsyncStorage,
): Promise<boolean> {
  if (!validId(ownerId) || !validId(draftId) || !Number.isSafeInteger(expectedRevision)) {
    throw new RequirementDraftStorageError('The Requirement draft identity is invalid.');
  }
  let removed = false;
  try {
    await writes.enqueue(async () => {
      const key = keyFor(ownerId, draftId);
      const current = await readDraft(ownerId, draftId, storage);
      if (!current || current.revision !== expectedRevision) return;
      await storage.removeItem(key);
      removed = true;
    });
  } catch (error) {
    if (error instanceof RequirementDraftStorageError) throw error;
    throw new RequirementDraftStorageError('The finalized Requirement draft could not be cleared.', error);
  }
  return removed;
}

export async function clearRequirementDraftBeforeNavigation(input: {
  readonly ownerId: string;
  readonly draftId: string;
  readonly expectedRevision: number | null;
  readonly navigate: () => void | Promise<void>;
}, storage: RequirementDraftStorage = AsyncStorage): Promise<'cleared' | 'changed' | 'cleanup_failed' | 'not_saved'> {
  if (input.expectedRevision === null) {
    await input.navigate();
    return 'not_saved';
  }
  let removed: boolean;
  try {
    removed = await clearRequirementDraftIfUnchanged(
      input.ownerId,
      input.draftId,
      input.expectedRevision,
      storage,
    );
  } catch {
    await input.navigate();
    return 'cleanup_failed';
  }
  await input.navigate();
  return removed ? 'cleared' : 'changed';
}