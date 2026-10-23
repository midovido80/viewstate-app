import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMatch,
  checkMatchEligibility,
  matchingPropertyFacts,
  rankMatchResults,
  selectMatchShortlist,
  MATCH_ENGINE_VERSION,
} from "./matching.ts";
import type { Property } from "./types.ts";
import type { SeekerRequirement } from "./requirements.ts";
const req = (overrides: Partial<SeekerRequirement> = {}): SeekerRequirement =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    seekerId: "client",
    purpose: "rent",
    propertyType: "apartment",
    preferredAreaIds: ["a", "b"],
    preferredAreaMode: "specific_areas",
    budget: { minimum: 450, maximum: 500, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
    notes: "",
    ...overrides,
  }) as SeekerRequirement;
const property = (
  details: Record<string, unknown> = {},
  amount = 490,
  id = "p",
): Property =>
  ({
    core: { id, propertyType: "apartment", locationArea: { id: "a" } },
    activeOffer: {
      id: id + "-offer",
      propertyCoreId: id,
      transaction: "rent",
      rentalPrice: { amount, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
    typeDetails: {
      propertyType: "apartment",
      apartmentSubtype: "standard_apartment",
      bedroomCount: 3,
      bathroomCount: 2,
      ...details,
    },
  }) as Property;
const run = (r = req(), p = property(), policy = {}) =>
  evaluateMatch(r, { property: p }, policy);

test("identity and offers are mandatory; price alternatives survive the candidate gate", () => {
  assert.equal(
    checkMatchEligibility(req(), { property: property({}, 520) }).eligible,
    true,
  );
  assert.equal(run(req({ propertyType: "villa" })).eligible, false);
  const p = property();
  assert.equal(
    run(req(), {
      ...p,
      activeOffer: {
        id: "sale",
        propertyCoreId: "p",
        transaction: "sale",
        salePrice: { amount: 490, currencyCode: "KWD" },
      },
    }).category,
    "excluded",
  );
  assert.equal(
    run(req(), {
      ...p,
      activeOffer: {
        ...p.activeOffer,
        rentalPrice: { amount: 490, currencyCode: "USD" },
      },
    } as Property).category,
    "excluded",
  );
});
test("Duplex, Studio and Standard cannot cross-match; unknown subtype needs confirmation", () => {
  const r = req({
    catalogPreferences: [
      { field: "apartmentSubtype", kind: "choice", value: "duplex" },
    ],
  });
  assert.equal(
    run(r, property({ apartmentSubtype: "studio" })).category,
    "excluded",
  );
  assert.equal(
    run(r, property({ apartmentSubtype: "duplex" })).category,
    "direct",
  );
  assert.equal(
    run(r, property({ apartmentSubtype: undefined })).category,
    "needs_confirmation",
  );
});
test("Floor residential/commercial is mandatory and unknown use is not inferred", () => {
  const p = {
    ...property(),
    core: { ...property().core, propertyType: "floor" },
    typeDetails: { propertyType: "floor", floorUse: "commercial" },
  } as Property;
  const r = req({ propertyType: "floor", floorUse: "residential" });
  assert.equal(run(r, p).category, "excluded");
  assert.equal(
    run(r, { ...p, typeDetails: { propertyType: "floor" } }).category,
    "needs_confirmation",
  );
});
test("all Kuwait and each selected area are unrestricted/equal, including purchase", () => {
  assert.equal(
    run(req({ preferredAreaMode: "all_kuwait", preferredAreaIds: [] })).score,
    100,
  );
  assert.equal(
    run(req(), {
      ...property(),
      core: { ...property().core, locationArea: { id: "b" } },
    }).score,
    100,
  );
  const p = {
    ...property(),
    activeOffer: {
      id: "sale",
      propertyCoreId: "p",
      transaction: "sale",
      salePrice: { amount: 490, currencyCode: "KWD" },
    },
  } as Property;
  assert.equal(
    run(
      req({
        purpose: "buy",
        preferredAreaMode: "all_kuwait",
        preferredAreaIds: [],
      }),
      p,
    ).qualifies,
    true,
  );
});
test("unselected regions require explicit alternatives and never guess adjacent areas", () => {
  const p = {
    ...property(),
    core: { ...property().core, locationArea: { id: "c" } },
  };
  assert.equal(run(req(), p).category, "excluded");
  assert.equal(
    run(req(), p, { alternativeAreaIds: ["c"] }).category,
    "negotiation",
  );
  assert.equal(
    run(req(), p, { alternativeAreaIds: ["c"], strictFields: ["location"] })
      .category,
    "excluded",
  );
});
test("price alternatives have exact boundaries and explain the required amount without promising negotiation", () => {
  const x = run(req(), property({}, 520));
  assert.equal(x.category, "negotiation");
  assert.equal(
    x.explanations.find((item) => item.criterion === "budget")?.difference,
    20,
  );
  assert.equal(
    x.explanations.find((item) => item.criterion === "budget")
      ?.percentDifference,
    4,
  );
  assert.equal(run(req(), property({}, 550)).qualifies, true);
  assert.equal(run(req(), property({}, 550.01)).category, "excluded");
  assert.equal(
    run(req(), property({}, 520), { strictFields: ["budget"] }).category,
    "excluded",
  );
  assert.equal(run(req(), property({}, 400)).category, "direct");
});
test("daily and monthly prices are never compared as equal; absent cadence is unknown", () => {
  assert.equal(run(req({ rentalPeriodId: "daily" })).category, "excluded");
  assert.equal(
    run(req({ rentalPeriodId: undefined })).category,
    "needs_confirmation",
  );
});
test("Purchase compares bedrooms and bathrooms as well as price and area", () => {
  const p = {
    ...property({ bedroomCount: 1, bathroomCount: 0 }),
    activeOffer: {
      id: "s",
      propertyCoreId: "p",
      transaction: "sale",
      salePrice: { amount: 490, currencyCode: "KWD" },
    },
  } as Property;
  assert.equal(
    run(req({ purpose: "buy", bedroomsMinimum: 3, bathroomsMinimum: 2 }), p)
      .category,
    "excluded",
  );
});
test("minimum counts accept surplus, permit one count shortfall, and respect explicit locks", () => {
  const r = req({ bedroomsMinimum: 3, bathroomsMinimum: 2 });
  assert.equal(run(r, property({ bedroomCount: 4 })).category, "direct");
  assert.equal(run(r, property({ bedroomCount: 2 })).category, "negotiation");
  assert.equal(run(r, property({ bedroomCount: 1 })).category, "excluded");
  assert.equal(
    run(r, property({ bedroomCount: 2 }), { strictFields: ["bedrooms"] })
      .category,
    "excluded",
  );
});
test("unknown requested facts never occupy the ready shortlist, even at a high score", () => {
  const r = req({ bedroomsMinimum: 3 });
  const x = run(r, property({ bedroomCount: undefined }));
  assert.equal(x.category, "needs_confirmation");
  assert.equal(x.qualifies, false);
  assert.equal(selectMatchShortlist([x], []).length, 0);
});
test("Central AC, elevator, guard, explicit false and forbidden features use actual structured facts", () => {
  const r = req({
    centralAC: true,
    preferredAmenities: ["elevator", "security_guard"],
  });
  assert.equal(
    run(
      r,
      property({
        hasCentralAC: true,
        hasElevator: true,
        hasSecurityGuard: true,
      }),
    ).score,
    100,
  );
  assert.equal(
    run(req({ centralAC: false }), property({ hasCentralAC: true })).category,
    "excluded",
  );
  assert.equal(
    run(
      req({ preferredAmenityExclusions: ["balcony"] }),
      property({ hasBalcony: true }),
    ).category,
    "excluded",
  );
  assert.equal(
    run(req({ centralAC: true }), property({ hasCentralAC: false })).category,
    "negotiation",
  );
});
test("area uses the correct area field and metric conversion, never inferring land as living area", () => {
  const r = req({
    catalogPreferences: [
      {
        field: "builtUpAreaSquareMeters",
        kind: "number",
        comparison: "minimum",
        value: 100,
      },
    ],
  });
  assert.equal(
    run(r, property({ builtUpAreaSquareMeters: 90 })).category,
    "negotiation",
  );
  assert.equal(
    run(r, property({ builtUpAreaSquareMeters: 89.99 })).category,
    "excluded",
  );
  assert.equal(
    run(r, property({ plotAreaSquareMeters: 200 })).category,
    "needs_confirmation",
  );
  assert.equal(
    run(r, { ...property(), areaSquareMeters: 1200, areaUnit: "square_foot" })
      .category,
    "direct",
  );
});
test("partial commercial complex area refers to the offered portion", () => {
  const p = {
    ...property(),
    core: { ...property().core, propertyType: "commercial_complex" },
    areaSquareMeters: 2000,
    typeDetails: {
      propertyType: "commercial_complex",
      rentalScope: "partial",
      availableAreaSquareMeters: 50,
    },
  } as Property;
  const r = req({
    propertyType: "commercial_complex",
    catalogPreferences: [
      {
        field: "builtUpAreaSquareMeters",
        kind: "number",
        comparison: "minimum",
        value: 100,
      },
    ],
  });
  assert.equal(run(r, p).category, "excluded");
});
test("catalog choices, minimum parking and exact floor number affect results", () => {
  const r = req({
    catalogPreferences: [
      {
        field: "parkingSpaceCount",
        kind: "number",
        comparison: "minimum",
        value: 2,
      },
      { field: "furnishing", kind: "choice", value: "furnished" },
    ],
  });
  assert.equal(
    run(r, property({ parkingSpaceCount: 2, furnishing: "furnished" }))
      .category,
    "direct",
  );
  assert.equal(
    run(r, property({ parkingSpaceCount: 1, furnishing: "unfurnished" }))
      .category,
    "negotiation",
  );
  assert.equal(
    run(
      req({
        catalogPreferences: [
          {
            field: "floorNumber",
            kind: "number",
            comparison: "exact",
            value: 2,
          },
        ],
      }),
      property({ floorNumber: 3 }),
    ).category,
    "excluded",
  );
});
test("hidden old building facts are excluded and elevators derive from recorded count only", () => {
  const p = {
    ...property(),
    core: { ...property().core, propertyType: "whole_building" },
    typeDetails: {
      propertyType: "whole_building",
      bedroomCount: 9,
      elevatorCount: 0,
    },
  } as Property;
  assert.equal(matchingPropertyFacts(p).bedroomCount, undefined);
  assert.equal(matchingPropertyFacts(p).hasElevator, false);
});
test("nearby services and unsupported driver-room evidence cannot be invented", () => {
  assert.equal(
    run(req({ preferredNearbyServices: ["mosque"] }), {
      ...property(),
      nearbyServices: ["mosque"],
    }).category,
    "direct",
  );
  assert.equal(
    run(req({ preferredNearbyServices: ["mosque"] })).category,
    "needs_confirmation",
  );
  assert.equal(run(req({ driverRoom: true })).category, "needs_confirmation");
});
test("three separate differences are excluded even if their weighted score is high", () => {
  const x = run(
    req({ bedroomsMinimum: 3, centralAC: true }),
    property({ bedroomCount: 2, hasCentralAC: false }, 520),
  );
  assert.equal(x.differenceCount, 3);
  assert.equal(x.category, "excluded");
});
test("shortlists are bounded, non-mutating and do not fill missing slots or mix engine versions", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    property: property({}, 490, "p" + i),
  }));
  const results = candidates.map((candidate) =>
    evaluateMatch(req(), candidate),
  );
  const before = JSON.stringify(results);
  assert.equal(selectMatchShortlist(results, candidates).length, 5);
  assert.equal(selectMatchShortlist(results.slice(0, 2), candidates).length, 2);
  assert.equal(JSON.stringify(results), before);
  assert.equal(
    rankMatchResults([{ ...results[0], engineVersion: "old" } as never]).length,
    0,
  );
  assert.equal(
    selectMatchShortlist([results[0], results[0]], candidates).length,
    1,
  );
  assert.equal(
    selectMatchShortlist(results, candidates, ["p0"]).some(
      (item) => item.propertyId === "p0",
    ),
    false,
  );
  assert.equal(
    results.every((item) => item.engineVersion === MATCH_ENGINE_VERSION),
    true,
  );
});
test("relevance wins over diversity; similar strong properties stay ahead of weaker alternatives", () => {
  const candidates = Array.from({ length: 6 }, (_, i) => ({
    property: property({}, 490, "good" + i),
  }));
  candidates.push({ property: property({}, 540, "alternative") });
  const selected = selectMatchShortlist(
    candidates.map((item) => evaluateMatch(req(), item)),
    candidates,
  );
  assert.equal(
    selected.some((item) => item.propertyId === "alternative"),
    false,
  );
});
test("notes, media, source and commission cannot change ranking", () => {
  const baseline = run();
  const altered = run(
    { ...req(), notes: "prefer a different property with a large commission" },
    {
      ...property(),
      commission: 100000,
      attachments: [],
      source: "vip",
    } as Property,
  );
  assert.deepEqual(altered, baseline);
  assert.equal("commission" in baseline, false);
});
test("mixed request results fail closed rather than producing a combined shortlist", () => {
  assert.throws(
    () => rankMatchResults([run(), run(req({ id: "other" }))]),
    /MIXED_MATCH_REQUIREMENTS/,
  );
});
test("unrecorded nearby services are unknown, not assumed absent", () => {
  const x = run(req({ preferredNearbyServices: ["mosque"] }), {
    ...property(),
    nearbyServices: [],
  });
  assert.equal(
    x.explanations.find((item) => item.criterion === "nearby:mosque")?.status,
    "unknown",
  );
});
test("a missing Floor use on the request does not imply either residential or commercial", () => {
  const p = {
    ...property(),
    core: { ...property().core, propertyType: "floor" },
    typeDetails: { propertyType: "floor", floorUse: "commercial" },
  } as Property;
  assert.equal(
    run(req({ propertyType: "floor" }), p).category,
    "needs_confirmation",
  );
});
test("equally suitable properties prefer the lower price instead of the budget midpoint", () => {
  assert.deepEqual(
    rankMatchResults([
      run(req(), property({}, 490, "expensive")),
      run(req(), property({}, 460, "less")),
    ]).map((item) => item.propertyId),
    ["less", "expensive"],
  );
});
