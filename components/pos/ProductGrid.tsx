'use client';

import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import InlineBanner from '@/components/ui/InlineBanner';
import ProductCardSkeleton from '@/components/ui/ProductCardSkeleton';
import ProductCard from '@/components/pos/ProductCard';
import type { TranslationDict } from '@/types/dictionary';
import type { PosProduct, ProductsSource, ProductsStatus } from '@/hooks/usePosProducts';

interface ProductGridProps {
  products: PosProduct[];
  status: ProductsStatus;
  source: ProductsSource;
  error: string | null;
  search: string;
  gridClassName: string;
  cardHeightClass: string;
  primaryColor: string;
  businessType: string;
  cart: Array<{ productId: string; quantity: number }>;
  dict: TranslationDict;
  addLabel: string;
  onAdd: (product: PosProduct) => void;
  onTogglePin: (productId: string, pinned: boolean) => void;
  onClearSearch: () => void;
  onRetry: () => void;
}

export default function ProductGrid({
  products,
  status,
  source,
  error,
  search,
  gridClassName,
  cardHeightClass,
  primaryColor,
  businessType,
  cart,
  dict,
  addLabel,
  onAdd,
  onTogglePin,
  onClearSearch,
  onRetry,
}: ProductGridProps) {
  if (status === 'loading') {
    return (
      <ProductCardSkeleton count={16} cardClassName={cardHeightClass} gridClassName={gridClassName} />
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-white border border-gray-300">
        <ErrorState
          title={dict.pos?.failedToLoadProducts || 'Failed to load products'}
          description={error || undefined}
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
          message={dict.pos?.showingCachedProducts || 'Showing cached products — connection unavailable'}
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
        <div className={gridClassName}>
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
                  onAdd={onAdd}
                  onTogglePin={onTogglePin}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
