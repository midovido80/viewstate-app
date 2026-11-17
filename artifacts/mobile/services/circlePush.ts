import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CloudRequest } from './workspaceCloud';
import { circleRpc } from './circleMatchingApi';

const storageKey = (owner: string) => `@viewstate_circle_push_${owner}`;

export function isCircleUpdatePush(data: Record<string, unknown>) {
  return data.kind === 'viewstate-app-update';
}

export function isCirclePush(data: Record<string, unknown>) {
  return isCircleUpdatePush(data) || data.kind === 'trust-circle-match' || data.kind === 'trust-circle-cooperation'
    || data.kind === 'trust-circle-invite' || data.kind === 'trust-circle-listing' || data.kind === 'trust-circle-test';
}

export async function listenForCirclePush(owner: string, open: (noticeId?: string) => void) {
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
    if (!disposed && foregroundOwner === owner && registered) {
      const noticeId = content.data.noticeId;
      open(typeof noticeId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(noticeId) ? noticeId : undefined);
    }
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
  await configureAlertChannel(notifications);
  if (foregroundOwner !== owner) return;
  notifications.setNotificationHandler({
    async handleNotification(notification) {
      const show = foregroundOwner === owner && isCirclePush(notification.request.content.data)
        && Boolean(await AsyncStorage.getItem(storageKey(owner)));
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

async function configureAlertChannel(notifications: typeof import('expo-notifications')) {
  await notifications.setNotificationChannelAsync('trust-circle-alerts', {
    name: 'ViewState Trust Circle alerts',
    importance: notifications.AndroidImportance.HIGH,
    sound: 'default',
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
  await configureAlertChannel(notifications);
  const current = await notifications.getPermissionsAsync();
  if (!current.granted && !(await notifications.requestPermissionsAsync()).granted) {
    throw new Error('CIRCLE_PUSH_PERMISSION_REQUIRED');
  }
  const { data: token } = await notifications.getExpoPushTokenAsync({ projectId });
  // Retain the token before the RPC so a lost response can be revoked on retry.
  await AsyncStorage.setItem(storageKey(owner), token);
  await circleRpc(request, 'vs_circle_register_push', { p_token: token, p_enabled: true });
  await showRegisteredCirclePush(owner);
  await syncCircleUpdateDevice(request, owner).catch(() => undefined);
}

export async function syncCircleUpdateDevice(request: CloudRequest, owner: string) {
  if (!Updates.isEnabled || !Updates.channel || !Updates.runtimeVersion) return;
  const token = await AsyncStorage.getItem(storageKey(owner));
  if (!token) return;
  await circleRpc(request, 'vs_circle_update_device', {
    p_token: token, p_channel: Updates.channel, p_runtime: Updates.runtimeVersion,
  });
}

export async function getCirclePushStatus(request: CloudRequest, owner: string) {
  const notifications = await import('expo-notifications');
  const [permission, channel, token] = await Promise.all([
    notifications.getPermissionsAsync(),
    notifications.getNotificationChannelAsync('trust-circle-alerts'),
    AsyncStorage.getItem(storageKey(owner)),
  ]);
  return {
    permission: permission.granted,
    channelAudible: Boolean(channel?.sound && channel.importance >= notifications.AndroidImportance.DEFAULT),
    registered: token ? await circleRpc<boolean>(request, 'vs_circle_notification_device', { p_token: token }) : false,
  };
}

export async function testCirclePush(request: CloudRequest, owner: string) {
  const token = await AsyncStorage.getItem(storageKey(owner));
  if (!token) throw new Error('CIRCLE_PUSH_NOT_REGISTERED');
  await circleRpc(request, 'vs_circle_test_notification', { p_token: token });
}

export async function testCircleSound(owner: string) {
  const notifications = await import('expo-notifications');
  const permission = await notifications.getPermissionsAsync();
  if (!permission.granted) throw new Error('CIRCLE_PUSH_PERMISSION_REQUIRED');
  await showRegisteredCirclePush(owner);
  const channel = await notifications.getNotificationChannelAsync('trust-circle-alerts');
  if (!channel?.sound || channel.importance < notifications.AndroidImportance.DEFAULT) throw new Error('CIRCLE_PUSH_CHANNEL_SILENT');
  await notifications.scheduleNotificationAsync({
    content: { title: 'ViewState', body: 'اختبار الصوت · Sound test', sound: 'default', data: { kind: 'trust-circle-test' } },
    trigger: { channelId: 'trust-circle-alerts' },
  });
}
