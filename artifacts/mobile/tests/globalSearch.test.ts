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
  assert.deepEqual(searchGlobalData(data, 'never-find-this-private-note').properties, []);
  assert.deepEqual(searchGlobalData(data, 'never-find-this-exact-location').properties, []);
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
  for (const query of ['shop', 'store', 'محل', 'محلات']) {
    assert.deepEqual(searchGlobalData(aliasData, query).properties.map(item => item.core.id), ['shop-property'], query);
  }
  assert.equal(searchGlobalDataWithMatchReasons(aliasData, 'store').why.properties.get('shop-property')?.kind, 'alias');

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