import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProperty, type Property } from '@workspace/property-domain';
import { buildPropertyWithCaptureDetails } from '@/services/propertyCaptureDetails';
import { createEditDraft, buildPropertyDetailsUpdateCandidate } from '@/services/propertyUpdateRecovery';
import { COMMERCIAL_COMPLEX_SALE_FIELDS, grossAnnualRentalYield, toggleComplexParking } from '@/services/commercialComplexSale';
import { formatPropertyDetailValue } from '@/services/propertyDetailPresentation';

const baseline: Property = {
  core: { id: 'complex-core', propertyType: 'commercial_complex', locationArea: { id: 'salmiya' } },
  activeOffer: { id: 'complex-offer', propertyCoreId: 'complex-core', transaction: 'sale', salePrice: { amount: 1000000, currencyCode: 'KWD' } },
};
const values = {
  buildingAgeBand: '6_12', floorCount: '7', hasBasement: 'false', unitCount: '30', streetPosition: 'front_back',
  parkingTypes: 'private,public,paid', privateParkingCount: '12', hasMortgage: 'true', rentalOccupancy: 'partially_rented', monthlyIncome: '6000', areaSquareMeters: 2000,
};

test('Commercial complex facts survive capture, storage reload and saved details editing', () => {
  const saved = buildPropertyWithCaptureDetails(baseline, values);
  assert.equal(validateProperty(saved).ok, true);
  const reloaded = JSON.parse(JSON.stringify(saved)) as Property;
  const draft = createEditDraft(reloaded);
  assert.equal(draft.choices.canonicalDetails?.parkingTypes, 'private,public,paid');
  const edited = buildPropertyDetailsUpdateCandidate(reloaded, draft.choices);
  assert.deepEqual(edited.typeDetails, reloaded.typeDetails);
  assert.equal(edited.areaSquareMeters, 2000);
  assert.equal(grossAnnualRentalYield(1000000, Number(draft.choices.canonicalDetails?.monthlyIncome))?.toFixed(2), '7.20');
  assert.equal(grossAnnualRentalYield(1000000, 6000)?.toFixed(2), '7.20');
});

test('Commercial yield handles zero, missing inputs, price changes and invalid amounts', () => {
  assert.equal(grossAnnualRentalYield(1000000, 0), 0);
  assert.equal(grossAnnualRentalYield(2000000, 6000)?.toFixed(2), '3.60');
  for (const price of [undefined, 0, -1, Infinity, NaN]) assert.equal(grossAnnualRentalYield(price, 6000), undefined);
  for (const income of [undefined, -1, Infinity, NaN]) assert.equal(grossAnnualRentalYield(1000000, income), undefined);
});

test('Parking is multi-select; private count is excluded from persistence when private is deselected', () => {
  const selected = toggleComplexParking(toggleComplexParking('', 'private'), 'public');
  assert.equal(selected, 'private,public');
  const parkingTypes = toggleComplexParking(selected, 'private');
  assert.equal(parkingTypes, 'public');
  const saved = buildPropertyWithCaptureDetails(baseline, { ...values, parkingTypes });
  assert.equal((saved.typeDetails as unknown as Record<string, unknown>).privateParkingCount, undefined);
  const draft = createEditDraft(buildPropertyWithCaptureDetails(baseline, values));
  draft.choices.canonicalDetails!.parkingTypes = 'paid';
  const updated = buildPropertyDetailsUpdateCandidate(draft.baseline, draft.choices);
  assert.equal((updated.typeDetails as unknown as Record<string, unknown>).privateParkingCount, undefined);
});

test('Commercial values validate canonical choices, money, counts, parking and type applicability', () => {
  for (const invalid of [{ monthlyIncome: '-1' }, { floorCount: '0' }, { unitCount: '1.5' }, { privateParkingCount: '-1' }, { buildingAgeBand: 'new' }, { parkingTypes: 'unknown' }, { parkingTypes: 'public,public' }, { streetPosition: 'unknown' }, { rentalOccupancy: 'unknown' }]) {
    assert.throws(() => buildPropertyWithCaptureDetails(baseline, { ...values, ...invalid }));
  }
  const saved = buildPropertyWithCaptureDetails(baseline, values);
  assert.equal(validateProperty({ ...saved, core: { ...saved.core, propertyType: 'house' }, typeDetails: { ...saved.typeDetails, propertyType: 'house' } } as Property).ok, false);
});

test('Commercial labels are localized and the specification order is stable', () => {
  assert.deepEqual(COMMERCIAL_COMPLEX_SALE_FIELDS, ['buildingAgeBand', 'floorCount', 'hasBasement', 'unitCount', 'streetPosition', 'parkingTypes', 'privateParkingCount', 'hasMortgage', 'rentalOccupancy', 'monthlyIncome']);
  assert.equal(formatPropertyDetailValue('parkingTypes', ['private', 'paid'], 'ar'), 'خاصة، مدفوعة');
  assert.equal(formatPropertyDetailValue('parkingTypes', 'private,paid', 'en'), 'Private, Paid');
  assert.equal(formatPropertyDetailValue('hasBasement', false, 'ar'), 'لا');
  assert.equal(formatPropertyDetailValue('rentalOccupancy', 'partially_rented', 'ar'), 'مؤجر جزئي');
});
