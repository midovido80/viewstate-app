import {
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  PROPERTY_TYPES,
  type FloorUse,
  type PropertyDetailField,
  type PropertyDetailFieldDefinition,
  type PropertyType,
} from '@workspace/property-domain';

export type PropertyFormControl =
  | 'count'
  | 'decimal'
  | 'boolean'
  | 'choice'
  | 'literal'
  | 'numeric_quick_pick';

export interface PropertyFormFieldDefinition extends PropertyDetailFieldDefinition {
  readonly control: PropertyFormControl;
  readonly label: readonly [english: string, arabic: string];
  readonly group: 'detail' | 'amenity';
}

const LABELS: Record<string, readonly [string, string]> = {
  plotAreaSquareMeters: ['Plot area (m²)', 'مساحة الأرض (م²)'],
  builtUpAreaSquareMeters: ['Built-up area (m²)', 'مساحة البناء (م²)'],
  bathroomCount: ['Bathrooms', 'الحمامات'],
  parkingSpaceCount: ['Parking spaces', 'مواقف السيارات'],
  floorCount: ['Floors', 'عدد الأدوار'],
  unitCount: ['Units', 'عدد الوحدات'],
  roomsPerUnit: ['Rooms per unit', 'الغرف في كل وحدة'],
  bathroomsPerUnit: ['Bathrooms per unit', 'الحمامات في كل وحدة'],
  apartmentCount: ['Apartments', 'عدد الشقق'],
  shopCount: ['Shops', 'عدد المحلات'],
  officeCount: ['Offices', 'عدد المكاتب'],
  elevatorCount: ['Elevators', 'عدد المصاعد'],
  apartmentSubtype: ['Apartment subtype', 'نوع الشقة'],
  roomCount: ['Rooms', 'عدد الغرف'],
  bedroomCount: ['Bedrooms', 'غرف النوم'],
  livingRoomCount: ['Number of halls', 'عدد الصالات'],
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
  hasCentralAC: ['Central air conditioning', 'تكييف مركزي'],
  intendedUse: ['Intended use', 'الاستخدام المقصود'],
  commercialActivity: ['Commercial activity', 'النشاط التجاري'],
  frontageWidthMeters: ['Frontage width (m)', 'عرض الواجهة (م)'],
  ceilingHeightMeters: ['Ceiling height (m)', 'ارتفاع السقف (م)'],
  loadingBayCount: ['Loading bays', 'مناطق التحميل'],
  hasColdStorage: ['Cold storage', 'تخزين مبرد'],
  clarification: ['Clarification (required with details)', 'التوضيح (مطلوب عند إضافة تفاصيل)'],
};

const COUNT_FIELDS = new Set<PropertyDetailField>([
  'roomCount', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
  'floorCount', 'apartmentCount', 'shopCount', 'officeCount', 'unitCount',
  'elevatorCount', 'floorNumber', 'loadingBayCount',
  'roomsPerUnit', 'bathroomsPerUnit',
]);
const DECIMAL_FIELDS = new Set<PropertyDetailField>([
  'plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'frontageWidthMeters', 'ceilingHeightMeters',
]);
const BOOLEAN_FIELDS = new Set<string>([
  'hasPool', 'hasWaterfront', 'hasColdStorage', 'hasCentralAC',
]);
const CHOICE_FIELDS = new Set<PropertyDetailField>([
  'apartmentSubtype', 'floorUse', 'furnishing',
]);
const NUMERIC_QUICK_PICK_FIELDS = new Set<PropertyDetailField>([
  'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
  'floorCount', 'unitCount', 'apartmentCount', 'shopCount', 'officeCount',
  'elevatorCount', 'floorNumber', 'loadingBayCount',
  'roomsPerUnit', 'bathroomsPerUnit',
]);

function controlFor(field: PropertyDetailField): PropertyFormControl {
  if (NUMERIC_QUICK_PICK_FIELDS.has(field)) return 'numeric_quick_pick';
  if (COUNT_FIELDS.has(field)) return 'count';
  if (DECIMAL_FIELDS.has(field)) return 'decimal';
  if (BOOLEAN_FIELDS.has(field)) return 'boolean';
  if (CHOICE_FIELDS.has(field)) return 'choice';
  return 'literal';
}

/** The one UI-facing catalog; applicability always comes from the domain matrix. */
export const PROPERTY_FORM_CATALOG: readonly PropertyFormFieldDefinition[] = [
  ...PROPERTY_DETAIL_FIELD_DEFINITIONS.map(definition => ({
    ...definition,
    control: controlFor(definition.field),
    label: LABELS[definition.field] ?? ['Unknown', 'غير معروف'],
    group: definition.field.startsWith('has') ? 'amenity' as const : 'detail' as const,
  })),
];

export const PROPERTY_FORM_TYPES = PROPERTY_TYPES;

export function getPropertyFormField(field: PropertyDetailField): PropertyFormFieldDefinition {
  return PROPERTY_FORM_CATALOG.find(definition => definition.field === field)!;
}

export function getApplicablePropertyFormFields(
  propertyType: PropertyType,
  floorUse?: FloorUse,
): readonly PropertyFormFieldDefinition[] {
  return PROPERTY_FORM_CATALOG.filter(definition =>
    definition.appliesTo.includes(propertyType)
    && (!definition.floorUses
      || propertyType !== 'floor'
      || (floorUse !== undefined && definition.floorUses.includes(floorUse))),
  );
}

export function isPropertyFormFieldApplicable(
  field: PropertyDetailField,
  propertyType: PropertyType,
  floorUse?: FloorUse,
): boolean {
  return getApplicablePropertyFormFields(propertyType, floorUse)
    .some(definition => definition.field === field);
}