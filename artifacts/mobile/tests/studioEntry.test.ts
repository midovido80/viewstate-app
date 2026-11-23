import { sourceMatch, sourceDoesNotMatch, sourceIndex } from "./sourceAssertions";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';
import {
  getPropertyEditFormHref,
  getPropertyFormRoute,
  getPropertyTypeSelectionRoute,
  getRequirementEditFormTarget,
  getSupportedPropertyFormSelections,
} from '@/services/propertyFormRoutes';

const source = async (path: string) =>
  readFile(resolveSourcePath(path, import.meta.url), 'utf8');

test('Add entry requires both Offered/Wanted and transaction choices without auto-advance', async () => {
  const transaction = await source('../app/capture/transaction.tsx');
  sourceMatch(transaction, /select-offered/);
  sourceMatch(transaction, /select-wanted/);
  sourceMatch(transaction, /title=\{offerMode === 'wanted' \? label\('To buy', 'للشراء'\) : label\('For sale', 'للبيع'\)\}/);
  sourceMatch(transaction, /title=\{label\('For rent', 'للإيجار'\)\}/);
  sourceDoesNotMatch(transaction, /Wanted Purchase|Wanted Rent|Offered Sale|Offered Rent/);
  sourceMatch(transaction, /disabled=\{!offerMode \|\| !transaction\}/);
  sourceMatch(transaction, /router\.push\(getPropertyTypeSelectionRoute\(/);
  sourceDoesNotMatch(transaction, /onSelect=\{\(\) => \{[^}]*router\.push/s);
});

test('shared Property form routing is deterministic for every catalog type/subtype and mode', () => {
  const entries = getSupportedPropertyFormSelections();
  assert.ok(entries.length >= 2 * 2 * 11);
  for (const selection of entries) {
    const first = getPropertyFormRoute(selection);
    assert.deepEqual(getPropertyFormRoute(selection), first, `${selection.mode} ${selection.propertyType} route is deterministic`);
    if (selection.propertyType === 'apartment' && selection.apartmentSubtype === 'studio') {
      assert.equal(first.kind, 'studio');
      assert.equal(first.pathname, '/capture/studio');
      assert.notEqual(first.pathname, '/capture/price');
      assert.notEqual(first.pathname, '/requirement/new');
    } else if (selection.propertyType === 'apartment' && selection.apartmentSubtype === undefined) {
      assert.equal(first.kind, 'apartment-subtype');
    } else if (selection.mode === 'wanted') {
      assert.equal(first.kind, 'wanted');
      assert.equal(first.pathname, '/requirement/new');
    } else if (selection.propertyType === 'floor') {
      assert.equal(first.kind, 'floor');
      assert.equal(first.pathname, '/capture');
    } else {
      assert.equal(first.kind, 'offered');
      assert.equal(first.pathname, '/capture/price');
    }
  }
  for (const mode of ['offered', 'wanted'] as const) {
    assert.equal(getPropertyFormRoute({
      mode,
      transaction: 'rent',
      propertyType: 'apartment',
      apartmentSubtype: 'studio',
      seekerId: 'exact-seeker',
    }).pathname, '/capture/studio');
  }
});

test('shared create and edit routes preserve exact context and keep Studio out of generic Apartment forms', () => {
  const context = {
    mode: 'wanted' as const,
    transaction: 'sale' as const,
    seekerId: 'seeker / exact',
    linkPersonId: 'owner / exact',
    sourceRole: 'broker',
  };
  assert.deepEqual(getPropertyTypeSelectionRoute(context), {
    pathname: '/capture/property-type',
    params: { ...context },
  });
  const studio = getPropertyFormRoute({
    ...context,
    mode: 'wanted',
    propertyType: 'apartment',
    apartmentSubtype: 'studio',
  });
  assert.equal(studio.kind, 'studio');
  assert.deepEqual(studio.params, {
    mode: 'wanted',
    transaction: 'sale',
    propertyType: 'apartment',
    apartmentSubtype: 'studio',
    seekerId: 'seeker / exact',
    linkPersonId: 'owner / exact',
    sourceRole: 'broker',
  });
  assert.equal(getPropertyEditFormHref('property / exact', 'apartment', 'studio'),
    '/capture/studio?editPropertyId=property%20%2F%20exact');
  assert.equal(getPropertyEditFormHref('property / exact', 'villa'), '/property/property%20%2F%20exact/edit');
  assert.deepEqual(getRequirementEditFormTarget('req / exact', 'seeker / exact', true, true), {
    kind: 'studio',
    href: '/capture/studio?editRequirementId=req%20%2F%20exact',
  });
  assert.deepEqual(getRequirementEditFormTarget('req / exact', 'seeker / exact', true, false), {
    kind: 'blocked',
  });
  assert.deepEqual(getRequirementEditFormTarget('req / exact', 'seeker / exact', false, true), {
    kind: 'generic',
    href: '/requirement/req%20%2F%20exact?seekerId=seeker%20%2F%20exact&edit=1',
  });
});

test('Apartment selection structurally enables Next before choosing a subtype', async () => {
  const propertyType = await source('../app/capture/property-type.tsx');
  sourceMatch(propertyType, /disabled=\{!propertyType[\s\S]*?!mode/);
  sourceMatch(propertyType, /getPropertyFormRoute\(/);
  sourceDoesNotMatch(propertyType, /select-apartment-studio|select-apartment-standard/);
  sourceDoesNotMatch(propertyType, /propertyType === 'apartment' && !apartmentSubtype/);
});

test('Apartment subtype route structurally preserves dedicated and existing destinations', async () => {
  const subtype = await source('../app/capture/apartment-subtype.tsx');
  sourceMatch(subtype, /select-apartment-studio/);
  sourceMatch(subtype, /select-apartment-standard/);
  sourceMatch(subtype, /getPropertyFormRoute\(/);
  sourceMatch(subtype, /target\.kind === 'studio' \|\| target\.kind === 'wanted'/);
  sourceMatch(subtype, /router\.navigate\(\{\s*pathname: '\/capture\/property-type'/);
});

test('Person Details starts the normal wanted classification flow for the existing seeker', async () => {
  const person = await source('../app/person/[personId].tsx');
  sourceMatch(person, /testID="person-primary-action"/);
  sourceMatch(person, /classification === 'seeker'\)\s*\{\s*router\.push\(getPersonWantedRequirementRoute\(person\.id\)/);
  sourceMatch(person, /person\.classifications\.map\(classification =>/);
  sourceMatch(person, /person\.classifications\.length > 1/);
  sourceDoesNotMatch(person, /person-add-wanted-studio|person-saved-add-requirement/);
  sourceMatch(person, /params: \{ mode: 'wanted', seekerId: personId \}/);
});
