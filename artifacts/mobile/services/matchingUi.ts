import {
  validateSeekerRequirement,
  type MatchResult,
  type Property,
  type FloorUse,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { PropertyType } from '@workspace/property-domain';
import { BrokerInitiatedMatching, type BrokerMatchingRunResult } from '@/services/brokerInitiatedMatching';
import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import type { Person, PersonStore } from '@/services/people';
import type { PropertyStore } from '@/services/persistence';
import type { RequirementStore } from '@/services/requirementPersistence';

export interface TransientRequirementInput {
  readonly id: string;
  readonly seekerId: string;
  readonly purpose: RequirementPurpose;
  readonly propertyType: PropertyType;
  readonly floorUse?: FloorUse;
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
  readonly minimumBuiltUpAreaSquareMeters?: number;
  readonly maximumBuiltUpAreaSquareMeters?: number;
  readonly commercialActivity?: string;
  readonly floorNumber?: number;
  readonly minimumFrontageWidthMeters?: number;
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

export interface MatchAllPresentation {
  readonly groups: readonly MatchAllPersonGroup[];
  readonly properties: readonly Property[];
}

export interface SavedMatchingSnapshotResult {
  readonly snapshot: MatchingDataSnapshot;
  readonly runs: readonly BrokerMatchingRunResult[];
  readonly presentation: MatchAllPresentation;
}

export interface MatchingRunGeneration {
  current: number;
}

export function beginMatchingRun(generation: MatchingRunGeneration): number {
  generation.current += 1;
  return generation.current;
}

export function invalidateMatchingRun(
  generation: MatchingRunGeneration,
  expected?: number,
): void {
  if (expected === undefined || generation.current === expected) generation.current += 1;
}

export function isCurrentMatchingRun(
  generation: MatchingRunGeneration,
  value: number,
): boolean {
  return generation.current === value;
}

export interface MatchingDataSnapshot {
  readonly requirements: readonly SeekerRequirement[];
  readonly people: readonly Person[];
  readonly properties: readonly Property[];
}

export type MatchingDataReader =
  Pick<RequirementStore, 'getRequirements'>
  & Pick<PersonStore, 'getPeople'>
  & Pick<PropertyStore, 'getProperties'>;

export async function loadMatchingDataSnapshot(
  reader: MatchingDataReader,
): Promise<MatchingDataSnapshot> {
  const [requirements, people, properties] = await Promise.all([
    reader.getRequirements(),
    reader.getPeople(),
    reader.getProperties(),
  ]);
  return {
    requirements: validMatchingRequirements(requirements),
    people: [...people],
    properties: [...properties],
  };
}

export function storesForMatchingSnapshot(snapshot: MatchingDataSnapshot): {
  readonly requirementStore: Pick<RequirementStore, 'getRequirement'>;
  readonly propertyStore: Pick<PropertyStore, 'getProperties'>;
} {
  const requirementsById = new Map(
    snapshot.requirements.map(requirement => [requirement.id, requirement]),
  );
  return {
    requirementStore: {
      getRequirement: async id => requirementsById.get(id) ?? null,
    },
    propertyStore: {
      getProperties: async () => [...snapshot.properties],
    },
  };
}

export function scopeMatchingSnapshotToRequirement(
  snapshot: MatchingDataSnapshot,
  requirementId: string,
): MatchingDataSnapshot | null {
  const requirement = snapshot.requirements.find(item => item.id === requirementId);
  if (!requirement) return null;
  return {
    requirements: [requirement],
    people: snapshot.people,
    properties: snapshot.properties,
  };
}

export async function runSavedMatchingSnapshot(
  snapshot: MatchingDataSnapshot,
): Promise<SavedMatchingSnapshotResult> {
  const stores = storesForMatchingSnapshot(snapshot);
  const matching = new BrokerInitiatedMatching(
    stores.requirementStore,
    new MyPropertiesMatchingSource(stores.propertyStore),
  );
  const runs = await runMatchingForAllRequirements(
    snapshot.requirements,
    requirementId => matching.runForRequirement(requirementId),
  );
  return {
    snapshot,
    runs,
    presentation: buildMatchAllPresentation(snapshot, runs),
  };
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
 * Keeps Match All results and the Property records used to render them on the
 * same captured snapshot. A later focus refresh must not relabel an already
 * scored result with a different revision of the same Property ID.
 */
export function buildMatchAllPresentation(
  snapshot: MatchingDataSnapshot,
  runs: readonly BrokerMatchingRunResult[],
): MatchAllPresentation {
  return {
    groups: groupMatchAllResultsByPerson(
      snapshot.requirements,
      snapshot.people,
      runs,
    ),
    properties: [...snapshot.properties],
  };
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
    ...(input.propertyType === 'floor' && input.floorUse !== undefined
      ? { floorUse: input.floorUse }
      : {}),
    ...((input.propertyType === 'shop' || input.propertyType === 'office' || (input.propertyType === 'floor' && input.floorUse === 'commercial')) ? {
      ...(input.minimumBuiltUpAreaSquareMeters !== undefined
        ? { minimumBuiltUpAreaSquareMeters: input.minimumBuiltUpAreaSquareMeters }
        : {}),
      ...(input.maximumBuiltUpAreaSquareMeters !== undefined
        ? { maximumBuiltUpAreaSquareMeters: input.maximumBuiltUpAreaSquareMeters }
        : {}),
    } : {}),
    ...((input.propertyType === 'shop' || (input.propertyType === 'floor' && input.floorUse === 'commercial')) ? {
      ...(input.commercialActivity !== undefined
        ? { commercialActivity: input.commercialActivity }
        : {}),
      ...(input.floorNumber !== undefined ? { floorNumber: input.floorNumber } : {}),
      ...(input.minimumFrontageWidthMeters !== undefined
        ? { minimumFrontageWidthMeters: input.minimumFrontageWidthMeters }
        : {}),
    } : {}),
  };

  const candidate = input.purpose === 'rent'
    && input.propertyType !== 'shop'
    && !(input.propertyType === 'floor' && input.floorUse === 'commercial')
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