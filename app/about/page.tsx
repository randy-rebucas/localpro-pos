import type { Metadata } from 'next';
import AboutReading from './AboutReading';

export const metadata: Metadata = {
  title: 'About — 1pos',
  description: '1pos is a BIR-ready point of sale for Philippine stores, made by Devcom Digital Marketing Services.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return <AboutReading />;
}
