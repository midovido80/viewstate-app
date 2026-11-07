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
const buildingOrder = ['housingTypes', 'floorCount', 'apartmentCount', 'apartmentsPerFloor', 'roomsPerUnit', 'bathroomsPerUnit', 'parkingSpaceCount', 'furnishing', 'buildingAgeBand', 'hasBasement'];
const buildingLabels: Record<string, readonly [string, string]> = {
  housingTypes: ['Building suitability', 'نوع العمارة'],
  floorCount: ['Floors', 'عدد الأدوار'], apartmentCount: ['Total apartments', 'إجمالي عدد الشقق'],
  apartmentsPerFloor: ['Apartments per floor', 'عدد الشقق في الدور'],
  roomsPerUnit: ['Rooms per apartment', 'الغرف في الشقة'], bathroomsPerUnit: ['Bathrooms per apartment', 'الحمامات في الشقة'],
};

const labels: Record<string, readonly [string, string]> = {
  bedroomCount: ['Bedrooms', 'غرف النوم'], masterBedroomCount: ['Master bedrooms', 'غرف ماستر'], bathroomCount: ['Bathrooms', 'حمامات'],
  livingRoomCount: ['Halls', 'صالات'], parkingSpaceCount: ['Parking', 'مواقف'], floorNumber: ['Floor', 'الطابق'],
  areaSquareMeters: ['Area', 'المساحة'], furnishing: ['Furnishing', 'التأثيث'], occupancy: ['Occupancy', 'نوع السكن'],
};
function iconFor(field: string): PropertySpecIconName {
  if (field === 'masterBedroomCount') return 'master-bedroom';
  if (/bedroom|studioRoom|^roomsPerUnit$/i.test(field)) return 'bed-outline';
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
    const label = (propertyType === 'whole_building' ? buildingLabels[fact.fieldId] : undefined)?.[language === 'ar' ? 1 : 0] ?? labels[fact.fieldId]?.[language === 'ar' ? 1 : 0] ?? fact.label;
    return [{ fieldId: fact.fieldId, label, value: propertyType === 'whole_building' && fact.fieldId === 'housingTypes' ? (language === 'ar' ? `عمارة ${value}` : `${value} building`) : value, icon: iconFor(fact.fieldId) }];
  }).sort((a, b) => {
    const rank = (id: string) => { const priority = propertyType === 'whole_building' ? buildingOrder : order; const index = priority.indexOf(id); return index < 0 ? priority.length : index; };
    return rank(a.fieldId) - rank(b.fieldId);
  });
}

/** Layout only: the centered area retains its original label/unit and is rendered once. */
export function compactSpecificationLayout(specs: readonly CompactPropertySpec[], propertyType?: string) {
  const columns: 2 | 3 = propertyType === 'whole_building' ? 2 : 3;
  const area = columns === 2 ? specs.find(spec => spec.fieldId === 'areaSquareMeters') ?? specs.find(spec => spec.fieldId === 'builtUpAreaSquareMeters') : undefined;
  return {columns, area, cells: specs.filter(spec => spec !== area)};
}
