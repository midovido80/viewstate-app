import { matchCircleSnapshot, type CircleSnapshot } from './engine.ts';

type PushClaim = { id: string; token: string; attempt: number };
type PushResult = 'accepted' | 'retry' | 'unregistered' | 'permanent';

async function sendPush(token: string, accessToken?: string): Promise<PushResult> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        to: token,
        title: 'ViewState',
        body: 'توجد مطابقة جديدة في دائرة الثقة · New trust circle match',
        channelId: 'trust-circle',
        data: { kind: 'trust-circle-match' },
      }),
    });
    if (!response.ok) return response.status === 400 || response.status === 413 ? 'permanent' : 'retry';
    const { data } = await response.json();
    if (data?.status === 'ok') return 'accepted';
    if (data?.details?.error === 'DeviceNotRegistered') return 'unregistered';
    if (data?.details?.error === 'MessageTooBig') return 'permanent';
    return 'retry';
  } catch {
    return 'retry';
  }
}

Deno.serve(async request => {
  const secret = Deno.env.get('CIRCLE_WORKER_SECRET');
  if (request.method !== 'POST' || !secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 403 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response(null, { status: 503 });

  async function rpc<T>(name: string, body = {}): Promise<T> {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('CIRCLE_WORKER_RPC_FAILED');
    const value = await response.text();
    return (value ? JSON.parse(value) : null) as T;
  }

  const started = performance.now();
  let evaluated = 0;
  let accepted = 0;
  let errors = 0;
  try {
    for (const circle of await rpc<string[]>('vs_circle_worker_jobs')) {
      try {
        const snapshot = await rpc<CircleSnapshot>('vs_circle_worker_snapshot', { p_circle: circle });
        const pairs = matchCircleSnapshot(snapshot);
        if (await rpc<boolean>('vs_circle_worker_commit', {
          p_circle: circle, p_revision: snapshot.revision, p_pairs: pairs,
        })) evaluated++;
      } catch {
        errors++;
      }
    }
    const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const claims = await rpc<PushClaim[]>('vs_circle_push_claim');
    for (let offset = 0; offset < claims.length; offset += 5) {
      const batch = await Promise.allSettled(claims.slice(offset, offset + 5).map(async claim => {
        const result = await sendPush(claim.token, expoToken);
        await rpc('vs_circle_push_result', {
          p_id: claim.id, p_attempt: claim.attempt, p_status: result, p_token: claim.token,
        });
        return result;
      }));
      for (const outcome of batch) {
        if (outcome.status === 'fulfilled' && outcome.value === 'accepted') accepted++;
        else errors++;
      }
    }
    return Response.json({ evaluated, accepted, errors, durationMs: Math.round(performance.now() - started) }, { status: errors ? 503 : 200 });
  } catch {
    return Response.json({ evaluated, accepted, errors: errors + 1 }, { status: 503 });
  }
});
