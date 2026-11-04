/* global __dirname */
// Puts the optional native modules into place for builds that need them, and keeps them OUT of every other build.
// Why: Expo autolinks every folder in modules/ that has an expo-module.config.json, so an experimental Kotlin module there would be compiled into ALL builds,
// including production. The Kotlin sources therefore live in native-optional/<name>/ and are copied into modules/<name>/ only when the matching flag is set:
//   FASTTRACKS_DIALER=1       -> fasttracks-dialer  (phone-app auto-answer; EAS profile development-dialer)
//   FASTTRACKS_VOIP_NATIVE=1  -> exotel-voice       (Exotel Voice SDK skeleton; EAS profile development-voip)
// Runs automatically on EAS as the "eas-build-pre-install" hook; locally run it by hand before `expo run:android` (same env var).
// Without the flag it also REMOVES a copy left by an earlier run, so a normal build can never pick one up.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const MODULES = [
  { name: 'fasttracks-dialer', flag: 'FASTTRACKS_DIALER' },
  { name: 'exotel-voice', flag: 'FASTTRACKS_VOIP_NATIVE' },
];
const PARTS = ['android', 'expo-module.config.json'];

function sync(env = process.env, base = root) {
  const report = [];
  for (const { name, flag } of MODULES) {
    const on = env[flag] === '1';
    for (const part of PARTS) {
      const src = path.join(base, 'native-optional', name, part);
      const dst = path.join(base, 'modules', name, part);
      fs.rmSync(dst, { recursive: true, force: true });
      if (on) fs.cpSync(src, dst, { recursive: true });
    }
    report.push(`${name}: ${on ? 'ENABLED' : 'off'}`);
  }
  return report;
}

module.exports = { sync, MODULES };
if (require.main === module) console.log(`[native modules] ${sync().join(', ')}`);
