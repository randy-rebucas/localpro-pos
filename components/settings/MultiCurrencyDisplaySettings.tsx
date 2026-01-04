'use client';

import { ITenantSettings } from '@/models/Tenant';
import Link from 'next/link';

interface MultiCurrencyDisplaySettingsProps {
  settings: ITenantSettings;
  tenant: string;
  lang: 'en' | 'es';
  onUpdate: (updates: Partial<ITenantSettings>) => void;
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR'];

export default function MultiCurrencyDisplaySettings({ settings, tenant, lang, onUpdate }: MultiCurrencyDisplaySettingsProps) {
  const multiCurrency = settings.multiCurrency || { enabled: false, displayCurrencies: [], exchangeRates: {}, exchangeRateSource: 'manual' };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800 mb-2">
          <strong>Note:</strong> Exchange rate management has been moved to Admin → Multi-Currency for better access control.
        </p>
        <Link
          href={`/${tenant}/${lang}/admin/multi-currency`}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium underline"
        >
          Manage Exchange Rates →
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
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Enable Multi-Currency Display</span>
        </label>
        <p className="mt-1 text-xs text-gray-500">Display prices in multiple currencies</p>
      </div>

      {multiCurrency.enabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Display Currencies
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
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
