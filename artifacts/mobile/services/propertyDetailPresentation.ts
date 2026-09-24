import { APARTMENT_SUBTYPES, type Property, type PropertyDetailField } from '@workspace/property-domain';
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

export function getPropertyDetailBackAction(canGoBack: boolean): 'back' | 'home' {
  return canGoBack ? 'back' : 'home';
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