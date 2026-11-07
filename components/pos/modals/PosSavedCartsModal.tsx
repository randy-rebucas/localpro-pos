'use client';

import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { formatDateTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import type { TranslationDict } from '@/types/dictionary';
import type { ITenantSettings } from '@/types/tenant';

export interface SavedCartSummary {
  _id: string;
  name: string;
  createdAt: string;
  items: unknown[];
  total: number;
  discountCode?: string;
}

export interface PosSavedCartsModalProps {
  dict: TranslationDict;
  primaryColor: string;
  settings: ITenantSettings | null;
  loading: boolean;
  savedCarts: SavedCartSummary[];
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  onLoadCart: (cart: SavedCartSummary) => void;
  onDeleteCart: (cartId: string) => void;
}

export default function PosSavedCartsModal({
  dict,
  primaryColor,
  settings,
  loading,
  savedCarts,
  error,
  onRetry,
  onClose,
  onLoadCart,
  onDeleteCart,
}: PosSavedCartsModalProps) {
  return (
    <div
      className="fixed inset-0 bg-ink/60 z-50"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 w-full max-w-2xl bg-paper-white text-ink flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-dashed border-ink/30">
          <h2 className="text-4xl text-ink">
            {dict.pos?.savedCarts || 'Saved Carts'}
          </h2>
          <button
            onClick={onClose}
            className="text-ink/50 hover:text-ink transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <LoadingSpinner
              color={primaryColor}
              label={dict.common.loading || 'Loading...'}
              className="py-12"
            />
          ) : error ? (
            <ErrorState
              title={dict.common?.error || 'Something went wrong'}
              description={error}
              onRetry={onRetry}
            />
          ) : savedCarts.length === 0 ? (
            <EmptyState
              icon="savedCarts"
              title={dict.pos?.noSavedCarts || 'No saved carts found'}
            />
          ) : (
            <div className="space-y-3">
              {savedCarts.map((savedCart) => (
                <div
                  key={savedCart._id}
                  className="border border-ink/25 hover:border-ink p-4 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-ink text-lg mb-1">{savedCart.name}</h3>
                      <p className="font-receipt text-xs text-ink/60">
                        {formatDateTime(new Date(savedCart.createdAt), settings || getDefaultTenantSettings())}
                      </p>
                      <p className="font-receipt text-xs text-ink/70 mt-2">
                        {savedCart.items.length} {savedCart.items.length === 1 ? (dict.pos?.item || 'item') : (dict.pos?.items || 'items')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-receipt font-semibold text-lg text-ink mb-2">
                        <Currency amount={savedCart.total} />
                      </div>
                      {savedCart.discountCode && (
                        <div className="font-receipt text-xs text-brand-hover">
                          {dict.pos?.discount || 'Discount'}: {savedCart.discountCode}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onLoadCart(savedCart)}
                      className="flex-1 px-4 py-2 bg-ink text-paper-white hover:bg-brand-navy font-receipt font-medium uppercase transition-colors text-sm"
                    >
                      {dict.pos?.loadCart || 'Load Cart'}
                    </button>
                    <button
                      onClick={() => onDeleteCart(savedCart._id)}
                      className="px-4 py-2 bg-paper-white text-stamp border border-stamp/60 hover:bg-stamp hover:text-paper-white transition-colors"
                      title={dict.pos?.deleteCart || 'Delete Cart'}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
