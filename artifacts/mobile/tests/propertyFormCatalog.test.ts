import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  PROPERTY_TYPES,
  type PropertyDetailField,
} from '@workspace/property-domain';
import {
  PROPERTY_FORM_CATALOG,
  PROPERTY_FORM_TYPES,
  getApplicablePropertyFormFields,
  isPropertyFormFieldApplicable,
} from '@/services/propertyFormCatalog';

test('BEHAVIOR: the fast property catalog exposes every approved Property type', () => {
  assert.deepEqual(PROPERTY_FORM_TYPES, PROPERTY_TYPES);
  for (const propertyType of PROPERTY_TYPES) {
    assert.ok(PROPERTY_FORM_CATALOG.some(definition => definition.appliesTo.includes(propertyType)));
  }
});

test('BEHAVIOR: catalog applicability is derived from the canonical domain definitions', () => {
  assert.equal(PROPERTY_FORM_CATALOG.length, PROPERTY_DETAIL_FIELD_DEFINITIONS.length);
  for (const definition of PROPERTY_DETAIL_FIELD_DEFINITIONS) {
    const catalogDefinition = PROPERTY_FORM_CATALOG.find(item => item.field === definition.field);
    assert.ok(catalogDefinition);
    assert.deepEqual(catalogDefinition.appliesTo, definition.appliesTo);
    assert.deepEqual(catalogDefinition.floorUses, definition.floorUses);
  }
});

test('BEHAVIOR: Floor exposes exactly Residential and Commercial branches', () => {
  const floorUse = PROPERTY_FORM_CATALOG.find(definition => definition.field === 'floorUse');
  assert.deepEqual(floorUse?.floorUses, undefined);
  assert.deepEqual(
    getApplicablePropertyFormFields('floor').find(definition => definition.field === 'floorUse')?.field,
    'floorUse',
  );

  assert.equal(isPropertyFormFieldApplicable('bedroomCount', 'floor', 'residential'), true);
  assert.equal(isPropertyFormFieldApplicable('bedroomCount', 'floor', 'commercial'), false);
  assert.equal(isPropertyFormFieldApplicable('commercialActivity', 'floor', 'commercial'), true);
  assert.equal(isPropertyFormFieldApplicable('commercialActivity', 'floor', 'residential'), false);
});

test('BEHAVIOR: numeric quick-pick and exact-entry metadata is catalog-owned', () => {
  const controls = new Map<PropertyDetailField, string>(
    PROPERTY_FORM_CATALOG.map(definition => [definition.field, definition.control]),
  );
  assert.equal(controls.get('bedroomCount'), 'numeric_quick_pick');
  assert.equal(controls.get('bathroomCount'), 'numeric_quick_pick');
  assert.equal(controls.get('livingRoomCount'), 'numeric_quick_pick');
  assert.equal(controls.get('parkingSpaceCount'), 'numeric_quick_pick');
  assert.equal(controls.get('floorCount'), 'numeric_quick_pick');
  assert.equal(controls.get('unitCount'), 'numeric_quick_pick');
  assert.equal(controls.get('apartmentCount'), 'numeric_quick_pick');
  assert.equal(controls.get('shopCount'), 'numeric_quick_pick');
  assert.equal(controls.get('officeCount'), 'numeric_quick_pick');
  assert.equal(controls.get('elevatorCount'), 'numeric_quick_pick');
  assert.equal(controls.get('floorNumber'), 'numeric_quick_pick');
  assert.equal(controls.get('loadingBayCount'), 'numeric_quick_pick');
  assert.equal(controls.get('builtUpAreaSquareMeters'), 'decimal');
  assert.equal(controls.get('hasPool'), 'boolean');
});