'use client';

import React, { ReactNode, useEffect, useRef, useCallback } from 'react';

interface InfiniteScrollTemplateProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore: () => void;
  children: ReactNode;
  emptyStateMessage?: string;
  message?: {
    type: 'success' | 'error';
    text: string;
  } | null;
}

export function InfiniteScrollTemplate({
  title,
  subtitle,
  loading = false,
  hasMore = true,
  onLoadMore,
  children,
  emptyStateMessage = 'No items available',
  message,
}: InfiniteScrollTemplateProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-600">{subtitle}</p>
          )}
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 border rounded ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          {children}
        </div>

        {/* Infinite Scroll Trigger */}
        <div ref={observerTarget} className="mt-8 flex justify-center">
          {loading && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600 text-sm">Loading more...</p>
            </div>
          )}
          {!hasMore && (
            <p className="text-gray-500 text-sm">No more items to load</p>
          )}
        </div>
      </div>
    </div>
  );
}
