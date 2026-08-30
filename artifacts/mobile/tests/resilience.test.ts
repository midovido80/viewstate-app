import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import appConfig from '../app.json';
import {
  parseStoredRecord,
  type UnreadableRecord,
} from '../services/localRecordParser.ts';
import { SingleFlight } from '../services/serialTaskQueue.ts';

const sourcePath = (relativePath: string) =>
  decodeURIComponent(new URL(relativePath, import.meta.url).pathname);

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
  const persistence = await readFile(
    sourcePath('../services/persistence.ts'),
    'utf8',
  );
  const sqlite = persistence.slice(
    persistence.indexOf('export class SQLiteStore'),
    persistence.indexOf('export class WebStore'),
  );
  const initialize = sqlite.slice(
    sqlite.indexOf('private async initialize()'),
    sqlite.indexOf('async saveProperty'),
  );

  assert.match(initialize, /SELECT id, data FROM properties/);
  assert.match(initialize, /const property = this\.parsePropertyRow\(row\)/);
  assert.match(initialize, /if \(!property \|\| completed\) continue/);
  assert.match(sqlite, /property\.core\?\.id === row\.id/);
  assert.match(sqlite, /person\.id !== row\.id/);
  assert.match(sqlite, /rows\.flatMap\(row => \{[\s\S]*parsePropertyRow/);
  assert.match(sqlite, /rows\.flatMap\(row => \{[\s\S]*parsePersonRow/);
  assert.doesNotMatch(initialize, /DELETE|removeItem|reset|INSERT OR REPLACE/);
  assert.doesNotMatch(
    initialize,
    /UPDATE properties[\s\S]{0,300}(row\.data|JSON\.parse\(row\.data\))/,
  );
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