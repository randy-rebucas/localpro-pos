import { useCallback, useState } from 'react';

export interface Tenant {
  _id: string;
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  isActive: boolean;
  createdAt: string;
  settings: {
    currency: string;
    language: 'en' | 'es';
    email?: string;
    phone?: string;
    companyName?: string;
    businessType?: string;
  };
}

interface ListState {
  tenants: Tenant[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function useTenantsList(tenant: string) {
  const [state, setState] = useState<ListState>({
    tenants: [],
    loading: true,
    message: null,
  });

  const fetchTenants = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const res = await fetch(`/api/tenants/${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setState((prev) => ({
          ...prev,
          tenants: [data.data],
          loading: false,
          message: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          message: { type: 'error', text: data.error || 'Failed to fetch tenant' },
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        message: {
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to fetch tenant',
        },
      }));
    }
  }, [tenant]);

  const clearMessage = useCallback(() => {
    setState((prev) => ({ ...prev, message: null }));
  }, []);

  return {
    ...state,
    fetchTenants,
    clearMessage,
  };
}
