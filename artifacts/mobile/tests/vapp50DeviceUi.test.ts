import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('VAPP-50 language hydration preserves a newer user selection', async () => {
  const source = await readFile('contexts/I18nContext.tsx', 'utf8');
  assert.match(source, /AsyncStorage\.getItem\('@viewstate_language'\)/);
  assert.match(source, /userSelectionVersion\.current === selectionVersionAtStart/);
  assert.match(source, /userSelectionVersion\.current \+= 1/);
  assert.match(source, /\.catch\(console\.error\)/);
});

test('VAPP-50 Requirement route is headerless while Add and Edit remain localized', async () => {
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

test('VAPP-50 Search presentation never falls back to internal IDs', async () => {
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

test('VAPP-50 Contact review and results are vertically reachable without changing phone semantics', async () => {
  const source = await readFile('components/BatchContactImportModal.tsx', 'utf8');
  assert.match(source, /data=\{Object\.values\(selected\)\}/);
  assert.match(source, /data=\{summary\?\.results \?\? \[\]\}/);
  assert.match(source, /style=\{styles\.flexList\}/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /normalizePhoneForCountry\(phone\.phone, item\.country \?\? 'KW'\)/);
  assert.match(source, /createContactBatchSubmissionGuard/);
});

test('VAPP-50 Matching changes are presentation-only', async () => {
  const source = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(source, /explanation\.criterion === 'eligibility' && explanation\.possiblePoints === 0/);
  assert.match(source, /matching\.saved\.matchAllDescription/);
  assert.match(source, /new BrokerInitiatedMatching\(store, candidateSource\)/);
  assert.match(source, /MATCH_QUALIFICATION_THRESHOLD/);
  assert.doesNotMatch(source, /saveRequirement|updateRequirement|saveProperty|setItem/);
});