import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createStyles, typography } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// Shared data-load error state with a retry. Dropped into any screen's error
// branch so a failed fetch (e.g. offline on mobile data) can be re-run in
// place — no full-page reload. The #888 message matches the app's existing
// empty/error text on both the light (Home / All Shows) and dark (Show Details
// / Seat Selection) surfaces; the brand-red button stays high-contrast on both.
// ─────────────────────────────────────────────────────────────────────────

type Props = {
  message: string;
  onRetry: () => void;
};

const LoadError = ({ message, onRetry }: Props) => (
  <View style={styles.wrap}>
    <Text style={styles.message}>{message}</Text>
    <TouchableOpacity
      style={styles.retryBtn}
      onPress={onRetry}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Try again"
    >
      <Text style={styles.retryText}>Try again</Text>
    </TouchableOpacity>
  </View>
);

const styles = createStyles({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 16 },
  message: { ...typography.body, fontSize: 14, color: '#888', textAlign: 'center' },
  retryBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export default LoadError;
