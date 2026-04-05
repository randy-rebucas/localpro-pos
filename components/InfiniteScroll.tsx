'use client';

import React from 'react';

interface InfiniteScrollListProps<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  className?: string;
  itemClassName?: string;
  listClassName?: string;
}

/**
 * Reusable infinite scroll list component
 * Works with useInfiniteScroll hook
 */
export function InfiniteScrollList<T extends { _id?: string | number; id?: string | number }>({
  items,
  loading,
  error,
  hasMore,
  endRef,
  onRetry,
  renderItem,
  emptyMessage = 'No items found',
  loadingMessage = 'Loading more...',
  errorMessage,
  className = '',
  itemClassName = 'border-b border-gray-200 last:border-b-0',
  listClassName = 'divide-y divide-gray-200',
}: InfiniteScrollListProps<T>) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{errorMessage || error}</p>
              <button
                onClick={onRetry}
                className="mt-2 text-sm fontmedium text-red-600 hover:text-red-700 hover:underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && !loading && !error && (
        <div className="p-12 text-center">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="text-gray-500 text-sm">{emptyMessage}</p>
        </div>
      )}

      {/* List Items */}
      {items.length > 0 && (
        <div className={listClassName}>
          {items.map((item, index) => (
            <div key={item._id || item.id || index} className={itemClassName}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="border-t border-gray-200 p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-sm text-gray-600">{loadingMessage}</span>
          </div>
        </div>
      )}

      {/* End Marker */}
      <div
        ref={endRef}
        className={`border-t border-gray-200 p-4 text-center text-sm text-gray-500 ${
          !hasMore && items.length > 0 ? 'block' : 'hidden'
        }`}
      >
        All items loaded
      </div>
    </div>
  );
}

/**
 * Infinite scroll grid component
 * For displaying items in a grid layout
 */
interface InfiniteScrollGridProps<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  columns?: 1 | 2 | 3 | 4 | 6;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function InfiniteScrollGrid<T extends { _id?: string | number; id?: string | number }>({
  items,
  loading,
  error,
  hasMore,
  endRef,
  onRetry,
  renderItem,
  emptyMessage = 'No items found',
  columns = 3,
  gap = 'md',
  className = '',
}: InfiniteScrollGridProps<T>) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  };

  const gapClasses = {
    sm: 'gap-2 sm:gap-3',
    md: 'gap-4 sm:gap-6',
    lg: 'gap-6 sm:gap-8',
  };

  return (
    <div className={className}>
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button
                onClick={onRetry}
                className="mt-2 text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && !loading && !error && (
        <div className="py-12 text-center">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      )}

      {/* Grid */}
      {items.length > 0 && (
        <div className={`grid ${colClasses[columns]} ${gapClasses[gap]}`}>
          {items.map((item, index) => (
            <div key={item._id || item.id || index}>{renderItem(item, index)}</div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-sm text-gray-600">Loading more...</span>
          </div>
        </div>
      )}

      {/* End Marker */}
      <div
        ref={endRef}
        className={`py-8 text-center text-sm text-gray-500 ${
          !hasMore && items.length > 0 ? 'block' : 'hidden'
        }`}
      >
        All items loaded
      </div>
    </div>
  );
}
