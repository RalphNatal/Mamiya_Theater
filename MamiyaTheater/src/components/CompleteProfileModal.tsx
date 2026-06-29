import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
  visible: boolean;
  userId: string | null;
  onComplete: () => void;
};

const CompleteProfileModal = ({ visible, userId, onComplete }: Props) => {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // This component is itself rendered inside a <Modal>, so errors are shown
  // inline rather than via the shared FeedbackModal — stacking a second
  // Modal on top of this one renders awkwardly on web.
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!userId) return;
    setError(null);

    if (!phone.trim()) {
      setError('Please enter a mobile number to continue.');
      return;
    }

    try {
      setSubmitting(true);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ mobile_number: phone.trim() })
        .eq('id', userId);
      if (updateError) throw updateError;

      setPhone('');
      onComplete();
    } catch (err: any) {
      console.error('Failed to save mobile number:', err);
      setError(err.message ?? 'Could not save your mobile number.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            Google sign-in doesn&apos;t share a phone number with us — add one to finish setting up your account.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="(808) 555-0123"
            placeholderTextColor="#bbb"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!submitting}
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Save and continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f0e2a', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#666', lineHeight: 19, marginBottom: 20 },
  input: {
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, backgroundColor: '#fafafa',
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: '#1a1a1a', marginBottom: 18,
  },
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.7, shadowOpacity: 0 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorText: { color: '#C8102E', fontSize: 12, marginTop: -10, marginBottom: 14 },
});

export default CompleteProfileModal;
