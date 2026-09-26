import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOOR_USES,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  PROPERTY_TYPES,
} from '@workspace/property-domain';
import {
  OFFER_REQUEST_FORM_CATALOG,
  PROPERTY_FORM_CORE_CATALOG,
  PROPERTY_FORM_CATALOG,
  getApplicablePropertyFormFields,
  getApplicablePropertyFormFieldsForMode,
  type PropertyFormWantedFieldDefinition,
} from '@/services/propertyFormCatalog';
import {
  APPROVED_REQUIREMENT_CATALOG_FIELDS,
  CANONICAL_CATALOG_FIELDS,
  getRequirementCatalogFields,
  getRequirementPresentationFields,
  isRequirementCatalogFieldAllowed,
} from '@/services/requirementFieldMap';

test('Foundation catalog represents each canonical Property field as an offered actual fact', () => {
  assert.equal(OFFER_REQUEST_FORM_CATALOG.core, PROPERTY_FORM_CORE_CATALOG);
  assert.equal(OFFER_REQUEST_FORM_CATALOG.details, PROPERTY_FORM_CATALOG);
  assert.equal(PROPERTY_FORM_CATALOG.length, PROPERTY_DETAIL_FIELD_DEFINITIONS.length);
  for (const domainDefinition of PROPERTY_DETAIL_FIELD_DEFINITIONS) {
    const descriptor = PROPERTY_FORM_CATALOG.find(item => item.field === domainDefinition.field);
    assert.ok(descriptor, domainDefinition.field);
    assert.deepEqual(descriptor.offered, { kind: 'actual_fact', field: domainDefinition.field });
    assert.deepEqual(descriptor.appliesTo, domainDefinition.appliesTo);
    assert.deepEqual(descriptor.floorUses, domainDefinition.floorUses);
  }

  for (const propertyType of PROPERTY_TYPES) {
    const applicable = new Set(PROPERTY_DETAIL_FIELD_DEFINITIONS
      .filter(definition => definition.appliesTo.includes(propertyType))
      .map(definition => definition.field));
    const foundationFields = PROPERTY_FORM_CATALOG
      .filter(definition => definition.appliesTo.includes(propertyType))
      .map(definition => definition.field);
    assert.deepEqual(new Set(foundationFields), applicable, propertyType);
  }
});

test('Wanted descriptors keep actual counts distinct from native Requirement minimums', () => {
  const bedroom = PROPERTY_FORM_CATALOG.find(item => item.field === 'bedroomCount');
  const bathroom = PROPERTY_FORM_CATALOG.find(item => item.field === 'bathroomCount');
  assert.deepEqual(bedroom?.offered, { kind: 'actual_fact', field: 'bedroomCount' });
  assert.deepEqual(bedroom?.wanted, {
    kind: 'limit',
    storage: 'native',
    field: 'bedroomsMinimum',
    comparison: 'minimum',
    presentation: 'core',
  });
  assert.deepEqual(bathroom?.wanted, {
    kind: 'limit',
    storage: 'native',
    field: 'bathroomsMinimum',
    comparison: 'minimum',
    presentation: 'core',
  });
  assert.deepEqual(PROPERTY_FORM_CATALOG.find(item => item.field === 'hasCentralAC')?.wanted, {
    kind: 'preference',
    storage: 'native',
    field: 'centralAC',
    valueType: 'boolean',
    presentation: 'core',
  });
});

test('Only existing bounded catalogPreference meanings receive wanted mappings', () => {
  const expected: Record<string, readonly [string, string?]> = {
    plotAreaSquareMeters: ['number', 'minimum'],
    builtUpAreaSquareMeters: ['number', 'minimum'],
    parkingSpaceCount: ['number', 'minimum'],
    livingRoomCount: ['number', 'minimum'],
    floorNumber: ['number', 'exact'],
    apartmentSubtype: ['choice'],
    furnishing: ['choice'],
    intendedUse: ['choice'],
    commercialActivity: ['choice'],
    hasPool: ['feature'],
    hasWaterfront: ['feature'],
    hasColdStorage: ['feature'],
    hasKitchen: ['feature'],
    hasHall: ['feature'],
    hasParking: ['feature'],
  };
  const mapped = PROPERTY_FORM_CATALOG.filter(item => item.wanted?.storage === 'catalogPreference');
  assert.deepEqual(
    mapped.map(item => item.field).sort(),
    Object.keys(expected).sort(),
  );
  for (const definition of mapped) {
    const wanted = definition.wanted!;
    const approvedMapping = expected[definition.field];
    assert.ok(approvedMapping, definition.field);
    const [preferenceKind, comparison] = approvedMapping;
    assert.equal(wanted.storage, 'catalogPreference', definition.field);
    if (wanted.storage !== 'catalogPreference') continue;
    assert.equal(wanted.field, definition.field);
    assert.equal(wanted.preferenceKind, preferenceKind, definition.field);
    if (comparison && 'comparison' in wanted) {
      assert.equal(wanted.comparison, comparison, definition.field);
    }
  }

  assert.equal(PROPERTY_FORM_CATALOG.find(item => item.field === 'floorCount')?.wanted, undefined);
  assert.equal(PROPERTY_FORM_CATALOG.find(item => item.field === 'clarification')?.wanted, undefined);
  const maidRoom = PROPERTY_FORM_CATALOG.find(item => item.field === 'hasMaidRoom')?.wanted;
  assert.equal(maidRoom?.storage, 'native');
  assert.equal(maidRoom && 'field' in maidRoom ? maidRoom.field : undefined, 'preferredAmenities');
  assert.equal(PROPERTY_FORM_CATALOG.find(item => item.field === 'hasHeating')?.wanted?.storage, 'native');
});

test('Requirement presentation and field allow-lists derive from Foundation metadata and applicability', () => {
  assert.deepEqual([...CANONICAL_CATALOG_FIELDS].sort(), [
    'bathroomCount',
    'bedroomCount',
    'builtUpAreaSquareMeters',
    'floorNumber',
    'hasCentralAC',
    'livingRoomCount',
    'parkingSpaceCount',
    'plotAreaSquareMeters',
  ]);
  assert.deepEqual([...APPROVED_REQUIREMENT_CATALOG_FIELDS].sort(), [
    'apartmentSubtype',
    'commercialActivity',
    'furnishing',
    'hasColdStorage',
    'hasHall',
    'hasKitchen',
    'hasParking',
    'hasPool',
    'hasWaterfront',
    'intendedUse',
  ]);
  for (const propertyType of PROPERTY_TYPES) {
    const expected = getApplicablePropertyFormFields(propertyType)
      .filter(item => item.wanted?.storage === 'catalogPreference'
        && APPROVED_REQUIREMENT_CATALOG_FIELDS.has(item.field))
      .map(item => item.field);
    assert.deepEqual(getRequirementCatalogFields(propertyType).map(item => item.field), expected, propertyType);
    for (const definition of PROPERTY_FORM_CATALOG) {
      assert.equal(isRequirementCatalogFieldAllowed(definition.field), expectedGlobalApproval(definition.field));
    }
  }

  assert.deepEqual(getRequirementPresentationFields('apartment').leading, ['apartmentSubtype', 'furnishing']);
  assert.deepEqual(getRequirementPresentationFields('floor', 'residential').leading, ['furnishing']);
  assert.deepEqual(getRequirementPresentationFields('floor', 'commercial').specifications, ['intendedUse', 'commercialActivity']);
  assert.deepEqual(getRequirementPresentationFields('floor', 'residential').specifications, []);
  assert.equal(getRequirementCatalogFields('floor', 'residential').some(item => item.field === 'commercialActivity'), false);
  for (const field of ['hasKitchen', 'hasHall', 'hasParking'] as const) {
    assert.equal(getRequirementCatalogFields('apartment').some(item => item.field === field), false);
    assert.equal(isRequirementCatalogFieldAllowed(field), false);
  }
});

test('Mode-aware catalog accessor excludes unsupported details from wanted mode', () => {
  const offeredWholeBuilding = getApplicablePropertyFormFieldsForMode('offered', 'whole_building');
  const wantedWholeBuilding: readonly PropertyFormWantedFieldDefinition[] =
    getApplicablePropertyFormFieldsForMode('wanted', 'whole_building');
  assert.ok(offeredWholeBuilding.some(item => item.field === 'floorCount'));
  assert.equal(wantedWholeBuilding.some(item => item.field === 'floorCount'), false);
  assert.ok(wantedWholeBuilding.some(item =>
    item.field === 'builtUpAreaSquareMeters' && item.wanted.storage === 'catalogPreference',
  ));

  const residentialWanted = getApplicablePropertyFormFieldsForMode('wanted', 'floor', 'residential');
  const commercialWanted = getApplicablePropertyFormFieldsForMode('wanted', 'floor', 'commercial');
  const floorUsePreference = residentialWanted.find(item => item.field === 'floorUse')?.wanted;
  assert.deepEqual(floorUsePreference, {
    kind: 'preference',
    storage: 'native',
    field: 'floorUse',
    values: FLOOR_USES,
    presentation: 'none',
  });
  assert.ok(commercialWanted.some(item => item.field === 'floorUse'));
  assert.equal(
    getApplicablePropertyFormFieldsForMode('wanted', 'apartment').some(item => item.field === 'floorUse'),
    false,
  );
  assert.ok(residentialWanted.some(item => item.field === 'bedroomCount'));
  assert.equal(residentialWanted.some(item => item.field === 'commercialActivity'), false);
  assert.ok(commercialWanted.some(item => item.field === 'commercialActivity'));
  assert.equal(commercialWanted.some(item => item.field === 'bedroomCount'), false);
  assert.equal(getRequirementCatalogFields('floor', 'commercial').some(item => item.field === 'floorUse'), false);
  assert.equal(getRequirementPresentationFields('floor', 'commercial').leading.includes('floorUse'), false);
});

test('Shared core descriptors map only existing Property and Requirement paths', () => {
  assert.deepEqual(PROPERTY_FORM_CORE_CATALOG.map(item => item.key), [
    'propertyType', 'transaction', 'location', 'price',
  ]);
  for (const descriptor of PROPERTY_FORM_CORE_CATALOG) {
    assert.deepEqual(descriptor.appliesTo, PROPERTY_TYPES);
  }

  const propertyType = PROPERTY_FORM_CORE_CATALOG.find(item => item.key === 'propertyType');
  if (propertyType?.key === 'propertyType') {
    assert.equal(propertyType.offered.path, 'core.propertyType');
    assert.equal(propertyType.wanted.storage, 'native');
    assert.equal(propertyType.wanted.field, 'propertyType');
    assert.deepEqual(propertyType.wanted.values, PROPERTY_TYPES);
  }

  const transaction = PROPERTY_FORM_CORE_CATALOG.find(item => item.key === 'transaction');
  if (transaction?.key === 'transaction') {
    assert.equal(transaction.offered.path, 'activeOffer.transaction');
    assert.equal(transaction.wanted.field, 'purpose');
    assert.deepEqual(transaction.wanted.mappings, [
      { offered: 'sale', wanted: 'buy' },
      { offered: 'rent', wanted: 'rent' },
    ]);
  }

  const location = PROPERTY_FORM_CORE_CATALOG.find(item => item.key === 'location');
  if (location?.key === 'location') {
    assert.equal(location.offered.path, 'core.locationArea.id');
    assert.deepEqual(location.wanted.fields, ['preferredAreaIds', 'preferredAreaMode']);
    assert.deepEqual(location.wanted.areaModeValues, ['specific_areas', 'all_kuwait']);
  }

  const price = PROPERTY_FORM_CORE_CATALOG.find(item => item.key === 'price');
  if (price?.key === 'price') {
    assert.equal(price.offered.selectedBy, 'activeOffer.transaction');
    assert.equal(price.offered.saleAmountPath, 'activeOffer.salePrice.amount');
    assert.equal(price.offered.rentAmountPath, 'activeOffer.rentalPrice.amount');
    assert.deepEqual(price.wanted, {
      kind: 'range',
      storage: 'native',
      minimumField: 'budget.minimum',
      maximumField: 'budget.maximum',
      currencyField: 'budget.currencyCode',
    });
  }
});

function expectedGlobalApproval(field: string): boolean {
  return !['hasKitchen', 'hasHall', 'hasParking'].includes(field) && [
    'apartmentSubtype', 'furnishing', 'intendedUse', 'commercialActivity',
    'hasPool', 'hasWaterfront', 'hasColdStorage',
  ].includes(field);
}
