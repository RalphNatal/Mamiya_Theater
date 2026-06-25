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
  Image,
  StatusBar,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GoogleIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about' | 'admin') => void;
};

const SignupScreen = ({ onNavigate }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignUp = async () => {
    if (!canSubmit) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: `${firstName} ${lastName}`.trim(),
            mobile_number: mobileNumber,
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
        // Email confirmation is required before a session is issued.
        Alert.alert('Check your email', "We've sent you a confirmation link to finish signing up.");
        onNavigate('login');
      }
      // If a session was returned, App.tsx's onAuthStateChange picks it up and
      // navigates to home automatically.
    } catch (err: any) {
      console.error('Sign-up error:', err);
      Alert.alert('Sign-Up Failed', err.message ?? 'Something went wrong while creating your account.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: (globalThis as any).location?.origin },
      });
      if (error) throw error;
      // Supabase redirects the browser to Google and back; App.tsx picks up the
      // resulting session via onAuthStateChange and navigates to home from there.
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      Alert.alert('Sign-Up Failed', err.message ?? 'Something went wrong with Google Sign-In.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (!password) return null;
    if (password.length < 6) return { label: 'Too short', color: '#ef4444', pct: '20%' };
    if (password.length < 8) return { label: 'Weak', color: '#f97316', pct: '40%' };
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { label: 'Fair', color: '#eab308', pct: '65%' };
    if (password.length >= 10) return { label: 'Strong', color: '#22c55e', pct: '100%' };
    return { label: 'Good', color: '#3b82f6', pct: '80%' };
  };

  const strength = getPasswordStrength();
  const canSubmit =
    agreedToTerms && password.length >= 8 && password === confirmPassword &&
    !!firstName && !!email && !!mobileNumber;

  const formContent = (
    <>
      <TouchableOpacity style={isDesktop ? styles.backBtn : styles.mobileBackBtn2}
        onPress={() => onNavigate('home')} activeOpacity={0.7}>
        <Text style={isDesktop ? styles.backArrow : styles.mobileBackArrow2}>←</Text>
        <Text style={isDesktop ? styles.backText : styles.mobileBackText2}>Back to Home</Text>
      </TouchableOpacity>

      <View style={styles.formHeader}>
        <Text style={isDesktop ? styles.formTitle : styles.mobileFormTitle}>Create your account</Text>
        <Text style={isDesktop ? styles.formSubtitle : styles.mobileFormSubtitle}>
          Start booking the best shows in town
        </Text>
      </View>

      <TouchableOpacity
        style={[isDesktop ? styles.googleBtn : styles.mobileGoogleBtn2, googleLoading && styles.googleBtnDisabled]}
        activeOpacity={0.8}
        onPress={handleGoogleSignIn}
        disabled={googleLoading}
      >
        <GoogleIcon name="google" size={isDesktop ? 18 : 16} color="#EA4335" />
        <Text style={isDesktop ? styles.googleText : styles.mobileGoogleText2}>
          {googleLoading ? 'Signing up...' : 'Sign up with Google'}
        </Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={isDesktop ? styles.dividerLine : styles.mobileDivLine} />
        <Text style={isDesktop ? styles.dividerText : styles.mobileDivText}>OR</Text>
        <View style={isDesktop ? styles.dividerLine : styles.mobileDivLine} />
      </View>

      {/* Name row */}
      <View style={styles.nameRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>First name</Text>
          <View style={[isDesktop ? styles.inputWrapper : styles.mobileInputBox, focusedField === 'first' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2)]}>
            <TextInput
              style={isDesktop ? styles.input : styles.mobileInputText2}
              placeholder="John"
              placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
              value={firstName}
              onChangeText={setFirstName}
              onFocus={() => setFocusedField('first')}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>Last name</Text>
          <View style={[isDesktop ? styles.inputWrapper : styles.mobileInputBox, focusedField === 'last' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2)]}>
            <TextInput
              style={isDesktop ? styles.input : styles.mobileInputText2}
              placeholder="Doe"
              placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
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
        <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>Email address</Text>
        <View style={[isDesktop ? styles.inputWrapper : styles.mobileInputBox, focusedField === 'email' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2)]}>
          <Icon
            name="mail-outline"
            size={isDesktop ? 16 : 14}
            color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.4)'}
            style={isDesktop ? styles.inputIcon : styles.mobileInputIcon}
          />
          <TextInput
            style={isDesktop ? styles.input : styles.mobileInputText2}
            placeholder="you@example.com"
            placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {email.includes('@') && <Text style={isDesktop ? styles.validMark : styles.mobileValidMark}>✓</Text>}
        </View>
      </View>

      {/* Mobile Number */}
      <View style={styles.fieldGroup}>
        <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>Mobile Number</Text>
        <View style={[isDesktop ? styles.inputWrapper : styles.mobileInputBox, focusedField === 'mobile' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2)]}>
          <Icon
            name="call-outline"
            size={isDesktop ? 16 : 14}
            color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.4)'}
            style={isDesktop ? styles.inputIcon : styles.mobileInputIcon}
          />
          <TextInput
            style={isDesktop ? styles.input : styles.mobileInputText2}
            placeholder="(808) 555-0123"
            placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            onFocus={() => setFocusedField('mobile')}
            onBlur={() => setFocusedField(null)}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      {/* Password */}
      <View style={styles.fieldGroup}>
        <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>Password</Text>
        <View style={[isDesktop ? styles.inputWrapper : styles.mobileInputBox, focusedField === 'password' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2)]}>
          <Icon
            name="lock-closed-outline"
            size={isDesktop ? 16 : 14}
            color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.4)'}
            style={isDesktop ? styles.inputIcon : styles.mobileInputIcon}
          />
          <TextInput
            style={[isDesktop ? styles.input : styles.mobileInputText2, { flex: 1 }]}
            placeholder="Min. 8 characters"
            placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Icon
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={isDesktop ? 16 : 14}
              color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.5)'}
            />
          </TouchableOpacity>
        </View>
        {strength && (
          <View style={styles.strengthBar}>
            <View style={isDesktop ? styles.strengthTrack : styles.mobileStrengthTrack}>
              <View style={[styles.strengthFill, { width: strength.pct as any, backgroundColor: strength.color }]} />
            </View>
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
        )}
      </View>

      {/* Confirm Password */}
      <View style={styles.fieldGroup}>
        <Text style={isDesktop ? styles.fieldLabel : styles.mobileFieldLabel}>Confirm password</Text>
        <View style={[
          isDesktop ? styles.inputWrapper : styles.mobileInputBox,
          focusedField === 'confirm' && (isDesktop ? styles.inputFocused : styles.mobileInputFocused2),
          confirmPassword && password !== confirmPassword && styles.inputError,
        ]}>
          <Icon
            name="lock-closed-outline"
            size={isDesktop ? 16 : 14}
            color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.4)'}
            style={isDesktop ? styles.inputIcon : styles.mobileInputIcon}
          />
          <TextInput
            style={[isDesktop ? styles.input : styles.mobileInputText2, { flex: 1 }]}
            placeholder="Re-enter your password"
            placeholderTextColor={isDesktop ? '#bbb' : 'rgba(255,255,255,0.3)'}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedField('confirm')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry={!showConfirm}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
            <Icon
              name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
              size={isDesktop ? 16 : 14}
              color={isDesktop ? '#aaa' : 'rgba(255,255,255,0.5)'}
            />
          </TouchableOpacity>
        </View>
        {confirmPassword && password !== confirmPassword && (
          <Text style={styles.errorText}>Passwords do not match</Text>
        )}
      </View>

      {/* Terms */}
      <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms(!agreedToTerms)} activeOpacity={0.7}>
        <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
          {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={isDesktop ? styles.termsText : styles.mobileTermsText}>
          I agree to the{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[isDesktop ? styles.submitBtn : styles.mobileSubmitBtn2, !canSubmit && styles.submitDisabled]}
        activeOpacity={0.85}
        onPress={handleSignUp}
        disabled={!canSubmit || loading}
      >
        <Text style={styles.submitText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
      </TouchableOpacity>

      <View style={styles.switchRow}>
        <Text style={isDesktop ? styles.switchText : styles.mobileSwitchText2}>Already have an account? </Text>
        <TouchableOpacity onPress={() => onNavigate('login')}>
          <Text style={styles.switchLink}>Sign in →</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a18" />

      {isDesktop ? (
        <View style={styles.desktopContainer}>
          {/* LEFT PANEL */}
          <ImageBackground
            source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
            style={styles.imagePanel}
            imageStyle={styles.imageBg}
          >
            <View style={styles.imageOverlay}>
              <TouchableOpacity style={styles.logoRow} onPress={() => onNavigate('home')}>
                <Image source={require('../assets/SLS-175-Years-Logo-_r4_.png')} style={styles.logoImage} resizeMode="contain" />
                <Text style={styles.logoText}>Mamiya Theater</Text>
              </TouchableOpacity>

              <View style={styles.benefitsBlock}>
                <Text style={styles.benefitsTitle}>Join thousands{'\n'}of theater lovers</Text>
                <View style={styles.goldDivider} />
                {[
                  { icon: '🎭', text: 'Early access to new shows & exclusive pre-sales' },
                  { icon: '🎟', text: 'Manage all your bookings in one place' },
                  { icon: '⭐', text: 'Member-only discounts and VIP upgrades' },
                  { icon: '📧', text: 'Personalized show recommendations' },
                ].map((item, i) => (
                  <View key={i} style={styles.benefitRow}>
                    <Text style={styles.benefitIcon}>{item.icon}</Text>
                    <Text style={styles.benefitText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ImageBackground>

          {/* RIGHT FORM */}
          <ScrollView style={styles.formPanel} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
            {formContent}
          </ScrollView>
        </View>
      ) : (
        /* MOBILE */
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={styles.mobileBg}
          imageStyle={styles.mobileBgImage}
        >
          <View style={styles.mobileOverlay}>
            <ScrollView contentContainerStyle={styles.mobileScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.mobileTopBar}>
                <View style={styles.mobileLogoRow}>
                  <Image source={require('../assets/SLS-175-Years-Logo-_r4_.png')} style={styles.mobileLogoImage} resizeMode="contain" />
                  <Text style={styles.mobileLogoText}>Mamiya Theater</Text>
                </View>
              </View>
              <View style={styles.mobileCard}>
                <View style={styles.mobileGoldLine} />
                {formContent}
              </View>
            </ScrollView>
          </View>
        </ImageBackground>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a18' },
  desktopContainer: { flex: 1, flexDirection: 'row' },

  // LEFT PANEL
  imagePanel: { flex: 1 },
  imageBg: { resizeMode: 'cover' },
  imageOverlay: { flex: 1, backgroundColor: 'rgba(6,3,18,0.78)', padding: 52, justifyContent: 'space-between' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImage: { width: 32, height: 32 },
  logoText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  goldDivider: { width: 44, height: 2, backgroundColor: '#c9a84c', borderRadius: 1, marginBottom: 20 },
  benefitsBlock: { paddingBottom: 16 },
  benefitsTitle: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 34, marginBottom: 18 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  benefitIcon: { fontSize: 15, marginTop: 1 },
  benefitText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 19, flex: 1 },

  // RIGHT FORM
  formPanel: { flex: 1, backgroundColor: '#fff' },
  formContent: { paddingHorizontal: 56, paddingVertical: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32, alignSelf: 'flex-start' },
  backArrow: { fontSize: 17, color: '#C8102E', fontWeight: '700' },
  backText: { fontSize: 13, color: '#C8102E', fontWeight: '600' },
  formHeader: { marginBottom: 28 },
  formTitle: { fontSize: 28, fontWeight: '800', color: '#0f0e2a', marginBottom: 6, letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, color: '#888' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#dadce0', borderRadius: 10,
    paddingVertical: 13, marginBottom: 22, backgroundColor: '#fff',
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleText: { fontSize: 14, fontWeight: '600', color: '#3c4043' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { fontSize: 11, color: '#bbb', fontWeight: '700', letterSpacing: 0.5 },
  nameRow: { flexDirection: 'row', gap: 12 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fafafa',
  },
  inputFocused: { borderColor: '#C8102E', backgroundColor: '#fff' },
  inputError: { borderColor: '#ef4444' },
  inputIcon: { marginRight: 0 },
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none' } as any,
  validMark: { fontSize: 13, color: '#c9a84c', fontWeight: '700' },
  strengthBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  strengthTrack: { flex: 1, height: 4, backgroundColor: '#eee', borderRadius: 2, overflow: 'hidden' },
  mobileStrengthTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', minWidth: 55 },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  termsText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 19 },
  termsLink: { color: '#C8102E', fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginBottom: 20,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitDisabled: { backgroundColor: 'rgba(200,16,46,0.35)', shadowOpacity: 0 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  switchRow: { flexDirection: 'row', justifyContent: 'center' },
  switchText: { fontSize: 13, color: '#888' },
  switchLink: { fontSize: 13, color: '#C8102E', fontWeight: '700' },

  // ── MOBILE ──
  mobileBg: { flex: 1 },
  mobileBgImage: { resizeMode: 'cover', opacity: 0.4 },
  mobileOverlay: { flex: 1, backgroundColor: 'rgba(8,5,22,0.85)' },
  mobileScroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 36 },
  mobileTopBar: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  mobileLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mobileLogoImage: { width: 24, height: 24 },
  mobileLogoText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  mobileCard: {
    backgroundColor: 'rgba(12,9,30,0.92)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20, paddingBottom: 24, paddingTop: 0, overflow: 'hidden',
  },
  mobileGoldLine: { height: 2, backgroundColor: '#c9a84c', marginHorizontal: -20, marginBottom: 22, opacity: 0.85 },

  // Mobile form overrides
  mobileBackBtn2: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 18, alignSelf: 'flex-start' },
  mobileBackArrow2: { fontSize: 15, color: '#c9a84c', fontWeight: '700' },
  mobileBackText2: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },
  mobileFormTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  mobileFormSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  mobileGoogleBtn2: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1.5,
    borderColor: '#dadce0', borderRadius: 10, paddingVertical: 11, marginBottom: 16,
  },
  mobileGoogleText2: { color: '#3c4043', fontSize: 13, fontWeight: '600' },
  mobileDivLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  mobileDivText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  mobileFieldLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 7 },
  mobileInputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
  },
  mobileInputFocused2: { borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'rgba(201,168,76,0.04)' },
  mobileInputIcon: { marginRight: 8 },
  mobileInputText2: { color: '#fff', fontSize: 13, flex: 1, outlineStyle: 'none' } as any,
  mobileValidMark: { fontSize: 12, color: '#c9a84c', fontWeight: '700' },
  mobileTermsText: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 17 },
  mobileSubmitBtn2: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  mobileSwitchText2: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
});

export default SignupScreen;