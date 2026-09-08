import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateMatch, type SeekerRequirement } from '@workspace/property-domain';
import { buildPersonRequirement, formValuesFromRequirement, parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';

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

test('Person workflow builds valid Rent and Buy M1 requirements without rental period', () => {
  const rent = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', bedroomsMinimum: 2, occupancy: 'any' });
  assert.equal(rent.ok, true);
  if (!rent.ok) return;
  assert.equal(rent.value.seekerId, SEEKER);
  assert.deepEqual(rent.value.preferredAreaIds, ['salmiya', 'midan_hawalli']);
  assert.equal(rent.value.notes, '  literal broker note  ');
  assert.equal((rent.value as unknown as Record<string, unknown>).rentalPeriodId, undefined);
  assert.equal(rent.value.purpose === 'rent' && rent.value.occupancy, 'any');

  const buy = buildPersonRequirement('22222222-2222-4222-8222-222222222222', SEEKER, { ...basic, purpose: 'buy', bedroomsMinimum: 9, occupancy: 'family', swimmingPool: true });
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.value.purpose, 'buy');
  for (const field of ['bedroomsMinimum', 'bathroomsMinimum', 'occupancy', 'swimmingPool', 'gym', 'seaView', 'centralAC', 'rentalPeriodId']) assert.equal((buy.value as unknown as Record<string, unknown>)[field], undefined);
});

test('missing occupancy differs from explicit Any and inactive services remain missing', () => {
  const missing = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent' });
  const any = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent', occupancy: 'any', gym: false });
  assert.equal(missing.ok && missing.value.purpose === 'rent' ? missing.value.occupancy : 'bad', undefined);
  assert.equal(any.ok && any.value.purpose === 'rent' ? any.value.occupancy : undefined, 'any');
  assert.equal(any.ok ? (any.value as unknown as Record<string, unknown>).gym : 'bad', undefined);
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

test('multiple requirement identities remain distinct while retaining the same owner', () => {
  const one = buildPersonRequirement(ID, SEEKER, { ...basic, purpose: 'rent' });
  const two = buildPersonRequirement('33333333-3333-4333-8333-333333333333', SEEKER, { ...basic, purpose: 'buy' });
  assert.equal(one.ok && two.ok, true);
  if (!one.ok || !two.ok) return;
  const records: SeekerRequirement[] = [one.value, two.value];
  assert.equal(new Set(records.map(item => item.id)).size, 2);
  assert.ok(records.every(item => item.seekerId === SEEKER));
});

test('Shop requirement preserves only Shop criteria for both Rent and Buy', () => {
  for (const purpose of ['rent', 'buy'] as const) {
    const built = buildPersonRequirement(ID, SEEKER, {
      ...basic,
      purpose,
      propertyType: 'shop',
      minimumBuiltUpAreaSquareMeters: 80,
      maximumBuiltUpAreaSquareMeters: 120,
      commercialActivity: 'Coffee & Gifts',
      floorNumber: 0,
      minimumFrontageWidthMeters: 8,
      bedroomsMinimum: 9,
      bathroomsMinimum: 9,
      occupancy: 'family',
      swimmingPool: true,
    });
    assert.equal(built.ok, true);
    if (!built.ok) continue;
    assert.equal(built.value.minimumBuiltUpAreaSquareMeters, 80);
    assert.equal(built.value.maximumBuiltUpAreaSquareMeters, 120);
    assert.equal(built.value.commercialActivity, 'Coffee & Gifts');
    assert.equal(built.value.floorNumber, 0);
    assert.equal(built.value.minimumFrontageWidthMeters, 8);
    for (const field of ['bedroomsMinimum', 'bathroomsMinimum', 'occupancy', 'swimmingPool']) {
      assert.equal((built.value as unknown as Record<string, unknown>)[field], undefined);
    }
  }
});

test('commercial area range round-trips for Shop, Office, and Floor only', () => {
  for (const propertyType of ['shop', 'office', 'floor'] as const) {
    const built = buildPersonRequirement(ID, SEEKER, {
      ...basic,
      purpose: 'buy',
      propertyType,
      ...(propertyType === 'floor' ? { floorUse: 'commercial' as const } : {}),
      minimumBuiltUpAreaSquareMeters: 80,
      maximumBuiltUpAreaSquareMeters: 120,
    });
    assert.equal(built.ok, true);
    if (!built.ok) continue;
    const form = formValuesFromRequirement(built.value);
    assert.equal(form.minimumBuiltUpAreaSquareMeters, 80);
    assert.equal(form.maximumBuiltUpAreaSquareMeters, 120);
  }

  const residential = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'buy',
    propertyType: 'apartment',
    minimumBuiltUpAreaSquareMeters: 80,
    maximumBuiltUpAreaSquareMeters: 120,
  });
  assert.equal(residential.ok, true);
  if (residential.ok) {
    assert.equal(residential.value.minimumBuiltUpAreaSquareMeters, undefined);
    assert.equal(residential.value.maximumBuiltUpAreaSquareMeters, undefined);
  }
});

test('Floor Requirement workflow stores only criteria for the selected use', () => {
  const residential = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'rent',
    propertyType: 'floor',
    floorUse: 'residential',
    bedroomsMinimum: 3,
    bathroomsMinimum: 2,
    occupancy: 'family',
    minimumBuiltUpAreaSquareMeters: 100,
    commercialActivity: 'Retail',
  });
  assert.equal(residential.ok, true);
  if (residential.ok) {
    assert.equal(residential.value.floorUse, 'residential');
    assert.equal((residential.value as unknown as Record<string, unknown>).bedroomsMinimum, 3);
    assert.equal(residential.value.minimumBuiltUpAreaSquareMeters, undefined);
    assert.equal(residential.value.commercialActivity, undefined);
  }

  const commercial = buildPersonRequirement(ID, SEEKER, {
    ...basic,
    purpose: 'rent',
    propertyType: 'floor',
    floorUse: 'commercial',
    bedroomsMinimum: 3,
    occupancy: 'family',
    minimumBuiltUpAreaSquareMeters: 100,
    maximumBuiltUpAreaSquareMeters: 200,
    commercialActivity: 'Retail',
    floorNumber: 2,
    minimumFrontageWidthMeters: 8,
  });
  assert.equal(commercial.ok, true);
  if (commercial.ok) {
    assert.equal(commercial.value.floorUse, 'commercial');
    assert.equal(commercial.value.minimumBuiltUpAreaSquareMeters, 100);
    assert.equal(commercial.value.maximumBuiltUpAreaSquareMeters, 200);
    assert.equal(commercial.value.commercialActivity, 'Retail');
    assert.equal(commercial.value.floorNumber, 2);
    assert.equal(commercial.value.minimumFrontageWidthMeters, 8);
    assert.equal((commercial.value as unknown as Record<string, unknown>).bedroomsMinimum, undefined);
    assert.equal((commercial.value as unknown as Record<string, unknown>).occupancy, undefined);
  }
});

test('editing infers Commercial only for legacy Floor Requirements with commercial criteria', () => {
  const legacyFloor = {
    id: ID,
    seekerId: SEEKER,
    purpose: 'buy' as const,
    propertyType: 'floor' as const,
    preferredAreaIds: ['salmiya'],
    budget: { minimum: 100_000, maximum: 500_000, currencyCode: 'KWD' },
    notes: '',
  };
  const legacyCommercial = formValuesFromRequirement({
    ...legacyFloor,
    minimumBuiltUpAreaSquareMeters: 100,
  });
  assert.equal(legacyCommercial.floorUse, 'commercial');

  const legacyUnclassified = formValuesFromRequirement({
    ...legacyFloor,
  });
  assert.equal(legacyUnclassified.floorUse, undefined);
});

test('Requirement editor renders commercial area range plus Shop-specific details', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const detailsBranch = source.slice(source.indexOf('{step === 4'), source.indexOf('{step === 5'));
  assert.match(detailsBranch, /propertyType === 'shop'/);
  for (const testId of ['requirement-commercial-area-min', 'requirement-commercial-area-max', 'requirement-shop-activity', 'requirement-shop-floor', 'requirement-shop-frontage']) {
    assert.match(detailsBranch, new RegExp(`testID=\"${testId}\"`));
  }
  assert.match(source, /testID=\{`requirement-floor-use-\$\{value\}`\}/);
  assert.match(detailsBranch, /propertyType === 'floor' && floorUse === 'commercial'/);
  assert.match(detailsBranch, /purpose === 'rent'/);
});

test('Requirement wizard keeps navigation outside scroll content and inside the safe keyboard-aware area', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const scrollEnd = source.indexOf('</KeyboardAwareScrollViewCompat>');
  const footerStart = source.indexOf('<View style={[styles.footer');

  assert.match(source, /paddingTop:\s*insets\.top/);
  assert.match(source, /<KeyboardAvoidingView behavior="padding" style=\{styles\.body\}>/);
  assert.ok(scrollEnd >= 0 && footerStart > scrollEnd);
  assert.match(source, /paddingBottom:\s*Math\.max\(insets\.bottom,\s*16\)/);
  assert.match(source, /footer:\s*\{[^}]*borderTopWidth:\s*StyleSheet\.hairlineWidth/);
});
