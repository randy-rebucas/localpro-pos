'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail } from 'lucide-react';
import { FEATURE_MODULE_COUNT } from './FeaturesGrid';
import type { HomeDict } from './useMarketing';
import { SUPPORT_EMAIL, SUPPORTED_UI_LANGUAGES } from '@/lib/marketing-constants';
import { BrandLogo } from '@/components/BrandLogo';

type FooterLink = { label: string; href: string; route?: boolean };

/** Shared public footer. Only links that resolve to a real page or homepage section. */
export default function SiteFooter({ d }: { d: HomeDict }) {
  const base = usePathname() === '/' ? '' : '/';

  const columns: { title: string; aria: string; links: FooterLink[] }[] = [
    {
      title: d?.footerProduct || 'Product',
      aria: 'Product links',
      links: [
        { label: d?.footerFeatures || 'Features', href: `${base}#features` },
        { label: d?.footerSolutions || 'Solutions', href: `${base}#solutions` },
        { label: d?.footerEcommerce || 'Ecommerce integrations', href: `${base}#ecommerce` },
        { label: d?.footerPricing || 'Pricing', href: '/pricing', route: true },
        { label: d?.footerBrowseStores || 'Browse Stores', href: '/stores', route: true },
      ],
    },
    {
      title: d?.footerCompany || 'Company',
      aria: 'Company links',
      links: [
        { label: d?.footerContact || 'Contact & support', href: '/contact', route: true },
        { label: d?.footerCreateStore || 'Create a store', href: '/signup', route: true },
        { label: d?.footerPrivacy || 'Privacy Policy', href: '/privacy', route: true },
      ],
    },
  ];

  return (
    <footer className="bg-[#070f16] text-white/55 px-4 sm:px-6 pt-10 pb-6 border-t border-white/10" aria-label="Site footer">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center mb-3 text-white">
              <BrandLogo />
            </Link>
            <p className="text-xs leading-relaxed max-w-xs mb-4">
              {d?.footerDesc || `BIR-ready enterprise POS with ${FEATURE_MODULE_COUNT} capability modules for modern Philippine businesses.`}
            </p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mk-key inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-mono">
              <Mail className="w-3.5 h-3.5 text-brand-muted" strokeWidth={2.25} aria-hidden="true" />
              {SUPPORT_EMAIL}
            </a>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.aria}>
              <h3 className="text-white text-[11px] font-bold uppercase tracking-[0.16em] mb-3">{col.title}</h3>
              <ul className="space-y-1.5 text-[13px]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.route ? (
                      <Link href={l.href} className="hover:text-white">{l.label}</Link>
                    ) : (
                      <a href={l.href} className="hover:text-white">{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between gap-2 text-xs">
          <p>{d?.footerCopyright || '© 2026 DevCom Digital Marketing Services. 1POS is a product of DevCom.'}</p>
          <p className="text-white/35 font-mono">
            {d?.footerTagline || `BIR-ready POS · ${FEATURE_MODULE_COUNT} modules · ${SUPPORTED_UI_LANGUAGES} languages · Built for the Philippines`}
          </p>
        </div>
      </div>
    </footer>
  );
}
