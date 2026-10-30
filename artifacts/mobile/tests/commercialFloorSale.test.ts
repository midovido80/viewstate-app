import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateProperty, type Property } from '@workspace/property-domain';
import { buildPropertyWithCaptureDetails } from '@/services/propertyCaptureDetails';
import { buildPropertyDetailsUpdateCandidate, createEditDraft } from '@/services/propertyUpdateRecovery';
import { getApplicablePropertyFormFieldsForMode } from '@/services/propertyFormCatalog';
import { grossAnnualRentalYield } from '@/services/commercialComplexSale';
import { COMMERCIAL_FLOOR_SALE_FIELDS, COMMERCIAL_FLOOR_SALE_AMENITIES, COMMERCIAL_FLOOR_SALE_OCCUPANCY, isCommercialFloorSale, isCommercialFloorSaleFieldVisible, commercialFloorSaleLabel } from '@/services/commercialFloorSale';
import { getRequirementCatalogFields } from '@/services/requirementFieldMap';
import { formatPropertyDetailValue } from '@/services/propertyDetailPresentation';

const baseline: Property = {
  core: { id: 'floor-sale-core', propertyType: 'floor', locationArea: { id: 'salmiya' } },
  activeOffer: { id: 'floor-sale-offer', propertyCoreId: 'floor-sale-core', transaction: 'sale', salePrice: { amount: 100000, currencyCode: 'KWD' } },
};
const values = {
  floorUse: 'commercial', buildingAgeBand: '6_12', floorNumber: '0', bathroomCount: '2',
  parkingTypes: 'public,paid,private', privateParkingCount: '4', intendedUse: 'مقر شركة',
  rentalOccupancy: 'rented', monthlyIncome: '600', hasElevator: 'true', hasBalcony: 'true',
  hasPrivateEntrance: 'true', hasKitchen: 'true', hasSecurityGuard: 'true', hasAccessibleEntrance: 'true', areaSquareMeters: 120,
};

test('Commercial Floor sale saves and reloads its investment facts, ground floor, features and classification', () => {
  const saved = buildPropertyWithCaptureDetails(baseline, values);
  assert.equal(validateProperty(saved).ok, true);
  const reloaded = JSON.parse(JSON.stringify(saved)) as Property;
  const draft = createEditDraft(reloaded);
  const edited = buildPropertyDetailsUpdateCandidate(reloaded, draft.choices);
  assert.deepEqual(edited.typeDetails, reloaded.typeDetails);
  assert.equal(edited.core.propertyType, 'floor');
  assert.equal(draft.choices.canonicalDetails?.floorUse, 'commercial');
  assert.equal(draft.choices.canonicalDetails?.floorNumber, '0');
  assert.equal(draft.choices.canonicalDetails?.hasAccessibleEntrance, 'true');
  assert.equal(grossAnnualRentalYield(draft.choices.priceAmount, Number(draft.choices.canonicalDetails?.monthlyIncome))?.toFixed(2), '7.20');
});

test('Commercial Floor occupancy is only vacant or rented; mortgage is incompatible', () => {
  for (const rentalOccupancy of ['vacant', 'rented']) assert.doesNotThrow(() => buildPropertyWithCaptureDetails(baseline, { ...values, rentalOccupancy }));
  for (const rentalOccupancy of ['fully_rented', 'partially_rented', 'unknown']) assert.throws(() => buildPropertyWithCaptureDetails(baseline, { ...values, rentalOccupancy }));
  const saved = buildPropertyWithCaptureDetails(baseline, values);
  assert.equal(validateProperty({ ...saved, typeDetails: { ...saved.typeDetails, hasMortgage: true } } as Property).ok, false);
  assert.deepEqual(COMMERCIAL_FLOOR_SALE_OCCUPANCY.map(option => option[0]), ['vacant', 'rented']);
});

test('Commercial Floor sale excludes shop dimensions, activity duplication, generic parking count and mortgage', () => {
  for (const field of ['frontageWidthMeters', 'ceilingHeightMeters', 'commercialActivity', 'parkingSpaceCount', 'hasMortgage'] as const) assert.equal(isCommercialFloorSaleFieldVisible(field), false);
  assert.ok(COMMERCIAL_FLOOR_SALE_FIELDS.indexOf('buildingAgeBand') < COMMERCIAL_FLOOR_SALE_FIELDS.indexOf('floorNumber'));
  assert.ok(COMMERCIAL_FLOOR_SALE_FIELDS.includes('intendedUse'));
  assert.ok(COMMERCIAL_FLOOR_SALE_AMENITIES.includes('hasElevator'));
  assert.ok(COMMERCIAL_FLOOR_SALE_AMENITIES.includes('hasBalcony'));
  assert.equal(isCommercialFloorSale('floor', 'commercial', 'sale'), true);
  for (const args of [['floor', 'commercial', 'rent'], ['floor', 'residential', 'sale'], ['office', undefined, 'sale']] as const) assert.equal(isCommercialFloorSale(args[0], args[1], args[2]), false);
});

test('Hidden legacy commercial fields survive an unrelated saved-details edit without being reinterpreted', () => {
  const saved = buildPropertyWithCaptureDetails(baseline, { ...values, parkingSpaceCount: '9', frontageWidthMeters: '12', ceilingHeightMeters: '4', commercialActivity: 'Legacy activity' });
  const draft = createEditDraft(saved);
  draft.choices.priceAmount = 200000;
  const edited = buildPropertyDetailsUpdateCandidate(saved, draft.choices);
  const details = edited.typeDetails as unknown as Record<string, unknown>;
  assert.equal(details.parkingSpaceCount, 9);
  assert.equal(details.privateParkingCount, 4);
  assert.equal(details.frontageWidthMeters, 12);
  assert.equal(grossAnnualRentalYield(200000, Number(details.monthlyIncome))?.toFixed(2), '3.60');
  draft.choices.canonicalDetails!.parkingTypes = 'public,paid';
  const withoutPrivate = buildPropertyDetailsUpdateCandidate(saved, draft.choices);
  assert.equal((withoutPrivate.typeDetails as unknown as Record<string, unknown>).privateParkingCount, undefined);
});

test('Commercial Floor expansion does not expose investment or new feature fields in Wanted or Residential forms', () => {
  const wanted = getApplicablePropertyFormFieldsForMode('wanted', 'floor', 'commercial').map(item => item.field);
  for (const field of ['buildingAgeBand', 'parkingTypes', 'monthlyIncome', 'rentalOccupancy', ...COMMERCIAL_FLOOR_SALE_AMENITIES.filter(field => field !== 'hasCentralAC')]) assert.equal(wanted.includes(field as typeof wanted[number]), false);
  assert.equal(getRequirementCatalogFields('floor', 'commercial').some(field => field.field === 'hasKitchen'), false);
  const saved = buildPropertyWithCaptureDetails(baseline, values);
  assert.equal(validateProperty({ ...saved, typeDetails: { ...saved.typeDetails, floorUse: 'residential' } } as Property).ok, false);
  assert.equal(formatPropertyDetailValue('rentalOccupancy', 'rented', 'ar'), 'مؤجر');
  assert.equal(commercialFloorSaleLabel('buildingAgeBand', 'ar', ''), 'عمر العقار');
});

test('Property and People filter rows stay horizontal, do not wrap, and retain full single-line labels', async () => {
  for (const tab of ['properties', 'people']) {
    const source = await readFile(`app/(tabs)/${tab}.tsx`, 'utf8');
    assert.match(source, /<ScrollView horizontal showsHorizontalScrollIndicator=\{false\}/);
    assert.match(source, /flexWrap: 'nowrap'/);
    assert.match(source, /flexGrow: 0, flexShrink: 0, minHeight: 60/);
    assert.match(source, /<Text numberOfLines=\{1\}/);
    assert.match(source, /getRecordTransactionFilterLabel\(option.key, filter, language\)/);
    assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  }
});
