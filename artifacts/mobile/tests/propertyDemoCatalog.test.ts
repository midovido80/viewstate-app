import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_NEARBY_SERVICES,
  PROPERTY_DEMO_CATALOG,
  parseDemoNumericInput,
  hasPopulatedCategoryCapture,
} from '@/services/propertyDemoCatalog';
import { buildPropertyUpdateCandidate, createEditDraft } from '@/services/propertyUpdateRecovery';
import { projectDraftToProperty } from '@workspace/property-domain';

test('BEHAVIOR: every attachment category variant has canonical transaction and complete matrix', () => {
  assert.deepEqual(PROPERTY_DEMO_CATALOG.map(category => category.id), [
    'whole_building_corporate_rent', 'whole_building_sale', 'commercial_complex_sale',
    'family_apartment', 'bachelor_apartment', 'house', 'villa', 'chalet', 'warehouse', 'duplex',
  ]);
  for (const category of PROPERTY_DEMO_CATALOG) {
    assert.ok(category.canonicalType);
    assert.ok(category.transaction === 'rent' || category.transaction === 'sale');
    assert.ok(category.numericFields.length > 0);
    assert.ok(category.features.length > 0);
  }
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
    demoMetadata: { ...draft.choices.demoMetadata!, numericValues: { bedroomCount: 5 } },
    nearbyServices: ['school', 'hospital'],
  });
  assert.deepEqual(candidate.demoCapture?.numericValues, { bedroomCount: 5 });
  assert.deepEqual(candidate.nearbyServices, ['school', 'hospital']);
});