// Jest stub — the PayPal SDK loader needs a real browser.
const React = require('react');
const PayPalScriptProvider = ({ children }) => React.createElement(React.Fragment, null, children ?? null);
const PayPalButtons = () => null;
const usePayPalScriptReducer = () => [{ isPending: false, isRejected: false }, () => {}];
module.exports = { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer };
