import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { useAppModal } from '../components/ModalProvider';
import { isValidEmail } from '../lib/validation';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

const validateEmailField = (value: string): string | null => {
  if (!value.trim()) return 'Email is required.';
  if (!isValidEmail(value)) return 'Please enter a valid email address.';
  return null;
};

const validatePasswordField = (value: string): string | null => {
  if (!value) return 'Please enter your password.';
  return null;
};

const AdminLoginScreen = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 600;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError && !validateEmailField(text)) setEmailError(null);
  };
  const handleEmailBlur = () => setEmailError(validateEmailField(email));
  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError && !validatePasswordField(text)) setPasswordError(null);
  };
  const handlePasswordBlur = () => setPasswordError(validatePasswordField(password));

  const handleAdminLogin = async () => {
    const emailErr = validateEmailField(email);
    const passwordErr = validatePasswordField(password);
    setEmailError(emailErr);
    setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data.user;
      if (!user) throw new Error('Login succeeded but no user was returned.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        showModal({
          title: 'Access Denied',
          message: 'This sign-in is reserved for administrators.',
          variant: 'error',
        });
        setPassword('');
        return;
      }

      onNavigate('admin');
    } catch (err: any) {
      console.error('Admin login error:', err);
      showModal({ title: 'Sign-In Failed', message: err.message ?? 'Invalid email or password.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a18" />
      <View style={[styles.card, !isDesktop && styles.cardMobile]}>
        <View style={styles.badge}>
          <Icon name="shield-checkmark" size={22} color="#C8102E" />
        </View>
        <Text style={styles.title}>Admin Portal</Text>
        <Text style={styles.subtitle}>Restricted access — Mamiya Theater staff only.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email address</Text>
          <View style={[styles.inputWrapper, !!emailError && styles.inputError]}>
            <Icon name="mail-outline" size={16} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="admin@mamiyatheater.com"
              placeholderTextColor="#777"
              value={email}
              onChangeText={handleEmailChange}
              onBlur={handleEmailBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>
          {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputWrapper, !!passwordError && styles.inputError]}>
            <Icon name="lock-closed-outline" size={16} color="#888" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Enter your password"
              placeholderTextColor="#777"
              value={password}
              onChangeText={handlePasswordChange}
              onBlur={handlePasswordBlur}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#888" />
            </TouchableOpacity>
          </View>
          {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleAdminLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Sign In</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={() => onNavigate('home')}>
          <Text style={styles.backLinkText}>← Back to site</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a18', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: '#13132c', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 32,
  },
  cardMobile: { padding: 24 },
  badge: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(200,16,46,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 26, lineHeight: 18 },
  fieldGroup: { marginBottom: 16 },
  label: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputError: { borderColor: '#ef4444' },
  inputIcon: { marginRight: 0 },
  input: { flex: 1, color: '#fff', fontSize: 14, outlineStyle: 'none' } as any,
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.7, shadowOpacity: 0 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  backLink: { alignSelf: 'center', marginTop: 18 },
  backLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
});

export default AdminLoginScreen;
