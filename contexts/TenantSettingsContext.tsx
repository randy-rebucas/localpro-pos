'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';

interface TenantSettingsContextType {
  settings: ITenantSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const TenantSettingsContext = createContext<TenantSettingsContextType | undefined>(undefined);

export function TenantSettingsProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      
      if (data.success) {
        // Merge with defaults to ensure all fields exist
        const defaultSettings = getDefaultTenantSettings();
        setSettings({ ...defaultSettings, ...data.data });
      } else {
        // Use defaults if fetch fails
        setSettings(getDefaultTenantSettings());
      }
    } catch (error) {
      console.error('Error fetching tenant settings:', error);
      // Use defaults on error
      setSettings(getDefaultTenantSettings());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

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

  return (
    <TenantSettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings }}>
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

