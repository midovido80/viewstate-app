import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Property } from '@workspace/property-domain';
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
  getProperties(): Promise<Property[]>;
  searchProperties(query: string): Promise<Property[]>;
}

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
          await this.db.runAsync(
            'UPDATE properties SET data = ?, search_text = ? WHERE id = ?',
            [
              JSON.stringify(normalized.property),
              getPropertySearchText(normalized.property),
              row.id,
            ],
          );
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

    await this.db.runAsync(
      'INSERT OR REPLACE INTO properties (id, data, search_text) VALUES (?, ?, ?)',
      [property.core.id, JSON.stringify(property), searchText]
    );
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

  async saveProperty(property: Property) {
    const all = await this.getAll();
    const existing = all.findIndex(p => p.core.id === property.core.id);
    if (existing >= 0) {
      all[existing] = property;
    } else {
      all.unshift(property);
    }
    await AsyncStorage.setItem(this.KEY, JSON.stringify(all));
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
