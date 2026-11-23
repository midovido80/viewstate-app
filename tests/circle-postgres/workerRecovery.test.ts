import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("failed circle jobs back off durably while later circles run and new revisions survive", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema viewstate_circle;
   create table viewstate_circle.circles(id uuid primary key, revision bigint default 1);
   create table viewstate_circle.change_queue(circle_id uuid references viewstate_circle.circles(id), revision bigint, created_at timestamptz default now(), primary key(circle_id,revision));
   create function public.vs_circle_worker_jobs() returns setof uuid language sql as $$select circle_id from viewstate_circle.change_queue group by circle_id order by min(created_at),circle_id limit 5$$;`);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261123123000_circle_worker_backoff.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const ids = Array.from(
      { length: 7 },
      (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await db.query("insert into viewstate_circle.circles(id) values($1);", [
        id,
      ]);
    for (const id of ids)
      await db.query(
        "insert into viewstate_circle.change_queue(circle_id,revision) values($1,1)",
        [id],
      );
    const tokens = new Map<string, string>();
    const jobs = async () => {
      const result = await db.query<{ circle_id: string; claim_id: string }>(
        "select * from public.vs_circle_worker_jobs()",
      );
      for (const row of result.rows) tokens.set(row.circle_id, row.claim_id);
      return result.rows.map((row) => row.circle_id).sort();
    };
    assert.deepEqual(await jobs(), ids.slice(0, 5));
    const originalClaim = tokens.get(ids[0]);
    for (const id of ids.slice(0, 5))
      await db.query("select public.vs_circle_worker_retry($1,$2)", [
        id,
        tokens.get(id),
      ]);
    assert.deepEqual(await jobs(), ids.slice(5));
    await db.query(
      "insert into viewstate_circle.change_queue(circle_id,revision) values($1,2)",
      [ids[0]],
    );
    assert.deepEqual(
      await jobs(),
      [],
      "new enqueue cannot bypass failed circle backoff",
    );
    assert.equal(
      (await db.query("select * from viewstate_circle.change_queue")).rows
        .length,
      8,
    );
    await db.query(
      "update viewstate_circle.circles set worker_retry_at=now()-interval '1 second' where id=$1",
      [ids[0]],
    );
    assert.deepEqual(
      await jobs(),
      [ids[0]],
      "failed circle becomes eligible again",
    );
    assert.notEqual(
      tokens.get(ids[0]),
      originalClaim,
      "every claim gets a fresh identity independent of bounded attempts",
    );
    const leaseBefore = (
      await db.query<{ retry: string }>(
        "select worker_retry_at::text retry from viewstate_circle.circles where id=$1",
        [ids[0]],
      )
    ).rows[0].retry;
    await db.query("select public.vs_circle_worker_retry($1,$2)", [
      ids[0],
      originalClaim,
    ]);
    assert.equal(
      (
        await db.query<{ retry: string }>(
          "select worker_retry_at::text retry from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].retry,
      leaseBefore,
      "late worker failure cannot shorten a newer lease",
    );
    await db.query("select public.vs_circle_worker_retry($1,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    const retry = await db.query<{ attempts: number; delayed: boolean }>(
      "select worker_attempts attempts,worker_retry_at>now()+interval '55 seconds' delayed from viewstate_circle.circles where id=$1",
      [ids[0]],
    );
    assert.equal(retry.rows[0].attempts, 2);
    assert.equal(
      retry.rows[0].delayed,
      true,
      "repeat failure uses durable exponential backoff",
    );
    await db.query(
      "update viewstate_circle.circles set worker_attempts=10 where id=$1",
      [ids[0]],
    );
    await db.query("select public.vs_circle_worker_retry($1,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    const bounded = await db.query<{ bounded: boolean }>(
      "select worker_retry_at<=now()+interval '1 hour' bounded from viewstate_circle.circles where id=$1",
      [ids[0]],
    );
    assert.equal(bounded.rows[0].bounded, true);
    const saturatedClaim = tokens.get(ids[0]);
    await db.query(
      "update viewstate_circle.circles set worker_retry_at=now()-interval '1 second' where id=$1",
      [ids[0]],
    );
    assert.deepEqual(await jobs(), [ids[0]]);
    assert.notEqual(
      tokens.get(ids[0]),
      saturatedClaim,
      "claim identity never repeats when attempts saturate",
    );
    await db.query("select public.vs_circle_worker_complete($1,1,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          "select worker_attempts attempts from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].attempts,
      10,
      "completion cannot clear retry while a concurrent enqueue remains",
    );
    await db.query(
      "delete from viewstate_circle.change_queue where circle_id=$1",
      [ids[0]],
    );
    await db.query(
      "update viewstate_circle.circles set revision=2 where id=$1",
      [ids[0]],
    );
    await db.query("select public.vs_circle_worker_complete($1,1,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          "select worker_attempts attempts from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].attempts,
      10,
      "stale completion cannot clear the newer cycle",
    );
    await db.query("select public.vs_circle_worker_complete($1,2,$2)", [
      ids[0],
      originalClaim,
    ]);
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          "select worker_attempts attempts from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].attempts,
      10,
      "stale claim cannot complete a newer cycle even at the same revision",
    );
    await db.query("select public.vs_circle_worker_complete($1,2,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          "select worker_attempts attempts from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].attempts,
      0,
      "successful current completion resets attempts",
    );
    const successRetry = (
      await db.query<{ retry: string }>(
        "select worker_retry_at::text retry from viewstate_circle.circles where id=$1",
        [ids[0]],
      )
    ).rows[0].retry;
    await db.query("select public.vs_circle_worker_retry($1,$2)", [
      ids[0],
      tokens.get(ids[0]),
    ]);
    assert.equal(
      (
        await db.query<{ retry: string }>(
          "select worker_retry_at::text retry from viewstate_circle.circles where id=$1",
          [ids[0]],
        )
      ).rows[0].retry,
      successRetry,
      "late failure cannot overwrite a completed cycle reset",
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.vs_circle_worker_retry($1,$2)", [
        ids[0],
        tokens.get(ids[0]),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
