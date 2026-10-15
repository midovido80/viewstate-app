import { PROPERTY_TYPES, type FloorUse, type PropertyType } from '@workspace/property-domain';

export type PropertySectorFilter = 'all' | FloorUse;
export type PropertyTypeChoice = PropertyType | 'duplex';

const RESIDENTIAL: readonly PropertyTypeChoice[] = ['whole_building', 'apartment', 'duplex', 'floor', 'house', 'villa', 'chalet', 'other_built_property'];
const COMMERCIAL: readonly PropertyTypeChoice[] = ['commercial_complex', 'floor', 'office', 'shop', 'warehouse', 'other_built_property'];

export function parseFloorUse(value: unknown): FloorUse | undefined {
  return value === 'residential' || value === 'commercial' ? value : undefined;
}

export function parsePropertySector(value: unknown): PropertySectorFilter {
  return parseFloorUse(value) ?? 'all';
}

export function togglePropertySector(current: PropertySectorFilter, pressed: PropertySectorFilter): PropertySectorFilter {
  return current === pressed ? 'all' : pressed;
}

export function getPropertyTypeChoices(sector: PropertySectorFilter): readonly PropertyTypeChoice[] {
  const choices = PROPERTY_TYPES.flatMap(type => type === 'apartment' ? [type, 'duplex' as const] : [type]);
  return choices.filter(type => sector === 'all' || (sector === 'residential' ? RESIDENTIAL : COMMERCIAL).includes(type));
}

export function canonicalPropertyTypeChoice(choice: PropertyTypeChoice) {
  return choice === 'duplex'
    ? { propertyType: 'apartment' as const, apartmentSubtype: 'duplex' as const }
    : { propertyType: choice };
}

/** Shared types need an explicit stored use; never infer it from labels or notes. */
export function getBuiltPropertySector(propertyType: PropertyType, use?: unknown): FloorUse | undefined {
  if (propertyType === 'floor' || propertyType === 'other_built_property') return parseFloorUse(use);
  if (RESIDENTIAL.includes(propertyType) && !COMMERCIAL.includes(propertyType)) return 'residential';
  if (COMMERCIAL.includes(propertyType) && !RESIDENTIAL.includes(propertyType)) return 'commercial';
  return undefined;
}
