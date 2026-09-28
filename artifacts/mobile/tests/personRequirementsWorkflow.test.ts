import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateMatch, normalizeSeekerRequirement, validateSeekerRequirement, type SeekerRequirement } from '@workspace/property-domain';
import { buildPersonRequirement, formValuesFromRequirement, parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';
import { KUWAIT_GOVERNORATES, searchAreasSorted } from '@/constants/kuwait-areas';

const ID = '11111111-1111-4111-8111-111111111111';
const SEEKER = 'person-seeker';
const basic = {
  propertyType: 'apartment' as const,
  preferredAreaIds: ['salmiya', 'midan_hawalli'],
  minimumBudget: 350,
  maximumBudget: 450,
  currencyCode: 'KWD',
  notes: '  literal broker note  ',
};

test('Person workflow defaults Rent to monthly and excludes cadence from Buy', () => {
  const rent = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', bedroomsMinimum: 2, occupancy: 'any' });
  assert.equal(rent.ok, true);
  if (!rent.ok) return;
  assert.equal(rent.value.seekerId, SEEKER);
  assert.deepEqual(rent.value.preferredAreaIds, ['salmiya', 'midan_hawalli']);
  assert.equal(rent.value.notes, '  literal broker note  ');
  assert.equal((rent.value as unknown as Record<string, unknown>).rentalPeriodId, 'monthly');
  assert.equal(rent.value.purpose === 'rent' && rent.value.occupancy, 'any');

  const buy = buildPersonRequirement('22222222-2222-4222-8222-222222222222', SEEKER, { ...basic, purpose: 'buy', bedroomsMinimum: 9, bathroomsMinimum: 3, centralAC: true, occupancy: 'family', swimmingPool: true });
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.value.purpose, 'buy');
  assert.equal((buy.value as unknown as Record<string, unknown>).bedroomsMinimum, 9);
  assert.equal((buy.value as unknown as Record<string, unknown>).bathroomsMinimum, 3);
  assert.equal((buy.value as unknown as Record<string, unknown>).centralAC, true);
  for (const field of ['occupancy', 'swimmingPool', 'gym', 'seaView', 'rentalPeriodId']) assert.equal((buy.value as unknown as Record<string, unknown>)[field], undefined);
});

test('Yearly Rent cadence survives edit round-trip without entering Buy', () => {
  const yearly = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', rentalPeriodId: 'yearly' });
  assert.equal(yearly.ok, true);
  if (!yearly.ok) return;
  assert.equal(formValuesFromRequirement(yearly.value).rentalPeriodId, 'yearly');
  const buy = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'buy', rentalPeriodId: 'yearly' });
  assert.equal(buy.ok, true);
  if (buy.ok) assert.equal('rentalPeriodId' in buy.value, false);
});

test('area mode and Founder Requirement fields survive adapter round-trip', () => {
  const source = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'rent',
    preferredAreaMode: 'all_kuwait',
    preferredAreaIds: [],
    bedroomsMinimum: 3,
    masterBedroomsMinimum: 2,
    driverRoom: true,
  });
  assert.equal(source.ok, true);
  if (!source.ok) return;
  assert.equal(source.value.preferredAreaMode, 'all_kuwait');
  assert.deepEqual(source.value.preferredAreaIds, []);
  const restored = formValuesFromRequirement(source.value);
  assert.equal(restored.preferredAreaMode, 'all_kuwait');
  assert.deepEqual(restored.preferredAreaIds, []);
  assert.equal(restored.masterBedroomsMinimum, 2);
  assert.equal(restored.driverRoom, true);
});

test('legacy false amenity alias reopens as an exclusion and survives edit round-trip', () => {
  const legacy = normalizeSeekerRequirement({
    id: ID,
    seekerId: SEEKER,
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['salmiya'],
    budget: { minimum: 300, maximum: 500, currencyCode: 'KWD' },
    notes: '',
    catalogPreferences: [{ field: 'hasMaidRoom', kind: 'feature', value: false }],
  });
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  const restored = formValuesFromRequirement(legacy.value);
  assert.deepEqual(restored.preferredAmenityExclusions, ['maid_room']);
  assert.equal(restored.catalogPreferences, undefined);
  const edited = buildPersonRequirement(ID, SEEKER, { ...restored, notes: 'edited' });
  assert.equal(edited.ok, true);
  if (edited.ok) {
    assert.deepEqual(edited.value.preferredAmenityExclusions, ['maid_room']);
    assert.equal(edited.value.catalogPreferences, undefined);
  }
});

test('missing occupancy and services differ from explicit Any and false', () => {
  const missing = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent' });
  const any = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', occupancy: 'any', gym: false });
  assert.equal(missing.ok && missing.value.purpose === 'rent' ? missing.value.occupancy : 'bad', undefined);
  assert.equal(any.ok && any.value.purpose === 'rent' ? any.value.occupancy : undefined, 'any');
  assert.equal(missing.ok ? (missing.value as unknown as Record<string, unknown>).gym : 'bad', undefined);
  assert.equal(any.ok ? (any.value as unknown as Record<string, unknown>).gym : 'bad', false);
});

test('M1 rejects duplicate areas and invalid budget order', () => {
  const duplicate = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', preferredAreaIds: ['salmiya', 'salmiya'] });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.ok(duplicate.issues.some(issue => issue.code === 'duplicate_area_id'));
  const budget = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'buy', minimumBudget: 500, maximumBudget: 400 });
  assert.equal(budget.ok, false);
  if (!budget.ok) assert.ok(budget.issues.some(issue => issue.code === 'invalid_budget'));
});

test('edit adapter preserves immutable identity, owner, area order and literal notes', () => {
  const source = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', bathroomsMinimum: 2 });
  assert.equal(source.ok, true);
  if (!source.ok) return;
  const edited = buildPersonRequirement(source.value.id, source.value.seekerId, { ...formValuesFromRequirement(source.value), maximumBudget: 475 });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.value.id, ID);
  assert.equal(edited.value.seekerId, SEEKER);
  assert.deepEqual(edited.value.preferredAreaIds, basic.preferredAreaIds);
  assert.equal(edited.value.notes, basic.notes);
});

test('an unrelated edit preserves an existing non-default explicit currency', () => {
  const source = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'buy',
    currencyCode: 'USD',
  });
  assert.equal(source.ok, true);
  if (!source.ok) return;
  const edited = buildPersonRequirement(source.value.id, source.value.seekerId, {
    ...formValuesFromRequirement(source.value),
    notes: 'changed note only',
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.value.budget.currencyCode, 'USD');
});

test('numeric input parser separates missing, valid, and malformed values', () => {
  assert.deepEqual(parseOptionalRequirementNumber('   '), { ok: true, value: undefined });
  assert.deepEqual(parseOptionalRequirementNumber('350.5'), { ok: true, value: 350.5 });
  assert.deepEqual(parseOptionalRequirementNumber('2', { integer: true }), { ok: true, value: 2 });
  assert.deepEqual(parseOptionalRequirementNumber('12x'), { ok: false });
  assert.deepEqual(parseOptionalRequirementNumber('2.5', { integer: true }), { ok: false });
  assert.deepEqual(parseOptionalRequirementNumber('-1'), { ok: false });
});

test('notes do not change frozen M2 matching output', () => {
  const first = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', notes: 'first' });
  const second = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', notes: 'completely different' });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  const candidate: Parameters<typeof evaluateMatch>[1] = { property: { core: { id: 'p1', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: 'o1', propertyCoreId: 'p1', transaction: 'rent', rentalPrice: { amount: 400, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' } } };
  assert.deepEqual(evaluateMatch(first.value, candidate), evaluateMatch(second.value, candidate));
});

test('residential amenities preserve missing, explicit empty, canonical order, and scored services', () => {
  const missing = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', swimmingPool: true, centralAC: true });
  const empty = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'buy', preferredAmenities: [] });
  const populated = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'rent',
    swimmingPool: true,
    centralAC: true,
    preferredAmenities: ['bbq_area', 'heating', 'maid_room'],
  });
  assert.equal(missing.ok && 'preferredAmenities' in missing.value, false);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.ok ? empty.value.preferredAmenities : null, []);
  assert.deepEqual(populated.ok ? populated.value.preferredAmenities : null, ['heating', 'maid_room', 'bbq_area']);
  assert.equal(populated.ok && populated.value.purpose === 'rent' ? populated.value.swimmingPool : false, true);
  assert.equal(populated.ok && populated.value.purpose === 'rent' ? populated.value.centralAC : false, true);
  if (!populated.ok) return;
  const edited = buildPersonRequirement(populated.value.id, populated.value.seekerId, {
    ...formValuesFromRequirement(populated.value),
    notes: 'unrelated edit',
  });
  assert.deepEqual(edited.ok ? edited.value.preferredAmenities : null, populated.value.preferredAmenities);
});

test('residential amenities validate IDs, duplicates, applicability, and remain informational to Matching', () => {
  const source = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', preferredAmenities: ['garden'] });
  const without = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent' });
  assert.equal(source.ok && without.ok, true);
  if (!source.ok || !without.ok) return;
  const candidate: Parameters<typeof evaluateMatch>[1] = { property: { core: { id: 'p1', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: 'o1', propertyCoreId: 'p1', transaction: 'rent', rentalPrice: { amount: 400, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }, typeDetails: { propertyType: 'apartment', hasGarden: true } } };
  assert.deepEqual(evaluateMatch(source.value, candidate), evaluateMatch(without.value, candidate));
  const duplicate = validateSeekerRequirement({ ...source.value, preferredAmenities: ['garden', 'garden'] });
  const invalid = validateSeekerRequirement({ ...source.value, preferredAmenities: ['private_pool'] });
  const floor = validateSeekerRequirement({ ...source.value, propertyType: 'floor', preferredAmenities: [] });
  assert.equal(duplicate.ok, false);
  assert.equal(invalid.ok, false);
  assert.equal(floor.ok, false);
  const normalized = normalizeSeekerRequirement({ ...source.value, preferredAmenities: ['bbq_area', 'balcony'] });
  assert.deepEqual(normalized.ok ? normalized.value.preferredAmenities : null, ['balcony', 'bbq_area']);
});

test('multiple requirement identities remain distinct while retaining the same owner', () => {
  const one = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent' });
  const two = buildPersonRequirement('33333333-3333-4333-8333-333333333333', SEEKER, { ...basic, purpose: 'buy' });
  assert.equal(one.ok && two.ok, true);
  if (!one.ok || !two.ok) return;
  const records: SeekerRequirement[] = [one.value, two.value];
  assert.equal(new Set(records.map(item => item.id)).size, 2);
  assert.ok(records.every(item => item.seekerId === SEEKER));
});

test('Requirement wizard uses wrapped compact choice chips for bounded controls', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(source, /<ChoiceChip/);
   assert.match(source, /styles\.wrap/);
  assert.match(source, /flexWrap: 'wrap'/);
});

test('Requirement area selector uses the canonical six-governorate source and bilingual search', async () => {
  const [selector, requirement] = await Promise.all([
    readFile('components/KuwaitAreaSelector.tsx', 'utf8'),
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
  ]);
  assert.equal(KUWAIT_GOVERNORATES.length, 6);
  assert.ok(searchAreasSorted('salmiya', 'en').some(area => area.id === 'salmiya'));
  assert.ok(searchAreasSorted('سالم', 'ar').some(area => area.id === 'salmiya'));
  assert.ok(searchAreasSorted('Hawalli', 'en').length > 0);
  assert.match(selector, /getAreasByGovernorate/);
  assert.match(selector, /searchAreasSorted/);
  assert.match(selector, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(selector, /selectedIds\.includes/);
   assert.match(requirement, /<KuwaitAreaSelector selectedIds=\{areas\} onChange=\{ids =>/);
});

test('Requirement save serializes direct invocations while preserving sequential distinct requirements', async () => {
  const [requirement, person] = await Promise.all([
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
  ]);
  const saveStart = requirement.indexOf('const save = async () =>');
  const guard = requirement.indexOf('tryStartRequirementSave(saveFlight, !!confirmedRequirement.current, !!uncertainRequirement.current, !!editConflictRequirement.current)', saveStart);
  const firstStoreAwait = requirement.indexOf('await savePersonRequirement(', guard);
  const release = requirement.indexOf('saveFlight.current = false;', firstStoreAwait);
  assert.ok(saveStart >= 0 && guard > saveStart);
  assert.ok(firstStoreAwait > guard, 'single-flight gate must be acquired before persistence');
  assert.ok(release > firstStoreAwait, 'flight must be released after the persistence flight');
  assert.match(requirement, /finally \{\s*if \(isCurrentRoute\(\)\) \{\s*setSaving\(false\);\s*saveFlight\.current = false;/);
  assert.doesNotMatch(requirement, /const save = async \(\) => \{ if \(saving\) return;/);
  assert.doesNotMatch(person, /person-saved-add-requirement|person-add-requirement/);
  assert.match(person, /testID="person-primary-action"/);
  assert.match(person, /getPersonWantedRequirementRoute\(person\.id\)/);
  assert.match(person, /requirements\.map\(requirement/);
  assert.match(person, /testID=\{`requirement-edit-\$\{requirement\.id\}`\}/);
});

test('Requirement return navigation guards destructive click-through on Person details', async () => {
  const [requirement, person] = await Promise.all([
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
  ]);
  assert.match(requirement, /requirementSaved: '1'/);
  assert.match(person, /requirementReturnGuard/);
  assert.match(person, /disabled=\{busy \|\| requirementReturnGuard\}/);
  assert.match(person, /setTimeout\(\(\) => \{/);
  assert.match(person, /testID="requirement-return-click-guard"/);
  assert.match(person, /pointerEvents="auto"/);
  assert.match(person, /StyleSheet\.absoluteFillObject/);
});

test('Requirement wizard keeps navigation outside scroll content and inside the safe keyboard-aware area', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const scrollEnd = source.indexOf('</KeyboardAwareScrollViewCompat>');
   const footerStart = source.indexOf('<View style={styles.footer');

  assert.match(source, /paddingTop:\s*insets\.top/);
  assert.match(source, /<KeyboardAvoidingView behavior="padding" style=\{styles\.body\}>/);
  assert.ok(scrollEnd >= 0 && footerStart > scrollEnd);
   assert.match(source, /paddingTop:\s*insets\.top/);
  assert.match(source, /footer:\s*\{[^}]*borderTopWidth:\s*StyleSheet\.hairlineWidth/);
});

test('Person and Requirement navigation keep normal history and provide bounded no-history fallbacks', async () => {
  const [person, requirement] = await Promise.all([
    readFile('app/person/[personId].tsx', 'utf8'),
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
  ]);

  assert.match(person, /if \(router\.canGoBack\(\)\) \{\s*router\.back\(\)/);
  assert.match(person, /router\.replace\('\/people' as never\)/);
  assert.match(person, /pathname: '\/requirement\/\[requirementId\]'[\s\S]*seekerId: person\.id/);
   assert.match(requirement, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/people'/);
   assert.match(requirement, /const ownerId = baseline\?\.seekerId \?\? ownerFromRoute/);
   assert.match(requirement, /const candidate = \(\) =>/);
   assert.match(requirement, /<TouchableOpacity onPress=\{\(\) =>/);
});

test('People search remains name/phone-only and distinguishes an empty database from no matches', async () => {
  const [people, strings] = await Promise.all([
    readFile('app/(tabs)/people.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  assert.match(people, /const allPeople = store\.getPeople\(\)/);
  assert.match(people, /store\.searchPeople\(search\)/);
  assert.match(people, /setTotalPeople\(all\.length\)/);
  assert.match(people, /totalPeople === 0 \? t\('people\.empty'\) : search\.trim\(\) \? t\('people\.no_search_results'\)/);
  assert.match(people, /testID=\{totalPeople === 0 \? 'people-empty' : 'people-no-search-results'\}/);
  assert.match(strings, /'people\.search': 'Search People by name or phone/);
  assert.match(strings, /'people\.no_search_results': 'No People match this name or phone search/);
  assert.match(strings, /'people\.no_search_results': 'لا يوجد أشخاص يطابقون بحث الاسم أو الهاتف/);
});
