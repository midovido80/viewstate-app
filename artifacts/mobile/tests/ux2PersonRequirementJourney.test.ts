import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import './platformModuleStubs.ts';
import { PROPERTY_TYPES, normalizeSeekerRequirement } from '@workspace/property-domain';
import { buildPersonRequirement, formValuesFromRequirement } from '../services/personRequirementWorkflow.ts';
import { PERSON_CLASSIFICATIONS, createPerson, personCanBePropertySource } from '../services/people.ts';
import { getApplicablePropertyFormFields } from '../services/propertyFormCatalog.ts';

const seekerId = 'ux2-seeker';
const rentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const buyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('UX-2 uses canonical Person roles and restricts Property source ownership', () => {
  assert.deepEqual(PERSON_CLASSIFICATIONS, ['seeker', 'owner', 'broker', 'real_estate_company', 'building_guard']);
  const person = createPerson({
    id: seekerId, classifications: ['seeker', 'broker'], name: '  Contact Name  ',
    displayPhone: '50000000', notes: 'private note',
  });
  assert.equal(person.name, '  Contact Name  ');
  assert.equal(person.displayPhone, '50000000');
  assert.equal(personCanBePropertySource(person, 'broker'), true);
  assert.equal(personCanBePropertySource(person, 'owner'), false);
});

test('UX-2 Rent preferences preserve zero, false, absence, and exact/custom values after reopening', () => {
  const result = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 0, maximumBudget: 900, currencyCode: 'KWD', notes: '',
    bedroomsMinimum: 0, swimmingPool: false,
    catalogPreferences: [
      { field: 'bedroomCount', kind: 'number', comparison: 'exact', value: 7 },
      { field: 'hasBalcony', kind: 'feature', value: false },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const restored = formValuesFromRequirement(result.value);
  assert.equal(restored.bedroomsMinimum, 0);
  assert.equal(restored.swimmingPool, false);
  assert.equal(restored.gym, undefined);
  assert.equal(restored.catalogPreferences?.[0].kind, 'number');
  assert.deepEqual(restored.catalogPreferences, result.value.catalogPreferences);
  assert.equal(result.value.id, rentId);
  assert.equal(result.value.seekerId, seekerId);
});

test('UX-2 Buy and Floor preferences persist under canonical applicability without Rent fields', () => {
  assert.ok(PROPERTY_TYPES.includes('floor'));
  const residential = getApplicablePropertyFormFields('floor', 'residential').map(item => item.field);
  const commercial = getApplicablePropertyFormFields('floor', 'commercial').map(item => item.field);
  assert.ok(residential.includes('bedroomCount'));
  assert.ok(!commercial.includes('bedroomCount'));
  assert.ok(commercial.includes('commercialActivity'));
  const buy = buildPersonRequirement(buyId, seekerId, {
    purpose: 'buy', propertyType: 'floor', floorUse: 'commercial',
    preferredAreaIds: ['hawalli'], minimumBudget: 1, maximumBudget: 100000,
    currencyCode: 'KWD', notes: 'office preference',
    catalogPreferences: [
      { field: 'frontageWidthMeters', kind: 'number', comparison: 'minimum', value: 12.5 },
      { field: 'commercialActivity', kind: 'choice', value: 'Retail' },
    ],
  });
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.value.floorUse, 'commercial');
  assert.equal(buy.value.purpose, 'buy');
  assert.equal('bedroomsMinimum' in buy.value, false);
  assert.deepEqual(formValuesFromRequirement(buy.value).catalogPreferences, buy.value.catalogPreferences);
  const invalid = normalizeSeekerRequirement({
    ...buy.value, catalogPreferences: [{ field: 'bedroomCount', kind: 'number', comparison: 'exact', value: 2 }],
  });
  assert.equal(invalid.ok, false);
});

test('UX-2 source role travels with the Person through every existing capture route', async () => {
  for (const route of ['index', 'transaction', 'property-type', 'price', 'location', 'summary']) {
    const source = await readFile(`app/capture/${route}.tsx`, 'utf8');
    assert.match(source, /linkPersonId, sourceRole/, `${route} must read both relationship parameters`);
    assert.match(source, /sourceRole/, `${route} must retain the selected source role`);
  }
  const entry = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(entry, /linkPersonId: person\.id, sourceRole: role/);
  for (const route of ['index', 'summary']) {
    const source = await readFile(`app/capture/${route}.tsx`, 'utf8');
    assert.match(source, /setPropertySource\(/);
    assert.match(source, /linkPersonToProperty\(/);
  }
});