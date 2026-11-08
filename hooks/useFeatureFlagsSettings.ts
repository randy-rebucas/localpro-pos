'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { pickChangedSettings, useTenantSettings } from '@/contexts/TenantSettingsContext';

export type FeatureFlagsSaveResult =
  | { success: true; data: ITenantSettings }
  | { success: false; status?: number; error?: string; network?: boolean; cancelled?: boolean };

export const useFeatureFlagsSettings = (tenant: string) => {
  const { settings: contextSettings, ensureSettings, applySettings } = useTenantSettings();
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Seeded from TenantSettingsContext (already loaded by the layout) instead of
  // a separate GET /api/tenants/[slug]/settings.
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await ensureSettings();
    if (result.error) {
      setLoadError(result.error);
    } else {
      setSettings(result.settings as ITenantSettings);
    }
    setLoading(false);
  }, [ensureSettings]);

  const updateSetting = useCallback((key: keyof ITenantSettings, value: unknown) => {
    setSettings((prev) => (prev ? ({ ...prev, [key]: value } as ITenantSettings) : prev));
  }, []);

  const saveSettings = useCallback(
    async (settingsToSave: ITenantSettings): Promise<FeatureFlagsSaveResult> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;
      setSaving(true);
      try {
        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          // Only the keys this page changed (the route merges server-side)
          body: JSON.stringify({ settings: pickChangedSettings(settingsToSave, contextSettings) }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setSettings(data.data);
          applySettings(data.data);
          return { success: true, data: data.data };
        }
        return { success: false, status: res.status, error: data.error };
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return { success: false, cancelled: true };
        console.error('Error saving feature flags:', error);
        return { success: false, network: true };
      } finally {
        clearTimeout(timeoutId);
        setSaving(false);
      }
    },
    [tenant, contextSettings, applySettings]
  );

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return { settings, loading, saving, loadError, fetchSettings, updateSetting, saveSettings };
};
