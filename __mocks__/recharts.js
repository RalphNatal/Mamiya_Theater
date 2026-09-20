// Jest stub — recharts ships ESM (via @reduxjs/toolkit) that the RN preset
// doesn't transpile, and charts are irrelevant to the app-shell/router tests.
const React = require('react');
const Stub = ({ children }) => React.createElement(React.Fragment, null, children ?? null);
module.exports = new Proxy({}, { get: () => Stub });
