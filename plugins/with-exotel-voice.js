// Expo config plugin for the in-app VoIP calling module (modules/exotel-voice). It changes the Android manifest ONLY when the build is made with
// FASTTRACKS_VOIP_NATIVE=1 (EAS profile "development-voip"); every other build is left exactly as it is today.
// Adds: the permissions a VoIP call needs, and the foreground service (type phoneCall|microphone) that keeps call audio alive in the background.
const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.RECORD_AUDIO', // microphone, requested at runtime before the first call
  'android.permission.MODIFY_AUDIO_SETTINGS', // speaker on/off
  'android.permission.POST_NOTIFICATIONS', // Android 13+: the "call in progress" notification, requested at runtime
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.INTERNET',
];
const SERVICE_NAME = 'expo.modules.exotelvoice.ExotelCallService';

function addToManifest(manifest) {
  const m = manifest.manifest;
  m['uses-permission'] = m['uses-permission'] ?? [];
  for (const name of PERMISSIONS) {
    if (!m['uses-permission'].some((p) => p.$['android:name'] === name)) m['uses-permission'].push({ $: { 'android:name': name } });
  }
  const app = m.application[0];
  app.service = app.service ?? [];
  if (!app.service.some((s) => s.$['android:name'] === SERVICE_NAME)) {
    app.service.push({ $: { 'android:name': SERVICE_NAME, 'android:exported': 'false', 'android:foregroundServiceType': 'phoneCall|microphone' } });
  }
  return manifest;
}

const withExotelVoice = (config) => {
  if (process.env.FASTTRACKS_VOIP_NATIVE !== '1') return config; // not a VoIP build: no change at all
  return withAndroidManifest(config, (c) => {
    c.modResults = addToManifest(c.modResults);
    return c;
  });
};

module.exports = createRunOncePlugin(withExotelVoice, 'with-exotel-voice', '0.1.0');
module.exports.addToManifest = addToManifest; // exported for the unit test
