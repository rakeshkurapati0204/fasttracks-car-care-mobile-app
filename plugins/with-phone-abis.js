// Expo config plugin: ships only the CPU types real phones use (arm64-v8a, armeabi-v7a). The x86 / x86_64 copies of every native library are for emulators and
// roughly double the native part of the APK. Set FASTTRACKS_ALL_ABIS=1 to build for an emulator.
const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

const ABIS = ['armeabi-v7a', 'arm64-v8a'];
const MARK = '// fasttracks-abis';

/** build.gradle text -> the same with an abiFilters line in defaultConfig (once). */
function addAbiFilters(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const line = `        ndk { abiFilters ${ABIS.map((a) => `'${a}'`).join(', ')} } ${MARK}\n`;
  return gradle.replace(/(defaultConfig\s*\{\n)/, `$1${line}`);
}

const withPhoneAbis = (config) =>
  process.env.FASTTRACKS_ALL_ABIS === '1' ? config : withAppBuildGradle(config, (c) => { c.modResults.contents = addAbiFilters(c.modResults.contents); return c; });

module.exports = createRunOncePlugin(withPhoneAbis, 'with-phone-abis', '1.0.0');
module.exports.addAbiFilters = addAbiFilters;
