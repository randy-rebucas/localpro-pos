'use client';

import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  disabled?: boolean;
  rootRef?: React.RefObject<Element | null>;
  rootMargin?: string;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  disabled = false,
  rootRef,
  rootMargin = '240px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || disabled || !hasMore || isLoading) return;

    let observer: IntersectionObserver | null = null;
    let rafId = 0;

    const attach = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            onLoadMore();
          }
        },
        {
          root: rootRef?.current ?? null,
          rootMargin,
          threshold: 0,
        }
      );
      observer.observe(sentinel);
    };

    attach();
    if (rootRef && !rootRef.current) {
      rafId = requestAnimationFrame(attach);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [disabled, hasMore, isLoading, onLoadMore, rootRef, rootMargin]);

  return sentinelRef;
}
