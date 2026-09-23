import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Requirement correction has one canonical owner for duplicated meanings', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const map = await readFile('services/requirementFieldMap.ts', 'utf8');
  assert.match(source, /preferredAreaMode/);
  assert.match(source, /requirement-all-kuwait/);
  assert.match(source, /requirement-master-bedrooms/);
  assert.match(source, /localizedRequirementIssue/);
  assert.match(source, /getAreaById/);
  assert.match(source, /preferredAmenityExclusions/);
  assert.match(source, /Must not have/);
  assert.match(source, /Not important/);
  assert.match(source, /onExcludedChange/);
  assert.match(map, /'bedroomCount'/);
  assert.match(map, /'bathroomCount'/);
  assert.match(map, /'hasCentralAC'/);
  assert.match(map, /isRequirementCatalogFieldAllowed/);
});

test('Requirement catalog booleans never fall through to free text', async () => {
  const source = await readFile('components/RequirementCatalogPreferences.tsx', 'utf8');
  assert.match(source, /field\.startsWith\('has'\)/);
  assert.match(source, /kind: 'feature'/);
  assert.match(source, /Free-text catalog values/);
});

test('Commercial Floor gates residential controls and exposes typed commercial choices', async () => {
  const [source, map] = await Promise.all([
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
    readFile('services/requirementFieldMap.ts', 'utf8'),
  ]);
  assert.match(source, /coreApplicable &&/);
  assert.match(source, /requirement-driver-room/);
  assert.match(source, /floorUse === 'residential'/);
  assert.match(source, /applicableCoreFields\.has\('parkingSpaceCount'\)/);
  assert.match(source, /applicableCoreFields\.has\('floorNumber'\)/);
  assert.match(source, /applicableCoreFields\.has\('builtUpAreaSquareMeters'\)/);
  assert.match(source, /coreReviewLines/);
  assert.match(source, /showAmenities=\{false\}/);
  assert.match(source, /Floor use/);
  assert.match(source, /localizedPreferenceName/);
  assert.match(source, /step === 1 && propertyType === 'floor' && !floorUse/);
  assert.match(source, /Choose Floor use: Residential or Commercial/);
  assert.match(map, /'intendedUse'/);
  assert.match(map, /'commercialActivity'/);
});