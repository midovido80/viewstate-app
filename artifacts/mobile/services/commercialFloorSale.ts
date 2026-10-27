import type { PropertyDetailField } from '@workspace/property-domain';

export const COMMERCIAL_FLOOR_SALE_FIELDS: readonly PropertyDetailField[] = [
  'buildingAgeBand', 'floorNumber', 'bathroomCount', 'parkingTypes', 'privateParkingCount',
  'intendedUse', 'rentalOccupancy', 'monthlyIncome',
];
export const COMMERCIAL_FLOOR_SALE_AMENITIES: readonly PropertyDetailField[] = [
  'hasCentralAC', 'hasElevator', 'hasBalcony', 'hasPrivateEntrance', 'hasKitchen', 'hasSecurityGuard', 'hasAccessibleEntrance',
];
export const COMMERCIAL_FLOOR_SALE_OCCUPANCY = [
  ['vacant', 'Vacant', 'شاغر'], ['rented', 'Rented', 'مؤجر'],
] as const;

export function isCommercialFloorSale(propertyType?: string, floorUse?: unknown, transaction?: string): boolean {
  return propertyType === 'floor' && floorUse === 'commercial' && transaction === 'sale';
}

/** Restricts the sale presentation without deleting legacy fields from storage. */
export function isCommercialFloorSaleFieldVisible(field: PropertyDetailField): boolean {
  return COMMERCIAL_FLOOR_SALE_FIELDS.includes(field) || COMMERCIAL_FLOOR_SALE_AMENITIES.includes(field);
}

export function commercialFloorSaleFieldRank(field: string): number {
  const index = COMMERCIAL_FLOOR_SALE_FIELDS.indexOf(field as PropertyDetailField);
  return index < 0 ? COMMERCIAL_FLOOR_SALE_FIELDS.length : index;
}

export function commercialFloorSaleLabel(field: PropertyDetailField, language: 'en' | 'ar', fallback: string): string {
  const labels: Partial<Record<PropertyDetailField, readonly [string, string]>> = {
    buildingAgeBand: ['Property age', 'عمر العقار'],
    hasElevator: ['Elevator serving the floor', 'مصعد يخدم الدور'],
    hasKitchen: ['Private kitchen / pantry', 'مطبخ / بوفيه خاص بالدور'],
    hasSecurityGuard: ['Building security / guard', 'أمن / حارس للمبنى'],
  };
  return labels[field]?.[language === 'ar' ? 1 : 0] ?? fallback;
}
