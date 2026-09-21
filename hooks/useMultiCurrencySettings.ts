'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';

export interface MultiCurrencySettings {
  enabled: boolean;
  displayCurrencies: string[];
  exchangeRates: Record<string, number>;
  exchangeRateSource: 'manual' | 'api';
  exchangeRateApiKey: string;
  exchangeRateApiKeyConfigured?: boolean;
  lastUpdated?: Date;
}

// GET /api/tenants/{tenant}/settings returns the flat Prisma TenantSettings
// row (multiCurrencyEnabled/displayCurrencies/exchangeRateSource/
// exchangeRateApiKey/exchangeRateLastUpdated columns) — it never sends a
// nested `multiCurrency` object. This page and ITenantSettings both expect
// `settings.multiCurrency.*`, so without this every field here (enabled,
// display currencies, source, API key) silently reverts to the hardcoded
// default on every load even though it was saved correctly — the PUT path
// flattens the nested payload before writing (lib/tenant-settings-flatten.ts),
// there's just no reverse step on read. Mirrors reshapeAddress in
// hooks/useSettingsPage.ts, the same fix for the same class of bug.
function reshapeMultiCurrency(data: Record<string, unknown>): Record<string, unknown> {
  if (data.multiCurrency) return data;
  const {
    multiCurrencyEnabled,
    displayCurrencies,
    exchangeRateSource,
    exchangeRateApiKeyConfigured,
    exchangeRateLastUpdated,
    ...rest
  } = data;
  return {
    ...rest,
    multiCurrency: {
      enabled: (multiCurrencyEnabled as boolean) ?? false,
      displayCurrencies: (displayCurrencies as string[]) ?? [],
      exchangeRates: {},
      exchangeRateSource: (exchangeRateSource as 'manual' | 'api') ?? 'manual',
      // The raw key is never sent back by GET (see the settings route) —
      // only whether one is on file. The field stays blank until the admin
      // types a new value; leaving it blank on save keeps the existing key
      // unchanged rather than clearing it (see the settings PUT handler).
      exchangeRateApiKey: '',
      exchangeRateApiKeyConfigured: (exchangeRateApiKeyConfigured as boolean) ?? false,
      lastUpdated: exchangeRateLastUpdated ?? undefined,
    },
  };
}

function mergeDefaultSettings(data: Record<string, unknown>): ITenantSettings {
  return {
    multiCurrency: {
      enabled: false,
      displayCurrencies: [],
      exchangeRates: {},
      exchangeRateSource: 'manual',
      exchangeRateApiKey: '',
    },
    ...data,
  } as unknown as ITenantSettings;
}

export const useMultiCurrencySettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setLoading(true);
      setMessage(null);

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        setSettings(mergeDefaultSettings(reshapeMultiCurrency(data.data)));
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load settings' });
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching settings:', error);
        setMessage({
          type: 'error',
          text: 'Failed to load settings. Please check your connection.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  const updateSetting = useCallback((path: string, value: unknown) => {
    setSettings((prevSettings) => {
      if (!prevSettings) return prevSettings;

      const keys = path.split('.');
      const newSettings = JSON.parse(JSON.stringify(prevSettings));
      let current: Record<string, unknown> = newSettings;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }

      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
  }, []);

  const saveSettings = useCallback(
    async (settingsToSave: ITenantSettings) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        abortControllerRef.current = controller;

        setSaving(true);
        setMessage(null);

        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ settings: settingsToSave }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
          const reshaped = mergeDefaultSettings(reshapeMultiCurrency(data.data));
          setSettings(reshaped);
          return { success: true, data: reshaped };
        } else {
          const errorMessage =
            res.status === 401 || res.status === 403
              ? 'Unauthorized. Please login with admin account.'
              : data.error || 'Failed to save settings';
          setMessage({ type: 'error', text: errorMessage });
          return { success: false, error: errorMessage };
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error saving settings:', error);
          const errorText = 'Failed to save settings. Please check your connection.';
          setMessage({ type: 'error', text: errorText });
          return { success: false, error: errorText };
        }
        return { success: false, error: 'Request cancelled' };
      } finally {
        setSaving(false);
      }
    },
    [tenant]
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    settings,
    loading,
    saving,
    message,
    setMessage,
    fetchSettings,
    updateSetting,
    saveSettings,
  };
};
