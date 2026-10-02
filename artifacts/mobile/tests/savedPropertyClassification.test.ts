import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROPERTY_TYPES, type Property, type PropertyType } from '@workspace/property-domain';
import {
  assertPropertyDetailsEditClassification,
  assertSavedPropertyClassificationUnchanged,
  getSavedPropertyTypeLabel,
} from '../services/savedPropertyClassification.ts';
import { buildPropertyDetailsUpdateCandidate, createEditDraft } from '../services/propertyUpdateRecovery.ts';

function property(type: PropertyType, details: Record<string, unknown> = {}): Property {
  return {
    core: { id: 'classification-property', propertyType: type, locationArea: { id: 'salmiya' } },
    activeOffer: { id: 'classification-offer', propertyCoreId: 'classification-property', transaction: 'sale', salePrice: { amount: 70000, currencyCode: 'KWD' } },
    ...(Object.keys(details).length ? { typeDetails: { propertyType: type, ...details } } : {}),
  } as Property;
}

test('Every saved property type can enrich its details and reload without changing its classification or ID', () => {
  for (const type of PROPERTY_TYPES) {
    const baseline = property(type);
    const draft = createEditDraft(baseline);
    const candidate = buildPropertyDetailsUpdateCandidate(baseline, { ...draft.choices, description: 'Updated details only' });
    assert.equal(candidate.core.id, baseline.core.id);
    assert.equal(candidate.core.propertyType, type);
    assert.equal(createEditDraft(candidate).choices.propertyType, type);
    for (const differentType of PROPERTY_TYPES.filter(value => value !== type)) {
      assert.throws(() => buildPropertyDetailsUpdateCandidate(baseline, { ...draft.choices, propertyType: differentType }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
    }
  }
});

test('Duplex, Standard and Studio keep their saved subtype through details editing and reload', () => {
  for (const apartmentSubtype of ['duplex', 'standard_apartment', 'studio']) {
    const baseline = property('apartment', { apartmentSubtype });
    const draft = createEditDraft(baseline);
    const candidate = buildPropertyDetailsUpdateCandidate(baseline, { ...draft.choices, priceAmount: 75000 });
    assert.equal((candidate.typeDetails as unknown as Record<string, unknown>).apartmentSubtype, apartmentSubtype);
    assert.equal(createEditDraft(candidate).choices.canonicalDetails?.apartmentSubtype, apartmentSubtype);
    for (const other of ['duplex', 'standard_apartment', 'studio'].filter(value => value !== apartmentSubtype)) {
      const before = JSON.stringify(baseline);
      assert.throws(() => buildPropertyDetailsUpdateCandidate(baseline, {
        ...draft.choices, canonicalDetails: { ...draft.choices.canonicalDetails, apartmentSubtype: other },
      }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
      assert.equal(JSON.stringify(baseline), before);
    }
  }
});

test('Residential and Commercial Floor use is immutable while other details remain editable', () => {
  for (const floorUse of ['residential', 'commercial']) {
    const baseline = property('floor', { floorUse });
    const draft = createEditDraft(baseline);
    const candidate = buildPropertyDetailsUpdateCandidate(baseline, { ...draft.choices, description: 'Floor details', priceAmount: 75000 });
    assert.equal((candidate.typeDetails as unknown as Record<string, unknown>).floorUse, floorUse);
    assert.throws(() => buildPropertyDetailsUpdateCandidate(baseline, {
      ...draft.choices, canonicalDetails: { ...draft.choices.canonicalDetails, floorUse: floorUse === 'residential' ? 'commercial' : 'residential' },
    }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
  }
});

test('Pending classification-changing candidates and stale edit drafts are rejected without mutating stored data', () => {
  const baseline = property('apartment', { apartmentSubtype: 'duplex' });
  const before = JSON.stringify(baseline);
  const changed = property('apartment', { apartmentSubtype: 'studio' });
  assert.throws(() => assertSavedPropertyClassificationUnchanged(baseline, changed), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
  assert.throws(() => assertPropertyDetailsEditClassification(baseline, {
    propertyType: 'apartment', canonicalDetails: { apartmentSubtype: 'studio' },
  }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
  assert.equal(JSON.stringify(baseline), before);
});

test('Legacy missing classifications remain unspecified and curated categories are not rewritten', () => {
  const legacy = property('floor');
  const draft = createEditDraft(legacy);
  const candidate = buildPropertyDetailsUpdateCandidate(legacy, { ...draft.choices, description: 'Legacy details' });
  assert.equal((candidate.typeDetails as unknown as Record<string, unknown> | undefined)?.floorUse, undefined);
  assert.throws(() => buildPropertyDetailsUpdateCandidate(legacy, { ...draft.choices, canonicalDetails: { floorUse: 'commercial' } }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
  const duplex = { ...property('apartment'), demoCapture: { categoryId: 'duplex' } } as Property;
  assert.equal(getSavedPropertyTypeLabel(duplex, 'ar', 'شقة'), 'دوبلكس');
  assertPropertyDetailsEditClassification(duplex, { propertyType: 'apartment', demoMetadata: { categoryId: 'duplex' } });
  assert.throws(() => assertPropertyDetailsEditClassification(duplex, { propertyType: 'apartment', demoMetadata: { categoryId: 'studio_apartment' } }), /SAVED_PROPERTY_CLASSIFICATION_LOCKED/);
});

test('Saved classification labels use the public subtype and Floor use in Arabic and English', () => {
  assert.equal(getSavedPropertyTypeLabel(property('apartment', { apartmentSubtype: 'duplex' }), 'ar', 'شقة'), 'دوبلكس');
  assert.equal(getSavedPropertyTypeLabel(property('apartment', { apartmentSubtype: 'studio' }), 'en', 'Apartment'), 'Studio');
  assert.equal(getSavedPropertyTypeLabel(property('apartment', { apartmentSubtype: 'standard_apartment' }), 'ar', 'شقة'), 'شقة عادية');
  assert.equal(getSavedPropertyTypeLabel(property('floor', { floorUse: 'commercial' }), 'ar', 'دور'), 'دور تجاري');
  assert.equal(getSavedPropertyTypeLabel(property('floor', { floorUse: 'residential' }), 'en', 'Floor'), 'Residential floor');
  assert.equal(getSavedPropertyTypeLabel(property('villa'), 'ar', 'فيلا'), 'فيلا');
  assert.equal(getSavedPropertyTypeLabel(property('warehouse'), 'en', 'Warehouse'), 'Warehouse');
});

test('Saved details screen hides every classification chooser and uses the guarded candidate path', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.doesNotMatch(source, /edit-type-/);
  assert.doesNotMatch(source, /selectPropertyType/);
  assert.match(source, /propertyType=\{property\.core\.propertyType\}/);
  assert.match(source, /hideApartmentSubtype\s+hideFloorUse/);
  assert.match(source, /buildPropertyDetailsUpdateCandidate\(currentDraft.baseline, currentDraft.choices\)/);
  assert.match(source, /assertSavedPropertyClassificationUnchanged\(pending.baseline, pending.candidate\)/);
  assert.match(source, /assertSavedPropertyClassificationUnchanged\(pendingOperation.baseline, pendingOperation.candidate\)/);
  assert.match(source, /property-fixed-type/);
});
