import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_ENGINE_VERSION,
  validateSeekerRequirement,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import "./platformModuleStubs.ts";
import { BrokerInitiatedMatching } from "../services/brokerInitiatedMatching.ts";
import { MyPropertiesMatchingSource } from "../services/myPropertiesMatchingSource.ts";
import { buildPropertyWithCaptureDetails } from "../services/propertyCaptureDetails.ts";
import { getAreaById } from "../constants/kuwait-areas.ts";
import { matchingCategoryLabel, matchingComparisonRows } from "../services/matchingPresentation.ts";
import { selectHomeMatches } from "../services/assistantHome.ts";
const req: SeekerRequirement = {
  id: "11111111-1111-4111-8111-111111111111",
  seekerId: "s",
  purpose: "rent",
  propertyType: "apartment",
  preferredAreaIds: ["salmiya"],
  preferredAreaMode: "specific_areas",
  budget: { minimum: 400, maximum: 500, currencyCode: "KWD" },
  rentalPeriodId: "monthly",
  notes: "",
};
const property = (id: string): Property => ({
  core: { id, propertyType: "apartment", locationArea: { id: "salmiya" } },
  activeOffer: {
    id: id + "-offer",
    propertyCoreId: id,
    transaction: "rent",
    rentalPrice: { amount: 490, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
  },
  typeDetails: { propertyType: "apartment", bedroomCount: 3 },
});
const source = (properties: Property[]) =>
  new MyPropertiesMatchingSource({ getProperties: async () => properties });

test("approved whole-building example normalizes and reaches the discussion shortlist", async () => {
  const rawRequirement: SeekerRequirement = {
    id: "33333333-3333-4333-8333-333333333333",
    seekerId: "disposable-seeker",
    purpose: "rent",
    propertyType: "whole_building",
    preferredAreaIds: ["bneid_al_qar", "salmiya"],
    preferredAreaMode: "specific_areas",
    budget: { minimum: 6000, maximum: 7000, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
    preferredNearbyServices: ["supermarket"],
    centralAC: true,
    catalogPreferences: [
      { field: "builtUpAreaSquareMeters", kind: "number", comparison: "minimum", value: 700 },
      { field: "furnishing", kind: "choice", value: "unfurnished" },
    ],
    notes: "",
  };
  const normalizedRequirement = validateSeekerRequirement(rawRequirement, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  assert.equal(
    normalizedRequirement.ok,
    true,
    JSON.stringify(normalizedRequirement.ok ? [] : normalizedRequirement.issues),
  );
  if (!normalizedRequirement.ok) return;

  const propertyId = "44444444-4444-4444-8444-444444444444";
  const baseline: Property = {
    core: {
      id: propertyId,
      propertyType: "whole_building",
      locationArea: { id: "jabriya" },
    },
    activeOffer: {
      id: "55555555-5555-4555-8555-555555555555",
      propertyCoreId: propertyId,
      transaction: "rent",
      rentalPrice: { amount: 6800, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
  };
  const normalizedProperty = buildPropertyWithCaptureDetails(baseline, {
    areaSquareMeters: 650,
    furnishing: "unfurnished",
    hasCentralAC: "true",
    nearbyServices: JSON.stringify(["supermarket"]),
  });
  const service = new BrokerInitiatedMatching(
    {
      getRequirement: async id =>
        id === normalizedRequirement.value.id ? normalizedRequirement.value : null,
    },
    new MyPropertiesMatchingSource({
      getProperties: async () => [normalizedProperty],
    }),
  );

  const result = await service.runForRequirement(normalizedRequirement.value.id);
  assert.equal(result.evaluatedCandidateCount, 1);
  assert.equal(result.matches.length, 1);
  const match = result.matches[0]!;
  assert.equal(match.propertyId, propertyId);
  assert.equal(match.category, "negotiation");
  assert.equal(match.qualifies, true);
  assert.equal(match.differenceCount, 2);
  const home = selectHomeMatches(
    [normalizedRequirement.value],
    [{
      id: "disposable-seeker",
      name: "Disposable seeker",
      classifications: ["seeker"],
      displayPhone: "",
      normalizedPhone: "",
      notes: "",
    }],
    [result],
  );
  assert.equal(home.length, 1);
  assert.equal(home[0]?.result, match);
  for (const language of ["en", "ar"] as const) {
    assert.equal(matchingCategoryLabel(match.category, language), language === "en" ? "For discussion" : "بديل للمناقشة");
    const rows = matchingComparisonRows(match, normalizedRequirement.value, normalizedProperty, language);
    const location = rows.find(row => row.field === "location")!;
    const area = rows.find(row => row.field === "builtUpAreaSquareMeters")!;
    const budget = rows.find(row => row.field === "budget")!;
    assert.equal(location.requested, language === "en" ? "Bneid Al-Qar، Salmiya" : "بنيد القار، السالمية");
    assert.equal(location.offered, language === "en" ? "Jabriya" : "الجابرية");
    assert.equal(location.statusLabel, language === "en" ? "For discussion" : "بديل للمناقشة");
    assert.ok(area.offered.includes(language === "en" ? "50 m² less (about 7.14%)" : "أقل بـ50 م² (نحو 7.14٪)"));
    assert.equal(budget.requested, "6000–7000 KWD");
    assert.equal(budget.offered, "6800 KWD");
    assert.equal(budget.statusLabel, language === "en" ? "Meets" : "متوافق");
  }

  const strict = await service.runForRequirement(normalizedRequirement.value.id, {
    strictFields: ["location"],
  });
  assert.equal(strict.evaluatedCandidateCount, 1);
  assert.deepEqual(strict.matches, []);
  assert.equal(strict.needsConfirmation.length, 0);
});

test("separate account-scoped engines never reuse another account's candidates", async () => {
  const firstRequirement = { ...req, id: "66666666-6666-4666-8666-666666666666", seekerId: "account-one" };
  const secondRequirement = { ...req, id: "77777777-7777-4777-8777-777777777777", seekerId: "account-two" };
  const firstEngine = new BrokerInitiatedMatching(
    { getRequirement: async id => id === firstRequirement.id ? firstRequirement : null },
    source([property("account-one-property")]),
  );
  const secondEngine = new BrokerInitiatedMatching(
    { getRequirement: async id => id === secondRequirement.id ? secondRequirement : null },
    source([property("account-two-property")]),
  );
  const [first, second] = await Promise.all([
    firstEngine.runForRequirement(firstRequirement.id),
    secondEngine.runForRequirement(secondRequirement.id),
  ]);
  assert.deepEqual(first.matches.map(item => item.propertyId), ["account-one-property"]);
  assert.deepEqual(second.matches.map(item => item.propertyId), ["account-two-property"]);
  assert.equal(first.evaluatedCandidateCount, 1);
  assert.equal(second.evaluatedCandidateCount, 1);
});

test("one canonical engine returns a maximum of five versioned results and replaces excluded suggestions", async () => {
  const service = new BrokerInitiatedMatching(
    { getRequirement: async () => req },
    source(Array.from({ length: 8 }, (_, i) => property("p" + i))),
  );
  const result = await service.runForRequirement(req.id);
  assert.equal(result.engineVersion, MATCH_ENGINE_VERSION);
  assert.equal(result.matches.length, 5);
  assert.equal(
    result.matches.every(
      (item) =>
        item.engineVersion === result.engineVersion &&
        item.requirementId === req.id,
    ),
    true,
  );
  const replace = await service.runForRequirement(req.id, {}, [
    result.matches[0].propertyId,
  ]);
  assert.equal(replace.matches.length, 5);
  assert.equal(
    replace.matches.some(
      (item) => item.propertyId === result.matches[0].propertyId,
    ),
    false,
  );
});
test("missing critical information is separated from the ready shortlist and never used to pad it", async () => {
  const missing = {
    ...property("missing"),
    typeDetails: { propertyType: "apartment" as const },
  };
  const r = { ...req, bedroomsMinimum: 3 };
  const service = new BrokerInitiatedMatching(
    { getRequirement: async () => r },
    source([property("ready"), missing]),
  );
  const result = await service.runForRequirement(req.id);
  assert.deepEqual(
    result.matches.map((item) => item.propertyId),
    ["ready"],
  );
  assert.deepEqual(
    result.needsConfirmation.map((item) => item.propertyId),
    ["missing"],
  );
});
test("missing, mismatched and invalid requirements fail before candidate lookup; no old engine fallback", async () => {
  let reads = 0;
  for (const value of [
    null,
    { ...req, id: "other" },
    { ...req, budget: { ...req.budget, maximum: -1 } },
  ]) {
    const service = new BrokerInitiatedMatching(
      { getRequirement: async () => value },
      {
        getCandidates: async () => {
          reads++;
          return [];
        },
      },
    );
    await assert.rejects(service.runForRequirement(req.id));
  }
  assert.equal(reads, 0);
});
test("session locks suppress negotiation without mutating saved requests or properties", async () => {
  const p = property("over");
  (p.activeOffer as any).rentalPrice.amount = 520;
  const before = JSON.stringify([req, p]);
  const service = new BrokerInitiatedMatching(
    { getRequirement: async () => req },
    source([p]),
  );
  assert.equal((await service.runForRequirement(req.id)).matches.length, 1);
  assert.equal(
    (await service.runForRequirement(req.id, { strictFields: ["budget"] }))
      .matches.length,
    0,
  );
  assert.equal(JSON.stringify([req, p]), before);
});
test("multiple requests share one property snapshot and keep distinct IDs and policies", async () => {
  const other = { ...req, id: "22222222-2222-4222-8222-222222222222" };
  let reads = 0;
  const p = property("over");
  (p.activeOffer as any).rentalPrice.amount = 520;
  const service = new BrokerInitiatedMatching(
    { getRequirement: async (id) => (id === req.id ? req : other) },
    new MyPropertiesMatchingSource({
      getProperties: async () => {
        reads++;
        return [p];
      },
    }),
  );
  const [a, b] = await Promise.all([
    service.runForRequirement(req.id, { strictFields: ["budget"] }),
    service.runForRequirement(other.id),
  ]);
  assert.equal(reads, 1);
  assert.equal(a.matches.length, 0);
  assert.equal(b.matches.length, 1);
  assert.equal(b.matches[0].requirementId, other.id);
});
