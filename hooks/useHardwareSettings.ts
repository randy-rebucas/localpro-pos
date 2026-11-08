'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import type { HardwareConfig } from '@/lib/hardware';
import { useMessages } from '@/hooks/useMessages';

export type HardwareSaveResult =
  | { success: true }
  | { success: false; reason: 'forbidden' | 'server' | 'network' | 'timeout' | 'cancelled'; error?: string };

/**
 * The tenant's saved hardware setup plus a working copy the page edits. Saving sends
 * only `hardwareConfig`, and the copy kept in this browser's localStorage (which the
 * register reads first) is what was saved.
 */
export const useHardwareSettings = (tenant: string) => {
  const t = useMessages();
  const { ensureSettings, applySettings } = useTenantSettings();
  const [saved, setSaved] = useState<HardwareConfig | null>(null);
  const [draft, setDraft] = useState<HardwareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Seeded from TenantSettingsContext (already loaded by the layout).
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await ensureSettings();
    if (result.error || !result.settings) {
      setLoadError(result.error || t('admin.unableToLoadSettings', 'Unable to load settings'));
    } else {
      const config = ((result.settings as ITenantSettings).hardwareConfig || {}) as HardwareConfig;
      setSaved(config);
      setDraft(config);
    }
    setLoading(false);
  }, [ensureSettings, t]);

  const saveSettings = useCallback(async (): Promise<HardwareSaveResult> => {
    if (!draft) return { success: false, reason: 'cancelled' };
    const controller = new AbortController();
    // A timeout is reported to the user; an abort from leaving the page is not
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    abortControllerRef.current = controller;
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: { hardwareConfig: draft } }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) return { success: false, reason: 'forbidden' };
        return { success: false, reason: 'server', error: data.error };
      }

      applySettings(data.data);
      setSaved(draft);
      // The register reads this browser's copy first, so keep it to what was just saved.
      try {
        localStorage.setItem(`hardware_config_${tenant}`, JSON.stringify(draft));
      } catch {
        // Storage can be blocked (private mode); the tenant record still has it.
      }
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return { success: false, reason: timedOut ? 'timeout' : 'cancelled' };
      return { success: false, reason: 'network' };
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  }, [tenant, draft, applySettings]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  return {
    saved,
    draft,
    setDraft,
    dirty,
    loading,
    saving,
    loadError,
    fetchSettings,
    saveSettings,
    discard: () => setDraft(saved),
  };
};
