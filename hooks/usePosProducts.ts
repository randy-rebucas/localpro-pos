'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOfflineStorage } from '@/lib/offline-storage';

export interface PosProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  image?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
  serviceType?: string;
  modifiers?: Array<{ name: string; options: Array<{ name: string; price: number }>; required: boolean }>;
  hasVariations?: boolean;
  variations?: Array<{
    size?: string;
    color?: string;
    type?: string;
    sku?: string;
    price?: number;
    stock?: number;
  }>;
  branchStock?: Array<{ branchId: string; stock: number }>;
}

export type ProductsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ProductsSource = 'server' | 'cache' | 'none';

/** Why products could not be loaded from the server (null when they were). */
export type ProductsFailureReason =
  | 'offline' // browser reports no network
  | 'timeout' // request aborted after the timeout
  | 'unreachable' // fetch itself failed (DNS, server down, CORS, dropped connection)
  | 'unauthorized' // 401 — session expired
  | 'forbidden' // 403 — no permission for products
  | 'not-found' // 404 — tenant or endpoint not found
  | 'rate-limited' // 429
  | 'server-error' // 5xx
  | 'http-error' // other non-2xx
  | 'invalid-response' // body was not valid JSON
  | 'api-error'; // 2xx but { success: false }

const PAGE_SIZE = 40;

/** Pull a readable message out of an error body such as `{"success":false,"error":"..."}`. */
function extractErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch {
    // not JSON — use the raw text
  }
  return body.trim();
}

class ApiResponseError extends Error {}
class NetworkUnreachableError extends Error {}

function classifyFetchError(err: unknown): { reason: ProductsFailureReason; detail: string | null } {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { reason: 'timeout', detail: null };
  }
  if (err instanceof NetworkUnreachableError) {
    return { reason: 'unreachable', detail: null };
  }
  if (err instanceof ApiResponseError) {
    return { reason: 'api-error', detail: err.message || null };
  }
  if (err instanceof SyntaxError || err instanceof TypeError) {
    // Body was not JSON, or it didn't have the expected shape
    return { reason: 'invalid-response', detail: null };
  }
  if (err instanceof Error) {
    // fetchWithTimeout throws `HTTP <status>: <body>`
    const match = /^HTTP (\d{3}):?\s*([\s\S]*)$/.exec(err.message);
    if (match) {
      const statusCode = Number(match[1]);
      const detail = extractErrorDetail(match[2]) || null;
      if (statusCode === 401) return { reason: 'unauthorized', detail };
      if (statusCode === 403) return { reason: 'forbidden', detail };
      if (statusCode === 404) return { reason: 'not-found', detail };
      if (statusCode === 429) return { reason: 'rate-limited', detail };
      if (statusCode >= 500) return { reason: 'server-error', detail: detail || `HTTP ${statusCode}` };
      return { reason: 'http-error', detail: detail || `HTTP ${statusCode}` };
    }
    return { reason: 'api-error', detail: err.message || null };
  }
  return { reason: 'api-error', detail: null };
}

interface UsePosProductsOptions {
  tenant: string;
  debouncedSearch: string;
  isOnline: boolean;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
}

function mergeProductsById(existing: PosProduct[], incoming: PosProduct[]): PosProduct[] {
  const map = new Map(existing.map((product) => [product._id, product]));
  for (const product of incoming) {
    map.set(product._id, product);
  }
  return Array.from(map.values());
}

export function usePosProducts({
  tenant,
  debouncedSearch,
  isOnline,
  fetchWithTimeout,
}: UsePosProductsOptions) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [status, setStatus] = useState<ProductsStatus>('idle');
  const [source, setSource] = useState<ProductsSource>('none');
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<ProductsFailureReason | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const pageRef = useRef(1);
  const fetchIdRef = useRef(0);
  const offlineCatalogRef = useRef<PosProduct[]>([]);

  const filterCached = useCallback(
    (cached: PosProduct[]) => {
      if (!debouncedSearch) return cached;
      const searchLower = debouncedSearch.toLowerCase();
      return cached.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.sku?.toLowerCase().includes(searchLower) ||
          p.category?.toLowerCase().includes(searchLower)
      );
    },
    [debouncedSearch]
  );

  const loadFromCache = useCallback(async (): Promise<PosProduct[]> => {
    const storage = await getOfflineStorage();
    const cached = await storage.getCachedProducts(tenant);
    return filterCached(cached as PosProduct[]);
  }, [tenant, filterCached]);

  const cacheProductsMerged = useCallback(
    async (incoming: PosProduct[]) => {
      const storage = await getOfflineStorage();
      const cached = (await storage.getCachedProducts(tenant)) as PosProduct[];
      await storage.cacheProducts(mergeProductsById(cached, incoming), tenant);
    },
    [tenant]
  );

  const applyOfflinePage = useCallback((catalog: PosProduct[], page: number, append: boolean) => {
    const end = page * PAGE_SIZE;
    const nextSlice = catalog.slice(0, end);
    setProducts((prev) => (append ? nextSlice : nextSlice));
    setHasMore(end < catalog.length);
    pageRef.current = page;
    setSource('cache');
    setStatus('ready');
    setError(null);
  }, []);

  const fetchProducts = useCallback(
    async (page: number, append: boolean) => {
      const fetchId = ++fetchIdRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setStatus('loading');
        setError(null);
        setFailureReason(null);
        setHasMore(false);
        pageRef.current = 1;
      }

      try {
        if (!isOnline) {
          if (!append) {
            offlineCatalogRef.current = await loadFromCache();
          }
          if (fetchId !== fetchIdRef.current) return;

          setFailureReason('offline');
          if (offlineCatalogRef.current.length > 0) {
            applyOfflinePage(offlineCatalogRef.current, page, append);
          } else {
            setProducts([]);
            setSource('none');
            setStatus('error');
            setError(null);
            setHasMore(false);
          }
          return;
        }

        let res: Response;
        try {
          res = await fetchWithTimeout(
            `/api/products?search=${encodeURIComponent(debouncedSearch)}&tenant=${tenant}&page=${page}&limit=${PAGE_SIZE}`
          );
        } catch (requestErr) {
          // fetch() rejects with TypeError only when no response was received at all
          if (requestErr instanceof TypeError) throw new NetworkUnreachableError(requestErr.message);
          throw requestErr;
        }
        const data = await res.json();
        if (fetchId !== fetchIdRef.current) return;

        if (data.success) {
          const incoming = (data.data || []) as PosProduct[];
          const pages = data.pagination?.pages ?? 1;

          setProducts((prev) => (append ? [...prev, ...incoming] : incoming));
          setSource('server');
          setStatus('ready');
          setHasMore(page < pages);
          pageRef.current = page;
          setError(null);
          setFailureReason(null);

          // Best-effort: a local cache write failure must not discard fresh server data
          try {
            await cacheProductsMerged(incoming);
          } catch {
            // ignore cache write errors
          }

          if (page === 1) {
            try {
              const discountRes = await fetch(`/api/discounts?tenant=${tenant}`);
              const discountData = await discountRes.json();
              if (discountData.success && discountData.data) {
                const storage = await getOfflineStorage();
                await storage.cacheDiscounts(discountData.data, tenant);
              }
            } catch {
              // best-effort discount cache
            }
          }
          return;
        }

        throw new ApiResponseError(data.error || '');
      } catch (fetchErr) {
        if (fetchId !== fetchIdRef.current) return;

        const { reason, detail } = classifyFetchError(fetchErr);

        if (!append) {
          try {
            offlineCatalogRef.current = await loadFromCache();
            if (fetchId !== fetchIdRef.current) return;

            if (offlineCatalogRef.current.length > 0) {
              applyOfflinePage(offlineCatalogRef.current, 1, false);
              setFailureReason(reason);
              setError(detail);
              return;
            }
          } catch {
            // fall through to error state
          }
        }

        if (!append) {
          setProducts([]);
          setSource('none');
          setStatus('error');
          setFailureReason(reason);
          setError(detail);
          setHasMore(false);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoadingMore(false);
        }
      }
    },
    [
      applyOfflinePage,
      cacheProductsMerged,
      debouncedSearch,
      fetchWithTimeout,
      isOnline,
      loadFromCache,
      tenant,
    ]
  );

  useEffect(() => {
    fetchProducts(1, false);
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status === 'loading') return;
    fetchProducts(pageRef.current + 1, true);
  }, [fetchProducts, hasMore, loadingMore, status]);

  const setProductsOptimistic = useCallback((updater: PosProduct[] | ((prev: PosProduct[]) => PosProduct[])) => {
    setProducts(updater);
  }, []);

  return {
    products,
    setProducts: setProductsOptimistic,
    status,
    source,
    error,
    failureReason,
    hasMore,
    loadingMore,
    loadMore,
    refetch: () => fetchProducts(1, false),
  };
}
