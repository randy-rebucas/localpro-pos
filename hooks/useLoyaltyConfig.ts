'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

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
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching config:', error);
      }
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
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error saving config:', error);
        return { success: false, error: 'Failed to save config' };
      }
      return { success: false, error: 'Request cancelled' };
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
    saving,
    dirty,
    fetchConfig,
    updateConfigForm,
    saveConfig,
  };
};
