'use client';

import { useState, useCallback } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export function useNotificationSettings(tenant: string) {
  const { ensureSettings, applySettings } = useTenantSettings();
  const [expectedStartTime, setExpectedStartTime] = useState('09:00');
  const [maxHours, setMaxHours] = useState('12');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Seeded from TenantSettingsContext (already loaded by the layout) instead of
  // a separate GET /api/tenants/[slug]/settings.
  const loadDefaultSettings = useCallback(async (): Promise<boolean> => {
    const result = await ensureSettings();
    if (result.error) {
      console.error('Error loading settings:', result.error);
      setSettingsError(result.error);
      // Continue with defaults if loading fails
      return false;
    }
    const attSettings = result.settings?.attendanceNotifications;
    if (attSettings) {
      if (attSettings.expectedStartTime) {
        setExpectedStartTime(attSettings.expectedStartTime);
      }
      if (attSettings.maxHoursWithoutClockOut) {
        setMaxHours(String(attSettings.maxHoursWithoutClockOut));
      }
    }
    setSettingsError(null);
    return true;
  }, [ensureSettings]);

  const saveDefaultSettings = useCallback(
    async (onSuccess?: () => void, onError?: (msg: string) => void): Promise<boolean> => {
      setSavingSettings(true);
      setSettingsError(null);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            settings: {
              attendanceNotifications: {
                enabled: true,
                expectedStartTime,
                maxHoursWithoutClockOut: parseFloat(maxHours),
              },
            },
          }),
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Failed to save settings: ${errorText}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to save settings');
        }
        applySettings(data.data);

        onSuccess?.();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings';
        setSettingsError(message);
        onError?.(message);
        return false;
      } finally {
        setSavingSettings(false);
      }
    },
    [tenant, expectedStartTime, maxHours, applySettings]
  );

  return {
    expectedStartTime,
    setExpectedStartTime,
    maxHours,
    setMaxHours,
    savingSettings,
    settingsError,
    loadDefaultSettings,
    saveDefaultSettings,
  };
}
