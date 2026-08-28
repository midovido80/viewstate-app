import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Property } from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';
import { getAreaById } from '@/constants/kuwait-areas';
import {
  normalizePropertyCurrency,
} from '@/constants/market';
import {
  STAGE_01B1_PROPERTY_MIGRATION_ID,
  migrateStage01B1WebProperties,
} from '@/services/stage01B1CurrencyMigration';

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

export interface PropertyStore {
  init(): Promise<void>;
  saveProperty(property: Property): Promise<void>;
  getProperty(id: string): Promise<Property | null>;
  compareAndUpdate(expected: Property, replacement: Property): Promise<boolean>;
  canSafelyUpdate(): boolean;
  getProperties(): Promise<Property[]>;
  searchProperties(query: string): Promise<Property[]>;
}

const nativeMutations = new SerialTaskQueue();

class SQLiteStore implements PropertyStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialization: Promise<void> | null = null;

  async init() {
    this.initialization ??= this.initialize();
    await this.initialization;
  }

  private async initialize() {
    this.db = await SQLite.openDatabaseAsync('viewstate.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        search_text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY
      );
    `);

    const completed = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM app_migrations WHERE id = ?',
      [STAGE_01B1_PROPERTY_MIGRATION_ID],
    );
    if (!completed) {
      const rows = await this.db.getAllAsync<{ id: string; data: string }>(
        'SELECT id, data FROM properties',
      );
      for (const row of rows) {
        const normalized = normalizePropertyCurrency(JSON.parse(row.data) as Property);
        if (normalized.changed) {
          await nativeMutations.enqueue(async () => {
            await this.db!.runAsync(
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
      await this.db.runAsync(
        'INSERT INTO app_migrations (id) VALUES (?)',
        [STAGE_01B1_PROPERTY_MIGRATION_ID],
      );
    }
  }

  async saveProperty(property: Property) {
    if (!this.db) throw new Error('DB not initialized');
    const searchText = getPropertySearchText(property);
    await nativeMutations.enqueue(async () => {
      const existing = await this.db!.getFirstAsync<{ data: string }>(
        'SELECT data FROM properties WHERE id = ?',
        [property.core.id],
      );
      if (existing) {
        if (existing.data !== JSON.stringify(property)) {
          throw new Error('PROPERTY_ID_ALREADY_EXISTS');
        }
        return;
      }
      await this.db!.runAsync(
        'INSERT INTO properties (id, data, search_text) VALUES (?, ?, ?)',
        [property.core.id, JSON.stringify(property), searchText],
      );
    });
  }

  async getProperty(id: string): Promise<Property | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ data: string }>(
      'SELECT data FROM properties WHERE id = ?',
      [id],
    );
    return row ? JSON.parse(row.data) as Property : null;
  }

  async compareAndUpdate(expected: Property, replacement: Property): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    if (expected.core.id !== replacement.core.id) return false;
    let updated = false;
    await nativeMutations.enqueue(async () => {
      const result = await this.db!.runAsync(
        'UPDATE properties SET data = ?, search_text = ? WHERE id = ? AND data = ?',
        [
          JSON.stringify(replacement),
          getPropertySearchText(replacement),
          expected.core.id,
          JSON.stringify(expected),
        ],
      );
      updated = result.changes === 1;
    });
    return updated;
  }

  canSafelyUpdate() {
    return true;
  }

  async getProperties(): Promise<Property[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ data: string }>('SELECT data FROM properties ORDER BY id DESC');
    return rows.map(row => JSON.parse(row.data) as Property);
  }

  async searchProperties(query: string): Promise<Property[]> {
    if (!this.db) throw new Error('DB not initialized');
    const properties = await this.getProperties();
    const term = query.toLocaleLowerCase();
    return properties.filter(property => getPropertySearchText(property).includes(term));
  }
}

class WebStore implements PropertyStore {
  private readonly KEY = '@viewstate_properties';
  private initialization: Promise<void> | null = null;

  async init() {
    this.initialization ??= migrateStage01B1WebProperties(
      AsyncStorage,
      this.KEY,
    ).then(() => undefined);
    await this.initialization;
  }

  private async getAll(): Promise<Property[]> {
    const data = await AsyncStorage.getItem(this.KEY);
    return data ? JSON.parse(data) : [];
  }

  private get lockManager(): { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T> } | null {
    const manager = typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { locks?: unknown }).locks;
    if (!manager || typeof (manager as { request?: unknown }).request !== 'function') return null;
    return manager as { request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T> };
  }

  private async withMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.lockManager;
    if (!locks) {
      throw new Error('SAFE_WEB_MUTATION_UNSUPPORTED');
    }
    return locks.request('viewstate-properties-mutation', { mode: 'exclusive' }, work);
  }

  async saveProperty(property: Property) {
    await this.withMutationLock(async () => {
      const all = await this.getAll();
      const existing = all.findIndex(p => p.core.id === property.core.id);
      if (existing >= 0) {
        if (JSON.stringify(all[existing]) !== JSON.stringify(property)) {
          throw new Error('PROPERTY_ID_ALREADY_EXISTS');
        }
        return;
      }
      all.unshift(property);
      await AsyncStorage.setItem(this.KEY, JSON.stringify(all));
    });
  }

  async getProperty(id: string): Promise<Property | null> {
    const matching = (await this.getAll()).filter(property => property.core.id === id);
    if (matching.length > 1) throw new Error('DUPLICATE_PROPERTY');
    return matching[0] ?? null;
  }

  async compareAndUpdate(expected: Property, replacement: Property): Promise<boolean> {
    if (expected.core.id !== replacement.core.id || !this.canSafelyUpdate()) return false;
    return this.withMutationLock(async () => {
      const all = await this.getAll();
      const matching = all
        .map((property, index) => ({ property, index }))
        .filter(item => item.property.core.id === expected.core.id);
      if (
        matching.length !== 1
        || JSON.stringify(matching[0].property) !== JSON.stringify(expected)
      ) {
        return false;
      }
      all[matching[0].index] = replacement;
      await AsyncStorage.setItem(this.KEY, JSON.stringify(all));
      return true;
    });
  }

  canSafelyUpdate() {
    return this.lockManager !== null;
  }

  async getProperties(): Promise<Property[]> {
    return this.getAll();
  }

  async searchProperties(query: string): Promise<Property[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(p => {
      return getPropertySearchText(p).includes(q);
    });
  }
}

export const store: PropertyStore = Platform.OS === 'web' ? new WebStore() : new SQLiteStore();
