import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { assertAccountId, createAccountScope } from './accountScope';
import { readAccountCallback, validateUserContactProfile, type UserContactProfile } from './googleAccountContract';

export interface VerifiedGoogleAccount { userId: string; email: string; expiresAt: number }
export interface GoogleAccountBrowser {
  readonly callback: string;
  open(url: string): Promise<{ type: 'redirecting' | 'cancelled' } | { type: 'success'; url: string }>;
}
type AuthPort = Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut' | 'onAuthStateChange'>;
export interface GoogleAccountPort { auth: AuthPort; from: SupabaseClient['from'] }

/** This assertion is valid ONLY for the User returned by server-side auth.getUser(). */
export function verifiedGoogleIdentity(session: Session, user: User, now: number): VerifiedGoogleAccount {
  assertAccountId(user.id);
  if (user.id !== session.user.id || user.is_anonymous || user.role !== 'authenticated'
    || !user.identities?.some(identity => identity.provider === 'google')
    || !user.email || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))
    || !session.expires_at || session.expires_at * 1000 <= now) throw new Error('ACCOUNT_NOT_VERIFIED');
  return { userId: user.id.toLowerCase(), email: user.email, expiresAt: session.expires_at * 1000 };
}

/** No implicit-token login, password, fake OTP, editable owner claim or public profile. */
export function createGoogleAccountService(client: GoogleAccountPort, browser: GoogleAccountBrowser, now = Date.now) {
  let pendingLogin = false;
  let epoch = 0;
  let disposed = false;
  const activeScopes = new Set<() => void>();
  const assertEpoch = (expected: number) => { if (disposed || expected !== epoch) throw new Error('ACCOUNT_CHANGED'); };
  const readVerifiedAccount = async (): Promise<VerifiedGoogleAccount | null> => {
    const expected = epoch; assertEpoch(expected);
    const sessionResult = await client.auth.getSession();
    assertEpoch(expected);
    if (sessionResult.error) throw new Error('SESSION_READ_FAILED');
    const session = sessionResult.data.session;
    if (!session) return null;
    // The locally stored session supplies a token, never proof of identity.
    const { data, error } = await client.auth.getUser(session.access_token);
    assertEpoch(expected);
    if (error || !data.user) throw new Error('SESSION_VERIFICATION_FAILED');
    const current = await client.auth.getSession();
    assertEpoch(expected);
    if (current.error || current.data.session?.user.id !== session.user.id) throw new Error('ACCOUNT_CHANGED');
    return verifiedGoogleIdentity(session, data.user, now());
  };
  const requireAccount = async () => {
    const account = await readVerifiedAccount();
    if (!account) throw new Error('SIGN_IN_REQUIRED');
    return account;
  };
  const completeCallback = async (url: string, expectedFlowId?: string) => {
    const expected = epoch; assertEpoch(expected);
    const { code, flowId } = readAccountCallback(url, browser.callback);
    if (expectedFlowId && flowId && expectedFlowId !== flowId) throw new Error('PKCE_FLOW_MISMATCH');
    const selectedFlow = expectedFlowId ?? flowId;
    const { error } = await client.auth.exchangeCodeForSession(code, selectedFlow ? { flowId: selectedFlow } : undefined);
    if (disposed || expected !== epoch) {
      await client.auth.signOut({ scope: 'local' });
      throw new Error('ACCOUNT_CHANGED');
    }
    if (error) throw new Error('CODE_EXCHANGE_FAILED');
    return requireAccount();
  };
  return {
    readVerifiedAccount,
    completeCallback,
    async signIn() {
      const expected = epoch; assertEpoch(expected);
      if (pendingLogin) throw new Error('SIGN_IN_IN_PROGRESS');
      pendingLogin = true;
      try {
        const { data, error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: browser.callback, skipBrowserRedirect: true, scopes: 'openid email profile' },
        });
        assertEpoch(expected);
        if (error || !data.url) throw new Error('GOOGLE_PROVIDER_UNAVAILABLE');
        const result = await browser.open(data.url);
        assertEpoch(expected);
        if (result.type !== 'success') return result;
        return { type: 'signed_in' as const, account: await completeCallback(result.url, data.flowId ?? undefined) };
      } finally { pendingLogin = false; }
    },
    /** Acquire a lease only after online verification. Consumers must unmount on revoke. */
    async openScope(onRevoked: () => void) {
      const account = await requireAccount();
      const scope = createAccountScope(account.userId);
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => undefined as void;
      const dispose = () => {
        if (closed) return false;
        closed = true; scope.revoke();
        if (timer) clearTimeout(timer);
        unsubscribe(); activeScopes.delete(revoke);
        return true;
      };
      const revoke = () => { if (dispose()) onRevoked(); };
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // SDK event callbacks must not make awaited Supabase requests (auth lock).
        if (event === 'SIGNED_OUT' || !session || session.user.id.toLowerCase() !== account.userId) revoke();
      });
      unsubscribe = () => data.subscription.unsubscribe();
      timer = setTimeout(revoke, Math.min(2147483647, Math.max(0, account.expiresAt - now())));
      if (closed) { clearTimeout(timer); unsubscribe(); throw new Error('ACCOUNT_CHANGED'); }
      activeScopes.add(revoke);
      // Closes the subscribe-after-verify race when another tab/account changed.
      try {
        const latest = await requireAccount();
        if (latest.userId !== account.userId) { revoke(); throw new Error('ACCOUNT_CHANGED'); }
        scope.assertActive();
      } catch (error) { revoke(); throw error; }
      return { account, scope, close() { dispose(); } };
    },
    async readProfile(): Promise<UserContactProfile | null> {
      const account = await requireAccount();
      const { data, error } = await client.from('user_profiles').select('user_id,display_name,phone,company,classification,other_classification').eq('user_id', account.userId).maybeSingle();
      if (error) throw new Error('PROFILE_READ_FAILED');
      if ((await requireAccount()).userId !== account.userId) throw new Error('ACCOUNT_CHANGED');
      if (!data) return null;
      if (data.user_id !== account.userId) throw new Error('PROFILE_OWNER_MISMATCH');
      return validateUserContactProfile(account.userId, data);
    },
    async saveProfile(value: Omit<UserContactProfile, 'user_id'>): Promise<UserContactProfile> {
      const account = await requireAccount();
      const profile = validateUserContactProfile(account.userId, value);
      const { data, error } = await client.from('user_profiles').upsert(profile, { onConflict: 'user_id' })
        .select('user_id,display_name,phone,company,classification,other_classification').single();
      if (error || !data) throw new Error('PROFILE_SAVE_FAILED');
      if ((await requireAccount()).userId !== account.userId) throw new Error('ACCOUNT_CHANGED');
      if (data.user_id !== account.userId) throw new Error('PROFILE_OWNER_MISMATCH');
      const stored = validateUserContactProfile(account.userId, data);
      if (JSON.stringify(stored) !== JSON.stringify(profile)) throw new Error('PROFILE_READBACK_MISMATCH');
      return stored;
    },
    async signOut() {
      epoch++;
      // Close local data access synchronously, even if remote sign-out later fails.
      for (const revoke of [...activeScopes]) revoke();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('SIGN_OUT_FAILED');
    },
    dispose() { disposed = true; epoch++; for (const revoke of [...activeScopes]) revoke(); },
  };
}
