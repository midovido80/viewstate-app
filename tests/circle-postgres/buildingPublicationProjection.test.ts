import test from "node:test";
import assert from "node:assert/strict";
import { circleFixture, asCircleUser } from "./fixture.ts";
import { circlePropertyFacts } from "../../artifacts/mobile/services/circleMatchingApi.ts";
import type { Property } from "../../lib/property-domain/src/index.ts";

test("building publication projection with elevator count succeeds through real authenticated RPCs in three circles", async () => {
  const db = await circleFixture();
  const owner = "88888888-8888-4888-8888-000000000001";
  const property: Property = {
    core: {
      id: "regression-building",
      propertyType: "whole_building",
      locationArea: { id: "khaitan" },
    },
    activeOffer: {
      id: "offer",
      propertyCoreId: "regression-building",
      transaction: "sale",
      salePrice: { amount: 1000000, currencyCode: "KWD" },
    },
    typeDetails: {
      propertyType: "whole_building",
      elevatorCount: 2,
      floorCount: 4,
      apartmentCount: 8,
    },
  };
  const facts = circlePropertyFacts(property);
  assert.ok(facts);
  try {
    await db.query("insert into auth.users(id) values($1)", [owner]);
    for (let n = 1; n <= 3; n++)
      await asCircleUser(db, owner, async (tx) => {
        const circle =
          "88888888-8888-4888-8888-" + String(100 + n).padStart(12, "0");
        const op =
          "88888888-8888-4888-8888-" + String(200 + n).padStart(12, "0");
        await tx.query("select public.vs_circle_create($1,$2)", [
          circle,
          "Regression circle",
        ]);
        await tx.query(
          "select public.vs_circle_publish($1,$2,$3,$4,$5::jsonb,$6)",
          [circle, property.core.id, 0, op, JSON.stringify(facts), false],
        );
        const catalog = await tx.query(
          "select * from public.vs_circle_catalog($1)",
          [circle],
        );
        assert.equal(catalog.rows.length, 1);
      });
  } finally {
    await db.close();
  }
});
