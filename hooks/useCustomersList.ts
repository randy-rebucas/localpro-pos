'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Customer } from '@/types/customer';
import { CustomerFormData } from './useCustomersForm';

export type { Customer } from '@/types/customer';

interface UseCustomersListReturn {
  customers: Customer[];
  loading: boolean;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  search: string;
  setSearch: (search: string) => void;
  filterActive: string;
  setFilterActive: (filter: string) => void;
  fetchCustomers: () => Promise<void>;
  /** True after the first list fetch has finished (success or error). */
  initialLoadComplete: boolean;
  createCustomer: (form: CustomerFormData) => Promise<boolean>;
  updateCustomer: (id: string, form: CustomerFormData) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<boolean>;
  toggleCustomerStatus: (id: string, isActive: boolean) => Promise<boolean>;
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

export function useCustomersList(): UseCustomersListReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
      const params = new URLSearchParams({ page: String(page), limit: '20' });
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
        setCustomers(data.data || []);
        const pages = data.pagination?.pages;
        setTotalPages(typeof pages === 'number' && pages >= 1 ? pages : 1);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to fetch customers:', error);
      }
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [page, debouncedSearch, filterActive]);

  const createCustomer = useCallback(
    async (form: CustomerFormData) => {
      try {
        const tags = normalizeTagsFromForm(form);
        const payload = { ...form, tags };

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
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  const updateCustomer = useCallback(
    async (id: string, form: CustomerFormData) => {
      try {
        const tags = normalizeTagsFromForm(form);
        const payload = { ...form, tags };

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
        return false;
      } catch {
        return false;
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
      return false;
    } catch {
      return false;
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
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  return {
    customers,
    loading,
    page,
    totalPages,
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
