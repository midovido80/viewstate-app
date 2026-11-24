import test from "node:test";
import assert from "node:assert/strict";
import { circleFixture, asCircleUser } from "./fixture.ts";

const id = (n: number) =>
  `88888888-8888-4888-8888-${String(n).padStart(12, "0")}`;
test("invitation batch is owner-only, private, bounded and idempotent under reordered retries and mixed quota results", async () => {
  const db = await circleFixture();
  try {
    for (let n = 1; n <= 4; n++)
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
    const user = <T>(n: number, work: Parameters<typeof asCircleUser<T>>[2]) =>
      asCircleUser(db, id(n), work);
    await user(1, (tx) =>
      tx.query("select public.vs_circle_create($1,$2)", [
        id(100),
        "Batch fixture",
      ]),
    );
    await user(1, (tx) =>
      tx.query("select public.vs_circle_member($1,$2,'invite')", [
        id(100),
        id(3),
      ]),
    );
    await user(3, (tx) =>
      tx.query("select public.vs_circle_accept($1)", [id(100)]),
    );
    await db.query(
      "update auth.users set phone=$1,phone_confirmed_at=now() where id=$2",
      ["96550001234", id(2)],
    );
    const send = (operation: number, phones: string[] | null, n = 1) =>
      user(
        n,
        async (tx) =>
          (
            await tx.query<{
              data: { results: { phone: string; status: string }[] };
            }>("select public.vs_circle_invite_batch($1,$2,$3::text[]) data", [
              id(100),
              id(operation),
              phones,
            ])
          ).rows[0].data,
      );
    const phones = ["+96550001234", "+96550005678", "+96550001234"];
    const result = await send(200, phones);
    assert.deepEqual(result, {
      results: [
        { phone: "+96550001234", status: "accepted" },
        { phone: "+96550005678", status: "accepted" },
      ],
    });
    assert.deepEqual(await send(200, [...phones].reverse()), result);
    assert.equal(
      (
        await db.query(
          "select attempts from viewstate_circle.invite_phone_limits where user_id=$1",
          [id(1)],
        )
      ).rows[0].attempts,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.members where user_id=$1 and state='invited'",
          [id(2)],
        )
      ).rows[0].n,
      1,
    );
    const visible = await user(1, (tx) =>
      tx.query("select * from public.vs_circle_members($1)", [id(100)]),
    );
    assert.equal(
      visible.rows.length,
      2,
      "phone invitation outcome remains hidden from sender",
    );
    await assert.rejects(
      send(200, ["+96550009999"]),
      /CIRCLE_INVITE_BATCH_CHANGED/,
    );
    await assert.rejects(send(201, phones, 3), /CIRCLE_OWNER_REQUIRED/);
    await assert.rejects(send(201, phones, 4), /CIRCLE_MEMBERSHIP_REQUIRED/);
    await assert.rejects(
      user(3, (tx) =>
        tx.query("select * from viewstate_circle.invite_batches"),
      ),
      /permission denied/,
    );
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('anon','public.vs_circle_invite_batch(uuid,uuid,text[])','execute') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    for (const bad of [
      [],
      null,
      ["not-a-number"],
      Array.from(
        { length: 51 },
        (_, n) => `+9655${String(n).padStart(7, "0")}`,
      ),
    ])
      await assert.rejects(send(202, bad), /CIRCLE_INVITE_BATCH_INVALID/);
    await db.query(
      "update viewstate_circle.invite_phone_limits set attempts=9 where user_id=$1",
      [id(1)],
    );
    const limited = await send(203, [
      "+96550001001",
      "+96550001002",
      "+96550001003",
    ]);
    assert.deepEqual(
      limited.results.map((row) => row.status),
      ["accepted", "rate_limited", "rate_limited"],
    );
    assert.deepEqual(
      await send(203, ["+96550001003", "+96550001002", "+96550001001"]),
      limited,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.invite_batches",
        )
      ).rows[0].n,
      2,
      "invalid or unauthorized calls leave no stored batch",
    );
  } finally {
    await db.close();
  }
});
