'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';

export interface HardwareSettingsMessage {
  type: 'success' | 'error';
  text: string;
}

export const useHardwareSettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<HardwareSettingsMessage | null>(null);
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
        const defaultSettings: ITenantSettings = {
          hardwareConfig: {},
          ...data.data,
        };
        setSettings(defaultSettings);
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
          setSettings(data.data);

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
    updateHardwareConfig,
    saveSettings,
  };
};
