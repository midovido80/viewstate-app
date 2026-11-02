/** Completion rules only: these never turn a preference into a hard match filter. */
export interface CompletionField { id: string; valid: boolean }
export function positive(value: unknown): boolean {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const n = Number(String(value).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.'));
  return Number.isFinite(n) && n > 0;
}
export function completedBudget(minimum: string, maximum: string, open: boolean): boolean {
  const parse = (raw: string) => {
    const text = raw.trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.');
    return text === '' ? undefined : /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : NaN;
  };
  if (open) return !minimum.trim() && !maximum.trim();
  const min = parse(minimum), max = parse(maximum);
  return (min === undefined || Number.isFinite(min) && min >= 0)
    && (max === undefined || Number.isFinite(max) && max > 0)
    && (min !== undefined && min > 0 || max !== undefined && max > 0)
    && !(min !== undefined && max !== undefined && min > max);
}
export function residentialUnit(type: string, values: Record<string, unknown>): boolean {
  return ['apartment', 'house', 'villa', 'chalet'].includes(type)
    || type === 'floor' && values.floorUse === 'residential'
    || type === 'other_built_property' && values.propertyUse === 'residential';
}
export function commercialProperty(type: string, values: Record<string, unknown>): boolean {
  return ['commercial_complex', 'office', 'shop', 'warehouse', 'clinic', 'medical_center'].includes(type)
    || type === 'floor' && values.floorUse === 'commercial'
    || type === 'other_built_property' && values.propertyUse === 'commercial';
}
export function propertyCompletionFields(input: {
  type: string; area: unknown; price: unknown; size: unknown; values: Record<string, unknown>; basic?: boolean;
}): CompletionField[] {
  const { type, values } = input;
  const fields = [{ id: 'locationAreaId', valid: !!input.area }, { id: 'price', valid: positive(input.price) }];
  if (input.basic) return fields;
  if (type === 'floor') fields.push({ id: 'floorUse', valid: ['residential', 'commercial'].includes(String(values.floorUse)) });
  if (type === 'other_built_property') fields.push({ id: 'propertyUse', valid: ['residential', 'commercial'].includes(String(values.propertyUse)) });
  if (commercialProperty(type, values)) fields.push({ id: 'areaSquareMeters', valid: positive(input.size) });
  if (residentialUnit(type, values)) {
    if (!(type === 'apartment' && values.apartmentSubtype === 'studio')) fields.push({ id: 'bedroomCount', valid: positive(values.bedroomCount) });
    fields.push({ id: 'bathroomCount', valid: positive(values.bathroomCount) });
  }
  if (type === 'whole_building') {
    fields.push({ id: 'apartmentCount', valid: positive(values.apartmentCount ?? values.unitCount) });
    fields.push({ id: 'sameApartmentLayout', valid: ['true', 'false'].includes(String(values.sameApartmentLayout)) });
    if (String(values.sameApartmentLayout) === 'true') fields.push(
      { id: 'roomsPerUnit', valid: positive(values.roomsPerUnit) },
      { id: 'bathroomsPerUnit', valid: positive(values.bathroomsPerUnit) },
    );
    if (String(values.sameApartmentLayout) === 'false') {
      let rows: Record<string, unknown>[] = [];
      try { rows = typeof values.apartmentLayouts === 'string' ? JSON.parse(values.apartmentLayouts) : values.apartmentLayouts as typeof rows; } catch { /* Invalid rows stay editable. */ }
      fields.push({ id: 'apartmentLayouts', valid: Array.isArray(rows) && rows.length > 0 });
      if (Array.isArray(rows)) rows.forEach((row, index) => {
        for (const key of ['apartmentCount', 'bedrooms', 'bathrooms']) fields.push({ id: `apartmentLayouts.${index}.${key}`, valid: !!row && positive(row[key]) });
      });
    }
  }
  return fields;
}
export function missingCompletionFields(fields: readonly CompletionField[]): string[] { return fields.filter(field => !field.valid).map(field => field.id); }

export function requirementCompletionFields(input: {
  type: string; floorUse?: string; propertyUse?: string; areaMode?: string; areas: readonly string[];
  bedrooms: string; bathrooms: string; size: string; minimum: string; maximum: string;
  unspecified: readonly string[];
}): CompletionField[] {
  const unit = residentialUnit(input.type, { floorUse: input.floorUse, propertyUse: input.propertyUse });
  const commercial = commercialProperty(input.type, { floorUse: input.floorUse, propertyUse: input.propertyUse });
  return [
    ...(input.type === 'other_built_property' ? [{ id: 'propertyUse', valid: ['residential', 'commercial'].includes(input.propertyUse ?? '') }] : []),
    { id: 'areas', valid: input.areaMode === 'all_kuwait' || input.areaMode === 'specific_areas' && input.areas.length > 0 },
    ...(unit ? [{ id: 'bedrooms', valid: input.unspecified.includes('bedrooms') || positive(input.bedrooms) }, { id: 'bathrooms', valid: input.unspecified.includes('bathrooms') || positive(input.bathrooms) }] : []),
    ...(commercial ? [{ id: 'area', valid: input.unspecified.includes('area') || positive(input.size) }] : []),
    { id: 'budget', valid: completedBudget(input.minimum, input.maximum, input.unspecified.includes('budget')) },
  ];
}
