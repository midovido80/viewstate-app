import { FORM_JSON_FIELDS, FORM_MULTI_FIELDS, FORM_STRING_FIELDS, getPropertyFormProfile, isPropertyProfileFieldVisible, propertyFormValueToDraft, type Property, type PropertyDetailField } from '@workspace/property-domain';
export { getPropertyFormProfile, isPropertyProfileFieldVisible, propertyFormValueToDraft };
export const PROFILE_CHOICES: Partial<Record<PropertyDetailField, readonly (readonly [string, string, string])[]>> = {
  housingTypes: [['company_staff', 'Companies / staff', 'شركات / موظفون'], ['bachelor', 'Bachelors', 'عزاب'], ['family', 'Families', 'عائلات'], ['women', 'Women', 'سيدات'], ['mixed', 'Mixed housing', 'مختلط']],
  buildingParkingTypes: [['public_yard', 'Public yard', 'ساحة عامة'], ['in_building', 'Building parking', 'مواقف بالبناية']],
  rentalScope: [['entire', 'Entire complex', 'كامل المجمع'], ['partial', 'Part of the complex', 'جزء من المجمع']],
  furnishing: [['unfurnished', 'Unfurnished', 'غير مؤثث'], ['semi_furnished', 'Semi-furnished', 'نصف مؤثث'], ['furnished', 'Furnished', 'مؤثث']],
  occupancy: [['family', 'Family', 'عائلات'], ['bachelor', 'Bachelor', 'عزاب'], ['any', 'Any', 'الكل']],
};
export function parsePropertyProfileValue(field: PropertyDetailField, raw: string): unknown {
  if ((FORM_JSON_FIELDS as readonly string[]).includes(field)) return JSON.parse(raw);
  if ((FORM_MULTI_FIELDS as readonly string[]).includes(field)) return raw.split(',').filter(Boolean);
  if ((FORM_STRING_FIELDS as readonly string[]).includes(field)) return raw;
  if (field.startsWith('has') || field === 'sameApartmentLayout' || field === 'sameApartmentsPerFloor') return raw === 'true';
  return undefined;
}
/** Hidden historical facts are retained in the stored row, not in the visible form. */
export function preserveHistoricalProfileFacts(baseline: Property, values: Record<string, unknown>): Record<string, unknown> {
  const old = (baseline.typeDetails ?? {}) as unknown as Record<string, unknown>;
  const profile = getPropertyFormProfile(baseline.core.propertyType, baseline.activeOffer.transaction, values);
  if (!profile) return values;
  const allowed = new Set<string>([...profile.fields, ...profile.amenities]);
  for (const [field, value] of Object.entries(old)) if (field !== 'propertyType' && !allowed.has(field)) values[field] = value;
  return values;
}
