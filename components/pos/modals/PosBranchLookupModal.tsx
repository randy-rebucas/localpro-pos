'use client';

import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';

export interface BranchLookupRow {
  branchId: string;
  stock: number;
  name: string;
}

export interface PosBranchLookupProduct {
  _id: string;
  name: string;
}

export interface PosBranchLookupModalProps {
  dictValue: (path: string, fallback?: string) => string;
  product: PosBranchLookupProduct;
  loading: boolean;
  data: BranchLookupRow[];
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
}

export default function PosBranchLookupModal({
  dictValue,
  product,
  loading,
  data,
  error,
  onRetry,
  onClose,
}: PosBranchLookupModalProps) {
  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4">
      <div className="bg-paper-white text-ink w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dashed border-ink/30">
          <div>
            <h2 className="text-3xl text-ink">{product.name}</h2>
            <p className="font-receipt text-xs text-ink/60 mt-1">{dictValue('pos.stockAtAllLocations', 'Stock at all locations')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ink/50 hover:text-ink"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <LoadingSpinner size="sm" label={dictValue('common.loading', 'Loading…')} className="py-6" />
          ) : error ? (
            <ErrorState
              title={dictValue('pos.couldNotLoadBranchStock', 'Could not load branch stock')}
              description={error}
              onRetry={onRetry}
              compact
              className="py-6"
            />
          ) : data.length === 0 ? (
            <EmptyState
              icon="products"
              title={dictValue('pos.noBranchStockData', 'No branch stock data available')}
              compact
              className="py-6"
            />
          ) : (
            <div>
              {data.map((b) => (
                <div key={b.branchId} className="flex items-center justify-between py-2 border-b border-dashed border-ink/25 last:border-0">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ink/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-medium text-ink/80">{b.name}</span>
                  </div>
                  <span className={`font-receipt text-sm font-semibold ${b.stock === 0 ? 'text-stamp' : b.stock <= 5 ? 'text-ink' : 'text-brand-hover'}`}>
                    {b.stock === 0 ? dictValue('pos.outShort', 'Out') : b.stock}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
