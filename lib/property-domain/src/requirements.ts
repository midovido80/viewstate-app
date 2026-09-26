import type { FloorUse, LocationAreaId, PropertyType } from "./types.ts";
import type { ResidentialAmenity } from "./types.ts";
import type { PropertyDetailField } from "./taxonomy.ts";
import {
  APARTMENT_SUBTYPES,
  FLOOR_USES,
  FURNISHING_VALUES,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  RESIDENTIAL_AMENITIES,
  isFloorUse,
  isResidentialAmenity,
  isPropertyType,
} from "./taxonomy.ts";

export const REQUIREMENT_PURPOSES = ["rent", "buy"] as const;
export type RequirementPurpose = typeof REQUIREMENT_PURPOSES[number];

export const REQUIREMENT_OCCUPANCIES = ["family", "bachelor", "any"] as const;
export type RequirementOccupancy = typeof REQUIREMENT_OCCUPANCIES[number];

export const RENTAL_PERIOD_IDS = ["monthly", "yearly"] as const;
export type RequirementRentalPeriodId = typeof RENTAL_PERIOD_IDS[number];
export const REQUIREMENT_AREA_MODES = ["specific_areas", "all_kuwait"] as const;
export type RequirementAreaMode = typeof REQUIREMENT_AREA_MODES[number];

export interface SeekerRequirementBudget {
  readonly minimum: number;
  readonly maximum: number;
  readonly currencyCode: string;
}

export type RequirementConstraintStrength = "required" | "preferred";

/** Explicit strength overrides. Missing keys retain their historical defaults. */
export interface RequirementConstraintStrengths {
  readonly budget?: RequirementConstraintStrength;
  readonly preferredAreas?: RequirementConstraintStrength;
  readonly bedroomsMinimum?: RequirementConstraintStrength;
  readonly bathroomsMinimum?: RequirementConstraintStrength;
  readonly occupancy?: RequirementConstraintStrength;
  readonly swimmingPool?: RequirementConstraintStrength;
  readonly gym?: RequirementConstraintStrength;
  readonly seaView?: RequirementConstraintStrength;
  readonly centralAC?: RequirementConstraintStrength;
}
export type RequirementConstraintField = keyof RequirementConstraintStrengths;

export function getRequirementConstraintStrength(
  requirement: Pick<SeekerRequirementBase, "constraintStrengths">,
  field: RequirementConstraintField,
): RequirementConstraintStrength {
  return requirement.constraintStrengths?.[field]
    ?? (field === "budget" ? "required" : "preferred");
}

export type CatalogPreference =
  | {
    readonly field: PropertyDetailField;
    readonly kind: "number";
    readonly comparison: "exact" | "minimum" | "maximum";
    readonly value: number;
  }
  | {
    readonly field: PropertyDetailField;
    readonly kind: "choice";
    readonly value: string;
  }
  | {
    readonly field: PropertyDetailField;
    readonly kind: "feature";
    readonly value: boolean;
  };

export interface SeekerRequirementBase {
  readonly id: string;
  readonly seekerId: string;
  readonly propertyType: PropertyType;
  readonly preferredAreaIds: readonly LocationAreaId[];
  readonly preferredAreaMode?: RequirementAreaMode;
  readonly budget: SeekerRequirementBudget;
  /** Omitted for old rows; type and transaction are always hard constraints. */
  readonly constraintStrengths?: RequirementConstraintStrengths;
  readonly notes: string;
  readonly preferredAmenities?: readonly ResidentialAmenity[];
  readonly preferredAmenityExclusions?: readonly ResidentialAmenity[];
  readonly catalogPreferences?: readonly CatalogPreference[];
  readonly floorUse?: FloorUse;
  readonly masterBedroomsMinimum?: number;
  readonly driverRoom?: boolean;
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly centralAC?: boolean;
}

export interface RentSeekerRequirement extends SeekerRequirementBase {
  readonly purpose: "rent";
  readonly rentalPeriodId?: RequirementRentalPeriodId;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
}

export interface BuySeekerRequirement extends SeekerRequirementBase {
  readonly purpose: "buy";
}

export type SeekerRequirement = RentSeekerRequirement | BuySeekerRequirement;

export interface RequirementValidationIssue {
  readonly code:
    | "invalid_requirement"
    | "required"
    | "invalid_identifier"
    | "invalid_uuid_v4"
    | "invalid_seeker"
    | "invalid_purpose"
    | "invalid_property_type"
    | "invalid_area_list"
    | "invalid_area_id"
    | "duplicate_area_id"
    | "invalid_budget"
    | "invalid_currency"
    | "invalid_rent_field"
    | "invalid_occupancy"
    | "buy_rent_field_not_allowed"
    | "invalid_amenity"
    | "duplicate_amenity"
    | "amenities_not_allowed"
    | "invalid_catalog_preference"
    | "duplicate_catalog_preference"
    | "catalog_preference_not_allowed"
    | "invalid_floor_use"
    | "invalid_constraint_strength";
  readonly path: readonly string[];
  readonly message: string;
}

export type RequirementValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly RequirementValidationIssue[] };

export interface RequirementValidationOptions {
  readonly isCanonicalAreaId?: (id: string) => boolean;
  /** Read-only compatibility for pre-correction rows; new candidates stay strict. */
  readonly allowLegacyCatalogAliases?: boolean;
  /** Read compatibility only; new candidates must choose an explicit scope. */
  readonly allowLegacyEmptyAreaScope?: boolean;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RENT_FIELDS = [
  "rentalPeriodId",
  "occupancy",
  "swimmingPool",
  "gym",
  "seaView",
] as const;
const COMMON_SPEC_FIELDS = ["bedroomsMinimum", "bathroomsMinimum", "centralAC"] as const;
const REQUIREMENT_TYPED_FIELDS = ["masterBedroomsMinimum", "driverRoom"] as const;

const REQUIREMENT_FIELDS = new Set([
  "id",
  "seekerId",
  "purpose",
  "propertyType",
  "preferredAreaIds",
  "preferredAreaMode",
  "budget",
  "constraintStrengths",
  "notes",
  "preferredAmenities",
  "preferredAmenityExclusions",
  "catalogPreferences",
  "floorUse",
  ...REQUIREMENT_TYPED_FIELDS,
  ...RENT_FIELDS,
  ...COMMON_SPEC_FIELDS,
]);

const BUDGET_FIELDS = new Set(["minimum", "maximum", "currencyCode"]);
const CONSTRAINT_STRENGTH_FIELDS = new Set([
  "budget",
  "preferredAreas",
  "bedroomsMinimum",
  "bathroomsMinimum",
  "occupancy",
  "swimmingPool",
  "gym",
  "seaView",
  "centralAC",
]);
// Only meanings without a native Requirement owner may use catalogPreferences.
// In particular, Property bedroomCount/bathroomCount are facts, not aliases for
// the Requirement's bedroomsMinimum/bathroomsMinimum.
const CATALOG_NUMBER_FIELDS = new Set<PropertyDetailField>([
  "plotAreaSquareMeters", "builtUpAreaSquareMeters", "parkingSpaceCount",
  "livingRoomCount", "floorNumber",
]);
const CATALOG_COUNT_FIELDS = new Set<PropertyDetailField>([
  "parkingSpaceCount", "livingRoomCount", "floorNumber",
]);
const CATALOG_FEATURE_FIELDS = new Set<PropertyDetailField>([
  "hasMaidRoom", "hasHeating", "hasBalcony", "hasLaundryRoom",
  "hasSolarHeater", "hasElevator", "hasGarden", "hasSecurityGuard",
  "hasBBQArea", "hasPool", "hasWaterfront", "hasColdStorage",
]);
const CATALOG_NUMBER_RELATIONS: Partial<Record<PropertyDetailField, "minimum" | "exact">> = {
  plotAreaSquareMeters: "minimum",
  builtUpAreaSquareMeters: "minimum",
  parkingSpaceCount: "minimum",
  livingRoomCount: "minimum",
  floorNumber: "exact",
};
const CATALOG_CHOICE_VALUES: Partial<Record<PropertyDetailField, readonly string[]>> = {
  apartmentSubtype: APARTMENT_SUBTYPES,
  furnishing: FURNISHING_VALUES,
  // Requirement choices are a closed contract; free-form Property labels are
  // deliberately not accepted here.
  intendedUse: ["office", "retail", "warehouse", "residential"],
  commercialActivity: ["retail", "office", "restaurant", "clinic", "warehouse"],
};
const REQUIREMENT_CATALOG_FIELDS = new Set<PropertyDetailField>([
  ...CATALOG_NUMBER_FIELDS,
  ...CATALOG_FEATURE_FIELDS,
  ...(Object.keys(CATALOG_CHOICE_VALUES) as PropertyDetailField[]),
]);
const CANONICAL_CATALOG_ALIASES = new Set<PropertyDetailField>([
  "bedroomCount", "bathroomCount", "hasCentralAC",
  "hasHeating", "hasBalcony", "hasMaidRoom", "hasLaundryRoom",
  "hasSolarHeater", "hasElevator", "hasGarden", "hasSecurityGuard",
  "hasBBQArea",
]);

function issue(
  code: RequirementValidationIssue["code"],
  path: readonly string[],
  message: string,
): RequirementValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateIdentifier(
  value: unknown,
  path: readonly string[],
  uuidV4 = false,
): RequirementValidationIssue[] {
  if (typeof value !== "string" || value.length === 0) {
    return [issue("invalid_identifier", path, "A non-empty identifier is required.")];
  }
  if (value.trim().length === 0) {
    return [issue("invalid_identifier", path, "Whitespace-only identifiers are not valid.")];
  }
  if (uuidV4 && !UUID_V4_PATTERN.test(value)) {
    return [issue("invalid_uuid_v4", path, "Requirement IDs must be UUID v4 values.")];
  }
  return [];
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isBooleanOrMissing(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function hasDefinedProperty(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function copyOptional<T extends Record<string, unknown>>(
  source: Record<string, unknown>,
  keys: readonly string[],
): T {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result as T;
}

export function isRequirementPurpose(value: unknown): value is RequirementPurpose {
  return REQUIREMENT_PURPOSES.includes(value as RequirementPurpose);
}

export function isRequirementOccupancy(value: unknown): value is RequirementOccupancy {
  return REQUIREMENT_OCCUPANCIES.includes(value as RequirementOccupancy);
}

export function isRentalPeriodId(value: unknown): value is RequirementRentalPeriodId {
  return RENTAL_PERIOD_IDS.includes(value as RequirementRentalPeriodId);
}

export function isRequirementUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

/**
 * Validates only the Requirement contract. Ownership and canonical Area
 * membership are supplied by the application boundary because they depend on
 * local stores and the approved Kuwait Area dataset.
 */
export function validateSeekerRequirement(
  value: unknown,
  options: RequirementValidationOptions = {},
): RequirementValidationResult<SeekerRequirement> {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [issue("invalid_requirement", [], "A Requirement object is required.")],
    };
  }

  const issues: RequirementValidationIssue[] = [
    ...validateIdentifier(value.id, ["id"], true),
    ...validateIdentifier(value.seekerId, ["seekerId"]),
  ];
  for (const key of Object.keys(value)) {
    if (!REQUIREMENT_FIELDS.has(key)) {
      issues.push(issue(
        "invalid_requirement",
        [key],
        "Field is not part of the SeekerRequirement contract.",
      ));
    }
  }

  if (!isRequirementPurpose(value.purpose)) {
    issues.push(issue("invalid_purpose", ["purpose"], "Purpose must be rent or buy."));
  }
  if (!isPropertyType(value.propertyType)) {
    issues.push(issue("invalid_property_type", ["propertyType"], "Property Type is not approved."));
  }
  if (typeof value.notes !== "string") {
    issues.push(issue("required", ["notes"], "Broker-readable Notes must be a string."));
  }

  if (value.constraintStrengths !== undefined) {
    if (!isRecord(value.constraintStrengths)) {
      issues.push(issue("invalid_constraint_strength", ["constraintStrengths"], "Constraint strengths must be an object."));
    } else {
      for (const [field, strength] of Object.entries(value.constraintStrengths)) {
        if (!CONSTRAINT_STRENGTH_FIELDS.has(field)
          || strength !== "required" && strength !== "preferred") {
          issues.push(issue(
            "invalid_constraint_strength",
            ["constraintStrengths", field],
            "Constraint strength must be required or preferred for an approved structured criterion.",
          ));
        }
      }
    }
  }

  const areaMode = value.preferredAreaMode;
  if (areaMode !== undefined && !REQUIREMENT_AREA_MODES.includes(areaMode as RequirementAreaMode)) {
    issues.push(issue(
      "invalid_area_list",
      ["preferredAreaMode"],
      "Area mode must be specific_areas or all_kuwait.",
    ));
  }
  const hasAreaIds = Array.isArray(value.preferredAreaIds) && value.preferredAreaIds.length > 0;
  if (!Array.isArray(value.preferredAreaIds)) {
    issues.push(issue(
      "invalid_area_list",
      ["preferredAreaIds"],
      "Preferred Area IDs must be a list.",
    ));
  } else if (areaMode === "specific_areas" && value.preferredAreaIds.length === 0) {
    issues.push(issue("invalid_area_list", ["preferredAreaIds"], "Specific areas require at least one canonical Area ID."));
  } else if (areaMode === undefined && value.preferredAreaIds.length === 0 && !options.allowLegacyEmptyAreaScope) {
    issues.push(issue("invalid_area_list", ["preferredAreaIds"], "An explicit area scope is required."));
  } else if (areaMode !== "all_kuwait" && areaMode !== undefined && !hasAreaIds) {
    issues.push(issue("invalid_area_list", ["preferredAreaIds"], "Specific areas require at least one canonical Area ID."));
  } else if (areaMode === "all_kuwait" && hasAreaIds) {
    issues.push(issue("invalid_area_list", ["preferredAreaMode"], "All Kuwait cannot contain specific Area IDs."));
  } else {
    const seen = new Set<string>();
    value.preferredAreaIds.forEach((areaId, index) => {
      const path = ["preferredAreaIds", String(index)];
      if (typeof areaId !== "string" || areaId.trim().length === 0) {
        issues.push(issue("invalid_area_id", path, "A canonical Area ID is required."));
        return;
      }
      if (seen.has(areaId)) {
        issues.push(issue("duplicate_area_id", path, "Preferred Area IDs must not be duplicated."));
      }
      seen.add(areaId);
      if (options.isCanonicalAreaId && !options.isCanonicalAreaId(areaId)) {
        issues.push(issue("invalid_area_id", path, "Area ID is not in the approved Kuwait dataset."));
      }
    });
  }

  if (value.preferredAmenities !== undefined) {
    if (!Array.isArray(value.preferredAmenities)) {
      issues.push(issue("invalid_amenity", ["preferredAmenities"], "Preferred amenities must be a list."));
    } else {
      const seen = new Set<string>();
      value.preferredAmenities.forEach((amenity, index) => {
        const path = ["preferredAmenities", String(index)];
        if (!isResidentialAmenity(amenity)) {
          issues.push(issue("invalid_amenity", path, "Preferred amenity is not approved."));
          return;
        }
        if (seen.has(amenity)) {
          issues.push(issue("duplicate_amenity", path, "Preferred amenities must not be duplicated."));
        }
        seen.add(amenity);
      });
      const residentialAmenityScope = isPropertyType(value.propertyType)
        && (["apartment", "house", "villa", "chalet"].includes(value.propertyType)
          || value.propertyType === "floor" && value.floorUse === "residential");
      if (isPropertyType(value.propertyType) && !residentialAmenityScope) {
        issues.push(issue(
          "amenities_not_allowed",
          ["preferredAmenities"],
          "Preferred amenities are supported only for apartment, house, villa, or chalet Requirements.",
        ));
      }
    }
  }
  if (value.preferredAmenityExclusions !== undefined) {
    if (!Array.isArray(value.preferredAmenityExclusions)) {
      issues.push(issue("invalid_amenity", ["preferredAmenityExclusions"], "Excluded amenities must be a list."));
    } else {
      const seen = new Set<string>();
      value.preferredAmenityExclusions.forEach((amenity, index) => {
        const path = ["preferredAmenityExclusions", String(index)];
        if (!isResidentialAmenity(amenity)) {
          issues.push(issue("invalid_amenity", path, "Excluded amenity is not approved."));
        } else if (seen.has(amenity)) {
          issues.push(issue("duplicate_amenity", path, "Excluded amenities must not be duplicated."));
        }
        seen.add(amenity);
        if (Array.isArray(value.preferredAmenities) && value.preferredAmenities.includes(amenity)) {
          issues.push(issue("invalid_amenity", path, "An amenity cannot be both preferred and excluded."));
        }
      });
      const residentialAmenityScope = isPropertyType(value.propertyType)
        && (["apartment", "house", "villa", "chalet"].includes(value.propertyType)
          || value.propertyType === "floor" && value.floorUse === "residential");
      if (isPropertyType(value.propertyType) && !residentialAmenityScope) {
        issues.push(issue("amenities_not_allowed", ["preferredAmenityExclusions"], "Excluded amenities are supported only for residential Requirements."));
      }
    }
  }

  if (value.floorUse !== undefined) {
    if (value.propertyType !== "floor" || !isFloorUse(value.floorUse)) {
      issues.push(issue(
        "invalid_floor_use",
        ["floorUse"],
        "floorUse is only valid for a floor Requirement and must be approved.",
      ));
    }
  }

  if (value.catalogPreferences !== undefined) {
    if (!Array.isArray(value.catalogPreferences)) {
      issues.push(issue(
        "invalid_catalog_preference",
        ["catalogPreferences"],
        "Catalog preferences must be a list.",
      ));
    } else {
      const seen = new Set<PropertyDetailField>();
      value.catalogPreferences.forEach((preference, index) => {
        const path = ["catalogPreferences", String(index)];
        if (!isRecord(preference)) {
          issues.push(issue("invalid_catalog_preference", path, "A catalog preference object is required."));
          return;
        }
        const rawField = preference.field;
        const definition = PROPERTY_DETAIL_FIELD_DEFINITIONS.find(item => item.field === rawField);
        if (!definition) {
          issues.push(issue("invalid_catalog_preference", [...path, "field"], "Catalog field is not approved."));
          return;
        }
        const field = definition.field;
        if (seen.has(field)) {
          issues.push(issue(
            "duplicate_catalog_preference",
            [...path, "field"],
            "Catalog preference fields must not be duplicated.",
          ));
        }
        seen.add(field);

        if ((CANONICAL_CATALOG_ALIASES.has(field)
          && !(options.allowLegacyCatalogAliases && preference.kind === "feature"))
          || (!REQUIREMENT_CATALOG_FIELDS.has(field)
          && !(options.allowLegacyCatalogAliases && CANONICAL_CATALOG_ALIASES.has(field)
            && preference.kind === "feature"))) {
          issues.push(issue(
            CANONICAL_CATALOG_ALIASES.has(field) ? "invalid_catalog_preference" : "catalog_preference_not_allowed",
            [...path, "field"],
            CANONICAL_CATALOG_ALIASES.has(field)
              ? "This catalog field is already represented by a canonical Requirement field."
              : "Catalog field is not an approved Requirement preference.",
          ));
        }
        if (!isPropertyType(value.propertyType) || !definition.appliesTo.includes(value.propertyType)) {
          issues.push(issue(
            "catalog_preference_not_allowed",
            [...path, "field"],
            "Catalog field is not applicable to this Property Type.",
          ));
        }
        if (definition.floorUses && value.propertyType === "floor") {
          if (!isFloorUse(value.floorUse) || !definition.floorUses.includes(value.floorUse)) {
            issues.push(issue(
              "catalog_preference_not_allowed",
              [...path, "field"],
              "Catalog field is not applicable to this floor use.",
            ));
          }
        }

        if (preference.kind === "number") {
          if (!CATALOG_NUMBER_FIELDS.has(field)
            || (typeof preference.value !== "number"
              || !Number.isFinite(preference.value)
              || preference.value < 0
              || preference.value > Number.MAX_SAFE_INTEGER)
            || (CATALOG_COUNT_FIELDS.has(field) && !Number.isSafeInteger(preference.value))
            || (typeof preference.comparison !== "string"
              || !["exact", "minimum", "maximum"].includes(preference.comparison))
            || (CATALOG_NUMBER_RELATIONS[field] !== undefined
              && preference.comparison !== CATALOG_NUMBER_RELATIONS[field])) {
            issues.push(issue(
              "invalid_catalog_preference",
              path,
              "Numeric catalog preferences must use an approved non-negative value and comparison.",
            ));
          }
        } else if (preference.kind === "feature") {
          if (!CATALOG_FEATURE_FIELDS.has(field) || typeof preference.value !== "boolean") {
            issues.push(issue(
              "invalid_catalog_preference",
              path,
              "Feature catalog preferences must use an approved boolean field.",
            ));
          }
        } else if (preference.kind === "choice") {
          if (!CATALOG_CHOICE_VALUES[field]
            || CATALOG_NUMBER_FIELDS.has(field) || CATALOG_FEATURE_FIELDS.has(field)
            || typeof preference.value !== "string") {
            issues.push(issue(
              "invalid_catalog_preference",
              path,
              "Choice catalog preferences must use an approved choice field.",
            ));
          } else {
            const choices = CATALOG_CHOICE_VALUES[field];
            if (choices && !choices.includes(preference.value)) {
              issues.push(issue(
                "invalid_catalog_preference",
                [...path, "value"],
                "Choice value is not approved.",
              ));
            }
          }
        } else {
          issues.push(issue("invalid_catalog_preference", path, "Catalog preference kind is not approved."));
        }
      });
    }
  }

  const budget = value.budget;
  if (!isRecord(budget)) {
    issues.push(issue("invalid_budget", ["budget"], "Budget is required."));
  } else {
    for (const key of Object.keys(budget)) {
      if (!BUDGET_FIELDS.has(key)) {
        issues.push(issue(
          "invalid_budget",
          ["budget", key],
          "Field is not part of the SeekerRequirement budget contract.",
        ));
      }
    }
    if (
      typeof budget.minimum !== "number"
      || !Number.isFinite(budget.minimum)
      || budget.minimum < 0
    ) {
      issues.push(issue(
        "invalid_budget",
        ["budget", "minimum"],
        "Budget minimum must be a finite non-negative number.",
      ));
    }
    if (
      typeof budget.maximum !== "number"
      || !Number.isFinite(budget.maximum)
      || budget.maximum < 0
    ) {
      issues.push(issue(
        "invalid_budget",
        ["budget", "maximum"],
        "Budget maximum must be a finite non-negative number.",
      ));
    }
    if (
      typeof budget.minimum === "number"
      && typeof budget.maximum === "number"
      && Number.isFinite(budget.minimum)
      && Number.isFinite(budget.maximum)
      && budget.minimum > budget.maximum
    ) {
      issues.push(issue(
        "invalid_budget",
        ["budget"],
        "Budget minimum must not exceed maximum.",
      ));
    }
    if (typeof budget.currencyCode !== "string" || budget.currencyCode.trim().length === 0) {
      issues.push(issue(
        "invalid_currency",
        ["budget", "currencyCode"],
        "Budget currency must be explicitly provided.",
      ));
    }
  }

  const residentialType = ["apartment", "house", "villa", "chalet"].includes(String(value.propertyType))
    || (value.propertyType === "floor" && value.floorUse === "residential");
  if (value.bedroomsMinimum !== undefined
    && (!residentialType || !isNonNegativeInteger(value.bedroomsMinimum))) {
    issues.push(issue("invalid_requirement", ["bedroomsMinimum"], "Bedrooms must be a non-negative whole number for residential Requirements."));
  }
  if (value.bathroomsMinimum !== undefined
    && (!residentialType || !isNonNegativeInteger(value.bathroomsMinimum))) {
    issues.push(issue("invalid_requirement", ["bathroomsMinimum"], "Bathrooms must be a non-negative whole number for residential Requirements."));
  }
  if (value.masterBedroomsMinimum !== undefined) {
    if (!residentialType || !isNonNegativeInteger(value.masterBedroomsMinimum)) {
      issues.push(issue("invalid_requirement", ["masterBedroomsMinimum"], "Master bedrooms must be a non-negative whole number for residential Requirements."));
    } else if (!isNonNegativeInteger(value.bedroomsMinimum) || value.masterBedroomsMinimum > value.bedroomsMinimum) {
      issues.push(issue("invalid_requirement", ["masterBedroomsMinimum"], "Master bedrooms cannot exceed total Bedrooms."));
    }
  }
  const centralACType = ["whole_building", "apartment", "floor", "house", "villa", "chalet", "commercial_complex", "office", "shop", "warehouse", "other_built_property"].includes(String(value.propertyType));
  if (value.centralAC !== undefined && (!centralACType || typeof value.centralAC !== "boolean")) {
    issues.push(issue("invalid_requirement", ["centralAC"], "Central A/C must be a boolean for an applicable Property type."));
  }
  if (value.driverRoom !== undefined && (!residentialType || typeof value.driverRoom !== "boolean")) {
    issues.push(issue("invalid_requirement", ["driverRoom"], "Driver room must be a boolean for residential Requirements."));
  }

  if (value.purpose === "rent") {
    if (value.rentalPeriodId !== undefined && !isRentalPeriodId(value.rentalPeriodId)) {
      issues.push(issue(
        "invalid_rent_field",
        ["rentalPeriodId"],
        "rentalPeriodId must be monthly or yearly when provided.",
      ));
    }
    if (value.occupancy !== undefined && !isRequirementOccupancy(value.occupancy)) {
      issues.push(issue("invalid_occupancy", ["occupancy"], "Occupancy is not approved."));
    }
    for (const field of ["swimmingPool", "gym", "seaView"] as const) {
      if (!isBooleanOrMissing(value[field])) {
        issues.push(issue(
          "invalid_rent_field",
          [field],
          `${field} must be a boolean when provided.`,
        ));
      }
    }
  } else if (value.purpose === "buy") {
    for (const field of RENT_FIELDS) {
      if (hasDefinedProperty(value, field)) {
        issues.push(issue(
          "buy_rent_field_not_allowed",
          [field],
          "Rent-only fields cannot be active on a Buy Requirement.",
        ));
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as unknown as SeekerRequirement };
}

/**
 * Creates a stable serialized shape without changing literal Notes, Area
 * order, missing optional values, or explicit occupancy = any.
 */
export function normalizeSeekerRequirement(
  value: unknown,
  options: RequirementValidationOptions = {},
): RequirementValidationResult<SeekerRequirement> {
  let validation = validateSeekerRequirement(value, options);
  if (!validation.ok && isRecord(value)) {
    const legacy = validateSeekerRequirement(value, {
      ...options,
      allowLegacyCatalogAliases: true,
      allowLegacyEmptyAreaScope: true,
    });
    const onlyLegacyAliases = legacy.ok === true
      && validation.issues.length > 0
      && validation.issues.every(item =>
        (item.code === "invalid_catalog_preference" && item.path[0] === "catalogPreferences")
        || (item.code === "invalid_area_list" && item.path[0] === "preferredAreaIds"));
    if (onlyLegacyAliases) validation = legacy;
  }
  if (!validation.ok) return validation;

  const source = validation.value as unknown as Record<string, unknown>;
  const legacyAmenityByField: Partial<Record<PropertyDetailField, ResidentialAmenity>> = {
    hasHeating: "heating", hasBalcony: "balcony", hasMaidRoom: "maid_room",
    hasLaundryRoom: "laundry_room", hasSolarHeater: "solar_heater",
    hasElevator: "elevator", hasGarden: "garden",
    hasSecurityGuard: "security_guard", hasBBQArea: "bbq_area",
  };
  const legacyAmenities = (validation.value.catalogPreferences ?? [])
    .flatMap(preference => preference.kind === "feature" && preference.value === true
      ? (legacyAmenityByField[preference.field] ? [legacyAmenityByField[preference.field]!] : [])
      : []);
  const legacyAmenityExclusions = (validation.value.catalogPreferences ?? [])
    .flatMap(preference => preference.kind === "feature" && preference.value === false
      ? (legacyAmenityByField[preference.field] ? [legacyAmenityByField[preference.field]!] : [])
      : []);
  const preferredAmenities = [
    ...new Set([...(validation.value.preferredAmenities ?? []), ...legacyAmenities]),
  ];
  const excludedAmenities = [
    ...new Set([...(validation.value.preferredAmenityExclusions ?? []), ...legacyAmenityExclusions]),
  ];
  const amenityConflict = preferredAmenities.some(amenity => excludedAmenities.includes(amenity));
  if (amenityConflict) {
    return {
      ok: false,
      issues: [issue("invalid_amenity", ["preferredAmenities"], "An amenity cannot be both preferred and excluded.")],
    };
  }
  const remainingCatalogPreferences = (validation.value.catalogPreferences ?? [])
    .filter(preference => !CANONICAL_CATALOG_ALIASES.has(preference.field))
    .map(preference => ({ ...preference }));
  const base = {
    id: validation.value.id,
    seekerId: validation.value.seekerId,
    purpose: validation.value.purpose,
    propertyType: validation.value.propertyType,
    preferredAreaIds: [...validation.value.preferredAreaIds],
    ...(source.preferredAreaMode !== undefined
      ? { preferredAreaMode: validation.value.preferredAreaMode }
      : {}),
    budget: {
      minimum: validation.value.budget.minimum,
      maximum: validation.value.budget.maximum,
      currencyCode: validation.value.budget.currencyCode,
    },
    ...(source.constraintStrengths !== undefined
      ? { constraintStrengths: { ...(validation.value.constraintStrengths ?? {}) } }
      : {}),
    notes: validation.value.notes,
    ...(source.bedroomsMinimum !== undefined
      ? { bedroomsMinimum: validation.value.bedroomsMinimum }
      : {}),
    ...(source.bathroomsMinimum !== undefined
      ? { bathroomsMinimum: validation.value.bathroomsMinimum }
      : {}),
    ...(source.centralAC !== undefined
      ? { centralAC: validation.value.centralAC }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(source, "preferredAmenities")
      ? { preferredAmenities: RESIDENTIAL_AMENITIES.filter((amenity) => preferredAmenities.includes(amenity)) }
      : (legacyAmenities.length ? { preferredAmenities: legacyAmenities } : {})),
    ...(excludedAmenities.length ? { preferredAmenityExclusions: excludedAmenities } : {}),
    ...(remainingCatalogPreferences.length ? { catalogPreferences: remainingCatalogPreferences } : {}),
    ...(source.floorUse !== undefined
      ? { floorUse: validation.value.floorUse }
      : {}),
    ...(source.masterBedroomsMinimum !== undefined
      ? { masterBedroomsMinimum: validation.value.masterBedroomsMinimum }
      : {}),
    ...(source.driverRoom !== undefined
      ? { driverRoom: validation.value.driverRoom }
      : {}),
  };

  if (validation.value.purpose === "buy") {
    return { ok: true, value: base as BuySeekerRequirement };
  }

  return {
    ok: true,
    value: {
      ...base,
      ...copyOptional<Record<string, unknown>>(source, RENT_FIELDS),
    } as RentSeekerRequirement,
  };
}