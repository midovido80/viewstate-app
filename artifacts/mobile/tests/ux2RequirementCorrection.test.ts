import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRequirementPresentationFields } from '@/services/requirementFieldMap';
import { buildPersonRequirement, formValuesFromRequirement } from '@/services/personRequirementWorkflow';

test('Requirement correction has one canonical owner for duplicated meanings', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const map = await readFile('services/requirementFieldMap.ts', 'utf8');
  assert.match(source, /preferredAreaMode/);
  assert.match(source, /requirement-all-kuwait/);
  assert.match(source, /requirement-master-bedrooms/);
  assert.match(source, /localizedRequirementIssue/);
  assert.match(source, /getAreaById/);
  assert.match(source, /preferredAmenityExclusions/);
  assert.match(source, /Must not have/);
  assert.match(source, /Not important/);
  assert.match(source, /onExcludedChange/);
  assert.match(map, /'bedroomCount'/);
  assert.match(map, /'bathroomCount'/);
  assert.match(map, /'hasCentralAC'/);
  assert.match(map, /isRequirementCatalogFieldAllowed/);
});

test('Requirement catalog booleans never fall through to free text', async () => {
  const source = await readFile('components/RequirementCatalogPreferences.tsx', 'utf8');
  assert.match(source, /field\.startsWith\('has'\)/);
  assert.match(source, /kind: 'feature'/);
  assert.match(source, /Free-text catalog values/);
});

test('Commercial Floor gates residential controls and exposes typed commercial choices', async () => {
  const [source, map] = await Promise.all([
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('services/requirementFieldMap.ts', 'utf8'),
  ]);
  assert.match(source, /coreApplicable &&/);
  assert.match(source, /requirement-driver-room/);
  assert.match(source, /floorUse === 'residential'/);
  assert.match(source, /applicableCoreFields\.has\('parkingSpaceCount'\)/);
  assert.match(source, /applicableCoreFields\.has\('floorNumber'\)/);
  assert.match(source, /applicableCoreFields\.has\('builtUpAreaSquareMeters'\)/);
  assert.match(source, /coreReviewLines/);
  assert.match(source, /showAmenities=\{coreApplicable\}/);
  assert.match(source, /Floor use/);
  assert.match(source, /localizedPreferenceName/);
  assert.match(source, /step === 1 && propertyType === 'floor' && !floorUse/);
  assert.match(source, /Choose Floor use: Residential or Commercial/);
  assert.match(map, /'intendedUse'/);
  assert.match(map, /'commercialActivity'/);
});

test('Apartment choices lead every applicable specification group without entering amenities', () => {
  for (const purpose of ['rent', 'buy'] as const) {
    const fields = getRequirementPresentationFields('apartment');
    assert.deepEqual(fields.leading, ['apartmentSubtype', 'furnishing'], purpose);
    assert.equal(fields.specifications.includes('apartmentSubtype'), false);
    assert.equal(fields.amenities.includes('furnishing'), false);
    assert.equal(fields.amenities.includes('hasCentralAC'), false);
  }
  assert.deepEqual(getRequirementPresentationFields('floor', 'residential').leading, ['furnishing']);
  assert.deepEqual(getRequirementPresentationFields('floor', 'commercial').leading, []);
  assert.deepEqual(getRequirementPresentationFields('office').leading, []);
  assert.deepEqual(getRequirementPresentationFields('villa').leading, ['furnishing']);
  assert.ok(getRequirementPresentationFields('villa').amenities.includes('hasPool'));
  assert.ok(getRequirementPresentationFields('warehouse').amenities.includes('hasColdStorage'));
});

test('one canonical Central A/C, three-value Occupancy, and apartment choices survive edit', () => {
  for (const purpose of ['rent', 'buy'] as const) {
    const result = buildPersonRequirement('11111111-1111-4111-8111-111111111111', 'seeker', {
      purpose, propertyType: 'apartment', preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas',
      minimumBudget: 300, maximumBudget: 600, currencyCode: 'KWD', notes: '',
      centralAC: true,
      ...(purpose === 'rent' ? { occupancy: 'family' as const } : {}),
      catalogPreferences: [
        { field: 'apartmentSubtype', kind: 'choice', value: 'duplex' },
        { field: 'furnishing', kind: 'choice', value: 'furnished' },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const restored = formValuesFromRequirement(result.value);
    assert.equal(restored.centralAC, true);
    assert.equal(restored.catalogPreferences?.filter(item => item.field === 'hasCentralAC').length ?? 0, 0);
    assert.deepEqual(restored.catalogPreferences?.map(item => item.field), ['apartmentSubtype', 'furnishing']);
    assert.equal(restored.occupancy, purpose === 'rent' ? 'family' : undefined);
    const edit = buildPersonRequirement(result.value.id, result.value.seekerId, { ...restored, notes: 'updated' });
    assert.equal(edit.ok, true);
    if (edit.ok) assert.equal(edit.value.id, result.value.id);
  }
  for (const occupancy of ['family', 'bachelor', 'any'] as const) {
    const result = buildPersonRequirement('11111111-1111-4111-8111-111111111111', 'seeker', {
      purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas',
      minimumBudget: 300, maximumBudget: 600, currencyCode: 'KWD', notes: '', occupancy,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(formValuesFromRequirement(result.value).occupancy, occupancy);
      assert.equal(result.value.catalogPreferences?.some(item => String(item.field) === 'occupancy') ?? false, false);
    }
  }
  const excludedAC = buildPersonRequirement('11111111-1111-4111-8111-111111111111', 'seeker', {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas',
    minimumBudget: 300, maximumBudget: 600, currencyCode: 'KWD', notes: '', centralAC: false,
  });
  assert.equal(excludedAC.ok, true);
  if (excludedAC.ok) {
    const restored = formValuesFromRequirement(excludedAC.value);
    assert.equal(restored.centralAC, false);
    const edit = buildPersonRequirement(excludedAC.value.id, excludedAC.value.seekerId, restored);
    assert.equal(edit.ok && edit.value.centralAC, false);
  }
});

test('Requirement form renders the approved labels and one grouped amenity section', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const component = await readFile('components/RequirementCatalogPreferences.tsx', 'utf8');
  assert.match(source, /label\('Hall', 'صالة'\)/);
  assert.match(source, /label\('Parking', 'موقف'\)/);
  assert.match(source, /label\('Floor', 'الطابق'\)/);
  assert.equal((source.match(/testID="requirement-central-ac"/g) ?? []).length, 1);
  assert.match(source, /centralACPreference !== undefined \? \{ centralAC: centralACPreference \}/);
  assert.match(source, /setCentralACPreference\(form\.centralAC\)/);
  assert.match(source, /RENT_SERVICES\.filter\(service => service !== 'swimmingPool' \|\| !poolCatalogApplies\)/);
  assert.match(source, /amenityCatalogFields\.filter\(field => field !== 'hasPool'\)/);
  assert.match(source, /new Set\(\[\.\.\.amenities/);
  assert.equal((source.match(/<Text style=\{styles\.heading\}>\{label\('Preferred amenities', 'المزايا المفضلة'\)\}/g) ?? []).length, 1);
  assert.ok(source.indexOf('fields={leadingFields}') < source.indexOf('testID="requirement-bedrooms-quick-pick"'));
  assert.ok(source.indexOf('testID="requirement-required-area"') < source.indexOf('fields={otherSpecificationFields}'));
  assert.ok(source.indexOf('fields={otherSpecificationFields}') < source.indexOf('testID="requirement-central-ac"'));
  assert.match(source, /purpose === 'rent' && coreApplicable &&/);
  assert.match(component, /if \(isBoolean\)[\s\S]*?return <ChoiceChip/);
});