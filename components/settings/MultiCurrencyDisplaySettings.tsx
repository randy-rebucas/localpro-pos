'use client';

import { useState } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ITenantSettings } from '@/types/tenant';
import Link from 'next/link';

interface MultiCurrencyDisplaySettingsProps {
  settings: ITenantSettings;
  tenant: string;
  lang: 'en' | 'es';
  onUpdate: (updates: Partial<ITenantSettings>) => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR'];

export default function MultiCurrencyDisplaySettings({ settings, tenant, lang, onUpdate, dict }: MultiCurrencyDisplaySettingsProps) {
  const multiCurrency = settings.multiCurrency || { enabled: false, displayCurrencies: [], exchangeRates: {}, exchangeRateSource: 'manual' };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-brand-soft border border-teal-200 rounded">
        <p className="text-sm text-brand-navy mb-2">
          <strong>Note:</strong> {dict?.admin?.multiCurrencyNote || 'Exchange rate management has been moved to Admin → Multi-Currency for better access control.'}
        </p>
        <Link
          href={`/${tenant}/${lang}/admin/multi-currency`}
          className="text-sm text-brand hover:text-brand-hover font-medium underline"
        >
          {dict?.admin?.manageExchangeRates || 'Manage Exchange Rates →'}
        </Link>
      </div>

      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={multiCurrency.enabled || false}
            onChange={(e) => {
              onUpdate({
                multiCurrency: {
                  ...multiCurrency,
                  enabled: e.target.checked,
                },
              });
            }}
            className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
          />
          <span className="text-sm font-medium text-gray-700">{dict?.admin?.enableMultiCurrencyDisplay || 'Enable Multi-Currency Display'}</span>
        </label>
        <p className="mt-1 text-xs text-gray-500">{dict?.admin?.displayPricesInMultipleCurrencies || 'Display prices in multiple currencies'}</p>
      </div>

      {multiCurrency.enabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {dict?.admin?.displayCurrencies || 'Display Currencies'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {COMMON_CURRENCIES.map((currency) => (
              <label key={currency} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={multiCurrency.displayCurrencies?.includes(currency) || false}
                  onChange={(e) => {
                    const current = multiCurrency.displayCurrencies || [];
                    const updated = e.target.checked
                      ? [...current, currency]
                      : current.filter((c) => c !== currency);
                    onUpdate({
                      multiCurrency: {
                        ...multiCurrency,
                        displayCurrencies: updated,
                      },
                    });
                  }}
                  className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                />
                <span className="text-sm text-gray-700">{currency}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
