import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { groupNotificationFeed, circleUnreadCount } from '../services/notificationFeed';

const now = new Date('2026-11-18T21:10:00Z'); // 00:10 in Kuwait
const local = [
  { id: 'older', createdAt: '2026-11-18T20:58:00Z', read: false },
  { id: 'read', createdAt: '2026-11-18T21:03:00Z', read: true },
];
const circle = [
  { id: 'new', kind: 'invite', created_at: '2026-11-18T21:05:00Z', read_at: null },
  { id: 'test', kind: 'test', created_at: '2026-11-18T21:08:00Z', read_at: null },
] as const;

test('Inbox groups both sources by Kuwait day and orders by recency', () => {
  const feed = groupNotificationFeed(local, circle, false, now);
  assert.deepEqual(feed.today.map(row => row.item.id), ['new', 'read']);
  assert.deepEqual(feed.earlier.map(row => row.item.id), ['older']);
});

test('Unread filter and bell count omit test pushes without treating real circle notices as read', () => {
  const feed = groupNotificationFeed(local, circle, true, now);
  assert.deepEqual(feed.today.map(row => row.item.id), ['new']);
  assert.deepEqual(feed.earlier.map(row => row.item.id), ['older']);
  assert.equal(circleUnreadCount(2, circle), 1);
});

test('Inbox routes to dedicated settings and match detail, with canonical share and reminder actions', async () => {
  const [inbox, details, preferences, update] = await Promise.all([
    readFile(new URL('../app/notifications.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/notification-match.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/account/SettingsSection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/AppUpdateAction.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(inbox, /router\.push\('\/account\/notifications'/);
  assert.match(inbox, /pathname: '\/notification-match'/);
  assert.doesNotMatch(inbox, /CircleNotificationSettings/);
  assert.match(details, /matchingComparisonRows\(match\.result, match\.requirement, property, language\)/);
  assert.match(details, /await notifications\.resolve\(notice\.id\)/);
  assert.match(details, /matchNoticeId: notice\.id/);
  assert.match(details, /await notifications\.mark\(notice\.id, 'snooze'\)/);
  assert.match(preferences, /<CircleNotificationSettings \/>/);
  assert.match(preferences, /<AppUpdateAction mode="settings" \/>/);
  assert.match(update, /التطبيق بيفتح من جديد/);
});
