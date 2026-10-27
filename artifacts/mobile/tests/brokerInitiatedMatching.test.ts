import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_ENGINE_VERSION,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { BrokerInitiatedMatching } from "../services/brokerInitiatedMatching.ts";
import { MyPropertiesMatchingSource } from "../services/myPropertiesMatchingSource.ts";
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
