import type { PropertySpecIconName } from '@/components/PropertySpecIcon';

export interface CompactPropertySpec {
  fieldId: string;
  label: string;
  value: string;
  icon: PropertySpecIconName;
}
export interface PropertyDisplayFact {
  fieldId: string;
  label: string;
  value: string | number | boolean | undefined | null;
}

const order = ['studioRoomCount', 'bedroomCount', 'masterBedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount', 'floorNumber', 'areaSquareMeters', 'builtUpAreaSquareMeters', 'furnishing', 'occupancy'];
const labels: Record<string, readonly [string, string]> = {
  bedroomCount: ['Bedrooms', 'غرف النوم'], masterBedroomCount: ['Master bedrooms', 'غرف ماستر'], bathroomCount: ['Bathrooms', 'حمامات'],
  livingRoomCount: ['Halls', 'صالات'], parkingSpaceCount: ['Parking', 'مواقف'], floorNumber: ['Floor', 'الطابق'],
  areaSquareMeters: ['Area', 'المساحة'], furnishing: ['Furnishing', 'التأثيث'], occupancy: ['Occupancy', 'نوع السكن'],
};
function iconFor(field: string): PropertySpecIconName {
  if (field === 'masterBedroomCount') return 'master-bedroom';
  if (/bedroom|studioRoom/i.test(field)) return 'bed-outline';
  if (/bathroom/i.test(field)) return 'shower';
  if (/livingRoom|hasHall|furnishing/i.test(field)) return 'sofa-outline';
  if (/parking/i.test(field)) return 'car';
  if (/floor|basement/i.test(field)) return 'stairs';
  if (/area|width|height|capacity/i.test(field)) return 'set-square';
  if (/yield/i.test(field)) return 'percent';
  if (/occupancy/i.test(field)) return 'users';
  if (/age/i.test(field)) return 'calendar';
  if (/income/i.test(field)) return 'money';
  return 'building';
}

/** Accepts only the existing privacy/applicability-filtered display facts. No writes or matching rules. */
export function compactPropertySpecs(facts: readonly PropertyDisplayFact[], language: 'en' | 'ar', propertyType: string): CompactPropertySpec[] {
  const seen = new Set<string>();
  return facts.flatMap(fact => {
    if (fact.value === undefined || fact.value === null || fact.value === '') return [];
    if (propertyType === 'floor' && fact.fieldId === 'floorUse' || propertyType === 'apartment' && fact.fieldId === 'apartmentSubtype') return [];
    if (seen.has(fact.fieldId)) return [];
    seen.add(fact.fieldId);
    const value = typeof fact.value === 'boolean' ? (language === 'ar' ? fact.value ? 'نعم' : 'لا' : fact.value ? 'Yes' : 'No') : String(fact.value);
    return [{ fieldId: fact.fieldId, label: labels[fact.fieldId]?.[language === 'ar' ? 1 : 0] ?? fact.label, value, icon: iconFor(fact.fieldId) }];
  }).sort((a, b) => {
    const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
    return rank(a.fieldId) - rank(b.fieldId);
  });
}
