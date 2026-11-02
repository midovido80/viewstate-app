import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_NEARBY_SERVICES,
  PROPERTY_DEMO_CATALOG,
  getGenericCaptureTypesForTransaction,
  parseDemoNumericInput,
  hasPopulatedCategoryCapture,
  createDemoCategoryTransitionProposal,
  applyDemoCategoryTransition,
  createDemoTransactionTransitionProposal,
  applyDemoTransactionTransition,
  canonicalApartmentSubtypeForCategory,
} from '@/services/propertyDemoCatalog';
import {
  getSelectableKuwaitAreas,
  searchAreasSorted,
  validateKuwaitAreaPresentation,
} from '@/constants/kuwait-areas';
import { buildPropertyUpdateCandidate, createEditDraft } from '@/services/propertyUpdateRecovery';
import { projectDraftToProperty } from '@workspace/property-domain';

test('BEHAVIOR: every attachment category variant has canonical transaction and complete matrix', () => {
  assert.deepEqual(PROPERTY_DEMO_CATALOG.map(category => category.id), [
    'whole_building_corporate_rent', 'whole_building_sale', 'commercial_complex_sale',
     'family_apartment', 'studio_apartment', 'bachelor_apartment', 'house', 'villa', 'chalet', 'warehouse', 'duplex',
  ]);
  for (const category of PROPERTY_DEMO_CATALOG) {
    assert.ok(category.canonicalType);
    assert.ok(category.transaction === 'rent' || category.transaction === 'sale');
    assert.ok(category.numericFields.length > 0);
    assert.ok(category.features.length > 0);
  }
});

test('BEHAVIOR: apartment categories map to canonical subtypes without a top-level duplex type', () => {
  assert.equal(canonicalApartmentSubtypeForCategory('family_apartment'), 'standard_apartment');
  assert.equal(canonicalApartmentSubtypeForCategory('studio_apartment'), 'studio');
  assert.equal(canonicalApartmentSubtypeForCategory('duplex'), 'duplex');
  assert.equal(PROPERTY_DEMO_CATALOG.find(item => item.id === 'duplex')?.canonicalType, 'apartment');
});

test('BEHAVIOR: a standard apartment sale remains selectable without relabeling a duplex or widening other generic types', () => {
  const types = ['apartment', 'villa', 'floor', 'shop'] as const;
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, 'sale'), ['apartment', 'floor', 'shop']);
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, 'rent'), ['floor', 'shop']);
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, undefined), ['floor', 'shop']);
});

test('BEHAVIOR: numeric parser preserves zero and normalizes Western Arabic Persian digits', () => {
  assert.equal(parseDemoNumericInput('0'), 0);
  assert.equal(parseDemoNumericInput('٣'), 3);
  assert.equal(parseDemoNumericInput('۴٫۵', true), 4.5);
  assert.equal(parseDemoNumericInput('۴٫۵'), null);
  assert.equal(parseDemoNumericInput('-1'), null);
  assert.equal(parseDemoNumericInput(''), null);
});

test('BEHAVIOR: nearby identifiers are stable and bilingual', () => {
  assert.equal(DEMO_NEARBY_SERVICES.length, 16);
  assert.equal(new Set(DEMO_NEARBY_SERVICES.map(item => item.id)).size, 16);
  for (const item of DEMO_NEARBY_SERVICES) assert.ok(item.label[0] && item.label[1]);
});

test('BEHAVIOR: empty synchronized nearby state does not trigger category confirmation', () => {
  assert.equal(hasPopulatedCategoryCapture({ nearbyServices: '[]' }), false);
  assert.equal(hasPopulatedCategoryCapture({ demoMetadata: { categoryId: 'family_apartment' } }), false);
  assert.equal(hasPopulatedCategoryCapture({ areaSquareMeters: 0, areaUnit: 'square_meter' }), false);
  assert.equal(hasPopulatedCategoryCapture({ nearbyServices: '["school"]' }), true);
});

test('BEHAVIOR: demo metadata is included in guarded edit candidates', () => {
  const projected = projectDraftToProperty({
    propertyCoreId: 'demo-property',
    offerId: 'demo-offer',
    propertyType: 'villa',
    locationAreaId: 'adailiya',
    transaction: 'sale',
    salePrice: { amount: 100000, currencyCode: 'KWD' },
  });
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  const baseline = {
    ...projected.value,
    demoCapture: {
      categoryId: 'villa' as const,
      numericValues: { bedroomCount: 4 },
      selectedFeatures: ['garden'],
    },
    nearbyServices: ['school'],
  };
  const draft = createEditDraft(baseline);
  const candidate = buildPropertyUpdateCandidate(baseline, {
    ...draft.choices,
    canonicalDetails: { ...draft.choices.canonicalDetails, bedroomCount: '5' },
    nearbyServices: ['school', 'hospital'],
  });
  assert.equal((candidate.typeDetails as { bedroomCount?: number } | undefined)?.bedroomCount, 5);
  assert.equal(candidate.demoCapture?.numericValues?.bedroomCount, undefined);
  assert.deepEqual(candidate.nearbyServices, ['school', 'hospital']);

  const cleared = buildPropertyUpdateCandidate(baseline, {
    ...draft.choices,
    canonicalDetails: { ...draft.choices.canonicalDetails, bedroomCount: '' },
  });
  assert.equal((cleared.typeDetails as { bedroomCount?: number } | undefined)?.bedroomCount, undefined);
  assert.equal(cleared.demoCapture?.numericValues?.bedroomCount, undefined);
});

test('BEHAVIOR: category transitions retain compatible IDs and reject stale proposals', () => {
  const source = {
    categoryId: 'family_apartment' as const,
    numericValues: { bedroomCount: 3, bathroomCount: 2 },
    choices: { furnishing: 'furnished' },
    selectedFeatures: ['balcony', 'garden'],
    nearbyServices: ['school'],
  };
  const proposal = createDemoCategoryTransitionProposal(source, 'duplex');
  assert.ok(proposal);
  assert.equal(proposal?.sourceSnapshot, JSON.stringify(source));
  const transitioned = applyDemoCategoryTransition(source, proposal!);
  assert.ok(transitioned);
  assert.equal(transitioned?.categoryId, 'duplex');
  assert.equal(transitioned?.numericValues?.bedroomCount, 3);
  assert.deepEqual(transitioned?.nearbyServices, ['school']);
  assert.equal(applyDemoCategoryTransition({ ...source, numericValues: { bedroomCount: 4 } }, proposal!), null);
});

test('BEHAVIOR: transaction transitions clear only transaction-specific offer state', () => {
  const draft = {
    propertyCoreId: 'transition-property',
    offerId: 'transition-offer',
    propertyType: 'apartment' as const,
    locationAreaId: 'adailiya',
    block: '4',
    transaction: 'rent' as const,
    rentalPrice: { amount: 700, currencyCode: 'KWD' as const },
    rentalPeriodId: 'monthly' as const,
    description: { value: 'shared', privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const } },
  };
  const metadata = { categoryId: 'family_apartment' as const, nearbyServices: ['school'] };
  const proposal = createDemoTransactionTransitionProposal(draft, metadata, 'sale');
  assert.ok(proposal);
  const transitioned = applyDemoTransactionTransition(draft, metadata, proposal!);
  assert.ok(transitioned);
  assert.equal(transitioned?.draft.transaction, 'sale');
  assert.equal(transitioned?.draft.rentalPrice, undefined);
  assert.equal(transitioned?.draft.rentalPeriodId, undefined);
  assert.equal(transitioned?.draft.block, '4');
  assert.deepEqual(transitioned?.nearbyServices, ['school']);
  assert.equal(applyDemoTransactionTransition({ ...draft, block: '5' }, metadata, proposal!), null);
});

test('BEHAVIOR: selectable area presentation is unique, grouped, sorted, and excludes Doha/Qatar', () => {
  const areas = getSelectableKuwaitAreas();
  assert.equal(validateKuwaitAreaPresentation(areas).ok, true);
  assert.equal(new Set(areas.map(area => area.id)).size, areas.length);
  assert.equal(areas.some(area => /doha|qatar/i.test(`${area.id} ${area.en} ${area.ar}`)), false);
  const english = searchAreasSorted('  salmiya ', 'en');
  const arabic = searchAreasSorted('سالم', 'ar');
  assert.equal(english[0]?.id, 'salmiya');
  assert.ok(arabic.length > 0);
  assert.ok(arabic.every(area => area.governorateEn && area.governorateAr));
});
