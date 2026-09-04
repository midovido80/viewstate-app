import {
  validateSeekerRequirement,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { PropertyType } from '@workspace/property-domain';

export interface TransientRequirementInput {
  readonly id: string;
  readonly seekerId: string;
  readonly purpose: RequirementPurpose;
  readonly propertyType: PropertyType;
  readonly preferredAreaIds: readonly string[];
  readonly minimumBudget: number | undefined;
  readonly maximumBudget: number | undefined;
  readonly notes: string;
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
}

export type TransientRequirementResult =
  | {
      readonly ok: true;
      readonly value: SeekerRequirement;
    }
  | {
      readonly ok: false;
      readonly issues: readonly RequirementValidationIssue[];
    };

/**
 * Builds the exact M1 Requirement contract for a quick, non-persistent match.
 * Canonical areas are still checked at this UI boundary; no RequirementStore
 * mutation is involved.
 */
export function buildTransientRequirement(
  input: TransientRequirementInput,
): TransientRequirementResult {
  const base = {
    id: input.id,
    seekerId: input.seekerId,
    purpose: input.purpose,
    propertyType: input.propertyType,
    preferredAreaIds: [...input.preferredAreaIds],
    budget: {
      minimum: input.minimumBudget,
      maximum: input.maximumBudget,
      currencyCode: 'KWD',
    },
    notes: input.notes,
  };

  const candidate = input.purpose === 'rent'
    ? {
        ...base,
        ...(input.bedroomsMinimum !== undefined
          ? { bedroomsMinimum: input.bedroomsMinimum }
          : {}),
        ...(input.bathroomsMinimum !== undefined
          ? { bathroomsMinimum: input.bathroomsMinimum }
          : {}),
        ...(input.occupancy !== undefined ? { occupancy: input.occupancy } : {}),
        ...(input.swimmingPool !== undefined
          ? { swimmingPool: input.swimmingPool }
          : {}),
        ...(input.gym !== undefined ? { gym: input.gym } : {}),
        ...(input.seaView !== undefined ? { seaView: input.seaView } : {}),
        ...(input.centralAC !== undefined ? { centralAC: input.centralAC } : {}),
      }
    : base;

  const validation = validateSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  return validation.ok
    ? { ok: true, value: validation.value }
    : { ok: false, issues: validation.issues };
}