import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getWantedApartmentSubtypeLabel } from '@/services/propertyDetailPresentation';

const wanted = (subtype: string, propertyType = 'apartment') => ({
  propertyType,
  catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: subtype }],
}) as Parameters<typeof getWantedApartmentSubtypeLabel>[0];

test('wanted apartment subtype labels distinguish Standard Apartment, Studio, and Duplex in English and Arabic', () => {
  assert.equal(getWantedApartmentSubtypeLabel(wanted('standard_apartment'), 'en'), 'Standard Apartment');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('standard_apartment'), 'ar'), 'شقة عادية');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('studio'), 'en'), 'Studio');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('studio'), 'ar'), 'استوديو');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('duplex'), 'en'), 'Duplex');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('duplex'), 'ar'), 'دوبلكس');
});

test('wanted subtype display preserves legacy standard values and omits non-apartment or absent subtypes', () => {
  assert.equal(getWantedApartmentSubtypeLabel(wanted('standard'), 'en'), 'Standard Apartment');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('standard'), 'ar'), 'شقة عادية');
  assert.equal(getWantedApartmentSubtypeLabel(wanted('studio', 'villa'), 'en'), undefined);
  assert.equal(getWantedApartmentSubtypeLabel({
    propertyType: 'apartment',
    catalogPreferences: [],
  } as Parameters<typeof getWantedApartmentSubtypeLabel>[0], 'en'), undefined);
});

test('Person Requirement cards append subtype while retaining Apartment as the property type', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(source, /t\(`propertyType\.\$\{requirement\.propertyType\}`\)\)\}\{getWantedApartmentSubtypeLabel\(requirement, language\)/);
  assert.match(source, /getWantedApartmentSubtypeLabel,\s*\} from '@\/services\/propertyDetailPresentation'/);
});