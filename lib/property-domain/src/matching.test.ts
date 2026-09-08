import {
  checkMatchEligibility,
  evaluateMatch,
  MATCH_QUALIFICATION_THRESHOLD,
  MATCH_SCORING_WEIGHTS,
  rankMatchResults,
  type MatchingPropertyCandidate,
  type MatchingPropertyEvidence,
  type MatchResult,
  type Property,
  type RentSeekerRequirement,
  type BuySeekerRequirement,
} from "./index.ts";

type Test = {
  readonly name: string;
  readonly run: () => void;
};

const tests: Test[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

const assert = {
  equal<T>(actual: T, expected: T): void {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
    }
  },
};

const rentRequirement = (
  overrides: Partial<RentSeekerRequirement> = {},
): RentSeekerRequirement => ({
  id: "requirement-rent",
  seekerId: "seeker-1",
  purpose: "rent",
  propertyType: "apartment",
  preferredAreaIds: [
    "area-1",
    "area-2",
    "area-3",
    "area-4",
    "area-5",
    "area-6",
    "area-7",
  ],
  budget: { minimum: 100, maximum: 200, currencyCode: "KWD" },
  notes: "ignored by Matching",
  ...overrides,
});

const buyRequirement = (
  overrides: Partial<BuySeekerRequirement> = {},
): BuySeekerRequirement => ({
  id: "requirement-buy",
  seekerId: "seeker-1",
  purpose: "buy",
  propertyType: "villa",
  preferredAreaIds: ["area-1", "area-2"],
  budget: { minimum: 100_000, maximum: 200_000, currencyCode: "KWD" },
  notes: "ignored by Matching",
  ...overrides,
});

function property(options: {
  readonly id?: string;
  readonly propertyType?: Property["core"]["propertyType"];
  readonly area?: string;
  readonly transaction?: "rent" | "sale";
  readonly amount?: number;
  readonly currencyCode?: string;
  readonly rentalPeriodId?: string;
  readonly typeDetails?: Property["typeDetails"];
} = {}): Property {
  const id = options.id ?? "property-1";
  const propertyType = options.propertyType ?? "apartment";
  const transaction = options.transaction ?? "rent";
  const amount = options.amount ?? 150;
  const currencyCode = options.currencyCode ?? "KWD";
  const activeOffer = transaction === "rent"
    ? {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: "rent" as const,
      rentalPrice: { amount, currencyCode },
      rentalPeriodId: options.rentalPeriodId ?? "monthly",
    }
    : {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: "sale" as const,
      salePrice: { amount, currencyCode },
    };
  return {
    core: {
      id,
      propertyType,
      locationArea: { id: options.area ?? "area-1" },
    },
    activeOffer,
    typeDetails: options.typeDetails,
  };
}

function candidate(
  propertyValue: Property,
  evidence?: MatchingPropertyEvidence,
  propertyChronology?: number,
): MatchingPropertyCandidate {
  return { property: propertyValue, evidence, propertyChronology };
}

function explanation(
  result: MatchResult,
  criterion: string,
) {
  return result.explanations.find(item => item.criterion === criterion);
}

test("Eligibility-only and full evaluation share identical hard gates", () => {
  for (const propertyValue of [
    property(),
    property({ amount: 201 }),
    property({ area: "area-outside" }),
    property({ currencyCode: "USD" }),
    property({ transaction: "sale" }),
  ]) {
    const matchingCandidate = candidate(propertyValue);
    const eligibility = checkMatchEligibility(
      rentRequirement(),
      matchingCandidate,
    );
    const fullResult = evaluateMatch(rentRequirement(), matchingCandidate);
    assert.equal(eligibility.eligible, fullResult.eligible);
    assert.equal(eligibility.locationRank, fullResult.locationRank);
    assert.deepEqual(
      eligibility.ineligibilityReasons,
      fullResult.ineligibilityReasons,
    );
  }
});

test("Rent and Buy/Sale use separate transaction contracts and hard eligibility", () => {
  const rent = rentRequirement();
  const buy = buyRequirement();

  assert.equal(evaluateMatch(rent, candidate(property())).eligible, true);
  assert.equal(
    evaluateMatch(rent, candidate(property({ transaction: "sale" }))).eligible,
    false,
  );
  assert.deepEqual(
    evaluateMatch(rent, candidate(property({ propertyType: "villa" })))
      .ineligibilityReasons,
    ["property_type"],
  );
  assert.deepEqual(
    evaluateMatch(rent, candidate(property({ amount: 201 })))
      .ineligibilityReasons,
    ["price"],
  );
  assert.equal(
    evaluateMatch(rent, candidate(property({ amount: 100 }))).eligible,
    true,
  );
  assert.equal(
    evaluateMatch(rent, candidate(property({ amount: 200 }))).eligible,
    true,
  );
  const outsidePreferredAreas = evaluateMatch(
    rent,
    candidate(property({ area: "area-outside" })),
  );
  assert.equal(outsidePreferredAreas.eligible, true);
  assert.deepEqual(outsidePreferredAreas.ineligibilityReasons, []);
  assert.equal(outsidePreferredAreas.locationRank, null);
  assert.equal(
    explanation(outsidePreferredAreas, "ordered_location")?.status,
    "not_met",
  );
  assert.equal(
    explanation(outsidePreferredAreas, "ordered_location")?.awardedPoints,
    6,
  );
  assert.deepEqual(
    evaluateMatch(rent, candidate(property({ currencyCode: "USD" })))
      .ineligibilityReasons,
    ["currency"],
  );

  const sale = property({
    propertyType: "villa",
    transaction: "sale",
    amount: 150_000,
  });
  assert.equal(evaluateMatch(buy, candidate(sale)).eligible, true);
  assert.deepEqual(
    evaluateMatch(buy, candidate(property({
      propertyType: "villa",
      transaction: "rent",
      amount: 150_000,
    }))).ineligibilityReasons,
    ["transaction"],
  );
  assert.deepEqual(MATCH_SCORING_WEIGHTS, {
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
  });
});

test("Shop matching scores aligned Shop criteria and keeps cross-area candidates eligible", () => {
  const requirement: BuySeekerRequirement = {
    ...buyRequirement(),
    propertyType: "shop",
    preferredAreaIds: ["area-1"],
    minimumBuiltUpAreaSquareMeters: 80,
    maximumBuiltUpAreaSquareMeters: 100,
    commercialActivity: "Coffee & Gifts",
    floorNumber: 0,
    minimumFrontageWidthMeters: 8,
  };
  const shopDetails = {
    propertyType: "shop" as const,
    builtUpAreaSquareMeters: 80,
    commercialActivity: {
      value: "Coffee & Gifts",
      privacy: { classification: "normal" as const, disclosurePolicy: "normal" as const },
    },
    floorNumber: 0,
    frontageWidthMeters: 8,
  };
  const sameArea = evaluateMatch(requirement, candidate(property({
    propertyType: "shop",
    transaction: "sale",
    amount: 150_000,
    area: "area-1",
    typeDetails: shopDetails,
  })));
  const crossArea = evaluateMatch(requirement, candidate(property({
    propertyType: "shop",
    transaction: "sale",
    amount: 150_000,
    area: "area-outside",
    typeDetails: shopDetails,
  })));

  assert.equal(sameArea.eligible, true);
  assert.equal(sameArea.score, 100);
  assert.equal(sameArea.qualifies, true);
  assert.equal(sameArea.includedWeight, 100);
  assert.equal(crossArea.eligible, true);
  assert.deepEqual(crossArea.ineligibilityReasons, []);
  assert.equal(crossArea.locationRank, null);
  assert.equal(crossArea.score, 76);
  assert.equal(crossArea.qualifies, true);
  assert.equal(crossArea.includedWeight, 100);
  assert.equal(explanation(crossArea, "budget")?.awardedPoints, 40);
  assert.equal(explanation(crossArea, "ordered_location")?.awardedPoints, 6);
  assert.equal(explanation(crossArea, "built_up_area")?.awardedPoints, 10);
  assert.equal(explanation(crossArea, "commercial_activity")?.awardedPoints, 10);
  assert.equal(explanation(crossArea, "floor_number")?.awardedPoints, 5);
  assert.equal(explanation(crossArea, "frontage")?.awardedPoints, 5);
});

test("Commercial area matching supports bounded, minimum-only, maximum-only, and omitted ranges", () => {
  const commercialTypes = ["shop", "office", "floor"] as const;
  for (const propertyType of commercialTypes) {
    const typeDetails: Property["typeDetails"] = propertyType === "floor"
      ? {
          propertyType: "floor" as const,
          floorUse: "commercial" as const,
          builtUpAreaSquareMeters: 100,
        }
      : propertyType === "shop"
        ? {
            propertyType: "shop",
            builtUpAreaSquareMeters: 100,
          }
        : {
            propertyType: "office",
            builtUpAreaSquareMeters: 100,
          };
    const commercialProperty = property({
      propertyType,
      transaction: "sale",
      amount: 150_000,
      typeDetails,
    });
    const ranges = [
      { minimumBuiltUpAreaSquareMeters: 80, maximumBuiltUpAreaSquareMeters: 120 },
      { minimumBuiltUpAreaSquareMeters: 80 },
      { maximumBuiltUpAreaSquareMeters: 120 },
    ] as const;
    for (const range of ranges) {
      const result = evaluateMatch({
        ...buyRequirement(),
        propertyType,
        ...range,
      }, candidate(commercialProperty));
      assert.equal(explanation(result, "built_up_area")?.status, "matched");
      assert.equal(explanation(result, "built_up_area")?.code, "within_range");
    }

    const belowMinimum = evaluateMatch({
      ...buyRequirement(),
      propertyType,
      minimumBuiltUpAreaSquareMeters: 101,
    }, candidate(commercialProperty));
    assert.equal(explanation(belowMinimum, "built_up_area")?.status, "not_met");
    assert.equal(explanation(belowMinimum, "built_up_area")?.code, "outside_range");

    const aboveMaximum = evaluateMatch({
      ...buyRequirement(),
      propertyType,
      maximumBuiltUpAreaSquareMeters: 99,
    }, candidate(commercialProperty));
    assert.equal(explanation(aboveMaximum, "built_up_area")?.status, "not_met");

    const omitted = evaluateMatch({
      ...buyRequirement(),
      propertyType,
    }, candidate(commercialProperty));
    assert.equal(explanation(omitted, "built_up_area"), undefined);
    assert.equal(omitted.score, 100);
  }

  const residentialFloor = evaluateMatch({
    ...buyRequirement(),
    propertyType: "floor",
    minimumBuiltUpAreaSquareMeters: 80,
    maximumBuiltUpAreaSquareMeters: 120,
  }, candidate(property({
    propertyType: "floor",
    transaction: "sale",
    amount: 150_000,
    typeDetails: {
      propertyType: "floor",
      floorUse: "residential",
      builtUpAreaSquareMeters: 100,
    },
  })));
  assert.equal(residentialFloor.eligible, false);
  assert.equal(residentialFloor.qualifies, false);
  assert.deepEqual(residentialFloor.ineligibilityReasons, ["property_type"]);
});

test("Floor Requirements match only the selected residential or commercial use", () => {
  const residentialRequirement: RentSeekerRequirement = {
    ...rentRequirement(),
    propertyType: "floor",
    floorUse: "residential",
    bedroomsMinimum: 3,
  };
  const residentialProperty = property({
    propertyType: "floor",
    typeDetails: {
      propertyType: "floor",
      floorUse: "residential",
      builtUpAreaSquareMeters: 180,
      bedroomCount: 3,
    },
  });
  const commercialProperty = property({
    propertyType: "floor",
    typeDetails: {
      propertyType: "floor",
      floorUse: "commercial",
      builtUpAreaSquareMeters: 180,
      commercialActivity: {
        value: "Retail",
        privacy: { classification: "normal", disclosurePolicy: "normal" },
      },
      floorNumber: 2,
      frontageWidthMeters: 9,
    },
  });
  assert.equal(evaluateMatch(residentialRequirement, candidate(residentialProperty)).eligible, true);
  assert.equal(evaluateMatch(residentialRequirement, candidate(commercialProperty)).eligible, false);

  const commercialRequirement: RentSeekerRequirement = {
    ...rentRequirement(),
    propertyType: "floor",
    floorUse: "commercial",
    bedroomsMinimum: undefined,
    bathroomsMinimum: undefined,
    occupancy: undefined,
    minimumBuiltUpAreaSquareMeters: 150,
    maximumBuiltUpAreaSquareMeters: 200,
    commercialActivity: "Retail",
    floorNumber: 2,
    minimumFrontageWidthMeters: 8,
  };
  const commercialResult = evaluateMatch(
    commercialRequirement,
    candidate(commercialProperty),
  );
  assert.equal(commercialResult.eligible, true);
  assert.equal(explanation(commercialResult, "built_up_area")?.status, "matched");
  assert.equal(explanation(commercialResult, "commercial_activity")?.status, "matched");
  assert.equal(explanation(commercialResult, "floor_number")?.status, "matched");
  assert.equal(explanation(commercialResult, "frontage")?.status, "matched");
  assert.equal(evaluateMatch(commercialRequirement, candidate(residentialProperty)).eligible, false);
});

test("Shop score breakdown proves a mismatched Shop criterion can remain below threshold", () => {
  const requirement: RentSeekerRequirement = {
    ...rentRequirement(),
    propertyType: "shop",
    preferredAreaIds: ["area-1"],
    minimumBuiltUpAreaSquareMeters: 80,
    commercialActivity: "Coffee & Gifts",
    floorNumber: 0,
    minimumFrontageWidthMeters: 8,
  };
  const result = evaluateMatch(requirement, candidate(property({
    propertyType: "shop",
    transaction: "rent",
    amount: 150,
    area: "area-outside",
    typeDetails: {
      propertyType: "shop",
      builtUpAreaSquareMeters: 80,
      commercialActivity: {
        value: "Different activity",
        privacy: { classification: "normal", disclosurePolicy: "normal" },
      },
      floorNumber: 0,
      frontageWidthMeters: 8,
    },
  })));

  assert.equal(result.eligible, true);
  assert.equal(result.score, 66);
  assert.equal(result.qualifies, false);
  assert.equal(explanation(result, "commercial_activity")?.status, "not_met");
  assert.equal(explanation(result, "commercial_activity")?.awardedPoints, 0);
});

test("Rental Period and Notes are outside Matching semantics", () => {
  const requirement = rentRequirement({ notes: "first literal note" });
  const first = evaluateMatch(
    requirement,
    candidate(property({ rentalPeriodId: "monthly" })),
  );
  const second = evaluateMatch(
    { ...requirement, notes: "different literal note" },
    candidate(property({ rentalPeriodId: "weekly" })),
  );
  assert.deepEqual(second, first);
});

test("Ordered Location scoring decays by rank and floors at 20 percent", () => {
  const requirement = rentRequirement();
  const rankOne = evaluateMatch(requirement, candidate(property({ area: "area-1" })));
  const rankTwo = evaluateMatch(requirement, candidate(property({ area: "area-2" })));
  const rankThree = evaluateMatch(requirement, candidate(property({ area: "area-3" })));
  const rankFour = evaluateMatch(requirement, candidate(property({ area: "area-4" })));
  const rankFive = evaluateMatch(requirement, candidate(property({ area: "area-5" })));
  const rankSix = evaluateMatch(requirement, candidate(property({ area: "area-6" })));
  const rankSeven = evaluateMatch(requirement, candidate(property({ area: "area-7" })));

  assert.equal(rankOne.locationRank, 1);
  assert.equal(explanation(rankOne, "ordered_location")?.awardedPoints, 30);
  assert.equal(explanation(rankTwo, "ordered_location")?.awardedPoints, 24);
  assert.equal(explanation(rankThree, "ordered_location")?.awardedPoints, 18);
  assert.equal(explanation(rankFour, "ordered_location")?.awardedPoints, 12);
  assert.equal(explanation(rankFive, "ordered_location")?.awardedPoints, 6);
  assert.equal(explanation(rankSix, "ordered_location")?.awardedPoints, 6);
  assert.equal(explanation(rankSeven, "ordered_location")?.awardedPoints, 6);
  assert.equal(rankSix.locationRank, 6);
  assert.equal(rankSeven.locationRank, 7);
});

test("Saved Bayān-only Requirements score Daiya as cross-area and Bayān normally", () => {
  const rent = rentRequirement({
    propertyType: "shop",
    preferredAreaIds: ["bayan"],
  });
  const rentOutside = evaluateMatch(
    rent,
    candidate(property({
      propertyType: "shop",
      area: "daiya",
    })),
  );
  const rentSameArea = evaluateMatch(
    rent,
    candidate(property({
      propertyType: "shop",
      area: "bayan",
    })),
  );
  assert.equal(rentOutside.locationRank, null);
  assert.equal(explanation(rentOutside, "ordered_location")?.status, "not_met");
  assert.equal(explanation(rentOutside, "ordered_location")?.awardedPoints, 6);
  assert.equal(explanation(rentOutside, "ordered_location")?.possiblePoints, 30);
  assert.equal(rentSameArea.locationRank, 1);
  assert.equal(explanation(rentSameArea, "ordered_location")?.status, "matched");
  assert.equal(explanation(rentSameArea, "ordered_location")?.awardedPoints, 30);

  const buy = buyRequirement({ preferredAreaIds: ["bayan"] });
  const buyOutside = evaluateMatch(
    buy,
    candidate(property({
      propertyType: "villa",
      area: "daiya",
      transaction: "sale",
      amount: 150_000,
    })),
  );
  const buySameArea = evaluateMatch(
    buy,
    candidate(property({
      propertyType: "villa",
      area: "bayan",
      transaction: "sale",
      amount: 150_000,
    })),
  );
  assert.equal(buyOutside.locationRank, null);
  assert.equal(explanation(buyOutside, "ordered_location")?.status, "not_met");
  assert.equal(explanation(buyOutside, "ordered_location")?.awardedPoints, 8);
  assert.equal(explanation(buyOutside, "ordered_location")?.possiblePoints, 40);
  assert.equal(buySameArea.locationRank, 1);
  assert.equal(explanation(buySameArea, "ordered_location")?.status, "matched");
  assert.equal(explanation(buySameArea, "ordered_location")?.awardedPoints, 40);
});

test("Location mismatch is scored instead of hard-excluded", () => {
  const requirement = rentRequirement({
    propertyType: "chalet",
    bedroomsMinimum: 3,
    bathroomsMinimum: 2,
    occupancy: "family",
    swimmingPool: true,
  });
  const result = evaluateMatch(
    requirement,
    candidate(
      property({
        area: "area-outside",
        propertyType: "chalet",
        typeDetails: {
          propertyType: "chalet",
          bedroomCount: 4,
          bathroomCount: 3,
          hasPool: true,
        },
      }),
      { occupancy: "family" },
    ),
  );

  assert.equal(result.eligible, true);
  assert.equal(result.locationRank, null);
  assert.equal(result.score, 76);
  assert.equal(result.qualifies, true);
  assert.equal(explanation(result, "ordered_location")?.status, "not_met");
  assert.equal(explanation(result, "ordered_location")?.possiblePoints, 30);
});

test("Identical evidence produces identical percentages after location scoring change", () => {
  const requirement = rentRequirement({ bedroomsMinimum: 2 });
  const first = evaluateMatch(
    requirement,
    candidate(property({ area: "area-outside" })),
  );
  const second = evaluateMatch(
    requirement,
    candidate(property({ area: "another-outside-area" })),
  );

  assert.equal(first.score, second.score);
  assert.equal(first.score, 57.5);
  assert.equal(first.qualifies, false);
  assert.equal(second.qualifies, false);
});

test("Buy location mismatch remains eligible but cannot reach the unchanged threshold", () => {
  const result = evaluateMatch(
    buyRequirement(),
    candidate(property({
      area: "area-outside",
      propertyType: "villa",
      transaction: "sale",
      amount: 150_000,
    })),
  );

  assert.equal(result.eligible, true);
  assert.equal(result.score, 68);
  assert.equal(result.qualifies, false);
  assert.equal(MATCH_QUALIFICATION_THRESHOLD, 70);
});

test("Missing optional Requirement criteria are excluded, while missing Property evidence stays in denominator", () => {
  const withoutOptionalCriteria = evaluateMatch(
    rentRequirement(),
    candidate(property()),
  );
  assert.equal(withoutOptionalCriteria.includedWeight, 70);
  assert.equal(withoutOptionalCriteria.score, 100);

  const withUnknownCriteria = evaluateMatch(
    rentRequirement({
      bedroomsMinimum: 2,
      bathroomsMinimum: 1,
      occupancy: "family",
      swimmingPool: true,
    }),
    candidate(property()),
  );
  assert.equal(withUnknownCriteria.includedWeight, 100);
  assert.equal(withUnknownCriteria.score, 70);
  assert.equal(withUnknownCriteria.qualifies, true);
  assert.equal(explanation(withUnknownCriteria, "bedrooms")?.status, "unknown");
  assert.equal(explanation(withUnknownCriteria, "bathrooms")?.status, "unknown");
  assert.equal(explanation(withUnknownCriteria, "occupancy")?.status, "unknown");
  assert.equal(explanation(withUnknownCriteria, "swimming_pool")?.status, "unknown");

  const malformedSupplementalEvidence = evaluateMatch(
    rentRequirement({ bedroomsMinimum: 2 }),
    candidate(property(), {
      bedrooms: Number.NaN,
    }),
  );
  assert.equal(
    explanation(malformedSupplementalEvidence, "bedrooms")?.status,
    "unknown",
  );
});

test("Qualification uses the normalized score threshold of exactly 70.00", () => {
  const exactlySeventy = evaluateMatch(
    rentRequirement({
      bedroomsMinimum: 2,
      bathroomsMinimum: 1,
      occupancy: "family",
      swimmingPool: true,
    }),
    candidate(property()),
  );
  assert.equal(exactlySeventy.score, 70);
  assert.equal(exactlySeventy.qualifies, true);

  const belowSeventy = evaluateMatch(
    rentRequirement({
      bedroomsMinimum: 2,
      bathroomsMinimum: 1,
      occupancy: "family",
      swimmingPool: true,
    }),
    candidate(property({ area: "area-2" })),
  );
  assert.equal(belowSeventy.score, 64);
  assert.equal(belowSeventy.qualifies, false);
});

test("Bedrooms and Bathrooms award full points for surplus and zero below minimum", () => {
  const requirement = rentRequirement({
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
  });
  const surplus = evaluateMatch(
    requirement,
    candidate(property({
      typeDetails: {
        propertyType: "apartment",
        bedroomCount: 5,
        bathroomCount: 3,
      },
    })),
  );
  assert.equal(surplus.score, 100);
  assert.equal(explanation(surplus, "bedrooms")?.awardedPoints, 10);
  assert.equal(explanation(surplus, "bathrooms")?.awardedPoints, 10);

  const below = evaluateMatch(
    requirement,
    candidate(property({
      typeDetails: {
        propertyType: "apartment",
        bedroomCount: 1,
        bathroomCount: 0,
      },
    })),
  );
  assert.equal(explanation(below, "bedrooms")?.awardedPoints, 0);
  assert.equal(explanation(below, "bathrooms")?.awardedPoints, 0);
});

test("Occupancy compatibility and requested services use approved evidence only", () => {
  const requirement = rentRequirement({
    propertyType: "chalet",
    occupancy: "family",
    swimmingPool: true,
    gym: true,
    seaView: true,
    centralAC: true,
  });
  const result = evaluateMatch(
    requirement,
    candidate(
      property({
        propertyType: "chalet",
        typeDetails: {
          propertyType: "chalet",
          hasWaterfront: true,
          hasPool: true,
        },
      }),
      {
        occupancy: "family",
        gym: false,
        seaView: true,
        // centralAC is intentionally Unknown.
      },
    ),
  );

  assert.equal(MATCH_SCORING_WEIGHTS.rent.services, 5);
  assert.equal(explanation(result, "occupancy")?.status, "matched");
  assert.equal(explanation(result, "swimming_pool")?.status, "matched");
  assert.equal(explanation(result, "gym")?.status, "not_met");
  assert.equal(explanation(result, "sea_view")?.status, "matched");
  assert.equal(explanation(result, "central_ac")?.status, "unknown");
  assert.equal(explanation(result, "sea_view")?.awardedPoints, 1.25);
  assert.equal(explanation(result, "central_ac")?.awardedPoints, 0);

  const waterfrontOnly = evaluateMatch(
    rentRequirement({ propertyType: "chalet", seaView: true }),
    candidate(property({
      propertyType: "chalet",
      typeDetails: { propertyType: "chalet", hasWaterfront: true },
    })),
  );
  assert.equal(explanation(waterfrontOnly, "sea_view")?.status, "unknown");
  assert.equal(explanation(waterfrontOnly, "sea_view")?.awardedPoints, 0);

  const explicitAny = evaluateMatch(
    rentRequirement({ occupancy: "any" }),
    candidate(property(), { occupancy: "bachelor" }),
  );
  assert.equal(explanation(explicitAny, "occupancy")?.status, "matched");

  const anyWithoutEvidence = evaluateMatch(
    rentRequirement({ occupancy: "any" }),
    candidate(property()),
  );
  assert.equal(explanation(anyWithoutEvidence, "occupancy")?.status, "unknown");

  const onlyRequestedService = evaluateMatch(
    rentRequirement({ swimmingPool: false, gym: true }),
    candidate(property(), { swimmingPool: false, gym: true }),
  );
  assert.equal(onlyRequestedService.includedWeight, 75);
  assert.equal(explanation(onlyRequestedService, "swimming_pool"), undefined);
  assert.equal(explanation(onlyRequestedService, "gym")?.possiblePoints, 5);
});

test("Buy/Sale scoring uses only Budget and Ordered Location", () => {
  const result = evaluateMatch(
    buyRequirement(),
    candidate(property({
      propertyType: "villa",
      transaction: "sale",
      amount: 150_000,
    })),
  );
  assert.equal(result.includedWeight, 100);
  assert.equal(result.score, 100);
  assert.equal(result.explanations.some(item =>
    item.criterion === "bedrooms"
      || item.criterion === "bathrooms"
      || item.criterion === "occupancy"
      || item.criterion === "swimming_pool"
      || item.criterion === "gym"
      || item.criterion === "sea_view"
      || item.criterion === "central_ac"
  ), false);
  assert.equal(MATCH_SCORING_WEIGHTS.buy.budget, 60);
  assert.equal(MATCH_SCORING_WEIGHTS.buy.orderedLocation, 40);
});

test("Ranking is deterministic by score, location, midpoint distance, chronology, then input order", () => {
  const requirement = rentRequirement();
  const higherScore = evaluateMatch(
    requirement,
    candidate(property({ id: "higher", area: "area-1" }), undefined, 100),
  );
  const lowerScore = evaluateMatch(
    requirement,
    candidate(property({ id: "lower", area: "area-2" }), undefined, 1),
  );
  assert.deepEqual(
    rankMatchResults([lowerScore, higherScore]).map(item => item.propertyId),
    ["higher", "lower"],
  );

  const firstLocation = evaluateMatch(
    requirement,
    candidate(property({ id: "first-location", area: "area-1" }), undefined, 50),
  );
  const secondLocation = evaluateMatch(
    requirement,
    candidate(property({ id: "second-location", area: "area-2" }), undefined, 1),
  );
  const tiedFirstLocation = { ...firstLocation, score: 80 };
  const tiedSecondLocation = { ...secondLocation, score: 80 };
  assert.deepEqual(
    rankMatchResults([tiedSecondLocation, tiedFirstLocation])
      .map(item => item.propertyId),
    ["first-location", "second-location"],
  );

  const midpointRequirement = rentRequirement({
    budget: { minimum: 100, maximum: 200, currencyCode: "KWD" },
  });
  const older = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "older", amount: 130 }), undefined, 10),
  );
  const newer = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "newer", amount: 170 }), undefined, 20),
  );
  assert.equal(older.priceDistanceFromBudgetMidpoint, newer.priceDistanceFromBudgetMidpoint);
  assert.deepEqual(
    rankMatchResults([newer, older]).map(item => item.propertyId),
    ["older", "newer"],
  );

  const closerToMidpoint = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "closer", amount: 145 }), undefined, 100),
  );
  const fartherFromMidpoint = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "farther", amount: 110 }), undefined, 1),
  );
  assert.deepEqual(
    rankMatchResults([fartherFromMidpoint, closerToMidpoint])
      .map(item => item.propertyId),
    ["closer", "farther"],
  );

  const sameChronologyFirst = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "stable-first", amount: 130 })),
  );
  const sameChronologySecond = evaluateMatch(
    midpointRequirement,
    candidate(property({ id: "stable-second", amount: 170 })),
  );
  const nonFiniteChronologyFirst = {
    ...sameChronologyFirst,
    propertyChronology: Number.NaN,
  };
  const nonFiniteChronologySecond = {
    ...sameChronologySecond,
    propertyChronology: Number.POSITIVE_INFINITY,
  };
  assert.deepEqual(
    rankMatchResults([nonFiniteChronologySecond, nonFiniteChronologyFirst])
      .map(item => item.propertyId),
    ["stable-second", "stable-first"],
  );
});

test("Matching Core is transient and source-neutral", () => {
  const result = evaluateMatch(
    rentRequirement(),
    candidate(property(), {
      bedrooms: 2,
      bathrooms: 1,
    }),
  );
  assert.equal(result.requirementId, "requirement-rent");
  assert.equal(result.propertyId, "property-1");
  assert.equal("source" in result, false);
  assert.equal("persist" in result, false);
  assert.equal("notes" in result, false);
  assert.equal("rentalPeriodId" in result, false);
});

const failures: string[] = [];
for (const current of tests) {
  try {
    current.run();
  } catch (error) {
    failures.push(
      `${current.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    `${failures.length} of ${tests.length} tests failed:\n${failures.join("\n")}`,
  );
}