import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountScope, AccountScopeClosedError, type AccountStorage } from '../services/accountScope.ts';
import { AccountProfileValidationError, validateUserContactProfile, readAccountCallback, webAccountCallback, NATIVE_ACCOUNT_CALLBACK } from '../services/googleAccountContract.ts';
import { createSecureSessionStorage } from '../services/secureSessionStorage.ts';

const A = '179f829a-eb0d-44ad-8e64-e64a87900c41';
const B = '29f45c92-1f5e-472b-b59c-06f24ba60eba';
function memory() {
  const values = new Map<string, string>();
  const storage: AccountStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  return { values, storage };
}

test('each data category stays isolated; old unowned trial data is never adopted', async () => {
  const { values, storage } = memory();
  const scopeA = createAccountScope(A), scopeB = createAccountScope(B);
  const a = scopeA.storage(storage), b = scopeB.storage(storage);
  for (const key of ['@viewstate_properties', '@viewstate_people_v1', '@viewstate_requirements', '@viewstate_property_draft', '@viewstate_property_update_operation_v1', '@viewstate_account_foundation_v1', '@viewstate_daily_assistant_v1', '@viewstate_match_notifications_v1']) {
    values.set(key, 'legacy unowned');
    assert.equal(await a.getItem(key), null);
    await a.setItem(key, `A:${key}`);
    assert.equal(await b.getItem(key), null);
    await b.setItem(key, `B:${key}`);
    assert.equal(await a.getItem(key), `A:${key}`);
    await a.removeItem(key);
    assert.equal(await b.getItem(key), `B:${key}`);
    assert.equal(values.get(key), 'legacy unowned');
  }
  assert.notEqual(scopeA.databaseName, scopeB.databaseName);
  assert.notEqual(scopeA.mediaDatabaseName, scopeB.mediaDatabaseName);
  assert.notEqual(scopeA.mediaDirectory, scopeB.mediaDirectory);
});

test('an in-flight write cannot move from A to B after sign-out', async () => {
  const data = memory();
  let release!: () => void;
  const paused: AccountStorage = { ...data.storage, setItem: async (key, value) => {
    await new Promise<void>(resolve => { release = resolve; });
    await data.storage.setItem(key, value);
  } };
  const scopeA = createAccountScope(A), a = scopeA.storage(paused);
  const pending = a.setItem('draft', 'A draft');
  scopeA.revoke();
  const b = createAccountScope(B).storage(data.storage);
  await b.setItem('draft', 'B draft');
  release();
  await assert.rejects(pending, AccountScopeClosedError);
  assert.equal(await b.getItem('draft'), 'B draft');
  await assert.rejects(a.setItem('later', 'forbidden'), AccountScopeClosedError);
  await assert.rejects(a.getItem('draft'), AccountScopeClosedError);
});

test('revocation prevents stale repository results and even previously captured methods', async () => {
  const scope = createAccountScope(A);
  let finish!: (value: string) => void;
  const guarded = scope.guard({ read: () => new Promise<string>(resolve => { finish = resolve; }), count: () => 1 });
  const captured = guarded.count;
  const pending = guarded.read();
  scope.revoke(); finish('private A data');
  await assert.rejects(pending, AccountScopeClosedError);
  assert.throws(captured, AccountScopeClosedError);
});

test('scope owners reject path injection and normalize UUID casing', () => {
  for (const id of ['', '../other', `${A}:other`, 'profile-name']) assert.throws(() => createAccountScope(id));
  assert.equal(createAccountScope(A.toUpperCase()).databaseName, createAccountScope(A).databaseName);
});

const profile = { display_name: ' Ahmed ', phone: '+965 5555 0101', company: '', classification: 'broker' as const, other_classification: '' };
test('profile requires name, real phone digits and classification; owner comes from verified identity', () => {
  assert.equal(validateUserContactProfile(A, { ...profile, user_id: B } as typeof profile).user_id, A);
  assert.equal(validateUserContactProfile(A, profile).display_name, 'Ahmed');
  for (const change of [{ display_name: ' ' }, { phone: '------' }, { phone: '' }, { phone: '+1234567890123456' }, { classification: 'admin' }, { classification: 'other', other_classification: '' }]) {
    assert.throws(() => validateUserContactProfile(A, { ...profile, ...change } as typeof profile), AccountProfileValidationError);
  }
  assert.equal(validateUserContactProfile(A, { ...profile, other_classification: 'ignored' }).other_classification, '');
});

test('PKCE callback accepts only the exact native or HTTPS web destination and one code', () => {
  const callback = webAccountCallback('https://app.example.test');
  assert.equal(callback, 'https://app.example.test/auth/callback');
  assert.deepEqual(readAccountCallback(`${callback}?code=one&sb_flow_id=flow12345`, callback), { code: 'one', flowId: 'flow12345' });
  assert.deepEqual(readAccountCallback(`${callback}?code=one`, callback), { code: 'one' });
  assert.deepEqual(readAccountCallback(`${NATIVE_ACCOUNT_CALLBACK}?code=two&sb_flow_id=flow12345`, NATIVE_ACCOUNT_CALLBACK), { code: 'two', flowId: 'flow12345' });
  for (const url of ['https://evil.test/auth/callback?code=one', 'https://app.example.test/auth/other?code=one', `${callback}?code=one&code=two`, `${callback}?code=`, `${callback}#access_token=secret`, `${callback}?error=denied`, `${callback}?code=one&user_id=${B}`, `${callback}?code=one&redirect_to=https://evil.test`]) {
    assert.throws(() => readAccountCallback(url, callback));
  }
  assert.throws(() => readAccountCallback('evil://auth/callback?code=two', NATIVE_ACCOUNT_CALLBACK));
  for (const suffix of ['code=one&sb_flow_id=short', 'code=one&sb_flow_id=flow12345&sb_flow_id=flow54321', 'code=one&sb_flow_id=../other', 'code=one&sb_flow_id=flow12345&user_id=injected']) assert.throws(() => readAccountCallback(`${callback}?${suffix}`, callback));
  for (const origin of ['http://app.example.test', 'https://app.example.test/path', 'https://user:pass@app.example.test', 'https://app.example.test/?x=1']) assert.throws(() => webAccountCallback(origin));
});

test('secure sessions round-trip long Arabic/emoji profiles without oversized or split chunks', async () => {
  const { values, storage } = memory(); let generation = 0;
  const secure = createSecureSessionStorage(storage, () => `generation-${++generation}`);
  const session = JSON.stringify({ access_token: 'x'.repeat(4000), display_name: 'أحمد 🏠'.repeat(500) });
  await secure.setItem('sb-test-auth-token', session);
  assert.equal(await secure.getItem('sb-test-auth-token'), session);
  for (const value of values.values()) assert.ok(Buffer.byteLength(value) < 2048);
  await secure.setItem('sb-test-auth-token', 'short replacement');
  assert.equal(await secure.getItem('sb-test-auth-token'), 'short replacement');
  assert.equal(values.size, 2);
  await secure.removeItem('sb-test-auth-token');
  assert.equal(await secure.getItem('sb-test-auth-token'), null);
  assert.equal(values.size, 0);
});

test('failed new session write preserves the old manifest and removes incomplete pieces', async () => {
  const data = memory(); let generation = 0, fail = false;
  const secure = createSecureSessionStorage({ ...data.storage, setItem: async (key, value) => {
    if (fail && key.endsWith('_2')) throw new Error('disk full');
    await data.storage.setItem(key, value);
  } }, () => `gen${++generation}`);
  await secure.setItem('token', 'old'); fail = true;
  await assert.rejects(secure.setItem('token', 'new'.repeat(2000)), /disk full/);
  assert.equal(await secure.getItem('token'), 'old');
  assert.equal(data.values.size, 2);
  fail = false; await secure.setItem('token', 'recovered');
  assert.equal(await secure.getItem('token'), 'recovered');
});

test('missing session pieces fail closed, with no fallback to unencrypted storage', async () => {
  const data = memory();
  const secure = createSecureSessionStorage(data.storage, () => 'gen');
  await secure.setItem('token', 'private');
  data.values.delete([...data.values.keys()].find(key => key.endsWith('_0'))!);
  await assert.rejects(secure.getItem('token'), /SESSION_STORAGE_DAMAGED/);
});

test('secure session reads and sign-out serialize behind pending writes', async () => {
  const data = memory(); let generation = 0;
  const secure = createSecureSessionStorage(data.storage, () => `gen${++generation}`);
  const write = secure.setItem('token', 'first');
  const remove = secure.removeItem('token');
  const read = secure.getItem('token');
  await Promise.all([write, remove]);
  assert.equal(await read, null);
  await assert.rejects(secure.setItem('token', 'x'.repeat(26000)), /SESSION_STORAGE_LIMIT/);
  await assert.rejects(secure.setItem('../token', 'x'), /INVALID_SESSION_KEY/);
});

test('explicit sign-out removes an unreadable session pointer instead of trapping the user', async () => {
  const data = memory();
  const secure = createSecureSessionStorage(data.storage, () => 'gen');
  await secure.setItem('token', 'private');
  data.values.set('vs_auth_token_manifest', '{damaged');
  await assert.rejects(secure.getItem('token'));
  await secure.removeItem('token');
  assert.equal(await secure.getItem('token'), null);
});
