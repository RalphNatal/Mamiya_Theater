import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Linking,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import NavBar from '../components/NavBar';
import { useAppModal } from '../components/ModalProvider';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

const GENERAL_PHONE = '(808) 739-4886';
const GENERAL_FAX = '(808) 739-4821';
const GENERAL_EMAIL = 'mamiya@saintlouishawaii.org';
const RENTALS_CONTACT_NAME = 'Kainoa Jarrett';
const RENTALS_PHONE = '(808) 330-8039';

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

  const handleSend = () => {
    if (!fullName || !email || !message) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      showModal({
        title: 'Message Sent',
        message: "Thanks for reaching out — we'll get back to you shortly.",
        variant: 'success',
      });
      setFullName('');
      setEmail('');
      setSubject('');
      setMessage('');
    }, 1200);
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
                Dr. Richard T. Mamiya Theatre{'\n'}
                Saint Louis Center for the Arts{'\n'}
                3142 Waialae Avenue, Honolulu, HI 96816-1579
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
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor="#bbb"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#bbb"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
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
                  style={[styles.input, styles.messageInput]}
                  placeholder="How can we help?"
                  placeholderTextColor="#bbb"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  textAlignVertical="top"
                />
              </View>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── SPLIT LAYOUT ──
  splitContainer: { backgroundColor: '#F8F9FA' },
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
  pageHeadline: { fontSize: 28, fontWeight: '900', color: '#1a1a1a', marginBottom: 28 },
  infoSection: { marginBottom: 28 },
  infoSectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#C8102E', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  contactIconWrap: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  contactRowText: { fontSize: 14, lineHeight: 21, color: '#333', flex: 1 },
  contactRowTextLink: { color: '#C8102E', fontWeight: '600' },

  // ── RIGHT COLUMN: CONTACT FORM ──
  formColumn: { width: '100%' },
  formColumnDesktop: { flex: 1 },
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  formHeadline: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 22 },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, backgroundColor: '#fafafa',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a1a',
  },
  messageInput: { height: 110, paddingTop: 12 },
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