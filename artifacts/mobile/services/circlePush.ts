import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CloudRequest } from './workspaceCloud';
import { circleRpc } from './circleMatchingApi';

const storageKey = (owner: string) => `@viewstate_circle_push_${owner}`;

export function isCirclePush(data: Record<string, unknown>) {
  return data.kind === 'trust-circle-match' || data.kind === 'trust-circle-cooperation';
}

export async function listenForCirclePush(owner: string, open: (identifier: string) => void) {
  if (Platform.OS !== 'android') return undefined;
  const notifications = await import('expo-notifications');
  let disposed = false;
  const seen = new Set<string>();
  const handle = async (response: import('expo-notifications').NotificationResponse) => {
    const { content, identifier } = response.notification.request;
    if (!isCirclePush(content.data) || seen.has(identifier)) return;
    seen.add(identifier);
    const registered = await AsyncStorage.getItem(storageKey(owner));
    if (disposed || foregroundOwner !== owner) return;
    await notifications.clearLastNotificationResponseAsync();
    if (!disposed && foregroundOwner === owner && registered) open(identifier);
  };
  const handleSafely = (response: import('expo-notifications').NotificationResponse) => {
    void handle(response).catch(() => undefined);
  };
  const subscription = notifications.addNotificationResponseReceivedListener(handleSafely);
  void notifications.getLastNotificationResponseAsync()
    .then(response => { if (response && !disposed) handleSafely(response); })
    .catch(() => undefined);
  return () => {
    disposed = true;
    subscription.remove();
  };
}

let foregroundOwner: string | undefined;
export function setCircleForegroundOwner(owner: string | undefined) {
  foregroundOwner = owner;
}

export async function showRegisteredCirclePush(owner: string) {
  if (Platform.OS !== 'android' || !await AsyncStorage.getItem(storageKey(owner))) return;
  const notifications = await import('expo-notifications');
  if (foregroundOwner !== owner) return;
  notifications.setNotificationHandler({
    async handleNotification(notification) {
      const show = foregroundOwner === owner && isCirclePush(notification.request.content.data)
        && Boolean(await AsyncStorage.getItem(storageKey(owner)));
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

export async function setCirclePush(request: CloudRequest, owner: string, enabled: boolean) {
  if (!enabled) {
    const token = await AsyncStorage.getItem(storageKey(owner));
    if (token) {
      await circleRpc(request, 'vs_circle_register_push', { p_token: token, p_enabled: false });
      await AsyncStorage.removeItem(storageKey(owner));
    }
    return;
  }
  if (Platform.OS !== 'android') throw new Error('CIRCLE_PUSH_ANDROID_REQUIRED');
  const notifications = await import('expo-notifications');
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || !projectId) throw new Error('CIRCLE_PUSH_PROJECT_REQUIRED');
  await notifications.setNotificationChannelAsync('trust-circle', {
    name: 'ViewState Trust Circle',
    importance: notifications.AndroidImportance.DEFAULT,
  });
  const current = await notifications.getPermissionsAsync();
  if (!current.granted && !(await notifications.requestPermissionsAsync()).granted) {
    throw new Error('CIRCLE_PUSH_PERMISSION_REQUIRED');
  }
  const { data: token } = await notifications.getExpoPushTokenAsync({ projectId });
  // Retain the token before the RPC so a lost response can be revoked on retry.
  await AsyncStorage.setItem(storageKey(owner), token);
  await circleRpc(request, 'vs_circle_register_push', { p_token: token, p_enabled: true });
  await showRegisteredCirclePush(owner);
}
