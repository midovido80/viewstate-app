import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyCompletionFields, requirementCompletionFields, missingCompletionFields } from '../services/requiredMatchingFields';
import { buildPersonRequirement, formValuesFromRequirement } from '../services/personRequirementWorkflow';
import { buildStudioRequirement, readStudioRequirement, createStudioFormValues, validateStudioForm } from '../services/studioFormModel';
import { normalizeSeekerRequirement, evaluateMatch, matchingRefinementFields, type Property } from '@workspace/property-domain';
const missing = (type: string, values: Record<string, unknown> = {}, overrides = {}) => missingCompletionFields(propertyCompletionFields({ type, area: 'salmiya', price: 500, size: 100, values, ...overrides }));
test('Residential completion uses rooms/bathrooms, with correct Studio, Floor and Other exceptions', () => {
  for (const type of ['apartment', 'villa', 'house', 'chalet']) {
    assert.deepEqual(missing(type), ['bedroomCount', 'bathroomCount']);
    assert.deepEqual(missing(type, { bedroomCount: '٣', bathroomCount: '۲' }), []);
  }
  assert.deepEqual(missing('floor', { floorUse: 'residential' }), ['bedroomCount', 'bathroomCount']);
  assert.deepEqual(missing('floor', { floorUse: 'commercial' }), []);
  assert.deepEqual(missing('apartment', { apartmentSubtype: 'studio', bathroomCount: '1' }), []);
  assert.deepEqual(missing('other_built_property'), ['propertyUse']);
  assert.deepEqual(missing('other_built_property', { propertyUse: 'residential' }), ['bedroomCount', 'bathroomCount']);
});
test('Commercial area, price and location are required; Maps/media remain optional and basic capture stays light', () => {
  for (const type of ['office', 'shop', 'warehouse', 'commercial_complex']) {
    assert.deepEqual(missing(type, {}, { size: undefined }), ['areaSquareMeters']);
    assert.deepEqual(missing(type, {}, { area: '', price: 0, size: 0 }), ['locationAreaId', 'price', 'areaSquareMeters']);
  }
  assert.deepEqual(missing('house', {}, { basic: true }), []);
  assert.deepEqual(missing('house', {}, { basic: true, price: 0 }), ['price']);
});
test('Whole buildings require apartments and conditional layouts rather than bedrooms for the entire building', () => {
  assert.deepEqual(missing('whole_building'), ['apartmentCount', 'sameApartmentLayout']);
  assert.deepEqual(missing('whole_building', { apartmentCount: 20, sameApartmentLayout: 'true' }), ['roomsPerUnit', 'bathroomsPerUnit']);
  assert.deepEqual(missing('whole_building', { apartmentCount: 20, sameApartmentLayout: 'true', roomsPerUnit: 2, bathroomsPerUnit: 1 }), []);
  assert.deepEqual(missing('whole_building', { apartmentCount: 20, sameApartmentLayout: 'false', apartmentLayouts: 'bad' }), ['apartmentLayouts']);
  assert.deepEqual(missing('whole_building', { apartmentCount: 20, sameApartmentLayout: false, apartmentLayouts: '[{"apartmentCount":20,"bedrooms":2,"bathrooms":1}]' }), []);
});
test('Requirement completion distinguishes forgotten input from deliberately unspecified constraints', () => {
  const base = { type: 'apartment', areas: [], bedrooms: '', bathrooms: '', size: '', minimum: '', maximum: '', unspecified: [] };
  assert.deepEqual(missingCompletionFields(requirementCompletionFields(base)), ['areas', 'bedrooms', 'bathrooms', 'budget']);
  assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...base, areaMode: 'all_kuwait', unspecified: ['bedrooms', 'bathrooms', 'budget'] })), []);
  assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...base, type: 'warehouse', areaMode: 'specific_areas', areas: ['salmiya'], maximum: '500' })), ['area']);
});
const ID = '11111111-1111-4111-8111-111111111111';
test('Explicit choices and open/one-sided budgets round-trip the canonical contract without fabricated match points', () => {
  const form = { purpose: 'rent' as const, propertyType: 'apartment' as const, preferredAreaIds: ['salmiya'], currencyCode: 'KWD', notes: '' };
  const result = buildPersonRequirement(ID, 'person', { ...form, unspecifiedFields: ['budget', 'bedrooms', 'bathrooms'] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const hydrated = normalizeSeekerRequirement(JSON.parse(JSON.stringify(result.value)));
  assert.equal(hydrated.ok, true);
  if (!hydrated.ok) return;
  assert.deepEqual(formValuesFromRequirement(hydrated.value).unspecifiedFields, ['budget', 'bedrooms', 'bathrooms']);
  assert.equal(hydrated.value.budget.maximum, undefined);
  assert.equal(matchingRefinementFields(hydrated.value).includes('budget'), false);
  assert.equal(buildPersonRequirement(ID, 'person', form).ok, false);
  assert.equal(buildPersonRequirement(ID, 'person', { ...form, maximumBudget: 500 }).ok, true);
  assert.equal(buildPersonRequirement(ID, 'person', { ...form, minimumBudget: 400 }).ok, true);
  assert.equal(buildPersonRequirement(ID, 'person', { ...form, maximumBudget: 500, unspecifiedFields: ['budget'] }).ok, false);
  const property: Property = { core: { id: 'p', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: 'o', propertyCoreId: 'p', transaction: 'rent', rentalPrice: { amount: 2000, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }, typeDetails: { propertyType: 'apartment' } };
  assert.equal(evaluateMatch(hydrated.value, { property }).explanations.some(row => row.criterion === 'budget'), false);
});
test('Studio explicit open and one-sided budgets save/reload; blank and zero budgets fail completion', () => {
  const base = { ...createStudioFormValues('wanted', 'rent'), preferredAreaMode: 'all_kuwait' as const };
  assert.equal(validateStudioForm(base).ok, false);
  for (const values of [{ ...base, budgetOpen: true }, { ...base, budgetMaximum: '500' }, { ...base, budgetMinimum: '400' }]) {
    assert.equal(validateStudioForm(values).ok, true);
    const normalized = normalizeSeekerRequirement(JSON.parse(JSON.stringify(buildStudioRequirement(values, ID, undefined))));
    assert.equal(normalized.ok, true);
    if (normalized.ok) assert.deepEqual(readStudioRequirement(normalized.value), values);
  }
  assert.equal(validateStudioForm({ ...base, budgetMinimum: '0', budgetMaximum: '0' }).ok, false);
});
test('Other requirements retain their sector through normalization and cannot match the opposite use', () => {
  const form = { purpose: 'rent' as const, propertyType: 'other_built_property' as const, propertyUse: 'residential' as const, preferredAreaIds: ['salmiya'], maximumBudget: 500, currencyCode: 'KWD', notes: '', bedroomsMinimum: 2, bathroomsMinimum: 1 };
  const request = buildPersonRequirement(ID, undefined, form);
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const normalized = normalizeSeekerRequirement(JSON.parse(JSON.stringify(request.value)));
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  assert.equal(formValuesFromRequirement(normalized.value).propertyUse, 'residential');
  const property: Property = { core: { id: 'p', propertyType: 'other_built_property', locationArea: { id: 'salmiya' } }, activeOffer: { id: 'o', propertyCoreId: 'p', transaction: 'rent', rentalPrice: { amount: 490, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }, typeDetails: { propertyType: 'other_built_property', propertyUse: 'commercial', clarification: { value: 'Other', privacy: { classification: 'normal', disclosurePolicy: 'normal' } } } };
  assert.equal(evaluateMatch(normalized.value, { property }).category, 'excluded');
});
test('Conditional apartment layouts identify the first missing input inside the actual row', () => {
  assert.deepEqual(missing('whole_building', { apartmentCount: 20, sameApartmentLayout: false, apartmentLayouts: '[{"apartmentCount":20,"bedrooms":2}]' }), ['apartmentLayouts.0.bathrooms']);
});
test('Malformed/reversed budget ranges remain field errors and Arabic digits are accepted', () => {
  const base = { type: 'office', areaMode: 'all_kuwait', areas: [], bedrooms: '', bathrooms: '', size: '100', minimum: '', maximum: '500', unspecified: [] };
  for (const [minimum, maximum] of [['900', '500'], ['abc', '500'], ['0', '0'], ['', ''], ['-1', '500']]) {
    assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...base, minimum, maximum })), ['budget']);
  }
  assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...base, minimum: '٠', maximum: '۵۰۰' })), []);
});
