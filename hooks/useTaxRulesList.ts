import { useCallback, useRef, useState } from 'react';

export interface TaxRule {
  id: string;
  name: string;
  rate: number;
  label: string;
  appliesTo?: 'all' | 'products' | 'services' | 'categories';
  categoryIds?: string[];
  productIds?: string[];
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCodes?: string[];
  };
  priority: number;
  isActive: boolean;
}

interface ListState {
  rules: TaxRule[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function useTaxRulesList(tenant: string) {
  const [state, setState] = useState<ListState>({
    rules: [],
    loading: true,
    message: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRules = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setState((prev) => ({ ...prev, loading: true }));
      const res = await fetch(`/api/tenants/${tenant}/tax-rules`, {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setState((prev) => ({
          ...prev,
          rules: data.data || [],
          loading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          message: { type: 'error', text: data.error || 'Failed to load tax rules' },
        }));
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      clearTimeout(timeoutId);
      setState((prev) => ({
        ...prev,
        loading: false,
        message: {
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to load tax rules',
        },
      }));
    }
  }, [tenant]);

  const deleteRule = useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this tax rule?')) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/tenants/${tenant}/tax-rules?id=${id}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (data.success) {
          setState((prev) => ({
            ...prev,
            message: { type: 'success', text: 'Tax rule deleted successfully' },
          }));
          await fetchRules();
        } else {
          setState((prev) => ({
            ...prev,
            message: { type: 'error', text: data.error || 'Failed to delete tax rule' },
          }));
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        clearTimeout(timeoutId);
        setState((prev) => ({
          ...prev,
          message: {
            type: 'error',
            text: error instanceof Error ? error.message : 'Failed to delete tax rule',
          },
        }));
      }
    },
    [tenant, fetchRules]
  );

  const clearMessage = useCallback(() => {
    setState((prev) => ({ ...prev, message: null }));
  }, []);

  return {
    ...state,
    fetchRules,
    deleteRule,
    clearMessage,
  };
}
