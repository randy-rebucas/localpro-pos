'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { FEATURE_FLAGS } from '@/lib/feature-flags-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

export interface FeatureFlagsMessage {
  type: 'success' | 'error';
  text: string;
}

type FlagMap = Record<string, boolean>;

// Several flag columns are nullable (`Boolean?` in prisma/schema.prisma) and a
// null/missing value means "follow the business type". Resolve them the same
// way supportsFeature() in lib/business-type-helpers.ts does, so the toggles
// show what the rest of the app actually does.
function resolveFlags(data: Record<string, unknown>): { settings: ITenantSettings; flags: FlagMap } {
  const defaults = getBusinessTypeConfig(getBusinessType(data as unknown as ITenantSettings)).defaultFeatures as FlagMap;
  const flags: FlagMap = {};
  for (const key of FEATURE_FLAGS) {
    const value = data[key];
    flags[key] = typeof value === 'boolean' ? value : defaults[key] ?? false;
  }
  return { settings: { ...data, ...flags } as unknown as ITenantSettings, flags };
}

export const useFeatureFlagsSettings = (tenant: string) => {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FeatureFlagsMessage | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Resolved values as last loaded/saved — save sends only what differs, so an
  // untouched null flag keeps following the business type instead of being pinned.
  const loadedFlagsRef = useRef<FlagMap>({});

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
        const { settings: resolved, flags } = resolveFlags(data.data || {});
        loadedFlagsRef.current = flags;
        setSettings(resolved);
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

        // Send only the flags the admin actually changed: the PUT checks
        // feature_flags.manage for these keys and settings.manage for anything
        // else, echoing the whole (possibly stale) object back would clobber
        // other pages, and re-sending unchanged resolved defaults would pin
        // null flags that should keep following the business type.
        const current = settingsToSave as unknown as Record<string, unknown>;
        const flags = Object.fromEntries(
          FEATURE_FLAGS.filter((key) => current[key] !== loadedFlagsRef.current[key]).map((key) => [key, current[key]])
        );
        if (Object.keys(flags).length === 0) {
          clearTimeout(timeoutId);
          return { success: true, data: settingsToSave };
        }

        setSaving(true);
        setMessage(null);

        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ settings: flags }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
          const { settings: resolved, flags: savedFlags } = resolveFlags(data.data || {});
          loadedFlagsRef.current = savedFlags;
          setSettings(resolved);
          return { success: true, data: resolved };
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
