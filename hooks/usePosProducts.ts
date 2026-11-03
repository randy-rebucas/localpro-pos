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
  description?: string;
  image?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
  hasVariations?: boolean;
  isActive?: boolean;
  createdAt?: string;
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

/**
 * Search is local-first: the tenant's catalog is synced to this device (IndexedDB) and every
 * keystroke is matched in memory, so typing costs no database reads. The server is only asked
 * for what changed since the last sync (`updatedSince`, indexed on {tenantId, updatedAt}), with a
 * full refresh once a day to catch anything a delta can't (e.g. hard deletes from scripts).
 */
const PAGE_SIZE = 40;
const DELTA_SYNC_MS = 5 * 60 * 1000;
const FULL_SYNC_MS = 24 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 1000;
/** Server fallback (catalog not available) only runs for queries at least this long. */
const MIN_SERVER_QUERY = 2;

type SyncState = 'idle' | 'syncing' | 'done' | 'failed';

interface SyncMeta {
  syncedAt: string;
  fullAt: number;
}

const syncMetaKey = (tenant: string) => `posCatalogSync_${tenant}`;

function readSyncMeta(tenant: string): SyncMeta | null {
  try {
    const raw = localStorage.getItem(syncMetaKey(tenant));
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

function writeSyncMeta(tenant: string, meta: SyncMeta) {
  try {
    localStorage.setItem(syncMetaKey(tenant), JSON.stringify(meta));
  } catch {
    // Without stored meta the next load just does a full sync.
  }
}

function matchScore(p: PosProduct, q: string): number {
  const name = p.name.toLowerCase();
  const sku = p.sku?.toLowerCase();
  const barcode = p.barcode?.toLowerCase();
  if (sku === q || barcode === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(` ${q}`)) return 2;
  if (
    name.includes(q) ||
    sku?.includes(q) ||
    barcode?.includes(q) ||
    p.category?.toLowerCase().includes(q) ||
    p.description?.toLowerCase().includes(q)
  ) {
    return 3;
  }
  return -1;
}

/** Pinned first, then best match, then newest — mirrors the server's pinned/createdAt sort. */
export function searchCatalog(catalog: PosProduct[], search: string): PosProduct[] {
  const q = search.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ p: PosProduct; score: number }> = [];
  for (const p of catalog) {
    const score = matchScore(p, q);
    if (score >= 0) scored.push({ p, score });
  }
  scored.sort(
    (a, b) =>
      Number(Boolean(b.p.pinned)) - Number(Boolean(a.p.pinned)) ||
      a.score - b.score ||
      (b.p.createdAt || '').localeCompare(a.p.createdAt || '')
  );
  return scored.map((s) => s.p);
}

interface UsePosProductsOptions {
  tenant: string;
  debouncedSearch: string;
  isOnline: boolean;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  // Bumped whenever the catalog changes so the current search re-runs against it.
  const [catalogVersion, setCatalogVersion] = useState(0);

  const catalogRef = useRef<PosProduct[]>([]);
  const cacheLoadedRef = useRef(false);
  const syncingRef = useRef(false);
  const discountsCachedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchesRef = useRef<PosProduct[]>([]);
  const pageRef = useRef(1);
  const fetchIdRef = useRef(0);

  const persistCatalog = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const storage = await getOfflineStorage();
        await storage.cacheProducts(catalogRef.current, tenant);
      } catch {
        // Cache is best-effort; the next sync rewrites it.
      }
    }, PERSIST_DEBOUNCE_MS);
  }, [tenant]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  // 1. Load whatever this device already has, so search works instantly (and offline).
  useEffect(() => {
    let cancelled = false;
    cacheLoadedRef.current = false;
    (async () => {
      try {
        const storage = await getOfflineStorage();
        const cached = (await storage.getCachedProducts(tenant)) as unknown as PosProduct[];
        if (cancelled) return;
        catalogRef.current = cached.filter((p) => p.isActive !== false);
      } catch {
        if (cancelled) return;
        catalogRef.current = [];
      }
      cacheLoadedRef.current = true;
      setCatalogVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  // 2. Sync the catalog: delta since the last sync, or a full pull when stale/empty.
  const syncCatalog = useCallback(async () => {
    if (syncingRef.current || !cacheLoadedRef.current) return;
    syncingRef.current = true;
    setSyncState('syncing');
    try {
      const meta = readSyncMeta(tenant);
      const full = !meta || catalogRef.current.length === 0 || Date.now() - meta.fullAt > FULL_SYNC_MS;
      const url =
        `/api/products?tenant=${encodeURIComponent(tenant)}&view=pos` +
        (full ? '' : `&updatedSince=${encodeURIComponent(meta.syncedAt)}`);
      const res = await fetchWithTimeout(url, undefined, 30000);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Catalog sync failed');

      const rows = (data.data || []) as PosProduct[];
      if (full) {
        catalogRef.current = rows.filter((p) => p.isActive !== false);
      } else if (rows.length > 0) {
        const byId = new Map(catalogRef.current.map((p) => [p._id, p]));
        for (const row of rows) {
          if (row.isActive === false) byId.delete(row._id);
          else byId.set(row._id, row);
        }
        catalogRef.current = Array.from(byId.values());
      }

      writeSyncMeta(tenant, {
        syncedAt: data.syncedAt || new Date().toISOString(),
        fullAt: full ? Date.now() : meta!.fullAt,
      });
      if (full || rows.length > 0) {
        persistCatalog();
        setCatalogVersion((v) => v + 1);
      }
      setSyncState('done');

      // Discounts are cached for offline checkout once per session, not on every search.
      if (!discountsCachedRef.current) {
        discountsCachedRef.current = true;
        fetch(`/api/discounts?tenant=${tenant}`)
          .then((r) => r.json())
          .then(async (d) => {
            if (d.success && d.data) {
              const storage = await getOfflineStorage();
              await storage.cacheDiscounts(d.data, tenant);
            }
          })
          .catch(() => {
            discountsCachedRef.current = false;
          });
      }
    } catch {
      setSyncState('failed');
    } finally {
      syncingRef.current = false;
    }
  }, [tenant, fetchWithTimeout, persistCatalog]);

  useEffect(() => {
    if (!isOnline || catalogVersion === 0) return;
    // First run after the cache loads; later catalog bumps don't need another sync.
    if (syncState === 'idle') syncCatalog();
  }, [isOnline, catalogVersion, syncState, syncCatalog]);

  useEffect(() => {
    if (!isOnline) return;
    // Coming back online: catch up on anything that changed while disconnected.
    if (syncState === 'done' || syncState === 'failed') syncCatalog();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncCatalog();
    }, DELTA_SYNC_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on connectivity changes
  }, [isOnline, syncCatalog]);

  const showPage = useCallback((page: number, fromServer: boolean) => {
    const end = page * PAGE_SIZE;
    setProducts(matchesRef.current.slice(0, end));
    setHasMore(end < matchesRef.current.length);
    pageRef.current = page;
    setSource(fromServer ? 'server' : 'cache');
    setStatus('ready');
    setError(null);
  }, []);

  // Server search: only used when this device has no catalog yet and the sync failed.
  const searchServer = useCallback(
    async (page: number, append: boolean) => {
      const fetchId = ++fetchIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setStatus('loading');
        setError(null);
        setHasMore(false);
      }
      try {
        const res = await fetchWithTimeout(
          `/api/products?search=${encodeURIComponent(debouncedSearch)}&tenant=${encodeURIComponent(tenant)}&page=${page}&limit=${PAGE_SIZE}&count=0&view=pos`
        );
        const data = await res.json();
        if (fetchId !== fetchIdRef.current) return;
        if (!data.success) throw new Error(data.error || 'Failed to fetch products');
        const incoming = (data.data || []) as PosProduct[];
        setProducts((prev) => (append ? [...prev, ...incoming] : incoming));
        setHasMore(Boolean(data.pagination?.hasMore));
        pageRef.current = page;
        setSource('server');
        setStatus('ready');
      } catch (err) {
        if (fetchId !== fetchIdRef.current || append) return;
        setProducts([]);
        setSource('none');
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        if (fetchId === fetchIdRef.current) setLoadingMore(false);
      }
    },
    [debouncedSearch, fetchWithTimeout, tenant]
  );

  // 3. Run the search whenever the query or the catalog changes.
  useEffect(() => {
    fetchIdRef.current++;
    const q = debouncedSearch.trim();
    if (!q) {
      matchesRef.current = [];
      setProducts([]);
      setStatus('idle');
      setError(null);
      setHasMore(false);
      return;
    }
    if (!cacheLoadedRef.current) {
      setStatus('loading');
      return;
    }
    if (catalogRef.current.length > 0) {
      matchesRef.current = searchCatalog(catalogRef.current, q);
      showPage(1, syncState === 'done');
      return;
    }
    if (isOnline && (syncState === 'idle' || syncState === 'syncing')) {
      setStatus('loading'); // the first sync will bump catalogVersion and land here again
      return;
    }
    if (isOnline && q.length >= MIN_SERVER_QUERY) {
      searchServer(1, false);
      return;
    }
    if (isOnline) {
      matchesRef.current = [];
      showPage(1, false);
      return;
    }
    setProducts([]);
    setSource('none');
    setStatus('error');
    setError('No cached products available offline');
    setHasMore(false);
    // searchServer is intentionally omitted: it changes with debouncedSearch, already a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, catalogVersion, syncState, isOnline, showPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status === 'loading') return;
    if (catalogRef.current.length > 0) showPage(pageRef.current + 1, syncState === 'done');
    else searchServer(pageRef.current + 1, true);
  }, [hasMore, loadingMore, searchServer, showPage, status, syncState]);

  /**
   * Updates the visible results and the synced catalog together (stock events, sales, pin toggles),
   * so the next search reflects them without waiting for a sync. Updaters must be per-product maps.
   */
  const setProductsOptimistic = useCallback(
    (updater: PosProduct[] | ((prev: PosProduct[]) => PosProduct[])) => {
      setProducts(updater);
      if (typeof updater === 'function') {
        catalogRef.current = updater(catalogRef.current);
        matchesRef.current = updater(matchesRef.current);
        persistCatalog();
      }
    },
    [persistCatalog]
  );

  /** Exact barcode / SKU / id lookup against the local catalog (scanner fast path). */
  const findByCode = useCallback((code: string): PosProduct | undefined => {
    return catalogRef.current.find((p) => p.barcode === code || p.sku === code || p._id === code);
  }, []);

  return {
    products,
    setProducts: setProductsOptimistic,
    status,
    source,
    error,
    hasMore,
    loadingMore,
    loadMore,
    findByCode,
    refetch: () => {
      if (catalogRef.current.length === 0) setSyncState('idle');
      else syncCatalog();
    },
  };
}
