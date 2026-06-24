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
  Alert,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GoogleIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about') => void;
};

const LoginScreen = ({ onNavigate }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
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
      Alert.alert('Sign-In Failed', err.message ?? 'Something went wrong with Google Sign-In.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a18" />

      {isDesktop ? (
        /* ── DESKTOP: Split layout ── */
        <View style={styles.desktopContainer}>

          {/* LEFT — Theater curtain panel */}
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

              <View style={styles.quoteBlock}>
                <Text style={styles.quoteText}>
                  "The show must go on —{'\n'}and your seat is waiting."
                </Text>
                <View style={styles.goldDivider} />
                <Text style={styles.quoteAuthor}>Mamiya Theater · Premium Theater Tickets</Text>

                {/* Trust badges */}
                <View style={styles.trustRow}>
                  {['🎭 500K+ Tickets Sold', '⭐ 4.9 Rating', '🔒 Secure Checkout'].map((t, i) => (
                    <View key={i} style={styles.trustBadge}>
                      <Text style={styles.trustText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ImageBackground>

          {/* RIGHT — White form panel */}
          <ScrollView
            style={styles.formPanel}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('home')} activeOpacity={0.7}>
              <Text style={styles.backArrow}>←</Text>
              <Text style={styles.backText}>Back to Home</Text>
            </TouchableOpacity>

            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Welcome back</Text>
              <Text style={styles.formSubtitle}>Sign in to access your tickets and bookings</Text>
            </View>

            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              <GoogleIcon name="google" size={18} color="#EA4335" />
              <Text style={styles.googleText}>
                {googleLoading ? 'Signing in...' : 'Sign in with Google'}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputFocused]}>
                <Icon name="mail-outline" size={16} color="#aaa" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#bbb"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {email.includes('@') && <Text style={styles.validMark}>✓</Text>}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TouchableOpacity>
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputFocused]}>
                <Icon name="lock-closed-outline" size={16} color="#aaa" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#bbb"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#aaa" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.rememberRow}>
              <TouchableOpacity style={styles.checkboxRow}>
                <View style={styles.checkbox} />
                <Text style={styles.rememberText}>Remember me for 30 days</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitLoading]}
              activeOpacity={0.85}
              onPress={handleLogin}
            >
              <Text style={styles.submitText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => onNavigate('signup')}>
                <Text style={styles.switchLink}>Create one →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.terms}>
              By signing in, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </ScrollView>
        </View>

      ) : (
        /* ── MOBILE: Curtain background + centered card ── */
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={styles.mobileBg}
          imageStyle={styles.mobileBgImage}
        >
          <View style={styles.mobileOverlay}>
            <View style={styles.mobileSpotlight} />
            <ScrollView
              contentContainerStyle={styles.mobileScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Mobile top bar */}
              <View style={styles.mobileTopBar}>
                <TouchableOpacity style={styles.mobileBackBtn} onPress={() => onNavigate('home')}>
                  <Text style={styles.mobileBackText}>← Home</Text>
                </TouchableOpacity>
                <View style={styles.mobileLogoRow}>
                  <View style={styles.mobileLogoBox} />
                  <Text style={styles.mobileLogoText}>Mamiya Theater</Text>
                </View>
              </View>

              {/* Mobile card */}
              <View style={styles.mobileCard}>
                <View style={styles.mobileGoldLine} />

                <Text style={styles.mobileTitle}>Welcome back</Text>
                <Text style={styles.mobileSubtitle}>Your seat is waiting</Text>

                <TouchableOpacity
                  style={[styles.mobileGoogleBtn, googleLoading && styles.googleBtnDisabled]}
                  activeOpacity={0.8}
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  <GoogleIcon name="google" size={16} color="#EA4335" />
                  <Text style={styles.mobileGoogleText}>
                    {googleLoading ? 'Signing in...' : 'Sign in with Google'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.mobileDividerLine} />
                  <Text style={styles.mobileDividerText}>OR</Text>
                  <View style={styles.mobileDividerLine} />
                </View>

                <View style={styles.mobileFieldGroup}>
                  <Text style={styles.mobileLabel}>Email</Text>
                  <View style={[styles.mobileInput, focusedField === 'memail' && styles.mobileInputFocused]}>
                    <Icon name="mail-outline" size={14} color="rgba(255,255,255,0.3)" style={styles.mobileInputIcon} />
                    <TextInput
                      style={styles.mobileInputText}
                      placeholder="you@example.com"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocusedField('memail')}
                      onBlur={() => setFocusedField(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.mobileFieldGroup}>
                  <View style={styles.mobileLabelRow}>
                    <Text style={styles.mobileLabel}>Password</Text>
                    <TouchableOpacity>
                      <Text style={styles.mobileForgot}>Forgot?</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.mobileInput, focusedField === 'mpassword' && styles.mobileInputFocused]}>
                    <Icon name="lock-closed-outline" size={14} color="rgba(255,255,255,0.3)" style={styles.mobileInputIcon} />
                    <TextInput
                      style={[styles.mobileInputText, { flex: 1 }]}
                      placeholder="••••••••"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedField('mpassword')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Icon
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={14}
                        color="rgba(255,255,255,0.5)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.mobileSubmitBtn, loading && styles.submitLoading]}
                  onPress={handleLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.mobileSubmitText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                </TouchableOpacity>

                <View style={styles.mobileSwitchRow}>
                  <Text style={styles.mobileSwitchText}>No account? </Text>
                  <TouchableOpacity onPress={() => onNavigate('signup')}>
                    <Text style={styles.mobileSwitchLink}>Sign up →</Text>
                  </TouchableOpacity>
                </View>
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

  // ── DESKTOP ──
  desktopContainer: { flex: 1, flexDirection: 'row' },

  // LEFT PANEL
  imagePanel: { flex: 1 },
  imageBg: { resizeMode: 'cover' },
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 3, 18, 0.78)',
    padding: 52,
    justifyContent: 'space-between',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: { width: 26, height: 26, backgroundColor: '#C8102E', borderRadius: 4 },
  logoText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  quoteBlock: { paddingBottom: 16 },
  quoteText: {
    color: '#fff', fontSize: 26, fontWeight: '700',
    lineHeight: 38, fontStyle: 'italic', marginBottom: 22, maxWidth: 380,
  },
  goldDivider: { width: 44, height: 2, backgroundColor: '#c9a84c', borderRadius: 1, marginBottom: 16 },
  quoteAuthor: { color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 28 },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trustBadge: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  trustText: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

  // RIGHT FORM
  formPanel: { flex: 1, backgroundColor: '#fff' },
  formContent: { paddingHorizontal: 56, paddingVertical: 56, maxWidth: 480, width: '100%', alignSelf: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 36, alignSelf: 'flex-start' },
  backArrow: { fontSize: 17, color: '#C8102E', fontWeight: '700' },
  backText: { fontSize: 13, color: '#C8102E', fontWeight: '600' },
  formHeader: { marginBottom: 32 },
  formTitle: { fontSize: 30, fontWeight: '800', color: '#0f0e2a', marginBottom: 6, letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, color: '#888', lineHeight: 20 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#dadce0', borderRadius: 10,
    paddingVertical: 13, marginBottom: 24, backgroundColor: '#fff',
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleText: { fontSize: 14, fontWeight: '600', color: '#3c4043' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { fontSize: 11, color: '#bbb', fontWeight: '700', letterSpacing: 0.5 },

  fieldGroup: { marginBottom: 18 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8, letterSpacing: 0.2 },
  forgotLink: { fontSize: 12, color: '#C8102E', fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fafafa',
  },
  inputFocused: { borderColor: '#C8102E', backgroundColor: '#fff', shadowColor: '#C8102E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.08, shadowRadius: 6 },
  inputIcon: { marginRight: 0 },
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none' } as any,
  validMark: { fontSize: 13, color: '#c9a84c', fontWeight: '700' },

  rememberRow: { marginBottom: 24 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 16, height: 16, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 4 },
  rememberText: { fontSize: 13, color: '#777' },

  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginBottom: 22,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitLoading: { backgroundColor: '#9a0020', shadowOpacity: 0.1 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },

  switchRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  switchText: { fontSize: 13, color: '#888' },
  switchLink: { fontSize: 13, color: '#C8102E', fontWeight: '700' },

  terms: { fontSize: 11, color: '#bbb', textAlign: 'center', lineHeight: 17 },
  termsLink: { color: '#C8102E', fontWeight: '600' },

  // ── MOBILE ──
  mobileBg: { flex: 1 },
  mobileBgImage: { resizeMode: 'cover', opacity: 0.4 },
  mobileOverlay: { flex: 1, backgroundColor: 'rgba(8,5,22,0.85)' },
  mobileSpotlight: {
    position: 'absolute', width: 400, height: 400, borderRadius: 200,
    top: 0, alignSelf: 'center',
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 140, elevation: 0,
  },
  mobileScroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 40 },
  mobileTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  mobileBackBtn: { paddingVertical: 6, paddingHorizontal: 2 },
  mobileBackText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  mobileLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mobileLogoBox: { width: 18, height: 18, backgroundColor: '#C8102E', borderRadius: 3 },
  mobileLogoText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  mobileCard: {
    backgroundColor: 'rgba(12,9,30,0.92)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24, paddingBottom: 28, paddingTop: 0,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5, shadowRadius: 40, elevation: 20,
  },
  mobileGoldLine: { height: 2, backgroundColor: '#c9a84c', marginHorizontal: -24, marginBottom: 24, opacity: 0.85 },
  mobileTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
  mobileSubtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 22 },
  mobileGoogleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#dadce0',
    borderRadius: 10, paddingVertical: 12, marginBottom: 18,
  },
  mobileGoogleText: { color: '#3c4043', fontSize: 13, fontWeight: '600' },
  mobileDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  mobileDividerText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  mobileFieldGroup: { marginBottom: 14 },
  mobileLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  mobileLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 7 },
  mobileForgot: { color: '#c9a84c', fontSize: 12, fontWeight: '600' },
  mobileInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  mobileInputFocused: { borderColor: 'rgba(201,168,76,0.5)', backgroundColor: 'rgba(201,168,76,0.04)' },
  mobileInputIcon: { marginRight: 8 },
  mobileInputText: { color: '#fff', fontSize: 14, outlineStyle: 'none' } as any,
  mobileSubmitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8, marginBottom: 16,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 5,
  },
  mobileSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  mobileSwitchRow: { flexDirection: 'row', justifyContent: 'center' },
  mobileSwitchText: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },
  mobileSwitchLink: { color: '#C8102E', fontSize: 13, fontWeight: '700' },
});

export default LoginScreen;
