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
  // When the profile's full_name is also empty (rare — Google usually provides
  // it), the modal collects a name alongside the phone number.
  nameMissing?: boolean;
  onComplete: () => void;
};

const CompleteProfileModal = ({ visible, userId, nameMissing = false, onComplete }: Props) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // This component is itself rendered inside a <Modal>, so errors are shown
  // inline rather than via the shared FeedbackModal — stacking a second
  // Modal on top of this one renders awkwardly on web.
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!userId) return;
    setError(null);

    if (nameMissing && !fullName.trim()) {
      setError('Please enter your name to continue.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter a mobile number to continue.');
      return;
    }

    try {
      setSubmitting(true);

      // Always resolve the CURRENTLY signed-in user rather than trusting a prop
      // that could be stale after an account switch — the number must land on
      // this user's row and no one else's.
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error('You are not signed in.');

      // Does a profiles row already exist? .maybeSingle() so zero rows returns
      // null instead of throwing "cannot coerce to a single object".
      const { data: existing, error: readError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (readError) throw readError;

      if (existing) {
        // Update only the fields we own — never role (protected by a DB
        // trigger) or email (auth-managed).
        const updates: Record<string, string> = {
          mobile_number: phone.trim(),
          updated_at: new Date().toISOString(),
        };
        if (nameMissing) updates.full_name = fullName.trim();

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id);
        if (updateError) throw updateError;
      } else {
        // No row yet (trigger missed, or an older broken account) — create one
        // keyed to auth.uid() so the number is never lost to a silent 0-row
        // update. Fall back full_name → name → email prefix, same as the trigger.
        const meta = (user.user_metadata ?? {}) as any;
        const fallbackName =
          meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : null);
        const { error: upsertError } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            email: user.email ?? null,
            full_name: nameMissing ? fullName.trim() : fallbackName,
            role: 'user',
            mobile_number: phone.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        if (upsertError) throw upsertError;
      }

      setPhone('');
      setFullName('');
      onComplete();
    } catch (err: any) {
      console.error('Failed to save profile details:', err);
      setError(err.message ?? 'Could not save your details.');
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
          {nameMissing && (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="#bbb"
              value={fullName}
              onChangeText={setFullName}
              editable={!submitting}
            />
          )}
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
