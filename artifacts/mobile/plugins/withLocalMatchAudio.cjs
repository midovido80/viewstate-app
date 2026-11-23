// Playback is foreground-only. Remove unused library services from the merged manifest.
const { withAndroidManifest } = require('expo/config-plugins');
module.exports = config => withAndroidManifest(config, mod => {
  const manifest = mod.modResults.manifest;
  manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const application = manifest.application[0];
  application.service ??= [];
  for (const name of ['expo.modules.audio.service.AudioControlsService', 'expo.modules.audio.service.AudioRecordingService']) {
    application.service = application.service.filter(service => service.$['android:name'] !== name);
    application.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
  }
  return mod;
});
