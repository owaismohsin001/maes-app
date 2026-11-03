module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // React Native requires many modules lazily during the first render; on a
  // cold Babel cache that transform time lands inside the first test and
  // blows the 5 s default.
  testTimeout: 30000,
};
