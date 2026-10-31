import type { Metadata } from 'next';
import ContactPage from '@/components/marketing/ContactPage';

export const metadata: Metadata = {
  title: 'Contact & Support',
  description: 'Email 1pos support about setup, billing or a problem with a sale — and what to include so we can find the transaction.',
  alternates: { canonical: '/contact' },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <ContactPage />;
}
