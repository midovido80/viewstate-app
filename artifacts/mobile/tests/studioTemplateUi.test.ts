import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioProperty,
  buildStudioRequirement,
  createStudioFormValues,
  getStudioBathroomConfirmationCase,
  readStudioProperty,
  validateStudioForm,
} from '@/services/studioFormModel';
import {
  getStudioCatalogChoiceLabel,
  getStudioCatalogField,
  getStudioCatalogFieldLabel,
  isStudioCatalogFieldApplicable,
  STUDIO_FORM_CATALOG,
  STUDIO_FORM_FIELD_ORDER,
} from '@/services/studioCatalog';

test('BEHAVIOR: shared Studio catalog supplies both mode-specific sequences and bilingual labels', () => {
  assert.deepEqual(STUDIO_FORM_FIELD_ORDER.offered, [
    'transaction', 'locationAreaId', 'mapsLink', 'price', 'rentalPeriodId',
    'areaSquareMeters', 'studioRoomCount', 'bathrooms', 'kitchen', 'hall',
    'parking', 'floorNumber', 'description',
  ]);
  assert.deepEqual(STUDIO_FORM_FIELD_ORDER.wanted, [
    'locationAreaId', 'transaction', 'budgetMinimum', 'budgetMaximum',
    'rentalPeriodId', 'areaSquareMeters', 'studioRoomCount', 'bathrooms',
    'kitchen', 'hall', 'parking', 'floorNumber', 'description',
  ]);
  assert.equal(getStudioCatalogFieldLabel('locationAreaId', 'wanted')[0], 'Preferred area');
  assert.equal(getStudioCatalogFieldLabel('locationAreaId', 'wanted')[1], 'المنطقة المفضلة');
  assert.equal(getStudioCatalogField('studioRoomCount').fixedValue, '1');
  assert.equal(getStudioCatalogField('bathrooms').fixedValue, '1');
  assert.equal(isStudioCatalogFieldApplicable('rentalPeriodId', 'offered', 'sale'), false);
  assert.equal(isStudioCatalogFieldApplicable('rentalPeriodId', 'wanted', 'rent'), true);
  assert.ok(STUDIO_FORM_CATALOG.every(field =>
    field.label.length === 2 && field.modes.length > 0));

  const transactionChoices = getStudioCatalogField('transaction').quickPicks!;
  assert.deepEqual(getStudioCatalogChoiceLabel(transactionChoices[1], 'offered'), ['Sale', 'للبيع']);
  assert.deepEqual(getStudioCatalogChoiceLabel(transactionChoices[1], 'wanted'), ['Buy', 'للشراء']);
});

test('BEHAVIOR: only two visible binary choices preserve untouched Offered and Wanted semantics', () => {
  for (const field of ['kitchen', 'hall', 'parking'] as const) {
    const definition = getStudioCatalogField(field);
    assert.equal(definition.quickPicks?.length, 2);
    assert.deepEqual(definition.quickPicks?.map(choice => choice.modeValues.offered), ['yes', 'no']);
    assert.deepEqual(
      definition.quickPicks?.map(choice => choice.modeValues.wanted),
      ['required', 'must_not_have'],
    );
    assert.equal(definition.untouchedValues?.offered, 'unknown');
    assert.equal(definition.untouchedValues?.wanted, 'not_important');
  }

  const offered = {
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'salmiya',
    price: '100',
  };
  const property = buildStudioProperty(offered, 'studio-ui-offer', 'studio-ui-active-offer');
  assert.equal(property.typeDetails?.propertyType === 'apartment' ? property.typeDetails.hasKitchen : true, undefined);
  assert.equal(readStudioProperty(property).kitchen, 'unknown');

  const wanted = {
    ...createStudioFormValues('wanted', 'sale'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '0',
    budgetMaximum: '500',
  };
  assert.equal(validateStudioForm(wanted).ok, true);
  const requirement = buildStudioRequirement(
    wanted,
    '44444444-4444-4444-8444-444444444444',
    'eligible-seeker',
  );
  assert.equal(requirement.catalogPreferences?.some(preference =>
    preference.field === 'hasKitchen' || preference.field === 'hasHall' || preference.field === 'hasParking'), false);
});

test('BEHAVIOR: legacy bathroom values require explicit confirmation only when replacing them', () => {
  const missingBathroomProperty = {
    core: { id: 'legacy-studio-ui', propertyType: 'apartment' as const, locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'legacy-studio-ui-offer',
      propertyCoreId: 'legacy-studio-ui',
      transaction: 'sale' as const,
      salePrice: { amount: 100, currencyCode: 'KWD' },
    },
    typeDetails: { propertyType: 'apartment' as const, apartmentSubtype: 'studio' as const },
  };
  const legacyValues = readStudioProperty(missingBathroomProperty);
  assert.equal(getStudioBathroomConfirmationCase(legacyValues), 'missing');
  const unchanged = buildStudioProperty(
    { ...legacyValues, description: 'Keep legacy bathroom unset' },
    missingBathroomProperty.core.id,
    missingBathroomProperty.activeOffer.id,
  );
  assert.equal(unchanged.typeDetails?.propertyType === 'apartment' ? unchanged.typeDetails.bathroomCount : 1, undefined);

  const replacement = { ...legacyValues, bathrooms: '1' };
  assert.ok(validateStudioForm(replacement).errors.some(error => error.field === 'bathrooms'));
  const confirmed = { ...replacement, legacyBathroomConfirmed: true };
  assert.equal(validateStudioForm(confirmed).ok, true);
  const replaced = buildStudioProperty(
    confirmed,
    missingBathroomProperty.core.id,
    missingBathroomProperty.activeOffer.id,
  );
  assert.equal(replaced.typeDetails?.propertyType === 'apartment' ? replaced.typeDetails.bathroomCount : undefined, 1);
});