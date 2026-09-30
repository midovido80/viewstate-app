import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { SeekerRequirement } from '@workspace/property-domain';
import { getRequirementDetailIdentity, getRequirementDetailsRows } from '../services/requirementDetailsPresentation.ts';
import { getStudioRequirementEditHref } from '../services/propertyDetailPresentation.ts';
import { getRequirementEditFormTarget } from '../services/propertyFormRoutes.ts';
import { projectRequirementIntent } from '../services/recordIntentPresentation.ts';
import { resolveSourcePath } from './sourcePath.ts';

const readSource = (path: string) =>
  readFile(resolveSourcePath(path, import.meta.url), 'utf8');

const translate = (key: string) => ({
  'requirements.purpose.rent': 'Rent',
  'requirements.purpose.buy': 'Buy',
  'propertyType.whole_building': 'Whole building',
  'propertyType.apartment': 'Apartment',
  'matching.occupancy.any': 'Any',
}[key] ?? key);

const wholeBuildingRequirement = (purpose: 'rent' | 'buy', id: string): SeekerRequirement => ({
  id,
  seekerId: 'person-exact',
  purpose,
  propertyType: 'whole_building',
  preferredAreaMode: 'specific_areas',
  preferredAreaIds: ['salmiya', 'hawalli'],
  budget: { minimum: 0, maximum: 900_000, currencyCode: 'KWD' },
  notes: 'Saved as written',
  catalogPreferences: [
    { field: 'plotAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 0 },
    { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 1200 },
    { field: 'hasWaterfront', kind: 'feature', value: false },
  ],
  ...(purpose === 'rent' ? { rentalPeriodId: 'monthly' as const, occupancy: 'any' as const } : {}),
});

const wantedStudio = (purpose: 'rent' | 'buy', id: string): SeekerRequirement => ({
  id,
  seekerId: 'person-exact',
  purpose,
  propertyType: 'apartment',
  preferredAreaMode: 'all_kuwait',
  preferredAreaIds: [],
  budget: { minimum: 0, maximum: 600, currencyCode: 'KWD' },
  notes: '',
  bathroomsMinimum: 0,
  centralAC: false,
  catalogPreferences: [
    { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
    { field: 'hasKitchen', kind: 'feature', value: false },
    { field: 'hasHall', kind: 'feature', value: true },
    { field: 'hasParking', kind: 'feature', value: false },
    { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 0 },
    { field: 'furnishing', kind: 'choice', value: 'semi_furnished' },
  ],
  ...(purpose === 'rent' ? {
    rentalPeriodId: 'yearly' as const,
    occupancy: 'family' as const,
    swimmingPool: false,
    gym: true,
    seaView: false,
  } : {}),
});

const rowsFor = (record: SeekerRequirement, language: 'en' | 'ar' = 'en') =>
  getRequirementDetailsRows(record, language, key => language === 'ar' ? ({
    'requirements.purpose.rent': 'للإيجار',
    'requirements.purpose.buy': 'للشراء',
    'propertyType.whole_building': 'مبنى كامل',
    'propertyType.apartment': 'شقة',
    'matching.occupancy.any': 'الكل',
  }[key] ?? key) : translate(key));
const row = (record: SeekerRequirement, field: string, language: 'en' | 'ar' = 'en') => {
  const matches = rowsFor(record, language).filter(item => item.field === field);
  assert.equal(matches.length, 1, `${field} is represented exactly once`);
  return matches[0]!;
};

test('Requirement Details and Review use the canonical Wanted intent without a Sale fallback', async () => {
  const details = await readSource('../app/requirement/view/[requirementId].tsx');
  const review = await readSource('../app/requirement/[requirementId].tsx');
  assert.equal(projectRequirementIntent({ purpose: 'buy' }, 'en').label, 'Purchase Request');
  assert.equal(projectRequirementIntent({ purpose: 'rent' }, 'ar').label, 'طلب استئجار');
  assert.deepEqual(projectRequirementIntent({ purpose: 'sale' } as unknown as SeekerRequirement, 'en'), {
    id: 'conflict',
    label: 'Record intent conflict',
    valid: false,
  });
  assert.match(details, /projectRequirementIntent\(record, language\)/);
  assert.match(details, /row\.field === 'purpose'[\s\S]*requirementIntent!\.label/);
  assert.match(details, /requirementIntent\?\.label[\s\S]*propertyType\.\$\{record\.propertyType\}/);
  assert.match(review, /projectRequirementIntent\(\{ purpose \}, language\)\.label/);
  assert.doesNotMatch(review, /purpose === 'rent' \? label\('Rent', 'إيجار'\) : label\('Buy', 'شراء'\)/);
});

test('Person View and Edit actions retain the exact saved Requirement identity', async () => {
  const person = await readSource('../app/person/[personId].tsx');
  const requirementRoute = await readSource('../app/requirement/[requirementId].tsx');
  assert.match(person, /pathname:\s*'\/requirement\/view\/\[requirementId\]',\s*params:\s*\{\s*requirementId:\s*requirement\.id\s*\}/);
  assert.match(person, /pathname:\s*'\/requirement\/\[requirementId\]',\s*params:\s*\{\s*requirementId:\s*requirement\.id,\s*seekerId:\s*person\.id\s*\}/);
  assert.match(person, /testID=\{`requirement-view-\$\{requirement\.id\}`\}/);
  assert.match(person, /testID=\{`requirement-edit-\$\{requirement\.id\}`\}/);
  assert.match(requirementRoute, /getStudioRequirementRouteTarget\(/);
  assert.match(requirementRoute, /getRequirementEditFormTarget\(requirementId/);
  assert.deepEqual(
    getRequirementEditFormTarget('requirement / exact', 'seeker / exact', true, true),
    { kind: 'studio', href: '/capture/studio?editRequirementId=requirement%20%2F%20exact' },
  );
  assert.deepEqual(
    getRequirementEditFormTarget('requirement / exact', 'seeker / exact', false, true),
    { kind: 'generic', href: '/requirement/requirement%20%2F%20exact?seekerId=seeker%20%2F%20exact&edit=1' },
  );
});

test('saved Studio View remains a View route and Edit forwards its exact id', async () => {
  const person = await readSource('../app/person/[personId].tsx');
  const view = await readSource('../app/requirement/view/[requirementId].tsx');
  assert.match(person, /pathname:\s*'\/requirement\/view\/\[requirementId\]'/);
  assert.match(person, /getStudioRequirementEditHref\(requirement\.id\)/);
  assert.match(view, /getStudioRequirementEditHref\(record\.id\)/);
  assert.match(view, /canHydrateStudioRequirement\(record\)/);
  assert.equal(getStudioRequirementEditHref('studio / exact'), '/capture/studio?editRequirementId=studio%20%2F%20exact');
});

test('read-only details load the exact route id and provide deterministic Person, Home, and Edit actions', async () => {
  const view = await readSource('../app/requirement/view/[requirementId].tsx');
  assert.equal(getRequirementDetailIdentity('saved-id'), 'saved-id');
  assert.equal(getRequirementDetailIdentity(['saved-id', 'ignored']), null, 'ambiguous deep link cannot select an arbitrary record');
  assert.equal(getRequirementDetailIdentity('new'), null);
  assert.equal(getRequirementDetailIdentity('  '), null);
  assert.match(view, /useLocalSearchParams<\{ requirementId\?: string \| string\[\]; link\?: string \| string\[\] \}>/);
  assert.match(view, /useFocusEffect/);
  assert.match(view, /store\.getRequirement\(id\)/);
  assert.match(view, /\}, \[id, attempt\]\)\)/);
  assert.match(view, /saved\?\.id === id/);
  assert.match(view, /router\.replace\(`\/person\/\$\{encodeURIComponent\(record\.seekerId\)\}`/);
  assert.match(view, /router\.replace\('\/'/);
  assert.match(view, /router\.push\(href as never\)/);
  assert.match(view, /requirement-details-back/);
  assert.match(view, /requirement-details-home/);
  assert.match(view, /requirement-details-edit/);
  assert.doesNotMatch(view, /normalizeSeekerRequirement|saveRequirement|updateRequirement|autosave|Draft/);
  assert.doesNotMatch(view, /RequirementCatalogPreferences|TextInput|onChangeText/);
});

test('whole-building Rent rows include saved catalog values once, preserving zero and false', () => {
  const requirement = wholeBuildingRequirement('rent', 'rent-building');
  const before = structuredClone(requirement);
  const fields = rowsFor(requirement).map(item => item.field);
  for (const field of [
    'purpose', 'propertyType', 'rentalPeriodId', 'occupancy', 'preferredAreaMode',
    'preferredAreaIds', 'plotAreaSquareMeters', 'builtUpAreaSquareMeters',
    'hasWaterfront', 'swimmingPool', 'gym', 'seaView', 'budget.minimum',
    'budget.maximum', 'notes',
  ]) assert.equal(fields.filter(value => value === field).length, 1, `${field} appears once`);
  assert.equal(row(requirement, 'plotAreaSquareMeters').value, 'At least 0');
  assert.equal(row(requirement, 'hasWaterfront').value, 'No');
  assert.equal(row(requirement, 'budget.minimum').value, '0 KWD');
  assert.equal(fields.includes('bedroomsMinimum'), false, 'whole buildings do not acquire apartment bedroom criteria');
  assert.equal(row(requirement, 'preferredAreaIds').value, 'Salmiya → Hawalli');
  assert.deepEqual(requirement, before, 'building record remains unchanged by projection');
});

test('whole-building Buy omits Rent-only rows and localizes persisted labels in Arabic', () => {
  const requirement = wholeBuildingRequirement('buy', 'buy-building');
  const before = structuredClone(requirement);
  const fields = rowsFor(requirement, 'ar').map(item => item.field);
  assert.equal(row(requirement, 'purpose', 'ar').label, 'الغرض');
  assert.equal(row(requirement, 'purpose', 'ar').value, 'للشراء');
  assert.equal(row(requirement, 'plotAreaSquareMeters', 'ar').label, 'مساحة الأرض (م²)');
  assert.equal(row(requirement, 'plotAreaSquareMeters', 'ar').value, 'على الأقل 0');
  assert.equal(row(requirement, 'hasWaterfront', 'ar').value, 'لا');
  assert.equal(row(requirement, 'preferredAreaMode', 'ar').value, 'مناطق محددة');
  assert.equal(row(requirement, 'purpose', 'ar').value, 'للشراء');
  for (const notApplicable of ['rentalPeriodId', 'occupancy', 'swimmingPool', 'gym', 'seaView']) {
    assert.equal(fields.includes(notApplicable), false, `${notApplicable} is not shown for Buy`);
  }
  assert.deepEqual(requirement, before, 'Arabic projection does not mutate persisted data');
});

test('Studio catalog preferences are shown once with localized labels; absent Rent fields are not false', () => {
  const rent = wantedStudio('rent', 'rent-studio');
  const rentBefore = structuredClone(rent);
  const english = rowsFor(rent);
  for (const field of [
    'apartmentSubtype', 'studioRoomCount', 'bathroomsMinimum', 'centralAC',
    'hasKitchen', 'hasHall', 'hasParking', 'builtUpAreaSquareMeters', 'furnishing',
    'swimmingPool', 'gym', 'seaView', 'driverRoom', 'preferredAmenities',
    'preferredAmenityExclusions', 'rentalPeriodId', 'occupancy',
    'preferredAreaMode', 'preferredAreaIds', 'budget.minimum', 'budget.maximum', 'notes',
  ]) assert.equal(english.filter(item => item.field === field).length, 1, `${field} appears once`);
  assert.equal(row(rent, 'studioRoomCount').value, '1');
  assert.equal(row(rent, 'bathroomsMinimum').value, '0');
  assert.equal(row(rent, 'hasKitchen').value, 'No');
  assert.equal(row(rent, 'hasHall').value, 'Yes');
  assert.equal(row(rent, 'builtUpAreaSquareMeters').label, 'Minimum Studio area (m²)');
  assert.equal(row(rent, 'builtUpAreaSquareMeters').value, '0');
  assert.equal(row(rent, 'furnishing').value, 'Semi-furnished');
  assert.equal(row(rent, 'hasKitchen', 'ar').label, 'مطبخ');
  assert.equal(row(rent, 'hasKitchen', 'ar').value, 'لا');
  assert.equal(row(rent, 'builtUpAreaSquareMeters', 'ar').label, 'الحد الأدنى لمساحة الاستوديو (م²)');
  assert.equal(row(rent, 'builtUpAreaSquareMeters', 'ar').value, '0');
  assert.equal(row(rent, 'preferredAreaIds').value, 'Not applicable — all Kuwait');
  assert.equal(row(rent, 'swimmingPool').value, 'No');
  assert.equal(row(rent, 'driverRoom').value, 'Not specified');
  assert.equal(row(rent, 'preferredAmenities').value, 'Not specified');
  assert.equal(row(rent, 'preferredAmenityExclusions').value, 'Not specified');
  assert.deepEqual(rent, rentBefore);

  const buy = wantedStudio('buy', 'buy-studio');
  const buyBefore = structuredClone(buy);
  const buyRows = rowsFor(buy);
  const buyFields = buyRows.map(item => item.field);
  for (const saved of ['apartmentSubtype', 'studioRoomCount', 'bathroomsMinimum', 'centralAC',
    'hasKitchen', 'hasHall', 'hasParking', 'builtUpAreaSquareMeters', 'furnishing']) {
    assert.equal(buyFields.filter(field => field === saved).length, 1, `${saved} appears once for Studio Buy`);
  }
  assert.equal(row(buy, 'hasKitchen').value, 'No');
  for (const notApplicable of ['rentalPeriodId', 'occupancy', 'swimmingPool', 'gym', 'seaView']) {
    assert.equal(buyFields.includes(notApplicable), false, `${notApplicable} is not shown for Studio Buy`);
  }
  assert.equal(row(buy, 'driverRoom').value, 'Not specified', 'absence is not presented as false');
  assert.deepEqual(buy, buyBefore);
});