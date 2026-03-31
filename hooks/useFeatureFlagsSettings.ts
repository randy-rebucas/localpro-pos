'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/models/Tenant';

export interface FeatureFlagsMessage {
  type: 'success' | 'error';
  text: string;
}

export const useFeatureFlagsSettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FeatureFlagsMessage | null>(null);
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
          enableInventory: true,
          enableCategories: true,
          enableDiscounts: false,
          enableLoyaltyProgram: false,
          enableCustomerManagement: false,
          enableBookingScheduling: false,
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

  const updateSetting = useCallback((path: string, value: any) => {
    setSettings((prevSettings) => {
      if (!prevSettings) return prevSettings;

      const keys = path.split('.');
      const newSettings = JSON.parse(JSON.stringify(prevSettings));
      let current: any = newSettings;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
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
          setSettings(data.data);
          return { success: true, data: data.data };
        } else {
          const errorMessage =
            res.status === 401 || res.status === 403
              ? 'Unauthorized. Please login with admin account.'
              : data.error || 'Failed to save feature flags';
          setMessage({ type: 'error', text: errorMessage });
          return { success: false, error: errorMessage };
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error saving settings:', error);
          const errorText = 'Failed to save feature flags. Please check your connection.';
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
