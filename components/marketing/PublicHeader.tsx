'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { setPublicLang, usePublicLang, type PublicLang } from '@/hooks/usePublicLang';
import type { Translate } from './primitives';

const LANGS: PublicLang[] = ['en', 'es'];

function LanguageToggle({ t }: { t: Translate }) {
  const lang = usePublicLang();
  return (
    <div className="flex font-receipt text-xs" role="group" aria-label={t('langLabel', 'Language')}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setPublicLang(code)}
          aria-pressed={lang === code}
          className={`px-2 py-1.5 uppercase ${lang === code ? 'bg-ink text-paper-white' : 'text-ink/60 hover:text-ink'}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export default function PublicHeader({ t }: { t: Translate }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const links = [
    { href: '/#how-it-works', label: t('navHow', 'How it works') },
    { href: '/#features', label: t('navModules', 'Modules') },
    { href: '/#solutions', label: t('navSolutions', 'Solutions') },
    { href: '/#ecommerce', label: t('navEcommerce', 'Ecommerce') },
    { href: '/pricing', label: t('navPricing', 'Pricing') },
    { href: '/stores', label: t('navBrowseStores', 'Browse stores') },
  ];

  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper-white"
      >
        {t('skipToContent', 'Skip to content')}
      </a>

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={t('homeLabel', '1pos home')}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small logo; next/image adds nothing here */}
          <img src="/brand/1pos-logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <span className="font-display text-2xl font-extrabold uppercase leading-none">1pos</span>
        </Link>

        <nav className="hidden items-center gap-6 xl:flex" aria-label={t('navMainLabel', 'Main navigation')}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="flex items-center whitespace-nowrap text-sm font-medium text-ink/75 underline-offset-4 hover:text-ink hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LanguageToggle t={t} />
          </div>
          <Link href="/stores" className="hidden items-center whitespace-nowrap px-2 text-sm font-medium text-ink/75 hover:text-ink sm:flex">
            {t('signIn', 'Sign in')}
          </Link>
          <Link
            href="/signup"
            className="group hidden items-center gap-1.5 whitespace-nowrap bg-ink px-4 py-2.5 text-sm font-semibold text-paper-white hover:bg-brand-navy sm:flex"
          >
            {t('startFreeTrial', 'Start free trial')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="public-mobile-menu"
            aria-label={open ? t('menuClose', 'Close menu') : t('menuOpen', 'Open menu')}
            className="flex h-10 w-10 items-center justify-center xl:hidden"
          >
            {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="public-mobile-menu"
          aria-label={t('navMobileLabel', 'Mobile navigation')}
          className="absolute inset-x-0 top-full h-[calc(100dvh-4rem)] overflow-y-auto border-t border-ink/15 bg-paper-white px-4 pb-8 sm:px-6 xl:hidden"
        >
          <ul>
            {links.map((link, i) => (
              <li key={link.href} className="border-b border-ink/15">
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline gap-3 py-4 font-display text-3xl font-extrabold uppercase"
                >
                  <span className="font-receipt text-xs font-normal text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <LanguageToggle t={t} />
            <Link href="/stores" onClick={() => setOpen(false)} className="py-2 text-sm font-medium">
              {t('signIn', 'Sign in')}
            </Link>
          </div>
          <Link
            href="/signup"
            onClick={() => setOpen(false)}
            className="mt-6 flex items-center justify-center gap-2 bg-ink px-4 py-4 font-semibold text-paper-white"
          >
            {t('startFreeTrial', 'Start free trial')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      )}
    </header>
  );
}
