import assert from 'node:assert/strict';
import test from 'node:test';

test('worker gates calls and tracks Expo tickets and receipts independently', async () => {
  let serve!: (request: Request) => Promise<Response>;
  const env = new Map([
    ['CIRCLE_WORKER_SECRET', 'test-secret'],
    ['SUPABASE_URL', 'https://test.supabase.co'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'test-role'],
  ]);
  const originalFetch = globalThis.fetch;
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (key: string) => env.get(key) }, serve: (fn: typeof serve) => { serve = fn; } },
  });
  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname.split('/').at(-1)!;
    const body = JSON.parse(String(options?.body));
    bodies.push({ path, body });
    if (path === 'vs_circle_announce_update') return Response.json(2);
    if (path === 'vs_circle_push_notice_ids') return Response.json({ match: 'match-notice' });
    if (path === 'vs_circle_worker_jobs') return Response.json([]);
    if (path === 'vs_circle_notification_claim') return Response.json([
      { id: 'match', token: 'match-token', attempt: 1, kind: 'match', ticket: null },
      { id: 'invite', token: 'invite-token', attempt: 2, kind: 'invite', ticket: 'invite-ticket' },
      { id: 'coop', token: 'coop-token', attempt: 1, kind: 'cooperation', ticket: null },
      { id: 'update', token: 'update-token', attempt: 1, kind: 'app_update', ticket: null },
    ]);
    if (path === 'getReceipts') return Response.json({ data: { 'invite-ticket': { status: 'ok' } } });
    if (path === 'send') return body.to === 'coop-token'
      ? Response.json({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } })
      : Response.json({ data: { status: 'ok', id: 'match-ticket' } });
    return Response.json(null);
  };
  try {
    await import('../../supabase/functions/circle-match-worker/index.ts');
    const url = 'https://test.supabase.co/functions/v1/circle-match-worker';
    assert.equal((await serve(new Request(url, { method: 'POST' }))).status, 403);
    assert.deepEqual(bodies, []);
    const response = await serve(new Request(url, { method: 'POST', headers: { Authorization: 'Bearer test-secret' } }));
    assert.equal(response.status, 200);
    assert.ok(bodies.filter(({ path }) => path === 'send').every(({ body }) => body.sound === 'default' && body.channelId === 'trust-circle-alerts'));
    assert.deepEqual(bodies.filter(({ path }) => path === 'send').map(({ body }) => body.data), [
      { kind: 'trust-circle-match', noticeId: 'match-notice' }, { kind: 'trust-circle-cooperation' }, { kind: 'viewstate-app-update' },
    ]);
    assert.deepEqual(bodies.filter(({ path }) => path === 'send').map(({ body }) => body.tag), [
      'viewstate:match-notice', 'viewstate:coop', 'viewstate:update',
    ]);
    assert.deepEqual(bodies.find(({ path }) => path === 'getReceipts')?.body, { ids: ['invite-ticket'] });
    assert.deepEqual(Object.fromEntries(bodies.filter(({ path }) => path === 'vs_circle_notification_result')
      .map(({ body }) => [String(body.p_id), [body.p_attempt, body.p_status, body.p_ticket]])), {
      match: [1, 'ticket', 'match-ticket'],
      invite: [2, 'delivered_to_provider', null],
      coop: [1, 'unregistered', null],
      update: [1, 'ticket', 'match-ticket'],
    });
    await serve(new Request(url, { method: 'POST', headers: { Authorization: 'Bearer test-secret' } }));
    assert.deepEqual(bodies.filter(({ path }) => path === 'send').slice(-3).map(({ body }) => body.tag), [
      'viewstate:match-notice', 'viewstate:coop', 'viewstate:update',
    ], 'ambiguous retries reuse the same Android tray identity');
    assert.ok(bodies.filter(({ path }) => path === 'send').every(({ body }) => body.collapseId === undefined));
    const announcement = await serve(new Request(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret', 'x-viewstate-operation': 'announce-update' },
      body: JSON.stringify({ group: '00000000-0000-4000-8000-000000000001', channel: 'viewstate-next-pilot', runtime: 'viewstate-next-android-1' }),
    }));
    assert.deepEqual(await announcement.json(), { queued: 2 });
    assert.equal(bodies.at(-1)?.path, 'vs_circle_announce_update');

  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'Deno');
  }
});
