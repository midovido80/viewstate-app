import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  DEMO_NEARBY_SERVICES,
  PROPERTY_DEMO_CATALOG,
  getGenericCaptureTypesForTransaction,
  getDemoCategoriesForTransaction,
  createDemoTransactionTransitionProposal,
  parseDemoNumericInput,
  hasPopulatedCategoryCapture,
  createDemoCategoryTransitionProposal,
  applyDemoCategoryTransition,
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

test('BEHAVIOR: transaction-aware generic fallbacks include types preset only for the opposite transaction', () => {
  const types = ['apartment', 'villa', 'floor', 'shop'] as const;
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, 'sale'), ['apartment', 'floor', 'shop']);
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, 'rent'), ['villa', 'floor', 'shop']);
  assert.deepEqual(getGenericCaptureTypesForTransaction(types, undefined), ['floor', 'shop']);
});

test('BEHAVIOR: studio sale and duplex rent are selectable apartment presets with stable subtype', () => {
  const saleCategoryIds = getDemoCategoriesForTransaction(PROPERTY_DEMO_CATALOG, 'sale').map(item => item.id);
  const rentCategoryIds = getDemoCategoriesForTransaction(PROPERTY_DEMO_CATALOG, 'rent').map(item => item.id);
  assert.ok(saleCategoryIds.includes('studio_apartment'));
  assert.ok(rentCategoryIds.includes('duplex'));
  assert.equal(canonicalApartmentSubtypeForCategory('studio_apartment'), 'studio');
  assert.equal(canonicalApartmentSubtypeForCategory('duplex'), 'duplex');

  const studioMetadata = { categoryId: 'studio_apartment' as const };
  const saleStudioToRent = createDemoTransactionTransitionProposal(
    { propertyCoreId: 'p', offerId: 'o', propertyType: 'apartment', transaction: 'sale' },
    studioMetadata,
    'rent',
  );
  const duplexMetadata = { categoryId: 'duplex' as const };
  const rentDuplexToSale = createDemoTransactionTransitionProposal(
    { propertyCoreId: 'p', offerId: 'o', propertyType: 'apartment', transaction: 'rent' },
    duplexMetadata,
    'sale',
  );
  assert.equal(saleStudioToRent?.clearCategory, false);
  assert.equal(rentDuplexToSale?.clearCategory, false);
  const studioTransition = applyDemoTransactionTransition(
    { propertyCoreId: 'p', offerId: 'o', propertyType: 'apartment', transaction: 'sale' },
    studioMetadata,
    saleStudioToRent!,
  );
  const duplexTransition = applyDemoTransactionTransition(
    { propertyCoreId: 'p', offerId: 'o', propertyType: 'apartment', transaction: 'rent' },
    duplexMetadata,
    rentDuplexToSale!,
  );
  assert.equal(studioTransition?.metadata?.categoryId, 'studio_apartment');
  assert.equal(studioTransition?.draft.propertyType, 'apartment');
  assert.equal(duplexTransition?.metadata?.categoryId, 'duplex');
  assert.equal(duplexTransition?.draft.propertyType, 'apartment');
});

test('BEHAVIOR: every non-legacy approved property type is reachable for either transaction', () => {
  const types = [
    'whole_building', 'commercial_complex', 'apartment', 'floor', 'house', 'villa',
    'office', 'shop', 'warehouse', 'chalet', 'commercial_plot', 'other_built_property',
  ] as const;
  for (const transaction of ['sale', 'rent'] as const) {
    const availableThroughPresets = new Set(
      getDemoCategoriesForTransaction(PROPERTY_DEMO_CATALOG, transaction).map(category => category.canonicalType),
    );
    for (const type of getGenericCaptureTypesForTransaction(types, transaction)) availableThroughPresets.add(type);
    assert.deepEqual(
      [...availableThroughPresets].filter(type => type !== 'other_built_property').sort(),
      types.filter(type => type !== 'other_built_property').slice().sort(),
    );
  }
  assert.equal(getGenericCaptureTypesForTransaction(types, 'sale').includes('other_built_property'), false);
  assert.equal(getGenericCaptureTypesForTransaction(types, 'rent').includes('commercial_plot'), true);
  assert.equal(getGenericCaptureTypesForTransaction(types, 'sale').includes('commercial_plot'), true);
});

test('SOURCE ASSERTION: capture exposes transaction-aware categories and studio warnings', async () => {
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  const translations = await readFile('contexts/I18nContext.tsx', 'utf8');
  assert.match(capture, /getDemoCategoriesForTransaction\(PROPERTY_DEMO_CATALOG, draft\.transaction\)/);
  assert.match(capture, /canUseDemoCategoryForTransaction\(category, draft\.transaction\)/);
  assert.match(capture, /canUseDemoCategoryForTransaction\(demoCategory, draft\.transaction\)/);
  assert.match(capture, /transaction: draft\.transaction \?\? category\.transaction/);
  assert.match(capture, /t\(`propertyType\.\$\{type\}/);
  assert.match(translations, /'propertyType\.commercial_plot': 'Commercial plot'/);
  assert.match(translations, /'propertyType\.commercial_plot': 'أرض تجارية'/);
  assert.match(capture, /getStudioStandardWarnings\(candidate\.typeDetails\)/);
  assert.match(capture, /capture-studio-guidance/);
  assert.match(capture, /capture-studio-standard-warning/);
  assert.match(capture, /optional hall and no kitchen/);
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
  assert.equal(DEMO_NEARBY_SERVICES.length, 10);
  assert.equal(new Set(DEMO_NEARBY_SERVICES.map(item => item.id)).size, 10);
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