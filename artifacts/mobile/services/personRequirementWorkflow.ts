import {
  normalizeSeekerRequirement,
  validateSeekerRequirement,
  type PropertyType,
  type ResidentialAmenity,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
  type CatalogPreference,
  type FloorUse,
  type RequirementAreaMode,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';

export interface RequirementFormValues {
  readonly purpose: RequirementPurpose;
  readonly propertyType: PropertyType;
  readonly preferredAreaIds: readonly string[];
  readonly preferredAreaMode?: RequirementAreaMode;
  readonly minimumBudget?: number;
  readonly maximumBudget?: number;
  readonly currencyCode: string;
  readonly notes: string;
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly rentalPeriodId?: 'monthly' | 'yearly';
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
  readonly preferredAmenities?: readonly ResidentialAmenity[];
  readonly preferredAmenityExclusions?: readonly ResidentialAmenity[];
  readonly catalogPreferences?: readonly CatalogPreference[];
  readonly floorUse?: FloorUse;
  readonly masterBedroomsMinimum?: number;
  readonly driverRoom?: boolean;
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
    ...(values.preferredAreaMode !== undefined
      ? { preferredAreaMode: values.preferredAreaMode }
      : (values.preferredAreaIds.length > 0 ? { preferredAreaMode: 'specific_areas' as const } : {})),
    budget: {
      minimum: values.minimumBudget,
      maximum: values.maximumBudget,
      currencyCode: values.currencyCode,
    },
    notes: values.notes,
    ...(values.bedroomsMinimum !== undefined ? { bedroomsMinimum: values.bedroomsMinimum } : {}),
    ...(values.bathroomsMinimum !== undefined ? { bathroomsMinimum: values.bathroomsMinimum } : {}),
    ...(values.centralAC !== undefined ? { centralAC: values.centralAC } : {}),
    ...(values.preferredAmenities !== undefined
      ? { preferredAmenities: [...values.preferredAmenities] }
      : {}),
    ...(values.preferredAmenityExclusions !== undefined
      ? { preferredAmenityExclusions: [...values.preferredAmenityExclusions] }
      : {}),
    ...(values.catalogPreferences !== undefined
      ? { catalogPreferences: [...values.catalogPreferences] }
      : {}),
    ...(values.floorUse !== undefined ? { floorUse: values.floorUse } : {}),
    ...(values.masterBedroomsMinimum !== undefined ? { masterBedroomsMinimum: values.masterBedroomsMinimum } : {}),
    ...(values.driverRoom !== undefined ? { driverRoom: values.driverRoom } : {}),
  };
  const candidate = values.purpose === 'rent' ? {
    ...base,
    ...(values.occupancy !== undefined ? { occupancy: values.occupancy } : {}),
    rentalPeriodId: values.rentalPeriodId ?? 'monthly',
    ...(values.swimmingPool !== undefined ? { swimmingPool: values.swimmingPool } : {}),
    ...(values.gym !== undefined ? { gym: values.gym } : {}),
    ...(values.seaView !== undefined ? { seaView: values.seaView } : {}),
  } : base;
  const result = normalizeSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  const strict = validateSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  if (!strict.ok) return strict;
  return result.ok ? { ok: true, value: result.value } : result;
}

export function formValuesFromRequirement(requirement: SeekerRequirement): RequirementFormValues {
  return {
    purpose: requirement.purpose,
    propertyType: requirement.propertyType,
    preferredAreaIds: [...requirement.preferredAreaIds],
    ...(requirement.preferredAreaMode !== undefined
      ? { preferredAreaMode: requirement.preferredAreaMode }
      : (requirement.preferredAreaIds.length > 0 ? { preferredAreaMode: 'specific_areas' as const } : {})),
    minimumBudget: requirement.budget.minimum,
    maximumBudget: requirement.budget.maximum,
    currencyCode: requirement.budget.currencyCode,
    notes: requirement.notes,
    ...(requirement.bedroomsMinimum !== undefined ? { bedroomsMinimum: requirement.bedroomsMinimum } : {}),
    ...(requirement.bathroomsMinimum !== undefined ? { bathroomsMinimum: requirement.bathroomsMinimum } : {}),
    ...(requirement.centralAC !== undefined ? { centralAC: requirement.centralAC } : {}),
    ...(requirement.preferredAmenities !== undefined
      ? { preferredAmenities: [...requirement.preferredAmenities] }
      : {}),
    ...(requirement.preferredAmenityExclusions !== undefined
      ? { preferredAmenityExclusions: [...requirement.preferredAmenityExclusions] }
      : {}),
    ...(requirement.catalogPreferences !== undefined
      ? { catalogPreferences: [...requirement.catalogPreferences] }
      : {}),
    ...(requirement.floorUse !== undefined ? { floorUse: requirement.floorUse } : {}),
    ...(requirement.masterBedroomsMinimum !== undefined ? { masterBedroomsMinimum: requirement.masterBedroomsMinimum } : {}),
    ...(requirement.driverRoom !== undefined ? { driverRoom: requirement.driverRoom } : {}),
    ...(requirement.purpose === 'rent' ? {
      rentalPeriodId: requirement.rentalPeriodId ?? 'monthly',
      ...(requirement.occupancy !== undefined ? { occupancy: requirement.occupancy } : {}),
      ...(requirement.swimmingPool !== undefined ? { swimmingPool: requirement.swimmingPool } : {}),
      ...(requirement.gym !== undefined ? { gym: requirement.gym } : {}),
      ...(requirement.seaView !== undefined ? { seaView: requirement.seaView } : {}),
    } : {}),
  };
}
