import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSeekerRequirement, type Property, type SeekerRequirement } from '@workspace/property-domain';
import {
  getOfferedStudioDetailValues,
  canHydrateStudioRequirement,
  getStudioPropertyEditHref,
  getStudioRequirementEditHref,
  getStudioRequirementFallbackEditHref,
  getWantedStudioContextRows,
  getWantedStudioDisplayRows,
  isOfferedStudio,
  isWantedStudio,
} from '../services/propertyDetailPresentation.ts';
import { resolveSourcePath } from './sourcePath.ts';

const readSource = (path: string) => readFile(resolveSourcePath(path, import.meta.url), 'utf8');

test('Offered Studio is recognized from canonical apartment subtype and omits generic totals', () => {
  const property = {
    core: { propertyType: 'apartment' },
    typeDetails: {
      propertyType: 'apartment',
      apartmentSubtype: 'studio',
      studioRoomCount: 1,
      bedroomCount: 3,
      bathroomCount: 1,
      unitCount: 8,
      floorCount: 4,
      apartmentCount: 6,
      builtUpAreaSquareMeters: 42,
      hasKitchen: true,
      hasBalcony: true,
      hasElevator: true,
    },
  } as unknown as Property;

  assert.equal(isOfferedStudio(property), true);
  const details = getOfferedStudioDetailValues(property.typeDetails as unknown as Record<string, unknown>);
  assert.equal(details.bedroomCount, undefined);
  assert.equal(details.unitCount, undefined);
  assert.equal(details.floorCount, undefined);
  assert.equal(details.apartmentCount, undefined);
  assert.equal(details.studioRoomCount, 1);
  assert.equal(details.bathroomCount, 1);
  assert.equal(details.builtUpAreaSquareMeters, 42);
  assert.equal(details.hasKitchen, true);
  assert.equal(details.hasBalcony, true);
  assert.equal(details.hasElevator, true);
  assert.equal(isOfferedStudio({
    ...property,
    core: { ...property.core, propertyType: 'house' },
  }), false);
});

test('Offered Studio read-only details use canonical actual area wording without a generic duplicate', async () => {
  const source = await readSource('../app/property/[propertyCoreId].tsx');
  assert.match(source, /!offeredStudio && propertyFacts\.areaSquareMeters !== undefined/);
  assert.match(source, /const actualStudioAreaSquareMeters = studioAreaSquareMeters\s*\?\?\s*\(offeredStudio \? readNumericDetail\(detailValues\.builtUpAreaSquareMeters\) : undefined\)/);
  assert.match(source, /const studioAreaSquareMeters = offeredStudio[\s\S]*?property\.areaSquareMeters !== undefined[\s\S]*?property\.areaUnit === 'square_foot'/);
  assert.match(source, /const studioAreaDetails = offeredStudio[\s\S]*?actualStudioAreaSquareMeters !== undefined/);
  assert.match(source, /getStudioCatalogFieldLabel\('areaSquareMeters', 'offered'\)/);
  assert.match(source, /offeredStudio && item\.field === 'builtUpAreaSquareMeters'/);
});

test('Offered Studio details keep zero and false distinct from absent legacy facts', () => {
  const details = getOfferedStudioDetailValues({
    propertyType: 'apartment',
    apartmentSubtype: 'studio',
    studioRoomCount: 1,
    bathroomCount: 0,
    hasKitchen: false,
    unitCount: 1,
    apartmentCount: 1,
    floorCount: 1,
    bathroomsPerUnit: 1,
  });

  assert.equal(details.bathroomCount, 0);
  assert.equal(details.hasKitchen, false);
  assert.equal('hasHall' in details, false);
  assert.equal(details.unitCount, undefined);
  assert.equal(details.apartmentCount, undefined);
  assert.equal(details.floorCount, undefined);
  assert.equal(details.bathroomsPerUnit, undefined);
});

test('Wanted Studio presents a single open-room row and each wanted canonical preference once', () => {
  const requirement = {
    id: 'wanted-studio',
    seekerId: 'seeker',
    propertyType: 'apartment',
    purpose: 'buy',
    preferredAreaIds: [],
    budget: { minimum: 100, maximum: 250, currencyCode: 'KWD' },
    notes: '',
    preferredAmenities: ['balcony', 'elevator'],
    bathroomsMinimum: 1,
    catalogPreferences: [
      { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
      { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 35 },
      { field: 'floorNumber', kind: 'number', comparison: 'exact', value: 2 },
      { field: 'hasKitchen', kind: 'feature', value: true },
      { field: 'hasBalcony', kind: 'feature', value: true },
      { field: 'hasElevator', kind: 'feature', value: true },
    ],
  } as SeekerRequirement;

  assert.equal(isWantedStudio(requirement), true);
  const rows = getWantedStudioDisplayRows(requirement, 'en');
  assert.deepEqual(rows, [
    { field: 'studioRoomCount', label: 'Open room', value: '1' },
    { field: 'bathroomsMinimum', label: 'Minimum bathrooms', value: '1' },
    { field: 'builtUpAreaSquareMeters', label: 'Built-up area (m²)', value: 'At least 35' },
    { field: 'floorNumber', label: 'Floor number', value: '2' },
    { field: 'hasKitchen', label: 'Kitchen', value: 'Yes' },
  ]);
  assert.equal(rows.some(row => row.field === 'bedroomsMinimum'), false);
  assert.equal(rows.filter(row => row.field === 'apartmentSubtype').length, 0);
  assert.equal(rows.some(row => row.field === 'preferredAmenities'), false);
  assert.equal(rows.some(row => row.value.includes('Balcony') || row.value.includes('Elevator')), false);

  const arabicRows = getWantedStudioDisplayRows(requirement, 'ar');
  assert.equal(arabicRows[0].label, 'غرفة مفتوحة');
  assert.equal(arabicRows[2].value, 'الحد الأدنى 35');
});

test('Studio edit entry preserves exact Property identity in the capture route', () => {
  assert.equal(
    getStudioPropertyEditHref('property /exact'),
    '/capture/studio?editPropertyId=property%20%2Fexact',
  );
  assert.equal(
    getStudioRequirementEditHref('requirement /exact'),
    '/capture/studio?editRequirementId=requirement%20%2Fexact',
  );
});

test('Studio Requirement detail shows localized purpose and persisted rental cadence', () => {
  const requirement: Extract<SeekerRequirement, { purpose: 'rent' }> = {
    id: 'studio-context',
    seekerId: 'seeker',
    propertyType: 'apartment',
    purpose: 'rent',
    preferredAreaIds: [],
    budget: { minimum: 100, maximum: 250, currencyCode: 'KWD' },
    notes: '',
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'studio' }],
    rentalPeriodId: 'daily',
  };

  assert.deepEqual(getWantedStudioContextRows(requirement, 'en'), [
    { field: 'purpose', label: 'Purpose', value: 'Rent' },
    { field: 'rentalPeriodId', label: 'Rental cadence', value: 'Daily' },
  ]);
  assert.deepEqual(getWantedStudioContextRows(requirement, 'ar'), [
    { field: 'purpose', label: 'الغرض', value: 'للإيجار' },
    { field: 'rentalPeriodId', label: 'دورية الإيجار', value: 'يومي' },
  ]);
  for (const [period, expected] of [['monthly', 'Monthly'], ['yearly', 'Yearly']] as const) {
    assert.equal(
      getWantedStudioContextRows({ ...requirement, rentalPeriodId: period }, 'en')[1].value,
      expected,
    );
  }
  const { rentalPeriodId: _rentalPeriodId, ...purchaseValues } = requirement;
  const purchaseRequirement: Extract<SeekerRequirement, { purpose: 'buy' }> = {
    ...purchaseValues,
    purpose: 'buy',
  };
  assert.deepEqual(getWantedStudioContextRows(purchaseRequirement, 'en'), [
    { field: 'purpose', label: 'Purpose', value: 'Buy' },
  ]);
});

test('Studio edit uses the dedicated editor only when its reader can hydrate every approved preference', () => {
  const supportedRequirement = {
    id: '11111111-1111-4111-8111-111111111111',
    seekerId: 'seeker-1',
    propertyType: 'apartment',
    purpose: 'buy',
    preferredAreaIds: [],
    preferredAreaMode: 'all_kuwait',
    budget: { minimum: 100, maximum: 250, currencyCode: 'KWD' },
    notes: '',
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'studio' }],
  } as SeekerRequirement;
  assert.equal(canHydrateStudioRequirement(supportedRequirement), true);

  const extendedRequirement = {
    ...supportedRequirement,
    catalogPreferences: [
      ...supportedRequirement.catalogPreferences!,
      { field: 'furnishing', kind: 'choice', value: 'furnished' },
    ],
  } as SeekerRequirement;
  assert.equal(validateSeekerRequirement(extendedRequirement, { isCanonicalAreaId: () => true }).ok, true);
  assert.equal(canHydrateStudioRequirement(extendedRequirement), false);
  assert.equal(
    getStudioRequirementFallbackEditHref(extendedRequirement.id, extendedRequirement.seekerId),
    '/requirement/11111111-1111-4111-8111-111111111111?seekerId=seeker-1&edit=1',
  );
  assert.equal(
    getStudioRequirementEditHref(supportedRequirement.id),
    '/capture/studio?editRequirementId=11111111-1111-4111-8111-111111111111',
  );
});
