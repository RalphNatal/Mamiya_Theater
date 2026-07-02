import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles, typography } from '../theme';

export type FeedbackVariant = 'error' | 'success' | 'info';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: FeedbackVariant;
  onClose: () => void;
};

const VARIANT_CONFIG: Record<FeedbackVariant, { icon: string; color: string; tint: string; buttonColor: string }> = {
  error:   { icon: 'alert-circle',       color: '#C8102E', tint: 'rgba(200,16,46,0.12)',  buttonColor: '#C8102E' },
  success: { icon: 'checkmark-circle',   color: '#16a34a', tint: 'rgba(22,163,74,0.12)',  buttonColor: '#16a34a' },
  info:    { icon: 'information-circle', color: '#c9a84c', tint: 'rgba(201,168,76,0.15)', buttonColor: '#12122a' },
};

const FeedbackModal = ({ visible, title, message, variant = 'info', onClose }: Props) => {
  const config = VARIANT_CONFIG[variant];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: config.tint }]}>
            <Icon name={config.icon} size={28} color={config.color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: config.buttonColor }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = createStyles({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    width: '100%', maxWidth: 380, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { ...typography.heading2, fontSize: 18, lineHeight: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  message: { ...typography.caption, fontSize: 13, lineHeight: 19, color: '#666', textAlign: 'center', marginBottom: 22 },
  button: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 36, alignItems: 'center', alignSelf: 'stretch' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
});

export default FeedbackModal;
