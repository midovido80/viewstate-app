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

test('Apartment Studio selection routes to dedicated Studio capture with flow context', async () => {
  const propertyType = await source('../app/capture/property-type.tsx');
  assert.match(propertyType, /select-apartment-studio/);
  assert.match(propertyType, /apartmentSubtype === 'studio'/);
  assert.match(propertyType, /pathname: '\/capture\/studio'/);
  assert.match(propertyType, /params: \{ \.\.\.routeParams, propertyType: 'apartment', apartmentSubtype: 'studio' \}/);
  assert.match(propertyType, /pathname: '\/requirement\/new'/);
  assert.match(propertyType, /purpose: transaction === 'sale' \? 'buy' : 'rent'/);
});

test('Person Details starts a wanted capture for the existing seeker record', async () => {
  const person = await source('../app/person/[personId].tsx');
  assert.match(person, /testID="person-add-wanted-studio"/);
  assert.match(person, /pathname: '\/capture\/transaction',\s*params: \{ mode: 'wanted', seekerId: person\.id \}/);
});