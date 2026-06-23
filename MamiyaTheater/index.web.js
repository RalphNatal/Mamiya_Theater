import { AppRegistry } from 'react-native';
import App from './App';
import appInfo from './app.json';

AppRegistry.registerComponent(appInfo.name, () => App);

AppRegistry.runApplication(appInfo.name, {
  rootTag: document.getElementById('root'),
});