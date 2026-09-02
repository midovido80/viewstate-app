import {
  evaluateMatch,
  rankMatchResults,
  validateSeekerRequirement,
  type MatchResult,
  type SeekerRequirement,
} from '@workspace/property-domain';
import type { RequirementStore } from '@/services/requirementPersistence';
import type { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';

export type BrokerMatchingRequirementStore = Pick<
  RequirementStore,
  'getRequirement'
>;

export type BrokerMatchingCandidateSource = Pick<
  MyPropertiesMatchingSource,
  'getCandidates'
>;

export interface BrokerMatchingRunResult {
  readonly requirementId: string;
  readonly matches: readonly MatchResult[];
}

/**
 * Direction A is an explicit broker action. This service has no persistence,
 * subscription, timer, background, or mutation path; every run is transient.
 */
export class BrokerInitiatedMatching {
  constructor(
    private readonly requirementStore: BrokerMatchingRequirementStore,
    private readonly candidateSource: BrokerMatchingCandidateSource,
  ) {}

  async runForRequirement(
    requirementId: string,
  ): Promise<BrokerMatchingRunResult> {
    const requirement = await this.requirementStore.getRequirement(requirementId);
    if (requirement === null) {
      throw new Error('MATCHING_REQUIREMENT_NOT_FOUND');
    }
    if (requirement.id !== requirementId) {
      throw new Error('MATCHING_REQUIREMENT_ID_MISMATCH');
    }

    const validation = validateSeekerRequirement(requirement);
    if (!validation.ok) {
      throw new Error('MATCHING_REQUIREMENT_INVALID');
    }

    const candidates = await this.candidateSource.getCandidates(requirement);
    const rankedResults = rankMatchResults(
      candidates.map(candidate => evaluateMatch(requirement, candidate)),
    );

    return {
      requirementId: requirement.id,
      matches: rankedResults.filter(result => result.eligible && result.qualifies),
    };
  }
}