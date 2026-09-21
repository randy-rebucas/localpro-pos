'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ExchangeRateResult {
  exchangeRates: Record<string, number>;
  lastUpdated: string;
}

export const useExchangeRateFetch = (tenant: string) => {
  const [fetching, setFetching] = useState(false);
  const [loadingRates, setLoadingRates] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Exchange rates live in their own table (TenantExchangeRate), not on
  // TenantSettings, and the Multi-Currency page never fetched them on load —
  // only "Fetch Latest Rates" (the 'fetch' action below) populated anything,
  // so previously-saved rates (manual or API) silently appeared blank on
  // every page load even though they were on file.
  const loadRates = useCallback(async () => {
    try {
      setLoadingRates(true);
      const res = await fetch(`/api/tenants/${tenant}/exchange-rates`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        return { success: true, data: data.data as ExchangeRateResult };
      }
      // Multi-currency not enabled / not yet configured — not an error the
      // admin needs to see on a fresh page load.
      return { success: false, error: data.error as string | undefined };
    } catch (error: unknown) {
      console.error('Error loading exchange rates:', error);
      return { success: false, error: 'Failed to load exchange rates' };
    } finally {
      setLoadingRates(false);
    }
  }, [tenant]);

  // The general settings PUT (useMultiCurrencySettings.saveSettings) can't
  // persist multiCurrency.exchangeRates — lib/tenant-settings-flatten.ts has
  // no column mapping for it (exchange rates are array-shaped and live in
  // their own table by design, see that file's module doc), so manually
  // edited rate values would otherwise be silently dropped on save.
  const saveManualRates = useCallback(
    async (rates: Record<string, number>) => {
      try {
        setSavingRates(true);
        const res = await fetch(`/api/tenants/${tenant}/exchange-rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', exchangeRates: rates }),
        });
        const data = await res.json();
        if (data.success) {
          return { success: true, data: data.data as ExchangeRateResult };
        }
        return { success: false, error: data.error as string | undefined };
      } catch (error: unknown) {
        console.error('Error saving exchange rates:', error);
        return { success: false, error: 'Failed to save exchange rates' };
      } finally {
        setSavingRates(false);
      }
    },
    [tenant]
  );

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
    loadingRates,
    loadRates,
    savingRates,
    saveManualRates,
  };
};
