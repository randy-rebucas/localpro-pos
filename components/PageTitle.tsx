'use client';

import { useEffect } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

/**
 * Component to set page title based on tenant settings
 */
export default function PageTitle() {
  const { settings } = useTenantSettings();
  
  useEffect(() => {
    if (settings?.companyName) {
      document.title = `${settings.companyName} - POS System`;
    } else {
      document.title = 'POS System - Point of Sale';
    }
  }, [settings?.companyName]);

  return null;
}

