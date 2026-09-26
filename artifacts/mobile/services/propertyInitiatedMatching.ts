import {
  evaluateMatch,
  normalizeSeekerRequirement,
  rankMatchResults,
  type MatchResult,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { normalizeMyPropertyCandidate } from '@/services/myPropertiesMatchingSource';
import type { PropertyStore } from '@/services/persistence';
import type { RequirementStore } from '@/services/requirementPersistence';
import type { Person, PersonStore } from '@/services/people';

export type PropertyInitiatedPropertyStore = Pick<PropertyStore, 'getProperty'>;
export type PropertyInitiatedRequirementStore = Pick<RequirementStore, 'getRequirements'>;
export type PropertyInitiatedPeopleStore = Pick<PersonStore, 'getPeople'>;

export interface PropertyRequirementMatch {
  readonly requirement: SeekerRequirement;
  readonly result: MatchResult;
}

export interface PropertyPersonMatchGroup {
  readonly person: Person;
  readonly requirementMatches: readonly PropertyRequirementMatch[];
}

export interface PropertyInitiatedMatchingResult {
  readonly property: Property;
  readonly groups: readonly PropertyPersonMatchGroup[];
}

/**
 * A property-initiated run is an explicit, transient read. It always reloads
 * the selected Property and saved requirements/people and never stores results.
 */
export class PropertyInitiatedMatching {
  constructor(
    private readonly propertyStore: PropertyInitiatedPropertyStore,
    private readonly requirementStore: PropertyInitiatedRequirementStore,
    private readonly peopleStore: PropertyInitiatedPeopleStore,
  ) {}

  async runForProperty(propertyId: string): Promise<PropertyInitiatedMatchingResult> {
    const [property, requirements, people] = await Promise.all([
      this.propertyStore.getProperty(propertyId),
      this.requirementStore.getRequirements(),
      this.peopleStore.getPeople(),
    ]);
    if (property === null) throw new Error('MATCHING_PROPERTY_NOT_FOUND');
    if (property.core.id !== propertyId) throw new Error('MATCHING_PROPERTY_ID_MISMATCH');
    const candidate = normalizeMyPropertyCandidate(property);
    if (!candidate) throw new Error('MATCHING_PROPERTY_INVALID');

    const peopleById = new Map(
      people
        .filter(person => person.classifications.includes('seeker'))
        .map(person => [person.id, person]),
    );
    const matchesByPerson = new Map<string, {
      person: Person;
      requirementMatches: PropertyRequirementMatch[];
    }>();

    for (const requirement of requirements) {
      const person = peopleById.get(requirement.seekerId);
      if (!person) continue;
      const normalized = normalizeSeekerRequirement(requirement, {
        isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
      });
      if (!normalized.ok) continue;

      const result = evaluateMatch(normalized.value, candidate);
      if (!result.eligible || (!result.qualifies && !result.potentialMatch)) continue;
      const group = matchesByPerson.get(person.id) ?? {
        person,
        requirementMatches: [],
      };
      group.requirementMatches.push({ requirement: normalized.value, result });
      matchesByPerson.set(person.id, group);
    }

    const groups = [...matchesByPerson.values()].map(group => {
      const ranked = rankMatchResults(group.requirementMatches.map(item => item.result));
      const confirmed = ranked.filter(result => result.qualifies);
      const potential = ranked.filter(
        result => !result.qualifies && result.potentialMatch,
      );
      const byRequirementId = new Map(
        group.requirementMatches.map(item => [item.requirement.id, item]),
      );
      return {
        person: group.person,
        requirementMatches: [...confirmed, ...potential].flatMap(result => {
          const item = byRequirementId.get(result.requirementId);
          return item ? [{ ...item, result }] : [];
        }),
      };
    });

    return { property, groups };
  }
}