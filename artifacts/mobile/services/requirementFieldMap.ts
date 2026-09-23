import type { PropertyDetailField, PropertyType, FloorUse } from '@workspace/property-domain';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';

/** Canonical Requirement meanings must not be registered a second time as catalog preferences. */
export const CANONICAL_CATALOG_FIELDS = new Set<PropertyDetailField>([
  'bedroomCount',
  'bathroomCount',
  'livingRoomCount',
  'parkingSpaceCount',
  'floorNumber',
  'plotAreaSquareMeters',
  'builtUpAreaSquareMeters',
  'hasCentralAC',
]);

/** UX-2 intentionally exposes only these bounded, typed preferences. */
export const APPROVED_REQUIREMENT_CATALOG_FIELDS = new Set<PropertyDetailField>([
  'apartmentSubtype', 'furnishing', 'intendedUse', 'commercialActivity', 'hasPool', 'hasWaterfront', 'hasColdStorage',
]);

export const isRequirementCatalogFieldAllowed = (field: PropertyDetailField): boolean =>
  APPROVED_REQUIREMENT_CATALOG_FIELDS.has(field) && !CANONICAL_CATALOG_FIELDS.has(field);

export function getRequirementCatalogFields(propertyType: PropertyType, floorUse?: FloorUse) {
  return getApplicablePropertyFormFields(propertyType, floorUse)
    .filter(definition => definition.field !== 'floorUse' && isRequirementCatalogFieldAllowed(definition.field));
}

/** Divide approved controls by meaning, never by their persistence location. */
export function getRequirementPresentationFields(propertyType: PropertyType, floorUse?: FloorUse) {
  const definitions = getRequirementCatalogFields(propertyType, floorUse);
  const leading = (['apartmentSubtype', 'furnishing'] as const)
    .filter(field => definitions.some(definition => definition.field === field));
  return {
    leading,
    specifications: definitions.filter(definition => definition.group !== 'amenity' && !leading.some(field => field === definition.field)).map(definition => definition.field),
    amenities: definitions.filter(definition => definition.group === 'amenity').map(definition => definition.field),
  };
}

export const REQUIREMENT_FIELD_SECTIONS = {
  location: ['preferredAreaIds', 'preferredAreaMode'],
  core: ['bedroomsMinimum', 'masterBedroomsMinimum', 'bathroomsMinimum', 'livingRoomMinimum', 'parkingSpacesMinimum', 'floorNumber', 'requiredAreaSquareMeters'],
  amenities: ['hasMaidRoom', 'driverRoom', 'preferredAmenities'],
} as const;