import assert from 'node:assert/strict';
import test from 'node:test';
import { APARTMENT_SUBTYPES, type PropertyDetailField } from '@workspace/property-domain';
import {
  formatPropertyDetailValue,
  propertyDetailLabels,
  RESIDENTIAL_AMENITY_PROPERTY_FIELDS,
} from '@/services/propertyDetailPresentation';

const expectedLabels: Record<(typeof RESIDENTIAL_AMENITY_PROPERTY_FIELDS)[number], [string, string]> = {
  hasHeating: ['Heating', 'تدفئة'],
  hasBalcony: ['Balcony', 'بلكونة'],
  hasMaidRoom: ['Maid room', 'غرفة خادمة'],
  hasLaundryRoom: ['Laundry room', 'غرفة غسيل'],
  hasSolarHeater: ['Solar heater', 'سخان شمسي'],
  hasElevator: ['Elevator', 'مصعد'],
  hasGarden: ['Garden', 'حديقة'],
  hasSecurityGuard: ['Security / Guard', 'أمن / حارس'],
  hasBBQArea: ['BBQ area', 'منطقة شواء'],
};

test('Property Details formats every residential Amenity Boolean in English and Arabic', () => {
  assert.equal(RESIDENTIAL_AMENITY_PROPERTY_FIELDS.length, 9);

  for (const field of RESIDENTIAL_AMENITY_PROPERTY_FIELDS) {
    assert.deepEqual(propertyDetailLabels[field], expectedLabels[field], `${field} uses its production bilingual label`);
    assert.equal(formatPropertyDetailValue(field, true, 'en'), 'Yes', `${field} true / English`);
    assert.equal(formatPropertyDetailValue(field, false, 'en'), 'No', `${field} false / English`);
    assert.equal(formatPropertyDetailValue(field, true, 'ar'), 'نعم', `${field} true / Arabic`);
    assert.equal(formatPropertyDetailValue(field, false, 'ar'), 'لا', `${field} false / Arabic`);
  }
});

test('unrelated Property Boolean formatting remains unchanged', () => {
  const unrelatedFields: readonly PropertyDetailField[] = ['hasPool', 'hasWaterfront', 'hasColdStorage'];
  for (const field of unrelatedFields) {
    assert.equal(formatPropertyDetailValue(field, true, 'en'), 'Yes');
    assert.equal(formatPropertyDetailValue(field, false, 'en'), 'No');
    assert.equal(formatPropertyDetailValue(field, true, 'ar'), 'نعم');
    assert.equal(formatPropertyDetailValue(field, false, 'ar'), 'لا');
  }
});

test('Property apartment subtypes use the existing bilingual translation keys', () => {
  for (const subtype of APARTMENT_SUBTYPES) {
    for (const language of ['en', 'ar'] as const) {
      const requestedKeys: string[] = [];
      const value = formatPropertyDetailValue('apartmentSubtype', subtype, language, key => {
        requestedKeys.push(key);
        return `${language} translated label`;
      });
      assert.equal(value, `${language} translated label`);
      assert.deepEqual(requestedKeys, [`enrich.apartment_subtype.${subtype}`]);
      assert.notEqual(value, subtype);
    }
  }
});