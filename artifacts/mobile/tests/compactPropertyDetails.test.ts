import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceTileWidth } from '../services/choicePresentation.ts';
import { compactSpecificationLayout, compactPropertySpecs, type PropertyDisplayFact } from '../services/compactPropertyDetails.ts';

const fact = (fieldId: string, value: PropertyDisplayFact['value']): PropertyDisplayFact => ({ fieldId, value, label: fieldId });

test('Residential Floor keeps all nine approved specifications in order, including master bedrooms', () => {
  const rows = [fact('furnishing', 'نصف مؤثث'), fact('occupancy', 'عائلات'), fact('areaSquareMeters', '150 م²'), fact('floorNumber', 1), fact('parkingSpaceCount', 3), fact('livingRoomCount', 2), fact('bathroomCount', 3), fact('masterBedroomCount', 3), fact('bedroomCount', 4), fact('floorUse', 'residential')];
  const before = JSON.stringify(rows);
  const result = compactPropertySpecs(rows, 'ar', 'floor');
  assert.deepEqual(result.map(item => item.fieldId), ['bedroomCount', 'masterBedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount', 'floorNumber', 'areaSquareMeters', 'furnishing', 'occupancy']);
  assert.equal(result[0].value, '4');
  assert.equal(result[1].icon, 'master-bedroom');
  assert.equal(result[6].label, 'المساحة');
  assert.equal(JSON.stringify(rows), before, 'presentation does not rewrite saved values');
});

test('Commercial and Warehouse specifics remain visible, including zero, false and a zero yield', () => {
  const rows = [fact('floorNumber', 0), fact('hasVehicleRamp', false), fact('serviceElevatorCapacityTons', 2), fact('electricityPhase', '3 phase'), fact('warehouseLevels', 'Basement, Ground'), fact('grossAnnualRentalYield', '0.00%'), fact('ceilingHeightMeters', undefined)];
  const result = compactPropertySpecs(rows, 'en', 'warehouse');
  assert.equal(result.length, 6);
  assert.equal(result.find(item => item.fieldId === 'floorNumber')?.value, '0');
  assert.equal(result.find(item => item.fieldId === 'hasVehicleRamp')?.value, 'No');
  assert.equal(result.find(item => item.fieldId === 'grossAnnualRentalYield')?.icon, 'percent');
  assert.equal(compactPropertySpecs([fact('hasBasement', false)], 'ar', 'commercial_complex')[0].value, 'لا');
});

test('Each actual field is displayed once; unknown values are omitted without inventing empty specifications', () => {
  const rows = [fact('bedroomCount', 2), fact('bedroomCount', 2), fact('masterBedroomCount', undefined), fact('apartmentSubtype', 'standard_apartment'), fact('floorNumber', ''), fact('bathroomCount', null)];
  assert.deepEqual(compactPropertySpecs(rows, 'en', 'apartment').map(item => item.fieldId), ['bedroomCount']);
  assert.deepEqual(compactPropertySpecs([], 'en', 'office'), []);
});

test('All canonical residential and commercial types use the same projection without adding residential rooms', () => {
  for (const type of ['whole_building', 'commercial_complex', 'apartment', 'floor', 'house', 'villa', 'office', 'shop', 'warehouse', 'chalet', 'other_built_property']) {
    for (const language of ['ar', 'en'] as const) {
      const result = compactPropertySpecs([fact('areaSquareMeters', '180 m²'), fact('bathroomCount', 2)], language, type);
      assert.equal(result.length, 2, type);
      assert.equal(result.some(item => item.fieldId === 'bedroomCount'), false, type);
      assert.equal(new Set(result.map(item => item.fieldId)).size, result.length);
    }
  }
});

test('Three-column specifications and nearby services fit narrow screens with equal edge alignment', () => {
  for (const width of [240, 280, 306, 350, 366, 390, 740]) {
    assert.equal(choiceTileWidth(width, 3, 0)! * 3, width);
    assert.ok(Math.abs(choiceTileWidth(width, 3, 6)! * 3 + 12 - width) < 0.001);
  }
});


test('Whole building uses approved two-column priority below a single centered area in Arabic and English', () => {
  const facts = [fact('furnishing', 'Unfurnished'), fact('apartmentCount', 32), fact('housingTypes', 'شركات / موظفون'), fact('areaSquareMeters', '800 م²'), fact('bathroomsPerUnit', 2), fact('roomsPerUnit', 3), fact('apartmentsPerFloor', 4), fact('floorCount', 8), fact('buildingAgeBand', '6–12'), fact('sameApartmentLayout', true)];
  const before = JSON.stringify(facts);
  for (const language of ['ar', 'en'] as const) {
    const specs = compactPropertySpecs(facts, language, 'whole_building');
    const layout = compactSpecificationLayout(specs, 'whole_building');
    assert.equal(layout.columns, 2);
    assert.equal(layout.area?.value, '800 م²');
    assert.deepEqual(layout.cells.slice(0, 6).map(cell => cell.fieldId), ['housingTypes', 'floorCount', 'apartmentCount', 'apartmentsPerFloor', 'roomsPerUnit', 'bathroomsPerUnit']);
    assert.equal(layout.cells.some(cell => cell.fieldId === 'areaSquareMeters'), false);
    if (language === 'ar') assert.equal(layout.cells[0].value, 'عمارة شركات / موظفون');
    assert.equal(layout.cells.find(cell => cell.fieldId === 'roomsPerUnit')?.icon, 'bed-outline');
    assert.equal(layout.cells.find(cell => cell.fieldId === 'bathroomsPerUnit')?.icon, 'shower');
  }
  assert.equal(JSON.stringify(facts), before);
});

test('Building area fallback preserves the precise area label, while other property layouts stay three-column', () => {
  const specs = compactPropertySpecs([fact('builtUpAreaSquareMeters', '900 m²'), fact('floorCount', 0)], 'en', 'whole_building');
  assert.equal(compactSpecificationLayout(specs, 'whole_building').area?.fieldId, 'builtUpAreaSquareMeters');
  assert.equal(compactSpecificationLayout(specs, 'whole_building').cells[0].value, '0');
  const emptyArea = compactSpecificationLayout(compactPropertySpecs([fact('areaSquareMeters', undefined), fact('apartmentCount', 0)], 'ar', 'whole_building'), 'whole_building');
  assert.equal(emptyArea.area, undefined);
  assert.equal(emptyArea.cells[0].value, '0');
  assert.equal(compactSpecificationLayout(specs, 'apartment').columns, 3);
  assert.equal(compactSpecificationLayout(specs, 'apartment').area, undefined);
});
