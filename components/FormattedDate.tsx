'use client';

import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatDate, formatTime, formatDateTime } from '@/lib/formatting'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getDefaultTenantSettings } from '@/lib/currency';

interface FormattedDateProps {
  date: Date | string;
  includeTime?: boolean;
  className?: string;
}

/**
 * Component to display date/time formatted according to tenant settings
 */
export default function FormattedDate({ date, includeTime = false, className = '' }: FormattedDateProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  
  const formatted = includeTime 
    ? formatDateTime(date, tenantSettings)
    : formatDate(date, tenantSettings);

  return <span className={className}>{formatted}</span>;
}

