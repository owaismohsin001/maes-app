const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * The brand (customer) of a build is picked with `APP_BRAND` (default `maes`):
 * `src/brand/index.ts` is swapped for `src/brand/<APP_BRAND>.ts` at bundle
 * time, so one source tree builds one app per customer. The Android build
 * (`android/app/build.gradle`) refuses to build a flavor that doesn't match
 * `APP_BRAND`, so the JS bundle and the APK identity can't drift apart.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const APP_BRAND = process.env.APP_BRAND || 'maes';
const BRAND_DEFAULT = path.join(__dirname, 'src', 'brand', 'index.ts');
const BRAND_FILE = path.join(__dirname, 'src', 'brand', `${APP_BRAND}.ts`);

if (APP_BRAND !== 'maes' && !require('fs').existsSync(BRAND_FILE)) {
  throw new Error(`APP_BRAND=${APP_BRAND}: no such brand file ${BRAND_FILE}`);
}

const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const resolved = context.resolveRequest(context, moduleName, platform);
      if (
        APP_BRAND !== 'maes' &&
        resolved.type === 'sourceFile' &&
        resolved.filePath === BRAND_DEFAULT
      ) {
        return { type: 'sourceFile', filePath: BRAND_FILE };
      }
      return resolved;
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
