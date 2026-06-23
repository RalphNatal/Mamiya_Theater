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

const LoginScreen = ({ onNavigate }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
            {/* Logo */}
            <TouchableOpacity style={styles.logoRow} onPress={() => onNavigate('home')}>
              <View style={styles.logoBox} />
              <Text style={styles.logoText}>Mamiya Theater</Text>
            </TouchableOpacity>

            {/* Quote */}
            <View style={styles.quoteBlock}>
              <Text style={styles.quoteText}>
                "The show must go on — and your seat is waiting."
              </Text>
              <View style={styles.quoteDivider} />
              <Text style={styles.quoteAuthor}>StageTix · Premium Theater Tickets</Text>
            </View>
          </View>
        </ImageBackground>

        {/* RIGHT — Login Form */}
        <ScrollView style={styles.formPanel} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>

          {/* Back Button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('home')} activeOpacity={0.7}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back to Home</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.formHeader}>
            <Text style={styles.welcomeBack}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to access your tickets and bookings</Text>
          </View>

          {/* Social Login */}
          <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
            <Text style={styles.socialIcon}>G</Text>
            <Text style={styles.socialText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign in with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Field */}
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

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TouchableOpacity>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputFocused]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
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
          </View>

          {/* Remember Me */}
          <View style={styles.rememberRow}>
            <TouchableOpacity style={styles.checkboxRow}>
              <View style={styles.checkbox} />
              <Text style={styles.rememberText}>Remember me for 30 days</Text>
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85}>
            <Text style={styles.submitText}>Sign In</Text>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => onNavigate('signup')}>
              <Text style={styles.switchLink}>Create one →</Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <Text style={styles.terms}>
            By signing in, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  container: { flex: 1, flexDirection: 'row', minHeight: '100%' },

  // LEFT IMAGE PANEL
  imagePanel: { flex: 1, minHeight: 600 },
  imageBg: { resizeMode: 'cover' },
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 4, 20, 0.72)',
    padding: 48,
    justifyContent: 'space-between',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: { width: 28, height: 28, backgroundColor: '#C8102E', borderRadius: 4 },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  quoteBlock: { paddingBottom: 24 },
  quoteText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 32,
    fontStyle: 'italic',
    marginBottom: 20,
    maxWidth: 380,
  },
  quoteDivider: { width: 40, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 14 },
  quoteAuthor: { color: '#aaa', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },

  // RIGHT FORM PANEL
  formPanel: { flex: 1, backgroundColor: '#fff' },
  formContent: {
    paddingHorizontal: 56,
    paddingVertical: 60,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  formHeader: { marginBottom: 32 },
  welcomeBack: { fontSize: 30, fontWeight: '800', color: '#12122a', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#777', lineHeight: 20 },

  // SOCIAL
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 13,
    marginBottom: 24,
    gap: 10,
    backgroundColor: '#fafafa',
  },
  socialIcon: { fontSize: 16, fontWeight: '700', color: '#C8102E' },
  socialText: { fontSize: 14, fontWeight: '600', color: '#333' },

  // DIVIDER
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ececec' },
  dividerText: { fontSize: 12, color: '#aaa' },

  // FIELDS
  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  forgotLink: { fontSize: 12, color: '#C8102E', fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    gap: 10,
  },
  inputFocused: { borderColor: '#C8102E', backgroundColor: '#fff' },
  inputIcon: { fontSize: 14, color: '#aaa' },
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none' } as any,
  eyeIcon: { fontSize: 14 },

  // REMEMBER ME
  rememberRow: { marginBottom: 28 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 16, height: 16, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 3 },
  rememberText: { fontSize: 13, color: '#555' },

  // SUBMIT
  submitBtn: {
    backgroundColor: '#C8102E',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#C8102E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  // SWITCH
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  switchText: { fontSize: 13, color: '#777' },
  switchLink: { fontSize: 13, color: '#C8102E', fontWeight: '700' },

  // TERMS
  terms: { fontSize: 11, color: '#aaa', textAlign: 'center', lineHeight: 17 },
  termsLink: { color: '#C8102E', fontWeight: '600' },

  // BACK BUTTON
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32, alignSelf: 'flex-start' },
  backArrow: { fontSize: 18, color: '#C8102E', fontWeight: '700', lineHeight: 22 },
  backText: { fontSize: 13, color: '#C8102E', fontWeight: '600' },
});

export default LoginScreen;