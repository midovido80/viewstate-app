import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createWorkspaceCloud } from "../../artifacts/mobile/services/workspaceCloud.ts";

const owner = "33333333-3333-4333-8333-333333333333";
const peer = "44444444-4444-4444-8444-444444444444";
const circle = "55555555-5555-4555-8555-555555555555";
const secondCircle = "66666666-6666-4666-8666-666666666666";
const source = "property-refresh";
const property = {
  core: {
    id: source,
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
    privateNotes: {
      value: "PRIVATE_SENTINEL",
      privacy: { classification: "private_notes", disclosurePolicy: "never" },
    },
  },
  activeOffer: {
    id: "offer-refresh",
    propertyCoreId: source,
    transaction: "rent",
    rentalPrice: { amount: 300, currencyCode: "KWD" },
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
const facts = {
  ...property,
  core: {
    id: source,
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
  },
};

test("workspace transport derives an allowlisted projection without changing business records", async () => {
  const records = {
    [`property/${source}`]: property,
    "person/private": { name: "PRIVATE_SENTINEL" },
  };
  let payload: any;
  const cloud = createWorkspaceCloud(async (_path, options) => {
    payload = JSON.parse(options!.body as string).next_payload;
    return Response.json({ accepted: true, revision: 1, payload });
  }, owner);
  const result = await cloud.write(0, records);
  assert.ok(
    payload.circlePropertyFacts,
    "workspace sync includes derived property facts",
  );
  assert.equal(
    payload.circlePropertyFacts[source].activeOffer.rentalPrice.amount,
    300,
  );
  assert.equal(payload.circlePropertyFacts[source].typeDetails.bedroomCount, 2);
  assert.doesNotMatch(
    JSON.stringify(payload.circlePropertyFacts),
    /PRIVATE_SENTINEL|privateNotes|person/,
  );
  assert.deepEqual(result.workspace.records, records);
  assert.deepEqual(records[`property/${source}`], property);
});

test("workspace sync refreshes only existing published listings and invalidates matching", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key, phone text, phone_confirmed_at timestamptz, is_anonymous boolean default false);
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
      create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint);
      create table storage.objects(bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
    const migrations = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(new URL(file, migrations), "utf8"));
    }
    await db.query("insert into auth.users(id) values($1),($2)", [owner, peer]);
    const asUser = (who: string, sql: string, args: any[] = []) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: who, role: "authenticated" }),
        ]);
        await tx.exec("set local role authenticated");
        return tx.query(sql, args);
      });
    await asUser(owner, "select public.vs_circle_create($1,$2)", [
      circle,
      "Refresh",
    ]);
    await asUser(owner, "select public.vs_circle_create($1,$2)", [
      secondCircle,
      "Refresh second",
    ]);
    for (const c of [circle, secondCircle]) {
      await asUser(owner, "select public.vs_circle_member($1,$2,$3)", [
        c,
        peer,
        "invite",
      ]);
      await asUser(peer, "select public.vs_circle_accept($1)", [c]);
    }
    const sync = (
      who: string,
      revision: number,
      record: unknown,
      projection: unknown = facts,
    ) =>
      asUser(who, "select public.commit_account_workspace($1,$2::jsonb)", [
        revision,
        JSON.stringify({
          version: 1,
          records: { [`property/${source}`]: record },
          circlePropertyFacts: { [source]: projection },
        }),
      ]);
    const publish = (who: string, c: string) =>
      asUser(
        who,
        "select public.vs_circle_publish($1,$2,0,gen_random_uuid(),$3::jsonb,false)",
        [c, source, JSON.stringify(facts)],
      );
    const rows = async () =>
      (
        await db.query<any>(
          "select circle_id,publisher_id,state,revision,facts,source_deleted from viewstate_circle.properties order by circle_id,publisher_id",
        )
      ).rows;
    await sync(owner, 0, property);
    await publish(owner, circle);
    await publish(owner, secondCircle);
    await sync(peer, 0, property);
    await publish(peer, circle);
    const initial = await rows();
    const edited = {
      ...property,
      activeOffer: {
        ...property.activeOffer,
        rentalPrice: { amount: 450, currencyCode: "KWD" },
      },
      typeDetails: {
        ...property.typeDetails,
        bedroomCount: 4,
        hasBalcony: false,
      },
    };
    const editedFacts = { ...edited, core: facts.core };
    const revisionBefore = (
      await db.query<any>(
        "select revision from viewstate_circle.circles where id=$1",
        [circle],
      )
    ).rows[0].revision;
    await sync(owner, 1, edited, editedFacts);
    for (const row of (await rows()).filter(
      (row) => row.publisher_id === owner,
    )) {
      assert.equal(row.facts.activeOffer.rentalPrice.amount, 450);
      assert.equal(row.facts.typeDetails.bedroomCount, 4);
      assert.equal(row.facts.typeDetails.hasBalcony, false);
      assert.equal(row.revision, 2);
    }
    assert.deepEqual(
      (await rows()).find((row) => row.publisher_id === peer),
      initial.find((row) => row.publisher_id === peer),
    );
    assert.ok(
      (
        await db.query<any>(
          "select revision from viewstate_circle.circles where id=$1",
          [circle],
        )
      ).rows[0].revision > revisionBefore,
    );
    await sync(
      owner,
      2,
      {
        ...edited,
        core: {
          ...edited.core,
          privateNotes: { value: "CHANGED_PRIVATE_SENTINEL" },
        },
      },
      editedFacts,
    );
    assert.equal(
      (await rows()).find((row) => row.publisher_id === owner).revision,
      2,
      "private edits do not invalidate shared facts",
    );
    await asUser(
      owner,
      "select public.vs_circle_publish($1,$2,2,gen_random_uuid(),null,true)",
      [circle, source],
    );
    await sync(owner, 3, property, facts);
    assert.equal(
      (await rows()).find(
        (row) => row.publisher_id === owner && row.circle_id === circle,
      ).state,
      "withdrawn",
    );
    assert.equal((await rows()).length, 3, "sync does not create publications");
    await sync(owner, 4, { version: 1, deleted: true }, null);
    assert.ok(
      (await rows())
        .filter((row) => row.publisher_id === owner)
        .every((row) => row.state === "withdrawn" && row.source_deleted),
    );
    await asUser(peer, "select public.commit_account_workspace($1,$2::jsonb)", [
      1,
      JSON.stringify({
        version: 1,
        records: { [`property/${source}`]: edited },
      }),
    ]);
    assert.equal(
      (await rows()).find((row) => row.publisher_id === peer).state,
      "withdrawn",
      "old-client edits cannot leave stale published facts",
    );
    await sync(peer, 2, edited, editedFacts);
    assert.equal(
      (await rows()).find((row) => row.publisher_id === peer).state,
      "withdrawn",
      "a valid later sync cannot republish",
    );
    await asUser(
      peer,
      "select public.vs_circle_publish($1,$2,2,gen_random_uuid(),$3::jsonb,false)",
      [circle, source, JSON.stringify(editedFacts)],
    );
    await sync(peer, 3, edited, {
      ...editedFacts,
      privateNotes: "PRIVATE_SENTINEL",
    });
    assert.equal(
      (await rows()).find((row) => row.publisher_id === peer).state,
      "withdrawn",
      "invalid projections fail closed",
    );
    assert.doesNotMatch(
      JSON.stringify((await rows()).map((row) => row.facts)),
      /PRIVATE_SENTINEL/,
    );
  } finally {
    await db.close();
  }
});
