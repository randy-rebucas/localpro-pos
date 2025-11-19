'use client';

import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency as formatCurrencyUtil } from '@/lib/currency';
import { getDefaultTenantSettings } from '@/lib/currency';

interface CurrencyProps {
  amount: number;
  className?: string;
}

/**
 * Component to display currency formatted according to tenant settings
 */
export default function Currency({ amount, className = '' }: CurrencyProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const formatted = formatCurrencyUtil(amount, tenantSettings);

  return <span className={className}>{formatted}</span>;
}

