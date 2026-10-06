'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Customer } from '@/types/customer';
import { CustomerFormData } from './useCustomersForm';
import { getFetchErrorMessage, isAbortError } from '@/lib/fetch-error';

export type { Customer } from '@/types/customer';

interface UseCustomersListReturn {
  customers: Customer[];
  loading: boolean;
  /** Set when the last list fetch failed; cleared on the next successful fetch. */
  error: string | null;
  page: number;
  totalPages: number;
  /** Total matching customers across all pages. */
  total: number;
  /** Page size used for the list request. */
  limit: number;
  setPage: (page: number) => void;
  search: string;
  setSearch: (search: string) => void;
  filterActive: string;
  setFilterActive: (filter: string) => void;
  fetchCustomers: () => Promise<void>;
  /** True after the first list fetch has finished (success or error). */
  initialLoadComplete: boolean;
  /** Resolves `true` on success, or the server's specific error message on failure. */
  createCustomer: (form: CustomerFormData) => Promise<true | string>;
  /** Resolves `true` on success, or the server's specific error message on failure. */
  updateCustomer: (id: string, form: CustomerFormData) => Promise<true | string>;
  deleteCustomer: (id: string) => Promise<true | string>;
  toggleCustomerStatus: (id: string, isActive: boolean) => Promise<true | string>;
}

function normalizeCreditLimitFromForm(form: CustomerFormData): number | null | undefined {
  if (form.creditLimit === undefined) return undefined;
  const trimmed = form.creditLimit.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeTagsFromForm(form: CustomerFormData): string[] {
  const raw =
    form.tags && typeof form.tags === 'string'
      ? form.tags.split(',').map((t: string) => t.trim())
      : Array.isArray(form.tags)
        ? form.tags
        : [];
  return raw.filter(Boolean);
}

const PAGE_SIZE = 20;

export function useCustomersList(): UseCustomersListReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterActive !== 'all') params.set('isActive', filterActive);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`/api/customers?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        const rows: Customer[] = data.data || [];
        setCustomers(rows);
        const pages = data.pagination?.pages;
        setTotalPages(typeof pages === 'number' && pages >= 1 ? pages : 1);
        const count = data.pagination?.total;
        setTotal(typeof count === 'number' ? count : rows.length);
        setError(null);
      } else {
        setError(data.error || 'Failed to load customers');
      }
    } catch (err) {
      if (!isAbortError(err)) {
        console.error('Failed to fetch customers:', err);
      }
      setError(getFetchErrorMessage(err, 'Failed to load customers'));
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [page, debouncedSearch, filterActive]);

  const createCustomer = useCallback(
    async (form: CustomerFormData) => {
      try {
        const tags = normalizeTagsFromForm(form);
        const creditLimit = normalizeCreditLimitFromForm(form);
        const { creditLimit: _creditLimitField, ...rest } = form;
        const payload = { ...rest, tags, creditLimit };

        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          return true;
        }
        return data.error || 'Failed to save customer';
      } catch {
        return 'Failed to save customer';
      }
    },
    []
  );

  const updateCustomer = useCallback(
    async (id: string, form: CustomerFormData) => {
      try {
        const tags = normalizeTagsFromForm(form);
        const creditLimit = normalizeCreditLimitFromForm(form);
        const { creditLimit: _creditLimitField, ...rest } = form;
        const payload = { ...rest, tags, creditLimit };

        const res = await fetch(`/api/customers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          return true;
        }
        return data.error || 'Failed to update customer';
      } catch {
        return 'Failed to update customer';
      }
    },
    []
  );

  const deleteCustomer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        return true;
      }
      return data.error || 'Failed to deactivate customer';
    } catch {
      return 'Failed to deactivate customer';
    }
  }, []);

  const toggleCustomerStatus = useCallback(
    async (id: string, isActive: boolean) => {
      try {
        const res = await fetch(`/api/customers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive }),
        });

        const data = await res.json();
        if (data.success) {
          return true;
        }
        return data.error || 'Could not update customer status';
      } catch {
        return 'Could not update customer status';
      }
    },
    []
  );

  return {
    customers,
    loading,
    error,
    page,
    totalPages,
    total,
    limit: PAGE_SIZE,
    setPage,
    search,
    setSearch,
    filterActive,
    setFilterActive,
    fetchCustomers,
    initialLoadComplete,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    toggleCustomerStatus,
  };
}
