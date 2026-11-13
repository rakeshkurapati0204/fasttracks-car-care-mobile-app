// Run with: node --test plugins/with-phone-abis.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { addAbiFilters, setArchitectures } = require('./with-phone-abis');

const gradle = 'android {\n    defaultConfig {\n        applicationId "x"\n        versionCode 1\n    }\n}\n';

test('adds the phone CPU types to defaultConfig, once, and keeps the rest', () => {
  const once = addAbiFilters(gradle);
  assert.ok(once.includes("abiFilters 'armeabi-v7a', 'arm64-v8a'"));
  assert.ok(!once.includes('x86'));
  assert.ok(once.includes('applicationId "x"') && once.includes('versionCode 1'));
  assert.equal(addAbiFilters(once), once, 'running it again changes nothing');
});

test('gradle.properties gets the phone CPU types, replacing the all-CPU line', () => {
  const out = setArchitectures([{ type: 'comment', value: 'x' }, { type: 'property', key: 'reactNativeArchitectures', value: 'armeabi-v7a,arm64-v8a,x86,x86_64' }, { type: 'property', key: 'newArchEnabled', value: 'true' }]);
  const arch = out.filter((i) => i.key === 'reactNativeArchitectures');
  assert.equal(arch.length, 1);
  assert.equal(arch[0].value, 'armeabi-v7a,arm64-v8a');
  assert.ok(out.some((i) => i.key === 'newArchEnabled'), 'other lines untouched');
});
