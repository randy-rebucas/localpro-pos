import { useState, useCallback } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { pickChangedSettings, useTenantSettings } from '@/contexts/TenantSettingsContext';

/** Why a save failed, so the page can word it in the viewer's language. */
export type BrandingSaveError =
  | { kind: 'forbidden' }
  | { kind: 'server'; message?: string }
  | { kind: 'network' };

export function useBrandingSave(tenant: string) {
  const { settings: contextSettings, applySettings } = useTenantSettings();
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (settings: ITenantSettings): Promise<{ ok: true } | { ok: false; error: BrandingSaveError }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      setSaving(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        // Only the keys this page changed (the route merges server-side)
        body: JSON.stringify({ settings: pickChangedSettings(settings, contextSettings) }),
      });

      if (res.status === 401 || res.status === 403) return { ok: false, error: { kind: 'forbidden' } };
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        // Keep the shared context (and the branding it applies) in sync
        applySettings(data.data);
        return { ok: true };
      }
      return { ok: false, error: { kind: 'server', message: data?.error } };
    } catch {
      return { ok: false, error: { kind: 'network' } };
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  }, [tenant, contextSettings, applySettings]);

  return { saving, save };
}
