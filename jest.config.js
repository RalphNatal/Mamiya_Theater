module.exports = {
  preset: '@react-native/jest-preset',
  // The RN preset only transpiles react-native itself; these deps ship untranspiled
  // ESM that the app imports directly, so let babel handle them too.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-vector-icons)/)',
  ],
};
