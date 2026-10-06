'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getFetchErrorMessage, isAbortError } from '@/lib/fetch-error';

export interface LoyaltyConfig {
  pointsPerPeso: number;
  pesoPerPoint: number;
  minRedemption: number;
  isEnabled: boolean;
}

export const useLoyaltyConfig = () => {
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [configForm, setConfigForm] = useState<LoyaltyConfig>({
    pointsPerPeso: 1,
    pesoPerPoint: 0.1,
    minRedemption: 100,
    isEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  /** Set when loading the config failed — the form must not be saved over unknown values. */
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setLoading(true);

      const res = await fetch('/api/loyalty/config', {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json();

      if (json.success) {
        setConfig(json.data);
        setConfigForm(json.data);
        setDirty(false);
        setError(null);
      } else {
        setError(json.error || 'Failed to load configuration');
      }
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        console.error('Error fetching config:', err);
      }
      setError(getFetchErrorMessage(err, 'Failed to load configuration'));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfigForm = useCallback((patch: Partial<LoyaltyConfig>) => {
    setConfigForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  }, []);

  const saveConfig = useCallback(async (formData: LoyaltyConfig) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setSaving(true);

      const res = await fetch('/api/loyalty/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json();

      if (json.success) {
        setConfig(json.data);
        setConfigForm(json.data);
        setDirty(false);
        return { success: true, data: json.data };
      } else {
        return { success: false, error: json.error || 'Failed to save config' };
      }
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        console.error('Error saving config:', err);
      }
      return { success: false, error: getFetchErrorMessage(err, 'Failed to save config') };
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    config,
    configForm,
    loading,
    error,
    saving,
    dirty,
    fetchConfig,
    updateConfigForm,
    saveConfig,
  };
};
