import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person, PersonPropertyLink, PropertySource } from '../services/people.ts';
import { getAreaById } from '../constants/kuwait-areas.ts';
import {
  deriveOfferedWantedRows,
  filterOfferedWantedRows,
  createOfferedWantedLoadCoordinator,
  formatWantedBudget,
  getOfferedWantedHref,
  getOfferedWantedTransactionLabelKey,
  getWantedAreaDisplayValues,
  loadOfferedWantedPresentation,
} from '../services/offeredWantedPresentation.ts';
import type { OfferedWantedStoreReader } from '../services/offeredWantedPresentation.ts';
import {
  getPersonActivityMoreLabel,
  getPersonDirectActivityLines,
  getPropertyCardSummary,
  getRequirementCardSummary,
} from '../services/cardSummaryPresentation.ts';

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
    ['wanted:same /identity', 'wanted', 'buy', '/requirement/view/same%20%2Fidentity'],
  ]);
  assert.equal(rows[0].person?.id, person.id);
  assert.equal(rows[1].person?.id, person.id);
  assert.equal(rows[1].kind, 'wanted');
  if (rows[1].kind !== 'wanted') return;
  assert.equal(rows[1].requirement.purpose, 'buy');
  assert.equal(rows[1].transaction, 'buy');
  assert.equal(getOfferedWantedTransactionLabelKey(rows[1]), 'transaction.sale');
  assert.equal(getOfferedWantedHref('offered', 'a/b'), '/property/a%2Fb');
  assert.equal(getOfferedWantedHref('wanted', 'a/b'), '/requirement/view/a%2Fb');
});

test('offered cards resolve linked Person when no source exists, with source taking precedence', () => {
  const secondPerson = { ...person, id: 'person-2', name: 'Bilal' };
  const rows = deriveOfferedWantedRows(
    [property('linked-property', 'sale'), property('source-property', 'rent')],
    [],
    {
      propertyLinks: [
        { personId: secondPerson.id, propertyCoreId: 'linked-property' },
        { personId: secondPerson.id, propertyCoreId: 'source-property' },
      ],
      propertySources: [{ personId: person.id, propertyCoreId: 'source-property', role: 'owner' }],
      people: [person, secondPerson],
    },
  );
  assert.equal(rows[0]?.person?.id, secondPerson.id);
  assert.deepEqual(rows[1]?.personTargets?.map(target => target.id), [person.id, secondPerson.id]);
  assert.equal(rows[1]?.person?.id, person.id, 'the source Person is the primary card target');
});

test('shared card summaries derive localized property and Requirement facts without private data', () => {
  const formatters = {
    language: 'en' as const,
    translate: (key: string) => ({
      'propertyType.apartment': 'Apartment',
      'transaction.sale': 'Sale',
      'transaction.rent': 'Rent',
      'enrich.apartment_subtype.studio': 'Studio',
      'properties.all_kuwait': 'All Kuwait',
    }[key] ?? key),
    formatPrice: (amount: number, currency: string) => `${amount} ${currency}`,
    formatRentalPrice: (amount: number, currency: string, period?: string) => `${amount} ${currency} ${period ?? ''}`.trim(),
  };
  const studioOffer = {
    ...property('studio-offer', 'rent'),
    typeDetails: { apartmentSubtype: 'studio', builtUpAreaSquareMeters: 42 },
    core: { ...property('studio-offer', 'rent').core, privateNotes: { value: 'private' } },
  } as Property;
  assert.deepEqual(getPropertyCardSummary(studioOffer, formatters), {
    typeLabel: 'Apartment',
    subtypeLabel: 'Studio',
    transactionLabel: 'Rent',
    areaLabel: 'Salmiya',
    studioAreaLabel: 'Actual Studio area (m²): 42',
    valueLabel: '20 KWD monthly',
  });
  assert.equal(JSON.stringify(getPropertyCardSummary(studioOffer, formatters)).includes('private'), false);
  const editedStudioOffer = {
    ...studioOffer,
    areaSquareMeters: 48,
    areaUnit: 'square_meter',
    typeDetails: { apartmentSubtype: 'studio', builtUpAreaSquareMeters: 42 },
  } as Property;
  assert.equal(
    getPropertyCardSummary(editedStudioOffer, formatters).studioAreaLabel,
    'Actual Studio area (m²): 48',
    'canonical top-level Studio area takes precedence over stale type details',
  );
  const studioRequest = {
    ...requirement('studio-request', 'rent'),
    preferredAreaMode: 'all_kuwait' as const,
    preferredAreaIds: [],
    catalogPreferences: [
      { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
      { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 35 },
    ],
  } as SeekerRequirement;
  assert.deepEqual(getRequirementCardSummary(studioRequest, formatters), {
    typeLabel: 'Apartment',
    subtypeLabel: 'Studio',
    transactionLabel: 'Rent',
    areaLabel: 'All Kuwait',
    studioAreaLabel: 'Minimum Studio area (m²): 35',
    valueLabel: '50 KWD – 500 KWD',
  });
  const arabicFormatters = {
    ...formatters,
    language: 'ar' as const,
    translate: (key: string) => ({
      'propertyType.apartment': 'شقة',
      'transaction.rent': 'للإيجار',
      'enrich.apartment_subtype.studio': 'استوديو',
      'properties.all_kuwait': 'كل الكويت',
    }[key] ?? key),
  };
  const arabic = getRequirementCardSummary(studioRequest, arabicFormatters);
  assert.equal(arabic.typeLabel, 'شقة');
  assert.equal(arabic.subtypeLabel, 'استوديو');
  assert.equal(arabic.transactionLabel, 'للإيجار');
  assert.equal(arabic.areaLabel, 'كل الكويت');
  assert.equal(arabic.studioAreaLabel, 'الحد الأدنى لمساحة الاستوديو (م²): 35');
  assert.equal(
    getPropertyCardSummary(studioOffer, arabicFormatters).studioAreaLabel,
    'مساحة الاستوديو الفعلية (م²): 42',
  );
});

test('Person activity comes from exact linked/source and Requirement identity, deduplicates offers, and caps compact output', () => {
  const offer = {
    ...property('offer / exact', 'sale'),
    areaSquareMeters: 42,
    areaUnit: 'square_meter',
    typeDetails: { apartmentSubtype: 'studio' },
  } as Property;
  const duplicateLink: PersonPropertyLink[] = [
    { personId: person.id, propertyCoreId: offer.core.id },
    { personId: person.id, propertyCoreId: offer.core.id },
  ];
  const reqs = [
    { ...requirement('request-1', 'rent'), seekerId: person.id },
    { ...requirement('request-2', 'buy'), seekerId: person.id },
  ];
  const formatters = {
    language: 'en' as const,
    translate: (key: string) => key.endsWith('.apartment') ? 'Apartment'
      : key === 'enrich.apartment_subtype.studio' ? 'Studio'
      : key.endsWith('.rent') ? 'Rent'
        : key.endsWith('.sale') ? 'Sale' : key,
    formatPrice: (amount: number) => `KWD ${amount}`,
    formatRentalPrice: (amount: number) => `KWD ${amount}/month`,
  };
  const lines = getPersonDirectActivityLines(
    person.id,
    [offer],
    reqs,
    duplicateLink,
    [{ personId: person.id, propertyCoreId: offer.core.id, role: 'owner' }],
    formatters,
  );
  assert.deepEqual(lines.map(line => [line.kind, line.id, line.href]), [
    ['request', 'request-1', '/requirement/view/request-1'],
    ['offer', 'offer / exact', '/property/offer%20%2F%20exact'],
    ['request', 'request-2', '/requirement/view/request-2'],
  ]);
  assert.match(lines[0]!.label, /Requests · Rent · Apartment · Salmiya · KWD 50 – KWD 500/);
  assert.match(lines[1]!.label, /Offers · Sale · Apartment · Studio · Salmiya · Actual Studio area \(m²\): 42 · KWD 100/);
  assert.equal(getPersonActivityMoreLabel(lines.length - 2, 'en'), '+1 more');
  assert.equal(getPersonActivityMoreLabel(lines.length - 2, 'ar'), '+1 أخرى');
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
    getPersonPropertyLinks: async () => [],
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
    links: false,
    search: true,
  });
  assert.deepEqual(
    filterOfferedWantedRows(result.rows, 'all', 'coast', {
      offeredPropertySearchIds: new Set(result.matchingPropertyIds ?? []),
    }),
    [],
  );
});

test('focus refresh keeps the canonical saved row once, preserves distinct IDs, and ignores stale loads', async () => {
  let releaseStaleRead!: (records: Property[]) => void;
  const staleProperties = new Promise<Property[]>(resolve => { releaseStaleRead = resolve; });
  let inventory = [
    property('saved-after-view', 'sale'),
    property('saved-after-view', 'rent'),
    property('another-distinct-record', 'rent'),
  ];
  const reader = makePresentationReader({
    getProperties: async () => inventory,
    getRequirements: async () => [
      requirement('same-kind-qualified-id', 'buy'),
      requirement('same-kind-qualified-id', 'rent'),
    ],
  });
  const coordinator = createOfferedWantedLoadCoordinator();

  // A prior focus load is still waiting when the screen blurs.
  const staleSequence = coordinator.begin();
  const staleLoad = loadOfferedWantedPresentation({
    ...reader,
    getProperties: async () => staleProperties,
  });
  coordinator.invalidate(staleSequence);

  // Returning from View Property reads the canonical store snapshot again.
  inventory = [
    property('saved-after-view', 'sale'),
    property('saved-after-view', 'rent'),
    property('another-distinct-record', 'rent'),
  ];
  const focusedSequence = coordinator.begin();
  const focusedResult = await loadOfferedWantedPresentation(reader);
  let displayedRows: typeof focusedResult.rows = [];
  if (coordinator.isCurrent(focusedSequence)) displayedRows = focusedResult.rows;

  releaseStaleRead([property('old-snapshot-only', 'sale')]);
  const staleResult = await staleLoad;
  if (coordinator.isCurrent(staleSequence)) displayedRows = staleResult.rows;

  assert.equal(displayedRows.filter(row => row.kind === 'offered' && row.id === 'saved-after-view').length, 1);
  assert.equal(displayedRows.filter(row => row.kind === 'offered' && row.id === 'another-distinct-record').length, 1);
  assert.equal(displayedRows.filter(row => row.kind === 'wanted' && row.id === 'same-kind-qualified-id').length, 1);
  assert.equal(
    filterOfferedWantedRows(displayedRows, 'all', '').length,
    3,
    'empty search and All show each exact record once while retaining distinct records',
  );
  assert.equal(displayedRows.some(row => row.id === 'old-snapshot-only'), false);
});

test('presentation loader attaches live links as well as sources and surfaces link-read failures', async () => {
  const linked = await loadOfferedWantedPresentation(makePresentationReader({
    getPropertySource: async () => null,
    getPersonPropertyLinks: async () => [{ personId: person.id, propertyCoreId: 'saved-property' }],
  }));
  assert.equal(linked.rows.find(row => row.kind === 'offered')?.person?.id, person.id);
  assert.equal(linked.errors.links, false);

  const failed = await loadOfferedWantedPresentation(makePresentationReader({
    getPropertySource: async () => null,
    getPersonPropertyLinks: async () => { throw new Error('links unavailable'); },
  }));
  assert.equal(failed.rows.find(row => row.kind === 'offered')?.person, undefined);
  assert.equal(failed.errors.links, true);
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
    links: false,
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

test('Properties list distinguishes loading, empty inventory, and filtered no-match states', async () => {
  const [screen, messages] = await Promise.all([
    readFile('app/(tabs)/properties.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  assert.match(screen, /setLoadResult\(null\)/);
  assert.match(screen, /loadResult === null \? \(\s*<ActivityIndicator/);
  assert.match(screen, /rows\.length === 0 \? 'properties\.empty_all' : 'properties\.no_matches'/);
  assert.match(messages, /'properties\.empty_all': 'No properties or Requirements saved yet\.'/);
  assert.match(messages, /'properties\.no_matches': 'No properties or Requirements match this search or filter\.'/);
  assert.match(messages, /'properties\.empty_all': 'لم يتم حفظ عقارات أو متطلبات بعد\.'/);
});