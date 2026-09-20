import {
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  type PropertyDetailField,
} from '@workspace/property-domain';
import { toEnglishDigits } from '@/constants/market';

const coreFieldOrder: readonly PropertyDetailField[] = [
  'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
];

export const propertyDetailDisplayDefinitions = [
  ...coreFieldOrder.map(field => PROPERTY_DETAIL_FIELD_DEFINITIONS.find(definition => definition.field === field)!),
  ...PROPERTY_DETAIL_FIELD_DEFINITIONS.filter(definition => !coreFieldOrder.includes(definition.field)),
];

export const propertyDetailLabels: Record<PropertyDetailField, [string, string]> = {
  plotAreaSquareMeters: ['Plot area (m²)', 'مساحة الأرض (م²)'],
  builtUpAreaSquareMeters: ['Built-up area (m²)', 'مساحة البناء (م²)'],
  bathroomCount: ['Bathrooms', 'الحمامات'],
  parkingSpaceCount: ['Parking spaces', 'مواقف السيارات'],
  floorCount: ['Floors', 'عدد الأدوار'],
  unitCount: ['Units', 'عدد الوحدات'],
  apartmentCount: ['Apartments', 'عدد الشقق'],
  shopCount: ['Shops', 'عدد المحلات'],
  officeCount: ['Offices', 'عدد المكاتب'],
  elevatorCount: ['Elevators', 'عدد المصاعد'],
  apartmentSubtype: ['Apartment subtype', 'نوع الشقة'],
  bedroomCount: ['Bedrooms', 'غرف النوم'],
  livingRoomCount: ['Living rooms', 'غرف المعيشة'],
  floorNumber: ['Floor number', 'رقم الدور'],
  floorUse: ['Floor use', 'استخدام الدور'],
  furnishing: ['Furnishing', 'التأثيث'],
  hasMaidRoom: ['Maid room', 'غرفة خادمة'],
  hasHeating: ['Heating', 'تدفئة'],
  hasBalcony: ['Balcony', 'بلكونة'],
  hasLaundryRoom: ['Laundry room', 'غرفة غسيل'],
  hasSolarHeater: ['Solar heater', 'سخان شمسي'],
  hasElevator: ['Elevator', 'مصعد'],
  hasGarden: ['Garden', 'حديقة'],
  hasSecurityGuard: ['Security / Guard', 'أمن / حارس'],
  hasBBQArea: ['BBQ area', 'منطقة شواء'],
  hasPool: ['Pool', 'مسبح'],
  hasWaterfront: ['Waterfront', 'واجهة بحرية'],
  intendedUse: ['Intended use', 'الاستخدام المقصود'],
  commercialActivity: ['Commercial activity', 'النشاط التجاري'],
  frontageWidthMeters: ['Frontage width (m)', 'عرض الواجهة (م)'],
  ceilingHeightMeters: ['Ceiling height (m)', 'ارتفاع السقف (م)'],
  loadingBayCount: ['Loading bays', 'مناطق التحميل'],
  hasColdStorage: ['Cold storage', 'تخزين مبرد'],
  clarification: ['Clarification (required with details)', 'التوضيح (مطلوب عند إضافة تفاصيل)'],
};

export function formatPropertyDetailValue(field: PropertyDetailField, value: unknown, language: 'en' | 'ar'): string {
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