import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import appConfig from '../app.json';
import {
  publicApiUrl,
  resolvePublicApiOrigin,
} from '../services/runtimeApi.ts';

test('release API origin is deterministic, HTTPS-first, and backward compatible', () => {
  assert.equal(resolvePublicApiOrigin({
    EXPO_PUBLIC_API_ORIGIN: 'https://api.example.com/',
    EXPO_PUBLIC_DOMAIN: 'ignored.example.com',
  }), 'https://api.example.com');
  assert.equal(resolvePublicApiOrigin({
    EXPO_PUBLIC_DOMAIN: 'development.example.com',
  }), 'https://development.example.com');
  assert.equal(resolvePublicApiOrigin({
    EXPO_PUBLIC_API_ORIGIN: 'http://api.example.com',
    EXPO_PUBLIC_DOMAIN: 'legacy.example.com',
  }), null);
  assert.equal(resolvePublicApiOrigin({
    EXPO_PUBLIC_API_ORIGIN: ' ',
    EXPO_PUBLIC_DOMAIN: 'legacy.example.com',
  }), null);
  assert.equal(resolvePublicApiOrigin({
    EXPO_PUBLIC_API_ORIGIN: 'http://10.0.2.2:3000',
  }), 'http://10.0.2.2:3000');
  assert.equal(resolvePublicApiOrigin({}), null);
  assert.equal(publicApiUrl('/api/brain/intent', {
    EXPO_PUBLIC_API_ORIGIN: 'https://api.example.com',
  }), 'https://api.example.com/api/brain/intent');
});

test('Android release config explicitly packages audio permissions and adaptive keyboard mode', () => {
  assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize');
  assert.equal(appConfig.expo.orientation, 'portrait');
  assert.ok(appConfig.expo.android.permissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(appConfig.expo.android.permissions.includes('android.permission.MODIFY_AUDIO_SETTINGS'));
  assert.equal(appConfig.expo.android.versionCode, 5);
});

test('Android release plugins cannot remove recording permission', () => {
  for (const plugin of appConfig.expo.plugins) {
    if (!Array.isArray(plugin)) continue;
    const options = plugin[1];
    const microphonePermission = (
      typeof options === 'object'
      && options !== null
      && 'microphonePermission' in options
    )
      ? options.microphonePermission
      : undefined;
    assert.notEqual(
      microphonePermission,
      false,
      `${plugin[0]} must not remove android.permission.RECORD_AUDIO`,
    );
  }

  const imagePicker = appConfig.expo.plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );
  assert.deepEqual(imagePicker?.[1], {
    photosPermission: 'Allow ViewState to choose photos and videos you select. / السماح لـ ViewState باختيار الصور ومقاطع الفيديو التي تحددها.',
    cameraPermission: false,
  });
});

test('Brain cancels native and network activity when Android backgrounds the app', async () => {
  const screen = await readFile('app/(tabs)/brain.tsx', 'utf8');
  assert.match(screen, /if \(state !== 'active'\) \{/);
  assert.match(screen, /intentController\.current\?\.abort\(\)/);
  assert.match(screen, /lifecycle\.current\?\.cancel\(\)/);
  assert.match(screen, /setAudioModeAsync\(\{ allowsRecording: false \}\)/);
  assert.match(screen, /maximumRecordingTimer\.current = null/);
});

test('tab and primary-list geometry use one safe-area owner and flexible search rows', async () => {
  const [tabs, home, people] = await Promise.all([
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/index.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
  ]);
  assert.match(tabs, /nativeTabBarBaseHeight \+ nativeBottomInset/);
  assert.match(tabs, /paddingBottom: isWeb \? 6 : nativeBottomInset/);
  assert.doesNotMatch(home, /bottom: insets\.bottom \+ 16/);
  assert.doesNotMatch(people, /bottom: insets\.bottom \+ 16/);
  assert.doesNotMatch(home, /paddingBottom: insets\.bottom \+ 96/);
  assert.doesNotMatch(people, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(home, /searchField:[\s\S]*alignItems: 'center'/);
  assert.match(people, /searchField:[\s\S]*alignItems: 'center'/);
  assert.doesNotMatch(home, /searchIconLTR|searchIconRTL/);
  assert.doesNotMatch(people, /icon: \{ position: 'absolute'/);
});