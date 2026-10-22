import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProperty, type Property, type PropertyType } from '@workspace/property-domain';
import { getApplicablePropertyFormFields, getApplicablePropertyFormFieldsForMode } from '@/services/propertyFormCatalog';
import { buildPropertyWithCaptureDetails } from '@/services/propertyCaptureDetails';
import { buildPropertyDetailsUpdateCandidate, createEditDraft } from '@/services/propertyUpdateRecovery';
import { buildStudioProperty, createStudioFormValues, readStudioProperty } from '@/services/studioFormModel';
import { prepareStudioPropertyEditCandidate } from '@/services/studioSave';
import { formatPropertyDetailValue } from '@/services/propertyDetailPresentation';

function basic(propertyType: PropertyType): Property {
  return {
    core: { id: '11111111-1111-4111-8111-111111111111', propertyType, locationArea: { id: 'salmiya' } },
    activeOffer: { id: '22222222-2222-4222-8222-222222222222', propertyCoreId: '11111111-1111-4111-8111-111111111111', transaction: 'rent', rentalPrice: { amount: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' },
  };
}
const residential: readonly PropertyType[] = ['whole_building', 'apartment', 'floor', 'house', 'villa', 'chalet', 'other_built_property'];

test('Residential actual facts save, reload, edit and clear on every residential type', () => {
  for (const type of residential) {
    const scope = type === 'floor' ? { floorUse: 'residential' }
      : type === 'other_built_property' ? { propertyUse: 'residential', clarification: 'Residential annex' }
        : type === 'apartment' ? { apartmentSubtype: 'standard_apartment' } : {};
    const candidate = buildPropertyWithCaptureDetails(basic(type), { ...scope, bedroomCount: '3', masterBedroomCount: '2', occupancy: 'family' });
    assert.equal(validateProperty(candidate).ok, true, type);
    const restored: Property = JSON.parse(JSON.stringify(candidate));
    const draft = createEditDraft(restored);
    assert.equal(draft.choices.canonicalDetails?.masterBedroomCount, '2', type);
    assert.equal(draft.choices.canonicalDetails?.occupancy, 'family', type);
    const changed = buildPropertyDetailsUpdateCandidate(restored, {
      ...draft.choices, canonicalDetails: { ...draft.choices.canonicalDetails, masterBedroomCount: '1', occupancy: 'bachelor' },
    });
    assert.equal((changed.typeDetails as unknown as Record<string, unknown>).occupancy, 'bachelor', type);
    const cleared = buildPropertyDetailsUpdateCandidate(changed, {
      ...createEditDraft(changed).choices,
      canonicalDetails: { ...createEditDraft(changed).choices.canonicalDetails, masterBedroomCount: '', occupancy: '' },
    });
    assert.equal((cleared.typeDetails as unknown as Record<string, unknown>).masterBedroomCount, undefined, type);
    assert.equal((cleared.typeDetails as unknown as Record<string, unknown>).occupancy, undefined, type);
  }
});

test('Commercial forms and unclassified Other cannot collect residential facts', () => {
  for (const type of ['commercial_complex', 'office', 'shop', 'warehouse', 'floor', 'other_built_property'] as const) {
    const fields = getApplicablePropertyFormFields(type, 'commercial', undefined, 'commercial').map(item => item.field);
    assert.equal(fields.includes('occupancy'), false, type);
    assert.equal(fields.includes('masterBedroomCount'), false, type);
    const details = { propertyType: type, floorUse: type === 'floor' ? 'commercial' : undefined,
      ...(type === 'other_built_property' ? { propertyUse: 'commercial', clarification: { value: 'Other shop', privacy: { classification: 'normal', disclosurePolicy: 'normal' } } } : {}),
      occupancy: 'family', masterBedroomCount: 1 };
    assert.equal(validateProperty({ ...basic(type), typeDetails: details as unknown as Property['typeDetails'] }).ok, false, type);
  }
  assert.equal(getApplicablePropertyFormFields('other_built_property').some(item => item.field === 'occupancy'), false);
});

test('Studio supports every occupancy value and clearing it, without master bedrooms', () => {
  for (const occupancy of ['family', 'bachelor', 'any'] as const) {
    const values = { ...createStudioFormValues('offered', 'rent'), locationAreaId: 'salmiya', price: '400', occupancy };
    const property = buildStudioProperty(values, basic('apartment').core.id, basic('apartment').activeOffer.id);
    const restored: Property = JSON.parse(JSON.stringify(property));
    assert.equal(readStudioProperty(restored).occupancy, occupancy);
    assert.equal(getApplicablePropertyFormFields('apartment', undefined, 'studio').some(item => item.field === 'masterBedroomCount'), false);
    assert.equal(validateProperty({ ...restored, typeDetails: { ...restored.typeDetails, masterBedroomCount: 1 } as unknown as Property['typeDetails'] }).ok, false);
    const cleared = prepareStudioPropertyEditCandidate(restored, buildStudioProperty({ ...values, occupancy: undefined }, property.core.id, property.activeOffer.id));
    assert.equal((cleared.typeDetails as unknown as Record<string, unknown>).occupancy, undefined);
  }
});

test('Duplex uses the same residential facts without changing its stored subtype', () => {
  const property = buildPropertyWithCaptureDetails(basic('apartment'), { apartmentSubtype: 'duplex', bedroomCount: '4', masterBedroomCount: '2', occupancy: 'any' });
  assert.equal(property.typeDetails?.propertyType === 'apartment' ? property.typeDetails.apartmentSubtype : undefined, 'duplex');
  assert.equal(validateProperty(property).ok, true);
});

test('Master bedrooms are whole nonnegative actual counts within total bedrooms', () => {
  for (const count of ['-1', '1.5', '4', 'NaN']) {
    assert.throws(() => buildPropertyWithCaptureDetails(basic('villa'), { bedroomCount: '3', masterBedroomCount: count }));
  }
  assert.equal(validateProperty(buildPropertyWithCaptureDetails(basic('villa'), { bedroomCount: '3', masterBedroomCount: '0' })).ok, true);
  assert.throws(() => buildPropertyWithCaptureDetails(basic('villa'), { occupancy: 'vacant' }));
});

test('Existing BASIC properties remain valid with both facts unknown', () => {
  for (const type of residential) {
    assert.equal(validateProperty(basic(type)).ok, true);
    const draft = createEditDraft(basic(type));
    assert.equal(draft.choices.canonicalDetails?.occupancy, undefined);
    assert.equal(draft.choices.canonicalDetails?.masterBedroomCount, undefined);
  }
});

test('Residential Other use stays locked after saving', () => {
  const property = buildPropertyWithCaptureDetails(basic('other_built_property'), { propertyUse: 'residential', clarification: 'Annex', occupancy: 'family' });
  const draft = createEditDraft(property);
  assert.throws(() => buildPropertyDetailsUpdateCandidate(property, { ...draft.choices, canonicalDetails: { ...draft.choices.canonicalDetails, propertyUse: 'commercial' } }), /CLASSIFICATION_LOCKED/);
});

test('New Offered fields do not duplicate native Wanted fields and localize correctly', () => {
  for (const type of residential) {
    const wanted = getApplicablePropertyFormFieldsForMode('wanted', type, 'residential', 'standard_apartment').map(item => item.field);
    assert.equal(wanted.includes('occupancy'), false);
    assert.equal(wanted.includes('masterBedroomCount'), false);
  }
  assert.equal(formatPropertyDetailValue('occupancy', 'family', 'ar'), 'عائلات');
  assert.equal(formatPropertyDetailValue('occupancy', 'bachelor', 'en'), 'Bachelor');
});

test('Legacy villa master counts hydrate into the canonical editor without being dropped', () => {
  const legacy: Property = { ...basic('villa'), typeDetails: { propertyType: 'villa', bedroomCount: 4 },
    demoCapture: { categoryId: 'villa', numericValues: { masterBedroomCount: 2 } } };
  const draft = createEditDraft(legacy);
  assert.equal(draft.choices.canonicalDetails?.masterBedroomCount, '2');
  const candidate = buildPropertyDetailsUpdateCandidate(legacy, draft.choices);
  assert.equal((candidate.typeDetails as unknown as Record<string, unknown>).masterBedroomCount, 2);
  assert.equal(candidate.demoCapture?.numericValues?.masterBedroomCount, undefined);
});
