import React from 'react';
import LegalPage, { type LegalSection } from '../components/LegalPage';
import { VENUE_SHORT_NAME } from '../config/venue';
import type { OnNavigate } from '../types/navigation';

// NOTE: placeholder copy — a reasonable starting point in the venue's voice, not
// reviewed legal text. Edit freely; the venue should have counsel finalize it.
const SECTIONS: LegalSection[] = [
  {
    heading: 'Information We Collect',
    paragraphs: [
      'When you create an account, book a ticket, contact us, or subscribe to our newsletter, we collect the details you provide — such as your name, email address, and phone number.',
      'We also collect the booking details needed to fulfil your order (the performance, seats, and payment status). Payment card details are handled by our payment processors, not stored on our systems.',
    ],
  },
  {
    heading: 'How We Use Your Information',
    paragraphs: [
      'We use your information to process bookings, send you confirmations and important updates about performances you have booked, respond to your enquiries, and — if you have subscribed — send you news about upcoming shows.',
      'We do not sell your personal information.',
    ],
  },
  {
    heading: 'Sharing',
    paragraphs: [
      'We share information only with the service providers that help us run the theater — for example our payment processors (Stripe, PayPal), our email provider, and our hosting/database provider (Supabase) — and only as needed to provide the service. We may also disclose information where required by law.',
    ],
  },
  {
    heading: 'Cookies & Analytics',
    paragraphs: [
      'The site uses the minimum storage needed to keep you signed in and your session working. If we add analytics in future, we will update this policy to describe it.',
    ],
  },
  {
    heading: 'Your Choices',
    paragraphs: [
      'You can update your profile details from your account, and unsubscribe from newsletter emails at any time. To request access to, correction of, or deletion of your personal information, contact us using the details below.',
    ],
  },
  {
    heading: 'Accessibility Statement',
    paragraphs: [
      `${VENUE_SHORT_NAME} is committed to making both our website and our venue welcoming to everyone, including guests with disabilities. We aim to follow recognized web accessibility guidelines and continually improve the experience.`,
      'If you use assistive technology and have trouble with any part of this site, or need accessible seating or accommodations for a visit, please contact us — we want to help and we welcome feedback on how we can do better.',
    ],
  },
  {
    heading: 'Changes to This Policy',
    paragraphs: [
      'We may update this policy from time to time. The “last updated” date above reflects the most recent revision.',
    ],
  },
];

const PrivacyScreen = ({ onNavigate }: { onNavigate: OnNavigate }) => (
  <LegalPage
    onNavigate={onNavigate}
    title="Privacy Policy"
    lastUpdated="July 4, 2026"
    intro={`This policy explains what information ${VENUE_SHORT_NAME} collects, how we use it, and the choices you have. It also includes our accessibility statement. We keep it as plain as we can.`}
    sections={SECTIONS}
  />
);

export default PrivacyScreen;
