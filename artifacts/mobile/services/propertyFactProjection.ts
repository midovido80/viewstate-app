import { PROPERTY_DETAIL_FIELD_DEFINITIONS, type Property, type PropertyDetailField } from '@workspace/property-domain';
import { getDemoCategory } from '@/services/propertyDemoCatalog';

/**
 * Transitional fact boundary. Canonical Property fields win; demoCapture is
 * read-only compatibility data for records written by the first UX-1 build.
 * The adapter intentionally maps only facts with identical semantics.
 */
export interface PropertyFactConflict {
  readonly key: 'area' | 'areaUnit' | PropertyDetailField;
  readonly canonicalValue: number | string | boolean;
  readonly legacyValue: number | string | boolean;
}

export interface PropertyFactProjection {
  readonly areaSquareMeters?: number;
  readonly areaUnit?: Property['areaUnit'];
  readonly nearbyServices?: readonly string[];
  readonly conflicts: readonly PropertyFactConflict[];
  readonly templateFacts: Readonly<Record<string, number | string | boolean>>;
}

export const EQUIVALENT_TEMPLATE_FIELDS: Readonly<Record<string, PropertyDetailField>> = {
  bedroomCount: 'bedroomCount',
  bathroomCount: 'bathroomCount',
  floorNumber: 'floorNumber',
  floorCount: 'floorCount',
  apartmentCount: 'apartmentCount',
  shopCount: 'shopCount',
  officeCount: 'officeCount',
  roomsPerUnit: 'roomsPerUnit',
  bathroomsPerUnit: 'bathroomsPerUnit',
  parkingSpaceCount: 'parkingSpaceCount',
  elevatorCount: 'elevatorCount',
  furnishing: 'furnishing',
  maid_room: 'hasMaidRoom',
  heating: 'hasHeating',
  balcony: 'hasBalcony',
  laundry_room: 'hasLaundryRoom',
  solar_heater: 'hasSolarHeater',
  elevator: 'hasElevator',
  garden: 'hasGarden',
  security: 'hasSecurityGuard',
  bbq: 'hasBBQArea',
  pool: 'hasPool',
  central_ac: 'hasCentralAC',
};

export function hasCanonicalTypeDetailsSnapshot(
  typeDetails: Readonly<Record<string, unknown>>,
  propertyType: Property['core']['propertyType'],
): boolean {
  return typeDetails.propertyType === propertyType;
}

export function isDemoFeatureSuppressed(
  featureId: string,
  propertyType: Property['core']['propertyType'],
  canonicalValues: Readonly<Record<string, unknown>> = {},
  floorUse?: string,
): boolean {
  const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[featureId];
  if (!canonicalField || !canonicalField.startsWith('has')) return false;
  const applicable = PROPERTY_DETAIL_FIELD_DEFINITIONS.some(definition =>
    definition.field === canonicalField
    && definition.appliesTo.includes(propertyType)
    && (!definition.floorUses || propertyType !== 'floor' || definition.floorUses.includes(floorUse as 'residential' | 'commercial')),
  );
  return applicable;
}

export const SQUARE_FEET_TO_SQUARE_METERS = 0.092903;

export function squareFeetToSquareMeters(value: number): number {
  return Math.round(value * SQUARE_FEET_TO_SQUARE_METERS * 1_000_000) / 1_000_000;
}

function unwrap(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}

export function projectPropertyFacts(property: Property): PropertyFactProjection {
  const canonicalArea = property.areaSquareMeters === undefined
    ? undefined
    : property.areaUnit === 'square_foot'
      ? squareFeetToSquareMeters(property.areaSquareMeters)
      : property.areaSquareMeters;
  const legacyArea = property.demoCapture?.areaSquareMeters === undefined
    ? undefined
    : property.demoCapture.areaUnit === 'square_foot'
      ? squareFeetToSquareMeters(property.demoCapture.areaSquareMeters)
      : property.demoCapture.areaSquareMeters;
  const conflicts: PropertyFactConflict[] = [];
  if (canonicalArea !== undefined && legacyArea !== undefined && canonicalArea !== legacyArea) {
    conflicts.push({ key: 'area', canonicalValue: canonicalArea, legacyValue: legacyArea });
  }
  const canonicalUnit = property.areaUnit === 'square_foot' ? 'square_meter' : property.areaUnit;
  const legacyUnit = property.demoCapture?.areaUnit === 'square_foot' ? 'square_meter' : property.demoCapture?.areaUnit;
  if (canonicalUnit !== undefined && legacyUnit !== undefined && canonicalUnit !== legacyUnit) {
    conflicts.push({ key: 'areaUnit', canonicalValue: canonicalUnit, legacyValue: legacyUnit });
  }
  const templateFacts: Record<string, number | string | boolean> = {};
  const details = (property.typeDetails ?? {}) as Record<string, unknown>;
  const hasCanonicalSnapshot = hasCanonicalTypeDetailsSnapshot(details, property.core.propertyType);
  const demoCategory = getDemoCategory(property.demoCapture?.categoryId);
  const category = demoCategory?.canonicalType === property.core.propertyType ? demoCategory : undefined;
  for (const field of category?.numericFields ?? []) {
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[field.id];
    const legacy = property.demoCapture?.numericValues?.[field.id];
    if (canonicalField && legacy !== undefined) {
      if (hasCanonicalSnapshot) continue;
      const canonical = unwrap(details[canonicalField]);
      if (canonical === undefined) templateFacts[canonicalField] = legacy;
      else if (canonical !== legacy) conflicts.push({ key: canonicalField, canonicalValue: canonical as number, legacyValue: legacy });
    }
  }
  for (const field of category?.choices ?? []) {
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[field.id];
    const legacy = property.demoCapture?.choices?.[field.id];
    if (canonicalField && legacy !== undefined) {
      if (hasCanonicalSnapshot) continue;
      const canonical = unwrap(details[canonicalField]);
      if (canonical === undefined) templateFacts[canonicalField] = legacy;
      else if (canonical !== legacy) conflicts.push({ key: canonicalField, canonicalValue: canonical as string, legacyValue: legacy });
    }
  }
  for (const feature of category?.features ?? []) {
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[feature.id];
    if (!canonicalField || !canonicalField.startsWith('has') || !property.demoCapture?.selectedFeatures?.includes(feature.id)) continue;
    if (hasCanonicalSnapshot) continue;
    const definition = PROPERTY_DETAIL_FIELD_DEFINITIONS.find(item => item.field === canonicalField);
    const floorUse = typeof details.floorUse === 'string' ? details.floorUse : undefined;
    if (
      definition
      && definition.appliesTo.includes(property.core.propertyType)
      && (!definition.floorUses || property.core.propertyType !== 'floor' || definition.floorUses.includes(floorUse as 'residential' | 'commercial'))
      && details[canonicalField] === undefined
    ) {
      templateFacts[canonicalField] = true;
    }
  }
  return {
    areaSquareMeters: canonicalArea ?? legacyArea,
    areaUnit: canonicalUnit ?? legacyUnit,
    nearbyServices: property.nearbyServices ?? property.demoCapture?.nearbyServices,
    conflicts,
    templateFacts,
  };
}

export function hasUnresolvedPropertyFactConflicts(property: Property): boolean {
  return projectPropertyFacts(property).conflicts.length > 0;
}

export function isMappedTemplateField(fieldId: string): boolean {
  return EQUIVALENT_TEMPLATE_FIELDS[fieldId] !== undefined;
}

/** Preserve genuinely distinct template facts; never infer rooms/bedrooms or floor meanings. */
export function writeCanonicalArea(
  property: Property,
  areaSquareMeters: number | undefined,
  areaUnit: Property['areaUnit'] | undefined,
): Property {
  const candidate = { ...property } as Property & { areaSquareMeters?: number; areaUnit?: Property['areaUnit']; demoCapture?: Property['demoCapture'] };
  if (areaSquareMeters === undefined) delete candidate.areaSquareMeters;
  else candidate.areaSquareMeters = areaUnit === 'square_foot'
    ? squareFeetToSquareMeters(areaSquareMeters)
    : areaSquareMeters;
  if (areaSquareMeters === undefined) delete candidate.areaUnit;
  else candidate.areaUnit = 'square_meter';
  if (candidate.demoCapture) {
    const demoCapture = { ...candidate.demoCapture };
    delete (demoCapture as { areaSquareMeters?: number }).areaSquareMeters;
    delete (demoCapture as { areaUnit?: Property['areaUnit'] }).areaUnit;
    (candidate as { demoCapture?: Property['demoCapture'] }).demoCapture = demoCapture;
  }
  return candidate;
}