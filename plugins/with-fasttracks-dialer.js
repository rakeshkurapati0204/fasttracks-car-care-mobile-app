// Expo config plugin: makes Fasttracks eligible to be the phone (dialer) app on a company Android phone. It changes the manifest ONLY when the build is made
// with FASTTRACKS_DIALER=1 (EAS profile "development-dialer"); every other build is left exactly as it is today and can never become the phone app.
// Adds: the InCallService Telecom binds to, the call screen, the tel: handler Android requires for the phone-app role, the notification-button receiver, and
// the permissions (answer calls, read call state, full-screen incoming-call notification).
const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.CALL_PHONE', // only to place a call the user confirmed from a tel: link (DialerActivity)
  'android.permission.READ_PHONE_STATE',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK', // the proximity sensor turns the screen off at the ear, like any phone app (no accidental taps on the call screen)
];
const PKG = 'expo.modules.fasttracksdialer';

const intentFilter = (actions, categories, schemes = []) => ({
  action: actions.map((a) => ({ $: { 'android:name': a } })),
  category: categories.map((c) => ({ $: { 'android:name': c } })),
  ...(schemes.length ? { data: schemes.map((s) => ({ $: { 'android:scheme': s } })) } : {}),
});

function addToManifest(manifest) {
  const m = manifest.manifest;
  m['uses-permission'] = m['uses-permission'] ?? [];
  for (const name of PERMISSIONS) {
    if (!m['uses-permission'].some((p) => p.$['android:name'] === name)) m['uses-permission'].push({ $: { 'android:name': name } });
  }
  const app = m.application[0];
  app.service = app.service ?? [];
  app.activity = app.activity ?? [];
  app.receiver = app.receiver ?? [];
  const has = (list, name) => list.some((x) => x.$['android:name'] === name);

  if (!has(app.service, `${PKG}.FtInCallService`)) {
    app.service.push({
      $: { 'android:name': `${PKG}.FtInCallService`, 'android:permission': 'android.permission.BIND_INCALL_SERVICE', 'android:exported': 'true' },
      'meta-data': [{ $: { 'android:name': 'android.telecom.IN_CALL_SERVICE_UI', 'android:value': 'true' } }], // we draw the call UI; Telecom still plays the ringtone
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.telecom.InCallService' } }] }],
    });
  }
  if (!has(app.activity, `${PKG}.InCallActivity`)) {
    app.activity.push({ $: { 'android:name': `${PKG}.InCallActivity`, 'android:exported': 'false', 'android:launchMode': 'singleTask', 'android:showWhenLocked': 'true', 'android:turnScreenOn': 'true', 'android:excludeFromRecents': 'true' } });
  }
  if (!has(app.activity, `${PKG}.DialerActivity`)) {
    app.activity.push({
      $: { 'android:name': `${PKG}.DialerActivity`, 'android:exported': 'true', 'android:excludeFromRecents': 'true', 'android:theme': '@android:style/Theme.Translucent.NoTitleBar' },
      'intent-filter': [
        intentFilter(['android.intent.action.DIAL'], ['android.intent.category.DEFAULT'], ['tel']),
        intentFilter(['android.intent.action.DIAL'], ['android.intent.category.DEFAULT']),
        intentFilter(['android.intent.action.VIEW'], ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'], ['tel']),
      ],
    });
  }
  if (!has(app.receiver, `${PKG}.CallActionReceiver`)) {
    app.receiver.push({ $: { 'android:name': `${PKG}.CallActionReceiver`, 'android:exported': 'false' } });
  }
  return manifest;
}

const withFasttracksDialer = (config) => {
  if (process.env.FASTTRACKS_DIALER !== '1') return config; // not a phone-app build: no change at all
  return withAndroidManifest(config, (c) => {
    c.modResults = addToManifest(c.modResults);
    return c;
  });
};

module.exports = createRunOncePlugin(withFasttracksDialer, 'with-fasttracks-dialer', '0.1.0');
module.exports.addToManifest = addToManifest; // exported for the unit test
