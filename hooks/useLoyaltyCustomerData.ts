'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface LoyaltyEntry {
  _id: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface LoyaltyData {
  customerId: string;
  customerName: string;
  loyaltyPointsBalance: number;
  history: LoyaltyEntry[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export const useLoyaltyCustomerData = (customerId: string) => {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (pageNum: number) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        abortControllerRef.current = controller;

        setLoading(true);
        setError(null);

        const res = await fetch(`/api/loyalty/customers/${customerId}?page=${pageNum}&limit=20`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const json = await res.json();

        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Failed to load loyalty data');
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setError('Failed to load loyalty data');
        }
      } finally {
        setLoading(false);
      }
    },
    [customerId]
  );

  const goToPage = useCallback(
    (pageNum: number) => {
      const validPage = Math.max(1, Math.min(pageNum, data?.pagination.totalPages ?? 1));
      // The effect on `page` does the fetch.
      setPage(validPage);
    },
    [data?.pagination.totalPages]
  );

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    data,
    page,
    loading,
    error,
    setPage: goToPage,
    refetch: () => fetchData(page),
  };
};
