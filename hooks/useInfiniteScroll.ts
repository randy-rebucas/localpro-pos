'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInfiniteScrollOptions {
  apiUrl: string;
  pageSize?: number;
  threshold?: number; // Percentage (0-1) at which to load more
  enabled?: boolean;
}

export interface UseInfiniteScrollResult<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  retry: () => void;
  reset: () => void;
}

/**
 * Hook for implementing infinite scroll with intersection observer.
 * Automatically fetches more data when scrolling near the bottom.
 * Resets and re-fetches whenever apiUrl changes (e.g. filter change).
 */
export function useInfiniteScroll<T>(
  options: UseInfiniteScrollOptions
): UseInfiniteScrollResult<T> {
  const { apiUrl, pageSize = 50, threshold = 0.1, enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  // Incrementing this forces a page-1 re-fetch (used by reset())
  const [refetchKey, setRefetchKey] = useState(0);

  // Use refs to avoid stale closures in intersection observer and async callbacks
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (loadingRef.current) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const url = new URL(apiUrl, typeof window !== 'undefined' ? window.location.origin : '');
        url.searchParams.set('page', pageNum.toString());
        url.searchParams.set('limit', pageSize.toString());

        const response = await fetch(url.toString(), {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Unknown error');

        // Page 1 replaces items (reset); subsequent pages append
        if (pageNum === 1) {
          setItems(data.data);
        } else {
          setItems((prev) => [...prev, ...data.data]);
        }

        const { pagination } = data;
        const isLastPage = !pagination || pageNum >= pagination.pages;
        hasMoreRef.current = !isLastPage;
        setHasMore(!isLastPage);
        pageRef.current = pageNum + 1;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(message);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [apiUrl, pageSize]
  );

  // Reset and initial fetch whenever apiUrl, enabled, or refetchKey changes
  useEffect(() => {
    if (!enabled) return;
    pageRef.current = 1;
    hasMoreRef.current = true;
    setItems([]);
    setError(null);
    setHasMore(true);
    fetchPage(1);
    // fetchPage excluded intentionally: apiUrl/enabled/refetchKey are the real triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, enabled, refetchKey]);

  // Setup intersection observer — load more when end marker becomes visible
  useEffect(() => {
    if (!enabled) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current && hasMoreRef.current) {
          fetchPage(pageRef.current);
        }
      },
      { threshold }
    );

    if (endRef.current) {
      observerRef.current.observe(endRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [fetchPage, enabled, threshold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const retry = useCallback(() => {
    setError(null);
    pageRef.current = 1;
    hasMoreRef.current = true;
    setItems([]);
    setHasMore(true);
    fetchPage(1);
  }, [fetchPage]);

  // reset() cancels in-flight request, clears state, then re-fetches page 1
  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    pageRef.current = 1;
    hasMoreRef.current = true;
    loadingRef.current = false;
    setLoading(false);
    setRefetchKey((k) => k + 1);
  }, []);

  return { items, loading, error, hasMore, endRef, retry, reset };
}
