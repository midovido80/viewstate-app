import test from "node:test";
import assert from "node:assert/strict";
import { circleFixture, asCircleUser } from "./fixture.ts";
const id = (n: number) =>
  `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
test("circle attribution identifies listing and request owners, protects contacts and labels existing notices", async () => {
  const db = await circleFixture();
  const rpc = (n: number, name: string, args: unknown[] = []) =>
    asCircleUser(
      db,
      id(n),
      async (tx) =>
        (
          await tx.query<{ data: any }>(
            `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) data`,
            args,
          )
        ).rows[0].data,
    );
  try {
    const permissions = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.vs_circle_attribution(uuid)','execute') or has_function_privilege('anon','public.vs_circle_notification_inbox_v3()','execute') or has_function_privilege('authenticated','public.vs_circle_push_member_names(uuid[])','execute') allowed",
    );
    assert.equal(permissions.rows[0].allowed, false);
    for (let n = 1; n <= 4; n++)
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
    for (let n = 1; n <= 3; n++)
      await db.query(
        "insert into public.user_profiles(user_id,display_name,phone,classification,company) values($1,$2,$3,'broker','Test office')",
        [id(n), "Broker " + n, "+9655000000" + n],
      );
    await rpc(1, "vs_circle_create", [id(100), "Attribution circle"]);
    await db.query(
      "insert into viewstate_circle.members(circle_id,user_id,state) values($1,$2,'active'),($1,$3,'invited')",
      [id(100), id(2), id(3)],
    );
    await rpc(2, "vs_circle_publish", [
      id(100),
      "listing-local",
      0,
      id(200),
      JSON.stringify({
        core: {
          id: "listing-local",
          propertyType: "apartment",
          locationArea: { id: "salmiya" },
        },
        activeOffer: {
          id: "offer",
          propertyCoreId: "listing-local",
          transaction: "sale",
          salePrice: { amount: 100000, currencyCode: "KWD" },
        },
        typeDetails: { propertyType: "apartment" },
      }),
      false,
    ]);
    await rpc(1, "vs_circle_request", [
      id(100),
      id(201),
      JSON.stringify({
        propertyType: "apartment",
        purpose: "buy",
        notes: "",
        preferredAreaMode: "specific_areas",
        preferredAreaIds: ["salmiya"],
        budget: { maximum: 150000, currencyCode: "KWD" },
      }),
    ]);
    const publication = (
      await db.query<{ id: string }>(
        "select id from viewstate_circle.properties where circle_id=$1",
        [id(100)],
      )
    ).rows[0].id;
    const requestId = (
      await db.query<{ id: string }>(
        "select id from viewstate_circle.requests where circle_id=$1",
        [id(100)],
      )
    ).rows[0].id;
    const revision = (
      await db.query<{ revision: number }>(
        "select revision from viewstate_circle.circles where id=$1",
        [id(100)],
      )
    ).rows[0].revision;
    await db.query("select public.vs_circle_worker_commit($1,$2,$3::jsonb)", [
      id(100),
      revision,
      JSON.stringify([
        { request_id: requestId, property_id: publication, score: 90 },
      ]),
    ]);
    const context = await rpc(1, "vs_circle_attribution", [id(100)]);
    assert.equal(context.matches[0].requester, id(1));
    assert.equal(context.matches[0].publisher, id(2));
    assert.equal(
      (await rpc(1, "vs_circle_notification_inbox_v3")).entries.find(
        (n: any) => n.kind === "match",
      ).member_name,
      "Broker 2",
    );
    assert.equal(
      (await rpc(2, "vs_circle_notification_inbox_v3")).entries.find(
        (n: any) => n.kind === "match",
      ).member_name,
      "Broker 1",
    );
    await rpc(1, "vs_circle_cooperation_request", [
      id(100),
      context.matches[0].id,
      "viewing",
      "agree_first",
    ]);
    assert.equal(
      (await rpc(2, "vs_circle_notification_inbox_v3")).entries.find(
        (n: any) => n.kind === "cooperation",
      ).member_name,
      "Broker 1",
    );
    assert.equal(
      context.members.find((m: any) => m.user_id === id(2)).display_name,
      "Broker 2",
    );
    assert.equal(
      context.members.find((m: any) => m.user_id === id(2)).phone,
      "+96550000002",
    );
    assert.equal(context.requests[0].owner_id, id(1));
    assert.ok(!context.members.some((m: any) => m.user_id === id(3)));
    assert.doesNotMatch(
      JSON.stringify(context),
      /email|source_key|request-local|listing-local/,
    );
    const inbox = await rpc(1, "vs_circle_notification_inbox_v3");
    assert.equal(
      inbox.entries.find((n: any) => n.kind === "listing").member_name,
      "Broker 2",
    );
    await assert.rejects(rpc(3, "vs_circle_attribution", [id(100)]), /CIRCLE/);
    await assert.rejects(rpc(4, "vs_circle_attribution", [id(100)]), /CIRCLE/);
    await assert.rejects(
      rpc(1, "vs_circle_push_member_names", [[]]),
      /permission denied/,
    );
    await db.query(
      "update viewstate_circle.members set state='revoked' where circle_id=$1 and user_id=$2",
      [id(100), id(2)],
    );
    assert.ok(
      !(await rpc(1, "vs_circle_attribution", [id(100)])).members.some(
        (m: any) => m.user_id === id(2),
      ),
    );
    assert.equal(
      (await rpc(1, "vs_circle_notification_inbox_v3")).entries.find(
        (n: any) => n.kind === "listing",
      ).member_name,
      null,
    );
  } finally {
    await db.close();
  }
});
