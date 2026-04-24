import type { Metadata } from 'next';
import MarketingPageClient from '@/components/MarketingPageClient';

/* ── Page-level metadata (overrides root layout defaults) ─────────── */
export const metadata: Metadata = {
  title: 'Enterprise POS System for Philippine Businesses',
  // Hero copy: keep module count aligned with `FEATURE_MODULE_COUNT` in components/FeaturesGrid.tsx
  description:
    'Transform your business with 1pos — BIR-ready POS with 23 capability modules, real-time inventory, multi-branch support, and seven core automated workflows. Start your free 14-day trial today.',
  keywords: [
    'POS system Philippines',
    'point of sale',
    'BIR compliant POS',
    'inventory management system',
    'multi-tenant POS',
    'retail POS software',
    'restaurant POS',
    'free POS trial',
  ],
  openGraph: {
    title: '1pos — Enterprise POS System for Philippine Businesses',
    description:
      'Complete BIR-ready POS with 23 capability modules, real-time inventory, and seven core automations. Free 14-day trial.',
    type: 'website',
    url: '/',
    siteName: '1pos',
    images: [{ url: '/icon-192x192.png', width: 192, height: 192, alt: '1pos point of sale logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '1pos — Enterprise POS System',
    description: 'Complete BIR-ready POS with 23 capability modules. Free 14-day trial.',
    images: ['/icon-192x192.png'],
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

/* ── JSON-LD structured data ─────────────────────────────────────── */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': '/#software',
      name: '1pos',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
      description:
        'Enterprise-grade BIR-ready point of sale system for Philippine businesses. Includes inventory management, multi-branch support, customer management, and seven core automated workflows.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'PHP',
        description: '14-day free trial — no credit card required',
      },
      featureList:
        'Point of Sale, Inventory Management, Customer Management, BIR Compliance, Multi-Branch Support, Reports & Analytics, Booking & Scheduling, Offline Mode, Hardware Integration',
    },
    {
      '@type': 'Organization',
      '@id': '/#org',
      name: '1pos',
      url: 'https://1pos.app',
      description: 'Enterprise-grade POS system provider for modern Philippine businesses',
    },
    {
      '@type': 'WebSite',
      '@id': '/#website',
      url: 'https://1pos.app',
      name: '1pos',
      publisher: { '@id': '/#org' },
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://1pos.app/stores?q={search_term_string}',
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default function MarketingPage() {
  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingPageClient />
    </>
  );
}
