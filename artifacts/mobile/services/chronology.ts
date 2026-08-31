import type { Person } from '@/services/people';
import { assertValidPerson } from '@/services/people';
import type { Property } from '@workspace/property-domain';
import { validateProperty } from '@workspace/property-domain';

export type ChronologyRecordType = 'property' | 'person';

export const UNKNOWN_CREATION_TIMESTAMP = 0;
export const STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID =
  'stage-01b-global-uuid-chronology-v1';
export const WEB_PROPERTY_CHRONOLOGY_KEY =
  '@viewstate_property_creation_chronology_v1';
export const WEB_PERSON_CHRONOLOGY_KEY =
  '@viewstate_person_creation_chronology_v1';

export interface ChronologyEntry {
  readonly id: string;
  readonly createdAt: number;
}

export interface ChronologyStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function isValidTimestamp(value: number): boolean {
  // The old generators used Date.now(), so only plausible millisecond epochs
  // are accepted as recovered history.
  return Number.isSafeInteger(value)
    && value >= Date.UTC(2000, 0, 1)
    && value <= Date.UTC(2100, 0, 1);
}

function parseLegacyTimestampPrefix(id: string): number | null {
  const match = /^(\d{10,13})[a-z0-9]{9}$/.exec(id);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return isValidTimestamp(timestamp) ? timestamp : null;
}

function parseLegacyPersonTimestamp(id: string): number | null {
  const match = /^person-(\d{10,13})-[a-z0-9]{8}$/.exec(id);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return isValidTimestamp(timestamp) ? timestamp : null;
}

export function getLegacyCreationTimestamp(
  type: ChronologyRecordType,
  id: string,
): number | null {
  return type === 'property'
    ? parseLegacyTimestampPrefix(id)
    : parseLegacyPersonTimestamp(id);
}

export function getCreationTimestamp(
  type: ChronologyRecordType,
  id: string,
): number {
  return getLegacyCreationTimestamp(type, id) ?? UNKNOWN_CREATION_TIMESTAMP;
}

export function createCreationTimestamp(): number {
  return Date.now();
}

export function compareChronology(
  left: ChronologyEntry,
  right: ChronologyEntry,
): number {
  return right.createdAt - left.createdAt
    || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0);
}

export function sortByChronology<T>(
  records: readonly T[],
  getEntry: (record: T) => ChronologyEntry,
): T[] {
  return [...records].sort((left, right) => compareChronology(
    getEntry(left),
    getEntry(right),
  ));
}

interface StoredChronologyMap {
  readonly version: 1;
  readonly entries: Record<string, number>;
}

function parseChronologyMap(raw: string | null): Map<string, number> {
  if (raw === null) return new Map();
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || (parsed as { version?: unknown }).version !== 1
    || typeof (parsed as { entries?: unknown }).entries !== 'object'
    || (parsed as { entries?: unknown }).entries === null
    || Array.isArray((parsed as { entries: unknown }).entries)
  ) {
    throw new Error('UNREADABLE_CREATION_CHRONOLOGY');
  }

  const entries = (parsed as StoredChronologyMap).entries;
  const result = new Map<string, number>();
  for (const [id, timestamp] of Object.entries(entries)) {
    if (!id || !isValidTimestamp(timestamp) && timestamp !== UNKNOWN_CREATION_TIMESTAMP) {
      throw new Error('UNREADABLE_CREATION_CHRONOLOGY');
    }
    result.set(id, timestamp);
  }
  return result;
}

async function loadChronologyMap(
  storage: ChronologyStorage,
  key: string,
): Promise<Map<string, number>> {
  return parseChronologyMap(await storage.getItem(key));
}

async function saveChronologyMap(
  storage: ChronologyStorage,
  key: string,
  entries: Map<string, number>,
): Promise<void> {
  const serialized: StoredChronologyMap = {
    version: 1,
    entries: Object.fromEntries([...entries].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0)),
  };
  await storage.setItem(key, JSON.stringify(serialized));
}

function propertyId(value: unknown): string | null {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as Property).core?.id !== 'string'
    || !validateProperty(value as Property).ok
  ) return null;
  return (value as Property).core.id;
}

function personId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  try {
    assertValidPerson(value as Person);
    return typeof (value as Person).id === 'string' ? (value as Person).id : null;
  } catch {
    return null;
  }
}

async function readArray(
  storage: ChronologyStorage,
  key: string,
): Promise<unknown[]> {
  const raw = await storage.getItem(key);
  if (raw === null) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('UNREADABLE_RECORD_STORAGE');
  return parsed;
}

/**
 * Backfills metadata without touching the existing WebStore record arrays.
 * Invalid entries are preserved and keep the migration marker unset so a
 * later repaired pass can finish the migration.
 */
export async function migrateWebStoreChronology(options: {
  readonly storage: ChronologyStorage;
  readonly propertiesKey: string;
  readonly peopleKey: string;
}): Promise<void> {
  const { storage, propertiesKey, peopleKey } = options;
  if (await storage.getItem(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID)) return;

  const [properties, people, propertyChronology, personChronology] = await Promise.all([
    readArray(storage, propertiesKey),
    readArray(storage, peopleKey),
    loadChronologyMap(storage, WEB_PROPERTY_CHRONOLOGY_KEY),
    loadChronologyMap(storage, WEB_PERSON_CHRONOLOGY_KEY),
  ]);
  let allReadable = true;
  let propertyChanged = false;
  let personChanged = false;

  for (const value of properties) {
    const id = propertyId(value);
    if (id === null) {
      allReadable = false;
      continue;
    }
    if (!propertyChronology.has(id)) {
      propertyChronology.set(id, getCreationTimestamp('property', id));
      propertyChanged = true;
    }
  }
  for (const value of people) {
    const id = personId(value);
    if (id === null) {
      allReadable = false;
      continue;
    }
    if (!personChronology.has(id)) {
      personChronology.set(id, getCreationTimestamp('person', id));
      personChanged = true;
    }
  }

  if (propertyChanged) {
    await saveChronologyMap(storage, WEB_PROPERTY_CHRONOLOGY_KEY, propertyChronology);
  }
  if (personChanged) {
    await saveChronologyMap(storage, WEB_PERSON_CHRONOLOGY_KEY, personChronology);
  }
  if (allReadable) {
    await storage.setItem(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID, 'complete');
  }
}

export async function getWebChronology(
  storage: ChronologyStorage,
  type: ChronologyRecordType,
): Promise<Map<string, number>> {
  return loadChronologyMap(
    storage,
    type === 'property' ? WEB_PROPERTY_CHRONOLOGY_KEY : WEB_PERSON_CHRONOLOGY_KEY,
  );
}

export async function addWebChronology(
  storage: ChronologyStorage,
  type: ChronologyRecordType,
  id: string,
  timestamp: number,
): Promise<void> {
  const key = type === 'property'
    ? WEB_PROPERTY_CHRONOLOGY_KEY
    : WEB_PERSON_CHRONOLOGY_KEY;
  const entries = await loadChronologyMap(storage, key);
  if (!entries.has(id)) {
    entries.set(id, timestamp);
    await saveChronologyMap(storage, key, entries);
  }
}