import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ImageBackground,
  StatusBar,
} from 'react-native';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup') => void;
};

const SignupScreen = ({ onNavigate }: Props) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 6) return { label: 'Weak', color: '#e53935', width: '25%' };
    if (password.length < 10) return { label: 'Fair', color: '#fb8c00', width: '55%' };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) return { label: 'Strong', color: '#43a047', width: '100%' };
    return { label: 'Good', color: '#00897b', width: '75%' };
  };

  const strength = getPasswordStrength();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      <View style={styles.container}>

        {/* LEFT — Theater Image Panel */}
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={styles.imagePanel}
          imageStyle={styles.imageBg}
        >
          <View style={styles.imageOverlay}>
            <TouchableOpacity style={styles.logoRow} onPress={() => onNavigate('home')}>
              <View style={styles.logoBox} />
              <Text style={styles.logoText}>Mamiya Theater</Text>
            </TouchableOpacity>

            {/* Benefits */}
            <View style={styles.benefitsBlock}>
              <Text style={styles.benefitsTitle}>Join Us</Text>
              <View style={styles.quoteDivider} />
              {[
                {text: 'Save favorites and manage all your bookings' },
              ].map((item, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Text style={styles.benefitText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </ImageBackground>

        {/* RIGHT — Signup Form */}
        <ScrollView style={styles.formPanel} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>

          {/* Back Button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('home')} activeOpacity={0.7}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back to Home</Text>
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Start booking the best shows in town</Text>
          </View>

          {/* Social Signup */}
          <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
            <Text style={styles.socialIcon}>G</Text>
            <Text style={styles.socialText}>Sign up with Google</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or create with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Name Row */}
          <View style={styles.nameRow}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>First name</Text>
              <View style={[styles.inputWrapper, focusedField === 'first' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="John"
                  placeholderTextColor="#aaa"
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => setFocusedField('first')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Last name</Text>
              <View style={[styles.inputWrapper, focusedField === 'last' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Doe"
                  placeholderTextColor="#aaa"
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => setFocusedField('last')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputFocused]}>
              <Text style={styles.inputIcon}>✉</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#aaa"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputFocused]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor="#aaa"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
            {strength && (
              <View style={styles.strengthBar}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Confirm password</Text>
            <View style={[styles.inputWrapper, focusedField === 'confirm' && styles.inputFocused,
              confirmPassword && password !== confirmPassword && styles.inputError]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor="#aaa"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showConfirm}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                <Text style={styles.eyeIcon}>{showConfirm ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
            {confirmPassword && password !== confirmPassword && (
              <Text style={styles.errorText}>Passwords do not match</Text>
            )}
          </View>

          {/* Terms Checkbox */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, !agreedToTerms && styles.submitDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>Create Account</Text>
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => onNavigate('login')}>
              <Text style={styles.switchLink}>Sign in →</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  container: { flex: 1, flexDirection: 'row', minHeight: '100%' },

  // LEFT PANEL
  imagePanel: { flex: 1, minHeight: 600 },
  imageBg: { resizeMode: 'cover' },
  imageOverlay: { flex: 1, backgroundColor: 'rgba(8, 4, 20, 0.75)', padding: 48, justifyContent: 'space-between' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: { width: 28, height: 28, backgroundColor: '#C8102E', borderRadius: 4 },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  benefitsBlock: { paddingBottom: 24 },
  benefitsTitle: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 28, marginBottom: 16 },
  quoteDivider: { width: 40, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 24 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  benefitIcon: { fontSize: 16, marginTop: 1 },
  benefitText: { color: '#ccc', fontSize: 13, lineHeight: 19, flex: 1 },

  // RIGHT FORM
  formPanel: { flex: 1, backgroundColor: '#fff' },
  formContent: { paddingHorizontal: 56, paddingVertical: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  formHeader: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', color: '#12122a', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#777' },

  // SOCIAL
  socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8, paddingVertical: 13, marginBottom: 22, gap: 10, backgroundColor: '#fafafa' },
  socialIcon: { fontSize: 16, fontWeight: '700', color: '#C8102E' },
  socialText: { fontSize: 14, fontWeight: '600', color: '#333' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ececec' },
  dividerText: { fontSize: 12, color: '#aaa' },

  // NAME ROW
  nameRow: { flexDirection: 'row', gap: 12 },

  // FIELDS
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 7 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#fafafa', gap: 8 },
  inputFocused: { borderColor: '#C8102E', backgroundColor: '#fff' },
  inputError: { borderColor: '#e53935' },
  inputIcon: { fontSize: 13, color: '#aaa' },
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none' } as any,
  eyeIcon: { fontSize: 13 },

  // PASSWORD STRENGTH
  strengthBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  strengthTrack: { flex: 1, height: 4, backgroundColor: '#eee', borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', minWidth: 44 },

  // ERROR
  errorText: { fontSize: 11, color: '#e53935', marginTop: 5 },

  // TERMS CHECKBOX
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 24 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  termsText: { flex: 1, fontSize: 13, color: '#555', lineHeight: 19 },
  termsLink: { color: '#C8102E', fontWeight: '600' },

  // SUBMIT
  submitBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingVertical: 15, alignItems: 'center', marginBottom: 22, shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitDisabled: { backgroundColor: '#e0a0a8', shadowOpacity: 0 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  // SWITCH
  switchRow: { flexDirection: 'row', justifyContent: 'center' },
  switchText: { fontSize: 13, color: '#777' },
  switchLink: { fontSize: 13, color: '#C8102E', fontWeight: '700' },

  // BACK BUTTON
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28, alignSelf: 'flex-start' },
  backArrow: { fontSize: 18, color: '#C8102E', fontWeight: '700', lineHeight: 22 },
  backText: { fontSize: 13, color: '#C8102E', fontWeight: '600' },
});

export default SignupScreen;