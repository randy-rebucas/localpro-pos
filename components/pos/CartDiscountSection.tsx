'use client';

import { useId } from 'react';
import Currency from '@/components/Currency';
import type { Discount } from '@/hooks/useDiscount';
import type { TranslationDict } from '@/types/dictionary';
import { applyPresetDiscountCode, syncDiscountToCustomerDisplay } from '@/lib/pos-discount-sync';

const MAX_PROMO_CODE_LENGTH = 50;

interface CartDiscountSectionProps {
  dict: TranslationDict;
  primaryColor: string;
  tenant: string;
  cartLength: number;
  promoCode: string;
  setPromoCode: (code: string) => void;
  appliedDiscount: Discount | null;
  applyingDiscount: boolean;
  showDiscountSection: boolean;
  setShowDiscountSection: React.Dispatch<React.SetStateAction<boolean>>;
  getSubtotal: () => number;
  sessionId: string | null;
  settings?: { taxEnabled?: boolean; taxRate?: number } | null;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
  applyDiscount: (
    subtotal: number,
    tenant: string,
    onSuccess: (discount: Discount) => void,
    onError: (error: string) => void
  ) => void;
  setAppliedDiscount: (discount: Discount | null) => void;
  removeDiscount: () => void;
  onDiscountApplied: (message: string) => void;
  onDiscountError: (message: string) => void;
}

export default function CartDiscountSection({
  dict,
  primaryColor,
  tenant,
  cartLength,
  promoCode,
  setPromoCode,
  appliedDiscount,
  applyingDiscount,
  showDiscountSection,
  setShowDiscountSection,
  getSubtotal,
  sessionId,
  settings,
  fetchWithTimeout,
  applyDiscount,
  setAppliedDiscount,
  removeDiscount,
  onDiscountApplied,
  onDiscountError,
}: CartDiscountSectionProps) {
  const panelId = useId();

  const handleDiscountSuccess = (discount: Discount) => {
    setAppliedDiscount(discount);
    syncDiscountToCustomerDisplay(sessionId, tenant, discount, getSubtotal(), settings ?? undefined);
    setPromoCode('');
    onDiscountApplied(dict.pos?.discountApplied || 'Discount applied');
  };

  const handlePreset = async (code: 'SC20' | 'PWD20') => {
    try {
      const result = await applyPresetDiscountCode(code, tenant, getSubtotal(), fetchWithTimeout);
      if (result.success) {
        handleDiscountSuccess(result.discount);
      } else {
        onDiscountError(result.error);
      }
    } catch {
      onDiscountError('Failed to apply discount');
    }
  };

  const handlePromoApply = () => {
    if (!promoCode.trim()) return;
    applyDiscount(
      getSubtotal(),
      tenant,
      handleDiscountSuccess,
      onDiscountError
    );
  };

  return (
    <div className="shrink-0 border-t border-gray-200 pt-2 mt-2 bg-white">
      <button
        type="button"
        onClick={() => setShowDiscountSection((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-1 py-2 text-left hover:bg-gray-50 transition-colors rounded min-h-[44px]"
        aria-expanded={showDiscountSection}
        aria-controls={panelId}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-800 truncate">
            {dict.pos?.toggleDiscounts || 'Discounts & promo'}
          </span>
          {appliedDiscount && (
            <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 truncate max-w-[8rem]">
              −<Currency amount={appliedDiscount.amount} />
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${showDiscountSection ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDiscountSection && (
        <div id={panelId} className="pt-2 pb-1">
          {!appliedDiscount ? (
            <div className="mb-2">
              <div className="flex gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => handlePreset('SC20')}
                  disabled={applyingDiscount || cartLength === 0}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2 min-h-[44px] text-xs font-semibold border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: `${primaryColor}80`,
                    backgroundColor: `${primaryColor}10`,
                    color: primaryColor,
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {dict.pos?.seniorDiscount || 'Senior (20%)'}
                </button>
                <button
                  type="button"
                  onClick={() => handlePreset('PWD20')}
                  disabled={applyingDiscount || cartLength === 0}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2 min-h-[44px] text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {dict.pos?.pwdDiscount || 'PWD (20%)'}
                </button>
              </div>

              <div className="flex gap-1.5 items-stretch">
                <input
                  type="text"
                  placeholder={dict.pos?.promoCode || 'Enter promo code'}
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase().slice(0, MAX_PROMO_CODE_LENGTH))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && promoCode.trim()) handlePromoApply();
                  }}
                  className="flex-1 min-w-0 px-2.5 py-2 min-h-[44px] text-sm border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white transition-all placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={handlePromoApply}
                  disabled={!promoCode.trim() || applyingDiscount}
                  className="px-2.5 py-2 min-h-[44px] min-w-[44px] bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-green-700 flex items-center justify-center flex-shrink-0"
                  aria-label={dict.pos?.applyDiscount || 'Apply discount'}
                >
                  {applyingDiscount ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-2 p-2.5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs font-bold text-green-800">{dict.pos?.discountApplied}</div>
                  </div>
                  <div className="text-xs text-green-700 font-medium truncate pl-5">
                    {appliedDiscount.code}
                    {appliedDiscount.name && (
                      <span className="text-green-600"> — {appliedDiscount.name}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeDiscount}
                  className="p-1 min-h-[44px] min-w-[44px] text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors flex-shrink-0 rounded flex items-center justify-center"
                  aria-label={dict.pos?.removeDiscount || 'Remove discount'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
