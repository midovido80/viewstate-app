import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { circleFixture, asCircleUser } from "./fixture.ts";
import {
  matchCircleSnapshot,
  type CircleSnapshot,
} from "../../supabase/functions/circle-match-worker/engine.ts";

const id = (n: number) =>
  `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const requestFacts = {
  purpose: "rent",
  propertyType: "apartment",
  preferredAreaIds: ["salmiya"],
  preferredAreaMode: "specific_areas",
  budget: { maximum: 600, currencyCode: "KWD" },
  rentalPeriodId: "monthly",
  bedroomsMinimum: 2,
  bathroomsMinimum: 2,
  notes: "",
};

test("phone invitations conceal registration, pending membership and decline; daily budget bounds unsolicited invitations", async () => {
  const db = await circleFixture();
  try {
    for (let n = 1; n <= 4; n++)
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
    const owner = <T>(work: Parameters<typeof asCircleUser<T>>[2]) =>
      asCircleUser(db, id(1), work);
    await owner((tx) =>
      tx.query("select public.vs_circle_create($1,$2)", [
        id(100),
        "Privacy fixture",
      ]),
    );
    await db.query(
      "update auth.users set phone=$1,phone_confirmed_at=now() where id=$2",
      ["96550001234", id(2)],
    );
    const send = (phone: string) =>
      owner(
        async (tx) =>
          (
            await tx.query<{ result: unknown }>(
              "select public.vs_circle_invite_phone($1,$2) result",
              [id(100), phone],
            )
          ).rows[0].result,
      );
    const visibleMembers = () =>
      owner(async (tx) => ({
        rpc: (
          await tx.query("select * from public.vs_circle_members($1)", [
            id(100),
          ])
        ).rows,
        direct: (
          await tx.query(
            "select * from viewstate_circle.members where circle_id=$1",
            [id(100)],
          )
        ).rows,
      }));
    const before = await visibleMembers();
    const missing = await send("+96550009999");
    assert.deepEqual(
      await send("+96550001234"),
      missing,
      "registered and absent numbers have identical responses",
    );
    assert.deepEqual(
      await visibleMembers(),
      before,
      "membership queries do not reveal phone lookup success",
    );
    assert.deepEqual(missing, { status: "accepted" });
    assert.deepEqual(
      await send("+96550001234"),
      missing,
      "pending invitation is concealed",
    );
    await asCircleUser(db, id(2), (tx) =>
      tx.query("select public.vs_circle_accept($1)", [id(100)]),
    );
    assert.equal(
      (await visibleMembers()).rpc.length,
      2,
      "only acceptance reveals the new member",
    );
    assert.deepEqual(
      await send("+96550001234"),
      missing,
      "active membership is concealed",
    );
    for (let n = 0; n < 6; n++)
      assert.deepEqual(await send("+96550009999"), missing);
    assert.deepEqual(await send("+96550009999"), { status: "rate_limited" });
    await assert.rejects(
      asCircleUser(db, id(3), (tx) =>
        tx.query("select public.vs_circle_invite_phone($1,$2)", [
          id(100),
          "+96550001234",
        ]),
      ),
      /CIRCLE_MEMBERSHIP_REQUIRED/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.members where circle_id=$1",
          [id(100)],
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("one member at 200 requests cannot consume peers capacity, and both RPCs enforce the member quota", async () => {
  const db = await circleFixture();
  try {
    for (let n = 1; n <= 3; n++)
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
    const user = <T>(n: number, work: Parameters<typeof asCircleUser<T>>[2]) =>
      asCircleUser(db, id(n), work);
    await user(1, (tx) =>
      tx.query("select public.vs_circle_create($1,$2)", [
        id(100),
        "Capacity fixture",
      ]),
    );
    await user(1, (tx) =>
      tx.query("select public.vs_circle_member($1,$2,'invite')", [
        id(100),
        id(2),
      ]),
    );
    await user(2, (tx) =>
      tx.query("select public.vs_circle_accept($1)", [id(100)]),
    );
    const submit = (n: number, source: number, facts = requestFacts) =>
      user(n, (tx) =>
        tx.query("select public.vs_circle_request($1,$2,$3::jsonb)", [
          id(100),
          id(source),
          JSON.stringify(facts),
        ]),
      );
    for (let n = 0; n < 200; n++) await submit(1, 1000 + n);
    await submit(2, 2000);
    await assert.rejects(submit(1, 1200), /CIRCLE_MEMBER_REQUEST_LIMIT/);
    await assert.rejects(
      user(1, (tx) =>
        tx.query("select public.vs_circle_request($1,$2,$3,$4,$5,$6,$7)", [
          id(100),
          id(1200),
          ["salmiya"],
          600,
          "monthly",
          2,
          2,
        ]),
      ),
      /CIRCLE_MEMBER_REQUEST_LIMIT/,
    );
    await submit(1, 1000, {
      ...requestFacts,
      budget: { maximum: 650, currencyCode: "KWD" },
    });
    await user(1, (tx) =>
      tx.query("select public.vs_circle_request($1,$2,null,true)", [
        id(100),
        id(1000),
      ]),
    );
    await submit(1, 1200);
    assert.equal(
      (await db.query("select count(*)::int n from viewstate_circle.requests"))
        .rows[0].n,
      201,
    );
    await assert.rejects(submit(3, 3000), /CIRCLE_MEMBERSHIP_REQUIRED/);
  } finally {
    await db.close();
  }
});

test("profile and offline workspace SQL security contracts execute in isolated PostgreSQL", async () => {
  const db = await circleFixture();
  try {
    await db.query("insert into auth.users(id) values($1)", [id(90)]);
    for (const file of [
      "private_user_profiles.sql",
      "offline_workspace_sync.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../../supabase/tests/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
  } finally {
    await db.close();
  }
});

test("matching keeps every request represented at the expanded 2000-request circle capacity", () => {
  const property = {
    core: {
      id: id(100),
      propertyType: "apartment",
      locationArea: { id: "salmiya" },
    },
    activeOffer: {
      id: id(101),
      propertyCoreId: id(100),
      transaction: "rent",
      rentalPrice: { amount: 500, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
    typeDetails: {
      propertyType: "apartment",
      apartmentSubtype: "standard_apartment",
      bedroomCount: 2,
      bathroomCount: 2,
    },
    marketingStatus: "active",
    rentalAvailability: "available",
  };
  const snapshot = {
    revision: 1,
    properties: [{ id: id(100), owner: id(1), facts: property }],
    requests: Array.from({ length: 2000 }, (_, n) => ({
      id: id(1000 + n),
      owner: id(2),
      facts: requestFacts,
    })),
  } as CircleSnapshot;
  assert.equal(matchCircleSnapshot(snapshot).length, 2000);
});

test("full circle capacity commits all 10000 shortlisted pairs and rejects request 2001 without blocking edits", async () => {
  const db = await circleFixture();
  try {
    for (let n = 1; n <= 12; n++)
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
    await asCircleUser(db, id(1), (tx) =>
      tx.query("select public.vs_circle_create($1,$2)", [
        id(100),
        "Full capacity",
      ]),
    );
    await db.query(
      "insert into viewstate_circle.members(circle_id,user_id,state) select $1,id,'active' from auth.users where id<>$2",
      [id(100), id(1)],
    );
    await db.query(
      `insert into viewstate_circle.requests(circle_id,owner_id,source_key,facts)
      select $1,('77777777-7777-4777-8777-'||lpad((2+(n/200))::text,12,'0'))::uuid,
      ('77777777-7777-4777-8777-'||lpad((1000+n)::text,12,'0'))::uuid,$2::jsonb from generate_series(0,1999) n`,
      [id(100), JSON.stringify(requestFacts)],
    );
    for (let n = 0; n < 5; n++) {
      const property = {
        core: {
          id: id(500 + n),
          propertyType: "apartment",
          locationArea: { id: "salmiya" },
        },
        activeOffer: {
          id: id(510 + n),
          propertyCoreId: id(500 + n),
          transaction: "rent",
          rentalPrice: { amount: 500, currencyCode: "KWD" },
          rentalPeriodId: "monthly",
        },
        typeDetails: {
          propertyType: "apartment",
          apartmentSubtype: "standard_apartment",
          bedroomCount: 2,
          bathroomCount: 2,
        },
        marketingStatus: "active",
        rentalAvailability: "available",
      };
      await asCircleUser(db, id(1), (tx) =>
        tx.query("select public.vs_circle_publish($1,$2,0,$3,$4::jsonb)", [
          id(100),
          id(500 + n),
          id(600 + n),
          JSON.stringify(property),
        ]),
      );
    }
    await assert.rejects(
      asCircleUser(db, id(12), (tx) =>
        tx.query("select public.vs_circle_request($1,$2,$3::jsonb)", [
          id(100),
          id(4000),
          JSON.stringify(requestFacts),
        ]),
      ),
      /CIRCLE_REQUEST_LIMIT/,
    );
    await asCircleUser(db, id(2), (tx) =>
      tx.query("select public.vs_circle_request($1,$2,$3::jsonb)", [
        id(100),
        id(1000),
        JSON.stringify(requestFacts),
      ]),
    );
    const snapshot = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (
        await tx.query<{ data: CircleSnapshot }>(
          "select public.vs_circle_worker_snapshot($1) data",
          [id(100)],
        )
      ).rows[0].data;
    });
    const pairs = matchCircleSnapshot(snapshot);
    assert.equal(pairs.length, 10000);
    await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      assert.equal(
        (
          await tx.query<{ ok: boolean }>(
            "select public.vs_circle_worker_commit($1,$2,$3::jsonb) ok",
            [id(100), snapshot.revision, JSON.stringify(pairs)],
          )
        ).rows[0].ok,
        true,
      );
    });
    assert.equal(
      (await db.query("select count(*)::int n from viewstate_circle.matches"))
        .rows[0].n,
      10000,
    );
    const match = (
      await db.query<{ id: string }>(
        "select id from viewstate_circle.matches where request_id=$1",
        [pairs[0].request_id],
      )
    ).rows[0].id;
    const requester = (
      await db.query<{ owner_id: string }>(
        "select owner_id from viewstate_circle.requests where id=$1",
        [pairs[0].request_id],
      )
    ).rows[0].owner_id;
    const cooperate = () =>
      asCircleUser(
        db,
        requester,
        async (tx) =>
          (
            await tx.query<{ result: string }>(
              "select public.vs_circle_cooperation_request($1,$2,'viewing') result",
              [id(100), match],
            )
          ).rows[0].result,
      );
    const first = await cooperate();
    assert.equal(await cooperate(), first, "pending retries remain idempotent");
    await asCircleUser(db, id(1), (tx) =>
      tx.query("select public.vs_circle_cooperation_action($1,$2,'decline')", [
        id(100),
        first,
      ]),
    );
    const notices = (
      await db.query(
        "select count(*)::int n from viewstate_circle.cooperation_outbox",
      )
    ).rows[0].n;
    await assert.rejects(cooperate(), /CIRCLE_COOPERATION_COOLDOWN/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.cooperation_outbox",
        )
      ).rows[0].n,
      notices,
      "blocked retry emits no notification",
    );
    await db.query(
      "update viewstate_circle.cooperations set updated_at=now()-interval '25 hours' where id=$1",
      [first],
    );
    assert.notEqual(
      await cooperate(),
      first,
      "a declined pair can be requested after the cooldown",
    );
  } finally {
    await db.close();
  }
});
