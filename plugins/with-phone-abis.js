// Expo config plugin: ships only the CPU types real phones use (arm64-v8a, armeabi-v7a). The x86 / x86_64 copies of every native library are for emulators and
// roughly double the native part of the APK. Set FASTTRACKS_ALL_ABIS=1 to build for an emulator.
const { withAppBuildGradle, withGradleProperties, createRunOncePlugin } = require('@expo/config-plugins');

const ABIS = ['armeabi-v7a', 'arm64-v8a'];
const MARK = '// fasttracks-abis';

/** build.gradle text -> the same with an abiFilters line in defaultConfig (once). */
function addAbiFilters(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const line = `        ndk { abiFilters ${ABIS.map((a) => `'${a}'`).join(', ')} } ${MARK}\n`;
  return gradle.replace(/(defaultConfig\s*\{\n)/, `$1${line}`);
}

/** gradle.properties items -> the same with reactNativeArchitectures set to the phone CPU types: the React Native build reads this one, and builds (and packs) only those. */
function setArchitectures(items) {
  const value = ABIS.join(',');
  const rest = items.filter((i) => !(i.type === 'property' && i.key === 'reactNativeArchitectures'));
  return [...rest, { type: 'property', key: 'reactNativeArchitectures', value }];
}

const withPhoneAbis = (config) => {
  if (process.env.FASTTRACKS_ALL_ABIS === '1') return config;
  config = withAppBuildGradle(config, (c) => { c.modResults.contents = addAbiFilters(c.modResults.contents); return c; });
  return withGradleProperties(config, (c) => { c.modResults = setArchitectures(c.modResults); return c; });
};

module.exports = createRunOncePlugin(withPhoneAbis, 'with-phone-abis', '1.0.0');
module.exports.addAbiFilters = addAbiFilters;
module.exports.setArchitectures = setArchitectures;
