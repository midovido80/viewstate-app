import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MATCH_ENGINE_VERSION, type MatchResult, type SeekerRequirement } from '@workspace/property-domain';
import type { HomeMatch } from '../services/assistantHome';
import { initialMatchNotices, reconcileMatchNotices, currentNoticeMatch, claimDueMatchNotices, decodeMatchNotices, updateNotice, isQuietTime, createMatchNoticeRepository, MATCH_NOTIFICATIONS_KEY, type MatchNoticeState } from '../services/matchNotifications';
import { viewStateTextCard, matchNoticeEvidence } from '../services/matchNoticePresentation';
const now = '2026-10-30T10:00:00.000Z';
function match(propertyId = 'p1', personId = 'client'): HomeMatch {
  const requirement: SeekerRequirement = { id: '11111111-1111-4111-8111-111111111111', seekerId: personId, purpose: 'rent', propertyType: 'apartment', preferredAreaMode: 'specific_areas', preferredAreaIds: ['salmiya'], budget: { maximum: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly', notes: '' };
  const result: MatchResult = { engineVersion: MATCH_ENGINE_VERSION, propertyId, requirementId: requirement.id, score: 95, eligible: true, qualifies: true, category: 'direct', differenceCount: 0, unknownCount: 0, priceAmount: 490, includedWeight: 60, locationRank: 1, ineligibilityReasons: [], explanations: [] };
  return { person: { id: personId, name: 'أحمد Original', classifications: ['seeker'], displayPhone: '', normalizedPhone: '', notes: '' }, requirement, result };
}
const scan = (state: MatchNoticeState, items: HomeMatch[], alerts = true) => ({ ...reconcileMatchNotices(state, items, now, alerts), revision: state.revision + 1 });
const baseline = () => scan(initialMatchNotices(), []);
test('First setup and engine upgrades silently baseline existing matches without losing retained history', () => {
  const first = scan(initialMatchNotices(), [match()]);
  assert.equal(first.entries.length, 0);
  const existing = scan(baseline(), [match()]);
  const upgraded = scan({ ...existing, engine: 'older-version' }, [match(), match('p2')]);
  assert.equal(upgraded.entries.length, 1);
  assert.equal(upgraded.engine, MATCH_ENGINE_VERSION);
});
test('New pairs generate once and survive reload, reorder, disappearance and reappearance', () => {
  const first = scan(baseline(), [match(), match('p2')]);
  assert.equal(first.entries.length, 2);
  const reload = decodeMatchNotices(JSON.stringify(first));
  const rescanned = scan(reload, [match('p2'), match()]);
  assert.deepEqual(rescanned.entries, first.entries);
  assert.equal(scan(scan(rescanned, []), [match()]).entries.length, 2);
  assert.equal(new Set(first.entries.map(n => n.id)).size, 2);
});
test('Names and notes never cause alerts; changed compared facts do, and stale notices cannot resolve to new facts', () => {
  const original = match(), initial = scan(baseline(), [original]);
  const renamed = { ...original, person: { ...original.person, name: 'Updated' }, requirement: { ...original.requirement, notes: 'new note' } };
  assert.equal(scan(initial, [renamed]).entries.length, 1);
  const changed = { ...renamed, result: { ...renamed.result, priceAmount: 495 } };
  assert.equal(scan(initial, [changed]).entries.length, 2);
  assert.equal(currentNoticeMatch(initial.entries[0], [changed]), undefined);
  assert.equal(currentNoticeMatch(initial.entries[0], [renamed])?.person.name, 'Updated');
});
test('Grouped delivery claims one batch, never repeats it, and disabled foreground alerts retain history silently', () => {
  const items = [match(), match('p2'), match('p3')], state = scan(baseline(), items);
  const first = claimDueMatchNotices(state, items, now);
  assert.equal(first.notices.length, 3);
  assert.equal(claimDueMatchNotices(first.state, items, now).notices.length, 0);
  assert.equal(first.state.entries.every(n => !n.read), true);
  const disabled = scan(baseline(), items, false);
  assert.equal(disabled.entries.length, 3);
  assert.equal(claimDueMatchNotices(disabled, items, now).notices.length, 0);
});
test('Later keeps unread history; read clears it; snooze delivers once when the foreground checks after an hour', () => {
  const items = [match()], state = scan(baseline(), items), id = state.entries[0].id;
  const later = updateNotice(state, id, 'later', new Date(now));
  assert.equal(later.entries[0].read, false);
  assert.equal(claimDueMatchNotices(later, items, now).notices.length, 0);
  const snoozed = updateNotice(later, id, 'snooze', new Date(now));
  assert.equal(claimDueMatchNotices(snoozed, items, '2026-10-30T10:59:59.000Z').notices.length, 0);
  assert.equal(claimDueMatchNotices(snoozed, items, '2026-10-30T11:00:00.000Z').notices.length, 1);
  assert.equal(updateNotice(state, id, 'read', new Date(now)).entries[0].read, true);
});
test('Quiet hours support overnight and same-day intervals in Kuwait time, with exact boundaries', () => {
  const settings = { ...initialMatchNotices().settings, quiet: true };
  assert.equal(isQuietTime(settings, new Date('2026-10-30T19:00:00Z')), true);
  assert.equal(isQuietTime(settings, new Date('2026-10-31T04:59:59Z')), true);
  assert.equal(isQuietTime(settings, new Date('2026-10-31T05:00:00Z')), false);
  assert.equal(isQuietTime({ ...settings, quiet: false }, new Date('2026-10-30T19:00:00Z')), false);
  assert.equal(isQuietTime({ ...settings, quietStart: '09:00', quietEnd: '17:00' }, new Date('2026-10-30T10:00:00Z')), true);
});
function memory(raw: string | null = null) {
  const values = new Map<string, string>(); if (raw !== null) values.set(MATCH_NOTIFICATIONS_KEY, raw);
  return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
}
test('Serialized repositories reload under the lock and cannot claim or create the same batch twice', async () => {
  const storage = memory(), one = createMatchNoticeRepository(storage), two = createMatchNoticeRepository(storage);
  await one.update(s => reconcileMatchNotices(s, [], now, true));
  await Promise.all([one.update(s => reconcileMatchNotices(s, [match()], now, true)), two.update(s => reconcileMatchNotices(s, [match()], now, true))]);
  assert.equal((await one.load()).entries.length, 1);
  const counts: number[] = [];
  await Promise.all([one, two].map(repo => repo.update(s => { const batch = claimDueMatchNotices(s, [match()], now); counts.push(batch.notices.length); return batch.state; })));
  assert.deepEqual(counts.sort(), [0, 1]);
});
test('Corrupt or future history is preserved verbatim and never replaced by empty defaults', async () => {
  for (const raw of ['broken', '{"version":9}', JSON.stringify({ ...initialMatchNotices(), settings: { sound: true, quiet: true, quietStart: '99:00', quietEnd: '08:00' } })]) {
    const storage = memory(raw), repo = createMatchNoticeRepository(storage);
    await assert.rejects(repo.load()); await assert.rejects(repo.update(s => s));
    assert.equal(storage.values.get(MATCH_NOTIFICATIONS_KEY), raw);
  }
});
test('Uncertain storage writes block further mutations until a successful reload verifies stored history', async () => {
  let raw: string | null = null, failRead = false;
  const storage = { getItem: async () => { if (failRead) throw Error('read failed'); return raw; }, setItem: async (_key: string, text: string) => { raw = text; failRead = true; } };
  const repo = createMatchNoticeRepository(storage);
  await assert.rejects(repo.update(s => reconcileMatchNotices(s, [], now, true)));
  failRead = false;
  await assert.rejects(repo.update(s => s), /NOTICE_RELOAD_REQUIRED/);
  const loaded = await repo.load(); assert.equal(loaded.initialized, true);
  await repo.update(s => s);
});
test('Pruning history never forgets deduplication and never resets an unread item on an ordinary refresh', () => {
  const items = Array.from({ length: 205 }, (_, index) => match('p' + index));
  const state = scan(baseline(), items);
  assert.equal(state.entries.length, 205, 'Unread notices must never be pruned');
  assert.equal(Object.keys(state.seen).length, 205);
  const read = { ...state, entries: state.entries.map(n => ({ ...n, read: true })) };
  assert.equal(scan(read, items).entries.length, 200);
  assert.equal(scan(state, items).entries.length, 205);
});
test('ViewState cards only format the reviewed payload, without looking up hidden contacts or location', () => {
  const text = 'شقة بالسالمية\n490 KWD';
  assert.equal(viewStateTextCard(text, 'ar'), 'بطاقة عقار · ViewState\n\n' + text);
  assert.equal(viewStateTextCard(text, 'en').includes(text), true);
});
test('Notification actions retain canonical sharing, explicit sent confirmation and the existing follow-up editor', async () => {
  const [share, home, tabs, oldMore, hub, provider] = await Promise.all(['app/property/[propertyCoreId]/share.tsx', 'components/assistant/CompactAssistantScreen.tsx', 'app/(tabs)/_layout.tsx', 'app/(tabs)/more.tsx', 'components/account/AccountHub.tsx', 'contexts/MatchNotificationsContext.tsx'].map(path => readFile(path, 'utf8')));
  assert.match(share, /notificationsRef.current.resolve\(noticeId\)/);
  assert.match(share, /sharePropertyPreview\(preview/);
  assert.match(share, /<CheckRow disabled=\{sharing\}/);
  assert.match(share, /if \(shareFlight.current\) return; setSelection/);
  assert.match(share, /setFollowupPrompt\(true\)/);
  assert.match(share, /followupPersonId: recipient.id, followupPropertyId: id/);
  assert.match(home, /blankDraft\(kuwaitDay\(new Date\(\)\), 'call'\)/);
  assert.match(tabs, /name="more"[\s\S]*?href: null/);
  assert.match(oldMore, /Redirect href="\/account"/);
  assert.match(hub, /Settings & account/);
  assert.match(provider, /new BrokerInitiatedMatching/);
  assert.doesNotMatch(provider, /expo-notifications|fetch\(/);
  assert.doesNotMatch(provider, /if \(!account.ready\) return;/, 'Account-read failure must not disable matching snapshots');
});
