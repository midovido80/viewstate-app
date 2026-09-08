import type { Property } from "./types.ts";
import type {
  RequirementOccupancy,
  SeekerRequirement,
} from "./requirements.ts";
import { isCommercialAreaRequirementPropertyType } from "./requirements.ts";

export const MATCH_QUALIFICATION_THRESHOLD = 70;

export const MATCH_SCORING_WEIGHTS = {
  rent: {
    budget: 40,
    orderedLocation: 30,
    bedrooms: 10,
    bathrooms: 10,
    occupancy: 5,
    services: 5,
  },
  buy: {
    budget: 60,
    orderedLocation: 40,
  },
} as const;

export const SHOP_MATCH_SCORING_WEIGHTS = {
  budget: 40,
  orderedLocation: 30,
  builtUpArea: 10,
  commercialActivity: 10,
  floorNumber: 5,
  frontage: 5,
} as const;

export const COMMERCIAL_AREA_MATCH_WEIGHT = 10;

export type MatchingService =
  | "swimmingPool"
  | "gym"
  | "seaView"
  | "centralAC";

/**
 * Normalized, structured Property-side facts accepted by the pure Matching
 * Core. Callers must only provide values backed by approved structured
 * Property fields; literal text and hasWaterfront are never interpreted.
 */
export interface MatchingPropertyEvidence {
  readonly bedrooms?: number;
  readonly bathrooms?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
  readonly builtUpAreaSquareMeters?: number;
  readonly commercialActivity?: string;
  readonly floorNumber?: number;
  readonly frontageWidthMeters?: number;
}

export interface MatchingPropertyCandidate {
  readonly property: Property;
  readonly evidence?: MatchingPropertyEvidence;
  /** Explicit creation chronology used only as the final ranking tie-break. */
  readonly propertyChronology?: number;
}

export type MatchCriterion =
  | "eligibility"
  | "budget"
  | "ordered_location"
  | "bedrooms"
  | "bathrooms"
  | "occupancy"
  | "swimming_pool"
  | "gym"
  | "sea_view"
  | "central_ac"
  | "built_up_area"
  | "commercial_activity"
  | "floor_number"
  | "frontage";

export type MatchExplanationStatus =
  | "matched"
  | "not_met"
  | "unknown"
  | "ineligible";

export interface MatchExplanation {
  readonly criterion: MatchCriterion;
  readonly status: MatchExplanationStatus;
  readonly awardedPoints: number;
  readonly possiblePoints: number;
  readonly code:
    | "eligible"
    | "ineligible_property_type"
    | "ineligible_transaction"
    | "ineligible_currency"
    | "ineligible_price"
    | "ineligible_location"
    | "within_budget"
    | "ordered_location_rank"
    | "meets_minimum"
    | "below_minimum"
     | "within_range"
     | "outside_range"
    | "exact_or_compatible"
    | "occupancy_not_compatible"
    | "service_present"
    | "service_absent"
    | "unknown_property_evidence";
  readonly message: string;
}

export type MatchIneligibilityReason =
  | "property_type"
  | "transaction"
  | "currency"
  | "price"
  | "location";

export interface MatchResult {
  readonly requirementId: string;
  readonly propertyId: string;
  readonly eligible: boolean;
  readonly score: number;
  readonly qualifies: boolean;
  readonly includedWeight: number;
  readonly locationRank: number | null;
  readonly priceDistanceFromBudgetMidpoint: number | null;
  readonly propertyChronology?: number;
  readonly ineligibilityReasons: readonly MatchIneligibilityReason[];
  readonly explanations: readonly MatchExplanation[];
}

export interface MatchEligibilityResult {
  readonly eligible: boolean;
  readonly locationRank: number | null;
  readonly ineligibilityReasons: readonly MatchIneligibilityReason[];
}

interface CriterionPoints {
  readonly explanation: MatchExplanation;
  readonly awarded: number;
  readonly possible: number;
}

type TypeDetailsLike = {
  readonly bedroomCount?: unknown;
  readonly bathroomCount?: unknown;
  readonly hasPool?: unknown;
  readonly builtUpAreaSquareMeters?: unknown;
  readonly commercialActivity?: unknown;
  readonly floorNumber?: unknown;
  readonly frontageWidthMeters?: unknown;
  readonly floorUse?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOccupancy(value: unknown): value is RequirementOccupancy {
  return value === "family" || value === "bachelor" || value === "any";
}

function classifiedLiteralValue(value: unknown): string | undefined {
  if (
    typeof value === "object"
    && value !== null
    && "value" in value
    && typeof value.value === "string"
  ) {
    return value.value;
  }
  return undefined;
}

function derivePropertyEvidence(property: Property): MatchingPropertyEvidence {
  const details = property.typeDetails as TypeDetailsLike | undefined;
  const supportsCommercialArea = property.core.propertyType === "shop"
    || property.core.propertyType === "office"
    || (property.core.propertyType === "floor" && details?.floorUse === "commercial");
  return {
    bedrooms: isFiniteNumber(details?.bedroomCount)
      ? details.bedroomCount
      : undefined,
    bathrooms: isFiniteNumber(details?.bathroomCount)
      ? details.bathroomCount
      : undefined,
    swimmingPool: isBoolean(details?.hasPool)
      ? details.hasPool
      : undefined,
    builtUpAreaSquareMeters: supportsCommercialArea
      && isFiniteNumber(details?.builtUpAreaSquareMeters)
      ? details.builtUpAreaSquareMeters
      : undefined,
    commercialActivity: classifiedLiteralValue(details?.commercialActivity),
    floorNumber: isFiniteNumber(details?.floorNumber)
      ? details.floorNumber
      : undefined,
    frontageWidthMeters: isFiniteNumber(details?.frontageWidthMeters)
      ? details.frontageWidthMeters
      : undefined,
  };
}

function mergeEvidence(
  property: Property,
  supplied: MatchingPropertyEvidence | undefined,
): MatchingPropertyEvidence {
  const derived = derivePropertyEvidence(property);
  if (!supplied) return derived;
  return {
    bedrooms: isFiniteNumber(supplied.bedrooms) && supplied.bedrooms >= 0
      ? supplied.bedrooms
      : derived.bedrooms,
    bathrooms: isFiniteNumber(supplied.bathrooms) && supplied.bathrooms >= 0
      ? supplied.bathrooms
      : derived.bathrooms,
    occupancy: isOccupancy(supplied.occupancy)
      ? supplied.occupancy
      : undefined,
    swimmingPool: isBoolean(supplied.swimmingPool)
      ? supplied.swimmingPool
      : derived.swimmingPool,
    gym: isBoolean(supplied.gym) ? supplied.gym : undefined,
    seaView: isBoolean(supplied.seaView) ? supplied.seaView : undefined,
    centralAC: isBoolean(supplied.centralAC) ? supplied.centralAC : undefined,
    builtUpAreaSquareMeters: isFiniteNumber(supplied.builtUpAreaSquareMeters)
      && supplied.builtUpAreaSquareMeters > 0
      ? supplied.builtUpAreaSquareMeters
      : derived.builtUpAreaSquareMeters,
    commercialActivity: typeof supplied.commercialActivity === "string"
      && supplied.commercialActivity.length > 0
      ? supplied.commercialActivity
      : derived.commercialActivity,
    floorNumber: isFiniteNumber(supplied.floorNumber) && supplied.floorNumber >= 0
      ? supplied.floorNumber
      : derived.floorNumber,
    frontageWidthMeters: isFiniteNumber(supplied.frontageWidthMeters)
      && supplied.frontageWidthMeters > 0
      ? supplied.frontageWidthMeters
      : derived.frontageWidthMeters,
  };
}

function roundScore(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function locationFraction(rank: number | null): number {
  if (rank === null) return 0.2;
  return Math.max(20, 100 - ((rank - 1) * 20)) / 100;
}

function criterion(
  criterionName: MatchCriterion,
  status: MatchExplanationStatus,
  awarded: number,
  possible: number,
  code: MatchExplanation["code"],
  message: string,
): CriterionPoints {
  return {
    awarded,
    possible,
    explanation: {
      criterion: criterionName,
      status,
      awardedPoints: awarded,
      possiblePoints: possible,
      code,
      message,
    },
  };
}

function serviceCriterionName(service: MatchingService): MatchCriterion {
  if (service === "swimmingPool") return "swimming_pool";
  if (service === "seaView") return "sea_view";
  if (service === "centralAC") return "central_ac";
  return "gym";
}

function evaluateService(
  service: MatchingService,
  evidence: MatchingPropertyEvidence,
  possible: number,
): CriterionPoints {
  const value = evidence[service];
  const name = serviceCriterionName(service);
  if (value === undefined) {
    return criterion(
      name,
      "unknown",
      0,
      possible,
      "unknown_property_evidence",
      `${service} evidence is Unknown.`,
    );
  }
  if (value) {
    return criterion(
      name,
      "matched",
      possible,
      possible,
      "service_present",
      `${service} is present in structured Property evidence.`,
    );
  }
  return criterion(
    name,
    "not_met",
    0,
    possible,
    "service_absent",
    `${service} is explicitly absent in structured Property evidence.`,
  );
}

function extractPrice(property: Property): {
  readonly amount: number;
  readonly currencyCode: string;
} | null {
  const offer = property.activeOffer;
  if (offer.transaction === "rent") {
    return isFiniteNumber(offer.rentalPrice.amount)
      && typeof offer.rentalPrice.currencyCode === "string"
      ? offer.rentalPrice
      : null;
  }
  return isFiniteNumber(offer.salePrice.amount)
    && typeof offer.salePrice.currencyCode === "string"
    ? offer.salePrice
    : null;
}

function hardEligibility(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
  price: { readonly amount: number; readonly currencyCode: string } | null,
): {
  readonly reasons: readonly MatchIneligibilityReason[];
  readonly locationRank: number | null;
} {
  const reasons: MatchIneligibilityReason[] = [];
  const property = candidate.property;
  const propertyDetails = property.typeDetails as TypeDetailsLike | undefined;
  const expectedTransaction = requirement.purpose === "rent" ? "rent" : "sale";
  const locationRank = requirement.preferredAreaIds.indexOf(
    property.core.locationArea.id,
  );

  const requiresCommercialFloor = requirement.propertyType === "floor"
    && (
      requirement.floorUse === "commercial"
      ||
      requirement.minimumBuiltUpAreaSquareMeters !== undefined
      || requirement.maximumBuiltUpAreaSquareMeters !== undefined
    );
  const requiresResidentialFloor = requirement.propertyType === "floor"
    && requirement.floorUse === "residential";
  if (
    property.core.propertyType !== requirement.propertyType
    || (requiresCommercialFloor && propertyDetails?.floorUse !== "commercial")
    || (requiresResidentialFloor && propertyDetails?.floorUse !== "residential")
  ) {
    reasons.push("property_type");
  }
  if (property.activeOffer.transaction !== expectedTransaction) {
    reasons.push("transaction");
  }
  if (
    price === null
    || price.currencyCode !== requirement.budget.currencyCode
  ) {
    reasons.push("currency");
  } else if (
    price.amount < requirement.budget.minimum
    || price.amount > requirement.budget.maximum
  ) {
    reasons.push("price");
  }
  return {
    reasons,
    locationRank: locationRank < 0 ? null : locationRank + 1,
  };
}

function ineligibleExplanation(
  reasons: readonly MatchIneligibilityReason[],
): MatchExplanation {
  const code = reasons.includes("property_type")
    ? "ineligible_property_type"
    : reasons.includes("transaction")
      ? "ineligible_transaction"
      : reasons.includes("currency")
        ? "ineligible_currency"
        : reasons.includes("price")
          ? "ineligible_price"
          : "ineligible_location";
  return {
    criterion: "eligibility",
    status: "ineligible",
    awardedPoints: 0,
    possiblePoints: 0,
    code,
    message: `Hard eligibility failed: ${reasons.join(", ")}.`,
  };
}

function priceDistance(
  requirement: SeekerRequirement,
  price: { readonly amount: number } | null,
): number | null {
  if (!price) return null;
  const midpoint = (
    requirement.budget.minimum + requirement.budget.maximum
  ) / 2;
  return Math.abs(price.amount - midpoint);
}

interface HardEligibilityAssessment extends MatchEligibilityResult {
  readonly price: {
    readonly amount: number;
    readonly currencyCode: string;
  } | null;
}

function assessHardEligibility(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
): HardEligibilityAssessment {
  const price = extractPrice(candidate.property);
  const eligibility = hardEligibility(requirement, candidate, price);
  return {
    eligible: eligibility.reasons.length === 0,
    locationRank: eligibility.locationRank,
    ineligibilityReasons: eligibility.reasons,
    price,
  };
}

/**
 * Checks only the authoritative hard eligibility gates. It deliberately does
 * not normalize evidence or calculate score, denominator, or qualification.
 */
export function checkMatchEligibility(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
): MatchEligibilityResult {
  const assessment = assessHardEligibility(requirement, candidate);
  return {
    eligible: assessment.eligible,
    locationRank: assessment.locationRank,
    ineligibilityReasons: assessment.ineligibilityReasons,
  };
}

/**
 * Evaluates one Requirement against one source-neutral Property candidate.
 * Property and Requirement are expected to satisfy their existing domain
 * contracts. Supplemental evidence is normalized defensively. Notes and
 * Rental Period are intentionally not read.
 */
export function evaluateMatch(
  requirement: SeekerRequirement,
  candidate: MatchingPropertyCandidate,
): MatchResult {
  const property = candidate.property;
  const assessment = assessHardEligibility(requirement, candidate);
  const midpointDistance = priceDistance(requirement, assessment.price);

  if (!assessment.eligible) {
    return {
      requirementId: requirement.id,
      propertyId: property.core.id,
      eligible: false,
      score: 0,
      qualifies: false,
      includedWeight: 0,
      locationRank: assessment.locationRank,
      priceDistanceFromBudgetMidpoint: midpointDistance,
      propertyChronology: candidate.propertyChronology,
      ineligibilityReasons: assessment.ineligibilityReasons,
      explanations: [ineligibleExplanation(assessment.ineligibilityReasons)],
    };
  }

  const evidence = mergeEvidence(property, candidate.evidence);
  const explanations: MatchExplanation[] = [];
  const points: CriterionPoints[] = [];
  const shopCriteriaRequested = requirement.propertyType === "shop"
    && (
      requirement.minimumBuiltUpAreaSquareMeters !== undefined
      || requirement.maximumBuiltUpAreaSquareMeters !== undefined
      || requirement.commercialActivity !== undefined
      || requirement.floorNumber !== undefined
      || requirement.minimumFrontageWidthMeters !== undefined
    );
  const commercialFloorCriteriaRequested = requirement.propertyType === "floor"
    && requirement.floorUse !== "residential"
    && (
      requirement.commercialActivity !== undefined
      || requirement.floorNumber !== undefined
      || requirement.minimumFrontageWidthMeters !== undefined
    );
  const commercialAreaRequested =
    isCommercialAreaRequirementPropertyType(requirement.propertyType)
    && (
      requirement.minimumBuiltUpAreaSquareMeters !== undefined
      || requirement.maximumBuiltUpAreaSquareMeters !== undefined
    );
  const weights = shopCriteriaRequested
    ? SHOP_MATCH_SCORING_WEIGHTS
    : requirement.purpose === "rent"
      ? MATCH_SCORING_WEIGHTS.rent
      : MATCH_SCORING_WEIGHTS.buy;

  points.push(criterion(
    "budget",
    "matched",
    weights.budget,
    weights.budget,
    "within_budget",
    "Price is within the explicit Requirement budget.",
  ));

  const rank = assessment.locationRank;
  if (rank === null) {
    const locationPoints = weights.orderedLocation * locationFraction(rank);
    points.push(criterion(
      "ordered_location",
      "not_met",
      locationPoints,
      weights.orderedLocation,
      "ordered_location_rank",
      "Property is outside the preferred locations; location receives 20% of its points.",
    ));
  } else {
    const locationPoints = weights.orderedLocation * locationFraction(rank);
    points.push(criterion(
      "ordered_location",
      "matched",
      locationPoints,
      weights.orderedLocation,
      "ordered_location_rank",
      `Property is the ${rank} preference; location receives ${locationFraction(rank) * 100}% of its points.`,
    ));
  }

  if (
    requirement.purpose === "rent"
    && requirement.propertyType !== "shop"
    && !(requirement.propertyType === "floor" && requirement.floorUse === "commercial")
  ) {
    const rentWeights = MATCH_SCORING_WEIGHTS.rent;
    if (requirement.bedroomsMinimum !== undefined) {
      const possible = rentWeights.bedrooms;
      const bedrooms = evidence.bedrooms;
      points.push(bedrooms === undefined
        ? criterion(
          "bedrooms",
          "unknown",
          0,
          possible,
          "unknown_property_evidence",
          "Bedroom evidence is Unknown.",
        )
        : criterion(
          "bedrooms",
          bedrooms >= requirement.bedroomsMinimum ? "matched" : "not_met",
          bedrooms >= requirement.bedroomsMinimum ? possible : 0,
          possible,
          bedrooms >= requirement.bedroomsMinimum ? "meets_minimum" : "below_minimum",
          bedrooms >= requirement.bedroomsMinimum
            ? "Property meets the minimum bedrooms."
            : "Property is below the minimum bedrooms.",
        ));
    }

    if (requirement.bathroomsMinimum !== undefined) {
      const possible = rentWeights.bathrooms;
      const bathrooms = evidence.bathrooms;
      points.push(bathrooms === undefined
        ? criterion(
          "bathrooms",
          "unknown",
          0,
          possible,
          "unknown_property_evidence",
          "Bathroom evidence is Unknown.",
        )
        : criterion(
          "bathrooms",
          bathrooms >= requirement.bathroomsMinimum ? "matched" : "not_met",
          bathrooms >= requirement.bathroomsMinimum ? possible : 0,
          possible,
          bathrooms >= requirement.bathroomsMinimum ? "meets_minimum" : "below_minimum",
          bathrooms >= requirement.bathroomsMinimum
            ? "Property meets the minimum bathrooms."
            : "Property is below the minimum bathrooms.",
        ));
    }

    if (requirement.occupancy !== undefined) {
      const possible = rentWeights.occupancy;
      const propertyOccupancy = evidence.occupancy;
      if (propertyOccupancy === undefined) {
        points.push(criterion(
          "occupancy",
          "unknown",
          0,
          possible,
          "unknown_property_evidence",
          "Occupancy evidence is Unknown.",
        ));
      } else {
        const compatible = requirement.occupancy === "any"
          || propertyOccupancy === "any"
          || requirement.occupancy === propertyOccupancy;
        points.push(criterion(
          "occupancy",
          compatible ? "matched" : "not_met",
          compatible ? possible : 0,
          possible,
          compatible ? "exact_or_compatible" : "occupancy_not_compatible",
          compatible
            ? "Property occupancy is exact or compatible with the Requirement."
            : "Property occupancy is not compatible with the Requirement.",
        ));
      }
    }

    const requestedServices = (
      ["swimmingPool", "gym", "seaView", "centralAC"] as const
    ).filter(service => requirement[service] === true);
    if (requestedServices.length > 0) {
      const possible = rentWeights.services / requestedServices.length;
      for (const service of requestedServices) {
        points.push(evaluateService(service, evidence, possible));
      }
    }
  }

  if (commercialAreaRequested) {
    const actual = evidence.builtUpAreaSquareMeters;
    const possible = requirement.propertyType === "shop"
      ? SHOP_MATCH_SCORING_WEIGHTS.builtUpArea
      : COMMERCIAL_AREA_MATCH_WEIGHT;
    const minimum = requirement.minimumBuiltUpAreaSquareMeters;
    const maximum = requirement.maximumBuiltUpAreaSquareMeters;
    const withinRange = actual !== undefined
      && (minimum === undefined || actual >= minimum)
      && (maximum === undefined || actual <= maximum);
    points.push(actual === undefined
      ? criterion("built_up_area", "unknown", 0, possible, "unknown_property_evidence", "Commercial area evidence is Unknown.")
      : criterion(
        "built_up_area",
        withinRange ? "matched" : "not_met",
        withinRange ? possible : 0,
        possible,
        withinRange ? "within_range" : "outside_range",
        withinRange
          ? "Property area is within the requested range."
          : "Property area is outside the requested range.",
      ));
  }

  if (shopCriteriaRequested || commercialFloorCriteriaRequested) {
    if (requirement.commercialActivity !== undefined) {
      const actual = evidence.commercialActivity;
      const possible = SHOP_MATCH_SCORING_WEIGHTS.commercialActivity;
      const matches = actual === requirement.commercialActivity;
      points.push(actual === undefined
        ? criterion("commercial_activity", "unknown", 0, possible, "unknown_property_evidence", "Shop activity evidence is Unknown.")
        : criterion(
          "commercial_activity",
          matches ? "matched" : "not_met",
          matches ? possible : 0,
          possible,
          matches ? "exact_or_compatible" : "occupancy_not_compatible",
          matches ? "Shop activity matches exactly." : "Shop activity does not match.",
        ));
    }
    if (requirement.floorNumber !== undefined) {
      const actual = evidence.floorNumber;
      const possible = SHOP_MATCH_SCORING_WEIGHTS.floorNumber;
      const matches = actual === requirement.floorNumber;
      points.push(actual === undefined
        ? criterion("floor_number", "unknown", 0, possible, "unknown_property_evidence", "Shop floor evidence is Unknown.")
        : criterion(
          "floor_number",
          matches ? "matched" : "not_met",
          matches ? possible : 0,
          possible,
          matches ? "exact_or_compatible" : "occupancy_not_compatible",
          matches ? "Shop floor matches exactly." : "Shop floor does not match.",
        ));
    }
    if (requirement.minimumFrontageWidthMeters !== undefined) {
      const actual = evidence.frontageWidthMeters;
      const possible = SHOP_MATCH_SCORING_WEIGHTS.frontage;
      points.push(actual === undefined
        ? criterion("frontage", "unknown", 0, possible, "unknown_property_evidence", "Shop frontage evidence is Unknown.")
        : criterion(
          "frontage",
          actual >= requirement.minimumFrontageWidthMeters ? "matched" : "not_met",
          actual >= requirement.minimumFrontageWidthMeters ? possible : 0,
          possible,
          actual >= requirement.minimumFrontageWidthMeters ? "meets_minimum" : "below_minimum",
          actual >= requirement.minimumFrontageWidthMeters
            ? "Shop meets the minimum frontage."
            : "Shop is below the minimum frontage.",
        ));
    }
  }

  let earned = 0;
  let denominator = 0;
  for (const item of points) {
    earned += item.awarded;
    denominator += item.possible;
    explanations.push(item.explanation);
  }
  const score = roundScore((earned / denominator) * 100);

  return {
    requirementId: requirement.id,
    propertyId: property.core.id,
    eligible: true,
    score,
    qualifies: score >= MATCH_QUALIFICATION_THRESHOLD,
    includedWeight: denominator,
    locationRank: assessment.locationRank,
    priceDistanceFromBudgetMidpoint: midpointDistance,
    propertyChronology: candidate.propertyChronology,
    ineligibilityReasons: [],
    explanations: [
      {
        criterion: "eligibility",
        status: "matched",
        awardedPoints: 0,
        possiblePoints: 0,
        code: "eligible",
        message: "Property passes all hard eligibility rules.",
      },
      ...explanations,
    ],
  };
}

/**
 * Deterministically ranks results without mutating the caller's array.
 * Ineligible results are placed after eligible results.
 */
export function rankMatchResults(
  results: readonly MatchResult[],
): MatchResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      const a = left.result;
      const b = right.result;
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      const aLocation = a.locationRank ?? Number.POSITIVE_INFINITY;
      const bLocation = b.locationRank ?? Number.POSITIVE_INFINITY;
      if (aLocation !== bLocation) return aLocation - bLocation;
      const aDistance = a.priceDistanceFromBudgetMidpoint
        ?? Number.POSITIVE_INFINITY;
      const bDistance = b.priceDistanceFromBudgetMidpoint
        ?? Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aChronology = isFiniteNumber(a.propertyChronology)
        ? a.propertyChronology
        : Number.POSITIVE_INFINITY;
      const bChronology = isFiniteNumber(b.propertyChronology)
        ? b.propertyChronology
        : Number.POSITIVE_INFINITY;
      if (aChronology !== bChronology) return aChronology - bChronology;
      return left.index - right.index;
    })
    .map(item => item.result);
}