import type { FloorUse, LocationAreaId, PropertyType } from "./types.ts";
import { isPropertyType } from "./taxonomy.ts";

export const REQUIREMENT_PURPOSES = ["rent", "buy"] as const;
export type RequirementPurpose = typeof REQUIREMENT_PURPOSES[number];

export const REQUIREMENT_OCCUPANCIES = ["family", "bachelor", "any"] as const;
export type RequirementOccupancy = typeof REQUIREMENT_OCCUPANCIES[number];

export interface SeekerRequirementBudget {
  readonly minimum: number;
  readonly maximum: number;
  readonly currencyCode: string;
}

export interface SeekerRequirementBase {
  readonly id: string;
  readonly seekerId: string;
  readonly propertyType: PropertyType;
  readonly preferredAreaIds: readonly LocationAreaId[];
  readonly budget: SeekerRequirementBudget;
  readonly notes: string;
  readonly floorUse?: FloorUse;
  readonly minimumBuiltUpAreaSquareMeters?: number;
  readonly maximumBuiltUpAreaSquareMeters?: number;
  readonly commercialActivity?: string;
  readonly floorNumber?: number;
  readonly minimumFrontageWidthMeters?: number;
  /** Informational Property-backed details; Matching deliberately ignores these. */
  readonly minimumPlotAreaSquareMeters?: number;
  readonly maximumPlotAreaSquareMeters?: number;
  readonly floorCount?: number;
  readonly apartmentCount?: number;
  readonly shopCount?: number;
  readonly intendedUse?: string;
  readonly paciNumbersCount?: number;
}

export interface RentSeekerRequirement extends SeekerRequirementBase {
  readonly purpose: "rent";
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
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
    | "invalid_shop_field"
    | "shop_field_not_allowed"
    | "invalid_commercial_area"
    | "commercial_area_field_not_allowed"
    | "invalid_property_detail"
    | "property_detail_field_not_allowed"
    | "invalid_floor_use"
    | "floor_use_field_not_allowed";
  readonly path: readonly string[];
  readonly message: string;
}

export type RequirementValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly RequirementValidationIssue[] };

export interface RequirementValidationOptions {
  readonly isCanonicalAreaId?: (id: string) => boolean;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RENT_FIELDS = [
  "bedroomsMinimum",
  "bathroomsMinimum",
  "occupancy",
  "swimmingPool",
  "gym",
  "seaView",
  "centralAC",
] as const;

const REQUIREMENT_FIELDS = new Set([
  "id",
  "seekerId",
  "purpose",
  "propertyType",
  "preferredAreaIds",
  "budget",
  "notes",
  "floorUse",
  ...RENT_FIELDS,
  "minimumBuiltUpAreaSquareMeters",
  "maximumBuiltUpAreaSquareMeters",
  "commercialActivity",
  "floorNumber",
  "minimumFrontageWidthMeters",
  "minimumPlotAreaSquareMeters",
  "maximumPlotAreaSquareMeters",
  "floorCount",
  "apartmentCount",
  "shopCount",
  "intendedUse",
  "paciNumbersCount",
]);
const COMMERCIAL_AREA_FIELDS = [
  "minimumBuiltUpAreaSquareMeters",
  "maximumBuiltUpAreaSquareMeters",
] as const;
const SHOP_FIELDS = [
  "commercialActivity",
  "floorNumber",
  "minimumFrontageWidthMeters",
] as const;
const PLOT_AREA_FIELDS = [
  "minimumPlotAreaSquareMeters",
  "maximumPlotAreaSquareMeters",
] as const;
const BUILDING_DETAIL_FIELDS = ["floorCount", "apartmentCount", "shopCount"] as const;
const INFORMATIONAL_TEXT_FIELDS = ["intendedUse"] as const;
const INFORMATIONAL_COUNT_FIELDS = ["paciNumbersCount"] as const;

const BUDGET_FIELDS = new Set(["minimum", "maximum", "currencyCode"]);
const FLOOR_USES = ["residential", "commercial"] as const;

export const COMMERCIAL_AREA_REQUIREMENT_PROPERTY_TYPES = [
  "shop",
  "office",
  "floor",
] as const;

export function isCommercialAreaRequirementPropertyType(
  value: PropertyType,
): boolean {
  return COMMERCIAL_AREA_REQUIREMENT_PROPERTY_TYPES.includes(
    value as typeof COMMERCIAL_AREA_REQUIREMENT_PROPERTY_TYPES[number],
  );
}

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
  if (value.propertyType === "floor") {
    if (
      value.floorUse !== undefined
      && !FLOOR_USES.includes(value.floorUse as FloorUse)
    ) {
      issues.push(issue(
        "invalid_floor_use",
        ["floorUse"],
        "Floor use must be residential or commercial when provided.",
      ));
    }
  } else if (hasDefinedProperty(value, "floorUse")) {
    issues.push(issue(
      "floor_use_field_not_allowed",
      ["floorUse"],
      "Floor use is only allowed on Floor Requirements.",
    ));
  }

  if (
    isPropertyType(value.propertyType)
    && isCommercialAreaRequirementPropertyType(value.propertyType)
    && !(value.propertyType === "floor" && value.floorUse === "residential")
  ) {
    for (const field of COMMERCIAL_AREA_FIELDS) {
      if (
        value[field] !== undefined
        && (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] <= 0)
      ) {
        issues.push(issue(
          "invalid_commercial_area",
          [field],
          `${field} must be a positive finite number when provided.`,
        ));
      }
    }
    if (
      typeof value.minimumBuiltUpAreaSquareMeters === "number"
      && Number.isFinite(value.minimumBuiltUpAreaSquareMeters)
      && typeof value.maximumBuiltUpAreaSquareMeters === "number"
      && Number.isFinite(value.maximumBuiltUpAreaSquareMeters)
      && value.minimumBuiltUpAreaSquareMeters > value.maximumBuiltUpAreaSquareMeters
    ) {
      issues.push(issue(
        "invalid_commercial_area",
        [...COMMERCIAL_AREA_FIELDS],
        "Commercial area minimum must not exceed maximum.",
      ));
    }
  } else {
    for (const field of COMMERCIAL_AREA_FIELDS) {
      if (hasDefinedProperty(value, field)) {
        issues.push(issue(
          "commercial_area_field_not_allowed",
          [field],
          "Commercial area criteria are only allowed for Shop, Office, and Floor Requirements.",
        ));
      }
    }
  }

  const commercialFloor = value.propertyType === "floor"
    && value.floorUse === "commercial";
  const commercialFloorOrLegacy = value.propertyType === "floor"
    && value.floorUse !== "residential";
  if (value.propertyType === "shop" || commercialFloor) {
    for (const field of RENT_FIELDS) {
      if (hasDefinedProperty(value, field)) {
        issues.push(issue(
          "shop_field_not_allowed",
          [field],
          "Residential Rent criteria are not allowed on commercial Requirements.",
        ));
      }
    }
    for (const field of ["minimumFrontageWidthMeters"] as const) {
      if (
        value[field] !== undefined
        && (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] <= 0)
      ) {
        issues.push(issue(
          "invalid_shop_field",
          [field],
          `${field} must be a positive finite number when provided.`,
        ));
      }
    }
    if (value.floorNumber !== undefined && !isNonNegativeInteger(value.floorNumber)) {
      issues.push(issue(
        "invalid_shop_field",
        ["floorNumber"],
        "floorNumber must be a non-negative integer when provided.",
      ));
    }
    if (
      value.commercialActivity !== undefined
      && (typeof value.commercialActivity !== "string" || value.commercialActivity.trim().length === 0)
    ) {
      issues.push(issue(
        "invalid_shop_field",
        ["commercialActivity"],
        "commercialActivity must be a non-empty literal string when provided.",
      ));
    }
  } else if (value.propertyType === "office") {
    for (const field of ["minimumFrontageWidthMeters"] as const) {
      if (hasDefinedProperty(value, field)) {
        issues.push(issue("shop_field_not_allowed", [field], "Frontage is only allowed on Shop or Commercial Floor Requirements."));
      }
    }
    for (const field of ["floorNumber"] as const) {
      if (value[field] !== undefined && !isNonNegativeInteger(value[field])) {
        issues.push(issue("invalid_shop_field", [field], `${field} must be a non-negative integer when provided.`));
      }
    }
    for (const field of ["commercialActivity"] as const) {
      if (value[field] !== undefined && (typeof value[field] !== "string" || value[field].trim().length === 0)) {
        issues.push(issue("invalid_shop_field", [field], `${field} must be a non-empty literal string when provided.`));
      }
    }
  } else if (!commercialFloorOrLegacy) {
    for (const field of SHOP_FIELDS) {
      if (hasDefinedProperty(value, field)) {
        issues.push(issue(
          "shop_field_not_allowed",
          [field],
          "Commercial criteria are only allowed on Shop or Commercial Floor Requirements.",
        ));
      }
    }
  }

  const allowsPlotArea = value.propertyType === "commercial_complex" || value.propertyType === "whole_building";
  for (const field of PLOT_AREA_FIELDS) {
    if (value[field] !== undefined && (!allowsPlotArea || typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] <= 0)) {
      issues.push(issue(allowsPlotArea ? "invalid_property_detail" : "property_detail_field_not_allowed", [field], allowsPlotArea ? `${field} must be a positive finite number when provided.` : `${field} is not compatible with this Property Type.`));
    }
  }
  if (typeof value.minimumPlotAreaSquareMeters === "number" && typeof value.maximumPlotAreaSquareMeters === "number" && value.minimumPlotAreaSquareMeters > value.maximumPlotAreaSquareMeters) {
    issues.push(issue("invalid_property_detail", [...PLOT_AREA_FIELDS], "Plot area minimum must not exceed maximum."));
  }
  const detailTypes: Record<string, readonly PropertyType[]> = {
    floorCount: ["commercial_complex", "whole_building"],
    apartmentCount: ["whole_building"],
    shopCount: ["commercial_complex"],
    intendedUse: ["office", "floor"],
    paciNumbersCount: ["floor"],
  };
  for (const field of [...BUILDING_DETAIL_FIELDS, ...INFORMATIONAL_TEXT_FIELDS, ...INFORMATIONAL_COUNT_FIELDS]) {
    const allowed = detailTypes[field].includes(value.propertyType as PropertyType)
      && (field !== "intendedUse" && field !== "paciNumbersCount" || value.propertyType !== "floor" || value.floorUse === "commercial");
    if (value[field] === undefined) continue;
    if (!allowed) {
      issues.push(issue("property_detail_field_not_allowed", [field], `${field} is not compatible with this Property Type.`));
    } else if (field === "intendedUse" && (typeof value[field] !== "string" || value[field].trim().length === 0)) {
      issues.push(issue("invalid_property_detail", [field], "intendedUse must be a non-empty literal string when provided."));
    } else if (field !== "intendedUse" && !isNonNegativeInteger(value[field])) {
      issues.push(issue("invalid_property_detail", [field], `${field} must be a non-negative integer when provided.`));
    }
  }

  if (!Array.isArray(value.preferredAreaIds) || value.preferredAreaIds.length === 0) {
    issues.push(issue(
      "invalid_area_list",
      ["preferredAreaIds"],
      "At least one preferred canonical Area ID is required.",
    ));
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

  if (value.purpose === "rent") {
    for (const field of ["bedroomsMinimum", "bathroomsMinimum"] as const) {
      if (value[field] !== undefined && !isNonNegativeInteger(value[field])) {
        issues.push(issue(
          "invalid_rent_field",
          [field],
          `${field} must be a non-negative integer when provided.`,
        ));
      }
    }
    if (value.occupancy !== undefined && !isRequirementOccupancy(value.occupancy)) {
      issues.push(issue("invalid_occupancy", ["occupancy"], "Occupancy is not approved."));
    }
    for (const field of ["swimmingPool", "gym", "seaView", "centralAC"] as const) {
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
  const validation = validateSeekerRequirement(value, options);
  if (!validation.ok) return validation;

  const source = validation.value as unknown as Record<string, unknown>;
  const base = {
    id: validation.value.id,
    seekerId: validation.value.seekerId,
    purpose: validation.value.purpose,
    propertyType: validation.value.propertyType,
    preferredAreaIds: [...validation.value.preferredAreaIds],
    budget: {
      minimum: validation.value.budget.minimum,
      maximum: validation.value.budget.maximum,
      currencyCode: validation.value.budget.currencyCode,
    },
    notes: validation.value.notes,
    ...copyOptional<Record<string, unknown>>(source, ["floorUse"] as const),
    ...copyOptional<Record<string, unknown>>(source, COMMERCIAL_AREA_FIELDS),
    ...copyOptional<Record<string, unknown>>(source, SHOP_FIELDS),
    ...copyOptional<Record<string, unknown>>(source, PLOT_AREA_FIELDS),
    ...copyOptional<Record<string, unknown>>(source, BUILDING_DETAIL_FIELDS),
    ...copyOptional<Record<string, unknown>>(source, INFORMATIONAL_TEXT_FIELDS),
    ...copyOptional<Record<string, unknown>>(source, INFORMATIONAL_COUNT_FIELDS),
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