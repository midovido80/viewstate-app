import {
  validateSeekerRequirement,
  type MatchResult,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { PropertyType } from '@workspace/property-domain';
import type { BrokerMatchingRunResult } from '@/services/brokerInitiatedMatching';
import type { Person } from '@/services/people';

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

export interface MatchAllRequirementGroup {
  readonly requirement: SeekerRequirement;
  readonly matches: readonly MatchResult[];
}

export interface MatchAllPersonGroup {
  readonly person: Person;
  readonly requirementGroups: readonly MatchAllRequirementGroup[];
}

export function validMatchingRequirements(
  requirements: readonly SeekerRequirement[],
): SeekerRequirement[] {
  return requirements.flatMap(requirement => {
    const validation = validateSeekerRequirement(requirement, {
      isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
    });
    return validation.ok ? [validation.value] : [];
  });
}

export async function runMatchingForAllRequirements(
  requirements: readonly SeekerRequirement[],
  runForRequirement: (requirementId: string) => Promise<BrokerMatchingRunResult>,
): Promise<BrokerMatchingRunResult[]> {
  return Promise.all(
    requirements.map(requirement => runForRequirement(requirement.id)),
  );
}

export function groupMatchAllResultsByPerson(
  requirements: readonly SeekerRequirement[],
  people: readonly Person[],
  runs: readonly BrokerMatchingRunResult[],
): MatchAllPersonGroup[] {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const runsByRequirementId = new Map(
    runs.map(run => [run.requirementId, run]),
  );
  const groups = new Map<string, {
    person: Person;
    requirementGroups: MatchAllRequirementGroup[];
  }>();

  for (const requirement of requirements) {
    const run = runsByRequirementId.get(requirement.id);
    const person = peopleById.get(requirement.seekerId);
    if (!run?.matches.length || !person) continue;
    const existing = groups.get(person.id);
    const requirementGroup = {
      requirement,
      matches: run.matches,
    };
    if (existing) {
      existing.requirementGroups.push(requirementGroup);
    } else {
      groups.set(person.id, {
        person,
        requirementGroups: [requirementGroup],
      });
    }
  }

  return [...groups.values()];
}

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