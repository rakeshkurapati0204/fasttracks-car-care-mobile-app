/* global __dirname */
// Run with: node --test scripts/check-trial-build.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { check } = require('./check-trial-build');

const GOOD = { FASTTRACKS_TRIAL: '1', FASTTRACKS_DIALER: '1', EXPO_PUBLIC_API_URL: 'https://staging.fasttrackscarcare.in/api/v1' };
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));

test('a good staging URL passes, and every other build is not checked at all', () => {
  assert.deepEqual(check(GOOD), []);
  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ EXPO_PUBLIC_API_URL: 'http://192.168.1.5:4000/api/v1' }), []); // a dev or preview build: not our business
});

test('refuses http, localhost, private IPs, placeholders and .local names', () => {
  for (const url of ['http://staging.fasttrackscarcare.in/api/v1', 'https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://192.168.68.104/api/v1', 'https://10.0.0.7/api/v1',
    'https://172.20.1.1/api/v1', 'https://my-mac.local/api/v1', 'https://REPLACE-WITH-STAGING-HOST.invalid/api/v1', 'https://[::1]/api/v1']) {
    assert.ok(check({ ...GOOD, EXPO_PUBLIC_API_URL: url }).length > 0, url);
  }
});

test('refuses the production dashboard (and extra production hosts)', () => {
  assert.match(check({ ...GOOD, EXPO_PUBLIC_API_URL: 'https://dashboard.fasttrackscarcare.in/api/v1' }).join(), /PRODUCTION/);
  assert.match(check({ ...GOOD, EXPO_PUBLIC_API_URL: 'https://DASHBOARD.fasttrackscarcare.in/api/v1' }).join(), /PRODUCTION/);
  assert.match(check({ ...GOOD, EXPO_PUBLIC_API_URL: 'https://api.other.com/api/v1', FASTTRACKS_PRODUCTION_HOSTS: 'x.com, api.other.com' }).join(), /PRODUCTION/);
});

test('refuses a missing, malformed or odd URL', () => {
  for (const url of [undefined, '', 'not a url', 'https://staging.x.com/', 'https://staging.x.com/api', 'https://u:p@staging.x.com/api/v1', 'https://staging.x.com/api/v1?x=1']) {
    assert.ok(check({ ...GOOD, EXPO_PUBLIC_API_URL: url }).length > 0, String(url));
  }
});

test('refuses test aids and a missing dialer flag inside a trial build', () => {
  for (const flag of ['EXPO_PUBLIC_VOIP_MOCK', 'EXPO_PUBLIC_VOIP_NATIVE', 'EXPO_PUBLIC_AUTOANSWER_LEARN']) assert.ok(check({ ...GOOD, [flag]: 'true' }).length > 0, flag);
  assert.ok(check({ ...GOOD, FASTTRACKS_DIALER: '0' }).length > 0);
});

test('eas.json: sales-trial is a release APK with internal distribution, no dev client, no test aids', () => {
  const p = eas.build['sales-trial'];
  assert.equal(p.distribution, 'internal');
  assert.equal(p.android.buildType, 'apk');
  assert.equal(p.developmentClient, undefined);
  assert.equal(p.extends, undefined, 'must not inherit the dev client from another profile');
  assert.equal(p.autoIncrement, false);
  assert.equal(p.env.FASTTRACKS_DIALER, '1');
  assert.equal(p.env.FASTTRACKS_TRIAL, '1');
  assert.ok(/^https:\/\//.test(p.env.EXPO_PUBLIC_API_URL));
  for (const k of Object.keys(p.env)) assert.ok(['FASTTRACKS_DIALER', 'FASTTRACKS_TRIAL', 'EXPO_PUBLIC_API_URL'].includes(k), `unexpected env ${k}`);
});

test('eas.json: the sales-trial URL is the staging dashboard and passes the guard', () => {
  const p = eas.build['sales-trial'];
  assert.equal(new URL(p.env.EXPO_PUBLIC_API_URL).host, 'staging.dashboard.fasttrackscarcare.in');
  assert.deepEqual(check({ ...p.env }), []);
});

test('eas.json: every existing profile is exactly as before', () => {
  assert.deepEqual(eas.build.development, { developmentClient: true, distribution: 'internal', android: { buildType: 'apk' } });
  assert.deepEqual(eas.build.preview, { distribution: 'internal', android: { buildType: 'apk' }, env: { EXPO_PUBLIC_API_URL: 'https://dashboard.fasttrackscarcare.in/api/v1' } });
  assert.deepEqual(eas.build.production, { autoIncrement: true, env: { EXPO_PUBLIC_API_URL: 'https://dashboard.fasttrackscarcare.in/api/v1' } });
  assert.deepEqual(eas.build['development-voip'], { extends: 'development', env: { FASTTRACKS_VOIP_NATIVE: '1', EXPO_PUBLIC_VOIP_NATIVE: 'true' } });
  assert.deepEqual(eas.build['development-dialer'], { extends: 'development', env: { FASTTRACKS_DIALER: '1' } });
  assert.deepEqual(Object.keys(eas.build).sort(), ['development', 'development-dialer', 'development-voip', 'preview', 'production', 'sales-trial', 'staging']);
});
