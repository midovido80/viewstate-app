import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSeekerRequirement, validateProperty, validateSeekerRequirement } from '@workspace/property-domain';
import { buildStudioProperty, buildStudioRequirement, createStudioFormValues, readStudioProperty, readStudioRequirement } from '../services/studioFormModel.ts';
import { STUDIO_FEATURES } from '../services/studioAmenities.ts';
import { DEMO_NEARBY_SERVICES } from '../services/propertyDemoCatalog.ts';
import { getRequirementDetailsRows } from '../services/requirementDetailsPresentation.ts';
import { buildPersonRequirement, formValuesFromRequirement } from '../services/personRequirementWorkflow.ts';
import { getOfferedStudioDetailValues } from '../services/propertyDetailPresentation.ts';
import { resolveSourcePath } from './sourcePath.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const offered = () => ({ ...createStudioFormValues('offered', 'rent'), locationAreaId: 'salmiya', price: '450' });
const wanted = (transaction: 'sale' | 'rent') => ({ ...createStudioFormValues('wanted', transaction), preferredAreaMode: 'all_kuwait' as const, budgetMinimum: '450', budgetMaximum: '500' });

test('Studio offered amenities and nearby services survive canonical save/read for sale and rent', () => {
  for (const transaction of ['sale', 'rent'] as const) {
    const values = { ...offered(), transaction, amenitySelections: Object.fromEntries(STUDIO_FEATURES.map(item => [item.field, 'yes' as const])), nearbyServices: ['mosque', 'laundry', 'beach'] };
    const property = buildStudioProperty(values, 'studio-amenities', 'offer-amenities');
    assert.equal(validateProperty(property).ok, true);
    assert.deepEqual(readStudioProperty(property), values);
    const visible = getOfferedStudioDetailValues(property.typeDetails as unknown as Record<string, unknown>);
    for (const item of STUDIO_FEATURES) assert.equal(visible[item.field], true, item.field);
    assert.equal('hasPool' in visible, false, 'shared pool does not become a private pool');
    assert.equal('hasWaterfront' in visible, false, 'sea view does not become waterfront access');
  }
});

test('Studio wanted amenities use canonical native and catalog owners for buy and rent', () => {
  for (const transaction of ['sale', 'rent'] as const) {
    const values = { ...wanted(transaction), amenitySelections: Object.fromEntries(STUDIO_FEATURES.map(item => [item.field, 'required' as const])), nearbyServices: ['pharmacy', 'bus_station'] };
    const requirement = buildStudioRequirement(values, id, 'seeker-studio');
    const normalized = normalizeSeekerRequirement(requirement);
    assert.equal(normalized.ok, true);
    if (!normalized.ok) throw Error('Normalization failed');
    assert.deepEqual(readStudioRequirement(normalized.value), values);
    assert.deepEqual(requirement.preferredAmenities, ['elevator', 'security_guard', 'balcony']);
    assert.equal(requirement.centralAC, true);
    assert.equal(requirement.catalogPreferences?.some(item => ['hasBalcony', 'hasElevator', 'hasSecurityGuard', 'hasCentralAC'].includes(item.field)), false);
    const rows = getRequirementDetailsRows(normalized.value, 'ar', key => key);
    for (const field of ['hasSharedPool', 'hasSharedGym', 'hasSeaView', 'hasSplitAC', 'preferredNearbyServices']) assert.equal(rows.filter(row => row.field === field).length, 1, field);
    assert.ok(rows.find(row => row.field === 'preferredNearbyServices')?.value.includes('صيدلية'));
  }
});

test('Clearing Studio features leaves them unspecified, while historical false stays false until cleared', () => {
  const property = buildStudioProperty({ ...offered(), amenitySelections: { hasBalcony: 'no', hasSharedPool: 'yes' } }, 'studio-old-false', 'offer');
  const read = readStudioProperty(property);
  assert.equal(read.amenitySelections?.hasBalcony, 'no');
  assert.equal(read.amenitySelections?.hasSharedGym, 'unknown');
  const cleared = buildStudioProperty({ ...read, amenitySelections: { ...read.amenitySelections, hasSharedPool: 'unknown' }, nearbyServices: [] }, property.core.id, property.activeOffer.id);
  assert.equal((cleared.typeDetails as unknown as Record<string, unknown>).hasSharedPool, undefined);
  assert.equal((cleared.typeDetails as unknown as Record<string, unknown>).hasBalcony, false);
  const request = buildStudioRequirement({ ...wanted('sale'), amenitySelections: { hasElevator: 'must_not_have', hasSharedGym: 'must_not_have' } }, id, 'seeker');
  assert.equal(readStudioRequirement(request).amenitySelections?.hasElevator, 'must_not_have');
  assert.equal(readStudioRequirement(request).amenitySelections?.hasSharedGym, 'must_not_have');
});

test('New amenities remain Studio-only and exclude unapproved facilities', () => {
  const property = buildStudioProperty({ ...offered(), amenitySelections: { hasSharedPool: 'yes' } }, 'studio', 'offer');
  assert.equal(validateProperty({ ...property, typeDetails: { ...property.typeDetails, propertyType: 'apartment', apartmentSubtype: 'standard_apartment' } }).ok, false);
  const requirement = buildStudioRequirement({ ...wanted('sale'), amenitySelections: { hasSharedGym: 'required' } }, id, 'seeker');
  assert.equal(validateSeekerRequirement({ ...requirement, catalogPreferences: requirement.catalogPreferences?.filter(item => item.field !== 'apartmentSubtype') }).ok, false);
  assert.equal(STUDIO_FEATURES.some(item => /Maid|Driver|Laundry|Entrance/i.test(item.field)), false);
});

test('All nearby choices have stable unique IDs and bilingual labels, including a laundry shop', () => {
  assert.equal(DEMO_NEARBY_SERVICES.length, 16);
  assert.equal(new Set(DEMO_NEARBY_SERVICES.map(item => item.id)).size, 16);
  for (const item of DEMO_NEARBY_SERVICES) assert.ok(item.label[0] && item.label[1]);
  assert.deepEqual(DEMO_NEARBY_SERVICES.find(item => item.id === 'laundry')?.label, ['Laundry shop', 'مغسلة ملابس']);
});

test('Person-started nearby preferences persist through every generic property type and reject malformed lists', () => {
  for (const propertyType of ['apartment', 'house', 'floor', 'office', 'commercial_complex', 'warehouse', 'other_built_property'] as const) {
    const result = buildPersonRequirement(id, 'seeker', { purpose: 'buy', propertyType, preferredAreaIds: [], preferredAreaMode: 'all_kuwait', minimumBudget: 1, maximumBudget: 2, currencyCode: 'KWD', notes: '', preferredNearbyServices: ['mosque', 'cafe'] });
    assert.equal(result.ok, true, propertyType);
    if (!result.ok) throw Error(propertyType);
    assert.deepEqual(formValuesFromRequirement(result.value).preferredNearbyServices, ['mosque', 'cafe']);
    assert.equal(validateSeekerRequirement({ ...result.value, preferredNearbyServices: ['mosque', 'mosque'] }).ok, false);
    assert.equal(validateSeekerRequirement({ ...result.value, preferredNearbyServices: [false] }).ok, false);
  }
});

test('Nearby UI is independent of demo categories and present in both commercial sale profiles', async () => {
  const source = await readFile(resolveSourcePath('../components/ModernPropertyForm.tsx', import.meta.url), 'utf8');
  assert.match(source, /const nearbySection = onNearbyChange/);
  assert.equal((source.match(/\{nearbySection\}/g) ?? []).length, 3);
  const chips = await readFile(resolveSourcePath('../components/NearbyServicesSelector.tsx', import.meta.url), 'utf8');
  assert.match(chips, /flexWrap: 'wrap'/);
  assert.match(chips, /values\.includes\(item\.id\) \? values\.filter/);
  assert.doesNotMatch(chips, /not_important|غير مهم/);
});
