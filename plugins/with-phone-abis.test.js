// Run with: node --test plugins/with-phone-abis.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { addAbiFilters } = require('./with-phone-abis');

const gradle = 'android {\n    defaultConfig {\n        applicationId "x"\n        versionCode 1\n    }\n}\n';

test('adds the phone CPU types to defaultConfig, once, and keeps the rest', () => {
  const once = addAbiFilters(gradle);
  assert.ok(once.includes("abiFilters 'armeabi-v7a', 'arm64-v8a'"));
  assert.ok(!once.includes('x86'));
  assert.ok(once.includes('applicationId "x"') && once.includes('versionCode 1'));
  assert.equal(addAbiFilters(once), once, 'running it again changes nothing');
});
