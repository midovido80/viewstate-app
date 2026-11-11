import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CloudRequest } from './workspaceCloud';
import { circleRpc } from './circleMatchingApi';

const storageKey = (owner: string) => `@viewstate_circle_push_${owner}`;

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
      const show = foregroundOwner === owner && notification.request.content.data.kind === 'trust-circle-match'
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
