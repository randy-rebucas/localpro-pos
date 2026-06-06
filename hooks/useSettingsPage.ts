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
    timezone: 'UTC',
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

export function useSettingsPage(tenant: string) {
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

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        setSettings(mergeDefaultSettings(data.data));
        setStatus('ready');
      } else {
        setSettings(null);
        setError(data.error || 'Failed to load settings');
        setStatus('error');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setSettings(null);
      setError('Failed to load settings');
      setStatus('error');
    }
  }, [tenant]);

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
