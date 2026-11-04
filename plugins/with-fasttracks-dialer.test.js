// Run with: node --test plugins/with-fasttracks-dialer.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const { test } = require('node:test');
const plugin = require('./with-fasttracks-dialer');

const base = () => ({ manifest: { 'uses-permission': [], application: [{ $: {}, activity: [{ $: { 'android:name': '.MainActivity' } }] }] } });

test('adds the InCallService (bound by Telecom only), the tel: dialer activity, the call screen and the permissions, once', () => {
  const out = plugin.addToManifest(plugin.addToManifest(base()));
  const app = out.manifest.application[0];
  const svc = app.service.filter((s) => s.$['android:name'].endsWith('FtInCallService'));
  assert.equal(svc.length, 1);
  assert.equal(svc[0].$['android:permission'], 'android.permission.BIND_INCALL_SERVICE');
  assert.equal(svc[0]['meta-data'][0].$['android:name'], 'android.telecom.IN_CALL_SERVICE_UI');
  assert.ok(!JSON.stringify(svc[0]).includes('IN_CALL_SERVICE_RINGING'), 'Telecom keeps playing the ringtone of normal calls');
  const dialer = app.activity.filter((a) => a.$['android:name'].endsWith('DialerActivity'));
  assert.equal(dialer.length, 1);
  const filters = JSON.stringify(dialer[0]['intent-filter']);
  assert.ok(filters.includes('android.intent.action.DIAL') && filters.includes('"android:scheme":"tel"'));
  assert.equal(app.activity.filter((a) => a.$['android:name'].endsWith('InCallActivity')).length, 1);
  assert.equal(app.activity.filter((a) => a.$['android:name'] === '.MainActivity').length, 1, 'existing activities untouched');
  const perms = out.manifest['uses-permission'].map((p) => p.$['android:name']);
  for (const p of ['android.permission.ANSWER_PHONE_CALLS', 'android.permission.READ_PHONE_STATE', 'android.permission.USE_FULL_SCREEN_INTENT']) assert.ok(perms.includes(p), p);
  assert.ok(perms.includes('android.permission.CALL_PHONE'), 'to place a call the user confirmed from a tel: link');
});

test('without FASTTRACKS_DIALER=1 the plugin changes nothing', () => {
  delete process.env.FASTTRACKS_DIALER;
  const config = { name: 'x' };
  assert.equal(require('./with-fasttracks-dialer')(config), config);
});
