import assert from 'node:assert/strict';
import test from 'node:test';
import { getPropertyTypeChoices, canonicalPropertyTypeChoice, parseFloorUse, parsePropertySector, togglePropertySector, getBuiltPropertySector } from '../services/propertySectorSelection.ts';
import { deriveOfferedWantedRows, filterOfferedWantedRows } from '../services/offeredWantedPresentation.ts';
import type { Property, PropertyType, SeekerRequirement } from '@workspace/property-domain';
import { getPropertyFormRoute } from '../services/propertyFormRoutes.ts';

test('All is the default and selected sector toggles back to All', () => {
  assert.equal(parsePropertySector(undefined), 'all');
  assert.equal(parsePropertySector('invalid'), 'all');
  assert.equal(togglePropertySector('all', 'commercial'), 'commercial');
  assert.equal(togglePropertySector('commercial', 'commercial'), 'all');
  assert.equal(togglePropertySector('residential', 'residential'), 'all');
  assert.equal(togglePropertySector('commercial', 'residential'), 'residential');
  assert.equal(togglePropertySector('all', 'all'), 'all');
});

test('sector lists contain Floor and Other but keep Duplex residential', () => {
  assert.deepEqual(getPropertyTypeChoices('commercial'), ['commercial_complex', 'floor', 'office', 'shop', 'warehouse', 'other_built_property']);
  assert.deepEqual(getPropertyTypeChoices('residential'), ['whole_building', 'apartment', 'duplex', 'floor', 'house', 'villa', 'chalet', 'other_built_property']);
  const all = getPropertyTypeChoices('all');
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 12);
});

test('direct Duplex retains the existing canonical apartment subtype', () => {
  assert.deepEqual(canonicalPropertyTypeChoice('duplex'), { propertyType: 'apartment', apartmentSubtype: 'duplex' });
  for (const mode of ['offered', 'wanted'] as const) {
    const route = getPropertyFormRoute({ mode, transaction: 'rent', ...canonicalPropertyTypeChoice('duplex') });
    assert.notEqual(route.kind, 'apartment-subtype');
    assert.equal(route.params.apartmentSubtype, 'duplex');
  }
});

test('Floor use reaches Offered and Wanted routes with person context intact', () => {
  for (const mode of ['offered', 'wanted'] as const) for (const transaction of ['sale', 'rent'] as const) for (const floorUse of ['residential', 'commercial'] as const) {
    const route = getPropertyFormRoute({ mode, transaction, propertyType: 'floor', floorUse, seekerId: 'person-test', linkPersonId: 'source-test', sourceRole: 'broker' });
    assert.equal(route.params.floorUse, floorUse);
    assert.equal(route.params.seekerId, 'person-test');
    assert.equal(route.params.linkPersonId, 'source-test');
    assert.equal(route.params.sourceRole, 'broker');
    assert.equal(route.kind, mode === 'wanted' ? 'wanted' : 'floor');
  }
});

test('All and invalid values never become persisted Floor uses', () => {
  assert.equal(parseFloorUse('all'), undefined);
  assert.equal(parseFloorUse('invalid'), undefined);
  assert.equal(parseFloorUse('commercial'), 'commercial');
  assert.equal(parseFloorUse('residential'), 'residential');
  assert.equal(getPropertyFormRoute({ mode: 'wanted', propertyType: 'villa', floorUse: 'commercial' }).params.floorUse, undefined);
});

function sectorProperty(id: string, propertyType: PropertyType, transaction: 'sale' | 'rent', use?: 'residential' | 'commercial'): Property {
  return {
    core: { id, propertyType, locationArea: { id: 'salmiya' } },
    activeOffer: transaction === 'sale'
      ? { id: id + '-offer', propertyCoreId: id, transaction, salePrice: { amount: 100000, currencyCode: 'KWD' } }
      : { id: id + '-offer', propertyCoreId: id, transaction, rentalPrice: { amount: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' },
    ...(use ? { typeDetails: { propertyType, ...(propertyType === 'floor' ? { floorUse: use } : { propertyUse: use }) } as Property['typeDetails'] } : {}),
  };
}
function sectorRequirement(id: string, propertyType: PropertyType, purpose: 'buy' | 'rent', floorUse?: 'residential' | 'commercial'): SeekerRequirement {
  return { id, propertyType, purpose, preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas',
    budget: { minimum: 100, maximum: 500, currencyCode: 'KWD' }, notes: '', ...(floorUse ? { floorUse } : {}) } as SeekerRequirement;
}

test('inventory sector classification covers every exclusive built-property type', () => {
  for (const type of ['whole_building', 'apartment', 'house', 'villa', 'chalet'] as const) {
    assert.equal(getBuiltPropertySector(type), 'residential');
  }
  for (const type of ['commercial_complex', 'office', 'shop', 'warehouse'] as const) {
    assert.equal(getBuiltPropertySector(type), 'commercial');
  }
  for (const type of ['floor', 'other_built_property'] as const) {
    assert.equal(getBuiltPropertySector(type), undefined);
    assert.equal(getBuiltPropertySector(type, 'invalid'), undefined);
    assert.equal(getBuiltPropertySector(type, 'residential'), 'residential');
    assert.equal(getBuiltPropertySector(type, 'commercial'), 'commercial');
  }
});

test('Residential and Commercial inventory filters never leak opposite or unclassified shared types', () => {
  const properties = [
    ...(['whole_building', 'apartment', 'house', 'villa', 'chalet', 'commercial_complex', 'office', 'shop', 'warehouse'] as const)
      .map(type => sectorProperty(type, type, 'rent')),
    sectorProperty('floor-res', 'floor', 'rent', 'residential'),
    sectorProperty('floor-com', 'floor', 'rent', 'commercial'),
    sectorProperty('other-res', 'other_built_property', 'sale', 'residential'),
    sectorProperty('other-com', 'other_built_property', 'sale', 'commercial'),
    sectorProperty('floor-unknown', 'floor', 'rent'),
    sectorProperty('other-unknown', 'other_built_property', 'rent'),
  ];
  const before = JSON.stringify(properties);
  const rows = deriveOfferedWantedRows(properties, []);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', '', 'residential').map(row => row.id),
    ['whole_building', 'apartment', 'house', 'villa', 'chalet', 'floor-res', 'other-res']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', '', 'commercial').map(row => row.id),
    ['commercial_complex', 'office', 'shop', 'warehouse', 'floor-com', 'other-com']);
  assert.equal(filterOfferedWantedRows(rows, 'all', '', 'all').length, properties.length);
  assert.equal(JSON.stringify(properties), before);
});

test('sector filters also apply to Wanted records and respect the stored Floor use', () => {
  const requirements = [
    sectorRequirement('wanted-apt', 'apartment', 'rent'),
    sectorRequirement('wanted-office', 'office', 'buy'),
    sectorRequirement('wanted-floor-res', 'floor', 'rent', 'residential'),
    sectorRequirement('wanted-floor-com', 'floor', 'rent', 'commercial'),
    sectorRequirement('wanted-floor-unknown', 'floor', 'rent'),
    sectorRequirement('wanted-other-unknown', 'other_built_property', 'rent'),
  ];
  const rows = deriveOfferedWantedRows([], requirements);
  assert.deepEqual(filterOfferedWantedRows(rows, 'wanted', '', 'residential').map(row => row.id), ['wanted-apt', 'wanted-floor-res']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'wanted', '', 'commercial').map(row => row.id), ['wanted-office', 'wanted-floor-com']);
  assert.equal(filterOfferedWantedRows(rows).length, requirements.length);
});

test('sector, transaction, Offered/Wanted and search intersect before rendering inventory', () => {
  const rows = deriveOfferedWantedRows([
    sectorProperty('res-rent', 'apartment', 'rent'), sectorProperty('res-sale', 'villa', 'sale'),
    sectorProperty('com-rent', 'office', 'rent'), sectorProperty('com-sale', 'shop', 'sale'),
  ], [sectorRequirement('wanted-res', 'house', 'rent'), sectorRequirement('wanted-com', 'warehouse', 'buy')]);
  const selection = { directions: ['offered'] as const, transactions: ['rent'] as const };
  assert.deepEqual(filterOfferedWantedRows(rows, selection, 'السالمية', 'residential').map(row => row.id), ['res-rent']);
  assert.deepEqual(filterOfferedWantedRows(rows, selection, 'salmiya', 'commercial').map(row => row.id), ['com-rent']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'sale', '', 'commercial').map(row => row.id), ['com-sale', 'wanted-com']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'wanted', '', 'residential').map(row => row.id), ['wanted-res']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', 'villa', 'commercial'), []);
});

test('Studio, Standard and Duplex all remain residential in the inventory', () => {
  const properties = (['studio', 'standard_apartment', 'duplex'] as const).map(subtype => ({
    ...sectorProperty(subtype, 'apartment', 'rent'),
    typeDetails: { propertyType: 'apartment' as const, apartmentSubtype: subtype },
  }));
  const rows = deriveOfferedWantedRows(properties, []);
  assert.equal(filterOfferedWantedRows(rows, 'all', '', 'residential').length, 3);
  assert.equal(filterOfferedWantedRows(rows, 'all', '', 'commercial').length, 0);
});

test('clearing a sector returns all sectors while preserving the other facets', () => {
  const rows = deriveOfferedWantedRows([sectorProperty('res', 'apartment', 'rent'), sectorProperty('com', 'office', 'rent')], []);
  const selection = { directions: ['offered'] as const, transactions: ['rent'] as const };
  const selected = togglePropertySector('all', 'residential');
  assert.equal(filterOfferedWantedRows(rows, selection, '', selected).length, 1);
  assert.equal(filterOfferedWantedRows(rows, selection, '', togglePropertySector(selected, 'residential')).length, 2);
});
