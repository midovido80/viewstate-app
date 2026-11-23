import type { FloorUse, PropertyType } from './types.ts';

/** Preferences only: a PACI count is not a PACI identifier or licensing approval. */
export interface CommercialRequirementServices {
  readonly automaticNumberCount?: number;
  readonly cleaning?: boolean;
  readonly security?: boolean;
  readonly cameras?: boolean;
  readonly elevators?: boolean;
  readonly bathrooms?: 'private' | 'shared';
  readonly kitchen?: 'private' | 'shared';
  readonly parkingTypes?: readonly ('private' | 'public' | 'paid')[];
}
export function isCommercialRequirement(type: PropertyType, floorUse?: FloorUse, propertyUse?: FloorUse): boolean {
  return ['office', 'shop', 'warehouse', 'clinic', 'medical_center', 'commercial_complex'].includes(type)
    || (type === 'floor' && floorUse === 'commercial')
    || (type === 'other_built_property' && propertyUse === 'commercial');
}
export function hasOfficeRequirementServices(type: PropertyType, floorUse?: FloorUse): boolean {
  return type === 'office' || (type === 'floor' && floorUse === 'commercial');
}
export function cloneCommercialServices(value: CommercialRequirementServices): CommercialRequirementServices {
  return { ...Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)), ...(value.parkingTypes ? { parkingTypes: [...value.parkingTypes] } : {}) };
}
export function commercialServiceErrors(value: unknown, office: boolean): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['commercialServices'];
  const fields = value as Record<string, unknown>;
  const allowed = new Set(['automaticNumberCount', 'cleaning', 'security', 'cameras', 'elevators', 'bathrooms', 'kitchen', 'parkingTypes']);
  return Object.entries(fields).flatMap(([key, item]) => {
    if (!allowed.has(key) || (!office && key !== 'parkingTypes')) return [key];
    if (item === undefined) return [];
    const valid = key === 'automaticNumberCount' ? typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
      : key === 'bathrooms' || key === 'kitchen' ? item === 'private' || item === 'shared'
      : key === 'parkingTypes' ? Array.isArray(item) && item.every(v => ['private', 'public', 'paid'].includes(v)) && new Set(item).size === item.length
      : typeof item === 'boolean';
    return valid ? [] : [key];
  });
}
