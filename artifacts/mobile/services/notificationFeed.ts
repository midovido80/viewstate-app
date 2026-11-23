import type { CircleNoticeKind } from '@/contexts/CircleNotificationsContext';

type LocalNotice = { id: string; createdAt: string; read: boolean };
type CircleNotice = { id: string; kind: CircleNoticeKind; created_at: string; read_at: string | null };

export type FeedRow<Local extends LocalNotice, Circle extends CircleNotice> = {
  createdAt: string;
  read: boolean;
} & ({ source: 'local'; item: Local } | { source: 'circle'; item: Circle });

const kuwaitDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function groupNotificationFeed<Local extends LocalNotice, Circle extends CircleNotice>(
  local: readonly Local[], circle: readonly Circle[], unreadOnly: boolean, now: Date,
) {
  const rows: FeedRow<Local, Circle>[] = [
    ...local.map(item => ({ source: 'local' as const, item, createdAt: item.createdAt, read: item.read })),
    ...circle.filter(item => item.kind !== 'test').map(item => ({
      source: 'circle' as const, item, createdAt: item.created_at, read: Boolean(item.read_at),
    })),
  ];
  const today: FeedRow<Local, Circle>[] = [];
  const earlier: FeedRow<Local, Circle>[] = [];
  const day = kuwaitDay.format(now);
  const eligible = rows.map(row => ({ row, time: Date.parse(row.createdAt) }))
    .filter(({ row, time }) => Number.isFinite(time) && (!unreadOnly || !row.read))
    .sort((a, b) => b.time - a.time);
  for (const { row, time } of eligible) (kuwaitDay.format(time) === day ? today : earlier).push(row);
  return { today, earlier };
}

export function circleUnreadCount(total: number, entries: readonly CircleNotice[]) {
  const testCount = entries.filter(entry => entry.kind === 'test' && !entry.read_at).length;
  return Math.max(0, total - testCount);
}

export function isNotificationScreen(pathname: string) {
  return pathname === '/notifications' || pathname === '/notification-match' || pathname === '/account/notifications';
}
