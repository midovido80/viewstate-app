const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const appConfig = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'),
);

function fail(message) {
  console.error(`Android release configuration error: ${message}`);
  process.exit(1);
}

function normalizeOrigin(candidate) {
  const value = candidate?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    const localDevelopmentHost = ['localhost', '127.0.0.1', '10.0.2.2']
      .includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localDevelopmentHost) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const apiOrigin = normalizeOrigin(process.env.EXPO_PUBLIC_API_ORIGIN);
if (!apiOrigin) {
  fail(
    'set EXPO_PUBLIC_API_ORIGIN to the HTTPS API origin before building. '
    + 'EXPO_PUBLIC_DOMAIN is intentionally not accepted for release builds.',
  );
}

const androidPermissions = appConfig.expo?.android?.permissions ?? [];
if (!androidPermissions.includes('android.permission.RECORD_AUDIO')) {
  fail('app.json must explicitly include android.permission.RECORD_AUDIO.');
}

const audioPlugin = (appConfig.expo?.plugins ?? []).find(
  plugin => Array.isArray(plugin) && plugin[0] === 'expo-audio',
);
if (!audioPlugin || audioPlugin[1]?.recordAudioAndroid !== true) {
  fail('expo-audio must enable recordAudioAndroid.');
}

for (const plugin of appConfig.expo?.plugins ?? []) {
  if (!Array.isArray(plugin)) continue;
  const [name, options] = plugin;
  if (options?.microphonePermission === false) {
    fail(`${name} must not remove android.permission.RECORD_AUDIO.`);
  }
}

console.log(`Android release configuration verified for ${apiOrigin}.`);