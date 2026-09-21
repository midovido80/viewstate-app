import type { Property, PropertyDetailField } from '@workspace/property-domain';
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

const EQUIVALENT_TEMPLATE_FIELDS: Readonly<Record<string, PropertyDetailField>> = {
  bedroomCount: 'bedroomCount',
  bathroomCount: 'bathroomCount',
  floorNumber: 'floorNumber',
  floorCount: 'floorCount',
  apartmentCount: 'apartmentCount',
  shopCount: 'shopCount',
  officeCount: 'officeCount',
  parkingSpaceCount: 'parkingSpaceCount',
  elevatorCount: 'elevatorCount',
  furnishing: 'furnishing',
};

function unwrap(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}

export function projectPropertyFacts(property: Property): PropertyFactProjection {
  const canonicalArea = property.areaSquareMeters;
  const legacyArea = property.demoCapture?.areaSquareMeters;
  const conflicts: PropertyFactConflict[] = [];
  if (canonicalArea !== undefined && legacyArea !== undefined && canonicalArea !== legacyArea) {
    conflicts.push({ key: 'area', canonicalValue: canonicalArea, legacyValue: legacyArea });
  }
  const canonicalUnit = property.areaUnit;
  const legacyUnit = property.demoCapture?.areaUnit;
  if (canonicalUnit !== undefined && legacyUnit !== undefined && canonicalUnit !== legacyUnit) {
    conflicts.push({ key: 'areaUnit', canonicalValue: canonicalUnit, legacyValue: legacyUnit });
  }
  const templateFacts: Record<string, number | string | boolean> = {};
  const details = (property.typeDetails ?? {}) as Record<string, unknown>;
  const category = getDemoCategory(property.demoCapture?.categoryId);
  for (const field of category?.numericFields ?? []) {
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[field.id];
    const legacy = property.demoCapture?.numericValues?.[field.id];
    if (canonicalField && legacy !== undefined) {
      const canonical = unwrap(details[canonicalField]);
      if (canonical === undefined) templateFacts[canonicalField] = legacy;
      else if (canonical !== legacy) conflicts.push({ key: canonicalField, canonicalValue: canonical as number, legacyValue: legacy });
    }
  }
  for (const field of category?.choices ?? []) {
    const canonicalField = EQUIVALENT_TEMPLATE_FIELDS[field.id];
    const legacy = property.demoCapture?.choices?.[field.id];
    if (canonicalField && legacy !== undefined) {
      const canonical = unwrap(details[canonicalField]);
      if (canonical === undefined) templateFacts[canonicalField] = legacy;
      else if (canonical !== legacy) conflicts.push({ key: canonicalField, canonicalValue: canonical as string, legacyValue: legacy });
    }
  }
  return {
    areaSquareMeters: canonicalArea ?? legacyArea,
    areaUnit: property.areaUnit ?? property.demoCapture?.areaUnit,
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
  else candidate.areaSquareMeters = areaSquareMeters;
  if (areaUnit === undefined) delete candidate.areaUnit;
  else candidate.areaUnit = areaUnit;
  if (candidate.demoCapture) {
    const demoCapture = { ...candidate.demoCapture };
    delete (demoCapture as { areaSquareMeters?: number }).areaSquareMeters;
    delete (demoCapture as { areaUnit?: Property['areaUnit'] }).areaUnit;
    (candidate as { demoCapture?: Property['demoCapture'] }).demoCapture = demoCapture;
  }
  return candidate;
}