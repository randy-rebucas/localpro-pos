'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { pickChangedSettings, useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useMessages } from '@/hooks/useMessages';

export interface MultiCurrencySettings {
  enabled: boolean;
  displayCurrencies: string[];
  exchangeRates: Record<string, number>;
  exchangeRateSource: 'manual' | 'api';
  exchangeRateApiKey: string;
  lastUpdated?: Date;
}

export const useMultiCurrencySettings = (tenant: string) => {
  const t = useMessages();
  const { settings: contextSettings, ensureSettings, applySettings } = useTenantSettings();
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Seeded from TenantSettingsContext (already loaded by the layout) instead of
  // a separate GET /api/tenants/[slug]/settings.
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const result = await ensureSettings();
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      const defaultSettings = {
        multiCurrency: {
          enabled: false,
          displayCurrencies: [],
          exchangeRates: {},
          exchangeRateSource: 'manual',
          exchangeRateApiKey: '',
        },
        ...(result.settings as ITenantSettings),
      } as ITenantSettings;
      setSettings(defaultSettings);
    }
    setLoading(false);
  }, [ensureSettings]);

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
          // Only the keys this page changed (the route merges server-side)
          body: JSON.stringify({ settings: pickChangedSettings(settingsToSave, contextSettings) }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
          setSettings(data.data);
          applySettings(data.data);
          return { success: true, data: data.data };
        } else {
          const errorMessage =
            res.status === 401 || res.status === 403
              ? t('admin.settingsForbidden', 'You do not have permission to change these settings.')
              : data.error || t('admin.failedToSaveSettings', 'Failed to save settings');
          setMessage({ type: 'error', text: errorMessage });
          return { success: false, error: errorMessage };
        }
      } catch (error: unknown) {
        // A timeout aborts too (the controller fires after 20s); only an
        // unmount abort is silent.
        const timedOut = error instanceof Error && error.name === 'AbortError' && !unmountedRef.current;
        if (timedOut || (error instanceof Error && error.name !== 'AbortError')) {
          console.error('Error saving settings:', error);
          const errorText = timedOut
            ? t('common.requestTimedOut', 'The request timed out. Please try again.')
            : t('admin.saveSettingsConnection', 'Failed to save settings. Please check your connection.');
          setMessage({ type: 'error', text: errorText });
          return { success: false, error: errorText };
        }
        return { success: false, error: '' };
      } finally {
        setSaving(false);
      }
    },
    [tenant, contextSettings, applySettings, t]
  );

  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
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
