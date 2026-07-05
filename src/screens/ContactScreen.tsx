import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Linking,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import NavBar from '../components/NavBar';
import { useAppModal } from '../components/ModalProvider';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { isValidEmail } from '../lib/validation';
import { createStyles, typography, layout } from '../theme';
import {
  VENUE_LEGAL_NAME,
  GENERAL_PHONE,
  GENERAL_FAX,
  GENERAL_EMAIL,
  RENTALS_CONTACT_NAME,
  RENTALS_PHONE,
  formatVenueAddress,
} from '../config/venue';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

const dialNumber = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
const composeEmail = (email: string) => Linking.openURL(`mailto:${email}`);

// ── CONTACT ROW ─────────────────────────────────────────
const ContactRow = ({
  icon,
  children,
  onPress,
}: {
  icon: string;
  children: React.ReactNode;
  onPress?: () => void;
}) => {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.contactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.contactIconWrap}>
        <Icon name={icon} size={16} color="#C8102E" />
      </View>
      <Text style={[styles.contactRowText, onPress && styles.contactRowTextLink]}>{children}</Text>
    </Wrapper>
  );
};

const ContactScreen = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Hidden anti-spam honeypot — a real user never sees or fills this. If it
  // arrives non-empty the Edge Function drops the submission (see index.ts).
  const [honeypot, setHoneypot] = useState('');

  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const handleSend = async () => {
    // Inline validation — mirrors the email-error pattern in Signupscreen.tsx.
    const nameErr = !fullName.trim() ? 'Please enter your name.' : null;
    const emailErr = !email.trim()
      ? 'Please enter your email address.'
      : !isValidEmail(email)
        ? 'Please enter a valid email address.'
        : null;
    const msgErr = !message.trim() ? 'Please enter a message.' : null;

    setFullNameError(nameErr);
    setEmailError(emailErr);
    setMessageError(msgErr);
    if (nameErr || emailErr || msgErr) return;

    try {
      setSending(true);
      const { error } = await supabase.functions.invoke('contact-message', {
        body: {
          full_name: fullName.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          website: honeypot, // honeypot — bots fill it, humans don't
        },
      });
      if (error) throw error;

      showModal({
        title: 'Message Sent',
        message: "Thanks for reaching out — we'll get back to you shortly.",
        variant: 'success',
      });
      // Only clear on success so a failed send never loses what they typed.
      setFullName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      logger.error('Contact message failed:', err);
      showModal({
        title: 'Message not sent',
        message: "Something went wrong sending your message. Please try again, or email us directly.",
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >

        <View style={[styles.splitContainer, isDesktop ? styles.splitContainerDesktop : styles.splitContainerMobile]}>

          {/* ── LEFT COLUMN: CONTACT INFO ── */}
          <View style={[styles.infoColumn, isDesktop && styles.infoColumnDesktop]}>
            <Text style={styles.pageHeadline}>Get in Touch</Text>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Location</Text>
              <ContactRow icon="location-outline">
                {VENUE_LEGAL_NAME}{'\n'}
                Saint Louis Center for the Arts{'\n'}
                {formatVenueAddress()}
              </ContactRow>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>General Inquiries</Text>
              <ContactRow icon="call-outline" onPress={() => dialNumber(GENERAL_PHONE)}>
                {GENERAL_PHONE}
              </ContactRow>
              <ContactRow icon="print-outline">{GENERAL_FAX}</ContactRow>
              <ContactRow icon="mail-outline" onPress={() => composeEmail(GENERAL_EMAIL)}>
                {GENERAL_EMAIL}
              </ContactRow>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Technical &amp; Rentals (KaiHonua Entertainment)</Text>
              <ContactRow icon="person-outline">{RENTALS_CONTACT_NAME}</ContactRow>
              <ContactRow icon="call-outline" onPress={() => dialNumber(RENTALS_PHONE)}>
                {RENTALS_PHONE}
              </ContactRow>
            </View>
          </View>

          {/* ── RIGHT COLUMN: CONTACT FORM ── */}
          <View style={[styles.formColumn, isDesktop && styles.formColumnDesktop]}>
            <View style={styles.formCard}>
              <Text style={styles.formHeadline}>Send us a Message</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={[styles.input, !!fullNameError && styles.inputError]}
                  placeholder="Your full name"
                  placeholderTextColor="#bbb"
                  value={fullName}
                  onChangeText={(t) => {
                    setFullName(t);
                    if (fullNameError) setFullNameError(null);
                  }}
                />
                {!!fullNameError && <Text style={styles.errorText}>{fullNameError}</Text>}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput
                  style={[styles.input, !!emailError && styles.inputError]}
                  placeholder="you@example.com"
                  placeholderTextColor="#bbb"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (emailError) setEmailError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  style={styles.input}
                  placeholder="General Question, Rental Inquiry, Box Office..."
                  placeholderTextColor="#bbb"
                  value={subject}
                  onChangeText={setSubject}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Message</Text>
                <TextInput
                  style={[styles.input, styles.messageInput, !!messageError && styles.inputError]}
                  placeholder="How can we help?"
                  placeholderTextColor="#bbb"
                  value={message}
                  onChangeText={(t) => {
                    setMessage(t);
                    if (messageError) setMessageError(null);
                  }}
                  multiline
                  textAlignVertical="top"
                />
                {!!messageError && <Text style={styles.errorText}>{messageError}</Text>}
              </View>

              {/* Honeypot — visually hidden, off-screen; only bots fill it. */}
              <TextInput
                style={styles.honeypot}
                value={honeypot}
                onChangeText={setHoneypot}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                placeholder="Website"
              />

              <TouchableOpacity
                style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleSend}
                disabled={sending}
              >
                <Text style={styles.submitBtnText}>{sending ? 'Sending...' : 'Send Message'}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── SPLIT LAYOUT ──
  splitContainer: { ...layout.page, backgroundColor: '#F8F9FA' },
  splitContainerDesktop: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 60, paddingVertical: 56, gap: 56,
  },
  splitContainerMobile: {
    flexDirection: 'column', paddingHorizontal: 20, paddingVertical: 36, gap: 36,
  },

  // ── LEFT COLUMN: CONTACT INFO ──
  infoColumn: {},
  infoColumnDesktop: { flex: 1 },
  pageHeadline: { ...typography.heading1, fontWeight: '900', color: '#1a1a1a', marginBottom: 28 },
  infoSection: { marginBottom: 28 },
  infoSectionTitle: {
    ...typography.caption, fontWeight: '700', color: '#C8102E', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  contactIconWrap: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  contactRowText: { ...typography.body, color: '#333', flex: 1 },
  contactRowTextLink: { color: '#C8102E', fontWeight: '600' },

  // ── RIGHT COLUMN: CONTACT FORM ──
  formColumn: { width: '100%' },
  formColumnDesktop: { flex: 1 },
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  formHeadline: { ...typography.heading2, fontWeight: '800', color: '#1a1a1a', marginBottom: 22 },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { ...typography.caption, fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  input: {
    ...typography.body, borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, backgroundColor: '#fafafa',
    paddingHorizontal: 14, paddingVertical: 12, color: '#1a1a1a',
  },
  messageInput: { height: 110, paddingTop: 12 },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  // Off-screen honeypot: present in the DOM so bots fill it, invisible to users.
  honeypot: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 } as any,
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 6,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default ContactScreen;