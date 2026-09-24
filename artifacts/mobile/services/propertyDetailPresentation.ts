import { APARTMENT_SUBTYPES, type PropertyDetailField } from '@workspace/property-domain';
import { toEnglishDigits } from '@/constants/market';
import {
  PROPERTY_FORM_CATALOG,
} from '@/services/propertyFormCatalog';

const coreFieldOrder: readonly PropertyDetailField[] = [
  'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
];

export const propertyDetailDisplayDefinitions = [
  ...coreFieldOrder.map(field => PROPERTY_FORM_CATALOG.find(definition => definition.field === field)!),
  ...PROPERTY_FORM_CATALOG.filter(definition => !coreFieldOrder.includes(definition.field)),
];

export const propertyDetailLabels: Record<PropertyDetailField, [string, string]> =
  Object.fromEntries(PROPERTY_FORM_CATALOG.map(definition => [definition.field, definition.label])) as Record<PropertyDetailField, [string, string]>;

export function formatPropertyDetailValue(
  field: PropertyDetailField,
  value: unknown,
  language: 'en' | 'ar',
  translate?: (key: string) => string,
): string {
  if (typeof value === 'object' && value && 'value' in value) {
    return toEnglishDigits(String((value as { value: unknown }).value));
  }
  if (typeof value === 'boolean') {
    return value ? (language === 'ar' ? 'نعم' : 'Yes') : (language === 'ar' ? 'لا' : 'No');
  }
  if (field === 'furnishing') {
    const localized = language === 'ar'
      ? { unfurnished: 'غير مؤثث', semi_furnished: 'نصف مؤثث', furnished: 'مؤثث' }
      : { unfurnished: 'Unfurnished', semi_furnished: 'Semi-furnished', furnished: 'Furnished' };
    return localized[value as keyof typeof localized] ?? String(value);
  }
  if (field === 'floorUse') {
    return value === 'residential'
      ? (language === 'ar' ? 'سكني' : 'Residential')
      : value === 'commercial' ? (language === 'ar' ? 'تجاري' : 'Commercial') : String(value);
  }
  if (field === 'apartmentSubtype' && APARTMENT_SUBTYPES.includes(value as typeof APARTMENT_SUBTYPES[number])) {
    const key = `enrich.apartment_subtype.${value}`;
    const localized = translate?.(key);
    if (localized && localized !== key) return localized;
  }
  return toEnglishDigits(String(value));
}

export const RESIDENTIAL_AMENITY_PROPERTY_FIELDS = [
  'hasHeating',
  'hasBalcony',
  'hasMaidRoom',
  'hasLaundryRoom',
  'hasSolarHeater',
  'hasElevator',
  'hasGarden',
  'hasSecurityGuard',
  'hasBBQArea',
] as const satisfies readonly PropertyDetailField[];