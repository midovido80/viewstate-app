import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, User } from '@supabase/supabase-js';
import { createGoogleAccountService, verifiedGoogleIdentity, type GoogleAccountPort, type GoogleAccountBrowser } from '../services/googleAccountService.ts';
import { createClient } from '@supabase/supabase-js';
import { readAccountCallback } from '../services/googleAccountContract.ts';

const A = '179f829a-eb0d-44ad-8e64-e64a87900c41';
const B = '29f45c92-1f5e-472b-b59c-06f24ba60eba';
const now = 1800000000000;
const callback = 'https://app.example.test/auth/callback';
function user(id = A): User {
  return { id, role: 'authenticated', aud: 'authenticated', email: 'fixture@example.test', email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', app_metadata: {}, user_metadata: {}, identities: [{ provider: 'google' }] } as User;
}
function session(value = user()): Session { return { user: value, expires_at: now / 1000 + 3600, access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600 }; }
function harness() {
  let current: Session | null = session(), serverUser: User | null = user();
  let serverFailure = false, signOutFailure = false;
  let exchanges = 0, userReads = 0;
  const listeners = new Set<(event: string, value: Session | null) => void>();
  const rows = new Map<string, Record<string, unknown>>();
  let upserted: Record<string, unknown> | undefined;
  const port = {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      getUser: async (token: string) => { userReads++; assert.equal(token, 'fixture-token'); return { data: { user: serverUser }, error: serverFailure ? new Error('revoked') : null }; },
      signInWithOAuth: async (options: unknown) => { assert.deepEqual(options, { provider: 'google', options: { redirectTo: callback, skipBrowserRedirect: true, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } } }); return { data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null }; },
      exchangeCodeForSession: async (code: string, options: unknown) => { exchanges++; assert.equal(code, 'fixture-code'); assert.deepEqual(options, { flowId: 'fixture_flow_123' }); return { data: { session: current }, error: null }; },
      signOut: async () => ({ error: signOutFailure ? new Error('network') : null }),
      onAuthStateChange: (listener: (event: string, value: Session | null) => void) => { listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
    },
    from: (table: string) => {
      assert.equal(table, 'user_profiles');
      return {
        select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }) }) }),
        upsert: (value: Record<string, unknown>) => { upserted = value; rows.set(String(value.user_id), value); return { select: () => ({ single: async () => ({ data: value, error: null }) }) }; },
      };
    },
  } as unknown as GoogleAccountPort;
  const browser: GoogleAccountBrowser = { callback, open: async () => ({ type: 'success', url: `${callback}?code=fixture-code&sb_flow_id=fixture_flow_123` }) };
  return {
    port, browser, rows, listeners,
    setCurrent(value: Session | null) { current = value; }, setServer(value: User | null) { serverUser = value; },
    failServer() { serverFailure = true; }, failSignOut() { signOutFailure = true; },
    emit(event: string, value: Session | null) { for (const listener of [...listeners]) listener(event, value); },
    get exchanges() { return exchanges; }, get userReads() { return userReads; }, get upserted() { return upserted; },
    service() { return createGoogleAccountService(port, browser, () => now); },
  };
}

test('a stored session is never identity proof; verify its exact token on the server', async () => {
  const h = harness(), service = h.service();
  assert.equal((await service.readVerifiedAccount())?.userId, A);
  assert.equal(h.userReads, 1);
  h.failServer();
  await assert.rejects(service.readVerifiedAccount(), /SESSION_VERIFICATION_FAILED/);
});
test('missing sessions stay signed out; unverified accounts cannot become scopes', async () => {
  const h = harness(), service = h.service(); h.setCurrent(null);
  assert.equal(await service.readVerifiedAccount(), null);
  assert.equal(h.userReads, 0);
  await assert.rejects(service.openScope(() => {}), /SIGN_IN_REQUIRED/);
});
test('reject non-Google, anonymous, unconfirmed, expired and mismatched server identities', () => {
  for (const invalid of [{ ...user(), identities: [] }, { ...user(), role: 'anon' }, { ...user(), email_confirmed_at: undefined }, { ...user(), is_anonymous: true }, user(B), { ...user(), identities: [], user_metadata: { provider: 'google', verified: true, user_id: A } }]) {
    assert.throws(() => verifiedGoogleIdentity(session(), invalid, now), /ACCOUNT_NOT_VERIFIED/);
  }
  assert.throws(() => verifiedGoogleIdentity({ ...session(), expires_at: now / 1000 }, user(), now), /ACCOUNT_NOT_VERIFIED/);
});
test('Google uses PKCE exchange with the pinned SDK flow ID and then server verification', async () => {
  const h = harness(); const result = await h.service().signIn();
  assert.equal(result.type, 'signed_in');
  assert.equal(h.exchanges, 1); assert.equal(h.userReads, 1);
});
test('cancelled login neither exchanges a code nor fabricates a verified account', async () => {
  const h = harness(); h.browser.open = async () => ({ type: 'cancelled' });
  assert.deepEqual(await h.service().signIn(), { type: 'cancelled' });
  assert.equal(h.exchanges, 0); assert.equal(h.userReads, 0);
});
test('foreign and implicit-token callbacks are rejected before reaching the auth server', async () => {
  const h = harness(), service = h.service();
  await assert.rejects(service.completeCallback('https://evil.test/auth/callback?code=fixture-code&sb_flow_id=fixture_flow_123'), /INVALID_AUTH_CALLBACK/);
  await assert.rejects(service.completeCallback(`${callback}#access_token=fixture-token`), /INVALID_AUTH_CALLBACK/);
  assert.equal(h.exchanges, 0);
});
test('repeated presses cannot start two simultaneous Google logins', async () => {
  const h = harness(); let resolve!: (value: { type: 'cancelled' }) => void;
  h.browser.open = () => new Promise(done => { resolve = done; });
  const service = h.service(), first = service.signIn();
  await new Promise(done => setImmediate(done));
  await assert.rejects(service.signIn(), /SIGN_IN_IN_PROGRESS/);
  resolve({ type: 'cancelled' }); await first;
  h.browser.open = async () => ({ type: 'cancelled' });
  assert.equal((await service.signIn()).type, 'cancelled');
});

test('a sign-out while the Google browser is open cancels its late callback before exchange', async () => {
  const h = harness(); let finish!: (result: { type: 'success'; url: string }) => void;
  h.browser.open = () => new Promise(resolve => { finish = resolve; });
  const service = h.service(), login = service.signIn();
  await new Promise(done => setImmediate(done));
  await service.signOut();
  finish({ type: 'success', url: `${callback}?code=fixture-code&sb_flow_id=fixture_flow_123` });
  await assert.rejects(login, /ACCOUNT_CHANGED/);
  assert.equal(h.exchanges, 0);
});
test('profile owner is taken from server identity, never a supplied owner ID', async () => {
  const h = harness();
  const saved = await h.service().saveProfile({ display_name: ' Ahmed ', phone: '+965 5555 0101', company: '', classification: 'broker', other_classification: '', user_id: B } as never);
  assert.equal(saved.user_id, A); assert.equal(h.upserted?.user_id, A); assert.equal(saved.display_name, 'Ahmed');
  assert.equal((await h.service().readProfile())?.user_id, A);
});
test('required profile validation fails before any cloud row is written', async () => {
  const h = harness();
  await assert.rejects(h.service().saveProfile({ display_name: '', phone: '', company: '', classification: 'other', other_classification: '' }), /PROFILE_INCOMPLETE/);
  assert.equal(h.rows.size, 0);
});
test('account switching revokes local data access immediately and disposes subscriptions', async () => {
  const h = harness(); let revoked = 0;
  const lease = await h.service().openScope(() => { revoked++; });
  lease.scope.assertActive();
  h.emit('SIGNED_IN', session(user(B)));
  assert.throws(lease.scope.assertActive, /ACCOUNT_SCOPE_CLOSED/);
  assert.equal(revoked, 1); assert.equal(h.listeners.size, 0);
  lease.close(); assert.equal(revoked, 1);
});
test('even a failed remote sign-out revokes active local data leases first', async () => {
  const h = harness(), service = h.service(); let revoked = 0;
  const lease = await service.openScope(() => { revoked++; });
  h.failSignOut();
  const pending = service.signOut();
  assert.throws(lease.scope.assertActive, /ACCOUNT_SCOPE_CLOSED/);
  await assert.rejects(pending, /SIGN_OUT_FAILED/);
  assert.equal(revoked, 1); assert.equal(h.listeners.size, 0);
});
test('dispose closes outstanding scopes and does not leave a session timer behind', async () => {
  const h = harness(), service = h.service(); let revoked = 0;
  const lease = await service.openScope(() => { revoked++; }); service.dispose();
  assert.throws(lease.scope.assertActive, /ACCOUNT_SCOPE_CLOSED/);
  assert.equal(revoked, 1); assert.equal(h.listeners.size, 0);
});

test('the actual pinned SDK generates S256 PKCE and a callback compatible with our strict parser', async () => {
  const values = new Map<string, string>();
  const client = createClient('https://fixture.supabase.co', 'sb_publishable_fixture', {
    auth: {
      flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false,
      storage: { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } },
    },
  });
  try {
    const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback, skipBrowserRedirect: true, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } } });
    assert.equal(error, null);
    const url = new URL(data.url!);
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    const redirect = new URL(url.searchParams.get('redirect_to')!);
    assert.ok(data.flowId);
    // Callback flow IDs are an SDK experimental opt-in, deliberately not enabled.
    // Native returns use data.flowId; one web flow per sessionStorage uses SDK PKCE storage.
    assert.equal(redirect.searchParams.get('sb_flow_id'), null);
    redirect.searchParams.set('code', 'fixture-code');
    assert.deepEqual(readAccountCallback(redirect.href, callback), { code: 'fixture-code' });
    assert.ok([...values.keys()].some(key => key.includes('code-verifier')));
  } finally { client.auth.stopAutoRefresh(); }
});

test('token refresh verifies outside the SDK callback and cannot keep a rejected identity active', async () => {
  const h = harness(), service = h.service();
  let revoked = 0;
  const lease = await service.openScope(() => { revoked++; });
  try {
    const before = h.userReads;
    h.emit('TOKEN_REFRESHED', session());
    assert.equal(h.userReads, before, 'never request Auth while its event callback holds the SDK lock');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(h.userReads > before); lease.scope.assertActive();
    h.failServer(); h.emit('TOKEN_REFRESHED', session());
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(revoked, 1); assert.throws(lease.scope.assertActive, /ACCOUNT_SCOPE_CLOSED/);
  } finally { lease.close(); service.dispose(); }
});
