import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import { readFile } from 'node:fs/promises';
import { validateProperty, type Property } from '@workspace/property-domain';
import { buildPropertyWithCaptureDetails, summarizeCaptureDetails } from '../services/propertyCaptureDetails.ts';
import { createEditDraft, buildPropertyDetailsUpdateCandidate } from '../services/propertyUpdateRecovery.ts';
import { formatPropertyDetailValue } from '../services/propertyDetailPresentation.ts';
import { WAREHOUSE_SPEC_FIELDS, WAREHOUSE_EXTRA_FIELDS, warehouseFieldVisible, toggleWarehouseLevel } from '../services/warehouseForm.ts';
import { getApplicablePropertyFormFieldsForMode } from '../services/propertyFormCatalog.ts';
import { resolveSourcePath } from './sourcePath.ts';

const basic = (transaction: 'rent' | 'sale'): Property => ({
  core: { id: 'warehouse-test', propertyType: 'warehouse', locationArea: { id: 'salmiya' } },
  activeOffer: transaction === 'rent'
    ? { id: 'warehouse-offer', propertyCoreId: 'warehouse-test', transaction, rentalPrice: { amount: 2000, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }
    : { id: 'warehouse-offer', propertyCoreId: 'warehouse-test', transaction, salePrice: { amount: 300000, currencyCode: 'KWD' } },
});
const fields = {
  areaSquareMeters: 450, areaUnit: 'square_meter' as const,
  buildingAgeBand: '6_12', ceilingHeightMeters: '5.5', warehouseFinish: 'good', warehouseKind: 'food', hasColdStorage: 'true',
  warehouseLevels: 'basement,ground', entranceCount: '3', hasVehicleRamp: 'true', rampVehicleSize: 'large',
  hasServiceElevator: 'true', serviceElevatorCapacityTons: '2.5', hasEscalator: 'false', hasCentralAC: 'true', hasFireSystem: 'true',
  electricityPhase: 'three_phase', electricityCapacity: '200', electricityCapacityUnit: 'A',
  bathroomCount: '2', parkingSpaceCount: '4', loadingBayCount: '1', mapsLink: 'https://maps.google.com/?q=Salmiya',
};

test('Warehouse sale and rent capture and saved editing round-trip every approved specification', () => {
  for (const transaction of ['sale', 'rent'] as const) {
    const property = buildPropertyWithCaptureDetails(basic(transaction), fields, true);
    assert.equal(validateProperty(property).ok, true);
    const details = property.typeDetails as unknown as Record<string, unknown>;
    assert.deepEqual(details.warehouseLevels, ['basement', 'ground']);
    assert.equal(details.serviceElevatorCapacityTons, 2.5);
    assert.equal(details.hasEscalator, false);
    assert.equal(property.areaSquareMeters, 450);
    assert.ok(property.locationEnrichment?.mapsLink);
    const draft = createEditDraft(property);
    const updated = buildPropertyDetailsUpdateCandidate(property, draft.choices);
    assert.equal(validateProperty(updated).ok, true);
    for (const field of [...WAREHOUSE_SPEC_FIELDS, ...WAREHOUSE_EXTRA_FIELDS]) assert.deepEqual((updated.typeDetails as unknown as Record<string, unknown>)[field], details[field], field);
    assert.deepEqual(updated.locationEnrichment, property.locationEnrichment);
    assert.equal(summarizeCaptureDetails(basic(transaction), fields).warehouseLevels, 'basement,ground');
  }
});

test('Warehouse conditional children clear on capture and edit even with stale hidden values', () => {
  const property = buildPropertyWithCaptureDetails(basic('rent'), fields, true);
  const altered = { ...fields, warehouseKind: 'industrial', hasVehicleRamp: 'false', hasServiceElevator: 'false' };
  const captured = buildPropertyWithCaptureDetails(basic('rent'), altered, true);
  const draft = createEditDraft(property);
  const edited = buildPropertyDetailsUpdateCandidate(property, { ...draft.choices, canonicalDetails: { ...draft.choices.canonicalDetails, warehouseKind: 'industrial', hasVehicleRamp: 'false', hasServiceElevator: 'false' } });
  for (const candidate of [captured, edited]) {
    const details = candidate.typeDetails as unknown as Record<string, unknown>;
    for (const field of ['hasColdStorage', 'rampVehicleSize', 'serviceElevatorCapacityTons']) assert.equal(field in details, false, field);
    assert.equal(details.hasServiceElevator, false);
    assert.equal(validateProperty(candidate).ok, true);
  }
});

test('Warehouse domain rejects impossible dependencies, invalid options, duplicate levels and invalid capacities', () => {
  const property = buildPropertyWithCaptureDetails(basic('sale'), fields, true);
  for (const overrides of [
    { warehouseKind: 'industrial' }, { hasVehicleRamp: false }, { hasServiceElevator: false },
    { warehouseFinish: 'unknown' }, { warehouseLevels: ['roof'] }, { warehouseLevels: ['ground', 'ground'] },
    { electricityCapacity: 0 }, { serviceElevatorCapacityTons: -1 }, { electricityCapacityUnit: undefined },
    { entranceCount: 1.5 }, { electricityPhase: 'single_phase' },
  ]) assert.equal(validateProperty({ ...property, typeDetails: { ...property.typeDetails, ...overrides } } as Property).ok, false, JSON.stringify(overrides));
});

test('Warehouse legacy records remain valid without new required fields and retain hidden old information', () => {
  const legacy = { ...basic('sale'), typeDetails: { propertyType: 'warehouse' as const, hasColdStorage: true, plotAreaSquareMeters: 600, loadingBayCount: 2 }, nearbyServices: ['mosque'] };
  assert.equal(validateProperty(legacy).ok, true);
  const draft = createEditDraft(legacy);
  const updated = buildPropertyDetailsUpdateCandidate(legacy, draft.choices);
  assert.deepEqual(updated.typeDetails, legacy.typeDetails);
  assert.deepEqual(updated.nearbyServices, legacy.nearbyServices);
  assert.equal(warehouseFieldVisible('hasColdStorage', {}), false);
  assert.equal(warehouseFieldVisible('hasColdStorage', { warehouseKind: 'food' }), true);
  assert.equal(warehouseFieldVisible('rampVehicleSize', { hasVehicleRamp: 'true' }), true);
});

test('Warehouse floors are multi-select and all options display bilingual labels', () => {
  assert.equal(toggleWarehouseLevel('ground', 'basement'), 'basement,ground');
  assert.equal(toggleWarehouseLevel('basement,ground', 'ground'), 'basement');
  assert.equal(toggleWarehouseLevel('basement', 'basement'), '');
  assert.equal(formatPropertyDetailValue('warehouseLevels', ['basement', 'ground'], 'ar'), 'سرداب، أرضي');
  assert.equal(formatPropertyDetailValue('electricityPhase', 'three_phase', 'en'), '3 phase');
  assert.equal(formatPropertyDetailValue('warehouseFinish', 'super_deluxe', 'ar'), 'سوبر ديلوكس');
  assert.equal(formatPropertyDetailValue('hasEscalator', false, 'ar'), 'لا');
});

test('Warehouse changes remain scoped to offered Warehouse and preserve the existing wanted catalog', () => {
  const wanted = getApplicablePropertyFormFieldsForMode('wanted', 'warehouse').map(item => item.field);
  for (const field of ['warehouseKind', 'warehouseLevels', 'electricityCapacity', 'hasServiceElevator']) assert.equal(wanted.includes(field as never), false);
  const property = buildPropertyWithCaptureDetails(basic('sale'), fields, true);
  assert.equal(validateProperty({ ...property, core: { ...property.core, propertyType: 'office' }, typeDetails: { ...property.typeDetails, propertyType: 'office' } } as Property).ok, false);
});

test('Warehouse uses dedicated fields ahead of nearby rendering and keeps shared Maps and attachment cards', async () => {
  const source = await readFile(resolveSourcePath('../components/ModernPropertyForm.tsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf("if (propertyType === 'warehouse')") < source.indexOf('const nearbySection'));
  const ui = await readFile(resolveSourcePath('../components/WarehouseFields.tsx', import.meta.url), 'utf8');
  assert.match(ui, /WAREHOUSE_SPEC_FIELDS.map\(renderField\)/);
  assert.match(ui, /flexWrap: 'wrap'/);
  assert.doesNotMatch(ui, /NearbyServicesSelector|غير مهم/);
  const capture = await readFile(resolveSourcePath('../app/capture/index.tsx', import.meta.url), 'utf8');
  assert.match(capture, /testID="capture-location-card"/);
  assert.match(capture, /testID="capture-attachments-card"/);
});
