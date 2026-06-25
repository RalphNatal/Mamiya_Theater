import { Alert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert() is a no-op (it renders nothing), so any
 * error/confirmation shown via the plain RN Alert silently disappears in the
 * browser. Route web through window.alert instead; native platforms keep
 * using the real Alert.
 */
export const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    (globalThis as any).alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};
