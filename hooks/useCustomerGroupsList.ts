'use client';

import { useCallback, useState } from 'react';

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
  message: { type: 'success' | 'error'; text: string } | null;
  fetchGroups: () => Promise<void>;
  createGroup: (form: CustomerGroupFormData) => Promise<true | string>;
  updateGroup: (id: string, form: CustomerGroupFormData) => Promise<true | string>;
  deleteGroup: (id: string) => Promise<boolean>;
  toggleGroupStatus: (id: string, isActive: boolean) => Promise<boolean>;
  clearMessage: () => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useCustomerGroupsList(): UseCustomerGroupsListReturn {
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch customer groups' });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to fetch customer groups:', error);
        setMessage({ type: 'error', text: 'Failed to fetch customer groups' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createGroup = useCallback(async (form: CustomerGroupFormData) => {
    try {
      const res = await fetch('/api/customer-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Customer group created successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to save customer group';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to save customer group';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const updateGroup = useCallback(async (id: string, form: CustomerGroupFormData) => {
    try {
      const res = await fetch(`/api/customer-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Customer group updated successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to update customer group';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to update customer group';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const deleteGroup = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/customer-groups/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Customer group deleted successfully' });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete customer group' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete customer group' });
      return false;
    }
  }, []);

  const toggleGroupStatus = useCallback(async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/customer-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: isActive ? 'Customer group activated successfully' : 'Customer group deactivated successfully',
        });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to update customer group' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to update customer group' });
      return false;
    }
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    groups,
    loading,
    message,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroupStatus,
    clearMessage,
    setMessage,
  };
}
