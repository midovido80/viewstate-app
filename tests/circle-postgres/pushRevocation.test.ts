import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("push device capabilities revoke after logout but cannot delete a replacement registration", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const token = "ExpoPushToken[aaaaaaaa]";
  const secretA = "a".repeat(64),
    secretB = "b".repeat(64),
    secretC = "c".repeat(64),
    secretD = "d".repeat(64);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create schema viewstate_circle;
      create function viewstate_circle.actor() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
      create table viewstate_circle.push_devices(token text primary key,user_id uuid,updated_at timestamptz default now());
      create function public.vs_circle_register_push(p_token text,p_enabled boolean) returns void language plpgsql as $$begin return;end$$;`);
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261123130953_circle_push_revocation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const actor = async (owner: string) => {
      await db.query("select set_config('test.actor',$1,false)", [owner]);
    };
    const activate = (secret: string) =>
      db.query("select public.vs_circle_register_push_device($1,$2)", [
        token,
        secret,
      ]);
    const prepare = (secret: string) =>
      db.query("select public.vs_circle_prepare_push_device($1,$2)", [
        token,
        secret,
      ]);
    const register = async (secret: string) => {
      await prepare(secret);
      await activate(secret);
    };
    const revoke = (secret: string) =>
      db.query("select public.vs_circle_revoke_push_device($1,$2)", [
        token,
        secret,
      ]);
    const owners = async () =>
      (
        await db.query<{ user_id: string }>(
          "select user_id from viewstate_circle.push_devices",
        )
      ).rows.map((row) => row.user_id);
    await actor(a);
    await assert.rejects(activate(secretA), /CIRCLE_PUSH_CAPABILITY_REVOKED/);
    const delayedSecret = "e".repeat(64);
    await prepare(delayedSecret);
    await revoke(delayedSecret);
    await assert.rejects(
      activate(delayedSecret),
      /CIRCLE_PUSH_CAPABILITY_REVOKED/,
    );
    assert.deepEqual(
      await owners(),
      [],
      "revoke before delayed activation cannot resurrect a signed-out token",
    );
    await register(secretA);
    await db.exec("set role anon");
    await assert.rejects(register(secretB), /permission denied/);
    await revoke(secretB);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from viewstate_circle.push_capabilities")).rows
        .length,
      2,
      "anonymous unknown revocation cannot create tombstone rows",
    );
    assert.deepEqual(await owners(), [a]);
    await actor(b);
    await register(secretB);
    await db.exec("set role anon");
    await revoke(secretA);
    await db.exec("reset role");
    assert.deepEqual(
      await owners(),
      [b],
      "old A capability cannot revoke B on the same device token",
    );
    await actor(a);
    await assert.rejects(activate(secretA), /CIRCLE_PUSH_CAPABILITY_REVOKED/);
    await db.query("select public.vs_circle_register_push($1,true)", [token]);
    assert.deepEqual(
      await owners(),
      [b],
      "delayed legacy enable cannot replace a protected registration",
    );
    await actor(b);
    await db.query("select public.vs_circle_register_push($1,false)", [token]);
    assert.deepEqual(
      await owners(),
      [b],
      "legacy delayed disable cannot delete a new protected registration",
    );
    await db.exec("set role anon");
    await revoke(secretB);
    await revoke(secretB);
    await db.exec("reset role");
    assert.deepEqual(await owners(), [], "signed-out revoke is idempotent");
    await actor(a);
    await register(secretC);
    await register(secretD);
    await revoke(secretC);
    assert.deepEqual(
      await owners(),
      [a],
      "same-account re-registration survives an old logout",
    );
    await revoke(secretD);
    assert.deepEqual(await owners(), []);
    await revoke(secretA);
    await assert.rejects(register(secretA), /CIRCLE_PUSH_CAPABILITY_REVOKED/);
    assert.deepEqual(
      await owners(),
      [],
      "revoked capability cannot be reactivated by a delayed registration",
    );
    await db.query("select public.vs_circle_register_push($1,true)", [token]);
    await actor(b);
    await db.query("select public.vs_circle_register_push($1,false)", [token]);
    assert.deepEqual(
      await owners(),
      [a],
      "legacy owner isolation remains enforced",
    );
    await actor(a);
    await db.query("select public.vs_circle_register_push($1,false)", [token]);
    assert.deepEqual(await owners(), []);
  } finally {
    await db.close();
  }
});
