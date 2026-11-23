import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import type { CloudRequest } from "./workspaceCloud";
import { circleRpc } from "./circleMatchingApi";
import {
  refreshPushRegistration,
  serializePushRegistration,
} from "./pushRegistrationRefresh";
import { createPushRevocations } from "./pushRevocation";
import { createSecureSessionStorage } from "./secureSessionStorage";

let revocations: Promise<ReturnType<typeof createPushRevocations>> | undefined;
function pushRevocations() {
  if (!revocations)
    revocations = (async () => {
      const secure = await import("expo-secure-store");
      if (!(await secure.isAvailableAsync()))
        throw Error("SECURE_PUSH_STORAGE_UNAVAILABLE");
      return createPushRevocations(
        createSecureSessionStorage(
          {
            getItem: (key) => secure.getItemAsync(key),
            setItem: (key, value) =>
              secure.setItemAsync(key, value, {
                keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
              }),
            removeItem: (key) => secure.deleteItemAsync(key),
          },
          Crypto.randomUUID,
        ),
      );
    })().catch((error) => {
      revocations = undefined;
      throw error;
    });
  return revocations;
}

export async function retryCirclePushRevocations(
  request?: CloudRequest,
  owner?: string,
) {
  if (Platform.OS !== "android") return;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const base = new URL(url);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  )
    throw Error("INVALID_SUPABASE_PUBLIC_CONFIG");
  await (
    await pushRevocations()
  ).retry(async (binding) => {
    if (!binding.secret) {
      if (!request || binding.owner !== owner)
        throw Error("CIRCLE_PUSH_ORIGINAL_OWNER_REQUIRED");
      await circleRpc(request, "vs_circle_register_push", {
        p_token: binding.token,
        p_enabled: false,
      });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `${base.origin}/rest/v1/rpc/vs_circle_revoke_push_device`,
        {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_token: binding.token,
            p_secret: binding.secret,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw Error("CIRCLE_PUSH_REVOKE_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }, owner);
}

export function prepareCirclePushSignOut(owner: string) {
  return serializePushRegistration(owner, async () => {
    if (Platform.OS !== "android") return;
    await (
      await pushRevocations()
    ).prepare(owner, await AsyncStorage.getItem(storageKey(owner)));
    await AsyncStorage.removeItem(storageKey(owner));
  });
}

async function registerPushDevice(
  request: CloudRequest,
  owner: string,
  token: string,
) {
  if (foregroundOwner !== owner) throw Error("CIRCLE_PUSH_ACCOUNT_CHANGED");
  const queue = await pushRevocations();
  const current = await queue.read(owner);
  const secret =
    current?.token === token && current.secret
      ? current.secret
      : Array.from(Crypto.getRandomBytes(32), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
  await queue.remember(
    { owner, token, secret },
    await AsyncStorage.getItem(storageKey(owner)),
  );
  await retryCirclePushRevocations(request, owner);
  await queue.assertReady(token);
  if (foregroundOwner !== owner) throw Error("CIRCLE_PUSH_ACCOUNT_CHANGED");
  await AsyncStorage.setItem(storageKey(owner), token);
  await circleRpc(request, "vs_circle_prepare_push_device", {
    p_token: token,
    p_secret: secret,
  });
  if (foregroundOwner !== owner) throw Error("CIRCLE_PUSH_ACCOUNT_CHANGED");
  await circleRpc(request, "vs_circle_register_push_device", {
    p_token: token,
    p_secret: secret,
  });
  void retryCirclePushRevocations(request, owner).catch(() => undefined);
}

const storageKey = (owner: string) => `@viewstate_circle_push_${owner}`;

export function isCircleUpdatePush(data: Record<string, unknown>) {
  return data.kind === "viewstate-app-update";
}

export function isCirclePush(data: Record<string, unknown>) {
  return (
    isCircleUpdatePush(data) ||
    data.kind === "trust-circle-match" ||
    data.kind === "trust-circle-cooperation" ||
    data.kind === "trust-circle-invite" ||
    data.kind === "trust-circle-listing" ||
    data.kind === "trust-circle-test"
  );
}

export async function listenForCirclePush(
  owner: string,
  open: (noticeId?: string) => void,
) {
  if (Platform.OS !== "android") return undefined;
  const notifications = await import("expo-notifications");
  let disposed = false;
  const seen = new Set<string>();
  const handle = async (
    response: import("expo-notifications").NotificationResponse,
  ) => {
    const { content, identifier } = response.notification.request;
    if (!isCirclePush(content.data) || seen.has(identifier)) return;
    seen.add(identifier);
    const registered = await AsyncStorage.getItem(storageKey(owner));
    if (disposed || foregroundOwner !== owner) return;
    await notifications.clearLastNotificationResponseAsync();
    if (!disposed && foregroundOwner === owner && registered) {
      const noticeId = content.data.noticeId;
      open(
        typeof noticeId === "string" &&
          /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(noticeId)
          ? noticeId
          : undefined,
      );
    }
  };
  const handleSafely = (
    response: import("expo-notifications").NotificationResponse,
  ) => {
    void handle(response).catch(() => undefined);
  };
  const subscription =
    notifications.addNotificationResponseReceivedListener(handleSafely);
  void notifications
    .getLastNotificationResponseAsync()
    .then((response) => {
      if (response && !disposed) handleSafely(response);
    })
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
  if (
    Platform.OS !== "android" ||
    !(await AsyncStorage.getItem(storageKey(owner)))
  )
    return;
  const notifications = await import("expo-notifications");
  await configureAlertChannel(notifications);
  if (foregroundOwner !== owner) return;
  notifications.setNotificationHandler({
    async handleNotification(notification) {
      const show =
        foregroundOwner === owner &&
        isCirclePush(notification.request.content.data) &&
        Boolean(await AsyncStorage.getItem(storageKey(owner)));
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

async function configureAlertChannel(
  notifications: typeof import("expo-notifications"),
) {
  await notifications.setNotificationChannelAsync("trust-circle-alerts", {
    name: "ViewState Trust Circle alerts",
    importance: notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

export async function setCirclePush(
  request: CloudRequest,
  owner: string,
  enabled: boolean,
) {
  return serializePushRegistration(owner, () =>
    setCirclePushUnlocked(request, owner, enabled),
  );
}

async function setCirclePushUnlocked(
  request: CloudRequest,
  owner: string,
  enabled: boolean,
) {
  if (!enabled) {
    if (Platform.OS !== "android") return;
    const queue = await pushRevocations();
    const binding = await queue.read(owner);
    const token =
      binding?.token ?? (await AsyncStorage.getItem(storageKey(owner)));
    await queue.prepare(owner, token);
    await AsyncStorage.removeItem(storageKey(owner));
    await retryCirclePushRevocations(request, owner);
    if (token) await queue.assertReady(token, owner);
    return;
  }
  if (Platform.OS !== "android")
    throw new Error("CIRCLE_PUSH_ANDROID_REQUIRED");
  const notifications = await import("expo-notifications");
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId)
    throw new Error("CIRCLE_PUSH_PROJECT_REQUIRED");
  await configureAlertChannel(notifications);
  const current = await notifications.getPermissionsAsync();
  if (
    !current.granted &&
    !(await notifications.requestPermissionsAsync()).granted
  ) {
    throw new Error("CIRCLE_PUSH_PERMISSION_REQUIRED");
  }
  const { data: token } = await notifications.getExpoPushTokenAsync({
    projectId,
  });
  await registerPushDevice(request, owner, token);
  await showRegisteredCirclePush(owner);
  await syncCircleUpdateDevice(request, owner).catch(() => undefined);
}

export async function syncCircleUpdateDevice(
  request: CloudRequest,
  owner: string,
) {
  if (!Updates.isEnabled || !Updates.channel || !Updates.runtimeVersion) return;
  const token = await AsyncStorage.getItem(storageKey(owner));
  if (!token) return;
  await circleRpc(request, "vs_circle_update_device", {
    p_token: token,
    p_channel: Updates.channel,
    p_runtime: Updates.runtimeVersion,
  });
}

export function refreshRegisteredCirclePush(
  request: CloudRequest,
  owner: string,
) {
  return serializePushRegistration(owner, async () => {
    if (Platform.OS !== "android" || foregroundOwner !== owner) return;
    const notifications = await import("expo-notifications");
    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== "string" || !projectId) return;
    await refreshPushRegistration({
      read: () => AsyncStorage.getItem(storageKey(owner)),
      permission: async () =>
        foregroundOwner === owner &&
        (await notifications.getPermissionsAsync()).granted,
      deviceToken: async () =>
        (await notifications.getExpoPushTokenAsync({ projectId })).data,
      register: async (token) => {
        if (foregroundOwner !== owner)
          throw Error("CIRCLE_PUSH_ACCOUNT_CHANGED");
        await registerPushDevice(request, owner, token);
      },
      write: (token) => AsyncStorage.setItem(storageKey(owner), token),
      remove: async () => retryCirclePushRevocations(request, owner),
    });
    await showRegisteredCirclePush(owner);
    await syncCircleUpdateDevice(request, owner);
  });
}

export async function getCirclePushStatus(
  request: CloudRequest,
  owner: string,
) {
  const notifications = await import("expo-notifications");
  const [permission, channel, token] = await Promise.all([
    notifications.getPermissionsAsync(),
    notifications.getNotificationChannelAsync("trust-circle-alerts"),
    AsyncStorage.getItem(storageKey(owner)),
  ]);
  return {
    permission: permission.granted,
    channelAudible: Boolean(
      channel?.sound &&
      channel.importance >= notifications.AndroidImportance.DEFAULT,
    ),
    registered: token
      ? await circleRpc<boolean>(request, "vs_circle_notification_device", {
          p_token: token,
        })
      : false,
  };
}

export async function testCirclePush(request: CloudRequest, owner: string) {
  const token = await AsyncStorage.getItem(storageKey(owner));
  if (!token) throw new Error("CIRCLE_PUSH_NOT_REGISTERED");
  await circleRpc(request, "vs_circle_test_notification", { p_token: token });
}

export async function testCircleSound(owner: string) {
  const notifications = await import("expo-notifications");
  const permission = await notifications.getPermissionsAsync();
  if (!permission.granted) throw new Error("CIRCLE_PUSH_PERMISSION_REQUIRED");
  await showRegisteredCirclePush(owner);
  const channel = await notifications.getNotificationChannelAsync(
    "trust-circle-alerts",
  );
  if (
    !channel?.sound ||
    channel.importance < notifications.AndroidImportance.DEFAULT
  )
    throw new Error("CIRCLE_PUSH_CHANNEL_SILENT");
  await notifications.scheduleNotificationAsync({
    content: {
      title: "ViewState",
      body: "اختبار الصوت · Sound test",
      sound: "default",
      data: { kind: "trust-circle-test" },
    },
    trigger: { channelId: "trust-circle-alerts" },
  });
}
