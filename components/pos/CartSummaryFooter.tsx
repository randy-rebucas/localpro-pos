'use client';

import Currency from '@/components/Currency';
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
  primaryColor,
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

  return (
    <div className="shrink-0 border-t border-gray-300 pt-3 md:pt-4 mt-3 md:mt-4 bg-gray-50 -mx-3 sm:-mx-4 md:-mx-4 px-3 sm:px-4 md:px-4 pb-3 md:pb-4">
      <div className="space-y-1.5 md:space-y-2 mb-3 md:mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">{dict.pos?.subtotal}:</span>
          <span className="font-semibold text-gray-900">
            <Currency amount={subtotal} />
          </span>
        </div>
        {appliedDiscount && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{dict.pos?.discount}:</span>
            <span className="font-semibold text-green-600">
              -<Currency amount={appliedDiscount.amount} />
            </span>
          </div>
        )}
        {taxEnabled && taxRate != null && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">
              {taxLabel || 'Tax'} ({taxRate}%):
            </span>
            <span className="font-semibold text-gray-900">
              <Currency amount={taxAmount} />
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mb-3 md:mb-4 pt-2 md:pt-3 border-t-2 border-gray-300">
        <span className="text-base md:text-lg font-bold text-gray-900">{totalLabel}:</span>
        <span className="text-xl md:text-2xl xl:text-3xl font-bold" style={{ color: primaryColor }}>
          <Currency amount={total} showConverted convertedClassName="block text-xs text-gray-500 font-normal text-right leading-tight" />
        </span>
      </div>
      <button
        type="button"
        onClick={onCheckout}
        disabled={processing}
        className="w-full bg-green-600 text-white py-3 md:py-3.5 min-h-[44px] font-bold hover:bg-green-700 active:bg-green-800 transition-all duration-200 text-base md:text-lg border border-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <div className="animate-spin h-6 w-6 border-b-2 border-white" />
            <span>{processingLabel || dict.pos?.processing || 'Processing...'}</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {dict.pos?.checkout}
          </>
        )}
      </button>
    </div>
  );
}
