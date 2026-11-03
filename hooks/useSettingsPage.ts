'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ITenantSettings } from '@/types/tenant';
import type { BusinessTypeConfig } from '@/lib/business-types';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export type SettingsStatus = 'loading' | 'ready' | 'error';

function mergeDefaultSettings(data: Partial<ITenantSettings>): ITenantSettings {
  return {
    currency: 'USD',
    currencyPosition: 'before',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: 'Asia/Manila',
    language: 'en',
    numberFormat: {
      decimalSeparator: '.',
      thousandsSeparator: ',',
      decimalPlaces: 2,
    },
    primaryColor: '#35979c',
    receiptShowLogo: true,
    receiptShowAddress: true,
    receiptShowPhone: false,
    receiptShowEmail: false,
    taxEnabled: false,
    taxRate: 0,
    taxLabel: 'Tax',
    lowStockThreshold: 10,
    lowStockAlert: true,
    emailNotifications: false,
    smsNotifications: false,
    attendanceNotifications: {
      enabled: true,
      expectedStartTime: '09:00',
      maxHoursWithoutClockOut: 12,
    },
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: false,
    enableLoyaltyProgram: false,
    enableCustomerManagement: false,
    enableOnAccountSales: false,
    enableBookingScheduling: false,
    hardwareConfig: {},
    ...data,
  } as ITenantSettings;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useSettingsPage(tenant: string) {
  const { ensureSettings } = useTenantSettings();
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [status, setStatus] = useState<SettingsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeConfig[]>([]);
  const [businessTypesStatus, setBusinessTypesStatus] = useState<SettingsStatus>('loading');

  const refetchBusinessTypes = useCallback(async () => {
    setBusinessTypesStatus('loading');
    try {
      const res = await fetch('/api/business-types');
      const data = await res.json();
      if (data.success) {
        setBusinessTypes(data.data || []);
        setBusinessTypesStatus('ready');
      } else {
        setBusinessTypes([]);
        setBusinessTypesStatus('error');
      }
    } catch (err) {
      console.error('Failed to load business types:', err);
      setBusinessTypes([]);
      setBusinessTypesStatus('error');
    }
  }, []);

  // Seeded from TenantSettingsContext (already loaded by the layout) instead of
  // a separate GET /api/tenants/[slug]/settings. Retrying after a failed load
  // re-fetches through the context.
  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    const result = await ensureSettings();
    if (result.error || !result.settings) {
      setSettings(null);
      setError(result.error || 'Failed to load settings');
      setStatus('error');
    } else {
      setSettings(mergeDefaultSettings(result.settings));
      setStatus('ready');
    }
  }, [ensureSettings]);

  useEffect(() => {
    refetch();
    refetchBusinessTypes();
  }, [refetch, refetchBusinessTypes]);

  return {
    settings,
    setSettings,
    status,
    error,
    refetch,
    businessTypes,
    businessTypesStatus,
    refetchBusinessTypes,
  };
}
