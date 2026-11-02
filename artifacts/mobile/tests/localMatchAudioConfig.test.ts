import { URL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
test('native cue cannot enable microphone or background playback capabilities', () => {
  const plugin = config.plugins.find((p: any) => Array.isArray(p) && p[0] === 'expo-audio')[1];
  assert.deepEqual(plugin, { microphonePermission: false, recordAudioAndroid: false, enableBackgroundRecording: false });
  for (const permission of ['RECORD_AUDIO', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'FOREGROUND_SERVICE_MICROPHONE']) assert.ok(config.android.blockedPermissions.includes(`android.permission.${permission}`));
  const require = createRequire(import.meta.url);
  const installedExpo = require('expo/bundledNativeModules.json');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(installedExpo['expo-audio'], '~1.1.1'); assert.equal(pkg.dependencies['expo-audio'], '1.1.1');
});
test('local cue is a short small mono PCM file bundled in the app', () => {
  const wav = readFileSync(new URL('../assets/sounds/match-cue.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 22050); assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(wav.length < 25000); assert.ok(wav.readUInt32LE(40) / 44100 < 0.5);
});
