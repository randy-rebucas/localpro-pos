'use client';

import Currency from '@/components/Currency';
import { ReceiptRow } from '@/components/marketing/primitives';
import type { Discount } from '@/hooks/useDiscount';
import type { TranslationDict } from '@/types/dictionary';

interface CartSummaryRowsProps {
  dict: TranslationDict;
  subtotal: number;
  taxAmount: number;
  appliedDiscount: Discount | null;
  taxEnabled?: boolean;
  taxLabel?: string;
  taxRate?: number;
  className?: string;
}

interface CartTillProps {
  dict: TranslationDict;
  total: number;
  processing?: boolean;
  processingLabel?: string;
  onCheckout: () => void;
}

/** The printed lines above the total, on the receipt. */
export function CartSummaryRows({
  dict,
  subtotal,
  taxAmount,
  appliedDiscount,
  taxEnabled,
  taxLabel,
  taxRate,
  className = '',
}: CartSummaryRowsProps) {
  return (
    <div className={`shrink-0 mt-2 border-t border-dashed border-ink/30 pt-2 space-y-1 font-receipt text-xs sm:text-sm text-ink ${className}`}>
      <ReceiptRow label={dict.pos?.subtotal} value={<Currency amount={subtotal} />} />
      {appliedDiscount && (
        <ReceiptRow
          label={`${dict.pos?.discount} (${appliedDiscount.code})`}
          value={<>-<Currency amount={appliedDiscount.amount} /></>}
        />
      )}
      {taxEnabled && taxRate != null && (
        <ReceiptRow label={`${taxLabel || 'Tax'} (${taxRate}%)`} value={<Currency amount={taxAmount} />} />
      )}
    </div>
  );
}

/** The till display and checkout key, on the dark counter below the receipt. */
export function CartTill({ dict, total, processing = false, processingLabel, onCheckout }: CartTillProps) {
  const totalLabel = dict.pos?.total || dict.common?.total || 'Total';

  return (
    <div className="shrink-0 pt-2 sm:pt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3 border border-white/10 bg-black/30 px-3 py-2 font-receipt">
        <span className="text-xs uppercase tracking-[0.14em] text-[#8fe3d0]">{totalLabel}</span>
        <span className="mk-led-glow text-right text-2xl font-semibold tabular-nums text-[#7df0d6] xl:text-3xl">
          <Currency amount={total} showConverted convertedClassName="block text-xs font-normal leading-tight text-white/60" />
        </span>
      </div>
      <button
        type="button"
        onClick={onCheckout}
        disabled={processing}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 bg-brand py-3 font-display text-2xl font-extrabold uppercase leading-none text-ink transition-colors hover:bg-brand-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {processing ? (
          <>
            <div className="h-5 w-5 animate-spin border-b-2 border-ink" />
            <span>{processingLabel || dict.pos?.processing || 'Processing...'}</span>
          </>
        ) : (
          dict.pos?.checkout
        )}
      </button>
    </div>
  );
}

/** Rows and till stacked, for the roaming bottom sheet. */
export default function CartSummaryFooter({
  processing,
  processingLabel,
  total,
  onCheckout,
  ...rows
}: CartSummaryRowsProps & CartTillProps) {
  return (
    <div className="shrink-0">
      <div className="bg-paper-white px-5 pb-1">
        <CartSummaryRows {...rows} className="mt-0" />
      </div>
      <div className="bg-brand-navy-deep pb-4">
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        <div className="px-5">
          <CartTill dict={rows.dict} total={total} processing={processing} processingLabel={processingLabel} onCheckout={onCheckout} />
        </div>
      </div>
    </div>
  );
}
