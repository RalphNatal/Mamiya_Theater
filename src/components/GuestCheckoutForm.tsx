import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { createStyles, typography, colors } from '../theme';

// Guest identity collected before payment. This is exactly the shape the
// checkout screen hands to create_pending_booking (p_guest_name / p_guest_email).
export type GuestInfo = { guestName: string; guestEmail: string };

// Same permissive check the RPC-side validation expects: one @, a dot in the
// domain, no spaces. Kept local so this component validates without importing
// checkout internals.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { name?: string; email?: string; confirm?: string };

type Props = {
  // Fired only when every field passes validation. The parent stores this in
  // local state and reveals the Stripe/PayPal payment options.
  onSubmit: (info: GuestInfo) => void;
  // Sends the user to the login screen ("Log In" link in the intro line).
  onLoginPress: () => void;
  // Prefill when the user comes back to edit details they already entered.
  initial?: GuestInfo | null;
};

// Guest details step, shown on the checkout screen when the buyer is NOT logged
// in. Collects Full Name + Email + Confirm Email with inline (red) validation,
// then hands a validated { guestName, guestEmail } up to the checkout screen.
const GuestCheckoutForm = ({ onSubmit, onLoginPress, initial }: Props) => {
  const [fullName, setFullName] = useState(initial?.guestName ?? '');
  const [email, setEmail] = useState(initial?.guestEmail ?? '');
  const [confirmEmail, setConfirmEmail] = useState(initial?.guestEmail ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  // Clear a field's error as soon as the user edits it, so a stale red message
  // doesn't linger while they're fixing it.
  const clearError = (key: keyof FieldErrors) =>
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const handleContinue = () => {
    const name = fullName.trim();
    const mail = email.trim();
    const confirm = confirmEmail.trim();
    const next: FieldErrors = {};

    if (!name) next.name = 'Please enter your full name.';

    if (!mail) next.email = 'Please enter your email address.';
    else if (!EMAIL_RE.test(mail)) next.email = 'Please enter a valid email address.';

    if (!confirm) next.confirm = 'Please re-enter your email address.';
    else if (mail && mail.toLowerCase() !== confirm.toLowerCase()) {
      next.confirm = 'The two email addresses do not match.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({ guestName: name, guestEmail: mail });
  };

  return (
    <View>
      <Text style={styles.intro}>
        Checkout as Guest or{' '}
        <Text style={styles.introLink} onPress={onLoginPress}>Log In</Text>
        {' '}to save your tickets.
      </Text>

      <Text style={styles.fieldLabel}>Full Name</Text>
      <TextInput
        style={[styles.input, !!errors.name && styles.inputError]}
        value={fullName}
        onChangeText={t => { setFullName(t); clearError('name'); }}
        placeholder="Your full name"
        placeholderTextColor={colors.textMutedOnDark}
      />
      {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

      <Text style={styles.fieldLabel}>Email Address</Text>
      <TextInput
        style={[styles.input, !!errors.email && styles.inputError]}
        value={email}
        onChangeText={t => { setEmail(t); clearError('email'); }}
        placeholder="you@example.com"
        placeholderTextColor={colors.textMutedOnDark}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

      <Text style={styles.fieldLabel}>Confirm Email Address</Text>
      <TextInput
        style={[styles.input, !!errors.confirm && styles.inputError]}
        value={confirmEmail}
        onChangeText={t => { setConfirmEmail(t); clearError('confirm'); }}
        placeholder="Re-enter your email"
        placeholderTextColor={colors.textMutedOnDark}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {!!errors.confirm && <Text style={styles.errorText}>{errors.confirm}</Text>}

      <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
        <Text style={styles.continueBtnText}>Continue to Payment</Text>
      </TouchableOpacity>
    </View>
  );
};

// Matches CheckoutScreen's field styling (same input/label look) so the guest
// step is visually seamless with the rest of the billing card.
const styles = createStyles({
  intro: { ...typography.caption, color: '#aaa', lineHeight: 18, marginBottom: 4 },
  introLink: { color: '#C8102E', fontWeight: '700' },

  fieldLabel: { ...typography.caption, color: colors.textMutedOnDark, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    ...typography.body, backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff',
  },
  inputError: { borderColor: '#f87171' },
  errorText: { color: '#f87171', fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 16 },

  continueBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  continueBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default GuestCheckoutForm;
