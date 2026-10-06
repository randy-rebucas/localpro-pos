'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { isEmptyHardwareConfig, readLocalHardwareConfig, resolveHardwareConfig } from '@/lib/hardware-helpers';

export interface HardwareSettingsMessage {
  type: 'success' | 'error';
  text: string;
}

export const useHardwareSettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<HardwareSettingsMessage | null>(null);
  /** True when the form was pre-filled from this browser's cache and isn't saved server-side yet. */
  const [importedFromDevice, setImportedFromDevice] = useState(false);
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
        // Before hardware config was persisted server-side it lived only in each
        // browser's cache. If the tenant has nothing saved yet but this browser
        // does, pre-fill the form from it so one Save shares it with every terminal.
        const serverConfig = data.data?.hardwareConfig;
        const localConfig = readLocalHardwareConfig(tenant);
        const importLocal = isEmptyHardwareConfig(serverConfig) && !isEmptyHardwareConfig(localConfig);
        setSettings({
          ...data.data,
          hardwareConfig: importLocal ? localConfig! : resolveHardwareConfig(serverConfig, localConfig),
        });
        setImportedFromDevice(importLocal);
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

        // Send only the key this page owns: the PUT persists every submitted
        // key, so echoing the whole (possibly stale) settings object back
        // would clobber concurrent edits made on other settings pages.
        const hardwareConfig = settingsToSave.hardwareConfig ?? {};
        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ settings: { hardwareConfig } }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
          // The PUT responds with the raw flat settings row (no `hardwareConfig`),
          // so keep the config we just saved rather than replacing state with it.
          setSettings((prev) => (prev ? { ...prev, hardwareConfig } : prev));
          setImportedFromDevice(false);

          // Sync to localStorage so the POS page picks up the new config immediately
          localStorage.setItem(`hardware_config_${tenant}`, JSON.stringify(hardwareConfig));

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
    importedFromDevice,
    fetchSettings,
    updateHardwareConfig,
    saveSettings,
  };
};
