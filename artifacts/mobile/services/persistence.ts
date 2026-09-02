import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Property, validateProperty } from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';
import { validatePropertySource } from '@workspace/property-domain';
import {
  appendUnreadableRecord,
  parseStoredRecord,
  type UnreadableRecord,
} from '@/services/localRecordParser';
import { migrateStage01B1WebProperties } from '@/services/stage01B1CurrencyMigration';
import {
  getPropertySearchText,
  initializeSQLiteStore,
  type SQLiteInitializationDatabase,
} from '@/services/sqliteStoreInitialization';
import {
  Person,
  PersonPropertyLink,
  PersonStore,
  PropertySource,
  assertValidPerson,
  getPersonSearchText,
  personMatchesSearch,
} from '@/services/people';
import {
  addWebChronology,
  createCreationTimestamp,
  getWebChronology,
  migrateWebStoreChronology,
  sortByChronology,
  UNKNOWN_CREATION_TIMESTAMP,
} from '@/services/chronology';
import {
  SQLiteRequirementStore,
  WEB_REQUIREMENTS_KEY,
  WebRequirementStore,
  type RequirementStore,
} from '@/services/requirementPersistence';

export { getPropertySearchText };

export interface PropertyStore {
  init(): Promise<void>;
  saveProperty(property: Property): Promise<void>;
  getProperty(id: string): Promise<Property | null>;
  compareAndUpdate(expected: Property, replacement: Property): Promise<boolean>;
  canSafelyUpdate(): boolean;
  canPermanentlyDelete(): boolean;
  getProperties(): Promise<Property[]>;
  searchProperties(query: string): Promise<Property[]>;
  deleteProperty(expected: Property): Promise<PropertyDeletionResult>;
  deletePropertiesSnapshot(
    expected: readonly Property[],
    capability?: PropertyDeletionCapability,
  ): Promise<PropertyDeletionResult>;
  getPropertyInventory(): Promise<PropertyInventory>;
}

export type PropertyDeletionResult =
  | { status: 'deleted'; count: number }
  | { status: 'missing' | 'stale' | 'duplicate' | 'unsupported' };

export interface PropertyInventory {
  count: number;
  ids: string[];
}

export interface LocalStoreIntegrityStatus {
  readonly unreadableRecords: readonly UnreadableRecord[];
  readonly hasUnreadableRecords: boolean;
}

export interface PropertyDeletionCapability {
  /** The caller has excluded old writers that do not honor deletion fences. */
  cooperatingWritersConfirmed: true;
}

interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface LockManager {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
}

const nativeMutations = new SerialTaskQueue();

export class SQLiteStore implements PropertyStore, PersonStore, RequirementStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialization: Promise<void> | null = null;
  private integrityWarnings: UnreadableRecord[] = [];
  private readonly requirements = new SQLiteRequirementStore(
    () => {
      if (!this.db) throw new Error('DB not initialized');
      return this.db;
    },
    this,
    warning => this.addIntegrityWarning(warning),
  );

  constructor(
    private readonly databaseFactory: () => Promise<SQLite.SQLiteDatabase> =
      () => SQLite.openDatabaseAsync('viewstate.db'),
  ) {}

  async init() {
    if (!this.initialization) {
      const attempt = this.initialize();
      this.initialization = attempt;
      attempt.catch(() => {
        if (this.initialization === attempt) this.initialization = null;
      });
    }
    await this.initialization;
  }

  getIntegrityStatus(): LocalStoreIntegrityStatus {
    return {
      unreadableRecords: [...this.integrityWarnings],
      hasUnreadableRecords: this.integrityWarnings.length > 0,
    };
  }

  private addIntegrityWarning(warning: UnreadableRecord): void {
    appendUnreadableRecord(this.integrityWarnings, warning);
  }

  private parsePropertyRow(row: { id: string; data: string }): Property | null {
    const result = parseStoredRecord<Property>(
      row.data,
      { type: 'property', id: row.id },
      value => {
        try {
          const property = value as Property;
          return property.core?.id === row.id && validateProperty(property).ok;
        } catch {
          return false;
        }
      },
    );
    if (!result.ok) {
      this.addIntegrityWarning(result.warning);
      return null;
    }
    return result.value;
  }

  private parsePersonRow(row: { id: string; data: string }): Person | null {
    const result = parseStoredRecord<Person>(
      row.data,
      { type: 'person', id: row.id },
      value => {
        try {
          const person = value as Person;
          if (person.id !== row.id) return false;
          assertValidPerson(person);
          return true;
        } catch {
          return false;
        }
      },
    );
    if (!result.ok) {
      this.addIntegrityWarning(result.warning);
      return null;
    }
    return result.value;
  }

  private async initialize() {
    this.integrityWarnings = [];
    this.db = await this.databaseFactory();
    await initializeSQLiteStore({
      db: this.db as SQLiteInitializationDatabase,
      parsePropertyRow: row => this.parsePropertyRow(row),
      parsePersonRow: row => this.parsePersonRow(row),
      runMutation: task => nativeMutations.enqueue(task),
    });
  }

  async saveProperty(property: Property) {
    if (!this.db) throw new Error('DB not initialized');
    const searchText = getPropertySearchText(property);
    await nativeMutations.enqueue(async () => {
      const existing = await this.db!.getFirstAsync<{ data: string }>(
        'SELECT data FROM properties WHERE id = ?',
        [property.core.id],
      );
      const deleted = await this.db!.getFirstAsync<{ id: string }>(
        'SELECT id FROM deleted_property_ids WHERE id = ?',
        [property.core.id],
      );
      if (deleted) throw new Error('PROPERTY_ID_DELETED');
      if (existing) {
        if (existing.data !== JSON.stringify(property)) {
          throw new Error('PROPERTY_ID_ALREADY_EXISTS');
        }
        return;
      }
      await this.db!.withTransactionAsync(async () => {
        await this.db!.runAsync(
          'INSERT INTO properties (id, data, search_text) VALUES (?, ?, ?)',
          [property.core.id, JSON.stringify(property), searchText],
        );
        await this.db!.runAsync(
          'INSERT OR IGNORE INTO property_creation_chronology (id, created_at) VALUES (?, ?)',
          [property.core.id, createCreationTimestamp()],
        );
      });
    });
  }

  async getProperty(id: string): Promise<Property | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ id: string; data: string }>(
      'SELECT id, data FROM properties WHERE id = ?',
      [id],
    );
    return row ? this.parsePropertyRow(row) : null;
  }

  async compareAndUpdate(expected: Property, replacement: Property): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    if (expected.core.id !== replacement.core.id) return false;
    let updated = false;
    await nativeMutations.enqueue(async () => {
      const deleted = await this.db!.getFirstAsync<{ id: string }>(
        'SELECT id FROM deleted_property_ids WHERE id = ?',
        [expected.core.id],
      );
      if (deleted) return;
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

  canPermanentlyDelete() {
    return true;
  }

  async getProperties(): Promise<Property[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ id: string; data: string }>(
      'SELECT id, data FROM properties',
    );
    const chronology = await this.db.getAllAsync<{ id: string; created_at: number }>(
      'SELECT id, created_at FROM property_creation_chronology',
      [],
    );
    const chronologyById = new Map(chronology.map(row => [row.id, row.created_at]));
    const properties = rows.flatMap(row => {
      const property = this.parsePropertyRow(row);
      return property
        ? [{
          property,
          entry: {
            id: row.id,
            createdAt: chronologyById.get(row.id)
              ?? UNKNOWN_CREATION_TIMESTAMP,
          },
        }]
        : [];
    });
    return sortByChronology(properties, item => item.entry).map(item => item.property);
  }

  async searchProperties(query: string): Promise<Property[]> {
    if (!this.db) throw new Error('DB not initialized');
    const properties = await this.getProperties();
    const term = query.toLocaleLowerCase();
    return properties.filter(property => getPropertySearchText(property).includes(term));
  }

  async deleteProperty(expected: Property): Promise<PropertyDeletionResult> {
    return this.deletePropertiesSnapshot([expected], { cooperatingWritersConfirmed: true });
  }

  async deletePropertiesSnapshot(
    expected: readonly Property[],
    _capability?: PropertyDeletionCapability,
  ): Promise<PropertyDeletionResult> {
    if (!this.db) throw new Error('DB not initialized');
    if (new Set(expected.map(property => property.core.id)).size !== expected.length) {
      return { status: 'duplicate' };
    }
    let result: PropertyDeletionResult = { status: 'stale' };
    await nativeMutations.enqueue(async () => {
      await this.db!.withTransactionAsync(async () => {
        for (const property of expected) {
          const rows = await this.db!.getAllAsync<{ data: string }>(
            'SELECT data FROM properties WHERE id = ?',
            [property.core.id],
          );
          if (rows.length === 0) {
            result = { status: 'missing' };
            throw new Error('DELETE_PRECONDITION');
          }
          if (rows.length !== 1 || rows[0].data !== JSON.stringify(property)) {
            result = rows.length > 1 ? { status: 'duplicate' } : { status: 'stale' };
            throw new Error('DELETE_PRECONDITION');
          }
        }
        for (const property of expected) {
          await this.db!.runAsync(
            `INSERT INTO deleted_property_ids (id, generation) VALUES (?, 1)
             ON CONFLICT(id) DO UPDATE SET generation = generation + 1`,
            [property.core.id],
          );
          const deleted = await this.db!.runAsync(
            'DELETE FROM properties WHERE id = ? AND data = ?',
            [property.core.id, JSON.stringify(property)],
          );
          if (deleted.changes !== 1) throw new Error('DELETE_PRECONDITION');
           await this.db!.runAsync(
             'DELETE FROM person_property_links WHERE property_core_id = ?',
             [property.core.id],
           );
            await this.db!.runAsync(
              'DELETE FROM property_sources WHERE property_core_id = ?',
              [property.core.id],
            );
        }
        result = { status: 'deleted', count: expected.length };
      });
    }).catch(error => {
      if (error instanceof Error && error.message === 'DELETE_PRECONDITION') return;
      throw error;
    });
    return result;
  }

  async getPropertyInventory(): Promise<PropertyInventory> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ id: string }>('SELECT id FROM properties ORDER BY id');
    return { count: rows.length, ids: rows.map(row => row.id) };
  }

  async savePerson(person: Person): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    assertValidPerson(person);
    await nativeMutations.enqueue(async () => {
      const existing = await this.db!.getFirstAsync<{ data: string }>(
        'SELECT data FROM people WHERE id = ?',
        [person.id],
      );
      if (existing) {
        if (existing.data !== JSON.stringify(person)) throw new Error('PERSON_ID_ALREADY_EXISTS');
        return;
      }
      await this.db!.withTransactionAsync(async () => {
        await this.db!.runAsync(
          'INSERT INTO people (id, data, search_text) VALUES (?, ?, ?)',
          [person.id, JSON.stringify(person), getPersonSearchText(person)],
        );
        await this.db!.runAsync(
          'INSERT OR IGNORE INTO person_creation_chronology (id, created_at) VALUES (?, ?)',
          [person.id, createCreationTimestamp()],
        );
      });
    });
  }

  async getPerson(id: string): Promise<Person | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{ id: string; data: string }>(
      'SELECT id, data FROM people WHERE id = ?',
      [id],
    );
    return row ? this.parsePersonRow(row) : null;
  }

  async updatePerson(expected: Person, replacement: Person): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    if (expected.id !== replacement.id) return false;
    assertValidPerson(replacement);
    let updated = false;
    await nativeMutations.enqueue(async () => {
      const result = await this.db!.runAsync(
        'UPDATE people SET data = ?, search_text = ? WHERE id = ? AND data = ?',
        [
          JSON.stringify(replacement),
          getPersonSearchText(replacement),
          expected.id,
          JSON.stringify(expected),
        ],
      );
      updated = result.changes === 1;
    });
    return updated;
  }

  async getPeople(): Promise<Person[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ id: string; data: string }>(
      'SELECT id, data FROM people',
    );
    const chronology = await this.db.getAllAsync<{ id: string; created_at: number }>(
      'SELECT id, created_at FROM person_creation_chronology',
      [],
    );
    const chronologyById = new Map(chronology.map(row => [row.id, row.created_at]));
    const people = rows.flatMap(row => {
      const person = this.parsePersonRow(row);
      return person
        ? [{
          person,
          entry: {
            id: row.id,
            createdAt: chronologyById.get(row.id)
              ?? UNKNOWN_CREATION_TIMESTAMP,
          },
        }]
        : [];
    });
    return sortByChronology(people, item => item.entry).map(item => item.person);
  }

  async searchPeople(query: string): Promise<Person[]> {
    if (!this.db) throw new Error('DB not initialized');
    return (await this.getPeople()).filter(person => personMatchesSearch(person, query));
  }

  async deletePerson(id: string): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    let deleted = false;
    await nativeMutations.enqueue(async () => {
      await this.db!.withTransactionAsync(async () => {
        await this.db!.runAsync('DELETE FROM person_property_links WHERE person_id = ?', [id]);
        await this.db!.runAsync('DELETE FROM property_sources WHERE person_id = ?', [id]);
        const result = await this.db!.runAsync('DELETE FROM people WHERE id = ?', [id]);
        deleted = result.changes === 1;
      });
    });
    return deleted;
  }

  async linkPersonToProperty(link: PersonPropertyLink): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    if (!link.personId || !link.propertyCoreId) throw new Error('INVALID_PERSON_PROPERTY_LINK');
    await nativeMutations.enqueue(async () => {
      const [person, property] = await Promise.all([
        this.db!.getFirstAsync<{ id: string }>('SELECT id FROM people WHERE id = ?', [link.personId]),
        this.db!.getFirstAsync<{ id: string }>('SELECT id FROM properties WHERE id = ?', [link.propertyCoreId]),
      ]);
      if (!person || !property) throw new Error('PERSON_PROPERTY_LINK_TARGET_MISSING');
      await this.db!.runAsync(
        'INSERT OR IGNORE INTO person_property_links (person_id, property_core_id) VALUES (?, ?)',
        [link.personId, link.propertyCoreId],
      );
    });
  }

  async unlinkPersonFromProperty(link: PersonPropertyLink): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    let unlinked = false;
    await nativeMutations.enqueue(async () => {
      const result = await this.db!.runAsync(
        'DELETE FROM person_property_links WHERE person_id = ? AND property_core_id = ?',
        [link.personId, link.propertyCoreId],
      );
      unlinked = result.changes === 1;
    });
    return unlinked;
  }

  async getPersonPropertyLinks(): Promise<PersonPropertyLink[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{ personId: string; propertyCoreId: string }>(
      `SELECT person_id AS personId, property_core_id AS propertyCoreId
       FROM person_property_links ORDER BY person_id, property_core_id`,
    );
    return rows;
  }

  async getLinksForPerson(personId: string): Promise<PersonPropertyLink[]> {
    return (await this.getPersonPropertyLinks()).filter(link => link.personId === personId);
  }

  async getLinksForProperty(propertyCoreId: string): Promise<PersonPropertyLink[]> {
    return (await this.getPersonPropertyLinks())
      .filter(link => link.propertyCoreId === propertyCoreId);
  }

  async setPropertySource(source: PropertySource): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    const validation = validatePropertySource(source);
    if (!validation.ok) throw new Error('INVALID_PROPERTY_SOURCE');
    await nativeMutations.enqueue(async () => {
      await this.db!.withTransactionAsync(async () => {
        const [person, property] = await Promise.all([
          this.db!.getFirstAsync<{ id: string }>('SELECT id FROM people WHERE id = ?', [source.personId]),
          this.db!.getFirstAsync<{ id: string }>('SELECT id FROM properties WHERE id = ?', [source.propertyCoreId]),
        ]);
        if (!person || !property) throw new Error('PROPERTY_SOURCE_TARGET_MISSING');
        await this.db!.runAsync(
          `INSERT INTO property_sources (property_core_id, person_id, role) VALUES (?, ?, ?)
           ON CONFLICT(property_core_id) DO UPDATE SET person_id = excluded.person_id, role = excluded.role`,
          [source.propertyCoreId, source.personId, source.role],
        );
      });
    });
  }

  async getPropertySource(propertyCoreId: string): Promise<PropertySource | null> {
    if (!this.db) throw new Error('DB not initialized');
    const row = await this.db.getFirstAsync<{
      propertyCoreId: string; personId: string; role: PropertySource['role'];
    }>(
      `SELECT property_core_id AS propertyCoreId, person_id AS personId, role
       FROM property_sources WHERE property_core_id = ?`,
      [propertyCoreId],
    );
    if (!row) return null;
    const source = { propertyCoreId: row.propertyCoreId, personId: row.personId, role: row.role };
    if (!validatePropertySource(source).ok) throw new Error('UNREADABLE_PROPERTY_SOURCE');
    return source;
  }

  async removePropertySource(propertyCoreId: string): Promise<boolean> {
    if (!this.db) throw new Error('DB not initialized');
    let removed = false;
    await nativeMutations.enqueue(async () => {
      const result = await this.db!.runAsync(
        'DELETE FROM property_sources WHERE property_core_id = ?',
        [propertyCoreId],
      );
      removed = result.changes === 1;
    });
    return removed;
  }

  async getPropertySourcesForPerson(personId: string): Promise<PropertySource[]> {
    if (!this.db) throw new Error('DB not initialized');
    const rows = await this.db.getAllAsync<{
      propertyCoreId: string; personId: string; role: PropertySource['role'];
    }>(
      `SELECT property_core_id AS propertyCoreId, person_id AS personId, role
       FROM property_sources WHERE person_id = ? ORDER BY property_core_id`,
      [personId],
    );
    const sources = rows.map(row => ({ propertyCoreId: row.propertyCoreId, personId: row.personId, role: row.role }));
    if (sources.some(source => !validatePropertySource(source).ok)) {
      throw new Error('UNREADABLE_PROPERTY_SOURCE');
    }
    return sources;
  }

  saveRequirement = (requirement: Parameters<RequirementStore['saveRequirement']>[0]) =>
    this.requirements.saveRequirement(requirement);

  getRequirement = (id: string) => this.requirements.getRequirement(id);

  getRequirements = () => this.requirements.getRequirements();

  getRequirementsForSeeker = (seekerId: string) =>
    this.requirements.getRequirementsForSeeker(seekerId);

  updateRequirement = (
    expected: Parameters<RequirementStore['updateRequirement']>[0],
    replacement: Parameters<RequirementStore['updateRequirement']>[1],
  ) => this.requirements.updateRequirement(expected, replacement);
}

export class WebStore implements PropertyStore, PersonStore, RequirementStore {
  private readonly KEY = '@viewstate_properties';
  private readonly DELETED_KEY = '@viewstate_deleted_property_ids_v1';
  private readonly PEOPLE_KEY = '@viewstate_people_v1';
  private readonly PERSON_PROPERTY_LINKS_KEY = '@viewstate_person_property_links_v1';
  private readonly PROPERTY_SOURCES_KEY = '@viewstate_property_sources_v1';
  private initialization: Promise<void> | null = null;
  private integrityWarnings: UnreadableRecord[] = [];
  private readonly requirements: WebRequirementStore;

  constructor(
    private readonly storage: KeyValueStorage = AsyncStorage,
    private readonly suppliedLocks?: LockManager | null,
  ) {
    this.requirements = new WebRequirementStore(
      storage,
      () => this.lockManager,
      this,
      warning => appendUnreadableRecord(this.integrityWarnings, warning),
    );
  }

  async init() {
    if (!this.initialization) {
      const attempt = migrateStage01B1WebProperties(this.storage, this.KEY)
        .then(() => this.withChronologyMutationLock(() =>
          migrateWebStoreChronology({
            storage: this.storage,
            propertiesKey: this.KEY,
            peopleKey: this.PEOPLE_KEY,
            requirementsKey: WEB_REQUIREMENTS_KEY,
          })))
        .then(() => undefined);
      this.initialization = attempt;
      attempt.catch(() => {
        if (this.initialization === attempt) this.initialization = null;
      });
    }
    await this.initialization;
  }

  getIntegrityStatus(): LocalStoreIntegrityStatus {
    return {
      unreadableRecords: [...this.integrityWarnings],
      hasUnreadableRecords: this.integrityWarnings.length > 0,
    };
  }

  /** Raw array access for non-deletion mutations; never call from visible reads. */
  private async getAllRaw(): Promise<Property[]> {
    const data = await this.storage.getItem(this.KEY);
    if (data === null) return [];
    const parsed = JSON.parse(data) as unknown;
    if (!Array.isArray(parsed)) throw new Error('UNREADABLE_PROPERTY_STORAGE');
    return parsed as Property[];
  }

  /** Visible reads honor durable ID-only deletion fences without recursive reads. */
  private async getAll(): Promise<Property[]> {
    const [all, deletedIds] = await Promise.all([
      this.getAllRaw(),
      this.getDeletedIds(),
    ]);
    return all.filter(property => !deletedIds.has(property.core.id));
  }

  private get lockManager(): LockManager | null {
    if (this.suppliedLocks !== undefined) return this.suppliedLocks;
    const manager = typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { locks?: unknown }).locks;
    if (!manager || typeof (manager as { request?: unknown }).request !== 'function') return null;
    return manager as LockManager;
  }

  private async withMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.lockManager;
    if (!locks) {
      throw new Error('SAFE_WEB_MUTATION_UNSUPPORTED');
    }
    return locks.request('viewstate-properties-mutation', { mode: 'exclusive' }, work);
  }

  private async withChronologyMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.lockManager;
    // Without Web Locks, browser mutations are already disabled. Initialization
    // may still safely perform its one-time migration because no writer can race it.
    if (!locks) return work();
    return locks.request('viewstate-chronology-mutation', { mode: 'exclusive' }, work);
  }

  async saveProperty(property: Property) {
    await this.withChronologyMutationLock(() =>
      this.withMutationLock(async () => {
        const all = await this.getAllRaw();
        if ((await this.getDeletedIds()).has(property.core.id)) {
          throw new Error('PROPERTY_ID_DELETED');
        }
        const existing = all.findIndex(p => p.core.id === property.core.id);
        if (existing >= 0) {
          if (JSON.stringify(all[existing]) !== JSON.stringify(property)) {
            throw new Error('PROPERTY_ID_ALREADY_EXISTS');
          }
          const chronology = await getWebChronology(this.storage, 'property');
          await addWebChronology(
            this.storage,
            'property',
            property.core.id,
            chronology.get(property.core.id) ?? UNKNOWN_CREATION_TIMESTAMP,
          );
          return;
        }
        await addWebChronology(
          this.storage,
          'property',
          property.core.id,
          createCreationTimestamp(),
        );
        all.unshift(property);
        await this.storage.setItem(this.KEY, JSON.stringify(all));
      }));
  }

  async getProperty(id: string): Promise<Property | null> {
    const matching = (await this.getAll()).filter(property => property.core.id === id);
    if (matching.length > 1) throw new Error('DUPLICATE_PROPERTY');
    return matching[0] ?? null;
  }

  async compareAndUpdate(expected: Property, replacement: Property): Promise<boolean> {
    if (expected.core.id !== replacement.core.id || !this.canSafelyUpdate()) return false;
    return this.withMutationLock(async () => {
      const all = await this.getAllRaw();
      if ((await this.getDeletedIds()).has(expected.core.id)) return false;
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
      await this.storage.setItem(this.KEY, JSON.stringify(all));
      return true;
    });
  }

  canSafelyUpdate() {
    return this.lockManager !== null;
  }

  canPermanentlyDelete() {
    return false;
  }

  async getProperties(): Promise<Property[]> {
    const [properties, chronology] = await Promise.all([
      this.getAll(),
      getWebChronology(this.storage, 'property'),
    ]);
    return sortByChronology(properties, property => ({
      id: property.core.id,
      createdAt: chronology.get(property.core.id)
        ?? UNKNOWN_CREATION_TIMESTAMP,
    }));
  }

  async searchProperties(query: string): Promise<Property[]> {
    const all = await this.getProperties();
    const q = query.toLowerCase();
    return all.filter(p => {
      return getPropertySearchText(p).includes(q);
    });
  }

  private async getDeletedIds(): Promise<Set<string>> {
    const raw = await this.storage.getItem(this.DELETED_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || (parsed as { version?: unknown }).version !== 1
      || !Array.isArray((parsed as { ids?: unknown }).ids)
      || !(parsed as { ids: unknown[] }).ids.every(id => typeof id === 'string')
    ) throw new Error('UNREADABLE_DELETION_SAFEGUARD');
    return new Set((parsed as { ids: string[] }).ids);
  }

  async deleteProperty(expected: Property): Promise<PropertyDeletionResult> {
    // Permanent browser deletion is intentionally unavailable: AsyncStorage
    // cannot provide the required crash-atomic fence and array mutation.
    return { status: 'unsupported' };
  }

  async deletePropertiesSnapshot(
    _expected: readonly Property[],
    _capability?: PropertyDeletionCapability,
  ): Promise<PropertyDeletionResult> {
    // Do not add a caller assertion or lock-based escape hatch here. Only the
    // native SQLite adapter has a transaction spanning fence and exact deletes.
    return { status: 'unsupported' };
  }

  async getPropertyInventory(): Promise<PropertyInventory> {
    const all = await this.getAll();
    const ids = all.map(property => property.core.id);
    if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_PROPERTY');
    return { count: ids.length, ids: [...ids].sort() };
  }

  private async getAllPeople(): Promise<Person[]> {
    const raw = await this.storage.getItem(this.PEOPLE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('UNREADABLE_PERSON_STORAGE');
    return parsed as Person[];
  }

  private async getAllPersonPropertyLinks(): Promise<PersonPropertyLink[]> {
    const raw = await this.storage.getItem(this.PERSON_PROPERTY_LINKS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('UNREADABLE_PERSON_PROPERTY_LINK_STORAGE');
    return parsed as PersonPropertyLink[];
  }

  private async getAllPropertySources(): Promise<PropertySource[]> {
    const raw = await this.storage.getItem(this.PROPERTY_SOURCES_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('UNREADABLE_PROPERTY_SOURCE_STORAGE');
    const sources = parsed as PropertySource[];
    if (sources.some(source => !validatePropertySource(source).ok)) {
      throw new Error('UNREADABLE_PROPERTY_SOURCE_STORAGE');
    }
    if (new Set(sources.map(source => source.propertyCoreId)).size !== sources.length) {
      throw new Error('DUPLICATE_PROPERTY_SOURCE');
    }
    return sources;
  }

  private async withPeopleMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.lockManager;
    if (!locks) throw new Error('SAFE_WEB_MUTATION_UNSUPPORTED');
    return locks.request('viewstate-people-mutation', { mode: 'exclusive' }, work);
  }

  async savePerson(person: Person): Promise<void> {
    assertValidPerson(person);
    await this.withChronologyMutationLock(() =>
      this.withPeopleMutationLock(async () => {
        const all = await this.getAllPeople();
        const existing = all.find(item => item.id === person.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(person)) {
            throw new Error('PERSON_ID_ALREADY_EXISTS');
          }
          const chronology = await getWebChronology(this.storage, 'person');
          await addWebChronology(
            this.storage,
            'person',
            person.id,
            chronology.get(person.id) ?? UNKNOWN_CREATION_TIMESTAMP,
          );
          return;
        }
        await addWebChronology(this.storage, 'person', person.id, createCreationTimestamp());
        all.unshift(person);
        await this.storage.setItem(this.PEOPLE_KEY, JSON.stringify(all));
      }));
  }

  async getPerson(id: string): Promise<Person | null> {
    const matching = (await this.getAllPeople()).filter(person => person.id === id);
    if (matching.length > 1) throw new Error('DUPLICATE_PERSON');
    return matching[0] ?? null;
  }

  async updatePerson(expected: Person, replacement: Person): Promise<boolean> {
    if (expected.id !== replacement.id) return false;
    assertValidPerson(replacement);
    return this.withPeopleMutationLock(async () => {
      const all = await this.getAllPeople();
      const matching = all
        .map((person, index) => ({ person, index }))
        .filter(item => item.person.id === expected.id);
      if (
        matching.length !== 1
        || JSON.stringify(matching[0].person) !== JSON.stringify(expected)
      ) return false;
      all[matching[0].index] = replacement;
      await this.storage.setItem(this.PEOPLE_KEY, JSON.stringify(all));
      return true;
    });
  }

  async getPeople(): Promise<Person[]> {
    const [people, chronology] = await Promise.all([
      this.getAllPeople(),
      getWebChronology(this.storage, 'person'),
    ]);
    return sortByChronology(people, person => ({
      id: person.id,
      createdAt: chronology.get(person.id)
        ?? UNKNOWN_CREATION_TIMESTAMP,
    }));
  }

  async searchPeople(query: string): Promise<Person[]> {
    return (await this.getPeople()).filter(person => personMatchesSearch(person, query));
  }

  async deletePerson(id: string): Promise<boolean> {
    return this.withPeopleMutationLock(async () => {
      const people = await this.getAllPeople();
      const remainingPeople = people.filter(person => person.id !== id);
      if (remainingPeople.length === people.length) return false;
      const links = await this.getAllPersonPropertyLinks();
      const remainingLinks = links.filter(link => link.personId !== id);
      if (remainingLinks.length !== links.length) {
        await this.storage.setItem(
          this.PERSON_PROPERTY_LINKS_KEY,
          JSON.stringify(remainingLinks),
        );
      }
      const sources = await this.getAllPropertySources();
      const remainingSources = sources.filter(source => source.personId !== id);
      if (remainingSources.length !== sources.length) {
        await this.storage.setItem(this.PROPERTY_SOURCES_KEY, JSON.stringify(remainingSources));
      }
      await this.storage.setItem(this.PEOPLE_KEY, JSON.stringify(remainingPeople));
      return true;
    });
  }

  async linkPersonToProperty(link: PersonPropertyLink): Promise<void> {
    if (!link.personId || !link.propertyCoreId) throw new Error('INVALID_PERSON_PROPERTY_LINK');
    await this.withPeopleMutationLock(async () => {
      const [people, property] = await Promise.all([
        this.getAllPeople(),
        this.getProperty(link.propertyCoreId),
      ]);
      if (!people.some(person => person.id === link.personId) || !property) {
        throw new Error('PERSON_PROPERTY_LINK_TARGET_MISSING');
      }
      const links = await this.getAllPersonPropertyLinks();
      if (links.some(item =>
        item.personId === link.personId && item.propertyCoreId === link.propertyCoreId
      )) return;
      links.push({ personId: link.personId, propertyCoreId: link.propertyCoreId });
      await this.storage.setItem(this.PERSON_PROPERTY_LINKS_KEY, JSON.stringify(links));
    });
  }

  async unlinkPersonFromProperty(link: PersonPropertyLink): Promise<boolean> {
    return this.withPeopleMutationLock(async () => {
      const links = await this.getAllPersonPropertyLinks();
      const remaining = links.filter(item =>
        item.personId !== link.personId || item.propertyCoreId !== link.propertyCoreId
      );
      if (remaining.length === links.length) return false;
      await this.storage.setItem(this.PERSON_PROPERTY_LINKS_KEY, JSON.stringify(remaining));
      return true;
    });
  }

  async getPersonPropertyLinks(): Promise<PersonPropertyLink[]> {
    const links = await this.getAllPersonPropertyLinks();
    const pairs = links.map(link => `${link.personId}\u0000${link.propertyCoreId}`);
    if (new Set(pairs).size !== pairs.length) throw new Error('DUPLICATE_PERSON_PROPERTY_LINK');
    return links;
  }

  async getLinksForPerson(personId: string): Promise<PersonPropertyLink[]> {
    return (await this.getPersonPropertyLinks()).filter(link => link.personId === personId);
  }

  async getLinksForProperty(propertyCoreId: string): Promise<PersonPropertyLink[]> {
    return (await this.getPersonPropertyLinks())
      .filter(link => link.propertyCoreId === propertyCoreId);
  }

  async setPropertySource(source: PropertySource): Promise<void> {
    const validation = validatePropertySource(source);
    if (!validation.ok) throw new Error('INVALID_PROPERTY_SOURCE');
    await this.withPeopleMutationLock(async () => {
      const [people, property, sources] = await Promise.all([
        this.getAllPeople(),
        this.getProperty(source.propertyCoreId),
        this.getAllPropertySources(),
      ]);
      if (!people.some(person => person.id === source.personId) || !property) {
        throw new Error('PROPERTY_SOURCE_TARGET_MISSING');
      }
      const next = [
        ...sources.filter(item => item.propertyCoreId !== source.propertyCoreId),
        source,
      ];
      await this.storage.setItem(this.PROPERTY_SOURCES_KEY, JSON.stringify(next));
    });
  }

  async getPropertySource(propertyCoreId: string): Promise<PropertySource | null> {
    const matching = (await this.getAllPropertySources())
      .filter(source => source.propertyCoreId === propertyCoreId);
    if (matching.length > 1) throw new Error('DUPLICATE_PROPERTY_SOURCE');
    return matching[0] ?? null;
  }

  async removePropertySource(propertyCoreId: string): Promise<boolean> {
    return this.withPeopleMutationLock(async () => {
      const sources = await this.getAllPropertySources();
      const remaining = sources.filter(source => source.propertyCoreId !== propertyCoreId);
      if (remaining.length === sources.length) return false;
      await this.storage.setItem(this.PROPERTY_SOURCES_KEY, JSON.stringify(remaining));
      return true;
    });
  }

  async getPropertySourcesForPerson(personId: string): Promise<PropertySource[]> {
    return (await this.getAllPropertySources()).filter(source => source.personId === personId);
  }

  saveRequirement = (requirement: Parameters<RequirementStore['saveRequirement']>[0]) =>
    this.requirements.saveRequirement(requirement);

  getRequirement = (id: string) => this.requirements.getRequirement(id);

  getRequirements = () => this.requirements.getRequirements();

  getRequirementsForSeeker = (seekerId: string) =>
    this.requirements.getRequirementsForSeeker(seekerId);

  updateRequirement = (
    expected: Parameters<RequirementStore['updateRequirement']>[0],
    replacement: Parameters<RequirementStore['updateRequirement']>[1],
  ) => this.requirements.updateRequirement(expected, replacement);
}

export const store: PropertyStore & PersonStore & RequirementStore & {
  getIntegrityStatus(): LocalStoreIntegrityStatus;
} =
  Platform.OS === 'web' ? new WebStore() : new SQLiteStore();
