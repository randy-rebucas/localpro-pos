import { useCallback, useState } from 'react';
import { useMessages } from '@/hooks/useMessages';

export interface BundleItem {
  productId: string | { _id: string; name: string; price: number; stock: number };
  productName: string;
  quantity: number;
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
}

export interface Bundle {
  _id: string;
  name: string;
  description?: string;
  price: number;
  items: BundleItem[];
  sku?: string;
  categoryId?: string | { _id: string; name: string };
  trackInventory: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface BundleFilters {
  search?: string;
  isActive?: boolean | null;
  categoryId?: string;
  minPrice?: string;
  maxPrice?: string;
  startDate?: string;
  endDate?: string;
}

export function useBundlesList() {
  const t = useMessages();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBundles = useCallback(
    async (filters?: BundleFilters, onError?: (error: string) => void) => {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const params = new URLSearchParams();
        if (filters?.search) params.append('search', filters.search);
        if (filters?.isActive !== null && filters?.isActive !== undefined) {
          params.append('isActive', filters.isActive.toString());
        }
        if (filters?.categoryId) params.append('categoryId', filters.categoryId);
        if (filters?.minPrice) params.append('minPrice', filters.minPrice);
        if (filters?.maxPrice) params.append('maxPrice', filters.maxPrice);
        if (filters?.startDate) params.append('startDate', filters.startDate);
        if (filters?.endDate) params.append('endDate', filters.endDate);

        const res = await globalThis.fetch(`/api/bundles?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          setBundles(data.data || []);
        } else {
          const errorMsg = data.error || t('common.failedToFetchBundles', 'Failed to fetch bundles');
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error && err.name === 'AbortError'
          ? t('common.requestTimedOut', 'The request timed out. Please try again.')
          : t('common.failedToFetchBundles', 'Failed to fetch bundles');
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    },
    [t]
  );

  const deleteBundle = useCallback(
    async (bundleId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/bundles/${bundleId}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          // Caller is responsible for refetching with its current filters —
          // refetching here (unfiltered) would clobber the visible list, only
          // for the caller to immediately refetch again with real filters.
          onSuccess?.(data.message || t('admin.deleteBundleSuccess', 'Bundle deleted successfully'));
        } else {
          const errorMsg = data.error || t('admin.deleteBundleError', 'Failed to delete bundle');
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = t('admin.deleteBundleError', 'Failed to delete bundle');
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [t]
  );

  const toggleBundleStatus = useCallback(
    async (bundleId: string, isActive: boolean, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/bundles/${bundleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive: !isActive }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          // The caller refetches with its current filters (an unfiltered
          // refetch here could land last and replace the filtered list)
          onSuccess?.(!isActive ? t('admin.bundleActivated', 'Bundle activated') : t('admin.bundleDeactivated', 'Bundle deactivated'));
        } else {
          const errorMsg = data.error || t('common.failedToUpdateBundle', 'Failed to update bundle');
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = t('common.failedToUpdateBundle', 'Failed to update bundle');
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [t]
  );

  const bulkToggleStatus = useCallback(
    async (
      bundleIds: string[],
      action: 'activate' | 'deactivate',
      onSuccess?: (message: string) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch('/api/bundles/bulk', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ bundleIds, action }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          // The caller refetches with its current filters
          onSuccess?.(action === 'activate' ? t('admin.bundlesActivated', 'Bundles activated') : t('admin.bundlesDeactivated', 'Bundles deactivated'));
        } else {
          const errorMsg = data.error || t('admin.failedToUpdateBundles', 'Failed to update bundles');
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = t('admin.failedToUpdateBundles', 'Failed to update bundles');
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [t]
  );

  return { bundles, loading, error, fetchBundles, deleteBundle, toggleBundleStatus, bulkToggleStatus };
}
