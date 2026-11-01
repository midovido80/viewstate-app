import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import {
  ACCOUNT_STORAGE_KEY, appendFeedback, createAccountRepository, decodeAccountFoundation,
  fictionalSharePreview, initialAccountFoundation, validateLocalProfile,
} from '../services/accountFoundation.ts';
import { accountProvider } from '../services/accountProvider.ts';

function memoryStorage() {
  const values = new Map<string, string>([['founder-properties', 'unchanged'], ['founder-people', 'unchanged']]);
  const writes: string[] = [];
  return { values, writes, getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { writes.push(key); values.set(key, value); } };
}
test('account defaults are device local, sensitive sharing and notification delivery opt in only', () => {
  const first = initialAccountFoundation();
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.sharing, { source: false, location: false, media: true, notes: false });
  assert.deepEqual(first.notifications, { enabled: false, followups: false, matches: false, marketing: false });
  first.sharing.source = true;
  assert.equal(initialAccountFoundation().sharing.source, false);
});
test('profile validates a required name, bounds and safe inline local image', () => {
  assert.throws(() => validateLocalProfile({ name: ' ', company: '', photo: '' }));
  assert.throws(() => validateLocalProfile({ name: 'x'.repeat(101), company: '', photo: '' }));
  assert.throws(() => validateLocalProfile({ name: 'Name', company: '', photo: 'https://tracking.invalid/photo' }));
  assert.deepEqual(validateLocalProfile({ name: ' Name ', company: ' Office ', photo: '' }),
    { name: 'Name', company: 'Office', photo: '' });
});
test('versioned local settings/profile, language and choices roundtrip across repository instances', async () => {
  const storage = memoryStorage();
  const repository = createAccountRepository(storage);
  await repository.load();
  const saved = await repository.update(s => ({
    ...s, profile: { name: 'Fictional profile', company: 'Fictional office', photo: '' },
    language: 'ar', sharing: { ...s.sharing, source: true },
    reducedMotion: true, notifications: { ...s.notifications, matches: true },
  }));
  const reopened = await createAccountRepository(storage).load();
  assert.deepEqual(reopened, saved);
  assert.deepEqual([...storage.values.keys()].sort(), [ACCOUNT_STORAGE_KEY, 'founder-people', 'founder-properties'].sort());
  assert.equal(storage.values.get('founder-properties'), 'unchanged');
  assert.ok(storage.writes.every(key => key === ACCOUNT_STORAGE_KEY));
});
test('queued independent preference updates do not lose earlier changes', async () => {
  const repository = createAccountRepository(memoryStorage());
  await repository.load();
  const [, final] = await Promise.all([
    repository.update(s => ({ ...s, reducedMotion: true })),
    repository.update(s => ({ ...s, sharing: { ...s.sharing, notes: true } })),
  ]);
  assert.equal(final.reducedMotion, true);
  assert.equal(final.sharing.notes, true);
});
test('malformed, future-version and nonboolean settings fail closed without writes', async () => {
  for (const raw of ['not-json', '{"schemaVersion":2}', JSON.stringify({ ...initialAccountFoundation(), sharing: { source: 'yes' } })]) {
    const storage = memoryStorage();
    storage.values.set(ACCOUNT_STORAGE_KEY, raw);
    const repository = createAccountRepository(storage);
    await assert.rejects(repository.load());
    await assert.rejects(repository.update(s => s), /not ready/);
    assert.equal(storage.values.get(ACCOUNT_STORAGE_KEY), raw);
    assert.equal(storage.writes.length, 0);
  }
});
test('failed settings write does not report new state and later saves can recover', async () => {
  const storage = memoryStorage();
  let fail = true;
  const repository = createAccountRepository({ ...storage, setItem: async (key, value) => {
    if (fail) throw new Error('quota');
    return storage.setItem(key, value);
  } });
  await repository.load();
  await assert.rejects(repository.update(s => ({ ...s, reducedMotion: true })), /quota/);
  fail = false;
  const final = await repository.update(s => ({ ...s, sharing: { ...s.sharing, location: true } }));
  assert.equal(final.reducedMotion, false);
  assert.equal(final.sharing.location, true);
});
test('a failed reload invalidates the old settings writer instead of overwriting opaque data', async () => {
  const storage = memoryStorage();
  const repository = createAccountRepository(storage);
  await repository.load();
  storage.values.set(ACCOUNT_STORAGE_KEY, '{"schemaVersion":2}');
  await assert.rejects(repository.load());
  await assert.rejects(repository.update(s => ({ ...s, reducedMotion: true })), /not ready/);
  assert.equal(storage.values.get(ACCOUNT_STORAGE_KEY), '{"schemaVersion":2}');
});
test('feedback drafts validate, persist NOT SENT and can be removed without any network', async () => {
  assert.throws(() => appendFeedback(initialAccountFoundation(), '', 'message', 'draft', 'date'));
  const storage = memoryStorage();
  const repository = createAccountRepository(storage);
  await repository.load();
  const saved = await repository.update(s => appendFeedback(s, 'Issue', 'Fictional details', 'draft-1', '2026-10-27'));
  assert.equal(saved.feedback[0].status, 'not_sent');
  assert.equal((await createAccountRepository(storage).load()).feedback.length, 1);
  const cleared = await repository.update(s => ({ ...s, feedback: [] }));
  assert.deepEqual(cleared.feedback, []);
});
test('fictional share preview precisely reflects this share only without mutating defaults', () => {
  const defaults = initialAccountFoundation().sharing;
  const oneShare = { ...defaults, notes: true };
  const english = fictionalSharePreview('en', oneShare).join('\n');
  assert.match(english, /Fictional example only/);
  assert.match(english, /Fictional internal note/);
  assert.doesNotMatch(english, /Source:|Precise location:/);
  assert.equal(defaults.notes, false);
  const arabic = fictionalSharePreview('ar', { source: true, location: true, media: false, notes: false }).join('\n');
  assert.match(arabic, /المصدر: مالك وهمي/);
  assert.match(arabic, /الموقع الدقيق/);
  assert.doesNotMatch(arabic, /مثال مرفقات|ملاحظة داخلية/);
});
test('clear local profile/settings preserves unrelated data and language', async () => {
  const storage = memoryStorage();
  const repository = createAccountRepository(storage);
  await repository.load();
  await repository.update(s => ({ ...s, language: 'ar', profile: { name: 'Local', company: '', photo: '' } }));
  const reset = await repository.update(s => ({ ...initialAccountFoundation(), language: s.language }));
  assert.equal(reset.language, 'ar');
  assert.equal(reset.profile.name, '');
  assert.equal(storage.values.get('founder-properties'), 'unchanged');
  assert.equal(storage.values.get('founder-people'), 'unchanged');
});
test('unconfigured authentication cannot mint a session, verify OTP or link identities', async () => {
  assert.equal(accountProvider.configured, false);
  assert.deepEqual(accountProvider.methods(), []);
  assert.equal(await accountProvider.session(), null);
  for (const method of ['phone', 'google', 'apple'] as const) {
    await assert.rejects(accountProvider.signIn(method), /unavailable/);
    await assert.rejects(accountProvider.link(method), /unavailable/);
  }
});
test('permissions only inspect OS status and property sharing remains independent', async () => {
  const device = await readFile(new URL('../services/accountDevice.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(device, /request\w*PermissionsAsync\s*\(/);
  const execution = await readFile(new URL('../services/propertyShareExecution.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(execution, /accountFoundation|fictionalSharePreview/);
});
test('account modals dismiss without web fade remnants and respect reduced motion', async () => {
  const ui = await readFile(new URL('../components/account/ui.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Platform\.OS === 'web' \|\| state\.reducedMotion \? 'none' : 'fade'/);
  assert.match(ui, /onRequestClose=\{onClose\}/);
  assert.match(ui, /onClose=\{busy \? \(\) => undefined : onCancel\}/);
});
test('onboarding never collects a fixed OTP or pretends to verify a provider', async () => {
  const ui = await readFile(new URL('../components/account/OnboardingSections.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /123456|completeAuth|verifyCode|TextInput|sendCode|providerLogin/);
  assert.match(ui, /Real sign-in is not available yet/);
  assert.match(ui, /Continue without sign-in/);
});
test('profile has explicit native Back protection, dirty-gesture guard and deep-link fallback', async () => {
  const profile = await readFile(new URL('../components/account/ProfileSection.tsx', import.meta.url), 'utf8');
  assert.match(profile, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(profile, /gestureEnabled: !dirty/);
  assert.match(profile, /onBack=\{back\}/);
  assert.match(profile, /router\.canGoBack\(\)/);
  assert.match(profile, /router\.replace\('\/\(tabs\)\/more'/);
  const ui = await readFile(new URL('../components/account/ui.tsx', import.meta.url), 'utf8');
  assert.match(ui, /KeyboardAvoidingView/);
});
test('decoder rejects future versions and overlarge profile photos', () => {
  assert.throws(() => decodeAccountFoundation(JSON.stringify({ ...initialAccountFoundation(), schemaVersion: 999 })));
  assert.throws(() => decodeAccountFoundation(JSON.stringify({ ...initialAccountFoundation(), profile: { name: 'A', company: '', photo: 'x'.repeat(960001) } })));
});
