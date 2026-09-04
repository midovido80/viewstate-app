import type { LocationAreaId, PropertyType } from "./types.ts";
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
    | "buy_rent_field_not_allowed";
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
  ...RENT_FIELDS,
]);

const BUDGET_FIELDS = new Set(["minimum", "maximum", "currencyCode"]);

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