'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';

export const useNotificationTemplatesSettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setLoading(true);

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        setSettings(data.data);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching settings:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  const updateSettings = useCallback((updates: Partial<ITenantSettings>) => {
    setSettings((prevSettings) => {
      if (!prevSettings) return prevSettings;
      return { ...prevSettings, ...updates };
    });
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    settings,
    loading,
    fetchSettings,
    updateSettings,
  };
};
