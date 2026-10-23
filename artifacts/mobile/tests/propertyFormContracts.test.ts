import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import { getPropertyFormProfile, isPropertyProfileFieldVisible, projectPropertyProfileDetails, validateProperty, type Property, type PropertyType } from '@workspace/property-domain';
import { buildPropertyWithCaptureDetails, summarizeCaptureDetails } from '../services/propertyCaptureDetails.ts';
import { createEditDraft, buildPropertyDetailsUpdateCandidate } from '../services/propertyUpdateRecovery.ts';
import { formatPropertyDetailValue } from '../services/propertyDetailPresentation.ts';
import type { CaptureDetailValues } from '../services/captureDetailsStorage.ts';

const basic = (type: PropertyType, transaction: 'sale' | 'rent'): Property => ({
  core: { id: 'contract-property', propertyType: type, locationArea: { id: 'salmiya' } },
  activeOffer: transaction === 'sale'
    ? { id: 'contract-offer', propertyCoreId: 'contract-property', transaction, salePrice: { amount: 1000000, currencyCode: 'KWD' } }
    : { id: 'contract-offer', propertyCoreId: 'contract-property', transaction, rentalPrice: { amount: 5000, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' },
});
const building: CaptureDetailValues = { buildingAgeBand: '6_12', floorCount: '4', hasBasement: 'true', apartmentCount: '8', sameApartmentsPerFloor: 'true', apartmentsPerFloor: '2', sameApartmentLayout: 'true', roomsPerUnit: '3', bathroomsPerUnit: '2', elevatorCount: '2', hasCentralAC: 'true', hasCCTV: 'true' };
function roundTrip(type: PropertyType, transaction: 'sale' | 'rent', fields: CaptureDetailValues) {
  const created = buildPropertyWithCaptureDetails(basic(type, transaction), fields);
  assert.equal(validateProperty(created).ok, true);
  const reloaded = JSON.parse(JSON.stringify(created)) as Property;
  const edit = createEditDraft(reloaded);
  const saved = buildPropertyDetailsUpdateCandidate(reloaded, edit.choices);
  assert.deepEqual(saved.typeDetails, created.typeDetails);
  const summary = summarizeCaptureDetails(saved, edit.choices.canonicalDetails ?? {});
  return { created, edit, saved, summary, facts: saved.typeDetails as unknown as Record<string, unknown> };
}

test('Residential building rent stores approved housing and parking facts without apartment-level totals or commercial fields', () => {
  const { facts } = roundTrip('whole_building', 'rent', { ...building, housingTypes: 'company_staff,women', hasBuildingParking: 'true', buildingParkingTypes: 'public_yard,in_building', bedroomCount: '4', masterBedroomCount: '2', unitCount: '8', shopCount: '2', officeCount: '3' });
  assert.deepEqual(facts.housingTypes, ['company_staff', 'women']);
  assert.deepEqual(facts.buildingParkingTypes, ['public_yard', 'in_building']);
  for (const field of ['bedroomCount', 'masterBedroomCount', 'unitCount', 'shopCount', 'officeCount', 'parkingTypes', 'privateParkingCount']) assert.equal(facts[field], undefined, field);
  assert.equal(facts.apartmentCount, 8);
  assert.equal(facts.roomsPerUnit, 3);
});
test('Different apartment and floor layouts survive capture, edit hydration, save, reload and bilingual formatting', () => {
  const layouts = [{ apartmentCount: 5, bedrooms: 2, bathrooms: 1 }, { apartmentCount: 3, bedrooms: 3, bathrooms: 2 }];
  const floors = [{ floorNumber: 1, apartmentCount: 3 }, { floorNumber: 2, apartmentCount: 5 }];
  const { facts, edit, summary } = roundTrip('whole_building', 'rent', { ...building, sameApartmentLayout: 'false', sameApartmentsPerFloor: 'false', apartmentLayouts: JSON.stringify(layouts), floorApartmentCounts: JSON.stringify(floors) });
  assert.deepEqual(facts.apartmentLayouts, layouts);
  assert.deepEqual(facts.floorApartmentCounts, floors);
  assert.equal(edit.choices.canonicalDetails?.apartmentLayouts, JSON.stringify(layouts));
  assert.equal(summary.apartmentLayouts, JSON.stringify(layouts));
  assert.equal(facts.roomsPerUnit, undefined);
  assert.equal(facts.apartmentsPerFloor, undefined);
  for (const lang of ['ar', 'en'] as const) assert.ok(!formatPropertyDetailValue('apartmentLayouts', layouts, lang).includes('[object Object]'));
});
test('Building sale preserves family/bachelor/any, permits exactly 1–4 shops and 1–2 commercial floors', () => {
  const { facts } = roundTrip('whole_building', 'sale', { ...building, occupancy: 'family', hasCommercialShops: 'true', shopCount: '4', hasCommercialFloors: 'true', commercialFloorCount: '2', rentalOccupancy: 'partially_rented', monthlyIncome: '8000', parkingTypes: 'private,paid', privateParkingCount: '6', hasMortgage: 'true' });
  assert.equal(facts.shopCount, 4); assert.equal(facts.commercialFloorCount, 2);
  for (const bad of [{ shopCount: '5' }, { commercialFloorCount: '3' }]) assert.throws(() => buildPropertyWithCaptureDetails(basic('whole_building', 'sale'), { ...building, hasCommercialShops: 'true', hasCommercialFloors: 'true', ...bad }));
});
test('Conditional child facts are removed on save when parent changes without erasing unrelated data', () => {
  const initial = buildPropertyWithCaptureDetails(basic('whole_building', 'sale'), { ...building, hasCommercialShops: 'true', shopCount: '4', hasCommercialFloors: 'true', commercialFloorCount: '2' });
  const edit = createEditDraft(initial);
  const saved = buildPropertyDetailsUpdateCandidate(initial, { ...edit.choices, canonicalDetails: { ...edit.choices.canonicalDetails, hasCommercialShops: 'false', hasCommercialFloors: 'false' } });
  const facts = saved.typeDetails as unknown as Record<string, unknown>;
  assert.equal(facts.shopCount, undefined); assert.equal(facts.commercialFloorCount, undefined); assert.equal(facts.apartmentCount, 8);
  const parking = roundTrip('whole_building', 'rent', { ...building, hasBuildingParking: 'false', buildingParkingTypes: 'public_yard' });
  assert.equal(parking.facts.buildingParkingTypes, undefined);
});
test('Complex rent uses commercial unit counts and rental scope without sale-only income, mortgage or residential counts', () => {
  const { facts } = roundTrip('commercial_complex', 'rent', { buildingAgeBand: '1_5', floorCount: '3', hasBasement: 'true', unitCount: '20', rentalScope: 'partial', availableUnitCount: '4', availableAreaSquareMeters: '240', parkingTypes: 'public', hasEscalator: 'true', hasFireSystem: 'true', apartmentCount: '5', roomsPerUnit: '3', bathroomsPerUnit: '2', hasMortgage: 'true', monthlyIncome: '500' });
  for (const field of ['apartmentCount', 'roomsPerUnit', 'bathroomsPerUnit', 'hasMortgage', 'monthlyIncome']) assert.equal(facts[field], undefined);
  assert.equal(facts.availableUnitCount, 4); assert.equal(facts.hasEscalator, true);
  assert.equal(getPropertyFormProfile('commercial_complex', 'rent')?.nearby, false);
});
test('Commercial floor rent, Office and Shop expose the approved use/activity field and appropriate amenities', () => {
  for (const transaction of ['rent', 'sale'] as const) {
    const office = roundTrip('office', transaction, { intendedUse: 'Company HQ', commercialActivity: 'Retail', buildingAgeBand: '1_5', floorNumber: '2', bathroomCount: '2', hasCCTV: 'true', hasPrivateBathroom: 'true', hasElevator: 'true' });
    assert.equal(office.facts.commercialActivity, undefined); assert.equal(office.facts.hasPrivateBathroom, true);
    const shop = roundTrip('shop', transaction, { commercialActivity: 'Grocery', intendedUse: 'Office', buildingAgeBand: '6_12', frontageWidthMeters: '12', ceilingHeightMeters: '4.5', entranceCount: '2', hasMezzanine: 'true' });
    assert.equal(shop.facts.intendedUse, undefined); assert.equal(shop.facts.hasMezzanine, true);
  }
  const floor = roundTrip('floor', 'rent', { floorUse: 'commercial', buildingAgeBand: '1_5', intendedUse: 'HQ', commercialActivity: 'Duplicate', frontageWidthMeters: '20', ceilingHeightMeters: '5', hasElevator: 'true', hasBalcony: 'true', availableFrom: '2026-11-01' });
  for (const field of ['commercialActivity', 'frontageWidthMeters', 'ceilingHeightMeters']) assert.equal(floor.facts[field], undefined);
  assert.equal(floor.facts.availableFrom, '2026-11-01'); assert.equal(floor.facts.hasElevator, true);
});
test('Other residential and commercial remain distinct and require property clarification', () => {
  const residential = roundTrip('other_built_property', 'rent', { propertyUse: 'residential', clarification: 'Annex', bedroomCount: '2', masterBedroomCount: '1', bathroomCount: '2', livingRoomCount: '1', furnishing: 'furnished' });
  assert.equal(residential.facts.bathroomCount, 2);
  const commercial = roundTrip('other_built_property', 'sale', { propertyUse: 'commercial', clarification: 'Workshop', bathroomCount: '1', intendedUse: 'Repairs', hasFireSystem: 'true' });
  assert.equal(commercial.facts.hasFireSystem, true);
  assert.equal(isPropertyProfileFieldVisible('bedroomCount', 'other_built_property', 'rent', { propertyUse: 'commercial' }), false);
  assert.throws(() => buildPropertyWithCaptureDetails(basic('other_built_property', 'rent'), { propertyUse: 'commercial', bathroomCount: '2' }));
});
test('Older rows retain hidden facts during saved editing but accepted details exclude them', () => {
  const old: Property = { ...basic('whole_building', 'rent'), typeDetails: { propertyType: 'whole_building', bedroomCount: 3, masterBedroomCount: 1, unitCount: 8, apartmentCount: 8, shopCount: 0, officeCount: 0 } };
  const saved = buildPropertyDetailsUpdateCandidate(old, createEditDraft(old).choices);
  assert.equal((saved.typeDetails as { bedroomCount?: number }).bedroomCount, 3);
  const shown = projectPropertyProfileDetails('whole_building', 'rent', saved.typeDetails as unknown as Record<string, unknown>);
  for (const key of ['bedroomCount', 'masterBedroomCount', 'unitCount', 'shopCount', 'officeCount']) assert.equal(shown[key], undefined);
  assert.equal(shown.apartmentCount, 8);
});
test('Domain rejects inconsistent layouts, duplicate floors, invalid parking and invalid calendar dates', () => {
  for (const fields of [
    { ...building, sameApartmentLayout: 'false', apartmentLayouts: JSON.stringify([{ apartmentCount: 7, bedrooms: 2, bathrooms: 1 }]) },
    { ...building, sameApartmentsPerFloor: 'false', floorApartmentCounts: JSON.stringify([{ floorNumber: 1, apartmentCount: 4 }, { floorNumber: 1, apartmentCount: 4 }]) },
    { ...building, housingTypes: 'family,family' },
    { ...building, hasBuildingParking: 'true', buildingParkingTypes: 'paid' },
  ]) assert.throws(() => buildPropertyWithCaptureDetails(basic('whole_building', 'rent'), fields));
  assert.throws(() => buildPropertyWithCaptureDetails(basic('floor', 'rent'), { floorUse: 'commercial', availableFrom: '2026-02-31' }));
});
test('Residential Floor remains a single apartment without building-count fields and specialized existing sale forms remain isolated', () => {
  const floor = roundTrip('floor', 'rent', { floorUse: 'residential', bedroomCount: '3', masterBedroomCount: '1', bathroomCount: '2', livingRoomCount: '1' });
  assert.equal(floor.facts.bedroomCount, 3);
  assert.equal(getPropertyFormProfile('floor', 'rent', { floorUse: 'residential' }), undefined);
  assert.equal(getPropertyFormProfile('floor', 'sale', { floorUse: 'commercial' }), undefined);
  assert.equal(isPropertyProfileFieldVisible('roomsPerUnit', 'commercial_complex', 'sale'), false);
});
