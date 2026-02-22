'use client';

import { useState, useEffect } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ITenantSettings } from '@/models/Tenant';

interface MultiCurrencySettingsProps {
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR'];

export default function MultiCurrencySettings({ settings, tenant, onUpdate }: MultiCurrencySettingsProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const multiCurrency = settings.multiCurrency || { enabled: false, displayCurrencies: [], exchangeRates: {}, exchangeRateSource: 'manual' };

  const fetchExchangeRates = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/exchange-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'fetch' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Exchange rates updated successfully' });
        onUpdate({
          multiCurrency: {
            ...multiCurrency,
            exchangeRates: data.data.exchangeRates,
            lastUpdated: new Date(data.data.lastUpdated),
          },
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch exchange rates' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || 'Failed to fetch exchange rates' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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
        <>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exchange Rate Source
            </label>
            <select
              value={multiCurrency.exchangeRateSource || 'manual'}
              onChange={(e) => {
                onUpdate({
                  multiCurrency: {
                    ...multiCurrency,
                    exchangeRateSource: e.target.value as 'manual' | 'api',
                  },
                });
              }}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="manual">Manual Entry</option>
              <option value="api">Automatic (API)</option>
            </select>
          </div>

          {multiCurrency.exchangeRateSource === 'api' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exchange Rate API Key (Optional)
              </label>
              <input
                type="text"
                value={multiCurrency.exchangeRateApiKey || ''}
                onChange={(e) => {
                  onUpdate({
                    multiCurrency: {
                      ...multiCurrency,
                      exchangeRateApiKey: e.target.value,
                    },
                  });
                }}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="API key for exchange rate service"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to use free tier (exchangerate-api.com)
              </p>
            </div>
          )}

          {multiCurrency.displayCurrencies && multiCurrency.displayCurrencies.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Exchange Rates
                </label>
                <button
                  type="button"
                  onClick={fetchExchangeRates}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Fetching...' : 'Fetch Latest Rates'}
                </button>
              </div>
              {multiCurrency.lastUpdated && (
                <p className="text-xs text-gray-500 mb-2">
                  Last updated: {new Date(multiCurrency.lastUpdated).toLocaleString()}
                </p>
              )}
              <div className="space-y-2">
                {multiCurrency.displayCurrencies.map((currency) => {
                  const rate = multiCurrency.exchangeRates?.[currency];
                  return (
                    <div key={currency} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm font-medium">{currency}</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={rate || ''}
                        onChange={(e) => {
                          const newRates = {
                            ...(multiCurrency.exchangeRates || {}),
                            [currency]: parseFloat(e.target.value) || 0,
                          };
                          onUpdate({
                            multiCurrency: {
                              ...multiCurrency,
                              exchangeRates: newRates,
                            },
                          });
                        }}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Rate"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && (
            <div
              className={`p-3 rounded ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
