import assert from 'node:assert/strict';
import test from 'node:test';
import { getPropertyTypeChoices, canonicalPropertyTypeChoice, parseFloorUse, parsePropertySector, togglePropertySector } from '../services/propertySectorSelection.ts';
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
