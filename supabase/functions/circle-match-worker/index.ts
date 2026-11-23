import { matchCircleSnapshot, type CircleSnapshot } from './engine.ts';

type PushKind = 'match' | 'cooperation' | 'invite' | 'listing' | 'test' | 'app_update';
type PushClaim = { id: string; token: string; attempt: number; kind: PushKind; ticket: string | null };
type PushOutcome = { status: 'queued' | 'ticket' | 'delivered_to_provider' | 'unregistered' | 'failed'; ticket?: string; reason?: string };

const message: Record<PushKind, string> = {
  match: 'مطابقة جديدة في دائرة الثقة · New trust circle match',
  cooperation: 'تحديث تعاون في دائرة الثقة · Trust circle cooperation update',
  invite: 'دعوة جديدة لدائرة الثقة · New trust circle invitation',
  listing: 'عقار جديد في دائرة الثقة · New trust circle listing',
  test: 'إشعار تجريبي · Test notification',
  app_update: 'تحديث جديد متاح · New app update available',
};

async function deliver(claim: PushClaim, accessToken?: string, noticeId?: string): Promise<PushOutcome> {
  const pending: PushOutcome = claim.ticket ? { status: 'ticket', ticket: claim.ticket } : { status: 'queued' };
  try {
    const endpoint = claim.ticket ? 'getReceipts' : 'send';
    const response = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(claim.ticket ? { ids: [claim.ticket] } : {
        to: claim.token, title: 'ViewState', body: message[claim.kind],
        channelId: 'trust-circle-alerts', sound: 'default', priority: 'high', ttl: 3600,
        tag: `viewstate:${noticeId ?? claim.id}`,
        data: {
          kind: claim.kind === 'app_update' ? 'viewstate-app-update' : `trust-circle-${claim.kind}`,
          ...(noticeId && claim.kind !== 'app_update' ? { noticeId } : {}),
        },
      }),
    });
    if (!response.ok) return [400, 401, 403, 413].includes(response.status) ? { status: 'failed', reason: 'provider_http' } : pending;
    const { data } = await response.json();
    const result = claim.ticket ? data?.[claim.ticket] : data;
    if (result?.status === 'ok') {
      if (claim.ticket) return { status: 'delivered_to_provider' };
      if (typeof result.id === 'string' && result.id) return { status: 'ticket', ticket: result.id };
    }
    const code = result?.details?.error;
    if (code === 'DeviceNotRegistered') return { status: 'unregistered', reason: 'device_unregistered' };
    if (code === 'MessageTooBig') return { status: 'failed', reason: 'message_too_big' };
    if (code === 'InvalidCredentials') return { status: 'failed', reason: 'invalid_credentials' };
    if (code === 'MismatchSenderId') return { status: 'failed', reason: 'sender_mismatch' };
    if (claim.ticket && result?.status === 'error') return { status: 'queued' };
    return pending;
  } catch {
    return pending;
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
      redirect: 'error',
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
    if (request.headers.get('x-viewstate-operation') === 'announce-update') {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: 'INVALID_UPDATE' }, { status: 400 }); }
      if (typeof body?.group !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.group)
        || body.channel !== 'viewstate-next-pilot'
        || typeof body.runtime !== 'string' || !/^viewstate-next-android-[0-9]{1,6}$/.test(body.runtime)) {
        return Response.json({ error: 'INVALID_UPDATE' }, { status: 400 });
      }
      const queued = await rpc<number>('vs_circle_announce_update', {
        p_group: body.group, p_channel: body.channel, p_runtime: body.runtime,
      });
      // The scheduled worker delivers these rows with normal retries.
      return Response.json({ queued });
    }
    for (const job of await rpc<{ circle_id: string; claim_id: string }[]>('vs_circle_worker_jobs')) {
      const circle = job.circle_id;
      try {
        const snapshot = await rpc<CircleSnapshot>('vs_circle_worker_snapshot', { p_circle: circle });
        const pairs = matchCircleSnapshot(snapshot);
        if (await rpc<boolean>('vs_circle_worker_commit', {
          p_circle: circle, p_revision: snapshot.revision, p_pairs: pairs,
        })) {
          evaluated++;
          await rpc('vs_circle_worker_complete', { p_circle: circle, p_revision: snapshot.revision, p_claim: job.claim_id });
        }
        else await rpc('vs_circle_worker_retry', { p_circle: circle, p_claim: job.claim_id });
      } catch {
        errors++;
        try { await rpc('vs_circle_worker_retry', { p_circle: circle, p_claim: job.claim_id }); }
        catch { errors++; }
      }
    }
    const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const claims = await rpc<PushClaim[]>('vs_circle_notification_claim');
    const toSend = claims.filter(claim => !claim.ticket && claim.kind !== 'app_update').map(claim => claim.id);
    const noticeIds = toSend.length ? await rpc<Record<string, string>>('vs_circle_push_notice_ids', { p_deliveries: toSend }) : {};
    let deliveredToProvider = 0;
    let failed = 0;
    let unregistered = 0;
    for (let offset = 0; offset < claims.length; offset += 5) {
      const batch = await Promise.allSettled(claims.slice(offset, offset + 5).map(async claim => {
        const result = await deliver(claim, expoToken, noticeIds[claim.id]);
        await rpc('vs_circle_notification_result', {
          p_id: claim.id, p_attempt: claim.attempt, p_status: result.status, p_ticket: result.ticket ?? null, p_reason: result.reason ?? null,
        });
        if (!claim.ticket && result.status === 'ticket') accepted++;
        if (result.status === 'delivered_to_provider') deliveredToProvider++;
        if (result.status === 'failed') failed++;
        if (result.status === 'unregistered') unregistered++;
      }));
      errors += batch.filter(outcome => outcome.status === 'rejected').length;
    }
    return Response.json({ evaluated, accepted, deliveredToProvider, failed, unregistered, errors, durationMs: Math.round(performance.now() - started) }, { status: errors ? 503 : 200 });
  } catch {
    return Response.json({ evaluated, accepted, errors: errors + 1 }, { status: 503 });
  }
});
