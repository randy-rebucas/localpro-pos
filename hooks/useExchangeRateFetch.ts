'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ExchangeRateResult {
  exchangeRates: Record<string, number>;
  lastUpdated: string;
}

export const useExchangeRateFetch = (tenant: string) => {
  const [fetching, setFetching] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setFetching(true);

      const res = await fetch(`/api/tenants/${tenant}/exchange-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'fetch' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        return { success: true, data: data.data as ExchangeRateResult };
      } else {
        return { success: false, error: data.error || 'Failed to fetch exchange rates' };
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching rates:', error);
        return { success: false, error: 'Failed to fetch exchange rates' };
      }
      return { success: false, error: 'Request cancelled' };
    } finally {
      setFetching(false);
    }
  }, [tenant]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    fetching,
    fetchRates,
  };
};
