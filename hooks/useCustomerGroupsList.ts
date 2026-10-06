'use client';

import { useCallback, useState } from 'react';
import { getFetchErrorMessage, isAbortError } from '@/lib/fetch-error';

export interface CustomerGroup {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
}

export interface CustomerGroupFormData {
  name: string;
  description?: string;
  isActive?: boolean;
}

interface UseCustomerGroupsListReturn {
  groups: CustomerGroup[];
  loading: boolean;
  /** Set when the last list fetch failed; cleared on the next successful fetch. */
  error: string | null;
  fetchGroups: () => Promise<void>;
  /** Mutations resolve `true` on success, or the server's specific error message on failure. */
  createGroup: (form: CustomerGroupFormData) => Promise<true | string>;
  updateGroup: (id: string, form: CustomerGroupFormData) => Promise<true | string>;
  deleteGroup: (id: string) => Promise<true | string>;
  toggleGroupStatus: (id: string, isActive: boolean) => Promise<true | string>;
}

async function mutate(url: string, init: RequestInit, fallback: string): Promise<true | string> {
  try {
    const res = await fetch(url, { credentials: 'include', ...init });
    const data = await res.json();
    if (data.success) return true;
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useCustomerGroupsList(): UseCustomerGroupsListReturn {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch('/api/customer-groups', {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setGroups(data.data || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch customer groups');
      }
    } catch (err) {
      if (!isAbortError(err)) {
        console.error('Failed to fetch customer groups:', err);
      }
      setError(getFetchErrorMessage(err, 'Failed to fetch customer groups'));
    } finally {
      setLoading(false);
    }
  }, []);

  const createGroup = useCallback(
    (form: CustomerGroupFormData) =>
      mutate('/api/customer-groups', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(form) }, 'Failed to save customer group'),
    []
  );

  const updateGroup = useCallback(
    (id: string, form: CustomerGroupFormData) =>
      mutate(`/api/customer-groups/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(form) }, 'Failed to update customer group'),
    []
  );

  const deleteGroup = useCallback(
    (id: string) => mutate(`/api/customer-groups/${id}`, { method: 'DELETE' }, 'Failed to delete customer group'),
    []
  );

  const toggleGroupStatus = useCallback(
    (id: string, isActive: boolean) =>
      mutate(`/api/customer-groups/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ isActive }) }, 'Failed to update customer group'),
    []
  );

  return {
    groups,
    loading,
    error,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroupStatus,
  };
}
