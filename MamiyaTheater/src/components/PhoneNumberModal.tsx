import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  visible: boolean;
  saving: boolean;
  onSubmit: (mobileNumber: string) => void;
};

const PhoneNumberModal = ({ visible, saving, onSubmit }: Props) => {
  const [mobileNumber, setMobileNumber] = useState('');
  // This component is itself rendered inside a <Modal>, so validation errors
  // are shown inline rather than via the shared FeedbackModal — stacking a
  // second Modal on top of this one renders awkwardly on web.
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!mobileNumber.trim()) {
      setError('Please enter a mobile number to continue.');
      return;
    }
    setError(null);
    onSubmit(mobileNumber.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.description}>
            Please enter your mobile number to finish setting up your account.
          </Text>

          <View style={styles.inputWrapper}>
            <Icon name="call-outline" size={16} color="#aaa" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="(808) 555-0123"
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
              value={mobileNumber}
              onChangeText={setMobileNumber}
            />
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={saving}
          >
            <Text style={styles.submitBtnText}>{saving ? 'Saving...' : 'Save & Continue'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    width: '100%', maxWidth: 420,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  description: { fontSize: 13, color: '#777', textAlign: 'center', lineHeight: 19, marginBottom: 22 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fafafa', marginBottom: 20,
  },
  inputIcon: {},
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none' } as any,
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorText: { color: '#C8102E', fontSize: 12, marginTop: -10, marginBottom: 14 },
});

export default PhoneNumberModal;
