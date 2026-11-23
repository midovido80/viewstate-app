import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { circleRpc } from '@/services/circleMatchingApi';
import { isCirclePush } from '@/services/circlePush';

export type CircleNoticeKind = 'invite' | 'match' | 'listing' | 'cooperation' | 'test';
export type CircleNoticeTarget = {
  kind: 'invite' | 'circle' | 'listing' | 'requirement' | 'cooperation' | 'test';
  circleId?: string;
  targetId?: string;
  matchId?: string;
};
type Inbox = {
  unread: number;
  entries: { id: string; kind: CircleNoticeKind; created_at: string; read_at: string | null }[];
};
const empty: Inbox = { unread: 0, entries: [] };
const CircleNotifications = createContext({
  inbox: empty, failed: false,
  refresh: async () => {},
  markRead: async (_id: string): Promise<CircleNoticeTarget | null> => null,
});

export function CircleNotificationsProvider({ children }: { children: ReactNode }) {
  const owner = useRealAccount()?.profile.user_id;
  return <CircleInboxSession key={owner ?? 'guest'}>{children}</CircleInboxSession>;
}

function CircleInboxSession({ children }: { children: ReactNode }) {
  const account = useRealAccount();
  const request = useRef(account?.request);
  request.current = account?.request;
  const authenticated = Boolean(account);
  const version = useRef(0);
  const [inbox, setInbox] = useState(empty);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    const api = request.current;
    if (!api) return;
    const turn = ++version.current;
    try {
      const next = await circleRpc<Inbox>(api, 'vs_circle_notification_inbox');
      if (version.current === turn) {
        setInbox(next);
        setFailed(false);
      }
    } catch {
      if (version.current === turn) setFailed(true);
    }
  }, []);
  const markRead = useCallback(async (id: string) => {
    const api = request.current;
    if (!api) return null;
    const target = await circleRpc<CircleNoticeTarget | null>(api, 'vs_circle_notification_open', { p_id: id });
    version.current++;
    setInbox(current => {
      const unread = current.entries.some(entry => entry.id === id && !entry.read_at);
      return unread ? {
        unread: Math.max(0, current.unread - 1),
        entries: current.entries.map(entry => entry.id === id ? { ...entry, read_at: new Date().toISOString() } : entry),
      } : current;
    });
    void refresh();
    return target;
  }, [refresh]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    let stopPush: (() => void) | undefined;
    const check = () => { if (AppState.currentState !== 'background') void refresh(); };
    check();
    const timer = setInterval(check, 15_000);
    const state = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    if (Platform.OS === 'android') void import('expo-notifications').then(notifications => {
      if (!active) return;
      const subscription = notifications.addNotificationReceivedListener(notification => {
        if (isCirclePush(notification.request.content.data)) check();
      });
      stopPush = () => subscription.remove();
    }).catch(() => undefined);
    return () => {
      active = false;
      version.current++;
      clearInterval(timer);
      state.remove();
      stopPush?.();
    };
  }, [authenticated, refresh]);

  return <CircleNotifications.Provider value={{ inbox, failed, refresh, markRead }}>{children}</CircleNotifications.Provider>;
}

export const useCircleNotifications = () => useContext(CircleNotifications);
