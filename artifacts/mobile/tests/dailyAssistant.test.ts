import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_STORAGE_KEY, AssistantError, acceptSuggestion, addDays, changeTaskStatus, createFollowup, daySummary, editFollowup, initialAssistant, kuwaitDay, logOutcome, monthGrid, normalizeDigits, selectFollowups, shiftMonth, suggestFollowups, validDay, type AssistantInventory, type FollowupDraft } from '../services/dailyAssistant';
import { createAssistantRepository, type AssistantStorage } from '../services/dailyAssistantRepository';
const today = '2026-10-29', at = today + 'T07:00:00.000Z';
const inventory: AssistantInventory = { people: [{ id: 'client', name: 'عميل أصلي', client: true }, { id: 'owner', name: 'مالك', client: false }], properties: [{ id: 'property', title: 'شقة', sourcePersonId: 'owner' }] };
const draft = (extra: Partial<FollowupDraft> = {}): FollowupDraft => ({ title: 'اتصل بالعميل', kind: 'call', date: today, time: '11:00', duration: 45, personId: 'client', personName: '', propertyId: 'property', notes: '', ...extra });
const error = (code: string) => (e: unknown) => e instanceof AssistantError && e.code === code;
class Memory implements AssistantStorage {
  values = new Map<string, string>(); fail = false; readBackFails = false; written = false;
  async getItem(key: string) { if (this.readBackFails && this.written) throw new Error('read'); return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { if (this.fail) throw new Error('write'); this.values.set(key, value); this.written = true; }
}
test('Assistant starts empty in an isolated namespace and preserves existing property records', async () => {
  const storage = new Memory(); storage.values.set('@viewstate_properties', 'original');
  const repo = createAssistantRepository(storage); assert.deepEqual(await repo.load(), initialAssistant());
  await repo.update(s => createFollowup(s, draft(), inventory, 'one', at));
  assert.equal(storage.values.get('@viewstate_properties'), 'original'); assert.equal(storage.values.size, 2); assert.ok(storage.values.has(ASSISTANT_STORAGE_KEY));
});
test('Kuwait local midnight, leap/year boundaries and Arabic digits behave consistently', () => {
  assert.equal(kuwaitDay(new Date('2026-10-28T20:59:59Z')), '2026-10-28'); assert.equal(kuwaitDay(new Date('2026-10-28T21:00:00Z')), today);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29'); assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(validDay('2026-02-29'), false); assert.equal(validDay('2026-13-01'), false); assert.equal(shiftMonth('2026-12-29', 1), '2027-01-01');
  const grid = monthGrid(today); assert.equal(grid.length, 42); assert.equal(new Date(grid[0] + 'T12:00Z').getUTCDay(), 0); assert.equal(new Set(grid).size, 42);
  assert.equal(normalizeDigits('١٦:٣٠ / ۱۴۰'), '16:30 / 140');
});
test('Required fields and linked identities are validated before saving', () => {
  const cases: [FollowupDraft, string][] = [[draft({ title: ' ' }), 'title'], [draft({ kind: 'viewing', time: '' }), 'time'], [draft({ time: '25:00' }), 'time'],
    [draft({ propertyId: 'gone' }), 'property'], [draft({ personId: 'gone' }), 'person'], [draft({ personName: 'Manual' }), 'person'], [draft({ kind: 'available', propertyId: '' }), 'property'], [draft({ duration: 0 }), 'duration']];
  for (const [value, code] of cases) assert.throws(() => createFollowup(initialAssistant(), value, inventory, 'one', at), error(code));
  assert.equal(createFollowup(initialAssistant(), draft({ time: '١٦:٣٠' }), inventory, 'one', at).tasks[0].time, '16:30');
});
test('Viewing overlap checks include overnight collisions and permit adjacent slots', () => {
  let value = createFollowup(initialAssistant(), draft({ kind: 'viewing' }), inventory, 'one', at);
  assert.throws(() => createFollowup(value, draft({ kind: 'viewing', time: '11:15' }), inventory, 'two', at), error('conflict'));
  assert.doesNotThrow(() => createFollowup(value, draft({ kind: 'viewing', time: '11:45' }), inventory, 'two', at));
  value = createFollowup(value, draft({ kind: 'viewing', time: '23:30', duration: 90 }), inventory, 'late', at);
  assert.throws(() => createFollowup(value, draft({ kind: 'viewing', date: addDays(today, 1), time: '00:15' }), inventory, 'two', at), error('conflict'));
});
test('Summary counts distinct clients/properties while filters count the actual tasks', () => {
  let value = createFollowup(initialAssistant(), draft(), inventory, 'one', at);
  value = createFollowup(value, draft({ kind: 'viewing', time: '14:00' }), inventory, 'two', at);
  value = createFollowup(value, draft({ kind: 'available', time: '', personId: 'owner' }), inventory, 'three', at);
  value = createFollowup(value, draft({ kind: 'available', time: '', personId: 'owner' }), inventory, 'four', at);
  assert.deepEqual(daySummary(value, inventory, today), { clients: 1, viewings: 1, availability: 1, done: 0, total: 4 });
  assert.equal(selectFollowups(value, inventory, today, 'client').length, 2); assert.equal(selectFollowups(value, inventory, today, 'available').length, 2);
  assert.deepEqual(selectFollowups(value, inventory, today).map(t => t.id), ['one', 'two', 'four', 'three']);
  assert.equal(selectFollowups(value, inventory, addDays(today, 1)).length, 0); assert.equal(selectFollowups(value, inventory, addDays(today, 1), 'all', 'عميل أصلي').length, 2);
});
test('No answer never changes availability or invents a successful contact', () => {
  const value = createFollowup(initialAssistant(), draft({ kind: 'available', personId: 'owner' }), inventory, 'one', at);
  const next = logOutcome(value, value.tasks[0], 'noAnswer', 'لا يرد', at, inventory);
  assert.deepEqual(next.availability, {}); assert.deepEqual(next.contacts, {}); assert.equal(next.tasks[0].status, 'done');
  assert.equal(next.tasks[0].history[0].outcome, 'noAnswer'); assert.equal(value.tasks[0].status, 'pending');
  assert.throws(() => logOutcome(next, value.tasks[0], 'isAvailable', '', at, inventory), error('stale'));
});
test('Explicit availability is assistant metadata; wrong outcomes cannot be saved', () => {
  const value = createFollowup(initialAssistant(), draft({ kind: 'available', personId: 'owner' }), inventory, 'one', at);
  const next = logOutcome(value, value.tasks[0], 'notAvailable', '', at, inventory);
  assert.equal(next.availability.property.status, 'unavailable'); assert.equal(next.contacts.owner.at, at);
  assert.deepEqual(inventory.properties, [{ id: 'property', title: 'شقة', sourcePersonId: 'owner' }]);
  assert.throws(() => logOutcome(value, value.tasks[0], 'viewed', '', at, inventory), error('outcome'));
});
test('Outcome and next follow-up save together, reload exactly and reject duplicate IDs', async () => {
  const storage = new Memory(), repo = createAssistantRepository(storage); await repo.load();
  let saved = await repo.update(s => createFollowup(s, draft(), inventory, 'one', at));
  saved = await repo.update(s => logOutcome(s, saved.tasks[0], 'contacted', 'مهتم', at, inventory, { id: 'two', draft: draft({ date: addDays(today, 1), time: '' }) }));
  assert.deepEqual(await createAssistantRepository(storage).load(), saved); assert.equal(saved.tasks.length, 2); assert.equal(saved.tasks[0].status, 'done');
  const before = storage.values.get(ASSISTANT_STORAGE_KEY); await assert.rejects(repo.update(s => createFollowup(s, draft(), inventory, 'two', at)), error('duplicate')); assert.equal(storage.values.get(ASSISTANT_STORAGE_KEY), before);
});
test('Stale task edits cannot overwrite another saved outcome', async () => {
  const storage = new Memory(), a = createAssistantRepository(storage), b = createAssistantRepository(storage); await a.load();
  const initial = await a.update(s => createFollowup(s, draft(), inventory, 'one', at)); await b.load();
  await b.update(s => logOutcome(s, initial.tasks[0], 'contacted', '', at, inventory));
  await assert.rejects(a.update(s => editFollowup(s, initial.tasks[0], draft({ title: 'overwrite' }), inventory, at)), error('stale'));
  assert.equal((await a.load()).tasks[0].status, 'done');
});
test('Concurrent repositories serialize writes instead of losing newly added tasks', async () => {
  const storage = new Memory(), a = createAssistantRepository(storage), b = createAssistantRepository(storage); await Promise.all([a.load(), b.load()]);
  await Promise.all([a.update(s => createFollowup(s, draft(), inventory, 'one', at)), b.update(s => createFollowup(s, draft(), inventory, 'two', at))]); assert.equal((await a.load()).tasks.length, 2);
});
test('Malformed or newer records block mutations without replacing existing bytes', async () => {
  for (const bad of ['{', JSON.stringify({ ...initialAssistant(), schemaVersion: 2 }), JSON.stringify({ ...initialAssistant(), tasks: [{ id: 'broken' }] })]) {
    const storage = new Memory(); storage.values.set(ASSISTANT_STORAGE_KEY, bad); const repo = createAssistantRepository(storage);
    await assert.rejects(repo.load(), error('damaged')); await assert.rejects(repo.update(s => s), error('damaged')); assert.equal(storage.values.get(ASSISTANT_STORAGE_KEY), bad);
  }
});
test('Write/read-back failure never reports success and requires reload before retry', async () => {
  const storage = new Memory(), repo = createAssistantRepository(storage); await repo.load(); storage.fail = true;
  await assert.rejects(repo.update(s => createFollowup(s, draft(), inventory, 'one', at))); assert.equal(repo.canUndo(), false);
  storage.fail = false; await assert.rejects(repo.update(s => s), error('unavailable')); await repo.load();
  storage.readBackFails = true; await assert.rejects(repo.update(s => createFollowup(s, draft(), inventory, 'one', at))); storage.readBackFails = false; assert.equal((await repo.load()).tasks.length, 1);
});
test('Undo reverses outcome and next follow-up together but rejects intervening changes', async () => {
  const storage = new Memory(), repo = createAssistantRepository(storage); await repo.load(); let value = await repo.update(s => createFollowup(s, draft(), inventory, 'one', at));
  value = await repo.update(s => logOutcome(s, value.tasks[0], 'contacted', '', at, inventory, { id: 'two', draft: draft({ date: addDays(today, 1) }) }));
  const undone = await repo.undo(); assert.equal(undone.tasks.length, 1); assert.equal(undone.tasks[0].status, 'pending'); assert.deepEqual(undone.contacts, {}); assert.equal(repo.canUndo(), false);
  await repo.update(s => createFollowup(s, draft(), inventory, 'three', at)); const another = createAssistantRepository(storage); await another.load(); await another.update(s => createFollowup(s, draft(), inventory, 'four', at));
  await assert.rejects(repo.undo(), error('stale')); assert.equal((await repo.load()).tasks.length, 3);
});
test('Suggestions use recorded evidence and explicit acceptance cannot create a repeated check', () => {
  assert.deepEqual(suggestFollowups(initialAssistant(), inventory, today), []); let value = createFollowup(initialAssistant(), draft({ kind: 'viewing' }), inventory, 'view', at);
  const first = suggestFollowups(value, inventory, today); assert.equal(first.length, 1); assert.equal(first[0].reason, 'unconfirmed'); assert.equal(first[0].personId, 'owner'); assert.equal(value.tasks.length, 1);
  value = acceptSuggestion(value, inventory, today, first[0].key, 'تحقق من الإتاحة', 'check', at); assert.equal(value.tasks.length, 2); assert.deepEqual(suggestFollowups(value, inventory, today), []);
  assert.throws(() => acceptSuggestion(value, inventory, today, first[0].key, 'again', 'duplicate', at), error('stale'));
  value = logOutcome(value, value.tasks[1], 'isAvailable', '', at, inventory); assert.deepEqual(suggestFollowups(value, inventory, today), []);
});
test('Cancelled tasks remain recoverable; reopening cannot introduce a viewing clash', () => {
  let value = createFollowup(initialAssistant(), draft({ kind: 'viewing' }), inventory, 'one', at); value = changeTaskStatus(value, value.tasks[0], 'cancelled', inventory, at);
  assert.equal(selectFollowups(value, inventory, today, 'cancelled').length, 1); assert.equal(daySummary(value, inventory, today).total, 0);
  value = createFollowup(value, draft({ kind: 'viewing' }), inventory, 'two', at); assert.throws(() => changeTaskStatus(value, value.tasks[0], 'pending', inventory, at), error('conflict'));
});
