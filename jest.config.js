// The brand under test, like the Metro bundle: `APP_BRAND=castillo npm test`
// runs the whole suite against src/brand/castillo.ts (default: maes).
const APP_BRAND = process.env.APP_BRAND || 'maes';

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper:
    APP_BRAND === 'maes'
      ? {}
      : { '^./brand$': `<rootDir>/src/brand/${APP_BRAND}.ts` },
  // React Native requires many modules lazily during the first render; on a
  // cold Babel cache that transform time lands inside the first test and
  // blows the 5 s default.
  testTimeout: 30000,
};
