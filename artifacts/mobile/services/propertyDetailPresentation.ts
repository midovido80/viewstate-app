import {
  APARTMENT_SUBTYPES,
  type Property,
  type PropertyDemoCaptureMetadata,
  type PropertyDetailField,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { toEnglishDigits } from '@/constants/market';
import { PROPERTY_FORM_CATALOG } from '@/services/propertyFormCatalog';
import { EQUIVALENT_TEMPLATE_FIELDS, hasCanonicalTypeDetailsSnapshot } from '@/services/propertyFactProjection';
import { getDemoCategory } from '@/services/propertyDemoCatalog';
import { getPropertyFormField } from '@/services/propertyFormCatalog';
import { readStudioRequirement } from '@/services/studioFormModel';

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

export interface PropertyDetailCategoryRow {
  readonly field: string;
  readonly label: string;
  readonly value: string;
}

function unwrapDetailValue(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}

const STUDIO_NON_APPLICABLE_TOTALS = new Set([
  'bedroomCount',
  'floorCount',
  'apartmentCount',
  'shopCount',
  'officeCount',
  'unitCount',
  'elevatorCount',
  'roomsPerUnit',
  'bathroomsPerUnit',
]);

const STUDIO_HIDDEN_LEGACY_AMENITIES = new Set([
  'hasBalcony',
  'hasElevator',
]);

export function isOfferedStudio(property: Pick<Property, 'core' | 'typeDetails'>): boolean {
  const details = property.typeDetails as Readonly<Record<string, unknown>> | undefined;
  return property.core.propertyType === 'apartment'
    && unwrapDetailValue(details?.apartmentSubtype) === 'studio';
}

export function getOfferedStudioDetailValues(
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(details).filter(([field]) =>
      !STUDIO_NON_APPLICABLE_TOTALS.has(field)
      && !STUDIO_HIDDEN_LEGACY_AMENITIES.has(field)),
  );
}

export function isWantedStudio(requirement: Pick<SeekerRequirement, 'propertyType' | 'catalogPreferences'>): boolean {
  return requirement.propertyType === 'apartment'
    && requirement.catalogPreferences?.some(preference =>
      preference.field === 'apartmentSubtype'
      && preference.kind === 'choice'
      && preference.value === 'studio',
    ) === true;
}

/**
 * Localized apartment subtype wording for wanted Requirement summaries.
 * Older Requirement records may use `standard` rather than the canonical
 * `standard_apartment` value; retain that legacy display mapping.
 */
export function getWantedApartmentSubtypeLabel(
  requirement: Pick<SeekerRequirement, 'propertyType' | 'catalogPreferences'>,
  language: 'en' | 'ar',
): string | undefined {
  if (requirement.propertyType !== 'apartment') return undefined;
  const preference = requirement.catalogPreferences?.find(item =>
    item.field === 'apartmentSubtype' && item.kind === 'choice',
  );
  if (!preference || preference.kind !== 'choice') return undefined;
  const labels: Record<string, readonly [string, string]> = {
    standard: ['Standard Apartment', 'شقة عادية'],
    standard_apartment: ['Standard Apartment', 'شقة عادية'],
    studio: ['Studio', 'استوديو'],
    duplex: ['Duplex', 'دوبلكس'],
  };
  const label = labels[String(preference.value)];
  return label?.[language === 'ar' ? 1 : 0];
}

export function canHydrateStudioRequirement(requirement: SeekerRequirement): boolean {
  try {
    readStudioRequirement(requirement);
    return true;
  } catch {
    return false;
  }
}

export interface StudioRequirementDisplayRow {
  readonly field: string;
  readonly label: string;
  readonly value: string;
}

export function getWantedStudioContextRows(
  requirement: SeekerRequirement,
  language: 'en' | 'ar',
): StudioRequirementDisplayRow[] {
  if (!isWantedStudio(requirement)) return [];
  const rows: StudioRequirementDisplayRow[] = [{
    field: 'purpose',
    label: language === 'ar' ? 'الغرض' : 'Purpose',
    value: requirement.purpose === 'rent'
      ? (language === 'ar' ? 'للإيجار' : 'Rent')
      : (language === 'ar' ? 'للشراء' : 'Buy'),
  }];
  if (requirement.purpose === 'rent') {
    const period = requirement.rentalPeriodId ?? 'monthly';
    const periodLabels = {
      daily: ['Daily', 'يومي'],
      monthly: ['Monthly', 'شهري'],
      yearly: ['Yearly', 'سنوي'],
    } as const;
    rows.push({
      field: 'rentalPeriodId',
      label: language === 'ar' ? 'دورية الإيجار' : 'Rental cadence',
      value: periodLabels[period][language === 'ar' ? 1 : 0],
    });
  }
  return rows;
}

const STUDIO_AMENITY_LABELS: Record<string, readonly [string, string]> = {
  heating: ['Heating', 'تدفئة'],
  maid_room: ['Maid room', 'غرفة خادمة'],
  laundry_room: ['Laundry room', 'غرفة غسيل'],
  solar_heater: ['Solar heater', 'سخان شمسي'],
  garden: ['Garden', 'حديقة'],
  security_guard: ['Security / Guard', 'أمن / حارس'],
  bbq_area: ['BBQ area', 'منطقة شواء'],
  private_roof: ['Private roof', 'سطح خاص'],
  hasKitchen: ['Kitchen', 'مطبخ'],
  hasHall: ['Hall', 'صالة'],
  hasParking: ['Parking', 'موقف'],
  hasPool: ['Swimming pool', 'مسبح'],
  centralAC: ['Central A/C', 'تكييف مركزي'],
  swimmingPool: ['Swimming pool', 'مسبح'],
  gym: ['Gym', 'جيم'],
  seaView: ['Sea view', 'إطلالة بحرية'],
};

export function getWantedStudioDisplayRows(
  requirement: SeekerRequirement,
  language: 'en' | 'ar',
): StudioRequirementDisplayRow[] {
  if (!isWantedStudio(requirement)) return [];
  const locale = language === 'ar' ? 1 : 0;
  const rows: StudioRequirementDisplayRow[] = [{
    field: 'studioRoomCount',
    label: language === 'ar' ? 'غرفة مفتوحة' : 'Open room',
    value: '1',
  }];
  if (requirement.bathroomsMinimum !== undefined) {
    rows.push({
      field: 'bathroomsMinimum',
      label: language === 'ar' ? 'الحد الأدنى للحمامات' : 'Minimum bathrooms',
      value: String(requirement.bathroomsMinimum),
    });
  }
  for (const preference of requirement.catalogPreferences ?? []) {
    if (preference.field === 'apartmentSubtype'
      || preference.field === 'hasBalcony'
      || preference.field === 'hasElevator') continue;
    const label = getPropertyFormField(preference.field).label[locale];
    let value: string;
    if (preference.kind === 'number') {
      const number = String(preference.value);
      value = preference.comparison === 'minimum'
        ? `${language === 'ar' ? 'الحد الأدنى' : 'At least'} ${number}`
        : preference.comparison === 'maximum'
          ? `${language === 'ar' ? 'الحد الأقصى' : 'Up to'} ${number}`
          : number;
    } else if (preference.kind === 'feature') {
      value = preference.value
        ? (language === 'ar' ? 'نعم' : 'Yes')
        : (language === 'ar' ? 'لا' : 'No');
    } else {
      value = preference.value;
    }
    rows.push({ field: preference.field, label, value });
  }
  if (requirement.centralAC !== undefined
    && !rows.some(row => row.field === 'hasCentralAC')) {
    rows.push({
      field: 'hasCentralAC',
      label: language === 'ar' ? 'تكييف مركزي' : 'Central air conditioning',
      value: requirement.centralAC
        ? (language === 'ar' ? 'نعم' : 'Yes')
        : (language === 'ar' ? 'لا' : 'No'),
    });
  }
  const amenities = [
    ...(requirement.purpose === 'rent'
      ? [requirement.swimmingPool && 'swimmingPool', requirement.gym && 'gym', requirement.seaView && 'seaView']
        .filter((value): value is string => !!value)
        .map(value => STUDIO_AMENITY_LABELS[value][locale])
      : []),
  ];
  if (amenities.length) {
    rows.push({
      field: 'preferredAmenities',
      label: language === 'ar' ? 'المزايا المفضلة' : 'Preferred amenities',
      value: [...new Set(amenities)].join(', '),
    });
  }
  return rows;
}

/**
 * Projects only approved numeric and choice fields from legacy demoCapture.
 * Canonical values remain authoritative; arbitrary metadata (including
 * private notes and precise location) is never considered for display.
 */
export function getPropertyDetailCategoryRows(
  metadata: PropertyDemoCaptureMetadata | undefined,
  canonicalDetails: Readonly<Record<string, unknown>>,
  language: 'en' | 'ar',
  propertyType: Property['core']['propertyType'],
): PropertyDetailCategoryRow[] {
  const category = getDemoCategory(metadata?.categoryId);
  if (!category || category.canonicalType !== propertyType || !metadata) return [];
  const rows: PropertyDetailCategoryRow[] = [];
  const localizedIndex = language === 'ar' ? 1 : 0;
  const hasCanonicalSnapshot = hasCanonicalTypeDetailsSnapshot(canonicalDetails, propertyType);

  for (const numericField of category.numericFields) {
    const value = metadata.numericValues?.[numericField.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[numericField.id];
    if (canonicalField && hasCanonicalSnapshot) continue;
    if (canonicalField && unwrapDetailValue(canonicalDetails[canonicalField]) !== undefined
      && unwrapDetailValue(canonicalDetails[canonicalField]) !== null) continue;
    const displayField = canonicalField ?? numericField.id;
    const canonicalDefinition = canonicalField
      ? PROPERTY_FORM_CATALOG.find(definition => definition.field === canonicalField)
      : undefined;
    rows.push({
      field: displayField,
      label: (canonicalDefinition?.label ?? numericField.label)[localizedIndex],
      value: toEnglishDigits(String(value)),
    });
  }

  for (const choiceField of category.choices) {
    const value = metadata.choices?.[choiceField.id];
    if (value === undefined) continue;
    const option = choiceField.options.find(item => item.id === value);
    if (!option) continue;
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[choiceField.id];
    if (canonicalField && hasCanonicalSnapshot) continue;
    if (canonicalField && unwrapDetailValue(canonicalDetails[canonicalField]) !== undefined
      && unwrapDetailValue(canonicalDetails[canonicalField]) !== null) continue;
    const canonicalDefinition = canonicalField
      ? PROPERTY_FORM_CATALOG.find(definition => definition.field === canonicalField)
      : undefined;
    rows.push({
      field: canonicalField ?? choiceField.id,
      label: (canonicalDefinition?.label ?? choiceField.label)[localizedIndex],
      value: option.label[localizedIndex],
    });
  }

  return rows;
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

export function getPropertyDetailVisibleContent(
  property: Pick<Property, 'core' | 'typeDetails'>,
): { readonly description?: string; readonly typeDetails: Readonly<Record<string, unknown>> } {
  return {
    ...(property.core.description ? { description: property.core.description.value } : {}),
    typeDetails: (property.typeDetails ?? {}) as Readonly<Record<string, unknown>>,
  };
}

export function getPropertySuccessRoutes(propertyCoreId?: string): {
  readonly detail: string | null;
  readonly properties: string | null;
  readonly home: '/';
} {
  if (!propertyCoreId) return { detail: null, properties: null, home: '/' };
  const id = encodeURIComponent(propertyCoreId);
  return {
    detail: `/property/${id}`,
    properties: `/properties?highlight=${id}`,
    home: '/',
  };
}

export function getPropertyDetailActionHref(
  propertyCoreId: string,
  action: 'edit' | 'share',
): string {
  return `/property/${encodeURIComponent(propertyCoreId)}/${action}`;
}

export function getStudioPropertyEditHref(propertyCoreId: string): string {
  return `/capture/studio?editPropertyId=${encodeURIComponent(propertyCoreId)}`;
}

export function getStudioRequirementEditHref(requirementId: string): string {
  return `/capture/studio?editRequirementId=${encodeURIComponent(requirementId)}`;
}

export function getStudioRequirementFallbackEditHref(requirementId: string, seekerId: string): string {
  return `/requirement/${encodeURIComponent(requirementId)}?seekerId=${encodeURIComponent(seekerId)}&edit=1`;
}

export function getPropertyDetailBackRoute(): '/properties' {
  // Edit/Share can leave a second entry for this same Detail in browser history.
  // Going to the list is deterministic even when there is no history at all.
  return '/properties';
}

export function prioritizeHighlightedProperty<T extends { readonly core: { readonly id: string } }>(
  properties: readonly T[],
  highlightedId?: string,
): T[] {
  if (!highlightedId) return [...properties];
  const highlightedIndex = properties.findIndex(property => property.core.id === highlightedId);
  if (highlightedIndex <= 0) return [...properties];
  return [properties[highlightedIndex], ...properties.slice(0, highlightedIndex), ...properties.slice(highlightedIndex + 1)];
}

export type PropertyDetailLocationField =
  | 'governorate'
  | 'area'
  | 'block'
  | 'address'
  | 'description';

export function getPropertyDetailLocationDisplay(values: Partial<Record<PropertyDetailLocationField, string>>): {
  readonly field: PropertyDetailLocationField;
  readonly value: string;
}[] {
  const order: readonly PropertyDetailLocationField[] = [
    'governorate',
    'area',
    'block',
    'address',
    'description',
  ];
  return order.flatMap(field => {
    const value = values[field];
    return value === undefined || value.length === 0 ? [] : [{ field, value }];
  });
}

export function getGalleryIndexFromScrollOffset(offset: number, pageWidth: number, imageCount: number): number {
  if (imageCount <= 0 || pageWidth <= 0 || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(imageCount - 1, Math.round(offset / pageWidth)));
}