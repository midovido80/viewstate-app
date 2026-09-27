import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';

const source = async (path: string) =>
  readFile(resolveSourcePath(path, import.meta.url), 'utf8');

test('Add entry requires both Offered/Wanted and transaction choices without auto-advance', async () => {
  const transaction = await source('../app/capture/transaction.tsx');
  assert.match(transaction, /select-offered/);
  assert.match(transaction, /select-wanted/);
  assert.match(transaction, /Offered Sale/);
  assert.match(transaction, /Offered Rent/);
  assert.match(transaction, /Wanted Purchase/);
  assert.match(transaction, /Wanted Rent/);
  assert.match(transaction, /disabled=\{!offerMode \|\| !transaction\}/);
  assert.match(transaction, /router\.push\(\{\s*pathname: '\/capture\/property-type'/);
  assert.doesNotMatch(transaction, /onSelect=\{\(\) => \{[^}]*router\.push/s);
});

test('Apartment selection structurally enables Next before choosing a subtype', async () => {
  const propertyType = await source('../app/capture/property-type.tsx');
  assert.match(propertyType, /disabled=\{!propertyType\}/);
  assert.match(propertyType, /pathname: '\/capture\/apartment-subtype'/);
  assert.doesNotMatch(propertyType, /select-apartment-studio|select-apartment-standard/);
  assert.doesNotMatch(propertyType, /propertyType === 'apartment' && !apartmentSubtype/);
});

test('Apartment subtype route structurally preserves dedicated and existing destinations', async () => {
  const subtype = await source('../app/capture/apartment-subtype.tsx');
  assert.match(subtype, /select-apartment-studio/);
  assert.match(subtype, /select-apartment-standard/);
  assert.match(subtype, /pathname: '\/capture\/studio'/);
  assert.match(subtype, /pathname: '\/requirement\/new'/);
  assert.match(subtype, /purpose: transaction === 'sale' \? 'buy' : 'rent'/);
  assert.match(subtype, /pathname: '\/capture\/price'/);
  assert.match(subtype, /router\.navigate\(\{\s*pathname: '\/capture\/property-type'/);
});

test('Person Details starts the dedicated wanted Studio form for the existing seeker', async () => {
  const person = await source('../app/person/[personId].tsx');
  assert.match(person, /testID="person-primary-action"/);
  assert.match(person, /classification === 'seeker'\)\s*\{\s*router\.push\(getPersonWantedStudioRoute\(person\.id\)/);
  assert.match(person, /person\.classifications\.map\(classification =>/);
  assert.match(person, /person\.classifications\.length > 1/);
  assert.doesNotMatch(person, /person-add-wanted-studio|person-saved-add-requirement/);
  assert.match(person, /params: \{ mode: 'wanted', seekerId: personId, transaction: 'rent' \}/);
});