import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';
import { s } from '../shared/adminStyles';
import { PageHeader } from '../components/Feedback';
// ── CHANGE PASSWORD ────────────────────────────────────
export const validateNewPassword = (value: string): string | null => {
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return null;
};

export const ChangePasswordPanel = () => {
  const { showModal } = useAppModal();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const validateConfirm = (value: string, against: string): string | null => {
    if (value !== against) return 'Passwords do not match.';
    return null;
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
    if (newPasswordError && !validateNewPassword(text)) setNewPasswordError(null);
    if (confirmPasswordError && !validateConfirm(confirmPassword, text)) setConfirmPasswordError(null);
  };
  const handleNewPasswordBlur = () => setNewPasswordError(validateNewPassword(newPassword));

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (confirmPasswordError && !validateConfirm(text, newPassword)) setConfirmPasswordError(null);
  };
  const handleConfirmPasswordBlur = () => setConfirmPasswordError(validateConfirm(confirmPassword, newPassword));

  const handleSubmit = async () => {
    const newPasswordErr = validateNewPassword(newPassword);
    const confirmPasswordErr = validateConfirm(confirmPassword, newPassword);
    setNewPasswordError(newPasswordErr);
    setConfirmPasswordError(confirmPasswordErr);
    if (newPasswordErr || confirmPasswordErr) return;

    try {
      setSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showModal({ title: 'Password updated', message: 'Your password has been changed.', variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to update password:', err);
      showModal({ title: 'Failed to update password', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account and security preferences."
      />
      <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Change Password</Text>
      </View>

      <View style={cp.fieldGroup}>
        <Text style={cp.label}>New password</Text>
        <View style={[cp.inputWrapper, !!newPasswordError && cp.inputError]}>
          <TextInput
            style={cp.input}
            placeholder="Enter a new password"
            placeholderTextColor="#aaa"
            value={newPassword}
            onChangeText={handleNewPasswordChange}
            onBlur={handleNewPasswordBlur}
            secureTextEntry={!showNew}
            editable={!submitting}
          />
          <TouchableOpacity onPress={() => setShowNew(!showNew)}>
            <Icon name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color="#888" />
          </TouchableOpacity>
        </View>
        {!!newPasswordError && <Text style={cp.errorText}>{newPasswordError}</Text>}
      </View>

      <View style={cp.fieldGroup}>
        <Text style={cp.label}>Confirm new password</Text>
        <View style={[cp.inputWrapper, !!confirmPasswordError && cp.inputError]}>
          <TextInput
            style={cp.input}
            placeholder="Re-enter the new password"
            placeholderTextColor="#aaa"
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            onBlur={handleConfirmPasswordBlur}
            secureTextEntry={!showConfirm}
            editable={!submitting}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
            <Icon name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={16} color="#888" />
          </TouchableOpacity>
        </View>
        {!!confirmPasswordError && <Text style={cp.errorText}>{confirmPasswordError}</Text>}
      </View>

      <TouchableOpacity
        style={[cp.submitBtn, submitting && cp.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        <Text style={cp.submitBtnTxt}>{submitting ? 'Updating…' : 'Update Password'}</Text>
      </TouchableOpacity>
      </View>
    </>
  );
};

export const cp = createStyles({
  fieldGroup: { marginBottom: 16, maxWidth: 360 },
  label: {
    color: B.txt2, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: B.bg, borderWidth: 1, borderColor: B.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputError: { borderColor: '#ef4444' },
  input: { flex: 1, color: B.txt, fontSize: 14, outlineStyle: 'none' } as any,
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  submitBtn: {
    backgroundColor: B.red, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 24,
    alignItems: 'center', alignSelf: 'flex-start', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
