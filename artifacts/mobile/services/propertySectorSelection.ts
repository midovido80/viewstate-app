import { PROPERTY_TYPES, type FloorUse, type PropertyType } from '@workspace/property-domain';

export type PropertySectorFilter = 'all' | FloorUse;
export type PropertyTypeChoice = PropertyType | 'duplex' | 'residential_floor' | 'commercial_floor';

const RESIDENTIAL: readonly PropertyTypeChoice[] = ['whole_building', 'apartment', 'duplex', 'residential_floor', 'house', 'villa', 'chalet', 'other_built_property'];
const COMMERCIAL: readonly PropertyTypeChoice[] = ['commercial_complex', 'commercial_floor', 'office', 'shop', 'warehouse', 'other_built_property'];

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
  const choices = PROPERTY_TYPES.flatMap<PropertyTypeChoice>(type => type === 'apartment' ? [type, 'duplex' as const] : type === 'floor' ? ['residential_floor' as const, 'commercial_floor' as const] : [type]);
  return choices.filter(type => sector === 'all' || (sector === 'residential' ? RESIDENTIAL : COMMERCIAL).includes(type));
}

export function canonicalPropertyTypeChoice(choice: PropertyTypeChoice): { propertyType: PropertyType; apartmentSubtype?: 'duplex'; floorUse?: FloorUse } {
  if (choice === 'residential_floor') return { propertyType: 'floor', floorUse: 'residential' };
  if (choice === 'commercial_floor') return { propertyType: 'floor', floorUse: 'commercial' };
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

/** Restore a selector choice from canonical route/draft data without classifying an unknown Floor. */
export function restorePropertyTypeChoice(propertyType?: PropertyType, subtype?: unknown, use?: unknown): PropertyTypeChoice | undefined {
  if (propertyType === 'floor') return parseFloorUse(use) === 'residential' ? 'residential_floor'
    : parseFloorUse(use) === 'commercial' ? 'commercial_floor' : undefined;
  if (propertyType === 'apartment' && subtype === 'duplex') return 'duplex';
  return propertyType;
}

export function getFloorTypeLabel(use: unknown, language: 'en' | 'ar', fallback: string): string {
  return parseFloorUse(use) === 'residential' ? (language === 'ar' ? 'دور سكني' : 'Residential floor')
    : parseFloorUse(use) === 'commercial' ? (language === 'ar' ? 'دور تجاري' : 'Commercial floor') : fallback;
}

export function getPropertyTypeChoiceLabel(choice: PropertyTypeChoice, language: 'en' | 'ar', fallback: string): string {
  if (choice === 'duplex') return language === 'ar' ? 'دوبلكس' : 'Duplex';
  const canonical = canonicalPropertyTypeChoice(choice);
  return canonical.propertyType === 'floor' ? getFloorTypeLabel(canonical.floorUse, language, fallback) : fallback;
}
