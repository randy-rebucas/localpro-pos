import Link from 'next/link';
import { FEATURE_MODULE_COUNT } from './FeaturesGrid';
import type { HomeDict } from './useMarketing';
import { SUPPORTED_UI_LANGUAGES } from '@/lib/marketing-constants';

type FooterLink = { label: string; href: string; route?: boolean };

export default function SiteFooter({ d }: { d: HomeDict }) {
  const columns: { title: string; aria: string; links: FooterLink[] }[] = [
    {
      title: d?.footerProduct || 'Product',
      aria: 'Product links',
      links: [
        { label: d?.footerFeatures || 'Features', href: '#features' },
        { label: d?.footerSolutions || 'Solutions', href: '#solutions' },
        { label: d?.footerEcommerce || 'Ecommerce integrations', href: '#ecommerce' },
        { label: d?.footerPricing || 'Pricing', href: '#' },
        { label: d?.footerBrowseStores || 'Browse Stores', href: '/stores', route: true },
      ],
    },
    {
      title: d?.footerCompany || 'Company',
      aria: 'Company links',
      links: [
        { label: d?.footerAbout || 'About', href: '#' },
        { label: d?.footerBlog || 'Blog', href: '#' },
        { label: d?.footerContact || 'Contact', href: '#' },
        { label: d?.footerPrivacy || 'Privacy Policy', href: '/privacy', route: true },
      ],
    },
    {
      title: d?.footerResources || 'Resources',
      aria: 'Resources links',
      links: [
        { label: d?.footerDocumentation || 'Documentation', href: '#' },
        { label: d?.footerSupport || 'Support', href: '#' },
        { label: d?.footerApiReference || 'API Reference', href: '#' },
      ],
    },
  ];

  return (
    <footer className="bg-[#070f16] text-white/55 px-4 sm:px-6 pt-10 pb-6 border-t border-white/10" aria-label="Site footer">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/1pos-logo.png" alt="1Pos" width={32} height={32} className="h-8 w-8 object-contain" decoding="async" />
              <span className="text-white font-black tracking-tight text-lg">1pos</span>
            </Link>
            <p className="text-xs leading-relaxed max-w-xs">
              {d?.footerDesc || `BIR-ready enterprise POS with ${FEATURE_MODULE_COUNT} capability modules for modern Philippine businesses.`}
            </p>
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
          <p>{d?.footerCopyright || '© 2026 1pos. All rights reserved.'}</p>
          <p className="text-white/35 font-mono">
            {d?.footerTagline || `BIR-ready POS · ${FEATURE_MODULE_COUNT} modules · ${SUPPORTED_UI_LANGUAGES} languages · Built for the Philippines`}
          </p>
        </div>
      </div>
    </footer>
  );
}
