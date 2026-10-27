import {
  evaluateMatch,
  MATCH_ENGINE_VERSION,
  selectMatchShortlist,
  type MatchingPolicy,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import {
  buildTransientRequirement,
  groupMatchAllResultsByPerson,
} from "@/services/matchingUi";
import type { Person } from "@/services/people";

/** In-memory, explicitly fictional UI fixtures. Never read or written through store. */
export function matchingUiTrialFixture(
  policies: Record<string, MatchingPolicy> = {},
  excluded: Record<string, string[]> = {},
) {
  const people: Person[] = ["ميدو", "أحمد", "خالد", "سارة"].map(
    (name, index) => ({
      id: `ui-trial-person-${index}`,
      name,
      classifications: ["seeker"],
      displayPhone: "",
      normalizedPhone: "",
      notes: "",
    }),
  );
  const requirements: SeekerRequirement[] = people.map((person, index) => {
    const request = buildTransientRequirement({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      seekerId: person.id,
      purpose: "rent",
      propertyType: "apartment",
      apartmentSubtype: "standard_apartment",
      preferredAreaIds: ["salmiya"],
      minimumBudget: 400,
      maximumBudget: 500,
      bedroomsMinimum: 3,
      bathroomsMinimum: 2,
      centralAC: true,
      notes: "",
    });
    if (!request.ok) throw new Error("INVALID_UI_TRIAL_FIXTURE");
    return request.value;
  });
  const properties: Property[] = [480, 490, 500].map((amount, index) => ({
    core: {
      id: `ui-trial-property-${index}`,
      propertyType: "apartment",
      locationArea: { id: "salmiya" },
    },
    activeOffer: {
      id: `ui-trial-offer-${index}`,
      propertyCoreId: `ui-trial-property-${index}`,
      transaction: "rent",
      rentalPrice: { amount, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
    typeDetails: {
      propertyType: "apartment",
      apartmentSubtype: "standard_apartment",
      bedroomCount: index === 1 ? 2 : 3,
      bathroomCount: 2,
      hasCentralAC: true,
    },
  }));
  const candidates = properties.map((property) => ({ property }));
  const runs = requirements.map((requirement) => {
    const results = candidates.map((candidate) =>
      evaluateMatch(requirement, candidate, policies[requirement.id]),
    );
    return {
      engineVersion: MATCH_ENGINE_VERSION,
      requirementId: requirement.id,
      matches: selectMatchShortlist(
        results,
        candidates,
        excluded[requirement.id],
      ),
      needsConfirmation: results.filter(
        (result) =>
          result.category === "needs_confirmation" &&
          !excluded[requirement.id]?.includes(result.propertyId),
      ),
    };
  });
  return {
    properties,
    groups: groupMatchAllResultsByPerson(requirements, people, runs),
  };
}
