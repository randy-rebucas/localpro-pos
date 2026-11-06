import Link from 'next/link';
import { FEATURE_MODULE_COUNT } from '@/components/FeaturesGrid';
import { SUPPORTED_UI_LANGUAGES } from '@/lib/marketing-constants';
import { Barcode, type Translate } from './primitives';

export default function PublicFooter({ t }: { t: Translate }) {
  const columns = [
    {
      title: t('footerProduct', 'Product'),
      links: [
        { href: '/#how-it-works', label: t('navHow', 'How it works') },
        { href: '/#features', label: t('navModules', 'Modules') },
        { href: '/#solutions', label: t('navSolutions', 'Solutions') },
        { href: '/#ecommerce', label: t('navEcommerce', 'Ecommerce') },
        { href: '/pricing', label: t('navPricing', 'Pricing') },
      ],
    },
    {
      title: t('footerGetStarted', 'Get started'),
      links: [
        { href: '/signup', label: t('startFreeTrial', 'Start free trial') },
        { href: '/stores', label: t('navBrowseStores', 'Browse stores') },
        { href: '/stores', label: t('signIn', 'Sign in') },
      ],
    },
    {
      title: t('footerResources', 'Resources'),
      links: [
        { href: '/about', label: t('footerAbout', 'About') },
        { href: '/contact', label: t('footerContact', 'Contact us') },
        { href: '/openapi.json', label: t('footerApiReference', 'API reference') },
        { href: '/privacy', label: t('footerPrivacy', 'Privacy policy') },
      ],
    },
  ];

  return (
    <footer className="bg-ink text-paper/70">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" className="font-display text-7xl font-extrabold uppercase leading-none text-paper-white">
              1pos
            </Link>
            <p className="mt-4 max-w-sm leading-relaxed">
              {t('footerDesc', 'BIR-ready point of sale for Philippine stores, from the first scan to the end-of-day count.')}
            </p>
            <p className="mt-3 font-receipt text-xs text-paper/60">{t('footerMaker', '1pos is a product of Devcom Digital Marketing Services.')}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="font-receipt text-xs font-medium uppercase tracking-[0.14em] text-paper/50">{column.title}</h3>
                <ul className="mt-2 text-sm">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="flex items-center text-paper/85 underline-offset-4 hover:text-paper-white hover:underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex gap-6 overflow-hidden text-paper/20" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Barcode key={i} className="h-8 w-36 shrink-0" />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 font-receipt text-xs text-paper/55 sm:flex-row sm:justify-between">
          <p>{t('footerCopyright', '© 2026 1pos. All rights reserved.')}</p>
          <p>
            {t('footerTagline', 'BIR-ready · {modules} modules · {languages} languages · Built for the Philippines')
              .replace('{modules}', String(FEATURE_MODULE_COUNT))
              .replace('{languages}', String(SUPPORTED_UI_LANGUAGES))}
          </p>
        </div>
      </div>
    </footer>
  );
}
