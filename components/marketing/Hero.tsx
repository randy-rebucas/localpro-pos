'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Check, Cloud } from 'lucide-react';
import { Barcode, ReceiptRow, type Translate } from './primitives';

const CART = [
  { name: 'Rice 5kg Sack', price: 350 },
  { name: 'Coffee Gift Set', price: 220 },
  { name: 'Canned Goods Bundle', price: 185 },
  { name: 'Phone Charger', price: 250 },
];

const SCAN_INTERVAL_MS = 1500;

const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Register({ scanned, t }: { scanned: number; t: Translate }) {
  const total = CART.slice(0, scanned).reduce((sum, item) => sum + item.price, 0);
  return (
    <div className="border-[10px] border-[#0b1820] bg-paper-white font-receipt text-[11px] text-ink shadow-[0_24px_40px_-20px_rgb(0_0_0/0.7)]">
      <div className="flex items-center justify-between bg-brand-navy px-3 py-1.5 text-paper-white">
        <span>{t('heroRegister', 'Register 1')}</span>
        <span className="flex items-center gap-1 text-[#8fe3d0]">
          <Cloud className="h-3 w-3" aria-hidden="true" />
          {t('heroSynced', 'Synced')}
        </span>
      </div>
      <ul className="min-h-[7.6rem] space-y-1 px-3 py-2.5">
        {CART.slice(0, scanned).map((item) => (
          <li key={item.name} className="flex justify-between gap-3">
            <span className="truncate">{item.name}</span>
            <span>{money(item.price)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between bg-brand px-3 py-2 font-semibold text-ink">
        <span>{t('heroTotal', 'TOTAL')}</span>
        <span className="text-base">₱{money(total)}</span>
      </div>
    </div>
  );
}

function Receipt({ t }: { t: Translate }) {
  return (
    <div className="mk-tear-b bg-paper-white px-5 pb-8 pt-4 font-receipt text-[11px] leading-[1.55] text-ink">
      <p className="text-center text-sm font-semibold">{t('heroReceiptStore', 'YOUR STORE NAME')}</p>
      <p className="text-center">{t('heroReceiptAddress', 'Your address, Philippines')}</p>
      <p className="text-center">TIN 000-000-000-000</p>
      <div className="my-2 border-t border-dashed border-ink/40" />
      {CART.map((item) => (
        <ReceiptRow key={item.name} label={item.name} value={money(item.price)} />
      ))}
      <div className="my-2 border-t border-dashed border-ink/40" />
      <ReceiptRow label={t('heroVatable', 'VATable sales')} value="897.32" />
      <ReceiptRow label={t('heroVat', 'VAT 12%')} value="107.68" />
      <div className="mt-1 text-[13px]">
        <ReceiptRow label={t('heroTotal', 'TOTAL')} value="₱1,005.00" strong />
      </div>
      <ReceiptRow label={t('heroCash', 'Cash')} value="1,100.00" />
      <ReceiptRow label={t('heroChange', 'Change')} value="95.00" />
      <div className="my-2 border-t border-dashed border-ink/40" />
      <Barcode className="mx-auto h-9 w-40" />
      <p className="mt-2 text-center">{t('heroThanks', 'Thank you. Come again!')}</p>
      <p className="mt-2 text-center text-[10px] text-ink/60">{t('heroSampleNote', 'Sample receipt for illustration')}</p>
    </div>
  );
}

/** Desktop counter scene: terminal, pole display, scanner and a printer feeding paper over the edge. */
function CounterScene({ scanned, t }: { scanned: number; t: Translate }) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  // The paper keeps feeding as the visitor scrolls past the hero.
  const paperY = useTransform(scrollY, [0, 620], ['-58%', '0%']);
  const total = CART.slice(0, scanned).reduce((sum, item) => sum + item.price, 0);
  const paid = scanned === CART.length;

  return (
    <div className="relative h-[35rem] w-full" aria-hidden="true">
      {/* Cloud link */}
      <div className="absolute right-6 top-0 flex items-center gap-2 font-receipt text-[11px] text-paper/80">
        <Cloud className="h-10 w-10 text-[#8fe3d0]" strokeWidth={1.5} />
        <span>
          {t('heroCloudLine', 'Saved to the cloud')}
          <br />
          {t('heroCloudLine2', 'as you sell')}
        </span>
      </div>
      <svg className="absolute right-[8.5rem] top-12 h-[7.5rem] w-40 text-[#8fe3d0]" viewBox="0 0 160 120" fill="none">
        <path className="mk-flow" d="M150 2 V56 H8 V120" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      {/* Terminal */}
      <div className="absolute bottom-[3.4rem] left-0 w-[24rem]">
        <Register scanned={scanned} t={t} />
        <div className="mx-auto h-[5.5rem] w-11 bg-gradient-to-b from-[#0b1820] to-[#1b3342]" />
        <div className="mx-auto h-3 w-36 bg-[#0b1820]" />
      </div>

      {/* Item on the counter being scanned */}
      <div className="absolute bottom-[3.4rem] left-[6.25rem] h-14 w-[3.25rem] bg-paper-white p-1.5">
        <Barcode className="h-full w-full text-ink" />
      </div>

      {/* Customer pole display */}
      <div className="absolute bottom-[3.4rem] right-[2.5rem] w-[10.5rem]">
        <div className="border-4 border-[#0b1820] bg-[#04100f] px-2.5 py-2 text-right">
          <div className="font-receipt text-[10px] text-[#8fe3d0]/70">{paid ? t('heroPaid', 'PAID') : t('heroAmount', 'AMOUNT DUE')}</div>
          <div className="mk-led-glow font-led text-[1.65rem] leading-tight text-[#7df0d6]">{money(total)}</div>
        </div>
        <div className="mx-auto h-[6.2rem] w-3 bg-[#0b1820]" />
      </div>

      {/* Handheld scanner firing at the counter */}
      <svg className="absolute bottom-[3.4rem] left-0 h-24 w-28" viewBox="0 0 112 96" fill="none">
        <path key={scanned} className="mk-beam" d="M84 26 L112 62 M84 26 L112 96" stroke="#ff3b2f" strokeWidth="1.5" />
        <path d="M90 6 L38 2 L22 24 L50 32 L42 90 L60 94 L72 36 L82 34 Z" fill="#14262f" stroke="#35979c" strokeWidth="2" strokeLinejoin="round" />
        <path d="M82 33 L72 31" stroke="#ff3b2f" strokeWidth="3" />
      </svg>

      {/* Counter */}
      <div className="absolute inset-x-0 bottom-0 h-[3.4rem] border-t-[6px] border-brand-muted bg-gradient-to-b from-[#26495c] to-brand-navy" />
      <div className="absolute bottom-0 left-full h-[3.4rem] w-[50vw] border-t-[6px] border-brand-muted bg-gradient-to-b from-[#26495c] to-brand-navy" />

      {/* Printer */}
      <div className="absolute bottom-[3.4rem] right-1 h-[5.5rem] w-[15.5rem] bg-[#0b1820]">
        <div className="absolute inset-x-3 top-3 h-2 bg-brand-muted/30" />
        <div className="absolute left-4 top-8 h-1.5 w-1.5 bg-[#7df0d6]" />
        <span className="absolute bottom-2 right-3 font-receipt text-[9px] text-paper/50">ESC/POS</span>
      </div>

      {/* Paper falling over the counter edge and into the next section */}
      <div className="absolute right-[1.25rem] top-full z-20 h-[32rem] w-[14rem] -translate-y-[3.4rem] overflow-hidden">
        <motion.div className="drop-shadow-[0_10px_14px_rgb(0_0_0/0.35)]" style={{ y: reduced ? 0 : paperY }}>
          <div className="mk-feed relative">
            <Receipt t={t} />
            {paid && (
              <span className="mk-stamp absolute right-3 top-28 border-[3px] border-stamp px-2 py-0.5 font-display text-2xl font-extrabold uppercase text-stamp">
                {t('heroPaid', 'PAID')}
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function Hero({ t }: { t: Translate }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [scanned, setScanned] = useState(1);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const photoY = useTransform(scrollYProgress, [0, 1], ['0%', '22%']);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      setScanned((count) => {
        if (count >= CART.length) clearInterval(timer);
        return Math.min(count + 1, CART.length);
      });
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduced]);

  const shownScanned = reduced ? CART.length : scanned;
  const words = [t('heroWord1', 'Scan.'), t('heroWord2', 'Sell.'), t('heroWord3', 'Print.'), t('heroWord4', 'Sync.')];

  return (
    <section ref={ref} aria-labelledby="hero-heading" className="relative z-10 bg-brand-navy-deep text-paper-white">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div className="absolute -inset-x-0 -top-[12%] h-[124%]" style={{ y: reduced ? 0 : photoY }}>
          <Image src="/images/home/store-shelves.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-30 mix-blend-luminosity" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-r from-brand-navy-deep via-brand-navy-deep/85 to-brand-navy-deep/40" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-8 lg:pt-10">
        <div className="pb-12 lg:col-span-6 lg:pb-14">
          <p className="font-receipt text-xs uppercase tracking-[0.14em] text-[#8fe3d0]">
            {t('heroKicker', 'BIR-ready point of sale · Philippines')}
          </p>
          <h1 id="hero-heading" className="mt-4 text-[clamp(4.25rem,7.4vw,6.5rem)]">
            {words.map((word, i) => (
              <span key={word} className={`block ${i === 3 ? 'text-brand-muted' : ''}`}>
                {word}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-paper/85">
            {t('heroDesc', 'One system for the whole counter. Ring up sales, print BIR-ready receipts and see every branch from anywhere, even when the internet drops.')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="group flex items-center justify-center gap-2 bg-paper-white px-7 py-4 font-semibold text-ink hover:bg-brand-soft"
            >
              {t('startFreeTrial', 'Start free trial')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <Link
              href="/stores"
              className="flex items-center justify-center border-2 border-paper/40 px-7 py-[0.875rem] font-semibold hover:border-paper-white"
            >
              {t('browseLiveStores', 'Browse live stores')}
            </Link>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-receipt text-xs text-paper/70">
            {[t('heroPoint1', '14-day free trial'), t('heroPoint2', 'No credit card'), t('heroPoint3', 'Cancel anytime')].map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#8fe3d0]" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Wide screens: full counter scene. Below that it would collide, so just the register. */}
        <div className="relative hidden self-end lg:col-span-6 xl:block">
          <CounterScene scanned={shownScanned} t={t} />
        </div>
        <div className="pb-10 lg:col-span-6 lg:self-center xl:hidden" aria-hidden="true">
          <Register scanned={shownScanned} t={t} />
        </div>
      </div>
    </section>
  );
}
