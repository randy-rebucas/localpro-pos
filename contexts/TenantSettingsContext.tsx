'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useParams } from 'next/navigation';
import { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';

export interface UpdateTenantSettingsResult {
  success: boolean;
  data?: ITenantSettings;
  error?: string;
  status?: number;
}

export interface EnsureTenantSettingsResult {
  settings: ITenantSettings | null;
  error: string | null;
}

interface TenantSettingsContextType {
  settings: ITenantSettings | null;
  loading: boolean;
  /** Message from the last failed load (settings fall back to defaults when set). */
  error: string | null;
  /** Re-fetch settings from GET /api/tenants/[slug]/settings. */
  refreshSettings: () => Promise<void>;
  /**
   * PUT only the provided keys to /api/tenants/[slug]/settings (the route merges
   * server-side and skips unchanged keys), then merge the response into context.
   */
  updateSettings: (partial: Partial<ITenantSettings>) => Promise<UpdateTenantSettingsResult>;
  /**
   * Merge already-persisted values into context without a network call — for
   * callers that do their own PUT (or save through a dedicated endpoint).
   */
  applySettings: (partial: Partial<ITenantSettings> | null | undefined) => void;
  /**
   * Resolve once the current load finishes. If the last load failed, retries it
   * first. Lets hooks that keep an editable local copy seed it from context
   * instead of issuing their own GET.
   */
  ensureSettings: () => Promise<EnsureTenantSettingsResult>;
}

const TenantSettingsContext = createContext<TenantSettingsContextType | undefined>(undefined);

/**
 * Top-level keys of `next` whose value differs from `base` — so a page that edits
 * a full local copy of the settings can PUT only what it actually changed.
 */
export function pickChangedSettings(
  next: Partial<ITenantSettings>,
  base: Partial<ITenantSettings> | null | undefined
): Partial<ITenantSettings> {
  if (!base) return next;
  const nextRecord = next as Record<string, unknown>;
  const baseRecord = base as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(nextRecord)) {
    if (JSON.stringify(nextRecord[key]) !== JSON.stringify(baseRecord[key])) {
      changed[key] = nextRecord[key];
    }
  }
  return changed as Partial<ITenantSettings>;
}

function withDefaults(data: Partial<ITenantSettings> | null | undefined): ITenantSettings {
  return { ...getDefaultTenantSettings(), ...(data || {}) } as ITenantSettings;
}

interface TenantSettingsProviderProps {
  children: ReactNode;
  /**
   * Settings already loaded on the server (must be JSON-serializable). When
   * provided, the provider skips its initial GET for that tenant.
   */
  initialSettings?: Partial<ITenantSettings> | null;
}

export function TenantSettingsProvider({ children, initialSettings }: TenantSettingsProviderProps) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const hasInitial = initialSettings != null;
  const [settings, setSettings] = useState<ITenantSettings | null>(() =>
    hasInitial ? withDefaults(initialSettings) : null
  );
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState<string | null>(null);

  // Tenant the server-provided settings belong to; the mount fetch is skipped for it.
  const seededTenantRef = useRef<string | null>(hasInitial ? tenant : null);
  const stateRef = useRef({ settings, loading, error });
  const waitersRef = useRef<Array<(result: EnsureTenantSettingsResult) => void>>([]);

  useEffect(() => {
    stateRef.current = { settings, loading, error };
    if (!loading && waitersRef.current.length > 0) {
      const waiters = waitersRef.current;
      waitersRef.current = [];
      waiters.forEach((resolve) => resolve({ settings, error }));
    }
  }, [settings, loading, error]);

  const fetchSettings = useCallback(async () => {
    stateRef.current = { ...stateRef.current, loading: true };
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();

      if (data.success) {
        // Merge with defaults to ensure all fields exist
        setSettings(withDefaults(data.data));
        setError(null);
      } else {
        // Use defaults if fetch fails
        setSettings(withDefaults(null));
        setError(data.error || 'Failed to load settings');
      }
    } catch (err) {
      console.error('Error fetching tenant settings:', err);
      // Use defaults on error
      setSettings(withDefaults(null));
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (seededTenantRef.current === tenant) return;
    seededTenantRef.current = null;
    fetchSettings();
  }, [tenant, fetchSettings]);

  const applySettings = useCallback((partial: Partial<ITenantSettings> | null | undefined) => {
    if (!partial) return;
    setSettings((prev) => ({ ...(prev || getDefaultTenantSettings()), ...partial } as ITenantSettings));
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<ITenantSettings>): Promise<UpdateTenantSettingsResult> => {
      try {
        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ settings: partial }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          applySettings({ ...partial, ...(data.data || {}) });
          return { success: true, data: data.data, status: res.status };
        }
        return { success: false, error: data.error || `HTTP ${res.status}`, status: res.status };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update settings' };
      }
    },
    [tenant, applySettings]
  );

  const ensureSettings = useCallback(async (): Promise<EnsureTenantSettingsResult> => {
    const current = stateRef.current;
    if (!current.loading && !current.error) {
      return { settings: current.settings, error: null };
    }
    const pending = new Promise<EnsureTenantSettingsResult>((resolve) => {
      waitersRef.current.push(resolve);
    });
    if (!current.loading && current.error) {
      void fetchSettings();
    }
    return pending;
  }, [fetchSettings]);

  // Apply primary color to CSS variables
  useEffect(() => {
    if (settings?.primaryColor) {
      document.documentElement.style.setProperty('--primary-color', settings.primaryColor);

      // Generate lighter/darker variants
      const hex = settings.primaryColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);

      // Light variant (for hover states)
      const lightR = Math.min(255, r + 20);
      const lightG = Math.min(255, g + 20);
      const lightB = Math.min(255, b + 20);
      document.documentElement.style.setProperty(
        '--primary-color-light',
        `rgb(${lightR}, ${lightG}, ${lightB})`
      );

      // Dark variant
      const darkR = Math.max(0, r - 20);
      const darkG = Math.max(0, g - 20);
      const darkB = Math.max(0, b - 20);
      document.documentElement.style.setProperty(
        '--primary-color-dark',
        `rgb(${darkR}, ${darkG}, ${darkB})`
      );
    }
  }, [settings?.primaryColor]);

  // Apply Advanced Branding — font + custom CSS. `theme` and `borderRadius`
  // are intentionally not applied here: this app has no dark-mode styling
  // and enforces sharp (non-rounded) corners everywhere as its design system,
  // so wiring those up would mean building dark-mode from scratch / fighting
  // the flat-design mandate rather than a straightforward "make it work" fix.
  // Custom CSS remains the tenant's escape hatch for that kind of override.
  useEffect(() => {
    const branding = settings?.advancedBranding;

    // Font family + source
    const googleLinkId = 'tenant-google-font';
    const customFontStyleId = 'tenant-custom-font';
    document.getElementById(googleLinkId)?.remove();
    document.getElementById(customFontStyleId)?.remove();

    if (branding?.fontSource === 'google' && branding.googleFontUrl) {
      const link = document.createElement('link');
      link.id = googleLinkId;
      link.rel = 'stylesheet';
      link.href = branding.googleFontUrl;
      document.head.appendChild(link);
    } else if (branding?.fontSource === 'custom' && branding.customFontUrl && branding.fontFamily) {
      const style = document.createElement('style');
      style.id = customFontStyleId;
      style.textContent = `@font-face { font-family: '${branding.fontFamily}'; src: url('${branding.customFontUrl}'); font-display: swap; }`;
      document.head.appendChild(style);
    }

    if (branding?.fontFamily) {
      document.documentElement.style.setProperty('--tenant-font-family', `'${branding.fontFamily}'`);
    } else {
      document.documentElement.style.removeProperty('--tenant-font-family');
    }

    // Custom CSS
    const customCssStyleId = 'tenant-custom-css';
    document.getElementById(customCssStyleId)?.remove();
    if (branding?.customTheme?.css) {
      const style = document.createElement('style');
      style.id = customCssStyleId;
      style.textContent = branding.customTheme.css;
      document.head.appendChild(style);
    }
  }, [settings?.advancedBranding]);

  const value = useMemo<TenantSettingsContextType>(
    () => ({
      settings,
      loading,
      error,
      refreshSettings: fetchSettings,
      updateSettings,
      applySettings,
      ensureSettings,
    }),
    [settings, loading, error, fetchSettings, updateSettings, applySettings, ensureSettings]
  );

  return (
    <TenantSettingsContext.Provider value={value}>
      {children}
    </TenantSettingsContext.Provider>
  );
}

export function useTenantSettings() {
  const context = useContext(TenantSettingsContext);
  if (context === undefined) {
    throw new Error('useTenantSettings must be used within a TenantSettingsProvider');
  }
  return context;
}
