import type { Metadata } from 'next';
import PrivacyPolicy from './PrivacyPolicy';

export const metadata: Metadata = {
  title: 'Privacy Policy — 1pos',
  description: 'Learn how 1pos collects, uses, and protects your personal information.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
