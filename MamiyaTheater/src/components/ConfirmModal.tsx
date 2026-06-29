import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Same backdrop/card/icon-circle visual language as FeedbackModal, but with
// Cancel + Confirm actions instead of a single OK — for destructive actions
// (e.g. delete) that need an explicit yes/no instead of just an acknowledgment.
const ConfirmModal = ({
  visible, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', busy, onConfirm, onCancel,
}: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Icon name="alert-circle" size={28} color="#C8102E" />
        </View>
        <Text style={styles.title}>{title}</Text>
        {!!message && <Text style={styles.message}>{message}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85} disabled={busy}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            activeOpacity={0.85}
            disabled={busy}
          >
            <Text style={styles.confirmText}>{busy ? 'Deleting...' : confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
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
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(200,16,46,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 19, marginBottom: 22 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#f0f0f0' },
  cancelText: { color: '#333', fontWeight: '700', fontSize: 14 },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#C8102E' },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default ConfirmModal;
