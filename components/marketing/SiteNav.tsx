'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ArrowIcon } from './ui';
import type { HomeDict } from './useMarketing';
import { BrandLogo } from '@/components/BrandLogo';

/** Shared public header. Homepage section links become `/#section` on every other page. */
export default function SiteNav({ d }: { d: HomeDict }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = pathname === '/' ? '' : '/';

  const links: { href: string; label: string; route?: boolean }[] = [
    { href: `${base}#features`, label: d?.navFeatures || 'Features' },
    { href: `${base}#solutions`, label: d?.navSolutions || 'Solutions' },
    { href: `${base}#ecommerce`, label: d?.navEcommerce || 'Ecommerce' },
    { href: `${base}#testimonials`, label: d?.navCustomers || 'Customers' },
    { href: '/pricing', label: d?.navPricing || 'Pricing', route: true },
    { href: '/stores', label: d?.navBrowseStores || 'Browse Stores', route: true },
  ];

  const isCurrent = (href: string) => pathname === href;
  const desktopLink = (current: boolean) =>
    `inline-flex items-center px-3 h-8 rounded text-[13px] font-medium ${
      current ? 'bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'text-white/75 hover:text-white hover:bg-white/10'
    }`;
  const mobileLink = (current: boolean) => `${current ? 'mk-key-brand' : 'mk-key'} rounded-md px-3 py-2 text-sm font-medium`;

  return (
    <nav className="sticky top-0 z-50 mk-dark border-b border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center flex-shrink-0 text-white">
          <BrandLogo />
        </Link>

        <div className="hidden lg:flex items-center gap-0.5 rounded-md mk-glass px-1 py-1">
          {links.map((l) =>
            l.route ? (
              <Link key={l.href} href={l.href} aria-current={isCurrent(l.href) ? 'page' : undefined} className={desktopLink(isCurrent(l.href))}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className={desktopLink(false)}>
                {l.label}
              </a>
            )
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/stores" className="hidden sm:inline-flex items-center px-3 h-9 text-[13px] font-medium text-white/80 hover:text-white">
            {d?.signIn || 'Sign in'}
          </Link>
          <Link href="/signup" className="mk-key-brand mk-sheen inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-semibold">
            {d?.getStartedFree || 'Get Started Free'}
            <ArrowIcon />
          </Link>
          <button
            type="button"
            className="lg:hidden mk-key inline-flex items-center justify-center w-9 h-9 rounded-md"
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            aria-label={d?.navMenu || 'Menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> : <Menu className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mk-mobile-menu" className="mk-hero-in lg:hidden border-t border-white/10 px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {links.map((l) =>
            l.route ? (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} aria-current={isCurrent(l.href) ? 'page' : undefined} className={mobileLink(isCurrent(l.href))}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={mobileLink(false)}>
                {l.label}
              </a>
            )
          )}
          <Link href="/stores" onClick={() => setOpen(false)} className={`${mobileLink(false)} sm:hidden`}>
            {d?.signIn || 'Sign in'}
          </Link>
        </div>
      )}
    </nav>
  );
}
