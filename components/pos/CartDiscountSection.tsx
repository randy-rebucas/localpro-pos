'use client';

import { useId } from 'react';
import Currency from '@/components/Currency';
import type { Discount } from '@/hooks/useDiscount';
import type { TranslationDict } from '@/types/dictionary';
import { applyPresetDiscountCode, syncDiscountToCustomerDisplay } from '@/lib/pos-discount-sync';
import type { TaxPricingSettings } from '@/lib/tax-pricing';

const MAX_PROMO_CODE_LENGTH = 50;

interface CartDiscountSectionProps {
  dict: TranslationDict;
  tenant: string;
  cartLength: number;
  promoCode: string;
  setPromoCode: (code: string) => void;
  appliedDiscount: Discount | null;
  applyingDiscount: boolean;
  scPwdName: string;
  setScPwdName: (name: string) => void;
  scPwdId: string;
  setScPwdId: (id: string) => void;
  showDiscountSection: boolean;
  setShowDiscountSection: React.Dispatch<React.SetStateAction<boolean>>;
  getSubtotal: () => number;
  sessionId: string | null;
  settings?: TaxPricingSettings | null;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
  applyDiscount: (
    subtotal: number,
    tenant: string,
    onSuccess: (discount: Discount) => void,
    onError: (error: string) => void,
    settings?: TaxPricingSettings | null
  ) => void;
  setAppliedDiscount: (discount: Discount | null) => void;
  removeDiscount: () => void;
  onDiscountApplied: (message: string) => void;
  onDiscountError: (message: string) => void;
}

export default function CartDiscountSection({
  dict,
  tenant,
  cartLength,
  promoCode,
  setPromoCode,
  appliedDiscount,
  applyingDiscount,
  scPwdName,
  setScPwdName,
  scPwdId,
  setScPwdId,
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
      onDiscountError(dict.pos?.failedToApplyDiscount || 'Failed to apply discount');
    }
  };

  const handlePromoApply = () => {
    if (!promoCode.trim()) return;
    applyDiscount(
      getSubtotal(),
      tenant,
      handleDiscountSuccess,
      onDiscountError,
      settings
    );
  };

  return (
    <div className="shrink-0 border-t border-dashed border-ink/30 pt-1 mt-2">
      <button
        type="button"
        onClick={() => setShowDiscountSection((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-1 py-2 text-left hover:bg-paper transition-colors min-h-[44px]"
        aria-expanded={showDiscountSection}
        aria-controls={panelId}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 flex-shrink-0 text-ink/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span className="font-receipt text-xs font-medium uppercase text-ink truncate">
            {dict.pos?.toggleDiscounts || 'Discounts & promo'}
          </span>
          {appliedDiscount && (
            <span className="font-receipt text-xs text-ink bg-brand-soft border border-brand/40 px-1.5 py-0.5 truncate max-w-[8rem]">
              −<Currency amount={appliedDiscount.amount} />
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-ink/60 transition-transform ${showDiscountSection ? 'rotate-180' : ''}`}
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
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2 min-h-[44px] font-receipt text-xs font-medium border border-ink/25 bg-paper-white text-ink hover:border-ink transition-colors disabled:opacity-50"
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
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2 min-h-[44px] font-receipt text-xs font-medium border border-ink/25 bg-paper-white text-ink hover:border-ink transition-colors disabled:opacity-50"
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
                  className="flex-1 min-w-0 px-2.5 py-2 min-h-[44px] font-receipt text-sm border border-ink/25 focus:ring-2 focus:ring-brand focus:border-brand bg-paper-white transition-all placeholder:text-ink/50"
                />
                <button
                  type="button"
                  onClick={handlePromoApply}
                  disabled={!promoCode.trim() || applyingDiscount}
                  className="px-2.5 py-2 min-h-[44px] min-w-[44px] bg-ink text-paper-white hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
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
            <div className="mb-2 p-2.5 bg-brand-soft border border-dashed border-brand">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <svg className="w-4 h-4 text-brand-hover flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="font-receipt text-xs font-medium uppercase text-ink">{dict.pos?.discountApplied}</div>
                  </div>
                  <div className="font-receipt text-xs text-ink truncate pl-5">
                    {appliedDiscount.code}
                    {appliedDiscount.name && (
                      <span className="text-ink/70"> — {appliedDiscount.name}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeDiscount}
                  className="p-1 min-h-[44px] min-w-[44px] text-stamp hover:bg-paper-white transition-colors flex-shrink-0 flex items-center justify-center"
                  aria-label={dict.pos?.removeDiscount || 'Remove discount'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {(appliedDiscount.code === 'SC20' || appliedDiscount.code === 'PWD20') && (
                <div className="mt-2 pt-2 border-t border-dashed border-brand/50 space-y-2">
                  <input
                    type="text"
                    placeholder={dict.pos?.scPwdName || 'SC/PWD Name'}
                    value={scPwdName}
                    onChange={(e) => setScPwdName(e.target.value)}
                    className="w-full px-2.5 py-2 min-h-[40px] text-sm border border-ink/25 focus:ring-2 focus:ring-brand focus:border-brand bg-paper-white transition-all placeholder:text-ink/50"
                  />
                  <input
                    type="text"
                    placeholder={dict.pos?.scPwdId || 'SC/PWD ID Number'}
                    value={scPwdId}
                    onChange={(e) => setScPwdId(e.target.value)}
                    className="w-full px-2.5 py-2 min-h-[40px] text-sm border border-ink/25 focus:ring-2 focus:ring-brand focus:border-brand bg-paper-white transition-all placeholder:text-ink/50"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
