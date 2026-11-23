import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { syncCircleUpdateDevice, isCircleUpdatePush } from '@/services/circlePush';

type State = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'failed';
const Context = createContext({
  supported: false,
  available: false,
  state: 'idle' as State,
  check: async () => {},
  install: async () => {},
});

export const useAppUpdate = () => useContext(Context);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const supported = Platform.OS === 'android' && Updates.isEnabled && !__DEV__;
  const account = useRealAccount();
  const api = useRef(account?.request);
  api.current = account?.request;
  const owner = account?.profile.user_id;
  const flight = useRef(false);
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const available = supported && (isUpdateAvailable || isUpdatePending);
  const [state, setState] = useState<State>('idle');

  const check = useCallback(async () => {
    if (!supported || flight.current) return;
    flight.current = true;
    setState('checking');
    try {
      const result = await Updates.checkForUpdateAsync();
      setState(result.isAvailable || result.isRollBackToEmbedded ? 'available' : 'current');
    } catch {
      setState('failed');
    } finally {
      flight.current = false;
    }
  }, [supported]);

  const install = useCallback(async () => {
    if (!supported || flight.current) return;
    flight.current = true;
    setState('installing');
    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew || result.isRollBackToEmbedded || isUpdatePending) {
        await Updates.reloadAsync();
        return;
      }
      setState('current');
    } catch {
      setState('failed');
    } finally {
      flight.current = false;
    }
  }, [isUpdatePending, supported]);

  useEffect(() => {
    if (!supported) return;
    let live = true;
    let release: (() => void) | undefined;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      void check();
      if (owner && api.current) void syncCircleUpdateDevice(api.current, owner).catch(() => undefined);
    };
    refresh();
    const foreground = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    const interval = setInterval(refresh, 5 * 60_000);
    void import('expo-notifications').then(notifications => {
      if (!live) return;
      const subscription = notifications.addNotificationReceivedListener(notification => {
        if (isCircleUpdatePush(notification.request.content.data)) void check();
      });
      release = () => subscription.remove();
    }).catch(() => undefined);
    return () => {
      live = false;
      clearInterval(interval);
      foreground.remove();
      release?.();
    };
  }, [check, owner, supported]);

  return <Context.Provider value={{ supported, available, state, check, install }}>{children}</Context.Provider>;
}
