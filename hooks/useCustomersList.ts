'use client';

import { useCallback, useState } from 'react';
import { CustomerFormData } from './useCustomersForm';

export interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string[];
  totalSpent: number;
  lastPurchaseDate?: string;
  isActive: boolean;
  createdAt: string;
}

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
  createCustomer: (form: CustomerFormData) => Promise<boolean>;
  updateCustomer: (id: string, form: CustomerFormData) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<boolean>;
  toggleCustomerStatus: (id: string, isActive: boolean) => Promise<boolean>;
}

export function useCustomersList(): UseCustomersListReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
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
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to fetch customers:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, filterActive]);

  const createCustomer = useCallback(
    async (form: CustomerFormData) => {
      try {
        const tags = form.tags && typeof form.tags === 'string'
          ? form.tags.split(',').map((t: string) => t.trim())
          : Array.isArray(form.tags) ? form.tags : [];
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
        const tags = form.tags && typeof form.tags === 'string'
          ? form.tags.split(',').map((t: string) => t.trim())
          : Array.isArray(form.tags) ? form.tags : [];
        const payload = { ...form, tags };

        const res = await fetch(`/api/customers/${id}`, {
          method: 'PUT',
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
    createCustomer,
    updateCustomer,
    deleteCustomer,
    toggleCustomerStatus,
  };
}
