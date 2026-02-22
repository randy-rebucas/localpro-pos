'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ITenantSettings } from '@/models/Tenant';
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

