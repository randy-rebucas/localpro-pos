import type { Metadata } from 'next';
import PriceList from './PriceList';

export const metadata: Metadata = {
  title: 'Pricing — 1pos',
  description: 'Compare 1pos plans line by line, then start with a 14-day free trial. No credit card needed.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return <PriceList />;
}
