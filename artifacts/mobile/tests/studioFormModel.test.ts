import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioProperty,
  buildStudioRequirement,
  createStudioFormValues,
  isStudioProperty,
  isStudioRequirement,
  readStudioProperty,
  readStudioRequirement,
  validateStudioForm,
} from '@/services/studioFormModel';
import { isPropertyFormFieldApplicable } from '@/services/propertyFormCatalog';

test('STRUCTURAL: Studio-only facts are hidden from generic apartments without a Studio subtype', () => {
  for (const field of ['studioRoomCount', 'hasKitchen', 'hasHall', 'hasParking'] as const) {
    assert.equal(isPropertyFormFieldApplicable(field, 'apartment'), false);
    assert.equal(isPropertyFormFieldApplicable(field, 'apartment', undefined, 'studio'), true);
  }
});

test('BEHAVIOR: offered Studio builder writes canonical facts, private map metadata, and reads back', () => {
  const values = {
    ...createStudioFormValues('offered', 'rent'),
    locationAreaId: 'salmiya',
    price: '250',
    rentalPeriodId: 'daily' as const,
    areaSquareMeters: '34',
    bathrooms: '1',
    floorNumber: '4',
    kitchen: 'yes' as const,
    hall: 'no' as const,
    parking: 'unknown' as const,
    mapsLink: 'https://www.google.com/maps/place/Kuwait',
    description: 'Bright studio',
  };
  assert.equal(validateStudioForm(values).ok, true);
  const property = buildStudioProperty(values, 'property-1', 'offer-1');
  assert.equal(property.core.id, 'property-1');
  assert.equal(property.activeOffer.id, 'offer-1');
  assert.equal(isStudioProperty(property), true);
  assert.deepEqual(property.typeDetails, {
    propertyType: 'apartment',
    apartmentSubtype: 'studio',
    studioRoomCount: 1,
    builtUpAreaSquareMeters: 34,
    bathroomCount: 1,
    floorNumber: 4,
    hasKitchen: true,
    hasHall: false,
  });
  assert.equal(property.activeOffer.transaction, 'rent');
  assert.equal(property.activeOffer.transaction === 'rent' ? property.activeOffer.rentalPeriodId : '', 'daily');
  assert.equal(property.locationEnrichment?.mapsLink?.privacy.classification, 'exact_location');
  assert.deepEqual(readStudioProperty(property), values);
});

test('BEHAVIOR: wanted Studio builder uses native limits and feature preferences without aliases', () => {
  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '100',
    budgetMaximum: '500',
    areaSquareMeters: '30',
    bathrooms: '1',
    floorNumber: '2',
    kitchen: 'must_not_have' as const,
    hall: 'required' as const,
    parking: 'not_important' as const,
    description: 'Near work',
  };
  assert.equal(validateStudioForm(values).ok, true);
  const requirement = buildStudioRequirement(
    values,
    '11111111-1111-4111-8111-111111111111',
    'seeker-1',
  );
  assert.equal(isStudioRequirement(requirement), true);
  assert.equal(requirement.preferredAreaMode, 'all_kuwait');
  assert.deepEqual(requirement.preferredAreaIds, []);
  assert.equal(requirement.bathroomsMinimum, 1);
  assert.deepEqual(requirement.catalogPreferences, [
    { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
    { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 30 },
    { field: 'floorNumber', kind: 'number', comparison: 'exact', value: 2 },
    { field: 'hasKitchen', kind: 'feature', value: false },
    { field: 'hasHall', kind: 'feature', value: true },
  ]);
  assert.equal('bedroomsMinimum' in requirement, false);
  assert.equal(requirement.catalogPreferences?.some(item => item.field === 'bathroomCount'), false);
  assert.deepEqual(readStudioRequirement(requirement), values);
});

test('BEHAVIOR: Studio validation rejects noncanonical locations and invalid map links', () => {
  const values = {
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'not-an-area',
    price: '0',
    mapsLink: 'https://maps.example/private',
  };
  const validation = validateStudioForm(values);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some(error => error.field === 'locationAreaId' && error.code === 'invalid_area'));
  assert.ok(validation.errors.some(error => error.field === 'mapsLink' && error.code === 'invalid_location_link'));
});

test('BEHAVIOR: legacy Studio records are recognized without treating bedroomCount as open-room count', () => {
  const property = {
    core: { id: 'legacy', propertyType: 'apartment' as const, locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'legacy-offer',
      propertyCoreId: 'legacy',
      transaction: 'sale' as const,
      salePrice: { amount: 100, currencyCode: 'KWD' },
    },
    typeDetails: {
      propertyType: 'apartment' as const,
      apartmentSubtype: 'studio' as const,
      bedroomCount: 1,
      hasBalcony: true,
      hasElevator: true,
    },
  };
  assert.equal(isStudioProperty(property), true);
  const values = readStudioProperty(property);
  assert.equal(values.areaSquareMeters, '');
  assert.equal('amenities' in values, false);
  assert.equal(values.kitchen, 'unknown');
});

test('BEHAVIOR: Offered Studio sale and rent combinations build and read back', () => {
  const rentPeriods = ['daily', 'monthly', 'yearly'] as const;
  for (const transaction of ['sale', 'rent'] as const) {
    const periods = transaction === 'rent' ? rentPeriods : ['monthly'] as const;
    for (const rentalPeriodId of periods) {
      const values = {
        ...createStudioFormValues('offered', transaction),
        locationAreaId: 'salmiya',
        price: '250',
        rentalPeriodId,
        areaSquareMeters: '34',
        bathrooms: '1',
        floorNumber: '4',
        kitchen: 'yes' as const,
        hall: 'no' as const,
        parking: 'unknown' as const,
      };
      const property = buildStudioProperty(values, `studio-${transaction}-${rentalPeriodId}`, `offer-${transaction}-${rentalPeriodId}`);
      assert.equal(property.activeOffer.transaction, transaction);
      if (transaction === 'rent') {
        assert.equal(property.activeOffer.transaction === 'rent' ? property.activeOffer.rentalPeriodId : undefined, rentalPeriodId);
      } else {
        assert.equal('rentalPeriodId' in property.activeOffer, false);
      }
      assert.deepEqual(readStudioProperty(property), values);
      assert.equal('hasBalcony' in (property.typeDetails ?? {}), false);
      assert.equal('hasElevator' in (property.typeDetails ?? {}), false);
    }
  }
});

test('BEHAVIOR: Wanted Studio buy and rent combinations round-trip both area scopes and rental cadences', () => {
  const rentPeriods = ['daily', 'monthly', 'yearly'] as const;
  for (const transaction of ['sale', 'rent'] as const) {
    const periods = transaction === 'rent' ? rentPeriods : ['monthly'] as const;
    for (const preferredAreaMode of ['specific_areas', 'all_kuwait'] as const) {
      for (const rentalPeriodId of periods) {
        const values = {
          ...createStudioFormValues('wanted', transaction),
          preferredAreaMode,
          preferredAreaIds: preferredAreaMode === 'specific_areas' ? ['salmiya'] : [],
          budgetMinimum: '0',
          budgetMaximum: '0',
          rentalPeriodId,
          areaSquareMeters: '',
          bathrooms: '',
          floorNumber: '',
          kitchen: 'not_important' as const,
          hall: 'must_not_have' as const,
          parking: 'required' as const,
        };
        const requirement = buildStudioRequirement(
          values,
          '22222222-2222-4222-8222-222222222222',
          'seeker-studio-matrix',
        );
        assert.equal(requirement.id, '22222222-2222-4222-8222-222222222222');
        assert.equal(requirement.seekerId, 'seeker-studio-matrix');
        assert.equal(requirement.purpose, transaction === 'sale' ? 'buy' : 'rent');
        assert.equal(requirement.preferredAreaMode, preferredAreaMode);
        assert.deepEqual(
          requirement.preferredAreaIds,
          preferredAreaMode === 'specific_areas' ? ['salmiya'] : [],
        );
        if (transaction === 'rent') {
          assert.equal(requirement.purpose === 'rent' ? requirement.rentalPeriodId : undefined, rentalPeriodId);
        } else {
          assert.equal('rentalPeriodId' in requirement, false);
        }
        assert.deepEqual(readStudioRequirement(requirement), values);
      }
    }
  }
});

test('BEHAVIOR: blank optional physical inputs omit facts while zero and explicit false keep their meanings', () => {
  const base = {
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'salmiya',
    price: '1',
    areaSquareMeters: '',
    bathrooms: '0',
    floorNumber: '0',
    kitchen: 'no' as const,
    hall: 'unknown' as const,
    parking: 'no' as const,
  };
  assert.equal(validateStudioForm(base).ok, true);
  const property = buildStudioProperty(base, 'studio-zero-facts', 'offer-zero-facts');
  assert.deepEqual(property.typeDetails, {
    propertyType: 'apartment',
    apartmentSubtype: 'studio',
    studioRoomCount: 1,
    bathroomCount: 0,
    floorNumber: 0,
    hasKitchen: false,
    hasParking: false,
  });
  assert.deepEqual(readStudioProperty(property), base);

  assert.equal(validateStudioForm({ ...base, price: '0' }).ok, false, 'Offered price zero is invalid');
  assert.equal(validateStudioForm({ ...base, areaSquareMeters: '0' }).ok, false, 'A supplied zero area is invalid');
  assert.equal(validateStudioForm({ ...base, bathrooms: '' }).ok, true, 'Blank optional bathrooms stay omitted');
});

test('BEHAVIOR: wanted budgets and blank optional criteria distinguish valid zero from invalid ranges', () => {
  const base = {
    ...createStudioFormValues('wanted', 'sale'),
    preferredAreaMode: 'all_kuwait' as const,
    preferredAreaIds: [] as readonly string[],
    budgetMinimum: '0',
    budgetMaximum: '0',
  };
  assert.equal(validateStudioForm(base).ok, true, 'A zero-to-zero budget range is valid');
  const zeroBudget = buildStudioRequirement(base, '33333333-3333-4333-8333-333333333333', 'seeker-zero-budget');
  assert.deepEqual(zeroBudget.budget, { minimum: 0, maximum: 0, currencyCode: 'KWD' });
  assert.equal(readStudioRequirement(zeroBudget).areaSquareMeters, '');
  assert.equal(readStudioRequirement(zeroBudget).bathrooms, '');
  assert.equal(readStudioRequirement(zeroBudget).floorNumber, '');
  assert.equal('preferredAmenities' in zeroBudget, false);
  assert.equal('amenities' in readStudioRequirement(zeroBudget), false);
  assert.equal(validateStudioForm({ ...base, budgetMinimum: '', budgetMaximum: '0' }).ok, false);
  assert.equal(validateStudioForm({ ...base, budgetMinimum: '10', budgetMaximum: '9' }).ok, false);
  assert.equal(validateStudioForm({ ...base, areaSquareMeters: '0' }).ok, false);
});

test('BEHAVIOR: legacy Balcony and Elevator criteria are read invisibly and omitted from new saves', () => {
  const legacyRequirement = {
    id: '55555555-5555-4555-8555-555555555555',
    seekerId: 'seeker-legacy',
    propertyType: 'apartment' as const,
    purpose: 'buy' as const,
    preferredAreaIds: [],
    preferredAreaMode: 'all_kuwait' as const,
    budget: { minimum: 10, maximum: 20, currencyCode: 'KWD' },
    notes: '',
    preferredAmenities: ['balcony', 'elevator'] as const,
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'studio' }] as const,
  };
  assert.equal(isStudioRequirement(legacyRequirement), true);
  const values = readStudioRequirement(legacyRequirement);
  assert.equal('amenities' in values, false);

  const saved = buildStudioRequirement({
    ...values,
    description: 'Updated without unrelated amenities',
  }, legacyRequirement.id, legacyRequirement.seekerId);
  assert.equal('preferredAmenities' in saved, false);
});

test('BEHAVIOR: invalid canonical areas and Maps links produce field-specific validation codes', () => {
  const offered = {
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'not-a-canonical-area',
    price: '100',
    mapsLink: 'https://maps.example/private',
  };
  const offeredErrors = validateStudioForm(offered).errors;
  assert.ok(offeredErrors.some(error => error.field === 'locationAreaId' && error.code === 'invalid_area'));
  assert.ok(offeredErrors.some(error => error.field === 'mapsLink' && error.code === 'invalid_location_link'));

  const wanted = {
    ...createStudioFormValues('wanted', 'sale'),
    preferredAreaMode: 'specific_areas' as const,
    preferredAreaIds: ['not-a-canonical-area'],
    budgetMinimum: '100',
    budgetMaximum: '50',
  };
  const wantedErrors = validateStudioForm(wanted).errors;
  assert.ok(wantedErrors.some(error => error.field === 'preferredAreaIds' && error.code === 'invalid_area'));
  assert.ok(wantedErrors.some(error => error.field === 'budgetMinimum' && error.code === 'invalid_budget'));
});

test('STRUCTURAL: Studio builders persist exactly one Studio room without bedroom or duplicate native preferences', () => {
  const property = buildStudioProperty({
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'salmiya',
    price: '100',
    kitchen: 'no',
  }, 'studio-shape', 'offer-shape');
  assert.equal(property.typeDetails?.propertyType, 'apartment');
  assert.equal(property.typeDetails?.propertyType === 'apartment' ? property.typeDetails.apartmentSubtype : undefined, 'studio');
  assert.equal(property.typeDetails?.propertyType === 'apartment' ? property.typeDetails.studioRoomCount : undefined, 1);
  assert.equal(property.typeDetails?.propertyType === 'apartment' && 'bedroomCount' in property.typeDetails, false);

  const requirement = buildStudioRequirement({
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'specific_areas',
    preferredAreaIds: ['salmiya'],
    budgetMinimum: '10',
    budgetMaximum: '20',
    bathrooms: '1',
    areaSquareMeters: '25',
    floorNumber: '3',
    kitchen: 'required',
    hall: 'must_not_have',
  }, '44444444-4444-4444-8444-444444444444', 'seeker-shape');
  const preferences = requirement.catalogPreferences ?? [];
  assert.equal(new Set(preferences.map(preference => preference.field)).size, preferences.length);
  assert.equal(preferences.some(preference => preference.field === 'bathroomCount'), false);
  assert.equal('bedroomsMinimum' in requirement, false);
  assert.equal(requirement.bathroomsMinimum, 1);
  assert.deepEqual(preferences.find(preference => preference.field === 'apartmentSubtype'), {
    field: 'apartmentSubtype',
    kind: 'choice',
    value: 'studio',
  });
  assert.deepEqual(preferences.find(preference => preference.field === 'builtUpAreaSquareMeters'), {
    field: 'builtUpAreaSquareMeters',
    kind: 'number',
    comparison: 'minimum',
    value: 25,
  });
  assert.deepEqual(preferences.find(preference => preference.field === 'floorNumber'), {
    field: 'floorNumber',
    kind: 'number',
    comparison: 'exact',
    value: 3,
  });
});