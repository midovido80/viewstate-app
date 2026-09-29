import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMPTY_COMPOSABLE_RECORD_FILTER,
  anyRecordIntentMatchesComposableFilter,
  hasActiveRecordFilters,
  recordIntentMatchesComposableFilter,
  toggleRecordFilter,
} from '../services/composableRecordFilters.ts';
import { resolveSourcePath } from './sourcePath.ts';

test('composable filters use OR within a facet and AND across facets', () => {
  const wantedRent = {
    directions: ['wanted'] as const,
    transactions: ['rent'] as const,
  };
  assert.equal(recordIntentMatchesComposableFilter('wanted_rent', wantedRent), true);
  assert.equal(recordIntentMatchesComposableFilter('wanted_buy', wantedRent), false);
  assert.equal(recordIntentMatchesComposableFilter('offered_rent', wantedRent), false);

  const allDirectionsForRent = {
    directions: ['offered', 'wanted'] as const,
    transactions: ['rent'] as const,
  };
  assert.equal(recordIntentMatchesComposableFilter('offered_rent', allDirectionsForRent), true);
  assert.equal(recordIntentMatchesComposableFilter('wanted_rent', allDirectionsForRent), true);
  assert.equal(recordIntentMatchesComposableFilter('offered_sale', allDirectionsForRent), false);
});

test('All means no active facets, toggles are reversible, and conflicts remain visible only unfiltered', () => {
  assert.equal(hasActiveRecordFilters(EMPTY_COMPOSABLE_RECORD_FILTER), false);
  assert.equal(recordIntentMatchesComposableFilter('conflict', EMPTY_COMPOSABLE_RECORD_FILTER), true);

  const offered = toggleRecordFilter(EMPTY_COMPOSABLE_RECORD_FILTER, 'directions', 'offered');
  const offeredSale = toggleRecordFilter(offered, 'transactions', 'sale');
  assert.deepEqual(offeredSale, { directions: ['offered'], transactions: ['sale'] });
  assert.equal(recordIntentMatchesComposableFilter('offered_sale', offeredSale), true);
  assert.equal(recordIntentMatchesComposableFilter('conflict', offeredSale), false);

  const clearedDirection = toggleRecordFilter(offeredSale, 'directions', 'offered');
  assert.deepEqual(clearedDirection, { directions: [], transactions: ['sale'] });
});

test('a Person passes only when one linked activity satisfies the complete filter', () => {
  const offeredSale = {
    directions: ['offered'] as const,
    transactions: ['sale'] as const,
  };
  assert.equal(anyRecordIntentMatchesComposableFilter(['offered_sale'], offeredSale), true);
  assert.equal(anyRecordIntentMatchesComposableFilter(['offered_rent', 'wanted_buy'], offeredSale), false);
  assert.equal(anyRecordIntentMatchesComposableFilter([], EMPTY_COMPOSABLE_RECORD_FILTER), true);
});

test('Properties and People screens expose the same combinable filter controls', async () => {
  const [properties, people] = await Promise.all([
    readFile(resolveSourcePath('../app/(tabs)/properties.tsx', import.meta.url), 'utf8'),
    readFile(resolveSourcePath('../app/(tabs)/people.tsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [properties, people]) {
    assert.match(source, /toggleRecordFilter/);
    assert.match(source, /hasActiveRecordFilters/);
    assert.match(source, /directions/);
    assert.match(source, /transactions/);
  }
  assert.match(properties, /filterOfferedWantedRows\(rows, filter, search\)/);
  assert.match(people, /anyRecordIntentMatchesComposableFilter/);
  assert.match(people, /line\.intentId/);
});
