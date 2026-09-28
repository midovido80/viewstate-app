import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLiteralText,
  createPrivacyMetadata,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import {
  searchGlobalData,
  searchGlobalDataWithMatchReasons,
  searchTerms,
} from '../services/globalSearch.ts';
import { createPerson } from '../services/people.ts';
import {
  getPersonActivityMoreLabel,
  getPersonDirectActivityLines,
} from '../services/cardSummaryPresentation.ts';
import type { PersonPropertyLink, PropertySource } from '../services/people.ts';

const firstPerson = createPerson({
  id: 'person-1',
  name: 'Ahmed Al Salem',
  displayPhone: '+٩٦٥ ٥٥٥٠ ١٢٣٤',
  classifications: ['seeker'],
});
const secondPerson = createPerson({
  id: 'person-2',
  name: 'ليلى',
  displayPhone: '+96550001111',
  classifications: ['owner'],
});

function property(id: string, propertyType: Property['core']['propertyType'], areaId: string): Property {
  return {
    core: {
      id,
      propertyType,
      locationArea: { id: areaId },
      description: createLiteralText(
        'Bright balcony',
        createPrivacyMetadata('normal', 'normal'),
      ),
      privateNotes: createLiteralText(
        'never-find-this-private-note',
        createPrivacyMetadata('private_notes', 'never'),
      ),
      exactLocation: createLiteralText(
        'never-find-this-exact-location',
        createPrivacyMetadata('exact_location', 'explicit_per_share'),
      ),
    },
    activeOffer: {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: 'rent',
      rentalPrice: { amount: 650, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
  };
}

const rentRequirement: SeekerRequirement = {
  id: 'requirement-1',
  seekerId: firstPerson.id,
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['salmiya'],
  budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
  notes: 'near school',
};

const data = {
  people: [firstPerson, secondPerson, firstPerson],
  properties: [
    property('property-2', 'villa', 'jabriya'),
    property('property-1', 'apartment', 'salmiya'),
    property('property-1', 'apartment', 'salmiya'),
  ],
  requirements: [rentRequirement, rentRequirement],
};

test('normalizes whitespace, case, Arabic-Indic, and Persian digits into substring terms', () => {
  assert.deepEqual(searchTerms('  AHMED   ٥۵٥٠  '), ['ahmed', '5550']);
});

test('matches every term against fields on the same record and preserves deduplicated input order', () => {
  const phone = searchGlobalData(data, 'Ahmed ٥٥٥٠');
  assert.deepEqual(phone.people.map(person => person.id), ['person-1']);

  const properties = searchGlobalData(data, 'عقار غير موجود');
  assert.deepEqual(properties.properties, []);

  const allVillas = searchGlobalData(data, 'villa');
  assert.deepEqual(allVillas.properties.map(item => item.core.id), ['property-2']);

  const apartments = searchGlobalData(data, 'شقة السالمية');
  assert.deepEqual(apartments.properties.map(item => item.core.id), ['property-1']);
});

test('searches independent Requirements through seeker, purpose, type, area, and notes', () => {
  const english = searchGlobalData(data, 'Ahmed rent school');
  assert.deepEqual(english.requirements.map(item => item.requirement.id), ['requirement-1']);

  const arabic = searchGlobalData(data, 'إيجار شقة السالمية');
  assert.deepEqual(arabic.requirements.map(item => item.requirement.id), ['requirement-1']);
});

test('does not index private notes or exact location fields', () => {
  const describedProperty = property('property-private-description', 'apartment', 'salmiya');
  const privateDescription = {
    ...describedProperty,
    core: {
      ...describedProperty.core,
      description: createLiteralText(
        'never-find-private-description',
        createPrivacyMetadata('private_notes', 'never'),
      ),
    },
  } as Property;
  const privateDescriptionData = { people: [], properties: [privateDescription], requirements: [] };
  assert.deepEqual(searchGlobalData(data, 'never-find-this-private-note').properties, []);
  assert.deepEqual(searchGlobalData(data, 'never-find-this-exact-location').properties, []);
  assert.deepEqual(searchGlobalData(privateDescriptionData, 'never-find-private-description').properties, []);
  assert.deepEqual(searchGlobalData(data, 'Bright balcony').properties.map(item => item.core.id), [
    'property-2',
    'property-1',
  ]);
});

test('does not add Property facts or Requirement preferred amenities to Global Search', () => {
  const amenityProperty = {
    ...property('property-amenity', 'apartment', 'salmiya'),
    typeDetails: { propertyType: 'apartment' as const, hasSolarHeater: true },
  };
  const amenityRequirement: SeekerRequirement = {
    ...rentRequirement,
    id: 'requirement-amenity',
    preferredAmenities: ['security_guard'],
  };
  const amenityData = { ...data, properties: [amenityProperty], requirements: [amenityRequirement] };
  assert.deepEqual(searchGlobalData(amenityData, 'solar heater').properties, []);
  assert.deepEqual(searchGlobalData(amenityData, 'security guard').requirements, []);
});

test('returns distinct empty groups for an empty query', () => {
  assert.deepEqual(searchGlobalData(data, '   '), {
    people: [],
    properties: [],
    requirements: [],
  });
});

test('finds Offered and Wanted Studio records with English, Arabic variants, and bounded typos', () => {
  const offeredStudio = {
    ...property('studio-property', 'apartment', 'salmiya'),
    typeDetails: { apartmentSubtype: 'studio' },
  } as Property;
  const wantedStudio: SeekerRequirement = {
    ...rentRequirement,
    id: 'studio-requirement',
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'studio' }],
  };
  const studioData = {
    ...data,
    properties: [offeredStudio, offeredStudio],
    requirements: [wantedStudio, wantedStudio],
  };
  for (const query of ['studio', 'استوديو', 'ستوديو', 'استديو', 'ستديو', 'ستيديو', 'stduio']) {
    const result = searchGlobalDataWithMatchReasons(studioData, query);
    assert.deepEqual(result.properties.map(item => item.core.id), ['studio-property'], query);
    assert.deepEqual(result.requirements.map(item => item.requirement.id), ['studio-requirement'], query);
  }
  assert.equal(searchGlobalDataWithMatchReasons(studioData, 'ستديو').why.properties.get('studio-property')?.kind, 'alias');
  assert.equal(searchGlobalDataWithMatchReasons(studioData, 'stduio').why.requirements.get('studio-requirement')?.kind, 'fuzzy');
  assert.deepEqual(searchGlobalData(studioData, 'studdxx').properties, [], 'two-edit weak overlap is excluded');
});

test('Global Search shows Studio subtype and omits missing-description fallback while retaining match reasons', async () => {
  const screen = await readFile('app/search.tsx', 'utf8');
  assert.match(screen, /function propertyTitle\([\s\S]*?isOfferedStudio\(property\)[\s\S]*?t\('enrich\.apartment_subtype\.studio'\)/);
  assert.match(screen, /function propertySubtitle\([\s\S]*?property\.core\.description\?\.value\?\.trim\(\)[\s\S]*?matchReasonLabel\(reason, t\)/);
  assert.match(screen, /function requirementSubtitle\([\s\S]*?isWantedStudio\(requirement\) \? \[t\('enrich\.apartment_subtype\.studio'\)\]/);
  assert.match(screen, /subtitle=\{propertySubtitle\(property, results\.why\.properties\.get\(property\.core\.id\)!, t\)\}/);
  assert.doesNotMatch(screen, /search\.property_description_unknown/);
});

test('shop/store Arabic aliases, arbitrary substring and one-character search work without weak overlap', () => {
  const shopProperty = property('shop-property', 'shop', 'salmiya');
  const aliasData = { ...data, properties: [shopProperty] };
  for (const query of ['shop', 'shops', 'store', 'stores', 'sto', 'محل', 'محلات', 'متجر', 'متاجر', 'دكان']) {
    assert.deepEqual(searchGlobalData(aliasData, query).properties.map(item => item.core.id), ['shop-property'], query);
  }
  assert.equal(searchGlobalDataWithMatchReasons(aliasData, 'store').why.properties.get('shop-property')?.kind, 'alias');
  assert.equal(searchGlobalDataWithMatchReasons(aliasData, 'sto').why.properties.get('shop-property')?.kind, 'alias');

  const people = [
    createPerson({ id: 'substring', name: 'Jessie', displayPhone: '50000000', classifications: ['owner'] }),
    createPerson({ id: 'prefix', name: 'Sam', displayPhone: '50000001', classifications: ['owner'] }),
    createPerson({ id: 'exact', name: 's', displayPhone: '50000002', classifications: ['owner'] }),
  ];
  const ranked = searchGlobalDataWithMatchReasons({ people, properties: [], requirements: [] }, 's');
  assert.deepEqual(ranked.people.map(person => person.id), ['exact', 'prefix', 'substring']);
  assert.equal(ranked.why.people.get('exact')?.kind, 'exact');
  assert.equal(ranked.why.people.get('prefix')?.kind, 'prefix');
  assert.equal(ranked.why.people.get('substring')?.kind, 'substring');
  assert.equal(searchGlobalData({ people: [], properties: [], requirements: [] }, 'stadium').people.length, 0);
});

test('Arabic normalization matches diacritics, alef/ya variants, Persian keyboard letters, and one-character queries', () => {
  const arabicPerson = createPerson({
    id: 'arabic-normalized',
    name: 'إِبراهيم',
    displayPhone: '55500000',
    classifications: ['owner'],
  });
  const arabicData = { people: [arabicPerson], properties: [], requirements: [] };
  assert.deepEqual(searchGlobalData(arabicData, 'اب').people.map(person => person.id), ['arabic-normalized']);
  assert.deepEqual(searchGlobalData(arabicData, 'إبراهيم').people.map(person => person.id), ['arabic-normalized']);
  assert.equal(searchGlobalDataWithMatchReasons(arabicData, 'إبراهيم').why.people.get(arabicPerson.id)?.kind, 'exact');
  assert.equal(searchGlobalDataWithMatchReasons(arabicData, 'اب').why.people.get(arabicPerson.id)?.kind, 'prefix');
  assert.equal(searchGlobalDataWithMatchReasons(arabicData, 'را').why.people.get(arabicPerson.id)?.kind, 'substring');
  assert.equal(searchGlobalDataWithMatchReasons(arabicData, 'ه').why.people.get(arabicPerson.id)?.kind, 'substring');

  const areaProperty = property('persian-area', 'apartment', 'kaifan');
  const areaData = { people: [], properties: [areaProperty], requirements: [] };
  assert.deepEqual(searchGlobalData(areaData, 'كيفان').properties.map(item => item.core.id), ['persian-area']);
  assert.deepEqual(searchGlobalData(areaData, 'کیف').properties.map(item => item.core.id), ['persian-area']);
  assert.deepEqual(searchTerms('کيف ۱۲٣'), ['كيف', '123']);
  const salmiyaData = { people: [], properties: [property('ta-marbuta-area', 'apartment', 'salmiya')], requirements: [] };
  assert.deepEqual(searchGlobalData(salmiyaData, 'السالميه').properties.map(item => item.core.id), ['ta-marbuta-area']);
});

test('Studio English and Arabic spellings, plural and partial variants find offered and wanted studios', () => {
  const offeredStudio = {
    ...property('alias-studio-property', 'apartment', 'salmiya'),
    typeDetails: { apartmentSubtype: 'studio' },
  } as Property;
  const wantedStudio: SeekerRequirement = {
    ...rentRequirement,
    id: 'alias-studio-requirement',
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'studio' }],
  };
  const studioData = { people: [firstPerson], properties: [offeredStudio], requirements: [wantedStudio] };
  for (const query of ['studio', 'studios', 'stud', 'استوديو', 'ستوديو', 'استديو', 'ستديو', 'ستيديو', 'استوديوهات']) {
    const result = searchGlobalData(studioData, query);
    assert.deepEqual(result.properties.map(item => item.core.id), ['alias-studio-property'], query);
    assert.deepEqual(result.requirements.map(item => item.requirement.id), ['alias-studio-requirement'], query);
  }
});

test('ranks exact above prefix and substring, and a better conflicting duplicate ID replaces a weaker match', () => {
  const duplicateFirst = createPerson({
    id: 'same-person-id',
    name: 'Samantha',
    displayPhone: '50000000',
    classifications: ['owner'],
  });
  const duplicateBest = createPerson({
    id: 'same-person-id',
    name: 'Sam',
    displayPhone: '50000001',
    classifications: ['seeker'],
  });
  const people = [
    createPerson({ id: 'substring-first', name: 'Assam', displayPhone: '50000002', classifications: ['owner'] }),
    createPerson({ id: 'prefix-second', name: 'Samuel', displayPhone: '50000003', classifications: ['owner'] }),
    duplicateFirst,
    duplicateBest,
    createPerson({ id: 'exact-last', name: 'sam', displayPhone: '50000004', classifications: ['owner'] }),
  ];
  const result = searchGlobalDataWithMatchReasons({ people, properties: [], requirements: [] }, 'sam');
  assert.deepEqual(result.people.map(person => person.id), [
    'same-person-id',
    'exact-last',
    'prefix-second',
    'substring-first',
  ]);
  assert.equal(result.people[0], duplicateBest, 'dedup keeps the duplicate record with the strongest match');
  assert.deepEqual(result.why.people.get('same-person-id'), { kind: 'exact', field: 'name' });
  assert.deepEqual(result.why.people.get('prefix-second'), { kind: 'prefix', field: 'name' });
  assert.deepEqual(result.why.people.get('substring-first'), { kind: 'substring', field: 'name' });
});

test('match reasons identify the matched fields for people, properties and requirements', () => {
  const propertyItem = property('property-id-42', 'apartment', 'salmiya');
  const requirement: SeekerRequirement = { ...rentRequirement, id: 'requirement-field-check' };
  const matchData = { people: [firstPerson], properties: [propertyItem], requirements: [requirement] };
  const phone = searchGlobalDataWithMatchReasons(matchData, '5501');
  assert.deepEqual(phone.why.people.get(firstPerson.id), { kind: 'substring', field: 'phone' });
  const identifier = searchGlobalDataWithMatchReasons(matchData, 'property-id-42');
  assert.deepEqual(identifier.why.properties.get(propertyItem.core.id), { kind: 'exact', field: 'identifier' });
  const requirementMatch = searchGlobalDataWithMatchReasons(matchData, 'school');
  assert.deepEqual(requirementMatch.why.requirements.get(requirement.id), { kind: 'exact', field: 'notes' });
  const arabic = searchGlobalDataWithMatchReasons(matchData, 'إيجار');
  assert.deepEqual(arabic.why.requirements.get(requirement.id), { kind: 'exact', field: 'requirement' });
});

test('search screen distinguishes an empty local database from a query with no hits and navigates to exact detail routes', async () => {
  const screen = await readFile('app/search.tsx', 'utf8');
  assert.match(screen, /!hasRecords \?[\s\S]*?testID="search-empty"[\s\S]*?!hasQuery \?[\s\S]*?!hasResults \?[\s\S]*?testID="search-no-results"/);
  assert.match(screen, /router\.push\(`\/person\/\$\{encodeURIComponent\(person\.id\)\}` as never\)/);
  assert.match(screen, /router\.push\(`\/property\/\$\{encodeURIComponent\(property\.core\.id\)\}` as never\)/);
  assert.match(screen, /pathname: '\/requirement\/view\/\[requirementId\]'[\s\S]*?params: \{ requirementId: requirement\.id \}/);
  assert.match(screen, /matchReasonLabel\(results\.why\.people\.get\(person\.id\)!, t\)/);
  assert.match(screen, /propertySubtitle\(property, results\.why\.properties\.get\(property\.core\.id\)!, t\)/);
  assert.match(screen, /matchReasonLabel\(results\.why\.requirements\.get\(requirement\.id\)!, t\)/);
  const translations = await readFile('contexts/I18nContext.tsx', 'utf8');
  for (const key of ['exact', 'prefix', 'substring', 'alias', 'fuzzy', 'name', 'phone', 'type', 'area', 'description', 'requirement', 'notes']) {
    const bilingualKeys = translations.match(new RegExp(`'search\\.match\\.${key}':`, 'g')) ?? [];
    assert.equal(bilingualKeys.length, 2, `English and Arabic match labels exist for ${key}`);
  }
  const peopleTab = await readFile('app/(tabs)/people.tsx', 'utf8');
  assert.match(peopleTab, /store\.searchPeople\(search\)/, 'the People tab keeps its existing name/phone-scoped lookup');
  assert.doesNotMatch(peopleTab, /searchGlobalData/);
});

test('Person activity read model deduplicates linked/source offers, preserves exact request links and derives no private notes', () => {
  const personId = firstPerson.id;
  const offered = property('offer / exact', 'villa', 'jabriya');
  const requirements = [
    { ...rentRequirement, id: 'request / one', seekerId: personId },
    { ...rentRequirement, id: 'request-two', seekerId: personId, purpose: 'buy' as const },
    { ...rentRequirement, id: 'request-three', seekerId: personId },
  ];
  const links: PersonPropertyLink[] = [
    { personId, propertyCoreId: offered.core.id },
    { personId, propertyCoreId: offered.core.id },
  ];
  const sources: PropertySource[] = [
    { personId, propertyCoreId: offered.core.id, role: 'owner' },
  ];
  const lines = getPersonDirectActivityLines(
    personId,
    [offered],
    requirements,
    links,
    sources,
    {
      language: 'en',
      translate: (key: string) => key === 'propertyType.villa' ? 'Villa'
        : key === 'transaction.rent' ? 'Rent'
          : key === 'transaction.sale' ? 'Sale'
            : key,
      formatPrice: (amount: number) => `${amount} KWD`,
      formatRentalPrice: (amount: number) => `${amount} KWD/month`,
    },
  );

  assert.deepEqual(lines.slice(0, 2).map(line => line.kind), ['request', 'offer']);
  assert.equal(lines.filter(line => line.kind === 'offer').length, 1, 'a linked and sourced property is one activity');
  assert.equal(lines[0]?.href, '/requirement/view/request%20%2F%20one');
  assert.equal(lines[1]?.href, '/property/offer%20%2F%20exact');
  assert.match(lines[0]?.label ?? '', /Requests · Rent/);
  assert.match(lines[1]?.label ?? '', /Offers · Rent · Villa/);
  assert.equal(getPersonActivityMoreLabel(lines.length - 2, 'en'), '+2 more');
  assert.equal(getPersonActivityMoreLabel(lines.length - 2, 'ar'), '+2 أخرى');
  assert.doesNotMatch(lines.map(line => line.label).join(' '), /never-find-this-private-note/);
});

test('People cards render only two activity lines, navigate exact children without parent presses, refresh on focus/search, and omit private notes', async () => {
  const screen = await readFile('app/(tabs)/people.tsx', 'utf8');
  assert.match(screen, /getPersonDirectActivityLines\(person\.id, properties, requirements, links, sources, formatters\)/);
  assert.match(screen, /\(activityByPerson\.get\(item\.id\) \?\? \[\]\)\.slice\(0,\s*2\)/);
  assert.match(screen, /activityByPerson\.get\(item\.id\)!\.length - 2/);
  assert.match(screen, /onPress=\{event => \{\s*event\.stopPropagation\(\);\s*router\.push\(line\.href as never\);/);
  assert.match(screen, /onPress=\{\(\) => router\.push\(`\/person\/\$\{encodeURIComponent\(item\.id\)\}` as never\)\}/);
  assert.match(screen, /useFocusEffect\(useCallback\(/);
  assert.match(screen, /store\.getProperties\(\), store\.getRequirements\(\),\s*store\.getPersonPropertyLinks\(\)/);
  assert.match(screen, /setActivityByPerson\(activity\)/);
  assert.match(screen, /\[search, t, language\]\)/, 'editing the search reruns the current focus read');
  assert.doesNotMatch(screen, /privateNotes|item\.notes|person\.notes/);
});