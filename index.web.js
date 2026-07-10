import 'regenerator-runtime/runtime';
import React from 'react';
import { AppRegistry } from 'react-native';
import App from './App';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import appInfo from './app.json';

const Root = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

AppRegistry.registerComponent(appInfo.name, () => Root);

AppRegistry.runApplication(appInfo.name, {
  rootTag: document.getElementById('root'),
});
