import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('delivery webhook queues only an authenticated wake-up and keeps the circle change on failure', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema vault;
      create schema net;
      create schema cron;
      create schema viewstate_circle;
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      create table net.requests(url text, body jsonb, headers jsonb);
      create table cron.jobs(name text, schedule text, command text);
      create table viewstate_circle.change_queue(circle_id uuid);
      create function net.http_post(url text, body jsonb, timeout_milliseconds int, headers jsonb)
      returns bigint language sql as $$insert into net.requests values ($1,$2,$4); select 1::bigint$$;
      create function cron.schedule(text,text,text)
      returns bigint language sql as $$insert into cron.jobs values ($1,$2,$3); select 1::bigint$$;
      insert into vault.decrypted_secrets values
        ('circle_worker_url','https://test.supabase.co/functions/v1/circle-match-worker'),
        ('circle_worker_secret','synthetic-test-value');
    `);
    const bootstrap = await readFile(new URL('../../scripts/enable-circle-worker-delivery.sql', import.meta.url), 'utf8');
    // The managed extensions are stubbed to capture the real trigger's invocation.
    await db.exec(bootstrap.replace(/^create extension .*;$/gm, ''));
    await db.exec("insert into viewstate_circle.change_queue values ('00000000-0000-4000-8000-000000000001')");
    assert.deepEqual((await db.query('select * from net.requests')).rows, [{
      url: 'https://test.supabase.co/functions/v1/circle-match-worker',
      body: {},
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-test-value' },
    }]);
    assert.deepEqual((await db.query('select schedule from cron.jobs')).rows, [{ schedule: '* * * * *' }]);
    assert.deepEqual((await db.query(`
      select has_function_privilege('authenticated', 'viewstate_circle.wake_delivery_worker()', 'execute') as allowed
    `)).rows, [{ allowed: false }]);

    await db.exec(`
      update vault.decrypted_secrets set decrypted_secret='https://wrong.example.test'
      where name='circle_worker_url';
      insert into viewstate_circle.change_queue values ('00000000-0000-4000-8000-000000000002');
    `);
    assert.deepEqual((await db.query('select count(*)::int as queued from viewstate_circle.change_queue')).rows, [{ queued: 2 }]);
    assert.deepEqual((await db.query('select count(*)::int as sent from net.requests')).rows, [{ sent: 1 }]);
  } finally {
    await db.close();
  }
});
