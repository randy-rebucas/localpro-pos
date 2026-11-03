'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { pickChangedSettings, useTenantSettings } from '@/contexts/TenantSettingsContext';

export interface HardwareSettingsMessage {
  type: 'success' | 'error';
  text: string;
}

export const useHardwareSettings = (tenant: string) => {
  const { settings: contextSettings, ensureSettings, applySettings } = useTenantSettings();
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<HardwareSettingsMessage | null>(null);
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
      const defaultSettings: ITenantSettings = {
        hardwareConfig: {},
        ...(result.settings as ITenantSettings),
      };
      setSettings(defaultSettings);
    }
    setLoading(false);
  }, [ensureSettings]);

  const updateHardwareConfig = useCallback((hardwareConfig: ITenantSettings['hardwareConfig']) => {
    setSettings((prevSettings) => {
      if (!prevSettings) return prevSettings;
      return { ...prevSettings, hardwareConfig };
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

          // Sync to localStorage so the POS page picks up the new config immediately
          if (data.data?.hardwareConfig !== undefined) {
            localStorage.setItem(`hardware_config_${tenant}`, JSON.stringify(data.data.hardwareConfig));
          }

          return { success: true, data: data.data };
        } else {
          const errorMessage =
            res.status === 401 || res.status === 403
              ? 'Unauthorized. Please login with admin account.'
              : data.error || 'Failed to save hardware settings';
          setMessage({ type: 'error', text: errorMessage });
          return { success: false, error: errorMessage };
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error saving settings:', error);
          const errorText = 'Failed to save hardware settings. Please check your connection.';
          setMessage({ type: 'error', text: errorText });
          return { success: false, error: errorText };
        }
        return { success: false, error: 'Request cancelled' };
      } finally {
        setSaving(false);
      }
    },
    [tenant, contextSettings, applySettings]
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
    updateHardwareConfig,
    saveSettings,
  };
};
