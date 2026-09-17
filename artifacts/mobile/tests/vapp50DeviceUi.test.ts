import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  hydrateLanguagePreference,
  type SupportedLanguage,
} from '../services/languageHydration.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function languageHarness(initialLanguage: SupportedLanguage = 'en') {
  let language = initialLanguage;
  let selectionVersion = 0;
  let active = true;
  const errors: unknown[] = [];
  return {
    get language() {
      return language;
    },
    get selectionVersion() {
      return selectionVersion;
    },
    get active() {
      return active;
    },
    errors,
    select(nextLanguage: SupportedLanguage) {
      selectionVersion += 1;
      language = nextLanguage;
    },
    applyLanguage(nextLanguage: SupportedLanguage) {
      language = nextLanguage;
    },
    deactivate() {
      active = false;
    },
  };
}

test('BEHAVIOR: applies a valid saved language when no newer selection exists', async () => {
  const harness = languageHarness('en');
  await hydrateLanguagePreference({
    readStoredLanguage: async () => 'ar',
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  assert.equal(harness.language, 'ar');
  assert.deepEqual(harness.errors, []);
});

test('BEHAVIOR: a newer user selection wins against delayed hydration', async () => {
  const harness = languageHarness('en');
  const storedLanguage = deferred<string | null>();
  const hydration = hydrateLanguagePreference({
    readStoredLanguage: () => storedLanguage.promise,
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  harness.select('ar');
  storedLanguage.resolve('en');
  await hydration;
  assert.equal(harness.language, 'ar');
  assert.deepEqual(harness.errors, []);
});

test('BEHAVIOR: a missing saved preference preserves the effective language', async () => {
  const harness = languageHarness('ar');
  await hydrateLanguagePreference({
    readStoredLanguage: async () => null,
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  assert.equal(harness.language, 'ar');
});

test('BEHAVIOR: an invalid saved preference preserves the effective language', async () => {
  const harness = languageHarness('en');
  await hydrateLanguagePreference({
    readStoredLanguage: async () => 'fr',
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  assert.equal(harness.language, 'en');
});

test('BEHAVIOR: a storage read failure is handled without changing language', async () => {
  const harness = languageHarness('ar');
  const failure = new Error('storage unavailable');
  await hydrateLanguagePreference({
    readStoredLanguage: async () => {
      throw failure;
    },
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  assert.equal(harness.language, 'ar');
  assert.deepEqual(harness.errors, [failure]);
});

test('BEHAVIOR: stale hydration completion cannot apply after cleanup', async () => {
  const harness = languageHarness('en');
  const storedLanguage = deferred<string | null>();
  const hydration = hydrateLanguagePreference({
    readStoredLanguage: () => storedLanguage.promise,
    selectionVersionAtStart: harness.selectionVersion,
    getSelectionVersion: () => harness.selectionVersion,
    isActive: () => harness.active,
    applyLanguage: language => harness.applyLanguage(language),
    onReadError: error => harness.errors.push(error),
  });
  harness.deactivate();
  storedLanguage.resolve('ar');
  await hydration;
  assert.equal(harness.language, 'en');
});

test('SOURCE ASSERTION: I18nProvider wires the production hydration coordinator', async () => {
  const source = await readFile('contexts/I18nContext.tsx', 'utf8');
  assert.match(source, /AsyncStorage\.getItem\('@viewstate_language'\)/);
  assert.match(source, /hydrateLanguagePreference\(\{/);
  assert.match(source, /getSelectionVersion: \(\) => userSelectionVersion\.current/);
  assert.match(source, /userSelectionVersion\.current \+= 1/);
  assert.match(source, /onReadError: console\.error/);
});

test('SOURCE ASSERTION: Requirement route is headerless while Add and Edit remain localized', async () => {
  const [layout, requirement, person] = await Promise.all([
    readFile('app/_layout.tsx', 'utf8'),
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
  ]);
  assert.match(layout, /name="requirement\/\[requirementId\]" options=\{\{ headerShown: false \}\}/);
  assert.match(requirement, /editing \? t\('requirements\.edit'\) : t\('requirements\.add'\)/);
  assert.match(person, /testID="person-add-requirement"[^>]*accessibilityRole="button"/);
  assert.match(person, /addRequirementButton/);
});

test('SOURCE ASSERTION: Search presentation never falls back to internal IDs', async () => {
  const [search, i18n] = await Promise.all([
    readFile('app/search.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  assert.doesNotMatch(search, /description\?\.value \?\? property\.core\.id/);
  assert.doesNotMatch(search, /: property\.core\.locationArea\.id/);
  assert.doesNotMatch(search, /: areaId;/);
  assert.match(search, /search\.property_description_unknown/);
  assert.match(search, /search\.area_unknown/);
  assert.match(i18n, /'search\.property_description_unknown'/);
});

test('SOURCE ASSERTION: Contact review and results use bounded lists without changing phone semantics', async () => {
  const source = await readFile('components/BatchContactImportModal.tsx', 'utf8');
  assert.match(source, /data=\{Object\.values\(selected\)\}/);
  assert.match(source, /data=\{summary\?\.results \?\? \[\]\}/);
  assert.match(source, /style=\{styles\.flexList\}/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /normalizePhoneForCountry\(phone\.phone, item\.country \?\? 'KW'\)/);
  assert.match(source, /createContactBatchSubmissionGuard/);
});

test('SOURCE ASSERTION: Matching changes are presentation-only', async () => {
  const source = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(source, /explanation\.criterion === 'eligibility' && explanation\.possiblePoints === 0/);
  assert.match(source, /matching\.saved\.matchAllDescription/);
  assert.match(source, /new BrokerInitiatedMatching\(store, candidateSource\)/);
  assert.match(source, /MATCH_QUALIFICATION_THRESHOLD/);
  assert.doesNotMatch(source, /saveRequirement|updateRequirement|saveProperty|setItem/);
});