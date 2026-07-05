import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { isValidEmail } from '../lib/validation';
import { useAppModal } from './ModalProvider';
import { createStyles, colors } from '../theme';

// ─────────────────────────────────────────────────────────────────────────
// Shared newsletter signup — the SAME input + "Join" logic for both the
// desktop and mobile footers in HomeScreen, so the behavior lives in one place.
// The write is server-side (newsletter-subscribe Edge Function, service role);
// this only validates the email and reports the result.
// ─────────────────────────────────────────────────────────────────────────

type Props = {
  /** Desktop footer shows the descriptive line above the input; mobile doesn't. */
  showDescription?: boolean;
};

const NewsletterSignup = ({ showDescription = false }: Props) => {
  const { showModal } = useAppModal();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    const trimmed = email.trim();
    if (!trimmed || !isValidEmail(trimmed)) {
      showModal({
        title: 'Enter a valid email',
        message: 'Please enter a valid email address so we know where to send updates.',
        variant: 'error',
      });
      return;
    }

    try {
      setSubmitting(true);
      const { error } = await supabase.functions.invoke('newsletter-subscribe', {
        body: { email: trimmed },
      });
      if (error) throw error;

      showModal({
        title: "You're subscribed!",
        message: "Thanks for joining — we'll send the latest shows, alerts, and exclusive previews your way.",
        variant: 'success',
      });
      setEmail('');
    } catch (err) {
      logger.error('Newsletter subscribe failed:', err);
      showModal({
        title: 'Subscription failed',
        message: 'Something went wrong subscribing you. Please try again in a moment.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {showDescription && (
        <Text style={styles.newsletterDesc}>
          Subscribe for the latest updates, alerts, and exclusive previews.
        </Text>
      )}
      <View style={styles.newsletterRow}>
        <TextInput
          style={styles.newsletterInput}
          placeholder="Email address"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          onSubmitEditing={handleJoin}
        />
        <TouchableOpacity
          style={[styles.joinBtn, submitting && styles.joinBtnDisabled]}
          onPress={handleJoin}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={styles.joinBtnText}>{submitting ? '…' : 'Join'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = createStyles({
  newsletterDesc: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 17, marginBottom: 12 },
  newsletterRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden' },
  newsletterInput: { flex: 1, fontSize: 12, color: '#333', paddingHorizontal: 12, paddingVertical: 10 },
  joinBtn: { backgroundColor: '#C8102E', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

export default NewsletterSignup;
