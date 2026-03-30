'use client';

import { useState, useCallback } from 'react';

export function useNotificationSettings(tenant: string) {
  const [expectedStartTime, setExpectedStartTime] = useState('09:00');
  const [maxHours, setMaxHours] = useState('12');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const loadDefaultSettings = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to load settings: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.data.attendanceNotifications) {
        const attSettings = data.data.attendanceNotifications;
        if (attSettings.expectedStartTime) {
          setExpectedStartTime(attSettings.expectedStartTime);
        }
        if (attSettings.maxHoursWithoutClockOut) {
          setMaxHours(String(attSettings.maxHoursWithoutClockOut));
        }
      }
      setSettingsError(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      console.error('Error loading settings:', err);
      setSettingsError(message);
      // Continue with defaults if loading fails
      return false;
    }
  }, [tenant]);

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
    [tenant, expectedStartTime, maxHours]
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
