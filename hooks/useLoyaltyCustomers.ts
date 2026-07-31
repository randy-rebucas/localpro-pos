'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Customer } from '@/types/customer';

/** List row from loyalty admin — subset of `Customer` from the model. */
export type LoyaltyCustomer = Pick<
  Customer,
  '_id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'loyaltyPointsBalance' | 'totalSpent' | 'isActive'
>;

export interface PaginationInfo {
  pages: number;
  total: number;
}

export const useLoyaltyCustomers = () => {
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const fetchCustomers = useCallback(async (pageNum: number, searchTerm: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setLoading(true);

      const qs = new URLSearchParams({ page: String(pageNum), limit: '20' });
      if (searchTerm) qs.set('search', searchTerm);

      const res = await fetch(`/api/customers?${qs}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json();

      if (json.success) {
        setCustomers(json.data || []);
        setTotalPages(json.pagination?.pages ?? 1);
        setTotalCustomers(json.pagination?.total ?? 0);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching customers:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((searchTerm: string) => {
    setSearch(searchTerm);
    setPage(1);
  }, []);

  const goToPage = useCallback((pageNum: number) => {
    setPage((prev) => Math.max(1, Math.min(pageNum, totalPages || prev)));
  }, [totalPages]);

  // Fetch whenever the debounced search term or page changes (debounced so typing
  // doesn't fire a request per keystroke).
  useEffect(() => {
    fetchCustomers(page, debouncedSearch);
  }, [page, debouncedSearch, fetchCustomers]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Tenant-wide totals — fetched separately via aggregation, since `customers`
  // above only holds the current paginated page and would silently undercount
  // enrolled customers / points outstanding for tenants with >20 customers.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/loyalty/stats', { credentials: 'include', signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setEnrolledCount(json.data.enrolledCount ?? 0);
          setTotalPoints(json.data.totalPoints ?? 0);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error fetching loyalty stats:', error);
        }
      });
    return () => controller.abort();
  }, []);

  return {
    customers,
    search,
    page,
    totalPages,
    totalCustomers,
    loading,
    enrolledCount,
    totalPoints,
    setSearch: handleSearch,
    setPage: goToPage,
    fetchCustomers,
  };
};
