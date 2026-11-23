import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { SeekerRequirement } from '@workspace/property-domain';
import { getRequirementDetailsRows } from '../services/requirementDetailsPresentation.ts';
import { resolveSourcePath } from './sourcePath.ts';

const readSource = (path: string) =>
  readFile(resolveSourcePath(path, import.meta.url), 'utf8');

const requirement = (overrides: Partial<SeekerRequirement> = {}): SeekerRequirement => ({
  id: '11111111-1111-4111-8111-111111111111',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaMode: 'all_kuwait',
  preferredAreaIds: [],
  budget: { minimum: 330, maximum: 380, currencyCode: 'KWD' },
  rentalPeriodId: 'monthly',
  notes: '',
  ...overrides,
});

const translate = (key: string) => key;

test('Requirement presentation omits internal, empty, and unspecified preferences without changing explicit false', () => {
  const rows = getRequirementDetailsRows(requirement({
    preferredAmenities: [],
    preferredAmenityExclusions: ['garden'],
  }), 'en', translate);
  for (const hidden of [
    'preferredAmenities',
    'preferredAmenityExclusions',
    'driverRoom',
    'centralAC',
    'swimmingPool',
    'gym',
    'seaView',
    'notes',
  ]) {
    assert.equal(rows.some(row => row.field === hidden), false, `${hidden} is not an ordinary visible fact`);
  }

  const explicitFalse = getRequirementDetailsRows(requirement({ centralAC: false }), 'en', translate)
    .find(row => row.field === 'centralAC');
  assert.equal(explicitFalse?.value, 'No', 'an explicit false remains distinct from an unspecified value');
});

test('Details and Person presentation hide technical identities and consolidate duplicate relationships', async () => {
  const [requirementView, personView] = await Promise.all([
    readSource('../app/requirement/view/[requirementId].tsx'),
    readSource('../app/person/[personId].tsx'),
  ]);

  assert.doesNotMatch(requirementView, /requirement-details-id/);
  assert.doesNotMatch(personView, /toEnglishDigits\(property\.core\.id\)/);
  assert.match(personView, /const sourcedOnly = sourced\.filter/);
  assert.match(personView, /const source = sourced\.find/);
  assert.match(personView, /sourcedOnly\.map/);
  assert.match(personView, /placeholder=\{t\('common\.search'\)\}/);
  assert.match(personView, /accessibilityState=\{\{ checked:/);
  assert.match(personView, /const selected = selectedProperty\?\.core\.id === property\.core\.id/);
  assert.match(personView, /backgroundColor: selected \? '#EFF6FF' : colors\.card/);
});

test('Map and edit-route presentation avoid false errors and technical route headers', async () => {
  const [propertyView, layout] = await Promise.all([
    readSource('../app/property/[propertyCoreId].tsx'),
    readSource('../app/_layout.tsx'),
  ]);

  assert.match(propertyView, /\{\(detailMapsHref \|\| property\.locationEnrichment\?\.coordinates\) \? \(/);
  assert.match(propertyView, /\{mapsActionError \? \(/);
  assert.doesNotMatch(propertyView, /Platform\.OS === 'web' && !detailMapsHref/);
  assert.match(layout, /name="property\/\[propertyCoreId\]\/edit" options=\{\{ headerShown: false \}\}/);
});
