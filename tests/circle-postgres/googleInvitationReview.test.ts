import test from "node:test";
import assert from "node:assert/strict";
import { circleFixture, asCircleUser } from "./fixture.ts";

const id = (n: number) =>
  `99999999-9999-4999-8999-${String(n).padStart(12, "0")}`;

async function fixture() {
  const db = await circleFixture();
  for (let n = 1; n <= 5; n++)
    await db.query("insert into auth.users(id) values($1)", [id(n)]);
  await db.query(
    `update auth.users set email='recipient@example.com',email_confirmed_at=now(),raw_app_meta_data='{"providers":["google"]}' where id=$1`,
    [id(2)],
  );
  await db.query(
    `insert into auth.identities(user_id,provider,identity_data) values($1,'google','{"email":"recipient@example.com","email_verified":true,"full_name":"Google Recipient"}')`,
    [id(2)],
  );
  await db.query(
    "insert into public.user_profiles(user_id,display_name,phone,classification) values($1,'Untrusted profile','+96550001234','broker')",
    [id(2)],
  );
  const rpc = async (n: number, name: string, args: unknown[] = []) =>
    asCircleUser(
      db,
      id(n),
      async (tx) =>
        (
          await tx.query<{ data: any }>(
            `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) data`,
            args,
          )
        ).rows[0].data,
    );
  await rpc(1, "vs_circle_create", [id(100), "Google review"]);
  const invite = () =>
    rpc(1, "vs_circle_invite_phone", [id(100), "+96550001234"]);
  return { db, rpc, invite };
}

for (const phone of ["50001234", "0096550001234", "+96550009999"])
  test("Google review required for phone format " + phone, async () => {
    const { db, rpc, invite } = await fixture();
    try {
      await db.query(
        "update public.user_profiles set phone=$1 where user_id=$2",
        [phone, id(2)],
      );
      if (phone === "+96550009999")
        await db.query(
          "update auth.users set phone='+96550001234',phone_confirmed_at=now() where id=$1",
          [id(2)],
        );
      await invite();
      const invitations = await rpc(2, "vs_circle_invitations_named");
      assert.equal(invitations[0]?.requires_review, true, phone);
      await assert.rejects(
        rpc(2, "vs_circle_accept", [id(100)]),
        /CIRCLE_JOIN_REVIEW_REQUIRED/,
      );
    } finally {
      await db.close();
    }
  });

test("legacy inbox excludes new review kind and owners can reject identity-changed requests", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    await invite();
    await rpc(2, "vs_circle_request_join", [id(100)]);
    assert.equal(
      (await rpc(1, "vs_circle_notification_inbox")).entries.some(
        (row: any) => row.kind === "join_request",
      ),
      false,
    );
    assert.equal(
      (await rpc(1, "vs_circle_notification_inbox_v2")).entries.some(
        (row: any) => row.kind === "join_request",
      ),
      true,
    );
    const [review] = await rpc(1, "vs_circle_join_reviews", [id(100)]);
    await db.query("delete from auth.identities where user_id=$1", [id(2)]);
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), review.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    await rpc(1, "vs_circle_review_join", [id(100), review.id, false]);
    await rpc(1, "vs_circle_review_join", [id(100), review.id, false]);
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
  } finally {
    await db.close();
  }
});

test("Google profile-phone hints require consent and owner approval before any membership access", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    assert.deepEqual(await invite(), { status: "accepted" });
    const invitations = await rpc(2, "vs_circle_invitations_named");
    assert.equal(invitations[0]?.requires_review, true);
    assert.equal(invitations[0]?.approval_requested, false);
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
    await assert.rejects(
      rpc(2, "vs_circle_accept", [id(100)]),
      /CIRCLE_JOIN_REVIEW_REQUIRED/,
    );
    await assert.rejects(
      rpc(3, "vs_circle_request_join", [id(100)]),
      /CIRCLE_INVITATION_REQUIRED/,
    );
    await rpc(2, "vs_circle_request_join", [id(100)]);
    await rpc(2, "vs_circle_request_join", [id(100)]);
    const reviews = await rpc(1, "vs_circle_join_reviews", [id(100)]);
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].display_name, "Google Recipient");
    assert.equal(reviews[0].google_email, "recipient@example.com");
    assert.equal(reviews[0].user_id, id(2));
    await assert.rejects(
      rpc(2, "vs_circle_join_reviews", [id(100)]),
      /CIRCLE_OWNER_REQUIRED/,
    );
    await assert.rejects(
      rpc(3, "vs_circle_review_join", [id(100), reviews[0].id, true]),
      /CIRCLE_OWNER_REQUIRED/,
    );
    for (const name of [
      "vs_circle_catalog",
      "vs_circle_members",
      "vs_circle_matches",
    ])
      await assert.rejects(
        rpc(2, name, [id(100)]),
        /CIRCLE_MEMBERSHIP_REQUIRED/,
      );
    assert.deepEqual(
      (
        await asCircleUser(db, id(2), (tx) =>
          tx.query("select * from viewstate_circle.properties"),
        )
      ).rows,
      [],
    );
    const notices = (
      await db.query(
        "select * from viewstate_circle.notification_inbox where kind='join_request'",
      )
    ).rows;
    assert.equal(notices.length, 1);
    assert.equal(notices[0].deliver, false);
    assert.deepEqual(
      await rpc(1, "vs_circle_notification_open", [notices[0].id]),
      { kind: "circle", circleId: id(100) },
    );
    await rpc(1, "vs_circle_review_join", [id(100), reviews[0].id, true]);
    await rpc(1, "vs_circle_review_join", [id(100), reviews[0].id, true]);
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), reviews[0].id, false]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    assert.equal(
      (
        await db.query(
          "select state from viewstate_circle.members where user_id=$1",
          [id(2)],
        )
      ).rows[0].state,
      "active",
    );
  } finally {
    await db.close();
  }
});

test("changed identity and cancelled generations cannot be approved; rejection retries are durable", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    await invite();
    await rpc(2, "vs_circle_request_join", [id(100)]);
    const first = (await rpc(1, "vs_circle_join_reviews", [id(100)]))[0];
    await db.query(
      "update auth.users set email='changed@example.com' where id=$1",
      [id(2)],
    );
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), first.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    await db.query(
      "update auth.users set email='recipient@example.com' where id=$1",
      [id(2)],
    );
    await rpc(2, "vs_circle_decline", [id(100)]);
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), first.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    assert.equal(
      (
        await db.query(
          "select read_at is not null as handled from viewstate_circle.notification_inbox where kind='join_request'",
        )
      ).rows[0].handled,
      true,
    );
    await rpc(1, "vs_circle_member", [id(100), id(2), "invite"]);
    await rpc(2, "vs_circle_request_join", [id(100)]);
    const second = (await rpc(1, "vs_circle_join_reviews", [id(100)]))[0];
    assert.notEqual(first.id, second.id);
    await rpc(1, "vs_circle_review_join", [id(100), second.id, false]);
    await rpc(1, "vs_circle_review_join", [id(100), second.id, false]);
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), second.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
  } finally {
    await db.close();
  }
});

test("ambiguous and untrusted profile hints stay private; verified auth-phone fallback cannot downgrade review", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    await db.query(
      "insert into public.user_profiles(user_id,display_name,phone,classification) values($1,'Duplicate','+96550001234','broker')",
      [id(3)],
    );
    assert.deepEqual(await invite(), { status: "accepted" });
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.members where state='invited'",
        )
      ).rows[0].n,
      0,
    );
    await db.query("delete from public.user_profiles where user_id=$1", [
      id(3),
    ]);
    await db.query(
      "update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{\"providers\":[\"google\"]}' where id=$1",
      [id(2)],
    );
    await invite();
    assert.deepEqual(await rpc(2, "vs_circle_invitations_named"), []);
    await db.query(
      `update auth.users set raw_app_meta_data='{"providers":["google"]}' where id=$1`,
      [id(2)],
    );
    await invite();
    await db.query(
      "update auth.users set phone='96550001234',phone_confirmed_at=now() where id=$1",
      [id(2)],
    );
    await invite();
    await assert.rejects(
      rpc(2, "vs_circle_accept", [id(100)]),
      /CIRCLE_JOIN_REVIEW_REQUIRED/,
    );
    await db.query(
      "update auth.users set phone='96550005678',phone_confirmed_at=now() where id=$1",
      [id(4)],
    );
    await rpc(1, "vs_circle_invite_phone", [id(100), "+96550005678"]);
    await rpc(4, "vs_circle_accept", [id(100)]);
  } finally {
    await db.close();
  }
});

test("consent cannot reveal an unverified Google email and replaced identities or owner revocation invalidate approval", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    await invite();
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [id(2)],
    );
    await assert.rejects(
      rpc(2, "vs_circle_request_join", [id(100)]),
      /CIRCLE_GOOGLE_IDENTITY_REQUIRED/,
    );
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [id(2)],
    );
    await rpc(2, "vs_circle_request_join", [id(100)]);
    const review = (await rpc(1, "vs_circle_join_reviews", [id(100)]))[0];
    await assert.rejects(
      asCircleUser(db, id(1), (tx) =>
        tx.query("select * from viewstate_circle.join_reviews"),
      ),
      /permission denied/,
    );
    await assert.rejects(
      asCircleUser(db, id(2), (tx) =>
        tx.query("select * from viewstate_circle.join_reviews"),
      ),
      /permission denied/,
    );
    await db.query(
      "update auth.identities set id=gen_random_uuid() where user_id=$1",
      [id(2)],
    );
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), review.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    await rpc(1, "vs_circle_member", [id(100), id(2), "revoke"]);
    await rpc(1, "vs_circle_member", [id(100), id(2), "invite"]);
    await assert.rejects(
      rpc(1, "vs_circle_review_join", [id(100), review.id, true]),
      /CIRCLE_JOIN_REVIEW_STALE/,
    );
    await rpc(2, "vs_circle_request_join", [id(100)]);
    assert.notEqual(
      (await rpc(1, "vs_circle_join_reviews", [id(100)]))[0].id,
      review.id,
    );
  } finally {
    await db.close();
  }
});

test("wrong unverified phone hint remains powerless until the named account consents and owner approves; batch retries do not repeat invitations", async () => {
  const { db, rpc } = await fixture();
  try {
    const phones = ["+96550001234", "+96550009999"];
    const first = await rpc(1, "vs_circle_invite_batch", [
      id(100),
      id(200),
      phones,
    ]);
    assert.deepEqual(first, {
      results: [
        { phone: "+96550001234", status: "accepted" },
        { phone: "+96550009999", status: "accepted" },
      ],
    });
    assert.deepEqual(
      await rpc(1, "vs_circle_invite_batch", [
        id(100),
        id(200),
        phones.toReversed(),
      ]),
      first,
    );
    assert.equal(
      (
        await db.query(
          "select attempts from viewstate_circle.invite_phone_limits where user_id=$1",
          [id(1)],
        )
      ).rows[0].attempts,
      2,
    );
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
    await assert.rejects(
      rpc(3, "vs_circle_request_join", [id(100)]),
      /CIRCLE_INVITATION_REQUIRED/,
    );
    await assert.rejects(
      rpc(2, "vs_circle_catalog", [id(100)]),
      /CIRCLE_MEMBERSHIP_REQUIRED/,
    );
    await rpc(2, "vs_circle_decline", [id(100)]);
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from viewstate_circle.notification_inbox where kind='join_request'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("owner rejection remains possible after Google unlink", async () => {
  const { db, rpc, invite } = await fixture();
  try {
    await invite();
    await rpc(2, "vs_circle_request_join", [id(100)]);
    const [r] = await rpc(1, "vs_circle_join_reviews", [id(100)]);
    await db.query("delete from auth.identities where user_id=$1", [id(2)]);
    await rpc(1, "vs_circle_review_join", [id(100), r.id, false]);
    assert.deepEqual(await rpc(1, "vs_circle_join_reviews", [id(100)]), []);
  } finally {
    await db.close();
  }
});
