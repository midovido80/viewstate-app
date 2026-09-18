import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiteralText,
  createPrivacyMetadata,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { searchGlobalData, searchTerms } from '../services/globalSearch.ts';
import { createPerson } from '../services/people.ts';

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