import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person, PropertySource } from '../services/people.ts';
import { getAreaById } from '../constants/kuwait-areas.ts';
import {
  deriveOfferedWantedRows,
  filterOfferedWantedRows,
  formatWantedBudget,
  getOfferedWantedHref,
  getOfferedWantedTransactionLabelKey,
  getWantedAreaDisplayValues,
  loadOfferedWantedPresentation,
} from '../services/offeredWantedPresentation.ts';
import type { OfferedWantedStoreReader } from '../services/offeredWantedPresentation.ts';

const property = (id: string, transaction: 'sale' | 'rent'): Property => ({
  core: {
    id,
    propertyType: 'apartment',
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: `offer-${id}`,
    propertyCoreId: id,
    transaction,
    ...(transaction === 'sale'
      ? { salePrice: { amount: 100, currencyCode: 'KWD' } }
      : { rentalPrice: { amount: 20, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }),
  },
} as Property);

const requirement = (id: string, purpose: 'buy' | 'rent'): SeekerRequirement => ({
  id,
  seekerId: 'seeker-1',
  propertyType: 'apartment',
  preferredAreaIds: ['salmiya'],
  budget: { minimum: 50, maximum: 500, currencyCode: 'KWD' },
  notes: 'near the coast',
  purpose,
  ...(purpose === 'rent' ? { rentalPeriodId: 'monthly' } : {}),
} as SeekerRequirement);

const person: Person = {
  id: 'person-1',
  classifications: ['seeker', 'owner'],
  name: 'Aisha',
  displayPhone: '+965 555 0100',
  normalizedPhone: '+9655550100',
  notes: '',
};

test('offered and wanted rows retain kind-qualified identity, transaction, route, and person target', () => {
  const sameId = 'same /identity';
  const rows = deriveOfferedWantedRows(
    [property(sameId, 'rent')],
    [{ ...requirement(sameId, 'buy'), seekerId: person.id }],
    {
      propertySources: [{ propertyCoreId: sameId, personId: person.id, role: 'owner' }],
      people: [person],
    },
  );

  assert.deepEqual(rows.map(row => [row.key, row.kind, row.transaction, row.href]), [
    ['offered:same /identity', 'offered', 'rent', '/property/same%20%2Fidentity'],
    ['wanted:same /identity', 'wanted', 'buy', '/requirement/same%20%2Fidentity'],
  ]);
  assert.equal(rows[0].person?.id, person.id);
  assert.equal(rows[1].person?.id, person.id);
  assert.equal(rows[1].kind, 'wanted');
  if (rows[1].kind !== 'wanted') return;
  assert.equal(rows[1].requirement.purpose, 'buy');
  assert.equal(rows[1].transaction, 'buy');
  assert.equal(getOfferedWantedTransactionLabelKey(rows[1]), 'transaction.sale');
  assert.equal(getOfferedWantedHref('offered', 'a/b'), '/property/a%2Fb');
  assert.equal(getOfferedWantedHref('wanted', 'a/b'), '/requirement/a%2Fb');
});

test('filters cover All, Offered, Wanted, Sale, Rent and search canonical row content', () => {
  const rows = deriveOfferedWantedRows(
    [property('sale-home', 'sale'), property('rental-home', 'rent')],
    [{ ...requirement('buy-wanted', 'buy'), notes: 'inland' }, requirement('rent-wanted', 'rent')],
    { people: [person] },
  );

  assert.equal(filterOfferedWantedRows(rows, 'all').length, 4);
  assert.deepEqual(filterOfferedWantedRows(rows, 'offered').map(row => row.id), ['sale-home', 'rental-home']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'wanted').map(row => row.id), ['buy-wanted', 'rent-wanted']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'sale').map(row => row.id), ['sale-home', 'buy-wanted']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'rent').map(row => row.id), ['rental-home', 'rent-wanted']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', 'coast').map(row => row.id), ['rent-wanted']);
});

test('derivation is read-only and source associations do not create duplicate property rows', () => {
  const properties = [property('source-property', 'sale')];
  const requirements = [requirement('saved-requirement', 'rent')];
  const sourceRecords: PropertySource[] = [
    { propertyCoreId: 'source-property', personId: person.id, role: 'owner' },
    { propertyCoreId: 'source-property', personId: person.id, role: 'owner' },
  ];
  const beforeProperties = structuredClone(properties);
  const beforeRequirements = structuredClone(requirements);
  const beforeSources = structuredClone(sourceRecords);

  const rows = deriveOfferedWantedRows(properties, requirements, {
    propertySources: sourceRecords,
    people: [person],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows.filter(row => row.kind === 'offered' && row.id === 'source-property').length, 1);
  assert.deepEqual(properties, beforeProperties);
  assert.deepEqual(requirements, beforeRequirements);
  assert.deepEqual(sourceRecords, beforeSources);
});

test('offered search can honor persistence metadata matches while person and wanted matches remain searchable', () => {
  const rows = deriveOfferedWantedRows(
    [property('metadata-match', 'sale')],
    [{ ...requirement('wanted-match', 'buy'), seekerId: person.id }],
    {
      propertySources: [{ propertyCoreId: 'metadata-match', personId: person.id, role: 'owner' }],
      people: [person],
    },
  );

  assert.deepEqual(
    filterOfferedWantedRows(rows, 'all', 'imported metadata phrase', {
      offeredPropertySearchIds: new Set(['metadata-match']),
    }).map(row => row.id),
    ['metadata-match'],
  );
  assert.deepEqual(
    filterOfferedWantedRows(rows, 'all', 'Aisha', {
      offeredPropertySearchIds: new Set(),
    }).map(row => row.id),
    ['metadata-match', 'wanted-match'],
  );
  assert.deepEqual(
    filterOfferedWantedRows(rows, 'all', 'coast', {
      offeredPropertySearchIds: new Set(),
    }).map(row => row.id),
    ['wanted-match'],
  );
});

test('wanted budget display omits absent or non-finite endpoints without formatting undefined', () => {
  const format = (amount: number) => `KWD ${amount}`;
  assert.equal(formatWantedBudget({ minimum: 50, maximum: 500 }, format), 'KWD 50 – KWD 500');
  assert.equal(formatWantedBudget({ minimum: 50 }, format), 'KWD 50');
  assert.equal(formatWantedBudget({ maximum: 500 }, format), 'KWD 500');
  assert.equal(formatWantedBudget({}, format), null);
  assert.equal(formatWantedBudget({ minimum: Number.NaN, maximum: Number.POSITIVE_INFINITY }, format), null);
});

test('wanted area search indexes approved localized area/governorate names and All Kuwait scope', () => {
  const area = getAreaById('salmiya');
  assert.ok(area);
  const allKuwaitRequirement = {
    ...requirement('all-kuwait', 'rent'),
    preferredAreaIds: [],
    preferredAreaMode: 'all_kuwait',
  } as SeekerRequirement;
  const rows = deriveOfferedWantedRows([], [
    requirement('specific-area', 'rent'),
    allKuwaitRequirement,
  ]);

  assert.deepEqual(filterOfferedWantedRows(rows, 'all', area.en).map(row => row.id), ['specific-area']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', area.ar).map(row => row.id), ['specific-area']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', area.governorateEn).map(row => row.id), ['specific-area']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', area.governorateAr).map(row => row.id), ['specific-area']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', 'All Kuwait').map(row => row.id), ['all-kuwait']);
  assert.deepEqual(filterOfferedWantedRows(rows, 'all', 'كل مناطق الكويت').map(row => row.id), ['all-kuwait']);
  assert.deepEqual(getWantedAreaDisplayValues(allKuwaitRequirement, 'en', 'All Kuwait'), ['All Kuwait']);
  assert.deepEqual(getWantedAreaDisplayValues(allKuwaitRequirement, 'ar', 'كل مناطق الكويت'), ['كل مناطق الكويت']);
});

function makePresentationReader(
  overrides: Partial<OfferedWantedStoreReader> = {},
): OfferedWantedStoreReader {
  return {
    getProperties: async () => [property('saved-property', 'sale')],
    getRequirements: async () => [requirement('saved-requirement', 'rent')],
    getPeople: async () => [person],
    getPropertySource: async propertyCoreId => ({
      propertyCoreId,
      personId: person.id,
      role: 'owner',
    }),
    searchProperties: async () => [property('saved-property', 'sale')],
    ...overrides,
  };
}

test('independent reader failures retain available rows and report each unavailable source', async () => {
  const result = await loadOfferedWantedPresentation(makePresentationReader({
    getRequirements: async () => { throw new Error('requirements unavailable'); },
    getPeople: async () => { throw new Error('people unavailable'); },
    getPropertySource: async () => { throw new Error('source unavailable'); },
    searchProperties: async () => { throw new Error('search unavailable'); },
  }), 'coast');

  assert.deepEqual(result.rows.map(row => row.kind), ['offered']);
  assert.deepEqual(result.matchingPropertyIds, []);
  assert.deepEqual(result.errors, {
    properties: false,
    requirements: true,
    people: true,
    sources: true,
    search: true,
  });
  assert.deepEqual(
    filterOfferedWantedRows(result.rows, 'all', 'coast', {
      offeredPropertySearchIds: new Set(result.matchingPropertyIds ?? []),
    }),
    [],
  );
});

test('failed property inventory clears offered rows while independent requirements stay available', async () => {
  const result = await loadOfferedWantedPresentation(makePresentationReader({
    getProperties: async () => { throw new Error('properties unavailable'); },
    searchProperties: async () => [property('search-only', 'sale')],
  }));

  assert.deepEqual(result.rows.map(row => row.kind), ['wanted']);
  assert.deepEqual(result.matchingPropertyIds, null);
  assert.deepEqual(result.errors, {
    properties: true,
    requirements: false,
    people: false,
    sources: false,
    search: false,
  });
});

test('successful metadata-backed property search results are independently exposed by the loader', async () => {
  const result = await loadOfferedWantedPresentation(makePresentationReader({
    searchProperties: async () => [property('metadata-only-match', 'rent')],
  }), 'legacy template text');

  assert.deepEqual(result.matchingPropertyIds, ['metadata-only-match']);
  assert.equal(result.errors.search, false);
});