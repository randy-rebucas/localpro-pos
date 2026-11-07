'use client';

import type { ReactNode } from 'react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { Barcode } from '@/components/marketing/primitives';

export type StatusLocale = 'en' | 'es';

export function resolveStatusLang(paramLang: unknown): StatusLocale {
  if (paramLang === 'en' || paramLang === 'es') return paramLang;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('preferred_lang');
    if (stored === 'en' || stored === 'es') return stored;
  }
  return 'en';
}

const slipKey = 'flex min-h-[44px] w-full items-center justify-center px-4 py-3 font-receipt text-sm font-medium uppercase transition-colors';
export const slipPrimaryKey = `${slipKey} bg-ink text-paper-white hover:bg-brand-navy`;
export const slipSecondaryKey = `${slipKey} border border-ink/25 text-ink hover:border-ink`;

function Counter({ children }: { children: ReactNode }) {
  return (
    <div className={`${marketingFontClasses} mk-root`}>
      <div className="flex min-h-dvh items-center justify-center bg-brand-navy-deep px-4 py-10">{children}</div>
    </div>
  );
}

export function StatusLoading({ label }: { label: string }) {
  return (
    <Counter>
      <p className="font-receipt text-sm uppercase tracking-[0.14em] text-[#8fe3d0]">{label}</p>
    </Counter>
  );
}

interface StatusSlipProps {
  /** Shown on the till display, such as 404. */
  code: string;
  title: string;
  message: ReactNode;
  stamp?: string;
  wide?: boolean;
  children: ReactNode;
}

/** What the till prints when something goes wrong: a readout on the display and a torn slip below it. */
export default function StatusSlip({ code, title, message, stamp, wide = false, children }: StatusSlipProps) {
  return (
    <Counter>
      <main className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="flex items-center justify-between gap-4 border border-white/10 bg-black/30 px-4 py-3">
          <Barcode className="h-8 w-24 text-white/30" />
          <span className="mk-led-glow font-led text-5xl leading-none text-[#7df0d6]">{code}</span>
        </div>
        <div className="mt-2 bg-paper-white p-6 text-ink sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-5xl">{title}</h1>
            {stamp && (
              <span
                className="mk-stamp shrink-0 border-4 border-stamp px-2 py-1 font-display text-2xl font-extrabold uppercase leading-none text-stamp"
                aria-hidden
              >
                {stamp}
              </span>
            )}
          </div>
          <div className="mt-3 break-words text-ink/70">{message}</div>
          <div className="mt-6 space-y-3 border-t border-dashed border-ink/30 pt-6">{children}</div>
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </main>
    </Counter>
  );
}
