import assert from 'node:assert/strict';
import test from 'node:test';

test('worker gates calls and records separate match and cooperation delivery attempts', async () => {
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
    if (path === 'vs_circle_worker_jobs') return Response.json([]);
    if (path === 'vs_circle_push_claim') return Response.json([{ id: 'match', token: 'match-token', attempt: 1 }]);
    if (path === 'vs_circle_cooperation_push_claim') return Response.json([{ id: 'coop', token: 'coop-token', attempt: 2 }]);
    if (path === 'send') return body.to === 'match-token'
      ? Response.json({ data: { status: 'ok', id: 'ticket' } })
      : new Response(null, { status: 429 });
    return Response.json(null);
  };
  try {
    await import('../../supabase/functions/circle-match-worker/index.ts');
    const url = 'https://test.supabase.co/functions/v1/circle-match-worker';
    assert.equal((await serve(new Request(url, { method: 'POST' }))).status, 403);
    assert.deepEqual(bodies, []);
    const response = await serve(new Request(url, { method: 'POST', headers: { Authorization: 'Bearer test-secret' } }));
    assert.equal(response.status, 503);
    assert.deepEqual(bodies.filter(({ path }) => path === 'send').map(({ body }) => body.data), [
      { kind: 'trust-circle-match' },
      { kind: 'trust-circle-cooperation' },
    ]);
    assert.deepEqual(bodies.filter(({ path }) => path.endsWith('_result')).map(({ path, body }) => [path, body.p_id, body.p_attempt, body.p_status]), [
      ['vs_circle_push_result', 'match', 1, 'accepted'],
      ['vs_circle_cooperation_push_result', 'coop', 2, 'retry'],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'Deno');
  }
});
