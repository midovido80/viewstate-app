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
import { getPersonDirectIntentActivityLines, filterPersonActivityLines } from '../services/cardSummaryPresentation.ts';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
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

test('Properties and People screens expose the same combinable, accessible filter controls', async () => {
  const [properties, people] = await Promise.all([
    readFile(resolveSourcePath('../app/(tabs)/properties.tsx', import.meta.url), 'utf8'),
    readFile(resolveSourcePath('../app/(tabs)/people.tsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [properties, people]) {
    assert.match(source, /toggleRecordFilter/);
    assert.match(source, /hasActiveRecordFilters/);
    assert.match(source, /directions/);
    assert.match(source, /transactions/);
    assert.match(source, /accessibilityRole=\{option\.key === 'all' \? 'button' : 'checkbox'\}/);
    assert.match(source, /aria-checked=\{option\.key === 'all' \? undefined : selected\}/);
  }
  assert.match(properties, /filterOfferedWantedRows\(rows, filter, search, sector\)/);
  assert.match(people, /filterPersonActivityLines/);
  assert.match(people, /!hasActivePeopleFilters \|\|/);
  assert.match(people, /visibleActivityByPerson\.get\(item\.id\)/);
});

const activityFormatters = { language: 'en' as const, translate: (key: string) => key,
  formatPrice: (amount: number) => String(amount), formatRentalPrice: (amount: number) => String(amount) };
function activityProperty(id: string, propertyType: Property['core']['propertyType'], transaction: 'rent' | 'sale', use?: 'residential' | 'commercial'): Property {
  return {
    core: { id, propertyType, locationArea: { id: 'salmiya' } },
    activeOffer: transaction === 'rent'
      ? { id: id + '-offer', propertyCoreId: id, transaction, rentalPrice: { amount: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }
      : { id: id + '-offer', propertyCoreId: id, transaction, salePrice: { amount: 100000, currencyCode: 'KWD' } },
    ...(use ? { typeDetails: { propertyType, ...(propertyType === 'floor' ? { floorUse: use } : { propertyUse: use }) } as Property['typeDetails'] } : {}),
  };
}
function activityRequirement(id: string, seekerId: string, propertyType: SeekerRequirement['propertyType'], purpose: 'rent' | 'buy', floorUse?: 'residential' | 'commercial'): SeekerRequirement {
  return { id, seekerId, propertyType, purpose, preferredAreaIds: ['salmiya'],
    budget: { minimum: 100, maximum: 500, currencyCode: 'KWD' }, notes: '', ...(floorUse ? { floorUse } : {}) } as SeekerRequirement;
}

test('People filters require direction, transaction and sector on the same associated activity', () => {
  const properties = [activityProperty('res-offer', 'villa', 'rent')];
  const requirements = [activityRequirement('res-buy', 'person', 'apartment', 'buy'), activityRequirement('com-rent', 'person', 'office', 'rent')];
  const lines = getPersonDirectIntentActivityLines('person', properties, requirements, [{ personId: 'person', propertyCoreId: 'res-offer' }], [], activityFormatters);
  const wantedRent = { directions: ['wanted'] as const, transactions: ['rent'] as const };
  assert.deepEqual(filterPersonActivityLines(lines, wantedRent, 'residential'), []);
  assert.deepEqual(filterPersonActivityLines(lines, wantedRent, 'commercial').map(line => line.id), ['com-rent']);
  assert.deepEqual(filterPersonActivityLines(lines, { directions: ['offered'], transactions: ['rent'] }, 'residential').map(line => line.id), ['res-offer']);
});

test('People filtering covers all direction/transaction/sector combinations and retains exact Person ownership', () => {
  const requirements = [
    activityRequirement('res-rent', 'person', 'house', 'rent'), activityRequirement('res-buy', 'person', 'apartment', 'buy'),
    activityRequirement('com-rent', 'person', 'office', 'rent'), activityRequirement('com-buy', 'person', 'shop', 'buy'),
    activityRequirement('another-person', 'other-person', 'apartment', 'rent'),
  ];
  const properties = [
    activityProperty('res-offer-rent', 'villa', 'rent'), activityProperty('res-offer-sale', 'chalet', 'sale'),
    activityProperty('com-offer-rent', 'office', 'rent'), activityProperty('com-offer-sale', 'warehouse', 'sale'),
  ];
  const links = properties.map(property => ({ personId: 'person', propertyCoreId: property.core.id }));
  const lines = getPersonDirectIntentActivityLines('person', properties, requirements, links, [], activityFormatters);
  for (const direction of ['offered', 'wanted'] as const) for (const transaction of ['sale', 'rent'] as const) for (const sector of ['residential', 'commercial'] as const) {
    const result = filterPersonActivityLines(lines, { directions: [direction], transactions: [transaction] }, sector);
    assert.equal(result.length, 1, [direction, transaction, sector].join('/'));
    assert.equal(result[0].sector, sector);
    assert.equal(result[0].intentId, direction === 'offered' ? 'offered_' + transaction : transaction === 'sale' ? 'wanted_buy' : 'wanted_rent');
    assert.notEqual(result[0].id, 'another-person');
  }
});

test('People Floor and Other activities use canonical use and unknown legacy activities appear only without a sector', () => {
  const properties = [
    activityProperty('res-floor', 'floor', 'rent', 'residential'), activityProperty('com-floor', 'floor', 'rent', 'commercial'),
    activityProperty('res-other', 'other_built_property', 'rent', 'residential'), activityProperty('com-other', 'other_built_property', 'rent', 'commercial'),
    activityProperty('unknown-floor', 'floor', 'rent'), activityProperty('unknown-other', 'other_built_property', 'rent'),
  ];
  const requirements = [
    activityRequirement('wanted-res-floor', 'person', 'floor', 'rent', 'residential'),
    activityRequirement('wanted-com-floor', 'person', 'floor', 'rent', 'commercial'),
    activityRequirement('wanted-unknown', 'person', 'floor', 'rent'),
  ];
  const lines = getPersonDirectIntentActivityLines('person', properties, requirements,
    properties.map(property => ({ personId: 'person', propertyCoreId: property.core.id })), [], activityFormatters);
  assert.deepEqual(filterPersonActivityLines(lines, EMPTY_COMPOSABLE_RECORD_FILTER, 'residential').map(line => line.id).sort(), ['res-floor', 'res-other', 'wanted-res-floor']);
  assert.deepEqual(filterPersonActivityLines(lines, EMPTY_COMPOSABLE_RECORD_FILTER, 'commercial').map(line => line.id).sort(), ['com-floor', 'com-other', 'wanted-com-floor']);
  assert.equal(filterPersonActivityLines(lines).length, 9);
});

test('People activity facets remain OR within dimensions and AND across dimensions', () => {
  const requirements = [activityRequirement('r', 'person', 'apartment', 'rent'), activityRequirement('c', 'person', 'office', 'buy')];
  const lines = getPersonDirectIntentActivityLines('person', [], requirements, [], [], activityFormatters);
  assert.equal(filterPersonActivityLines(lines, { directions: ['wanted', 'offered'], transactions: ['rent', 'sale'] }).length, 2);
  assert.deepEqual(filterPersonActivityLines(lines, { directions: ['wanted', 'offered'], transactions: ['rent', 'sale'] }, 'commercial').map(line => line.id), ['c']);
  assert.deepEqual(filterPersonActivityLines([], EMPTY_COMPOSABLE_RECORD_FILTER, 'residential'), []);
});

test('Person source/link duplicates stay one activity and matching lines determine the card contents', () => {
  const properties = [activityProperty('com', 'office', 'rent'), activityProperty('res', 'apartment', 'rent')];
  const lines = getPersonDirectIntentActivityLines('person', properties, [],
    [{ personId: 'person', propertyCoreId: 'com' }, { personId: 'person', propertyCoreId: 'res' }],
    [{ personId: 'person', propertyCoreId: 'res', role: 'owner' }], activityFormatters);
  const original = JSON.stringify(lines);
  const selected = filterPersonActivityLines(lines, { directions: ['offered'], transactions: ['rent'] }, 'residential');
  assert.deepEqual(selected.map(line => line.id), ['res']);
  assert.equal(JSON.stringify(lines), original);
  assert.equal(selected[0].label.includes('office'), false);
});

test('People sector controls sit below intent controls and All clears both while filtered cards use matching activities', async () => {
  const source = await readFile(resolveSourcePath('../app/(tabs)/people.tsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf('testID="people-sector-filters"') > source.indexOf('testID="people-composable-filters"'));
  assert.match(source, /setFilter\(EMPTY_COMPOSABLE_RECORD_FILTER\);\s*setSector\('all'\)/);
  assert.match(source, /togglePropertySector\(current, value\)/);
  assert.match(source, /people-filter-\$\{value\}/);
  assert.match(source, /visibleActivityByPerson\.get\(item\.id\)/);
  assert.match(source, /const hasActivePeopleFilters = hasActiveRecordFilters\(filter\) \|\| sector !== 'all'/);
});
