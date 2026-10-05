'use client';

import type { RefObject } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import InlineBanner from '@/components/ui/InlineBanner';
import ProductCardSkeleton from '@/components/ui/ProductCardSkeleton';
import ProductCard from '@/components/pos/ProductCard';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import type { TranslationDict } from '@/types/dictionary';
import type {
  PosProduct,
  ProductsFailureReason,
  ProductsSource,
  ProductsStatus,
} from '@/hooks/usePosProducts';

const FAILURE_MESSAGES: Record<ProductsFailureReason, { key: string; fallback: string }> = {
  offline: { key: 'productsFailureOffline', fallback: 'You are offline' },
  timeout: { key: 'productsFailureTimeout', fallback: 'The server took too long to respond' },
  unreachable: { key: 'productsFailureUnreachable', fallback: 'Cannot reach the server' },
  unauthorized: { key: 'productsFailureUnauthorized', fallback: 'Your session has expired. Please sign in again' },
  forbidden: { key: 'productsFailureForbidden', fallback: 'You do not have permission to view products' },
  'not-found': { key: 'productsFailureNotFound', fallback: 'Store or products service not found' },
  'rate-limited': { key: 'productsFailureRateLimited', fallback: 'Too many requests. Please wait a moment' },
  'server-error': { key: 'productsFailureServerError', fallback: 'The server hit an error while loading products' },
  'http-error': { key: 'productsFailureHttpError', fallback: 'The server rejected the request' },
  'invalid-response': { key: 'productsFailureInvalidResponse', fallback: 'The server sent an unexpected response' },
  'api-error': { key: 'productsFailureApiError', fallback: 'The server could not load products' },
};

interface ProductGridProps {
  products: PosProduct[];
  status: ProductsStatus;
  source: ProductsSource;
  error: string | null;
  failureReason?: ProductsFailureReason | null;
  search: string;
  gridClassName: string;
  listClassName?: string;
  cardHeightClass: string;
  displayMode?: 'grid' | 'list';
  primaryColor: string;
  businessType: string;
  cart: Array<{ productId: string; quantity: number }>;
  dict: TranslationDict;
  addLabel: string;
  onAdd: (product: PosProduct) => void;
  onTogglePin: (productId: string, pinned: boolean) => void;
  onClearSearch: () => void;
  onRetry: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  scrollRootRef?: RefObject<Element | null>;
}

export default function ProductGrid({
  products,
  status,
  source,
  error,
  failureReason = null,
  search,
  gridClassName,
  listClassName = 'flex flex-col gap-2',
  cardHeightClass,
  displayMode = 'grid',
  primaryColor,
  businessType,
  cart,
  dict,
  addLabel,
  onAdd,
  onTogglePin,
  onClearSearch,
  onRetry,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  scrollRootRef,
}: ProductGridProps) {
  const sentinelRef = useInfiniteScroll({
    onLoadMore: onLoadMore ?? (() => {}),
    hasMore: Boolean(onLoadMore && hasMore),
    isLoading: status === 'loading' || loadingMore,
    disabled: !onLoadMore,
    rootRef: scrollRootRef,
  });

  // "<reason>: <server detail>" — detail is the API's own error text when it sent one
  const failureMessage = (() => {
    if (!failureReason) return error || null;
    const { key, fallback } = FAILURE_MESSAGES[failureReason];
    const reasonText = dict.pos?.[key] || fallback;
    const detail = error?.trim().slice(0, 160);
    return detail && detail !== reasonText ? `${reasonText}: ${detail}` : reasonText;
  })();

  if (status === 'loading') {
    return (
      <ProductCardSkeleton
        count={displayMode === 'list' ? 12 : 16}
        cardClassName={displayMode === 'list' ? 'min-h-[72px]' : cardHeightClass}
        gridClassName={displayMode === 'list' ? listClassName : gridClassName}
        variant={displayMode}
      />
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-white border border-gray-300">
        <ErrorState
          title={dict.pos?.failedToLoadProducts || 'Failed to load products'}
          description={
            failureReason === 'offline'
              ? dict.pos?.productsFailureOfflineNoCache ||
                'You are offline and no products are saved on this device yet'
              : failureMessage || undefined
          }
          onRetry={onRetry}
          retryLabel={dict.common?.retry || 'Retry'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {source === 'cache' && (
        <InlineBanner
          variant="warning"
          message={`${dict.pos?.showingCachedProducts || 'Showing products saved on this device'} — ${
            failureMessage || dict.pos?.productsFailureApiError || 'The server could not load products'
          }`}
          onRetry={onRetry}
          retryLabel={dict.common?.retry || 'Retry'}
        />
      )}

      {products.length === 0 ? (
        <div className="bg-white border border-gray-300">
          <EmptyState
            icon={search.trim() ? 'search' : 'products'}
            title={
              search.trim()
                ? dict.common?.noResults || 'No results found'
                : dict.pos?.noProductsYet || 'No products yet'
            }
            action={
              search.trim()
                ? {
                    label: dict.pos?.clearSearch || 'Clear search',
                    onClick: onClearSearch,
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className={displayMode === 'list' ? listClassName : gridClassName}>
          {[...products]
            .sort((a, b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return 0;
            })
            .map((product) => {
              const inCartQty = cart.find((i) => i.productId === product._id)?.quantity ?? 0;
              const availableStock = Math.max(0, product.stock - inCartQty);
              const canAdd = availableStock > 0 || product.allowOutOfStockSales === true;
              return (
                <ProductCard
                  key={product._id}
                  product={product}
                  inCartQty={inCartQty}
                  availableStock={availableStock}
                  canAdd={canAdd}
                  primaryColor={primaryColor}
                  businessType={businessType}
                  cardHeightClass={cardHeightClass}
                  addLabel={addLabel}
                  variant={displayMode}
                  onAdd={onAdd}
                  onTogglePin={onTogglePin}
                />
              );
            })}
        </div>
      )}

      {products.length > 0 && hasMore && (
        <div ref={sentinelRef} className="min-h-6" aria-hidden />
      )}

      {loadingMore && (
        <ProductCardSkeleton
          count={displayMode === 'list' ? 3 : 8}
          cardClassName={displayMode === 'list' ? 'min-h-[72px]' : cardHeightClass}
          gridClassName={displayMode === 'list' ? listClassName : gridClassName}
          variant={displayMode}
        />
      )}
    </div>
  );
}
