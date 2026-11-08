import test from 'node:test';
import assert from 'node:assert/strict';
import { timeParts, timeFromParts, hasFollowupTime, followupTimeLabel } from '../services/followupTime.ts';
test('every minute survives 12/24-hour conversion without changing the scheduled time', () => {
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) {
    const stored = timeFromParts(h, m, 24);
    const twelve = timeParts(stored, 12);
    assert.equal(timeFromParts(twelve.hour, twelve.minute, 12, twelve.period), stored);
    const twentyFour = timeParts(stored, 24);
    assert.equal(timeFromParts(twentyFour.hour, twentyFour.minute, 24), stored);
  }
});
test('no blank, invalid hour or malformed value can satisfy required time', () => {
  for (const v of ['', '24:00', '13:60', '9:30', '12:3', '12:30 PM']) assert.equal(hasFollowupTime(v), false, v);
  for (const v of ['00:00', '12:00', '23:59']) assert.equal(hasFollowupTime(v), true);
  assert.throws(() => timeFromParts(0, 0, 12));
  assert.throws(() => timeFromParts(24, 0, 24));
  assert.throws(() => timeFromParts(12, 60, 12));
});
test('midnight, noon and Arabic/English labels use correct periods', () => {
  assert.equal(followupTimeLabel('00:00', 12, false), '12:00 AM');
  assert.equal(followupTimeLabel('12:00', 12, false), '12:00 PM');
  assert.equal(followupTimeLabel('20:30', 12, true), '08:30 م');
  assert.equal(followupTimeLabel('20:30', 24, false), '20:30');
  assert.equal(followupTimeLabel('', 24, true), 'اختر الساعة');
});
