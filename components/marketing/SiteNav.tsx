'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ArrowIcon } from './ui';
import type { HomeDict } from './useMarketing';

export default function SiteNav({ d }: { d: HomeDict }) {
  const [open, setOpen] = useState(false);

  const links = [
    { href: '#features', label: d?.navFeatures || 'Features' },
    { href: '#solutions', label: d?.navSolutions || 'Solutions' },
    { href: '#ecommerce', label: d?.navEcommerce || 'Ecommerce' },
    { href: '#testimonials', label: d?.navCustomers || 'Customers' },
  ];

  return (
    <nav className="sticky top-0 z-50 mk-dark border-b border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Native img avoids next/image SSR/client srcSet hydration mismatches */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/1pos-logo.png" alt="1Pos" width={32} height={32} className="h-8 w-8 object-contain" decoding="async" fetchPriority="high" />
          <span className="text-white font-black tracking-tight text-lg leading-none">1pos</span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 rounded-md mk-glass px-1 py-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex items-center px-3 h-8 rounded text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10">
              {l.label}
            </a>
          ))}
          <Link href="/stores" className="inline-flex items-center px-3 h-8 rounded text-[13px] font-medium text-white/75 hover:text-white hover:bg-white/10">
            {d?.navBrowseStores || 'Browse Stores'}
          </Link>
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
            className="md:hidden mk-key inline-flex items-center justify-center w-9 h-9 rounded-md"
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
        <div id="mk-mobile-menu" className="mk-hero-in md:hidden border-t border-white/10 px-4 py-2 grid grid-cols-2 gap-1.5">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="mk-key rounded-md px-3 py-2 text-sm font-medium">
              {l.label}
            </a>
          ))}
          <Link href="/stores" className="mk-key rounded-md px-3 py-2 text-sm font-medium">
            {d?.navBrowseStores || 'Browse Stores'}
          </Link>
          <Link href="/stores" className="mk-key rounded-md px-3 py-2 text-sm font-medium">
            {d?.signIn || 'Sign in'}
          </Link>
        </div>
      )}
    </nav>
  );
}
