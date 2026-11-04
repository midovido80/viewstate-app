import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { deriveOfferedWantedRows, filterPropertyInventoryRows, loadOfferedWantedPresentation } from '../services/offeredWantedPresentation.ts';
import { EMPTY_COMPOSABLE_RECORD_FILTER as empty } from '../services/composableRecordFilters.ts';
const property = (id: string, transaction: 'rent' | 'sale', propertyType: 'apartment' | 'shop'): Property => ({
  core: { id, propertyType, locationArea: { id: 'salmiya' } },
  activeOffer: { id: `${id}-offer`, propertyCoreId: id,
    ...(transaction === 'rent' ? { transaction: 'rent' as const, rentalPrice: { amount: 450, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' } : { transaction: 'sale' as const, salePrice: { amount: 90000, currencyCode: 'KWD' } }) },
});
const request = (id: string, purpose: 'rent' | 'buy', propertyType: 'apartment' | 'shop'): SeekerRequirement => ({
  id, seekerId: 'client', purpose, propertyType, preferredAreaMode: 'all_kuwait', preferredAreaIds: [],
  budget: { minimum: 400, maximum: 600, currencyCode: 'KWD' }, notes: '',
  ...(purpose === 'rent' ? { rentalPeriodId: 'monthly' } : {}),
});
const properties = [property('home', 'rent', 'apartment'), property('store', 'sale', 'shop')];
const requests = [request('rent-home', 'rent', 'apartment'), request('buy-store', 'buy', 'shop')];
test('Inventory tabs partition stock and demand without duplicating or changing record identities', () => {
  const rows = deriveOfferedWantedRows(properties, requests);
  const before = JSON.stringify(rows);
  const stock = filterPropertyInventoryRows(rows, 'properties', empty);
  const demand = filterPropertyInventoryRows(rows, 'requests', empty);
  assert.deepEqual(stock.map(row => row.id), ['home', 'store']);
  assert.deepEqual(demand.map(row => row.id), ['rent-home', 'buy-store']);
  assert.equal(stock.length + demand.length, rows.length);
  assert.ok(stock.every(row => rows.includes(row)) && demand.every(row => rows.includes(row)));
  assert.equal(JSON.stringify(rows), before);
  assert.equal(demand[0].href, '/requirement/view/rent-home');
});
test('Tabs compose transaction, sector and search independently; buy uses the sale facet', () => {
  const rows = deriveOfferedWantedRows(properties, requests);
  const sale = { ...empty, transactions: ['sale'] as const };
  assert.deepEqual(filterPropertyInventoryRows(rows, 'properties', sale, '', 'commercial').map(row => row.id), ['store']);
  assert.deepEqual(filterPropertyInventoryRows(rows, 'requests', sale, '', 'commercial').map(row => row.id), ['buy-store']);
  assert.deepEqual(filterPropertyInventoryRows(rows, 'requests', sale, '', 'residential'), []);
  assert.deepEqual(filterPropertyInventoryRows(rows, 'properties', empty, 'مطلوب'), []);
  assert.deepEqual(filterPropertyInventoryRows(rows, 'requests', empty, 'شقة', 'residential').map(row => row.id), ['rent-home']);
  assert.deepEqual(filterPropertyInventoryRows(rows, 'properties', { ...empty, directions: ['wanted'] }).map(row => row.id), ['home', 'store']);
});
test('Request tab retains its saved owner-linked requirement even when property reads fail', async () => {
  const person = { id: 'client', name: 'Ahmed', displayPhone: '50123456', normalizedPhone: '+96550123456', notes: '', classifications: ['seeker'] } as any;
  const loaded = await loadOfferedWantedPresentation({
    getProperties: async () => { throw Error('temporarily unavailable'); },
    getRequirements: async () => requests, getPeople: async () => [person],
    getPersonPropertyLinks: async () => [], getPropertySource: async () => null,
  });
  assert.equal(loaded.errors.properties, true);
  const demand = filterPropertyInventoryRows(loaded.rows, 'requests', empty, 'Ahmed');
  assert.equal(demand.length, 2);
  for (const row of demand) {
    if (row.kind === 'wanted') assert.equal(row.requirement, requests.find(item => item.id === row.id));
    assert.equal(row.person, person);
  }
});


test('Choosing unspecified inside the count picker completes the field; choosing a number clears only that flag', async () => {
  const { withExplicitCountChoice, requirementCompletionFields, missingCompletionFields } = await import('../services/requiredMatchingFields.ts');
  const input = { type: 'apartment', areaMode: 'all_kuwait', areas: [], bedrooms: '', bathrooms: '', size: '', minimum: '400', maximum: '600', unspecified: [] as string[] };
  assert.deepEqual(missingCompletionFields(requirementCompletionFields(input)), ['bedrooms', 'bathrooms']);
  let flags = withExplicitCountChoice(input.unspecified, 'bedrooms', '');
  flags = withExplicitCountChoice(flags, 'bathrooms', '');
  flags = withExplicitCountChoice(flags, 'bedrooms', '');
  assert.deepEqual(flags, ['bathrooms', 'bedrooms'], 'reselecting unspecified does not duplicate it');
  assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...input, unspecified: flags })), []);
  flags = withExplicitCountChoice(flags, 'bedrooms', '4');
  assert.deepEqual(flags, ['bathrooms']);
  assert.deepEqual(missingCompletionFields(requirementCompletionFields({ ...input, bedrooms: '4', unspecified: flags })), []);
});
