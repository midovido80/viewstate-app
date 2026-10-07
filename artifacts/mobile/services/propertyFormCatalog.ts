import {
  FLOOR_USES,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  REQUIREMENT_PURPOSES,
  PROPERTY_TYPES,
  type FloorUse,
  type ApartmentSubtype,
  type PropertyDetailField,
  type PropertyDetailFieldDefinition,
  type PropertyType,
  type RequirementAreaMode,
  type RequirementPurpose,
  type ResidentialAmenity,
  type Transaction,
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
  /** A Property value describes what is actually offered, never what is wanted. */
  readonly offered: {
    readonly kind: 'actual_fact';
    readonly field: PropertyDetailField;
  };
  /** Only persisted Requirement meanings are described here; absent means unsupported. */
  readonly wanted?: PropertyWantedDescriptor;
}

export type PropertyWantedDescriptor =
  | {
    readonly kind: 'limit';
    readonly storage: 'native';
    readonly field: 'bedroomsMinimum' | 'bathroomsMinimum';
    readonly comparison: 'minimum';
    readonly presentation: 'core';
  }
  | {
    readonly kind: 'preference';
    readonly storage: 'native';
    readonly field: 'floorUse';
    readonly values: readonly FloorUse[];
    readonly presentation: 'none';
  }
  | {
    readonly kind: 'preference';
    readonly storage: 'native';
    readonly field: 'centralAC';
    readonly valueType: 'boolean';
    readonly presentation: 'core';
  }
  | {
    readonly kind: 'preference';
    readonly storage: 'native';
    readonly field: 'preferredAmenities';
    readonly value: ResidentialAmenity;
    readonly presentation: 'none';
  }
  | {
    readonly kind: 'limit' | 'preference';
    readonly storage: 'catalogPreference';
    readonly field: PropertyDetailField;
    readonly preferenceKind: 'number';
    readonly comparison: 'minimum' | 'exact';
    readonly presentation: 'core' | 'none';
  }
  | {
    readonly kind: 'preference';
    readonly storage: 'catalogPreference';
    readonly field: PropertyDetailField;
    readonly preferenceKind: 'choice' | 'feature';
    readonly presentation: 'leading' | 'specification' | 'amenity';
  };

export type PropertyFormMode = 'offered' | 'wanted';
export type PropertyFormWantedFieldDefinition = PropertyFormFieldDefinition & {
  readonly wanted: PropertyWantedDescriptor;
};

export type PropertyFormCoreDescriptor =
  | {
    readonly key: 'propertyType';
    readonly appliesTo: readonly PropertyType[];
    readonly offered: { readonly kind: 'actual_fact'; readonly path: 'core.propertyType' };
    readonly wanted: {
      readonly kind: 'preference';
      readonly storage: 'native';
      readonly field: 'propertyType';
      readonly values: readonly PropertyType[];
    };
  }
  | {
    readonly key: 'transaction';
    readonly appliesTo: readonly PropertyType[];
    readonly offered: { readonly kind: 'actual_fact'; readonly path: 'activeOffer.transaction' };
    readonly wanted: {
      readonly kind: 'preference';
      readonly storage: 'native';
      readonly field: 'purpose';
      readonly values: readonly RequirementPurpose[];
      readonly mappings: readonly [
        { readonly offered: Extract<Transaction, 'sale'>; readonly wanted: 'buy' },
        { readonly offered: Extract<Transaction, 'rent'>; readonly wanted: 'rent' },
      ];
    };
  }
  | {
    readonly key: 'location';
    readonly appliesTo: readonly PropertyType[];
    readonly offered: { readonly kind: 'actual_fact'; readonly path: 'core.locationArea.id' };
    readonly wanted: {
      readonly kind: 'preference';
      readonly storage: 'native';
      readonly fields: readonly ['preferredAreaIds', 'preferredAreaMode'];
      readonly areaModeValues: readonly RequirementAreaMode[];
    };
  }
  | {
    readonly key: 'price';
    readonly appliesTo: readonly PropertyType[];
    readonly offered: {
      readonly kind: 'actual_fact';
      readonly selectedBy: 'activeOffer.transaction';
      readonly saleAmountPath: 'activeOffer.salePrice.amount';
      readonly saleCurrencyPath: 'activeOffer.salePrice.currencyCode';
      readonly rentAmountPath: 'activeOffer.rentalPrice.amount';
      readonly rentCurrencyPath: 'activeOffer.rentalPrice.currencyCode';
    };
    readonly wanted: {
      readonly kind: 'range';
      readonly storage: 'native';
      readonly minimumField: 'budget.minimum';
      readonly maximumField: 'budget.maximum';
      readonly currencyField: 'budget.currencyCode';
    };
  };

/** Shared Property/Requirement core paths; descriptors add no persisted fields. */
export const PROPERTY_FORM_CORE_CATALOG = [
  {
    key: 'propertyType',
    appliesTo: PROPERTY_TYPES,
    offered: { kind: 'actual_fact', path: 'core.propertyType' },
    wanted: { kind: 'preference', storage: 'native', field: 'propertyType', values: PROPERTY_TYPES },
  },
  {
    key: 'transaction',
    appliesTo: PROPERTY_TYPES,
    offered: { kind: 'actual_fact', path: 'activeOffer.transaction' },
    wanted: {
      kind: 'preference',
      storage: 'native',
      field: 'purpose',
      values: REQUIREMENT_PURPOSES,
      mappings: [
        { offered: 'sale', wanted: 'buy' },
        { offered: 'rent', wanted: 'rent' },
      ],
    },
  },
  {
    key: 'location',
    appliesTo: PROPERTY_TYPES,
    offered: { kind: 'actual_fact', path: 'core.locationArea.id' },
    wanted: {
      kind: 'preference',
      storage: 'native',
      fields: ['preferredAreaIds', 'preferredAreaMode'],
      areaModeValues: ['specific_areas', 'all_kuwait'],
    },
  },
  {
    key: 'price',
    appliesTo: PROPERTY_TYPES,
    offered: {
      kind: 'actual_fact',
      selectedBy: 'activeOffer.transaction',
      saleAmountPath: 'activeOffer.salePrice.amount',
      saleCurrencyPath: 'activeOffer.salePrice.currencyCode',
      rentAmountPath: 'activeOffer.rentalPrice.amount',
      rentCurrencyPath: 'activeOffer.rentalPrice.currencyCode',
    },
    wanted: {
      kind: 'range',
      storage: 'native',
      minimumField: 'budget.minimum',
      maximumField: 'budget.maximum',
      currencyField: 'budget.currencyCode',
    },
  },
] as const satisfies readonly PropertyFormCoreDescriptor[];

const WANTED_BY_FIELD: Partial<Record<PropertyDetailField, PropertyWantedDescriptor>> = {
  bedroomCount: { kind: 'limit', storage: 'native', field: 'bedroomsMinimum', comparison: 'minimum', presentation: 'core' },
  bathroomCount: { kind: 'limit', storage: 'native', field: 'bathroomsMinimum', comparison: 'minimum', presentation: 'core' },
  livingRoomCount: { kind: 'limit', storage: 'catalogPreference', field: 'livingRoomCount', preferenceKind: 'number', comparison: 'minimum', presentation: 'core' },
  parkingSpaceCount: { kind: 'limit', storage: 'catalogPreference', field: 'parkingSpaceCount', preferenceKind: 'number', comparison: 'minimum', presentation: 'core' },
  floorNumber: { kind: 'preference', storage: 'catalogPreference', field: 'floorNumber', preferenceKind: 'number', comparison: 'exact', presentation: 'core' },
  plotAreaSquareMeters: { kind: 'limit', storage: 'catalogPreference', field: 'plotAreaSquareMeters', preferenceKind: 'number', comparison: 'minimum', presentation: 'core' },
  builtUpAreaSquareMeters: { kind: 'limit', storage: 'catalogPreference', field: 'builtUpAreaSquareMeters', preferenceKind: 'number', comparison: 'minimum', presentation: 'core' },
  floorUse: { kind: 'preference', storage: 'native', field: 'floorUse', values: FLOOR_USES, presentation: 'none' },
  hasCentralAC: { kind: 'preference', storage: 'native', field: 'centralAC', valueType: 'boolean', presentation: 'core' },
  hasMaidRoom: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'maid_room', presentation: 'none' },
  hasHeating: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'heating', presentation: 'none' },
  hasBalcony: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'balcony', presentation: 'none' },
  hasLaundryRoom: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'laundry_room', presentation: 'none' },
  hasSolarHeater: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'solar_heater', presentation: 'none' },
  hasElevator: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'elevator', presentation: 'none' },
  hasGarden: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'garden', presentation: 'none' },
  hasSecurityGuard: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'security_guard', presentation: 'none' },
  hasBBQArea: { kind: 'preference', storage: 'native', field: 'preferredAmenities', value: 'bbq_area', presentation: 'none' },
  apartmentSubtype: { kind: 'preference', storage: 'catalogPreference', field: 'apartmentSubtype', preferenceKind: 'choice', presentation: 'leading' },
  hasKitchen: { kind: 'preference', storage: 'catalogPreference', field: 'hasKitchen', preferenceKind: 'feature', presentation: 'amenity' },
  hasHall: { kind: 'preference', storage: 'catalogPreference', field: 'hasHall', preferenceKind: 'feature', presentation: 'amenity' },
  hasParking: { kind: 'preference', storage: 'catalogPreference', field: 'hasParking', preferenceKind: 'feature', presentation: 'amenity' },
  furnishing: { kind: 'preference', storage: 'catalogPreference', field: 'furnishing', preferenceKind: 'choice', presentation: 'leading' },
  intendedUse: { kind: 'preference', storage: 'catalogPreference', field: 'intendedUse', preferenceKind: 'choice', presentation: 'specification' },
  commercialActivity: { kind: 'preference', storage: 'catalogPreference', field: 'commercialActivity', preferenceKind: 'choice', presentation: 'specification' },
  hasPool: { kind: 'preference', storage: 'catalogPreference', field: 'hasPool', preferenceKind: 'feature', presentation: 'amenity' },
  hasWaterfront: { kind: 'preference', storage: 'catalogPreference', field: 'hasWaterfront', preferenceKind: 'feature', presentation: 'amenity' },
  hasColdStorage: { kind: 'preference', storage: 'catalogPreference', field: 'hasColdStorage', preferenceKind: 'feature', presentation: 'amenity' },
};

const LABELS: Record<string, readonly [string, string]> = {
  plotAreaSquareMeters: ['Plot area (m²)', 'مساحة الأرض (م²)'],
  builtUpAreaSquareMeters: ['Built-up area (m²)', 'مساحة البناء (م²)'],
  bathroomCount: ['Bathrooms', 'الحمامات'],
  studioRoomCount: ['Open-plan rooms', 'الغرف المفتوحة'],
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
  bedroomCount: ['Bedrooms', 'غرف النوم'],
  masterBedroomCount: ['Master bedrooms', 'غرف نوم ماستر'],
  occupancy: ['Occupancy', 'نوع السكن'],
  propertyUse: ['Property use', 'استخدام العقار'],
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
  hasKitchen: ['Kitchen', 'مطبخ'],
  hasHall: ['Hall', 'صالة'],
  hasParking: ['Parking', 'موقف سيارة'],
};

const COUNT_FIELDS = new Set<PropertyDetailField>([
  'masterBedroomCount', 'bedroomCount', 'studioRoomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
  'floorCount', 'apartmentCount', 'shopCount', 'officeCount', 'unitCount',
  'elevatorCount', 'floorNumber', 'loadingBayCount',
  'roomsPerUnit', 'bathroomsPerUnit',
]);
const DECIMAL_FIELDS = new Set<PropertyDetailField>([
  'plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'frontageWidthMeters', 'ceilingHeightMeters',
]);
const BOOLEAN_FIELDS = new Set<string>([
  'hasPool', 'hasWaterfront', 'hasColdStorage', 'hasCentralAC',
  'hasKitchen', 'hasHall', 'hasParking',
]);
const CHOICE_FIELDS = new Set<PropertyDetailField>([
  'apartmentSubtype', 'floorUse', 'furnishing', 'occupancy', 'propertyUse',
]);
const NUMERIC_QUICK_PICK_FIELDS = new Set<PropertyDetailField>([
  'masterBedroomCount', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
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
  ...PROPERTY_DETAIL_FIELD_DEFINITIONS.map(definition => {
    const wanted = WANTED_BY_FIELD[definition.field];
    return {
      ...definition,
      control: controlFor(definition.field),
      label: LABELS[definition.field] ?? ['Unknown', 'غير معروف'],
      group: definition.field.startsWith('has') ? 'amenity' as const : 'detail' as const,
      offered: { kind: 'actual_fact' as const, field: definition.field },
      ...(wanted ? { wanted } : {}),
    };
  }),
];

/** One catalog surface for future offered/wanted forms; existing editors keep their detail selectors. */
export const OFFER_REQUEST_FORM_CATALOG = {
  core: PROPERTY_FORM_CORE_CATALOG,
  details: PROPERTY_FORM_CATALOG,
} as const;

export const PROPERTY_FORM_TYPES = PROPERTY_TYPES;

export function getPropertyFormField(field: PropertyDetailField): PropertyFormFieldDefinition {
  return PROPERTY_FORM_CATALOG.find(definition => definition.field === field)!;
}

export function getApplicablePropertyFormFields(
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
  propertyUse?: FloorUse,
): readonly PropertyFormFieldDefinition[] {
  return PROPERTY_FORM_CATALOG.filter(definition =>
    definition.appliesTo.includes(propertyType)
    && (!definition.propertyUses || propertyType !== 'other_built_property'
      || propertyUse !== undefined && definition.propertyUses.includes(propertyUse))
    && (definition.field === 'masterBedroomCount' && propertyType === 'apartment' && apartmentSubtype === undefined
      || !definition.apartmentSubtypes
      || propertyType !== 'apartment'
      || propertyType === 'apartment'
        && apartmentSubtype !== undefined
        && definition.apartmentSubtypes.includes(apartmentSubtype))
    && (!definition.floorUses
      || propertyType !== 'floor'
      || (floorUse !== undefined && definition.floorUses.includes(floorUse))),
  );
}

export function getApplicablePropertyFormFieldsForMode(
  mode: 'offered',
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
): readonly PropertyFormFieldDefinition[];
export function getApplicablePropertyFormFieldsForMode(
  mode: 'wanted',
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
): readonly PropertyFormWantedFieldDefinition[];
export function getApplicablePropertyFormFieldsForMode(
  mode: PropertyFormMode,
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
): readonly PropertyFormFieldDefinition[] | readonly PropertyFormWantedFieldDefinition[] {
  const applicable = getApplicablePropertyFormFields(propertyType, floorUse, apartmentSubtype);
  if (mode === 'offered') return applicable;
  return applicable.filter(
    (definition): definition is PropertyFormWantedFieldDefinition => definition.wanted !== undefined,
  );
}

export function isPropertyFormFieldApplicable(
  field: PropertyDetailField,
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
): boolean {
  return getApplicablePropertyFormFields(propertyType, floorUse, apartmentSubtype)
    .some(definition => definition.field === field);
}