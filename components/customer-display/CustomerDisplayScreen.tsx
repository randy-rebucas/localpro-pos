'use client';

import type { ReactNode } from 'react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { Barcode } from '@/components/marketing/primitives';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatNumber, getCurrencySymbol, getDefaultTenantSettings } from '@/lib/currency';

type ScreenVariant = 'loading' | 'error' | 'empty' | 'no-session' | 'success';

/** Fonts and the dark counter surface shared by every customer display state. */
export const DISPLAY_SHELL = `${marketingFontClasses} mk-root pos-register bg-brand-navy-deep! text-paper!`;

/**
 * An amount on the pole display. Doto has no peso glyph, so the symbol is set
 * in the receipt face beside the LED numerals.
 */
export function LedAmount({ amount, className = '' }: { amount: number; className?: string }) {
  const { settings } = useTenantSettings();
  const s = settings || getDefaultTenantSettings();
  const symbol = s.currencySymbol || getCurrencySymbol(s.currency || 'USD');
  const number = formatNumber(amount, s.numberFormat || getDefaultTenantSettings().numberFormat);
  const sign = <span className="font-receipt text-[0.4em] font-medium">{symbol}</span>;
  const digits = <span className="mk-led-glow font-led leading-none">{number}</span>;

  return (
    <span className={`inline-flex items-baseline gap-2 whitespace-nowrap ${className}`}>
      {s.currencyPosition === 'after' ? (
        <>
          {digits}
          {sign}
        </>
      ) : (
        <>
          {sign}
          {digits}
        </>
      )}
    </span>
  );
}

interface CustomerDisplayScreenProps {
  variant: ScreenVariant;
  title: string;
  description?: string;
  sessionId?: string;
  sessionLabel?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Shown on the pole display for a completed sale. */
  amount?: number;
  stamp?: string;
  children?: ReactNode;
}

/** Full-screen states of the customer display: waiting, loading, problems and a completed sale. */
export default function CustomerDisplayScreen({
  variant,
  title,
  description,
  sessionId,
  sessionLabel = 'Session',
  onRetry,
  retryLabel = 'Retry',
  amount,
  stamp,
  children,
}: CustomerDisplayScreenProps) {
  const isProblem = variant === 'error' || variant === 'no-session';

  return (
    <div
      className={`${DISPLAY_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}
      role={isProblem ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      {variant === 'loading' && (
        <p className="font-receipt text-lg uppercase tracking-[0.14em] text-[#8fe3d0]">{title}</p>
      )}

      {variant === 'empty' && (
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-6xl text-paper-white sm:text-7xl lg:text-8xl">{title}</h1>
          {description && <p className="mt-4 text-xl text-paper/70 sm:text-2xl">{description}</p>}
          {/* A scanner beam waiting for the first item */}
          <div className="relative mx-auto mt-12 w-72 max-w-full overflow-hidden border border-white/10 bg-black/30 px-8 py-8" aria-hidden>
            <Barcode className="h-24 w-full text-paper/80" />
            <div className="mk-sweep" />
          </div>
        </div>
      )}

      {variant === 'success' && (
        <div className="w-full max-w-3xl text-center">
          <div className="relative inline-block">
            <h1 className="text-7xl text-paper-white sm:text-8xl lg:text-9xl">{title}</h1>
            {stamp && (
              <span className="mk-stamp absolute -right-6 -top-8 border-4 border-stamp bg-brand-navy-deep px-3 py-1 font-display text-3xl font-extrabold uppercase leading-none text-stamp sm:-right-12">
                {stamp}
              </span>
            )}
          </div>
          {description && <p className="mt-4 text-2xl text-paper/80">{description}</p>}
          {amount !== undefined && (
            <div className="mx-auto mt-10 inline-block border border-white/10 bg-black/40 px-8 py-6">
              <LedAmount amount={amount} className="text-6xl text-[#7df0d6] sm:text-7xl" />
            </div>
          )}
          {children}
        </div>
      )}

      {isProblem && (
        <div className="w-full max-w-lg">
          <div className="bg-paper-white p-6 text-ink sm:p-8">
            <h1 className="text-5xl">{title}</h1>
            {description && <p className="mt-3 text-lg text-ink/70">{description}</p>}
            {sessionId && (
              <p className="mt-4 break-all font-receipt text-xs uppercase text-ink/60">
                {sessionLabel}: {sessionId.substring(0, 20)}…
              </p>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-6 flex min-h-[44px] w-full items-center justify-center bg-ink px-5 font-receipt text-sm font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy"
              >
                {retryLabel}
              </button>
            )}
            {children}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      )}
    </div>
  );
}
