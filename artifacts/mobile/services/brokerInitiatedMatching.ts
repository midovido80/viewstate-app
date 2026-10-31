import {
  evaluateMatch,
  rankMatchResults,
  selectMatchShortlist,
  MATCH_ENGINE_VERSION,
  validateSeekerRequirement,
  type MatchResult,
  type MatchingPolicy,
  type SeekerRequirement,
} from "@workspace/property-domain";
import type { RequirementStore } from "@/services/requirementPersistence";
import type { MyPropertiesMatchingSource } from "@/services/myPropertiesMatchingSource";

export type BrokerMatchingRequirementStore = Pick<
  RequirementStore,
  "getRequirement"
>;
export type BrokerMatchingCandidateSource = Pick<
  MyPropertiesMatchingSource,
  "getCandidates"
>;
export interface BrokerMatchingRunResult {
  readonly engineVersion: typeof MATCH_ENGINE_VERSION;
  readonly requirementId: string;
  readonly matches: readonly MatchResult[];
  readonly needsConfirmation: readonly MatchResult[];
}
/** Manual, transient runs. No fallback engine, writes, subscriptions or background jobs. */
export class BrokerInitiatedMatching {
  constructor(
    private readonly requirementStore: BrokerMatchingRequirementStore,
    private readonly candidateSource: BrokerMatchingCandidateSource,
  ) {}
  async runForRequirement(
    requirementId: string,
    policy: MatchingPolicy = {},
    excludedIds: readonly string[] = [],
  ): Promise<BrokerMatchingRunResult> {
    const requirement =
      await this.requirementStore.getRequirement(requirementId);
    if (requirement === null) throw new Error("MATCHING_REQUIREMENT_NOT_FOUND");
    if (requirement.id !== requirementId)
      throw new Error("MATCHING_REQUIREMENT_ID_MISMATCH");
    if (!validateSeekerRequirement(requirement).ok)
      throw new Error("MATCHING_REQUIREMENT_INVALID");
    const candidates = await this.candidateSource.getCandidates(requirement);
    const results = rankMatchResults(
      candidates.map((candidate) =>
        evaluateMatch(requirement, candidate, policy),
      ),
    );
    return {
      engineVersion: MATCH_ENGINE_VERSION,
      requirementId: requirement.id,
      matches: selectMatchShortlist(results, candidates, excludedIds),
      needsConfirmation: results
        .filter(
          (result) =>
            result.category === "needs_confirmation" &&
            !excludedIds.includes(result.propertyId),
        )
        .slice(0, 3),
    };
  }
}
