// Run with: node --test scripts/enable-native-modules.test.js  (part of `npm test`)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { sync, MODULES } = require('./enable-native-modules');

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mod-'));
  for (const { name } of MODULES) {
    fs.mkdirSync(path.join(base, 'native-optional', name, 'android', 'src'), { recursive: true });
    fs.writeFileSync(path.join(base, 'native-optional', name, 'android', 'src', 'A.kt'), 'x');
    fs.writeFileSync(path.join(base, 'native-optional', name, 'expo-module.config.json'), '{}');
    fs.mkdirSync(path.join(base, 'modules', name, 'src'), { recursive: true });
    fs.writeFileSync(path.join(base, 'modules', name, 'src', 'index.ts'), 'js');
  }
  return base;
}
const has = (base, name) => fs.existsSync(path.join(base, 'modules', name, 'expo-module.config.json')) && fs.existsSync(path.join(base, 'modules', name, 'android', 'src', 'A.kt'));

test('without flags nothing native is in modules/ and the JS side stays', () => {
  const base = fixture();
  sync({}, base);
  for (const { name } of MODULES) { assert.equal(has(base, name), false); assert.ok(fs.existsSync(path.join(base, 'modules', name, 'src', 'index.ts'))); }
});

test('each flag enables only its own module', () => {
  const base = fixture();
  sync({ FASTTRACKS_DIALER: '1' }, base);
  assert.equal(has(base, 'fasttracks-dialer'), true);
  assert.equal(has(base, 'exotel-voice'), false);
  sync({ FASTTRACKS_VOIP_NATIVE: '1' }, base);
  assert.equal(has(base, 'fasttracks-dialer'), false, 'a copy from an earlier run is removed');
  assert.equal(has(base, 'exotel-voice'), true);
});

test('only the exact value 1 enables a module', () => {
  const base = fixture();
  for (const v of ['true', '0', '', 'yes']) { sync({ FASTTRACKS_DIALER: v }, base); assert.equal(has(base, 'fasttracks-dialer'), false, v); }
});
