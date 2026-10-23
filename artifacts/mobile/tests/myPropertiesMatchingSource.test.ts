import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMatch,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import {
  MyPropertiesMatchingSource,
  normalizeMyPropertyCandidate,
} from "../services/myPropertiesMatchingSource.ts";
const requirement: SeekerRequirement = {
  id: "11111111-1111-4111-8111-111111111111",
  seekerId: "s",
  purpose: "rent",
  propertyType: "apartment",
  preferredAreaIds: ["salmiya"],
  preferredAreaMode: "specific_areas",
  budget: { minimum: 400, maximum: 500, currencyCode: "KWD" },
  rentalPeriodId: "monthly",
  centralAC: true,
  notes: "",
};
const property = (id = "p", amount = 490): Property => ({
  core: {
    id,
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
    privateNotes: {
      value: "private",
      privacy: { classification: "private_notes", disclosurePolicy: "never" },
    },
  },
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
    masterBedroomCount: 1,
    hasCentralAC: true,
    hasElevator: true,
    hasSecurityGuard: true,
    parkingSpaceCount: 2,
  },
  nearbyServices: ["mosque"],
});

test("candidate preserves approved modern facts and strips private data without rewriting the source", () => {
  const p = property();
  const before = JSON.stringify(p);
  const result = normalizeMyPropertyCandidate(p)!;
  assert.ok(result);
  assert.equal((result.property.typeDetails as any).hasCentralAC, true);
  assert.equal((result.property.typeDetails as any).masterBedroomCount, 1);
  assert.equal((result.property.typeDetails as any).hasElevator, true);
  assert.deepEqual(result.property.nearbyServices, ["mosque"]);
  assert.equal(result.property.core.privateNotes, undefined);
  assert.equal(result.property.attachments, undefined);
  assert.equal(result.property.locationEnrichment, undefined);
  assert.equal(JSON.stringify(p), before);
  assert.equal(evaluateMatch(requirement, result).category, "direct");
});
test("one snapshot serves concurrent requests; each new explicit run refreshes it", async () => {
  let reads = 0;
  const store = {
    getProperties: async () => {
      reads++;
      return [property()];
    },
  };
  const source = new MyPropertiesMatchingSource(store);
  await Promise.all([
    source.getCandidates(requirement),
    source.getCandidates({ ...requirement, id: "other" }),
  ]);
  assert.equal(reads, 1);
  await new MyPropertiesMatchingSource(store).getCandidates(requirement);
  assert.equal(reads, 2);
});
test("candidate retrieval does not prematurely remove price or location negotiation opportunities", async () => {
  const over = property("over", 520);
  const outside = {
    ...property("outside"),
    core: {
      id: "outside",
      propertyType: "apartment" as const,
      locationArea: { id: "hawally" },
    },
  };
  const result = await new MyPropertiesMatchingSource({
    getProperties: async () => [over, outside],
  }).getCandidates(requirement);
  assert.deepEqual(
    result.map((item) => item.property.core.id),
    ["over", "outside"],
  );
  assert.equal(evaluateMatch(requirement, result[0]).category, "negotiation");
  assert.equal(evaluateMatch(requirement, result[1]).category, "excluded");
});
test("malformed records are ignored and duplicate IDs appear once in deterministic store order", async () => {
  const p = property();
  const result = await new MyPropertiesMatchingSource({
    getProperties: async () =>
      [null, {}, p, p, property("second")] as Property[],
  }).getCandidates(requirement);
  assert.deepEqual(
    result.map((item) => item.property.core.id),
    ["p", "second"],
  );
  assert.equal(normalizeMyPropertyCandidate({}), null);
});
test("false facts and Studio subtype survive projection without becoming unknown or a bedroom", () => {
  const p = {
    ...property(),
    typeDetails: {
      propertyType: "apartment",
      apartmentSubtype: "studio",
      studioRoomCount: 1,
      bathroomCount: 1,
      hasCentralAC: false,
      hasParking: false,
    },
  } as Property;
  const result = normalizeMyPropertyCandidate(p)!;
  assert.ok(result);
  assert.equal((result.property.typeDetails as any).apartmentSubtype, "studio");
  assert.equal((result.property.typeDetails as any).hasCentralAC, false);
  assert.equal((result.property.typeDetails as any).hasParking, false);
  assert.equal((result.property.typeDetails as any).bedroomCount, undefined);
});
test("whole-building projection suppresses stale bedrooms and duplicate Unit facts", () => {
  const p = {
    ...property(),
    core: { ...property().core, propertyType: "whole_building" },
    typeDetails: {
      propertyType: "whole_building",
      bedroomCount: 9,
      apartmentCount: 20,
      hasBuildingParking: false,
    },
  } as Property;
  const candidate = normalizeMyPropertyCandidate(p)!;
  assert.ok(candidate);
  assert.equal((candidate.property.typeDetails as any).bedroomCount, undefined);
  assert.equal(
    (candidate.property.typeDetails as any).buildingParkingTypes,
    undefined,
  );
  assert.equal((candidate.property.typeDetails as any).apartmentCount, 20);
});
