'use client';

import { useCallback } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

/**
 * Reads tenant settings from TenantSettingsContext (already loaded by the
 * layout). The HolidaysManager loads its own data from a dedicated endpoint, so
 * this no longer issues a separate GET /api/tenants/[slug]/settings — the
 * settings object only gates rendering and is passed through.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useHolidaysSettings = (tenant: string) => {
  const { settings, loading, applySettings } = useTenantSettings();

  // Kept for API compatibility — settings come from context, nothing to fetch.
  const fetchSettings = useCallback(async () => {}, []);

  // Local merge only (the manager persists through its own endpoint).
  const updateSettings = useCallback((updates: Partial<ITenantSettings>) => {
    applySettings(updates);
  }, [applySettings]);

  return {
    settings,
    loading,
    fetchSettings,
    updateSettings,
  };
};
