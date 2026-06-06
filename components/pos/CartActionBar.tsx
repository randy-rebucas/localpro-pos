'use client';

import type { TranslationDict } from '@/types/dictionary';

interface CartActionBarProps {
  cartLength: number;
  itemCount: number;
  primaryColor: string;
  dict: TranslationDict;
  isCashier?: boolean;
  customerDisplayUrl?: string | null;
  businessType?: string;
  orderType?: 'dine-in' | 'takeout' | 'delivery';
  tableNumber?: string;
  showContext?: boolean;
  compact?: boolean;
  onSaveCart?: () => void;
  onClearCart?: () => void;
  onLoadSavedCarts?: () => void;
  onClose?: () => void;
  closeLabel?: string;
}

export default function CartActionBar({
  cartLength,
  itemCount,
  primaryColor,
  dict,
  isCashier = false,
  customerDisplayUrl,
  businessType,
  orderType,
  tableNumber,
  showContext = true,
  compact = false,
  onSaveCart,
  onClearCart,
  onLoadSavedCarts,
  onClose,
  closeLabel,
}: CartActionBarProps) {
  const btnClass = compact
    ? 'px-2.5 py-2 min-h-[44px] min-w-[44px] transition-colors border flex items-center justify-center'
    : 'px-3 py-2 min-h-[44px] min-w-[44px] transition-colors border flex items-center justify-center';

  return (
    <div className={`flex shrink-0 items-center gap-1.5 sm:gap-2 ${showContext ? 'justify-between' : 'justify-end'} ${compact ? 'mb-2 pb-2 md:mb-3 md:pb-3' : 'py-3'} border-b border-gray-200`}>
      {showContext && (
        <div className="flex flex-1 min-w-0 items-center gap-2 mr-2">
          {cartLength > 0 && (
            <span className="text-xs font-semibold text-gray-600 tabular-nums whitespace-nowrap">
              {itemCount} {dict.pos?.items || 'items'}
            </span>
          )}
          {businessType === 'restaurant' && orderType && (
            <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 capitalize truncate">
              {orderType === 'dine-in'
                ? `${dict.pos?.dineIn || 'Dine-in'}${tableNumber ? ` · ${tableNumber}` : ''}`
                : orderType}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {!isCashier && cartLength > 0 && onSaveCart && onClearCart && (
          <>
            <button
              type="button"
              onClick={onSaveCart}
              className={`${btnClass} bg-green-600 text-white hover:bg-green-700 border-green-700`}
              aria-label={dict.pos?.saveCart || 'Save cart'}
              title={dict.pos?.saveCart || 'Save Cart'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClearCart}
              className={`${btnClass} bg-red-600 text-white hover:bg-red-700 border-red-700`}
              aria-label={dict.common?.clear || 'Clear cart'}
              title={dict.common?.clear || 'Clear'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
        {!isCashier && onLoadSavedCarts && (
          <button
            type="button"
            onClick={onLoadSavedCarts}
            className={btnClass}
            style={{ backgroundColor: primaryColor, borderColor: primaryColor, color: 'white' }}
            aria-label={dict.pos?.loadCart || 'Load saved cart'}
            title={dict.pos?.loadCart || 'Load Saved Cart'}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
        )}
        {!isCashier && customerDisplayUrl && (
          <button
            type="button"
            onClick={() => window.open(customerDisplayUrl, 'customer_display', 'width=1024,height=768')}
            className={`${btnClass} bg-purple-600 text-white hover:bg-purple-700 border-purple-700`}
            aria-label={dict.pos?.titleOpenCustomerDisplay || 'Open customer display'}
            title={dict.pos?.titleOpenCustomerDisplay || 'Open Customer Display'}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center"
            aria-label={closeLabel || dict.pos?.closeCart || 'Close cart'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
