import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  type Property,
  validateProperty,
} from '@workspace/property-domain';
import type { SQLiteBindParams } from 'expo-sqlite';
import appConfig from '../app.json';
import {
  parseStoredRecord,
  type UnreadableRecord,
} from '../services/localRecordParser.ts';
import { SingleFlight } from '../services/serialTaskQueue.ts';
import { STAGE_01B1_PROPERTY_MIGRATION_ID } from '../services/stage01B1CurrencyMigration.ts';
import {
  STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID,
  UNKNOWN_CREATION_TIMESTAMP,
  WEB_PERSON_CHRONOLOGY_KEY,
  WEB_PROPERTY_CHRONOLOGY_KEY,
  compareChronology,
  getLegacyCreationTimestamp,
  migrateWebStoreChronology,
  sortByChronology,
} from '../services/chronology.ts';
import {
  initializeSQLiteStore,
  type SQLiteInitializationDatabase,
  type SQLitePropertyRow,
} from '../services/sqliteStoreInitialization.ts';
import {
  assertValidPerson,
  createPerson,
  type Person,
} from '../services/people.ts';
import './platformModuleStubs.ts';

const sourcePath = (relativePath: string) =>
  decodeURIComponent(new URL(relativePath, import.meta.url).pathname);

const legacyProperty = (id: string): Property => ({
  core: {
    id,
    propertyType: 'apartment',
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: `${id}-offer`,
    propertyCoreId: id,
    transaction: 'sale',
    salePrice: { amount: 350, currencyCode: 'SAR' },
  },
});

const kwdProperty = (id: string): Property => {
  const property = legacyProperty(id);
  if (property.activeOffer.transaction !== 'sale') {
    throw new Error('Expected sale fixture');
  }
  return {
    ...property,
    activeOffer: {
      ...property.activeOffer,
      salePrice: { amount: 350, currencyCode: 'KWD' },
    },
  };
};

const fixturePerson = (id: string, name = `Shared ${id}`): Person =>
  createPerson({
    id,
    classifications: ['owner'],
    name,
    displayPhone: '50000000',
    notes: `notes for ${id}`,
  });

class SQLitePersistenceHarness implements SQLiteInitializationDatabase {
  readonly properties = new Map<string, { id: string; data: string; searchText: string }>();
  readonly people = new Map<string, { id: string; data: string; searchText: string }>();
  readonly propertyChronology = new Map<string, number>();
  readonly personChronology = new Map<string, number>();
  readonly migrations = new Set<string>();
  readonly writes: Array<{ sql: string; params: unknown[] }> = [];
  schemaExecutions = 0;

  constructor(
    rows: readonly SQLitePropertyRow[],
    people: readonly { id: string; data: string }[] = [],
  ) {
    for (const row of rows) {
      this.properties.set(row.id, { ...row, searchText: `original:${row.id}` });
    }
    for (const row of people) {
      this.people.set(row.id, { ...row, searchText: `original:${row.id}` });
    }
  }

  async execAsync(source: string): Promise<void> {
    assert.match(source, /CREATE TABLE IF NOT EXISTS properties/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS app_migrations/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS property_creation_chronology/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS person_creation_chronology/);
    this.schemaExecutions += 1;
  }

  async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
    assert.match(source, /SELECT id FROM app_migrations/);
    assert.ok(Array.isArray(params));
    const id = String(params[0]);
    return (this.migrations.has(id) ? { id } : null) as T | null;
  }

  async getAllAsync<T>(source: string): Promise<T[]> {
    if (source.includes('FROM property_creation_chronology')) {
      return [...this.propertyChronology].map(([id, created_at]) => ({
        id,
        created_at,
      })) as T[];
    }
    if (source.includes('FROM person_creation_chronology')) {
      return [...this.personChronology].map(([id, created_at]) => ({
        id,
        created_at,
      })) as T[];
    }
    if (source.includes('FROM properties')) {
      return [...this.properties.values()].map(({ id, data }) => ({ id, data })) as T[];
    }
    if (source.includes('FROM people')) {
      return [...this.people.values()].map(({ id, data }) => ({ id, data })) as T[];
    }
    throw new Error(`Unexpected read: ${source}`);
  }

  async runAsync(source: string, params: SQLiteBindParams): Promise<unknown> {
    assert.ok(Array.isArray(params));
    const sql = source.replace(/\s+/g, ' ').trim();
    this.writes.push({ sql, params: [...params] });
    if (sql === 'UPDATE properties SET data = ?, search_text = ? WHERE id = ?') {
      const [data, searchText, id] = params.map(String);
      const row = this.properties.get(id);
      assert.ok(row, `Expected property ${id} to exist`);
      this.properties.set(id, { id, data, searchText });
      return { changes: 1 };
    }
    if (sql === 'INSERT OR IGNORE INTO property_creation_chronology (id, created_at) VALUES (?, ?)') {
      const id = String(params[0]);
      if (!this.propertyChronology.has(id)) {
        this.propertyChronology.set(id, Number(params[1]));
      }
      return { changes: 1 };
    }
    if (sql === 'INSERT OR IGNORE INTO person_creation_chronology (id, created_at) VALUES (?, ?)') {
      const id = String(params[0]);
      if (!this.personChronology.has(id)) {
        this.personChronology.set(id, Number(params[1]));
      }
      return { changes: 1 };
    }
    if (sql === 'INSERT INTO app_migrations (id) VALUES (?)') {
      this.migrations.add(String(params[0]));
      return { changes: 1 };
    }
    throw new Error(`Unexpected write: ${sql}`);
  }

  replaceFixtureRow(id: string, data: string): void {
    const row = this.properties.get(id);
    assert.ok(row, `Expected property ${id} to exist`);
    this.properties.set(id, { ...row, data });
  }

  raw(id: string): string {
    const row = this.properties.get(id);
    assert.ok(row, `Expected property ${id} to exist`);
    return row.data;
  }

  replaceFixturePerson(id: string, data: string): void {
    const row = this.people.get(id);
    assert.ok(row, `Expected person ${id} to exist`);
    this.people.set(id, { ...row, data });
  }

  rawPerson(id: string): string {
    const row = this.people.get(id);
    assert.ok(row, `Expected person ${id} to exist`);
    return row.data;
  }

  clearWrites(): void {
    this.writes.length = 0;
  }
}

const initializeHarness = async (
  db: SQLitePersistenceHarness,
  warnings: UnreadableRecord[],
) => initializeSQLiteStore({
  db,
  parsePropertyRow: row => {
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
      warnings.push(result.warning);
      return null;
    }
    return result.value;
  },
  parsePersonRow: row => {
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
      warnings.push(result.warning);
      return null;
    }
    return result.value;
  },
  runMutation: task => task(),
});

class WebStorageHarness {
  readonly values: Map<string, string>;
  readonly writes: string[] = [];
  private readonly failures = new Map<string, number>();

  constructor(entries: readonly (readonly [string, string])[]) {
    this.values = new Map(entries);
  }

  failNext(key: string): void {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
  }

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push(key);
    const remaining = this.failures.get(key) ?? 0;
    if (remaining > 0) {
      this.failures.set(key, remaining - 1);
      throw new Error(`synthetic storage write failure for ${key}`);
    }
    this.values.set(key, value);
  }
}

const synchronousWebLocks = {
  request: async <T>(
    _name: string,
    _options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T> => callback(),
};

const WEB_PROPERTIES_KEY = '@viewstate_properties';
const WEB_PEOPLE_KEY = '@viewstate_people_v1';
const WEB_MIGRATION_KEY = '@viewstate_migration_stage01b1_sar_to_kwd_v1';

test('malformed rows are isolated while valid peers continue loading', () => {
  const validRaw = '{"core":{"id":"property-valid"}}';
  const malformedRaw = '{"core":';
  const warning: UnreadableRecord = {
    type: 'property',
    id: 'opaque-property-2',
  };

  const valid = parseStoredRecord<{ core: { id: string } }>(
    validRaw,
    { type: 'property', id: 'opaque-property-1' },
    value => (
      typeof value === 'object'
      && value !== null
      && (value as { core?: { id?: unknown } }).core?.id === 'property-valid'
    ),
  );
  const malformed = parseStoredRecord(malformedRaw, warning, () => true);

  assert.equal(valid.ok, true);
  assert.deepEqual(malformed, { ok: false, warning });
  assert.equal(malformedRaw, '{"core":');
});

test('integrity diagnostics contain only record type and opaque ID', () => {
  const raw = '{"privateNotes":"never expose this"';
  const result = parseStoredRecord(
    raw,
    { type: 'person', id: 'opaque-person-7' },
    () => true,
  );
  assert.deepEqual(result, {
    ok: false,
    warning: { type: 'person', id: 'opaque-person-7' },
  });
  assert.doesNotMatch(JSON.stringify(result), /privateNotes|never expose this|stack|path/i);
});

test('retry is single-flight and a later attempt can succeed', async () => {
  const flight = new SingleFlight();
  let attempts = 0;
  let releaseFailure: (() => void) | undefined;
  const failureGate = new Promise<void>(resolve => {
    releaseFailure = resolve;
  });

  const initialize = async () => {
    attempts += 1;
    if (attempts === 1) {
      await failureGate;
      throw new Error('synthetic initialization failure');
    }
    return 'ready';
  };

  const first = flight.run(initialize);
  const concurrent = await flight.run(initialize);
  assert.deepEqual(concurrent, { started: false });
  releaseFailure!();
  await assert.rejects(first, /synthetic initialization failure/);

  const retry = await flight.run(initialize);
  assert.deepEqual(retry, { started: true, value: 'ready' });
  assert.equal(attempts, 2);
});

test('startup failure hides splash and renders localized serialized recovery', async () => {
  const layout = await readFile(sourcePath('../app/_layout.tsx'), 'utf8');
  const recovery = await readFile(
    sourcePath('../components/StartupRecoveryScreen.tsx'),
    'utf8',
  );

  assert.match(layout, /status: 'initializing'/);
  assert.match(layout, /status: 'retrying'/);
  assert.match(layout, /status: 'error'/);
  assert.match(layout, /initializationAttempt\.current/);
  assert.match(
    layout,
    /initialization\.status === 'error'\s+\|\|[\s\S]*SplashScreen\.hideAsync/,
  );
  assert.doesNotMatch(
    layout,
    /initialization\.status === 'error'\s+&&\s+\(fontsLoaded \|\| fontError\)/,
  );
  assert.match(recovery, /testID="startup-recovery-screen"/);
  assert.match(recovery, /testID="startup-retry"/);
  assert.match(recovery, /disabled=\{retrying\}/);
  assert.doesNotMatch(recovery, /error\.message|error\.stack|JSON/);
});

test('SQLite parsing is per-row and malformed migration rows are never rewritten', async () => {
  const [persistence, initialization] = await Promise.all([
    readFile(sourcePath('../services/persistence.ts'), 'utf8'),
    readFile(sourcePath('../services/sqliteStoreInitialization.ts'), 'utf8'),
  ]);
  const sqlite = persistence.slice(
    persistence.indexOf('export class SQLiteStore'),
    persistence.indexOf('export class WebStore'),
  );

  assert.match(sqlite, /initializeSQLiteStore/);
  assert.match(initialization, /SELECT id, data FROM properties/);
  assert.match(initialization, /const property = options\.parsePropertyRow\(row\)/);
  assert.match(initialization, /if \(!property\)/);
  assert.match(initialization, /allPropertiesReadable = false/);
  assert.match(initialization, /if \(!completed && allPropertiesReadable\)/);
  assert.match(sqlite, /property\.core\?\.id === row\.id/);
  assert.match(sqlite, /person\.id !== row\.id/);
  assert.match(sqlite, /rows\.flatMap\(row => \{[\s\S]*parsePropertyRow/);
  assert.match(sqlite, /rows\.flatMap\(row => \{[\s\S]*parsePersonRow/);
  assert.doesNotMatch(initialization, /DELETE|removeItem|reset|INSERT OR REPLACE/);
  assert.doesNotMatch(
    initialization,
    /UPDATE properties[\s\S]{0,300}(row\.data|JSON\.parse\(row\.data\))/,
  );
});

test('SQLite migration withholds completion until a preserved malformed row is repaired', async () => {
  const malformedId = 'opaque-property-broken';
  const validId = 'property-valid-peer';
  const malformedRaw = '{"core":{"id":"opaque-property-broken"}';
  const db = new SQLitePersistenceHarness([
    { id: malformedId, data: malformedRaw },
    { id: validId, data: JSON.stringify(legacyProperty(validId)) },
  ]);
  const firstWarnings: UnreadableRecord[] = [];

  await initializeHarness(db, firstWarnings);

  assert.equal(db.raw(malformedId), malformedRaw);
  assert.equal(db.migrations.has(STAGE_01B1_PROPERTY_MIGRATION_ID), false);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), false);
  assert.deepEqual(firstWarnings, [{ type: 'property', id: malformedId }]);
  assert.deepEqual(Object.keys(firstWarnings[0]).sort(), ['id', 'type']);
  assert.equal(JSON.parse(db.raw(validId)).activeOffer.salePrice.currencyCode, 'KWD');
  assert.deepEqual([...db.properties.keys()], [malformedId, validId]);
  assert.equal(
    db.writes.some(write => write.sql.startsWith('UPDATE properties') && write.params[2] === malformedId),
    false,
  );
  assert.equal(
    db.writes.some(write => /DELETE|REPLACE|RESET|QUARANTINE/i.test(write.sql)),
    false,
  );

  db.replaceFixtureRow(malformedId, JSON.stringify(legacyProperty(malformedId)));
  db.clearWrites();
  const retryWarnings: UnreadableRecord[] = [];
  await initializeHarness(db, retryWarnings);

  assert.deepEqual(retryWarnings, []);
  assert.equal(JSON.parse(db.raw(malformedId)).activeOffer.salePrice.currencyCode, 'KWD');
  assert.equal(JSON.parse(db.raw(validId)).activeOffer.salePrice.currencyCode, 'KWD');
  assert.equal(db.migrations.has(STAGE_01B1_PROPERTY_MIGRATION_ID), true);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), true);
  assert.deepEqual([...db.properties.keys()], [malformedId, validId]);
  assert.equal(
    db.writes.filter(write => write.sql.startsWith('UPDATE properties')).length,
    1,
  );
  assert.equal(
    db.writes.filter(write =>
      write.sql.startsWith('INSERT INTO app_migrations')
      && write.params[0] === STAGE_01B1_PROPERTY_MIGRATION_ID).length,
    1,
  );

  const afterCompletion = new Map(
    [...db.properties].map(([id, row]) => [id, row.data]),
  );
  db.clearWrites();
  await initializeHarness(db, []);
  assert.deepEqual(
    new Map([...db.properties].map(([id, row]) => [id, row.data])),
    afterCompletion,
  );
  assert.equal(db.writes.length, 0);
  assert.deepEqual([...db.properties.keys()], [malformedId, validId]);
});

test('SQLite migration completes normally and remains idempotent when every row is valid', async () => {
  const firstId = 'property-all-valid-1';
  const secondId = 'property-all-valid-2';
  const db = new SQLitePersistenceHarness([
    { id: firstId, data: JSON.stringify(legacyProperty(firstId)) },
    { id: secondId, data: JSON.stringify(legacyProperty(secondId)) },
  ]);

  await initializeHarness(db, []);
  assert.equal(db.migrations.has(STAGE_01B1_PROPERTY_MIGRATION_ID), true);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), true);
  assert.equal(JSON.parse(db.raw(firstId)).activeOffer.salePrice.currencyCode, 'KWD');
  assert.equal(JSON.parse(db.raw(secondId)).activeOffer.salePrice.currencyCode, 'KWD');
  assert.equal(
    db.writes.filter(write => write.sql.startsWith('UPDATE properties')).length,
    2,
  );

  const completedRows = new Map(
    [...db.properties].map(([id, row]) => [id, row.data]),
  );
  db.clearWrites();
  await initializeHarness(db, []);
  assert.deepEqual(
    new Map([...db.properties].map(([id, row]) => [id, row.data])),
    completedRows,
  );
  assert.equal(db.writes.length, 0);
  assert.deepEqual([...db.properties.keys()], [firstId, secondId]);
});

test('SQLiteStore orders mixed legacy and UUID properties and people, including searches', async () => {
  const { SQLiteStore } = await import('../services/persistence.ts');
  const timestamp = 1788202178934;
  const propertyIds = [
    'tie-property-a',
    'uuid-property',
    `${timestamp}abcdefghi`,
    'tie-property-z',
  ];
  const personIds = [
    'tie-person-a',
    'uuid-person',
    `person-${timestamp}-abcdefgh`,
    'tie-person-z',
  ];
  const db = new SQLitePersistenceHarness(
    propertyIds.map(id => ({ id, data: JSON.stringify(kwdProperty(id)) })),
    personIds.map(id => ({ id, data: JSON.stringify(fixturePerson(id)) })),
  );
  db.migrations.add(STAGE_01B1_PROPERTY_MIGRATION_ID);
  db.migrations.add(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID);
  db.propertyChronology.set('uuid-property', timestamp + 2);
  db.propertyChronology.set(`${timestamp}abcdefghi`, timestamp);
  db.propertyChronology.set('tie-property-a', timestamp - 1);
  db.propertyChronology.set('tie-property-z', timestamp - 1);
  db.personChronology.set('uuid-person', timestamp + 2);
  db.personChronology.set(`person-${timestamp}-abcdefgh`, timestamp);
  db.personChronology.set('tie-person-a', timestamp - 1);
  db.personChronology.set('tie-person-z', timestamp - 1);
  const propertyRawBefore = new Map(
    [...db.properties].map(([id, row]) => [id, row.data]),
  );
  const personRawBefore = new Map(
    [...db.people].map(([id, row]) => [id, row.data]),
  );
  const store = new SQLiteStore(
    async () => db as unknown as import('expo-sqlite').SQLiteDatabase,
  );

  await store.init();
  assert.deepEqual(
    (await store.getProperties()).map(property => property.core.id),
    ['uuid-property', `${timestamp}abcdefghi`, 'tie-property-z', 'tie-property-a'],
  );
  assert.deepEqual(
    (await store.searchProperties('apartment')).map(property => property.core.id),
    ['uuid-property', `${timestamp}abcdefghi`, 'tie-property-z', 'tie-property-a'],
  );
  assert.deepEqual(
    (await store.getPeople()).map(person => person.id),
    ['uuid-person', `person-${timestamp}-abcdefgh`, 'tie-person-z', 'tie-person-a'],
  );
  assert.deepEqual(
    (await store.searchPeople('shared')).map(person => person.id),
    ['uuid-person', `person-${timestamp}-abcdefgh`, 'tie-person-z', 'tie-person-a'],
  );
  assert.deepEqual(
    new Map([...db.properties].map(([id, row]) => [id, row.data])),
    propertyRawBefore,
  );
  assert.deepEqual(
    new Map([...db.people].map(([id, row]) => [id, row.data])),
    personRawBefore,
  );
});

test('SQLite Person chronology migration preserves recognized, unknown, and malformed rows', async () => {
  const timestamp = 1788202178934;
  const legacyId = `person-${timestamp}-abcdefgh`;
  const unknownId = 'person-uuid-unknown';
  const malformedId = 'person-malformed';
  const malformedRaw = '{"id":"person-malformed"';
  const db = new SQLitePersistenceHarness([], [
    { id: legacyId, data: JSON.stringify(fixturePerson(legacyId)) },
    { id: unknownId, data: JSON.stringify(fixturePerson(unknownId)) },
    { id: malformedId, data: malformedRaw },
  ]);
  const warnings: UnreadableRecord[] = [];

  await initializeHarness(db, warnings);

  assert.equal(db.personChronology.get(legacyId), timestamp);
  assert.equal(db.personChronology.get(unknownId), UNKNOWN_CREATION_TIMESTAMP);
  assert.equal(db.personChronology.has(malformedId), false);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), false);
  assert.equal(db.rawPerson(malformedId), malformedRaw);
  assert.deepEqual(warnings, [{ type: 'person', id: malformedId }]);
  assert.deepEqual(
    Object.fromEntries([...db.people].map(([id, row]) => [id, row.data])),
    {
      [legacyId]: JSON.stringify(fixturePerson(legacyId)),
      [unknownId]: JSON.stringify(fixturePerson(unknownId)),
      [malformedId]: malformedRaw,
    },
  );

  db.replaceFixturePerson(
    malformedId,
    JSON.stringify(fixturePerson(malformedId)),
  );
  db.clearWrites();
  const repairWarnings: UnreadableRecord[] = [];
  await initializeHarness(db, repairWarnings);
  assert.deepEqual(repairWarnings, []);
  assert.equal(db.personChronology.get(malformedId), UNKNOWN_CREATION_TIMESTAMP);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), true);

  const completedRows = new Map(
    [...db.people].map(([id, row]) => [id, row.data]),
  );
  db.clearWrites();
  await initializeHarness(db, []);
  assert.deepEqual(
    new Map([...db.people].map(([id, row]) => [id, row.data])),
    completedRows,
  );
  assert.equal(db.writes.length, 0);
});

test('SQLite Person chronology migration leaves its marker unset after partial writes and recovers', async () => {
  const firstId = 'person-partial-first';
  const secondId = 'person-partial-second';
  const db = new SQLitePersistenceHarness([], [
    { id: firstId, data: JSON.stringify(fixturePerson(firstId)) },
    { id: secondId, data: JSON.stringify(fixturePerson(secondId)) },
  ]);
  const originalRun = db.runAsync.bind(db);
  let failSecondWrite = true;
  db.runAsync = async (source, params) => {
    if (
      failSecondWrite
      && source.includes('person_creation_chronology')
      && Array.isArray(params)
      && params[0] === secondId
    ) {
      failSecondWrite = false;
      throw new Error('synthetic person chronology write failure');
    }
    return originalRun(source, params);
  };

  await assert.rejects(
    initializeHarness(db, []),
    /synthetic person chronology write failure/,
  );
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), false);
  assert.deepEqual(
    [...db.personChronology],
    [[firstId, UNKNOWN_CREATION_TIMESTAMP]],
  );
  assert.deepEqual(db.rawPerson(firstId), JSON.stringify(fixturePerson(firstId)));
  assert.deepEqual(db.rawPerson(secondId), JSON.stringify(fixturePerson(secondId)));

  await initializeHarness(db, []);
  assert.equal(db.personChronology.size, 2);
  assert.equal(db.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), true);
  const chronologyAfterRecovery = new Map(db.personChronology);
  db.clearWrites();
  await initializeHarness(db, []);
  assert.deepEqual(db.personChronology, chronologyAfterRecovery);
  assert.equal(db.writes.length, 0);
});

test('legacy chronology parsing is exact and unknown IDs use a deterministic fallback', () => {
  const timestamp = 1788202178934;
  assert.equal(
    getLegacyCreationTimestamp('property', `${timestamp}abcdefghi`),
    timestamp,
  );
  assert.equal(
    getLegacyCreationTimestamp('person', `person-${timestamp}-abcdefgh`),
    timestamp,
  );
  assert.equal(getLegacyCreationTimestamp('property', String(timestamp)), null);
  assert.equal(getLegacyCreationTimestamp('property', `custom-${timestamp}`), null);
  assert.equal(getLegacyCreationTimestamp('person', `person-${timestamp}-short`), null);
  assert.equal(UNKNOWN_CREATION_TIMESTAMP, 0);
  assert.ok(compareChronology(
    { id: 'b', createdAt: timestamp },
    { id: 'a', createdAt: timestamp },
  ) < 0);

  const ordered = sortByChronology([
    { id: 'legacy-old', createdAt: timestamp - 1 },
    { id: 'uuid-new', createdAt: timestamp + 1 },
    { id: 'legacy-new', createdAt: timestamp + 2 },
    { id: 'tie-a', createdAt: timestamp },
    { id: 'tie-b', createdAt: timestamp },
  ], value => value);
  assert.deepEqual(
    ordered.map(value => value.id),
    ['legacy-new', 'uuid-new', 'tie-b', 'tie-a', 'legacy-old'],
  );
});

test('empty SQLite chronology migration completes and a failed write cannot mark completion', async () => {
  const empty = new SQLitePersistenceHarness([]);
  await initializeHarness(empty, []);
  assert.equal(empty.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), true);

  const propertyId = 'property-valid-write-failure';
  const failing = new SQLitePersistenceHarness([
    { id: propertyId, data: JSON.stringify(legacyProperty(propertyId)) },
  ]);
  const originalRun = failing.runAsync.bind(failing);
  failing.runAsync = async (source, params) => {
    if (source.includes('property_creation_chronology')) {
      throw new Error('synthetic chronology write failure');
    }
    return originalRun(source, params);
  };
  await assert.rejects(initializeHarness(failing, []), /synthetic chronology write failure/);
  assert.equal(failing.migrations.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), false);
});

test('Web chronology migration preserves record arrays byte-for-byte and is idempotent', async () => {
  const timestamp = 1788202178934;
  const propertyId = `${timestamp}abcdefghi`;
  const personId = `person-${timestamp}-abcdefgh`;
  const propertiesKey = '@properties';
  const peopleKey = '@people';
  const propertyRaw = JSON.stringify([legacyProperty(propertyId)]);
  const peopleRaw = JSON.stringify([{
    id: personId,
    classifications: ['owner'],
    name: 'Legacy owner',
    displayPhone: '50000000',
    normalizedPhone: '50000000',
    notes: '',
  }]);
  const values = new Map<string, string>([
    [propertiesKey, propertyRaw],
    [peopleKey, peopleRaw],
  ]);
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };

  await migrateWebStoreChronology({ storage, propertiesKey, peopleKey });
  assert.equal(values.get(propertiesKey), propertyRaw);
  assert.equal(values.get(peopleKey), peopleRaw);
  assert.equal(
    JSON.parse(values.get(WEB_PROPERTY_CHRONOLOGY_KEY)!).entries[propertyId],
    timestamp,
  );
  assert.equal(
    JSON.parse(values.get(WEB_PERSON_CHRONOLOGY_KEY)!).entries[personId],
    timestamp,
  );
  assert.equal(values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID), 'complete');

  const snapshot = new Map(values);
  await migrateWebStoreChronology({ storage, propertiesKey, peopleKey });
  assert.deepEqual(values, snapshot);
});

test('WebStore initialization chains migrations and preserves ordered searchable records', async () => {
  const { WebStore } = await import('../services/persistence.ts');
  const timestamp = 1788202178934;
  const legacyPropertyId = `${timestamp}abcdefghi`;
  const legacyPersonId = `person-${timestamp}-abcdefgh`;
  const propertyIds = [
    'unknown-property-a',
    legacyPropertyId,
    'uuid-property',
    'unknown-property-z',
  ];
  const personIds = [
    'unknown-person-a',
    legacyPersonId,
    'uuid-person',
    'unknown-person-z',
  ];
  const propertyRaw = JSON.stringify(propertyIds.map(id => kwdProperty(id)));
  const peopleRaw = JSON.stringify(personIds.map(id => fixturePerson(id)));
  const storage = new WebStorageHarness([
    [WEB_PROPERTIES_KEY, propertyRaw],
    [WEB_PEOPLE_KEY, peopleRaw],
    [WEB_PROPERTY_CHRONOLOGY_KEY, JSON.stringify({
      version: 1,
      entries: { 'uuid-property': timestamp + 2 },
    })],
    [WEB_PERSON_CHRONOLOGY_KEY, JSON.stringify({
      version: 1,
      entries: { 'uuid-person': timestamp + 2 },
    })],
  ]);
  const store = new WebStore(storage, synchronousWebLocks);

  await store.init();
  assert.equal(storage.values.get(WEB_MIGRATION_KEY), 'complete');
  assert.equal(
    storage.values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    'complete',
  );
  assert.equal(storage.values.get(WEB_PROPERTIES_KEY), propertyRaw);
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), peopleRaw);
  assert.deepEqual(
    (await store.getProperties()).map(property => property.core.id),
    ['uuid-property', legacyPropertyId, 'unknown-property-z', 'unknown-property-a'],
  );
  assert.deepEqual(
    (await store.searchProperties('apartment')).map(property => property.core.id),
    ['uuid-property', legacyPropertyId, 'unknown-property-z', 'unknown-property-a'],
  );
  assert.deepEqual(
    (await store.getPeople()).map(person => person.id),
    ['uuid-person', legacyPersonId, 'unknown-person-z', 'unknown-person-a'],
  );
  assert.deepEqual(
    (await store.searchPeople('shared')).map(person => person.id),
    ['uuid-person', legacyPersonId, 'unknown-person-z', 'unknown-person-a'],
  );

  const writesAfterFirstInit = storage.writes.length;
  await new WebStore(storage, synchronousWebLocks).init();
  assert.equal(storage.writes.length, writesAfterFirstInit);
  assert.equal(storage.values.get(WEB_PROPERTIES_KEY), propertyRaw);
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), peopleRaw);
});

test('WebStore chronology migration preserves malformed input and completes after repair', async () => {
  const { WebStore } = await import('../services/persistence.ts');
  const malformedId = 'person-malformed-web';
  const malformedRaw = JSON.stringify([{ id: malformedId, name: '' }]);
  const propertyId = 'valid-web-property';
  const propertyRaw = JSON.stringify([kwdProperty(propertyId)]);
  const repairedPeopleRaw = JSON.stringify([fixturePerson(malformedId)]);
  const storage = new WebStorageHarness([
    [WEB_PROPERTIES_KEY, propertyRaw],
    [WEB_PEOPLE_KEY, malformedRaw],
  ]);

  // Invalid records are kept byte-for-byte and prevent only the chronology
  // completion marker; property migration remains chainable.
  await new WebStore(storage, synchronousWebLocks).init();
  assert.equal(storage.values.get(WEB_MIGRATION_KEY), 'complete');
  assert.equal(
    storage.values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    undefined,
  );
  assert.equal(storage.values.get(WEB_PROPERTIES_KEY), propertyRaw);
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), malformedRaw);

  await storage.setItem(WEB_PEOPLE_KEY, repairedPeopleRaw);
  await new WebStore(storage, synchronousWebLocks).init();
  assert.equal(
    storage.values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    'complete',
  );
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), repairedPeopleRaw);
});

test('WebStore chronology migration leaves partial writes recoverable', async () => {
  const { WebStore } = await import('../services/persistence.ts');
  const propertyId = 'partial-web-property';
  const personId = 'partial-web-person';
  const propertyRaw = JSON.stringify([kwdProperty(propertyId)]);
  const peopleRaw = JSON.stringify([fixturePerson(personId)]);
  const storage = new WebStorageHarness([
    [WEB_PROPERTIES_KEY, propertyRaw],
    [WEB_PEOPLE_KEY, peopleRaw],
  ]);
  storage.failNext(WEB_PERSON_CHRONOLOGY_KEY);

  await assert.rejects(
    new WebStore(storage, synchronousWebLocks).init(),
    /synthetic storage write failure/,
  );
  assert.equal(
    storage.values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    undefined,
  );
  assert.equal(
    JSON.parse(storage.values.get(WEB_PROPERTY_CHRONOLOGY_KEY)!).entries[propertyId],
    UNKNOWN_CREATION_TIMESTAMP,
  );
  assert.equal(storage.values.get(WEB_PERSON_CHRONOLOGY_KEY), undefined);
  assert.equal(storage.values.get(WEB_PROPERTIES_KEY), propertyRaw);
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), peopleRaw);

  await new WebStore(storage, synchronousWebLocks).init();
  assert.equal(
    storage.values.get(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    'complete',
  );
  assert.equal(storage.values.get(WEB_PROPERTIES_KEY), propertyRaw);
  assert.equal(storage.values.get(WEB_PEOPLE_KEY), peopleRaw);
});

test('Arabic and English recovery and preservation warnings are present', async () => {
  const translations = await readFile(
    sourcePath('../contexts/I18nContext.tsx'),
    'utf8',
  );

  assert.match(translations, /'startup\.retry': 'Retry'/);
  assert.match(translations, /'startup\.retry': 'إعادة المحاولة'/);
  assert.match(translations, /Nothing was deleted, reset, or replaced/);
  assert.match(translations, /لم يتم حذف أي بيانات أو إعادة ضبطها أو استبدالها/);
  assert.match(translations, /Unreadable records are still preserved locally/);
  assert.match(translations, /السجلات غير المقروءة محفوظة محلياً/);
});

test('Expo permissions remain foreground-only with no camera or microphone', async () => {
  const plugins = appConfig.expo.plugins;
  const location = plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'expo-location',
  );
  const imagePicker = plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );
  assert.deepEqual(location, [
    'expo-location',
    {
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      locationWhenInUsePermission: 'Allow ViewState to use your current location while the app is open. / السماح لـ ViewState باستخدام موقعك الحالي أثناء فتح التطبيق.',
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
    },
  ]);
  assert.deepEqual(imagePicker, [
    'expo-image-picker',
    {
      photosPermission: 'Allow ViewState to choose photos and videos you select. / السماح لـ ViewState باختيار الصور ومقاطع الفيديو التي تحددها.',
      cameraPermission: false,
      microphonePermission: false,
    },
  ]);
});