import test from 'node:test';
import assert from 'node:assert/strict';
import { clockParts, storedClockTime, parentFollowupSheet } from '../services/followupEditor';
import { createFollowup, initialAssistant } from '../services/dailyAssistant';
import { createAssistantRepository } from '../services/dailyAssistantRepository';

test('12-hour clock preserves all 1440 existing minute values, including midnight/noon', () => {
  for (let total = 0; total < 1440; total++) {
    const hh = Math.floor(total / 60), mm = total % 60;
    const stored = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    const chosen = clockParts(stored);
    assert.equal(chosen.period, total < 720 ? 'AM' : 'PM');
    assert.equal(storedClockTime(chosen.hour, chosen.minute, chosen.period), stored);
  }
  assert.equal(storedClockTime(12, 0, 'AM'), '00:00');
  assert.equal(storedClockTime(12, 0, 'PM'), '12:00');
  assert.equal(storedClockTime(4, 37, 'PM'), '16:37');
  for (const [h, m] of [[0, 0], [13, 0], [1, -1], [1, 60], [1.5, 30]]) assert.throws(() => storedClockTime(h, m, 'AM'));
});
test('dismiss child sheets back to the editor, reschedule or outcome instead of Home', () => {
  assert.equal(parentFollowupSheet('calendar', 'editor', null, null), 'editor');
  assert.equal(parentFollowupSheet('calendar', 'outcome', null, null), 'outcome');
  assert.equal(parentFollowupSheet('calendar', 'reschedule', null, null), 'reschedule');
  for (const picker of ['people', 'properties'] as const) assert.equal(parentFollowupSheet(picker, null, 'editor', null), 'editor');
  for (const origin of ['editor', 'outcome', 'reschedule'] as const) assert.equal(parentFollowupSheet('time', null, null, origin), origin);
  assert.equal(parentFollowupSheet('calendar', null, null, null), null);
  assert.equal(parentFollowupSheet('editor', null, null, null), null);
});
test('settings edits preserve tasks, other preferences and concurrent updates across restart', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { values.set(k, v); } };
  const repo = createAssistantRepository(storage);
  const draft = { kind: 'call' as const, title: 'QA callback', date: '2026-11-05', time: storedClockTime(4, 37, 'PM'), duration: 45, personId: '', personName: '', propertyId: '', notes: 'Preserve me' };
  await repo.update(s => createFollowup(s, draft, { people: [], properties: [] }, 'task', '2026-11-04T09:00:00Z'));
  const before = await repo.load();
  await repo.update(s => ({ ...s, settings: { ...s.settings, checkAfterDays: 14 } }));
  await repo.update(s => ({ ...s, settings: { ...s.settings, showOverdue: false } }));
  const restored = await createAssistantRepository(storage).load();
  assert.deepEqual(restored.tasks, before.tasks);
  assert.equal(restored.tasks[0].time, '16:37');
  assert.equal(restored.settings.showOverdue, false);
  assert.equal(restored.settings.checkAfterDays, 14);
  assert.equal(restored.settings.showSuggestions, initialAssistant().settings.showSuggestions);
});
