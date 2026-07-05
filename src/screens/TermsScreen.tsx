import React from 'react';
import LegalPage, { type LegalSection } from '../components/LegalPage';
import type { OnNavigate } from '../types/navigation';

// NOTE: placeholder copy — a reasonable starting point in the venue's voice, not
// reviewed legal text. Edit freely; the venue should have counsel finalize it.
const SECTIONS: LegalSection[] = [
  {
    heading: 'Tickets & Bookings',
    paragraphs: [
      'When you buy a ticket through Mamiya Theater you are purchasing a revocable license to attend a specific performance at a specific date and time. Your booking is confirmed once payment is received and you receive a confirmation reference.',
      'Please arrive with your booking reference ready at the box office. Late arrivals may be seated at a suitable break in the performance, at the house management’s discretion, to avoid disrupting other guests and performers.',
    ],
  },
  {
    heading: 'Refunds & Exchanges',
    paragraphs: [
      'All sales are final unless a performance is cancelled or rescheduled by the venue. If we cancel a performance, you are entitled to a full refund of the ticket price to the original payment method.',
      'If a performance is rescheduled, your ticket is honored for the new date; if you cannot attend, contact us before the new date to request a refund. Exchanges to a different performance may be available subject to availability — reach out and we will do our best to help.',
    ],
  },
  {
    heading: 'Pricing & Payment',
    paragraphs: [
      'All prices are shown in US dollars and are charged at the time of purchase. We take payment securely through our third-party processors (Stripe and PayPal); we never store your full card details on our systems.',
      'Seats are held only briefly while you complete checkout. If payment is not completed in time, the hold is released and the seats are returned to inventory.',
    ],
  },
  {
    heading: 'Code of Conduct',
    paragraphs: [
      'We ask all guests to treat performers, staff, and fellow patrons with respect. Recording of performances, disruptive behavior, and prohibited items may result in removal without refund.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    paragraphs: [
      'To the fullest extent permitted by law, Mamiya Theater is not liable for indirect or incidental losses arising from your use of this website or attendance at a performance. Nothing in these terms limits any rights you have that cannot be excluded under applicable law.',
    ],
  },
  {
    heading: 'Changes to These Terms',
    paragraphs: [
      'We may update these terms from time to time. The “last updated” date above reflects the most recent revision. Continuing to use the site or purchase tickets after a change means you accept the updated terms.',
    ],
  },
];

const TermsScreen = ({ onNavigate }: { onNavigate: OnNavigate }) => (
  <LegalPage
    onNavigate={onNavigate}
    title="Terms of Service"
    lastUpdated="July 4, 2026"
    intro="These terms govern your use of the Mamiya Theater website and your purchase of tickets. By booking with us or using this site, you agree to them. Please read them alongside our Privacy Policy."
    sections={SECTIONS}
  />
);

export default TermsScreen;
