import {
  normalizeSeekerRequirement,
  type PropertyType,
  type ResidentialAmenity,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
  type CatalogPreference,
  type FloorUse,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';

export interface RequirementFormValues {
  readonly purpose: RequirementPurpose;
  readonly propertyType: PropertyType;
  readonly preferredAreaIds: readonly string[];
  readonly minimumBudget?: number;
  readonly maximumBudget?: number;
  readonly currencyCode: string;
  readonly notes: string;
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
  readonly preferredAmenities?: readonly ResidentialAmenity[];
  readonly catalogPreferences?: readonly CatalogPreference[];
  readonly floorUse?: FloorUse;
}

export type RequirementFormResult =
  | { readonly ok: true; readonly value: SeekerRequirement }
  | { readonly ok: false; readonly issues: readonly RequirementValidationIssue[] };

export type OptionalRequirementNumberResult =
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false };

/** Distinguishes intentionally missing input from malformed non-empty input. */
export function parseOptionalRequirementNumber(
  input: string,
  options: { readonly integer?: boolean } = {},
): OptionalRequirementNumberResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value))) {
    return { ok: false };
  }
  return { ok: true, value };
}

/** Adapts UI values to the frozen M1 contract; all business validation stays in M1. */
export function buildPersonRequirement(
  id: string,
  seekerId: string,
  values: RequirementFormValues,
): RequirementFormResult {
  const base = {
    id,
    seekerId,
    purpose: values.purpose,
    propertyType: values.propertyType,
    preferredAreaIds: [...values.preferredAreaIds],
    budget: {
      minimum: values.minimumBudget,
      maximum: values.maximumBudget,
      currencyCode: values.currencyCode,
    },
    notes: values.notes,
    ...(values.preferredAmenities !== undefined
      ? { preferredAmenities: [...values.preferredAmenities] }
      : {}),
    ...(values.catalogPreferences !== undefined
      ? { catalogPreferences: [...values.catalogPreferences] }
      : {}),
    ...(values.floorUse !== undefined ? { floorUse: values.floorUse } : {}),
  };
  const candidate = values.purpose === 'rent' ? {
    ...base,
    ...(values.bedroomsMinimum !== undefined ? { bedroomsMinimum: values.bedroomsMinimum } : {}),
    ...(values.bathroomsMinimum !== undefined ? { bathroomsMinimum: values.bathroomsMinimum } : {}),
    ...(values.occupancy !== undefined ? { occupancy: values.occupancy } : {}),
    ...(values.swimmingPool !== undefined ? { swimmingPool: values.swimmingPool } : {}),
    ...(values.gym !== undefined ? { gym: values.gym } : {}),
    ...(values.seaView !== undefined ? { seaView: values.seaView } : {}),
    ...(values.centralAC !== undefined ? { centralAC: values.centralAC } : {}),
  } : base;
  const result = normalizeSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  return result.ok ? { ok: true, value: result.value } : result;
}

export function formValuesFromRequirement(requirement: SeekerRequirement): RequirementFormValues {
  return {
    purpose: requirement.purpose,
    propertyType: requirement.propertyType,
    preferredAreaIds: [...requirement.preferredAreaIds],
    minimumBudget: requirement.budget.minimum,
    maximumBudget: requirement.budget.maximum,
    currencyCode: requirement.budget.currencyCode,
    notes: requirement.notes,
    ...(requirement.preferredAmenities !== undefined
      ? { preferredAmenities: [...requirement.preferredAmenities] }
      : {}),
    ...(requirement.catalogPreferences !== undefined
      ? { catalogPreferences: [...requirement.catalogPreferences] }
      : {}),
    ...(requirement.floorUse !== undefined ? { floorUse: requirement.floorUse } : {}),
    ...(requirement.purpose === 'rent' ? {
      ...(requirement.bedroomsMinimum !== undefined ? { bedroomsMinimum: requirement.bedroomsMinimum } : {}),
      ...(requirement.bathroomsMinimum !== undefined ? { bathroomsMinimum: requirement.bathroomsMinimum } : {}),
      ...(requirement.occupancy !== undefined ? { occupancy: requirement.occupancy } : {}),
      ...(requirement.swimmingPool !== undefined ? { swimmingPool: requirement.swimmingPool } : {}),
      ...(requirement.gym !== undefined ? { gym: requirement.gym } : {}),
      ...(requirement.seaView !== undefined ? { seaView: requirement.seaView } : {}),
      ...(requirement.centralAC !== undefined ? { centralAC: requirement.centralAC } : {}),
    } : {}),
  };
}
