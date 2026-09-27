import type { ApartmentSubtype, CatalogPreference, PropertyDetailField, PropertyType, FloorUse } from '@workspace/property-domain';
import {
  PROPERTY_FORM_CATALOG,
  getApplicablePropertyFormFields,
} from '@/services/propertyFormCatalog';

/** Core/typed Requirement mappings, derived from the shared Foundation catalog. */
export const CANONICAL_CATALOG_FIELDS = new Set<PropertyDetailField>(
  PROPERTY_FORM_CATALOG
    .filter(definition => definition.wanted?.presentation === 'core')
    .map(definition => definition.field),
);

/** Only bounded, typed catalogPreferences marked for this UI are exposed. */
export const APPROVED_REQUIREMENT_CATALOG_FIELDS = new Set<PropertyDetailField>(
  PROPERTY_FORM_CATALOG
    .filter(definition =>
      definition.wanted?.presentation === 'leading'
      || definition.wanted?.presentation === 'specification'
      || definition.wanted?.presentation === 'amenity',
    )
    .map(definition => definition.field),
);

/** Studio-only feature preferences are deliberately excluded from generic apartment forms. */
export const STUDIO_ONLY_REQUIREMENT_CATALOG_FIELDS = new Set<PropertyDetailField>([
  'hasKitchen',
  'hasHall',
  'hasParking',
]);

export type GenericRequirementApartmentSubtype = Exclude<ApartmentSubtype, 'studio'>;

export function parseGenericRequirementApartmentSubtype(
  value?: string,
): GenericRequirementApartmentSubtype | undefined {
  if (value === 'standard') return 'standard_apartment';
  return value === 'standard_apartment' || value === 'duplex' ? value : undefined;
}

export function getGenericRequirementApartmentSubtypePreference(
  apartmentSubtype?: GenericRequirementApartmentSubtype,
): readonly CatalogPreference[] {
  return apartmentSubtype
    ? [{ field: 'apartmentSubtype', kind: 'choice', value: apartmentSubtype }]
    : [];
}

export function getGenericRequirementApartmentSubtype(
  preferences?: readonly CatalogPreference[],
): GenericRequirementApartmentSubtype | undefined {
  const preference = preferences?.find(item => item.field === 'apartmentSubtype' && item.kind === 'choice');
  if (!preference || preference.kind !== 'choice') return undefined;
  return preference.value === 'standard_apartment' || preference.value === 'duplex'
    ? preference.value
    : undefined;
}

export const isRequirementCatalogFieldAllowed = (field: PropertyDetailField): boolean => {
  const definition = PROPERTY_FORM_CATALOG.find(item => item.field === field);
  return definition?.wanted?.storage === 'catalogPreference'
    && APPROVED_REQUIREMENT_CATALOG_FIELDS.has(field)
    && !STUDIO_ONLY_REQUIREMENT_CATALOG_FIELDS.has(field)
    && !CANONICAL_CATALOG_FIELDS.has(field);
};

export function getRequirementCatalogFields(
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
) {
  return getApplicablePropertyFormFields(propertyType, floorUse, apartmentSubtype)
    .filter(definition =>
      definition.field !== 'floorUse'
      && definition.wanted?.storage === 'catalogPreference'
      && isRequirementCatalogFieldAllowed(definition.field),
    );
}

/** Divide approved controls by meaning, never by their persistence location. */
export function getRequirementPresentationFields(
  propertyType: PropertyType,
  floorUse?: FloorUse,
  apartmentSubtype?: ApartmentSubtype,
) {
  const definitions = getRequirementCatalogFields(propertyType, floorUse, apartmentSubtype);
  const leading = definitions
    .filter(definition => definition.wanted?.presentation === 'leading')
    .map(definition => definition.field);
  return {
    leading,
    specifications: definitions
      .filter(definition => definition.wanted?.presentation === 'specification')
      .map(definition => definition.field),
    amenities: definitions
      .filter(definition => definition.wanted?.presentation === 'amenity')
      .map(definition => definition.field),
  };
}

// Compatibility mapping anchors now owned by PROPERTY_FORM_CATALOG:
// 'bedroomCount', 'bathroomCount', 'hasCentralAC', 'intendedUse', 'commercialActivity'.

export const REQUIREMENT_FIELD_SECTIONS = {
  location: ['preferredAreaIds', 'preferredAreaMode'],
  core: ['bedroomsMinimum', 'masterBedroomsMinimum', 'bathroomsMinimum', 'livingRoomMinimum', 'parkingSpacesMinimum', 'floorNumber', 'requiredAreaSquareMeters'],
  amenities: ['hasMaidRoom', 'driverRoom', 'preferredAmenities'],
} as const;