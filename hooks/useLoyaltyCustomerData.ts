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
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (pageNum: number) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        abortControllerRef.current = controller;

        setLoading(true);

        const res = await fetch(`/api/loyalty/customers/${customerId}?page=${pageNum}&limit=20`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const json = await res.json();

        if (json.success) {
          setData(json.data);
        } else {
          console.error('Failed to load loyalty data:', json.error);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error fetching loyalty data:', error);
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
      setPage(validPage);
      fetchData(validPage);
    },
    [data?.pagination.totalPages, fetchData]
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
    setPage: goToPage,
    refetch: () => fetchData(page),
  };
};
