'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Cloud, Monitor, Printer, ScanBarcode, Smartphone, WalletCards, type LucideIcon } from 'lucide-react';
import { LineTag, type Translate } from './primitives';

function ScanOverlay() {
  return (
    <div className="absolute inset-[14%]" aria-hidden="true">
      <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-paper-white" />
      <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-paper-white" />
      <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-paper-white" />
      <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-paper-white" />
      <span className="mk-sweep" />
    </div>
  );
}

/** Registers and a phone exchanging data with the cloud. */
function CloudDiagram({ t }: { t: Translate }) {
  const devices = [
    { Icon: Monitor, label: t('syncDevice1', 'Main branch'), x: 90 },
    { Icon: Printer, label: t('syncDevice2', 'Branch 2'), x: 320 },
    { Icon: Smartphone, label: t('syncDevice3', 'Owner’s phone'), x: 550 },
  ];
  return (
    <div className="absolute inset-0 bg-brand-navy-deep" aria-hidden="true">
      <svg viewBox="0 0 640 520" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="#8fe3d0" strokeWidth="2.5" strokeLinecap="round">
          <path className="mk-flow" d="M270 200 C 210 260, 90 260, 90 340" />
          <path className="mk-flow mk-flow-reverse" d="M320 210 V340" />
          <path className="mk-flow" d="M370 200 C 430 260, 550 260, 550 340" />
        </g>
        <Cloud x={230} y={40} width={180} height={180} color="#fdfbf6" strokeWidth={1.1} />
        <text x="320" y="146" textAnchor="middle" fill="#fdfbf6" fontSize="17" fontWeight="600" style={{ fontFamily: 'var(--mk-font-receipt)' }}>
          1pos
        </text>
        {devices.map(({ Icon, label, x }) => (
          <g key={label}>
            <rect x={x - 62} y="340" width="124" height="96" fill="#1e3a4c" stroke="#5fb3b7" strokeWidth="2" />
            <Icon x={x - 18} y={354} width={36} height={36} color="#fdfbf6" strokeWidth={1.5} />
            <text x={x} y="416" textAnchor="middle" fill="#fdfbf6" fontSize="12" style={{ fontFamily: 'var(--mk-font-receipt)' }}>
              {label}
            </text>
          </g>
        ))}
        <text x="320" y="482" textAnchor="middle" fill="#8fe3d0" fontSize="13" style={{ fontFamily: 'var(--mk-font-receipt)' }}>
          {t('syncCaption', 'Offline sales wait here, then sync on reconnect')}
        </text>
      </svg>
    </div>
  );
}

type Step = {
  word: string;
  Icon: LucideIcon;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
};

export default function Steps({ t }: { t: Translate }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const steps: Step[] = [
    {
      word: t('heroWord1', 'Scan.'),
      Icon: ScanBarcode,
      title: t('stepScanTitle', 'Any code, any scanner'),
      body: t('stepScanBody', 'Plug in a USB or wireless barcode scanner, or use a camera for QR codes. Products land in the cart with live stock checks.'),
      points: [t('stepScanP1', 'USB and wireless scanners'), t('stepScanP2', 'Camera QR scanning'), t('stepScanP3', 'Search by name, SKU or barcode')],
      visual: (
        <>
          <Image src="/images/home/checkout-scanner.jpg" alt={t('stepScanAlt', 'Item passing over a red-lit checkout scanner')} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          <ScanOverlay />
        </>
      ),
    },
    {
      word: t('heroWord2', 'Sell.'),
      Icon: WalletCards,
      title: t('stepSellTitle', 'Take the money however it comes'),
      body: t('stepSellBody', 'Cash, cards, GCash, Maya and QR payments at one till. Discounts, refunds and drawer counts are all built in.'),
      points: [t('stepSellP1', 'Cash, card and e-wallets'), t('stepSellP2', 'Discount codes and promos'), t('stepSellP3', 'Refunds that restore stock')],
      visual: <Image src="/images/home/tap-to-pay.jpg" alt={t('stepSellAlt', 'Customer paying by phone at a checkout terminal')} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />,
    },
    {
      word: t('heroWord3', 'Print.'),
      Icon: Printer,
      title: t('stepPrintTitle', 'BIR-ready receipts on every sale'),
      body: t('stepPrintBody', 'VAT is worked out for you and printed on any ESC/POS thermal printer. Prefer paper-free? Send it by email or PDF.'),
      points: [t('stepPrintP1', 'ESC/POS thermal printers'), t('stepPrintP2', 'Automatic VAT computation'), t('stepPrintP3', 'Print, PDF or email')],
      visual: <Image src="/images/home/receipt-handoff.jpg" alt={t('stepPrintAlt', 'Hands holding a printed receipt at a checkout terminal')} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-[88%_50%]" />,
    },
    {
      word: t('heroWord4', 'Sync.'),
      Icon: Cloud,
      title: t('stepSyncTitle', 'Every branch, one set of numbers'),
      body: t('stepSyncBody', 'Each sale updates stock and reports across your branches. If the internet drops, keep selling; 1pos syncs when you are back online.'),
      points: [t('stepSyncP1', 'Real-time stock across branches'), t('stepSyncP2', 'Offline mode with auto sync'), t('stepSyncP3', 'Reports from anywhere')],
      visual: <CloudDiagram t={t} />,
    },
  ];

  return (
    <section id="how-it-works" aria-labelledby="steps-heading" className="scroll-mt-20 bg-paper">
      <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <LineTag no="01">{t('stepsTag', 'How it works')}</LineTag>
        <h2 id="steps-heading" className="mt-4 max-w-3xl text-5xl sm:text-6xl lg:text-7xl">
          {t('stepsHeading', 'One sale, start to finish')}
        </h2>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-10">
        {/* Desktop: the visual stays pinned while the steps scroll past */}
        <div className="hidden lg:block">
          <div className="sticky top-24 my-12 h-[calc(100vh-8rem)] max-h-[38rem] overflow-hidden bg-ink">
            {steps.map((step, i) => (
              <div key={step.word} className={`absolute inset-0 transition-opacity duration-500 ${active === i ? 'opacity-100' : 'opacity-0'}`}>
                {step.visual}
              </div>
            ))}
            <div className="absolute left-0 top-0 bg-ink px-3 py-1.5 font-receipt text-xs text-paper-white">
              {String(active + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </div>
          </div>
        </div>

        <div>
          {steps.map((step, i) => (
            <article
              key={step.word}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-step={i}
              className="flex flex-col justify-center py-10 lg:min-h-[80vh] lg:py-0"
            >
              <div className="relative mb-6 aspect-[4/3] overflow-hidden bg-ink lg:hidden">{step.visual}</div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center bg-ink text-paper-white">
                  <step.Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="font-display text-5xl font-extrabold uppercase leading-none text-brand-hover">{step.word}</span>
              </div>
              <h3 className="mt-5 text-2xl font-bold sm:text-3xl">{step.title}</h3>
              <p className="mt-3 max-w-md text-lg leading-relaxed text-ink/75">{step.body}</p>
              <ul className="mt-5 max-w-md border-t border-ink/20 font-receipt text-[13px]">
                {step.points.map((point) => (
                  <li key={point} className="border-b border-ink/20 py-2">
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
