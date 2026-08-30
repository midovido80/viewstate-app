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
  initializeSQLiteStore,
  type SQLiteInitializationDatabase,
  type SQLitePropertyRow,
} from '../services/sqliteStoreInitialization.ts';

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

class SQLitePersistenceHarness implements SQLiteInitializationDatabase {
  readonly properties = new Map<string, { id: string; data: string; searchText: string }>();
  readonly migrations = new Set<string>();
  readonly writes: Array<{ sql: string; params: unknown[] }> = [];
  schemaExecutions = 0;

  constructor(rows: readonly SQLitePropertyRow[]) {
    for (const row of rows) {
      this.properties.set(row.id, { ...row, searchText: `original:${row.id}` });
    }
  }

  async execAsync(source: string): Promise<void> {
    assert.match(source, /CREATE TABLE IF NOT EXISTS properties/);
    assert.match(source, /CREATE TABLE IF NOT EXISTS app_migrations/);
    this.schemaExecutions += 1;
  }

  async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
    assert.match(source, /SELECT id FROM app_migrations/);
    assert.ok(Array.isArray(params));
    const id = String(params[0]);
    return (this.migrations.has(id) ? { id } : null) as T | null;
  }

  async getAllAsync<T>(source: string): Promise<T[]> {
    if (source.includes('FROM properties')) {
      return [...this.properties.values()].map(({ id, data }) => ({ id, data })) as T[];
    }
    if (source.includes('FROM people')) return [];
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
  parsePersonRow: () => null,
  runMutation: task => task(),
});

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
  assert.deepEqual([...db.properties.keys()], [malformedId, validId]);
  assert.equal(
    db.writes.filter(write => write.sql.startsWith('UPDATE properties')).length,
    1,
  );
  assert.equal(
    db.writes.filter(write => write.sql.startsWith('INSERT INTO app_migrations')).length,
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