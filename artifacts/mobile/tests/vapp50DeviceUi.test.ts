import { sourceMatch, sourceDoesNotMatch, sourceIndex } from "./sourceAssertions";
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
  sourceMatch(source, /AsyncStorage\.getItem\('@viewstate_language'\)/);
  sourceMatch(source, /hydrateLanguagePreference\(\{/);
  sourceMatch(source, /getSelectionVersion: \(\) => userSelectionVersion\.current/);
  sourceMatch(source, /userSelectionVersion\.current \+= 1/);
  sourceMatch(source, /onReadError: console\.error/);
});

test('SOURCE ASSERTION: Requirement route is headerless while Add and Edit remain localized', async () => {
  const [layout, requirement, person] = await Promise.all([
    readFile('app/_layout.tsx', 'utf8'),
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
  ]);
  sourceMatch(layout, /name="requirement\/\[requirementId\]" options=\{\{ headerShown: false \}\}/);
  sourceMatch(requirement, /editing \? t\('requirements\.edit'\) : t\('requirements\.add'\)/);
  sourceMatch(person, /testID="person-primary-action"/);
  assert.equal((person.match(/testID="person-primary-action"/g) ?? []).length, 1);
  sourceMatch(person, /const primaryActionTitle = \(classification: PersonClassification\)/);
  sourceMatch(person, /person\.classifications\.length > 1/);
  sourceMatch(person, /person\.classifications\.map\(classification =>/);
  sourceDoesNotMatch(person, /person-add-requirement|person-add-wanted-studio/);
});

test('SOURCE ASSERTION: Search presentation never falls back to internal IDs', async () => {
  const [search, i18n] = await Promise.all([
    readFile('app/search.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  sourceDoesNotMatch(search, /description\?\.value \?\? property\.core\.id/);
  sourceDoesNotMatch(search, /: property\.core\.locationArea\.id/);
  sourceDoesNotMatch(search, /: areaId;/);
  // Optional public descriptions are omitted, not described as unavailable.
  // The localized match explanation still supplies useful result context.
  sourceDoesNotMatch(search, /search\.property_description_unknown/);
  sourceMatch(search, /matchReasonLabel/);
  sourceMatch(search, /search\.area_unknown/);
  sourceMatch(i18n, /'search\.property_description_unknown'/);
});

test('SOURCE ASSERTION: Contact review and results use bounded lists without changing phone semantics', async () => {
  const source = await readFile('components/BatchContactImportModal.tsx', 'utf8');
  sourceMatch(source, /data=\{Object\.values\(selected\)\}/);
  sourceMatch(source, /data=\{summary\?\.results \?\? \[\]\}/);
  sourceMatch(source, /style=\{styles\.flexList\}/);
  sourceMatch(source, /keyboardShouldPersistTaps="handled"/);
  sourceMatch(source, /normalizePhoneForCountry\(raw, item\.country \?\? 'KW'\)/);
  sourceMatch(source, /contactPhonePresentation\(raw, resolved\.normalizedPhone\)/);
  sourceMatch(source, /createContactBatchSubmissionGuard/);
});

test('SOURCE ASSERTION: Matching UI delegates to one versioned engine without data writes', async () => {
  const source = await readFile('app/(tabs)/matching.tsx', 'utf8');
  sourceMatch(source, /MatchingResultsGroups/);
  const grouped = await readFile('components/MatchingResultsGroups.tsx', 'utf8');
  sourceMatch(grouped, /MatchingResultCard/);
  sourceDoesNotMatch(grouped, /saveRequirement|updateRequirement|saveProperty|setItem|evaluateMatch|BrokerInitiatedMatching/);
  sourceMatch(source, /matching\.saved\.matchAllDescription/);
  sourceMatch(source, /runSavedMatchingScope/);
  sourceMatch(await readFile('services/matchingScope.ts', 'utf8'), /MATCH_ENGINE_VERSION/);
  sourceDoesNotMatch(source, /saveRequirement|updateRequirement|saveProperty|setItem/);
});