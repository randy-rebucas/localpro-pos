'use client';

import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency as formatCurrencyUtil } from '@/lib/currency';
import { getDefaultTenantSettings } from '@/lib/currency';
import { convertCurrency } from '@/lib/multi-currency';

interface CurrencyProps {
  amount: number;
  className?: string;
  /** When true, show secondary converted amounts for all enabled display currencies */
  showConverted?: boolean;
  /** CSS class applied to each converted amount line */
  convertedClassName?: string;
}

/**
 * Component to display currency formatted according to tenant settings.
 * Pass showConverted={true} on product prices / cart totals to render
 * converted equivalents beneath the base amount when multi-currency is enabled.
 */
export default function Currency({
  amount,
  className = '',
  showConverted = false,
  convertedClassName = '',
}: CurrencyProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const formatted = formatCurrencyUtil(amount, tenantSettings);

  const mc = settings?.multiCurrency;
  const showConversions =
    showConverted &&
    mc?.enabled &&
    mc.displayCurrencies &&
    mc.displayCurrencies.length > 0 &&
    mc.exchangeRates;

  return (
    <span className={className}>
      {formatted}
      {showConversions &&
        mc!.displayCurrencies!.map((currency) => {
          if (currency === tenantSettings.currency) return null;
          const converted = convertCurrency(
            amount,
            tenantSettings.currency || 'PHP',
            currency,
            mc!.exchangeRates as Record<string, number>,
            tenantSettings.currency || 'PHP'
          );
          if (converted === null) return null;
          return (
            <span
              key={currency}
              className={
                convertedClassName ||
                'block text-xs text-gray-500 font-normal leading-tight'
              }
            >
              {currency} {converted.toFixed(2)}
            </span>
          );
        })}
    </span>
  );
}
