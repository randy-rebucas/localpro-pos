'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import Currency from '@/components/Currency';
import { Button } from '@/components/ui/button';
import type { Discount } from '@/hooks/useDiscount';
import type { TranslationDict } from '@/types/dictionary';

interface CartSummaryFooterProps {
  dict: TranslationDict;
  primaryColor: string;
  subtotal: number;
  total: number;
  taxAmount: number;
  appliedDiscount: Discount | null;
  taxEnabled?: boolean;
  taxLabel?: string;
  taxRate?: number;
  processing?: boolean;
  processingLabel?: string;
  variant?: 'main' | 'roaming';
  onCheckout: () => void;
}

export default function CartSummaryFooter({
  dict,
  subtotal,
  total,
  taxAmount,
  appliedDiscount,
  taxEnabled,
  taxLabel,
  taxRate,
  processing = false,
  processingLabel,
  variant = 'main',
  onCheckout,
}: CartSummaryFooterProps) {
  const totalLabel = dict.pos?.total || dict.common?.total || 'Total';

  if (variant === 'roaming') {
    return (
      <div className="shrink-0 border-t border-gray-200 px-5 py-4 bg-gray-50 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{dict.pos?.subtotal}:</span>
          <Currency amount={subtotal} />
        </div>
        {appliedDiscount && (
          <div className="flex justify-between text-sm text-green-700">
            <span>
              {dict.pos?.discount} ({appliedDiscount.code}):
            </span>
            <span>
              -<Currency amount={appliedDiscount.amount} />
            </span>
          </div>
        )}
        {taxEnabled && taxRate != null && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>
              {taxLabel || 'Tax'} ({taxRate}%):
            </span>
            <Currency amount={taxAmount} />
          </div>
        )}
        <div className="flex justify-between font-bold text-lg text-gray-900 pt-1 border-t border-gray-300">
          <span>{totalLabel}:</span>
          <Currency amount={total} showConverted convertedClassName="block text-xs text-gray-500 font-normal text-right leading-tight" />
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={processing}
          className="w-full bg-green-600 text-white py-4 min-h-[44px] font-bold hover:bg-green-700 transition-colors text-lg border border-green-700 flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <div className="animate-spin h-5 w-5 border-b-2 border-white" />
              <span>{processingLabel || dict.pos?.processing || 'Processing...'}</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {dict.pos?.checkout}
            </>
          )}
        </button>
      </div>
    );
  }

  // Main register: sits on the mk-dark cart column — totals on the LCD, charge on the brand keycap.
  return (
    <div className="shrink-0 pt-3 space-y-2">
      <dl className="space-y-1 px-1 font-mono text-xs tabular-nums text-white/70">
        <div className="flex justify-between items-center">
          <dt className="font-sans">{dict.pos?.subtotal}</dt>
          <dd><Currency amount={subtotal} /></dd>
        </div>
        {appliedDiscount && (
          <div className="flex justify-between items-center text-emerald-300">
            <dt className="font-sans truncate pr-2">
              {dict.pos?.discount}
              {appliedDiscount.code ? ` · ${appliedDiscount.code}` : ''}
            </dt>
            <dd>-<Currency amount={appliedDiscount.amount} /></dd>
          </div>
        )}
        {taxEnabled && taxRate != null && (
          <div className="flex justify-between items-center">
            <dt className="font-sans">
              {taxLabel || 'Tax'} ({taxRate}%)
            </dt>
            <dd><Currency amount={taxAmount} /></dd>
          </div>
        )}
      </dl>
      <div className="mk-lcd rounded-md px-3 py-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">{totalLabel}</span>
        <span key={total} className="mk-lcd-on text-2xl xl:text-3xl font-bold tabular-nums text-right">
          <Currency amount={total} showConverted convertedClassName="block text-[11px] font-normal opacity-75 leading-tight" />
        </span>
      </div>
      <Button
        type="button"
        variant="brand"
        size="xl"
        onClick={onCheckout}
        disabled={processing}
        className="w-full h-14 text-base tracking-wide"
      >
        {processing ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span>{processingLabel || dict.pos?.processing || 'Processing...'}</span>
          </>
        ) : (
          <>
            <CreditCard className="size-5" strokeWidth={2.25} aria-hidden />
            <span>{dict.pos?.checkout}</span>
            <kbd className="ml-auto rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/85">F9</kbd>
          </>
        )}
      </Button>
    </div>
  );
}
