'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ITenantSettings } from '@/types/tenant';
import type { BusinessTypeConfig } from '@/lib/business-types';

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
    pricesIncludeTax: false,
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

export function useSettingsPage(tenant: string) {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  // Last server-confirmed state; saves send only the keys that differ from it.
  const [baseline, setBaseline] = useState<ITenantSettings | null>(null);
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

  // Fetched fresh rather than seeded from TenantSettingsContext: the context
  // copy is loaded once per session (so it can be stale after edits on other
  // pages or by other users) and has secrets stripped (birEsalesPushUrl,
  // exchangeRateApiKey), which this page edits.
  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.data) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const loaded = mergeDefaultSettings(data.data);
      setSettings(loaded);
      setBaseline(loaded);
      setStatus('ready');
    } catch (err) {
      setSettings(null);
      setBaseline(null);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      setStatus('error');
    }
  }, [tenant]);

  /** Record a successful save: the server's copy becomes both the form state and the baseline. */
  const commitSaved = useCallback((saved: Partial<ITenantSettings>) => {
    const next = mergeDefaultSettings(saved);
    setSettings(next);
    setBaseline(next);
  }, []);

  useEffect(() => {
    refetch();
    refetchBusinessTypes();
  }, [refetch, refetchBusinessTypes]);

  return {
    settings,
    setSettings,
    baseline,
    commitSaved,
    status,
    error,
    refetch,
    businessTypes,
    businessTypesStatus,
    refetchBusinessTypes,
  };
}
