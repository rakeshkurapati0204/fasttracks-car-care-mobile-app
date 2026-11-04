// Run with: node --test plugins/with-exotel-voice.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const { test } = require('node:test');
const plugin = require('./with-exotel-voice');

const base = () => ({ manifest: { 'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }], application: [{ $: {}, service: [] }] } });

test('adds the VoIP permissions and the phoneCall|microphone foreground service, without duplicates', () => {
  const out = plugin.addToManifest(plugin.addToManifest(base()));
  const names = out.manifest['uses-permission'].map((p) => p.$['android:name']);
  for (const n of ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_PHONE_CALL', 'android.permission.FOREGROUND_SERVICE_MICROPHONE']) assert.ok(names.includes(n), n);
  assert.equal(names.filter((n) => n === 'android.permission.INTERNET').length, 1);
  const services = out.manifest.application[0].service;
  assert.equal(services.length, 1);
  assert.equal(services[0].$['android:foregroundServiceType'], 'phoneCall|microphone');
  assert.equal(services[0].$['android:exported'], 'false');
});

test('without FASTTRACKS_VOIP_NATIVE=1 the plugin changes nothing', () => {
  delete process.env.FASTTRACKS_VOIP_NATIVE;
  const config = { name: 'x' };
  const resolved = require('./with-exotel-voice')(config);
  assert.equal(resolved, config);
});
