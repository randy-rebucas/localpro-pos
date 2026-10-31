import type { Metadata } from 'next';
import PricingPage from '@/components/marketing/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing',
  description: '1pos plans in pesos: staff, branch and product limits, counter features and BIR compliance help per plan. Every store starts with a 14-day free trial.',
  alternates: { canonical: '/pricing' },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <PricingPage />;
}
