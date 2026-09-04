import type { SQLiteBindParams } from 'expo-sqlite';
import type { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { normalizePropertyCurrency } from '@/constants/market';
import { STAGE_01B1_PROPERTY_MIGRATION_ID } from '@/services/stage01B1CurrencyMigration';
import {
  getCreationTimestamp,
  STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID,
} from '@/services/chronology';

export interface SQLitePropertyRow {
  id: string;
  data: string;
}

export interface SQLiteInitializationDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]>;
  runAsync(source: string, params: SQLiteBindParams): Promise<unknown>;
}

export function getPropertySearchText(property: Property): string {
  const area = getAreaById(property.core.locationArea.id);
  const price = property.activeOffer.transaction === 'sale'
    ? property.activeOffer.salePrice
    : property.activeOffer.rentalPrice;
  return [
    property.core.propertyType,
    property.activeOffer.transaction,
    property.core.locationArea.id,
    property.core.id,
    area?.en,
    area?.ar,
    area?.governorateEn,
    area?.governorateAr,
    price.currencyCode,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

export async function initializeSQLiteStore(options: {
  db: SQLiteInitializationDatabase;
  parsePropertyRow: (row: SQLitePropertyRow) => Property | null;
  parsePersonRow: (row: { id: string; data: string }) => unknown;
  runMutation: (task: () => Promise<void>) => Promise<void>;
}): Promise<void> {
  const { db } = options;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      search_text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS deleted_property_ids (
      id TEXT PRIMARY KEY,
      generation INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      search_text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS property_creation_chronology (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS person_creation_chronology (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS person_property_links (
      person_id TEXT NOT NULL,
      property_core_id TEXT NOT NULL,
      PRIMARY KEY (person_id, property_core_id)
    );
    CREATE TABLE IF NOT EXISTS property_sources (
      property_core_id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seeker_requirements (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requirement_creation_chronology (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
  `);

  const completed = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM app_migrations WHERE id = ?',
    [STAGE_01B1_PROPERTY_MIGRATION_ID],
  );
  const chronologyCompleted = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM app_migrations WHERE id = ?',
    [STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID],
  );
  const rows = await db.getAllAsync<SQLitePropertyRow>(
    'SELECT id, data FROM properties',
    [],
  );
  let allPropertiesReadable = true;
  for (const row of rows) {
    const property = options.parsePropertyRow(row);
    if (!property) {
      allPropertiesReadable = false;
      continue;
    }
    if (!chronologyCompleted) {
      await options.runMutation(async () => {
        await db.runAsync(
          'INSERT OR IGNORE INTO property_creation_chronology (id, created_at) VALUES (?, ?)',
          [row.id, getCreationTimestamp('property', row.id)],
        );
      });
    }
    if (!completed) {
      const normalized = normalizePropertyCurrency(property);
      if (normalized.changed) {
        await options.runMutation(async () => {
          await db.runAsync(
            'UPDATE properties SET data = ?, search_text = ? WHERE id = ?',
            [
              JSON.stringify(normalized.property),
              getPropertySearchText(normalized.property),
              row.id,
            ],
          );
        });
      }
    }
  }

  const people = await db.getAllAsync<{ id: string; data: string }>(
    'SELECT id, data FROM people',
    [],
  );
  let allPeopleReadable = true;
  for (const row of people) {
    const person = options.parsePersonRow(row);
    if (!person) {
      allPeopleReadable = false;
      continue;
    }
    if (!chronologyCompleted) {
      await options.runMutation(async () => {
        await db.runAsync(
          'INSERT OR IGNORE INTO person_creation_chronology (id, created_at) VALUES (?, ?)',
          [row.id, getCreationTimestamp('person', row.id)],
        );
      });
    }
  }

  if (!completed && allPropertiesReadable) {
    await db.runAsync(
      'INSERT INTO app_migrations (id) VALUES (?)',
      [STAGE_01B1_PROPERTY_MIGRATION_ID],
    );
  }
  if (!chronologyCompleted && allPropertiesReadable && allPeopleReadable) {
    await db.runAsync(
      'INSERT INTO app_migrations (id) VALUES (?)',
      [STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID],
    );
  }
}
