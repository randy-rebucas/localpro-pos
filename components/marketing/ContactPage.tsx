'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, Copy, Mail, ReceiptText, Search, ShieldCheck, Store } from 'lucide-react';
import MarketingShell from './MarketingShell';
import { ArrowIcon, FKey, SectionHeader } from './ui';
import { useDictSection } from './useMarketing';
import { Button } from '@/components/ui/button';
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '@/lib/marketing-constants';

/** /contact — one support inbox, what to put in the email, and shortcuts that skip the email entirely. */
export default function ContactPage() {
  const d = useDictSection('contact');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin / permissions) — the address is still on screen
    }
  };

  const checklist = [
    [d?.slipStore || 'STORE', '@your-store'],
    [d?.slipBranch || 'BRANCH', d?.slipBranchVal || 'Main'],
    [d?.slipOr || 'OR / TXN NO.', '000123'],
    [d?.slipWhen || 'WHEN', '2026-10-31 14:05'],
    [d?.slipWhat || 'WHAT HAPPENED', d?.slipWhatVal || 'Steps you took'],
    [d?.slipShot || 'SCREENSHOT', d?.slipShotVal || 'Attached'],
  ];

  const routes: { Icon: LucideIcon; title: string; body: string; href: string; cta: string; external?: boolean }[] = [
    {
      Icon: Search,
      title: d?.routeFindTitle || "Can't find your store",
      body: d?.routeFindBody || 'Look it up by name, city or @handle and go straight to its sign-in screen.',
      href: '/stores',
      cta: d?.routeFindCta || 'Browse stores',
    },
    {
      Icon: ReceiptText,
      title: d?.routePriceTitle || 'Plans and limits',
      body: d?.routePriceBody || 'Monthly prices, staff and branch limits, and what BIR help each plan includes.',
      href: '/pricing',
      cta: d?.routePriceCta || 'See pricing',
    },
    {
      Icon: Store,
      title: d?.routeOpenTitle || 'Open a new store',
      body: d?.routeOpenBody || 'Sign up yourself — the 14-day trial starts right away, no card needed.',
      href: '/signup',
      cta: d?.routeOpenCta || 'Create a store',
    },
    {
      Icon: ShieldCheck,
      title: d?.routePrivacyTitle || 'Privacy and data requests',
      body: d?.routePrivacyBody || 'Access, correction or deletion of personal data goes to our privacy inbox.',
      href: `mailto:${PRIVACY_EMAIL}`,
      cta: PRIVACY_EMAIL,
      external: true,
    },
  ];

  return (
    <MarketingShell>
      <main id="main-content">
        <section aria-labelledby="contact-heading" className="relative mk-dark text-white overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/marketing/cafe-counter.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-30 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/85 to-[#0a1620]/45" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a1620] to-transparent pointer-events-none" aria-hidden="true" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14 pb-12 md:pb-16 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 mk-hero-in">
              <div className="flex items-center gap-2 mb-4">
                <FKey dark>F1</FKey>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.eyebrow || 'Contact & support'}</span>
              </div>
              <h1 id="contact-heading" className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-4">
                {d?.title || 'Something wrong at the counter? Email us.'}
              </h1>
              <p className="text-[15px] text-white/70 leading-relaxed max-w-xl mb-6">
                {d?.desc || 'One inbox handles setup questions, billing and problems with a sale.'}
              </p>

              <div className="mk-glass backdrop-blur-md rounded-xl p-3 sm:p-4 max-w-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">{d?.inboxLabel || 'Support inbox'}</p>
                <div className="mk-lcd rounded-md flex items-center gap-2 px-3 h-12 mb-2.5">
                  <Mail className="w-4 h-4 flex-shrink-0 opacity-70" strokeWidth={2.5} aria-hidden="true" />
                  <span className="text-base sm:text-lg font-bold truncate">{SUPPORT_EMAIL}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="mk-key-brand mk-sheen inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-bold text-sm">
                    {d?.emailUs || 'Write an email'}
                    <ArrowIcon className="w-4 h-4" />
                  </a>
                  <Button type="button" variant="key" size="xl" onClick={copy} className="px-5">
                    {copied ? <Check className="w-4 h-4 text-emerald-300" strokeWidth={2.5} aria-hidden="true" /> : <Copy className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />}
                    <span aria-live="polite">{copied ? d?.copied || 'Copied' : d?.copy || 'Copy address'}</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* What to include, as a printed slip */}
            <div className="lg:col-span-5 mk-hero-in [animation-delay:150ms]">
              <div className="mx-auto max-w-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2 text-center">{d?.slipHeading || 'Put this in your email'}</p>
                <div className="mk-print bg-[#fbfaf6] text-gray-800 rounded-sm shadow-2xl px-5 py-5 font-mono text-xs">
                  <p className="text-center font-bold tracking-widest mb-1">1POS SUPPORT</p>
                  <p className="text-center text-[10px] text-gray-500 mb-3">{d?.slipSub || 'fill in what you can'}</p>
                  <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
                    {checklist.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="text-gray-500">{k}</span>
                        <span className="font-bold text-right truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="border-t border-dashed border-gray-300 mt-3 pt-3 text-[10px] text-gray-500 leading-snug">
                    {d?.slipNote || 'The OR number is printed on the receipt and shown in Transactions. It lets us find the exact sale.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="routes-heading" className="bg-[#eef3f5] px-4 sm:px-6 py-12 md:py-16">
          <div className="max-w-7xl mx-auto">
            <SectionHeader
              id="routes-heading"
              fkey="F2"
              eyebrow={d?.routesEyebrow || 'Faster than email'}
              title={d?.routesTitle || 'You may not need to write at all'}
            />
            <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {routes.map(({ Icon, ...r }, i) => {
                const body = (
                  <>
                    <span className="mk-key-brand w-9 h-9 rounded-md flex items-center justify-center mb-3">
                      <Icon className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <h3 className="text-[15px] font-bold text-gray-900 mb-1">{r.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed mb-4">{r.body}</p>
                    <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-brand group-hover:text-brand-hover truncate">
                      {r.cta}
                      <ArrowIcon className="w-3 h-3 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </>
                );
                const cls = 'mk-panel mk-sheen group flex flex-col h-full rounded-lg p-4 hover:border-brand/60';
                return (
                  <li key={r.title} className="mk-reveal" style={{ ['--i' as string]: i }}>
                    {r.external ? (
                      <a href={r.href} className={cls}>{body}</a>
                    ) : (
                      <Link href={r.href} className={cls}>{body}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
