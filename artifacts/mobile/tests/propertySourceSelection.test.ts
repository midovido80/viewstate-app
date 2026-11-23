import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Person } from '../services/people.ts';
import { filterPropertySourcePeople, retainVisibleSourceSelection, suggestPropertySourceRole } from '../services/propertySourceSelection.ts';
import { resolveSourcePath } from './sourcePath.ts';

const person = (id: string, classifications: Person['classifications'], name = id, phone = '50001234'): Person => ({ id, classifications, name, displayPhone: phone, normalizedPhone: phone, notes: 'Private note not searchable here' });
const contacts = [
  person('owner', ['owner'], 'أحمد المالك', '٥٠٠٠١٢٣٤'),
  person('broker', ['broker'], 'Broker Adam', '51001111'),
  person('company', ['real_estate_company'], 'Ajar Company', '+96552002222'),
  person('guard', ['building_guard'], 'Building Guard', '53003333'),
  person('multi', ['owner', 'broker', 'real_estate_company'], 'Multi Role', '54004444'),
  person('seeker', ['seeker'], 'Legacy Source', '55005555'),
];

test('Source classification filters show only explicitly classified contacts, including multiple classifications once', () => {
  const expected = { owner: ['owner', 'multi'], broker: ['broker', 'multi'], real_estate_company: ['company', 'multi'], building_guard: ['guard'] } as const;
  for (const role of Object.keys(expected) as (keyof typeof expected)[]) assert.deepEqual(filterPropertySourcePeople(contacts, role, '').map(person => person.id), expected[role]);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'all', '').map(person => person.id), contacts.map(person => person.id));
  assert.equal(filterPropertySourcePeople([], 'owner', '').length, 0);
});

test('Source name and phone search intersects the selected classification and preserves authored data', () => {
  const snapshot = JSON.stringify(contacts);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'real_estate_company', 'ajar').map(person => person.id), ['company']);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'owner', 'ajar'), []);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'real_estate_company', '٥٢٠٠٢٢٢٢').map(person => person.id), ['company']);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'owner', 'أحمد').map(person => person.id), ['owner']);
  assert.deepEqual(filterPropertySourcePeople(contacts, 'all', 'private note'), []);
  assert.equal(JSON.stringify(contacts), snapshot);
});

test('Changing source filter or search clears hidden selection and preserves visible selection', () => {
  assert.equal(retainVisibleSourceSelection(filterPropertySourcePeople(contacts, 'broker', ''), 'company'), '');
  assert.equal(retainVisibleSourceSelection(filterPropertySourcePeople(contacts, 'broker', ''), 'multi'), 'multi');
  assert.equal(retainVisibleSourceSelection(filterPropertySourcePeople(contacts, 'all', 'ajar'), 'owner'), '');
  assert.equal(retainVisibleSourceSelection([], 'company'), '');
});

test('Filtered source selection proposes that role while All retains existing relationship flexibility', () => {
  assert.equal(suggestPropertySourceRole(contacts[4], 'real_estate_company', 'owner'), 'real_estate_company');
  assert.equal(suggestPropertySourceRole(contacts[4], 'all', 'broker'), 'broker');
  assert.equal(suggestPropertySourceRole(contacts[2], 'all', 'owner'), 'real_estate_company');
  assert.equal(suggestPropertySourceRole(contacts[5], 'all', 'building_guard'), 'building_guard');
});

test('Source picker displays classification filters before search/results and guards hidden selection on save', async () => {
  const detail = await readFile(resolveSourcePath('../app/property/[propertyCoreId].tsx', import.meta.url), 'utf8');
  const modal = detail.slice(detail.indexOf('<Modal visible={sourceOpen}'), detail.indexOf('<Modal\n        visible={sourceConfirmVisible}'));
  assert.ok(modal.indexOf('property-source-classification-filters') < modal.indexOf('property-source-search'));
  assert.ok(modal.indexOf('property-source-search') < modal.indexOf('property-source-results'));
  assert.match(modal, /visibleSourcePeople\.map\(person =>/);
  assert.match(modal, /person\.displayPhone/);
  assert.match(modal, /sourceClassification === 'all' && visibleSourceSelection/);
  assert.match(modal, /disabled=\{!visibleSourceSelection \|\| sourceBusy\}/);
  assert.match(detail, /if \(!id \|\| !visibleSourceSelection \|\| sourceBusy\) return/);
  const open = detail.slice(detail.indexOf('const openSource ='), detail.indexOf('const visibleSourcePeople ='));
  assert.match(open, /setSourceClassification\('all'\)/);
  assert.match(open, /setSourceSearch\(''\)/);
  assert.match(open, /setSourcePersonId\(source\?\.personId \?\? ''\)/);
});
