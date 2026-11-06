import type { Metadata } from 'next';
import ContactSlip from './ContactSlip';

export const metadata: Metadata = {
  title: 'Contact — 1pos',
  description: 'Email the 1pos team about plans, support, billing or your data.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return <ContactSlip />;
}
