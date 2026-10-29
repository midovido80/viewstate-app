import type { Property } from "./types.ts";
import type { SeekerRequirement } from "./requirements.ts";
import { PROPERTY_DETAIL_FIELD_DEFINITIONS } from "./taxonomy.ts";
import { projectPropertyProfileDetails } from "./formContracts.ts";

/** One executable policy. Old score results are never accepted by the selector. */
export const MATCH_ENGINE_VERSION = "shortlist-v3" as const;
export const MATCHING_DEFAULT_POLICY = {
  maximumResults: 5,
  maximumDifferences: 2,
  maximumPriceIncrease: 0.1,
  maximumAreaShortfall: 0.1,
  minimumQuality: 75,
} as const;
export type MatchCriterion = string;
export type MatchExplanationStatus =
  "matched" | "not_met" | "unknown" | "ineligible";
export type MatchCategory =
  "direct" | "provisional" | "negotiation" | "needs_confirmation" | "excluded";
export interface MatchingPolicy {
  /** Explicit refinements scoped to this Requirement/run, never inferred from browsing. */
  readonly strictFields?: readonly string[];
  /** Alternative locations must be explicitly selected, not guessed from proximity. */
  readonly alternativeAreaIds?: readonly string[];
}
export interface MatchingPropertyCandidate {
  readonly property: Property;
  readonly propertyChronology?: number;
}
export interface MatchExplanation {
  readonly criterion: MatchCriterion;
  readonly status: MatchExplanationStatus;
  readonly awardedPoints: number;
  readonly possiblePoints: number;
  readonly code: string;
  readonly message: string;
  readonly expected?: string | number | boolean;
  readonly actual?: string | number | boolean;
  readonly difference?: number;
  readonly percentDifference?: number;
  readonly hard: boolean;
}
export type MatchIneligibilityReason = string;
export interface MatchResult {
  readonly engineVersion: typeof MATCH_ENGINE_VERSION;
  readonly requirementId: string;
  readonly propertyId: string;
  readonly eligible: boolean;
  readonly score: number;
  readonly priceAmount: number;
  readonly qualifies: boolean;
  readonly category: MatchCategory;
  readonly differenceCount: number;
  readonly unknownCount: number;
  readonly includedWeight: number;
  readonly locationRank: number | null;
  readonly propertyChronology?: number;
  readonly ineligibilityReasons: readonly MatchIneligibilityReason[];
  readonly explanations: readonly MatchExplanation[];
}
export interface MatchEligibilityResult {
  readonly eligible: boolean;
  readonly locationRank: number | null;
  readonly ineligibilityReasons: readonly MatchIneligibilityReason[];
}
const CORE_MATCH_FIELDS = new Set(['property_type', 'transaction', 'currency', 'floorUse', 'propertyUse', 'apartmentSubtype', 'rentalPeriodId', 'budget', 'location', 'bedrooms', 'bathrooms', 'builtUpAreaSquareMeters', 'plotAreaSquareMeters', 'parkingSpaceCount', 'hasCentralAC', 'hasElevator', 'occupancy', 'intendedUse', 'commercialActivity']);
export function isBlockingMatchUnknown(item: MatchExplanation): boolean {
  return item.status === 'unknown' && (item.hard || CORE_MATCH_FIELDS.has(item.criterion));
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const unwrap = (value: unknown): unknown =>
  value && typeof value === "object" && "value" in value ? value.value : value;
const amenityFields: Readonly<Record<string, string>> = {
  heating: "hasHeating",
  balcony: "hasBalcony",
  maid_room: "hasMaidRoom",
  laundry_room: "hasLaundryRoom",
  solar_heater: "hasSolarHeater",
  elevator: "hasElevator",
  garden: "hasGarden",
  security_guard: "hasSecurityGuard",
  bbq_area: "hasBBQArea",
  private_roof: "hasPrivateRoof",
};

/** Remove stale hidden facts using the same applicability/conditional contract as forms. */
export function matchingPropertyFacts(
  property: Property,
): Readonly<Record<string, unknown>> {
  const raw = (property.typeDetails ?? {}) as Record<string, unknown>;
  const details = projectPropertyProfileDetails(
    property.core.propertyType,
    property.activeOffer.transaction,
    raw,
  );
  const facts: Record<string, unknown> = {};
  for (const definition of PROPERTY_DETAIL_FIELD_DEFINITIONS) {
    if (!definition.appliesTo.includes(property.core.propertyType)) continue;
    if (
      definition.floorUses &&
      property.core.propertyType === "floor" &&
      !definition.floorUses.includes(details.floorUse as never)
    )
      continue;
    if (
      definition.propertyUses &&
      property.core.propertyType === "other_built_property" &&
      !definition.propertyUses.includes(details.propertyUse as never)
    )
      continue;
    if (
      definition.apartmentSubtypes &&
      property.core.propertyType === "apartment" &&
      !definition.apartmentSubtypes.includes(details.apartmentSubtype as never)
    )
      continue;
    if (details[definition.field] !== undefined)
      facts[definition.field] = unwrap(details[definition.field]);
  }
  // The approved physical area is distinct from land area. Missing does not mean zero.
  if (
    facts.builtUpAreaSquareMeters === undefined &&
    finite(property.areaSquareMeters)
  ) {
    facts.builtUpAreaSquareMeters =
      property.areaUnit === "square_foot"
        ? property.areaSquareMeters * 0.092903
        : property.areaSquareMeters;
  }
  // A partial complex offer refers to the available portion, not the entire building.
  if (
    property.core.propertyType === "commercial_complex" &&
    details.rentalScope === "partial"
  ) {
    facts.builtUpAreaSquareMeters = facts.availableAreaSquareMeters;
  }
  if (facts.hasElevator === undefined && finite(facts.elevatorCount))
    facts.hasElevator = facts.elevatorCount > 0;
  if (
    facts.parkingSpaceCount === undefined &&
    Array.isArray(facts.parkingTypes) &&
    facts.parkingTypes.length === 1 &&
    facts.parkingTypes[0] === "private" &&
    finite(facts.privateParkingCount)
  ) {
    facts.parkingSpaceCount = facts.privateParkingCount;
  }
  return facts;
}
function price(property: Property): { amount: number; currencyCode: string } {
  return property.activeOffer.transaction === "rent"
    ? property.activeOffer.rentalPrice
    : property.activeOffer.salePrice;
}

/** Identity gates only. Price/area flexibility belongs to the single evaluator below. */
export function checkMatchEligibility(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
): MatchEligibilityResult {
  const property = candidate.property;
  const reasons: string[] = [];
  if (property.core.propertyType !== requirement.propertyType)
    reasons.push("property_type");
  if (
    property.activeOffer.transaction !==
    (requirement.purpose === "buy" ? "sale" : "rent")
  )
    reasons.push("transaction");
  const offerPrice = price(property);
  if (offerPrice.currencyCode !== requirement.budget.currencyCode)
    reasons.push("currency");
  if (!finite(offerPrice.amount) || offerPrice.amount <= 0)
    reasons.push("invalid_price");
  const index = requirement.preferredAreaIds.indexOf(
    property.core.locationArea.id,
  );
  return {
    eligible: reasons.length === 0,
    locationRank: index < 0 ? null : index + 1,
    ineligibilityReasons: reasons,
  };
}

/** Optional session locks expose only criteria actually recorded on this request. */
export function matchingRefinementFields(
  requirement: SeekerRequirement,
): string[] {
  return [
    ...new Set([
      ...(requirement.budget.maximum !== undefined || requirement.budget.minimum !== undefined ? ["budget"] : []),
      ...(requirement.preferredAreaMode === "all_kuwait" ? [] : ["location"]),
      ...(requirement.bedroomsMinimum === undefined ? [] : ["bedrooms"]),
      ...(requirement.bathroomsMinimum === undefined ? [] : ["bathrooms"]),
      ...(requirement.masterBedroomsMinimum === undefined
        ? []
        : ["masterBedrooms"]),
      ...(requirement.centralAC === undefined ? [] : ["hasCentralAC"]),
      ...(requirement.driverRoom === undefined ? [] : ["driverRoom"]),
      ...(requirement.preferredAmenities ?? []).map(
        (item) => amenityFields[item],
      ),
      ...(requirement.catalogPreferences ?? [])
        .filter((item) => item.kind !== "feature" || item.value === true)
        .map((item) => item.field),
    ]),
  ].filter(
    (field) =>
      ![
        "apartmentSubtype",
        "floorNumber",
        "intendedUse",
        "commercialActivity",
      ].includes(field),
  );
}

export function evaluateMatch(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
  policy: MatchingPolicy = {},
): MatchResult {
  const property = candidate.property;
  const identity = checkMatchEligibility(requirement, candidate);
  const facts = matchingPropertyFacts(property);
  const explanations: MatchExplanation[] = [];
  const strict = new Set(policy.strictFields ?? []);
  const add = (
    field: string,
    expected: string | number | boolean,
    actual: unknown,
    weight: number,
    comparison: "minimum" | "maximum" | "exact" = "exact",
    hard = false,
    tolerance = 0,
  ) => {
    const isHard = hard || strict.has(field);
    const unknown = actual === undefined || actual === null;
    const matched =
      !unknown &&
      (comparison === "minimum"
        ? finite(actual) && actual >= Number(expected)
        : comparison === "maximum"
          ? finite(actual) && actual <= Number(expected)
          : actual === expected);
    const difference =
      finite(expected) && finite(actual) ? actual - expected : undefined;
    const ratio =
      difference === undefined
        ? undefined
        : Math.abs(difference) / Math.max(Math.abs(Number(expected)), 1);
    const outsideTolerance =
      !matched &&
      !unknown &&
      (tolerance === 0 || ratio === undefined || ratio > tolerance + 1e-9);
    const status = unknown
      ? "unknown"
      : matched
        ? "matched"
        : isHard || outsideTolerance
          ? "ineligible"
          : "not_met";
    const loss =
      matched || unknown
        ? 0
        : ratio === undefined
          ? 0.5
          : Math.min(1, Math.max(0.25, ratio * 2.5));
    explanations.push({
      criterion: field,
      status,
      hard: isHard,
      expected,
      ...(typeof actual === "string" ||
      typeof actual === "number" ||
      typeof actual === "boolean"
        ? { actual }
        : {}),
      ...(difference === undefined
        ? {}
        : { difference, percentDifference: Number((ratio! * 100).toFixed(2)) }),
      possiblePoints: weight,
      awardedPoints: matched
        ? weight
        : unknown || status === "ineligible"
          ? 0
          : weight * (1 - loss),
      code: unknown
        ? "unknown_property_evidence"
        : matched
          ? "matched"
          : status === "ineligible"
            ? "condition_not_met"
            : "negotiation_required",
      message: unknown
        ? "Confirm the missing structured fact."
        : matched
          ? "Recorded requirement met."
          : "Recorded requirement differs; acceptance is not confirmed.",
    });
  };
  for (const reason of identity.ineligibilityReasons)
    explanations.push({
      criterion: reason,
      status: "ineligible",
      hard: true,
      awardedPoints: 0,
      possiblePoints: 0,
      code: "ineligible_" + reason,
      message: "Incompatible Property identity or offer.",
    });

  if (property.core.propertyType === "floor")
    add(
      "floorUse",
      requirement.floorUse ?? "residential / commercial",
      requirement.floorUse === undefined ? undefined : facts.floorUse,
      0,
      "exact",
      true,
    );
  if (property.core.propertyType === "other_built_property")
    add("propertyUse", requirement.propertyUse ?? "residential / commercial", requirement.propertyUse === undefined ? undefined : facts.propertyUse, 0, "exact", true);
  const subtype = requirement.catalogPreferences?.find(
    (item) => item.field === "apartmentSubtype" && item.kind === "choice",
  );
  if (subtype)
    add(
      "apartmentSubtype",
      subtype.value,
      facts.apartmentSubtype,
      0,
      "exact",
      true,
    );
  if (
    requirement.purpose === "rent" &&
    property.activeOffer.transaction === "rent"
  ) {
    // Missing historical cadence is not silently assumed; new requests already default monthly.
    if (requirement.rentalPeriodId === undefined)
      add(
        "rentalPeriodId",
        property.activeOffer.rentalPeriodId,
        undefined,
        0,
        "exact",
        true,
      );
    else
      add(
        "rentalPeriodId",
        requirement.rentalPeriodId,
        property.activeOffer.rentalPeriodId,
        0,
        "exact",
        true,
      );
  }
  if (requirement.budget.maximum !== undefined) add(
    'budget', requirement.budget.maximum, price(property).amount, 35, 'maximum', false,
    MATCHING_DEFAULT_POLICY.maximumPriceIncrease,
  );
  else if (requirement.budget.minimum !== undefined) add(
    'budget', requirement.budget.minimum, price(property).amount, 35, 'minimum', false,
  );
  // All Kuwait is unrestricted. Area selections are a set, not an inferred priority list.
  if (
    requirement.preferredAreaMode !== "all_kuwait" &&
    requirement.preferredAreaIds.length > 0
  ) {
    const area = property.core.locationArea.id;
    const accepted = requirement.preferredAreaIds.includes(area);
    const alternative =
      policy.alternativeAreaIds?.includes(area) === true &&
      !strict.has("location");
    if (accepted) add("location", area, area, 25);
    else {
      add(
        "location",
        requirement.preferredAreaIds.join(", "),
        area,
        25,
        "exact",
        !alternative,
      );
      if (alternative) {
        const index = explanations.length - 1;
        explanations[index] = {
          ...explanations[index],
          status: "not_met",
          awardedPoints: 12.5,
        };
      }
    }
  }
  const minimums = [
    ["bedrooms", requirement.bedroomsMinimum, "bedroomCount", 20],
    ["bathrooms", requirement.bathroomsMinimum, "bathroomCount", 10],
    [
      "masterBedrooms",
      requirement.masterBedroomsMinimum,
      "masterBedroomCount",
      6,
    ],
  ] as const;
  for (const [field, expected, actualField, weight] of minimums) {
    if (expected !== undefined)
      add(
        field,
        expected,
        facts[actualField],
        weight,
        "minimum",
        false,
        expected > 0 ? 1 / expected : 0,
      );
  }
  const feature = (field: string, expected: boolean, weight = 4) =>
    add(
      field,
      expected,
      facts[field],
      weight,
      "exact",
      !expected,
      expected ? 1 : 0,
    );
  // Boolean mismatches have no numeric distance; explicitly permit one positive-feature trade-off.
  const flexibleFeature = (field: string, expected: boolean, weight = 4) => {
    feature(field, expected, weight);
    const index = explanations.length - 1;
    if (
      expected &&
      !strict.has(field) &&
      explanations[index].status === "ineligible"
    )
      explanations[index] = {
        ...explanations[index],
        status: "not_met",
        awardedPoints: weight / 2,
      };
  };
  if (requirement.centralAC !== undefined)
    flexibleFeature("hasCentralAC", requirement.centralAC, 8);
  if (requirement.driverRoom !== undefined)
    flexibleFeature("driverRoom", requirement.driverRoom);
  if (requirement.purpose === "rent") {
    if (
      requirement.occupancy !== undefined &&
      requirement.occupancy !== "any"
    ) {
      add(
        "occupancy",
        requirement.occupancy,
        facts.occupancy === "any" ? requirement.occupancy : facts.occupancy,
        8,
        "exact",
        true,
      );
    }
    for (const [key, field] of [
      ["swimmingPool", "hasPool"],
      ["gym", "hasSharedGym"],
      ["seaView", "hasSeaView"],
    ] as const) {
      if (requirement[key] !== undefined)
        flexibleFeature(field, requirement[key]!);
    }
  }
  for (const [list, expected] of [
    [requirement.preferredAmenities, true],
    [requirement.preferredAmenityExclusions, false],
  ] as const) {
    for (const amenity of list ?? [])
      flexibleFeature(amenityFields[amenity], expected);
  }
  for (const preference of requirement.catalogPreferences ?? []) {
    if (preference.field === "apartmentSubtype") continue;
    const field = preference.field;
    if (preference.kind === "number") {
      const area =
        field === "builtUpAreaSquareMeters" || field === "plotAreaSquareMeters";
      const tolerance = area
        ? MATCHING_DEFAULT_POLICY.maximumAreaShortfall
        : preference.comparison === "exact"
          ? 0
          : preference.value > 0
            ? 1 / preference.value
            : 0;
      add(
        field,
        preference.value,
        facts[field],
        area ? 15 : 6,
        preference.comparison,
        false,
        tolerance,
      );
    } else if (preference.kind === "feature")
      flexibleFeature(field, preference.value);
    else {
      add(
        field,
        preference.value,
        facts[field],
        6,
        "exact",
        ["intendedUse", "commercialActivity"].includes(field),
      );
      const index = explanations.length - 1;
      if (
        field === "furnishing" &&
        !strict.has(field) &&
        explanations[index].status === "ineligible"
      )
        explanations[index] = {
          ...explanations[index],
          status: "not_met",
          awardedPoints: 3,
        };
    }
  }
  for (const service of requirement.preferredNearbyServices ?? []) {
    const actual = property.nearbyServices?.includes(service)
      ? true
      : undefined;
    add("nearby:" + service, true, actual, 1);
    const index = explanations.length - 1;
    if (
      explanations[index].status === "ineligible" &&
      !strict.has("nearby:" + service)
    )
      explanations[index] = {
        ...explanations[index],
        status: "not_met",
        awardedPoints: 0,
      };
  }
  const reasons = explanations
    .filter((item) => item.status === "ineligible")
    .map((item) => item.criterion);
  const differences = explanations.filter((item) => item.status === "not_met");
  const unknowns = explanations.filter((item) => item.status === "unknown");
  const includedWeight = explanations.reduce(
    (sum, item) => sum + item.possiblePoints,
    0,
  );
  const earned = explanations.reduce(
    (sum, item) => sum + item.awardedPoints,
    0,
  );
  const score = includedWeight
    ? Math.round((earned / includedWeight) * 10000) / 100
    : 0;
  const differenceCount = new Set(
    differences.map((item) =>
      item.criterion.startsWith("nearby:") ? "nearbyServices" : item.criterion,
    ),
  ).size;
  const tooMany = differenceCount > MATCHING_DEFAULT_POLICY.maximumDifferences;
  const potentialScore = includedWeight
    ? ((earned + unknowns.reduce((sum, item) => sum + item.possiblePoints, 0)) /
        includedWeight) *
      100
    : 0;
  const category: MatchCategory =
    reasons.length ||
    tooMany ||
    potentialScore < MATCHING_DEFAULT_POLICY.minimumQuality
      ? "excluded"
      : unknowns.some(isBlockingMatchUnknown) || score < MATCHING_DEFAULT_POLICY.minimumQuality
        ? "needs_confirmation"
        : differences.length
          ? "negotiation"
          : unknowns.length ? "provisional" : "direct";
  return {
    engineVersion: MATCH_ENGINE_VERSION,
    requirementId: requirement.id,
    propertyId: property.core.id,
    eligible: reasons.length === 0,
    score,
    priceAmount: price(property).amount,
    category,
    qualifies:
      (category === "direct" || category === "provisional" || category === "negotiation") &&
      score >= MATCHING_DEFAULT_POLICY.minimumQuality,
    differenceCount,
    unknownCount: unknowns.length,
    includedWeight,
    locationRank: identity.locationRank,
    propertyChronology: candidate.propertyChronology,
    ineligibilityReasons: [
      ...reasons,
      ...(tooMany ? ["too_many_differences"] : []),
    ],
    explanations,
  };
}

const categoryRank: Readonly<Record<MatchCategory, number>> = {
  direct: 0,
  provisional: 1,
  negotiation: 2,
  needs_confirmation: 3,
  excluded: 4,
};
export function rankMatchResults(
  results: readonly MatchResult[],
): MatchResult[] {
  const current = results.filter(
    (result) => result.engineVersion === MATCH_ENGINE_VERSION,
  );
  if (new Set(current.map((result) => result.requirementId)).size > 1)
    throw new Error("MIXED_MATCH_REQUIREMENTS");
  return results
    .filter((result) => result.engineVersion === MATCH_ENGINE_VERSION)
    .map((result, index) => ({ result, index }))
    .sort(
      (a, b) =>
        categoryRank[a.result.category] - categoryRank[b.result.category] ||
        b.result.score - a.result.score ||
        a.result.differenceCount - b.result.differenceCount ||
        a.result.unknownCount - b.result.unknownCount ||
        a.result.priceAmount - b.result.priceAmount ||
        (a.result.propertyChronology ?? a.index) -
          (b.result.propertyChronology ?? b.index) ||
        a.result.propertyId.localeCompare(b.result.propertyId),
    )
    .map((item) => item.result);
}

/** Bounded, source-neutral shortlist. Deduplicate IDs, never infer duplicate buildings. */
export function selectMatchShortlist(
  results: readonly MatchResult[],
  candidates: readonly MatchingPropertyCandidate[],
  excludedIds: readonly string[] = [],
): MatchResult[] {
  const seen = new Set(excludedIds);
  const pool = rankMatchResults(results).filter((result) => {
    if (
      !result.eligible ||
      !result.qualifies ||
      !["direct", "provisional", "negotiation"].includes(result.category) ||
      seen.has(result.propertyId)
    )
      return false;
    seen.add(result.propertyId);
    return true;
  });
  const byId = new Map(
    candidates.map((candidate) => [
      candidate.property.core.id,
      candidate.property,
    ]),
  );
  const chosen: MatchResult[] = [];
  const diversityFacts = new Map(
    candidates.map((candidate) => [
      candidate.property.core.id,
      matchingPropertyFacts(candidate.property),
    ]),
  );
  const similarity = (left: MatchResult, right: MatchResult) => {
    const a = byId.get(left.propertyId);
    const b = byId.get(right.propertyId);
    if (!a || !b) return 0;
    const af = diversityFacts.get(left.propertyId)!;
    const bf = diversityFacts.get(right.propertyId)!;
    return (
      Number(a.core.locationArea.id === b.core.locationArea.id) +
      Number(
        af.bedroomCount !== undefined && af.bedroomCount === bf.bedroomCount,
      ) +
      Number(af.furnishing !== undefined && af.furnishing === bf.furnishing) +
      Number(
        Math.abs(price(a).amount - price(b).amount) <=
          Math.max(price(a).amount, 1) * 0.03,
      )
    );
  };
  while (
    pool.length &&
    chosen.length < MATCHING_DEFAULT_POLICY.maximumResults
  ) {
    const leader = pool[0];
    let best = 0;
    let utility = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      if (item.category !== leader.category || item.score < leader.score - 3)
        continue;
      const redundancy = chosen.length
        ? Math.max(...chosen.map((previous) => similarity(item, previous)))
        : 0;
      const value = item.score - redundancy;
      if (value > utility) {
        utility = value;
        best = i;
      }
    }
    chosen.push(pool.splice(best, 1)[0]);
  }
  return chosen;
}
