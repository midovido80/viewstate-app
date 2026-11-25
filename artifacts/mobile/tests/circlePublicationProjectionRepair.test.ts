import test from "node:test";
import assert from "node:assert/strict";
import { validateProperty, type Property } from "@workspace/property-domain";
import {
  circlePropertyFacts,
  publishCircleProperty,
} from "../services/circleMatchingApi";
import { createWorkspaceCloud } from "../services/workspaceCloud";

const building: Property = {
  core: {
    id: "building",
    propertyType: "whole_building",
    locationArea: { id: "khaitan" },
  },
  activeOffer: {
    id: "offer",
    propertyCoreId: "building",
    transaction: "sale",
    salePrice: { amount: 1000000, currencyCode: "KWD" },
  },
  typeDetails: {
    propertyType: "whole_building",
    floorCount: 4,
    apartmentCount: 8,
    elevatorCount: 2,
    sameApartmentsPerFloor: true,
    apartmentsPerFloor: 2,
    sameApartmentLayout: true,
    roomsPerUnit: 3,
    bathroomsPerUnit: 2,
  },
};

test("a valid building with elevator count can be published to one, two or three circles without invalid derived fields", async () => {
  assert.equal(validateProperty(building).ok, true);
  const facts = circlePropertyFacts(building);
  assert.ok(
    facts,
    "count-based matching derivations must not invalidate the publication schema",
  );
  assert.equal(validateProperty(facts).ok, true);
  assert.equal((facts.typeDetails as any).elevatorCount, 2);
  assert.equal((facts.typeDetails as any).hasElevator, undefined);
  for (const count of [1, 2, 3]) {
    const published: unknown[] = [];
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        publishCircleProperty(
          async (path, options) => {
            if (path.endsWith("vs_circle_my_publication"))
              return Response.json(0);
            published.push(JSON.parse(String(options?.body)).p_facts);
            return Response.json(null);
          },
          "circle-" + index,
          facts,
          "operation-" + index,
        ),
      ),
    );
    assert.equal(published.length, count);
    assert.ok(
      published.every((value) => validateProperty(value as Property).ok),
    );
  }
});

test("private workspace synchronization supplies the same valid circle projection without changing private records", async () => {
  const privateProperty = { ...building, listingTitle: "Private title" };
  let payload: any;
  const cloud = createWorkspaceCloud(async (_path, options) => {
    payload = JSON.parse(String(options?.body)).next_payload;
    return Response.json({ accepted: true, revision: 1, payload });
  }, "owner");
  await cloud.write(0, { "property/building": privateProperty });
  assert.deepEqual(payload.records["property/building"], privateProperty);
  assert.equal(validateProperty(payload.circlePropertyFacts.building).ok, true);
  assert.equal(payload.circlePropertyFacts.building.listingTitle, undefined);
});
