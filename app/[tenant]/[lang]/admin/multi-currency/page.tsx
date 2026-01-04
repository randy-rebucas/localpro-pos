'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';

export default function MultiCurrencyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchingRates, setFetchingRates] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        const defaultSettings = {
          multiCurrency: {
            enabled: false,
            displayCurrencies: [],
            exchangeRates: {},
            exchangeRateSource: 'manual',
            exchangeRateApiKey: '',
          },
          ...data.data,
        };
        setSettings(defaultSettings);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load settings' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (path: string, value: unknown) => {
    if (!settings) return;
    
    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings));
    let current: Record<string, unknown> = newSettings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const fetchExchangeRates = async () => {
    if (!settings) return;
    setFetchingRates(true);
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
        setMessage({ type: 'success', text: (dict?.admin as Record<string, unknown>)?.exchangeRatesUpdated as string || 'Exchange rates updated successfully' });
        updateSetting('multiCurrency', {
          ...settings.multiCurrency,
          exchangeRates: data.data.exchangeRates,
          lastUpdated: new Date(data.data.lastUpdated),
        });
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.admin as Record<string, unknown>)?.failedToFetchRates as string || 'Failed to fetch exchange rates' });
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : (dict?.admin as Record<string, unknown>)?.failedToFetchRates as string || 'Failed to fetch exchange rates' }); 
    } finally {
      setFetchingRates(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: (dict?.admin as Record<string, unknown>)?.multiCurrencySaved as string || 'Multi-currency settings saved successfully!' });
        setSettings(data.data);
        setTimeout(() => setMessage(null), 3000);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: (dict?.settings as Record<string, unknown>)?.unauthorized as string || 'Unauthorized. Please login with admin account.' });
        } else {
          setMessage({ type: 'error', text: data.error || (dict?.admin as Record<string, unknown>)?.failedToSaveMultiCurrency as string || 'Failed to save settings' });
        }
      }
    } catch (error) {
      console.error('Error saving multi-currency settings:', error);
      setMessage({ type: 'error', text: (dict?.admin as Record<string, unknown>)?.failedToSaveMultiCurrencyConnection as string || 'Failed to save settings. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const multiCurrency = settings?.multiCurrency || {
    enabled: false,
    displayCurrencies: [],
    exchangeRates: {},
    exchangeRateSource: 'manual',
    exchangeRateApiKey: '',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="text-blue-600 hover:text-blue-700 font-medium mb-4 inline-flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {(dict?.common as Record<string, unknown>)?.back as string || 'Back'} to Admin
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {(dict?.admin as Record<string, unknown>)?.multiCurrency as string || 'Multi-Currency Management'}
          </h1>
          <p className="text-gray-600">
            {(dict?.admin as Record<string, unknown>)?.multiCurrencyDescription as string || 'Configure exchange rates and API settings for multi-currency support'}
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {(dict?.admin as Record<string, unknown>)?.exchangeRateSource as string || 'Exchange Rate Source'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {(dict?.admin as Record<string, unknown>)?.exchangeRateSource as string || 'Exchange Rate Source'}
                </label>
                <select
                  value={multiCurrency.exchangeRateSource || 'manual'}
                  onChange={(e) => {
                    updateSetting('multiCurrency.exchangeRateSource', e.target.value);
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="manual">{(dict?.admin as Record<string, unknown>)?.manualEntry as string || 'Manual Entry'}</option>
                  <option value="api">{(dict?.admin as Record<string, unknown>)?.automaticAPI as string || 'Automatic (API)'}</option>
                </select>
              </div>

              {multiCurrency.exchangeRateSource === 'api' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {(dict?.admin as Record<string, unknown>)?.exchangeRateApiKey as string || 'Exchange Rate API Key (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={multiCurrency.exchangeRateApiKey || ''}
                    onChange={(e) => {
                      updateSetting('multiCurrency.exchangeRateApiKey', e.target.value);
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    placeholder={(dict?.admin as Record<string, unknown>)?.apiKeyPlaceholder as string || 'API key for exchange rate service'}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {(dict?.admin as Record<string, unknown>)?.apiKeyHint as string || 'Leave empty to use free tier (exchangerate-api.com)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {multiCurrency.displayCurrencies && multiCurrency.displayCurrencies.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {(dict?.admin as Record<string, unknown>)?.exchangeRates as string || 'Exchange Rates'}
                </h2>
                <button
                  type="button"
                  onClick={fetchExchangeRates}
                  disabled={fetchingRates || multiCurrency.exchangeRateSource !== 'api'}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {fetchingRates 
                    ? ((dict?.admin as Record<string, unknown>)?.fetching as string || 'Fetching...') 
                    : ((dict?.admin as Record<string, unknown>)?.fetchLatestRates as string || 'Fetch Latest Rates')}
                </button>
              </div>
              {multiCurrency.lastUpdated && (
                <p className="text-xs text-gray-500 mb-4">
                  {(dict?.admin as Record<string, unknown>)?.lastUpdated as string || 'Last updated'}: {new Date(multiCurrency.lastUpdated).toLocaleString()}
                </p>
              )}
              <div className="space-y-2">
                {multiCurrency.displayCurrencies.map((currency: string) => {
                  const rate = multiCurrency.exchangeRates?.[currency];
                  return (
                    <div key={currency} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                      <span className="text-sm font-medium text-gray-900">{currency}</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={rate || ''}
                        onChange={(e) => {
                          const newRates = {
                            ...(multiCurrency.exchangeRates || {}),
                            [currency]: parseFloat(e.target.value) || 0,
                          };
                          updateSetting('multiCurrency.exchangeRates', newRates);
                        }}
                        className="w-32 px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={(dict?.admin as Record<string, unknown>)?.ratePlaceholder as string || 'Rate'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(!multiCurrency.displayCurrencies || multiCurrency.displayCurrencies.length === 0) && (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded">
              <p className="text-sm text-yellow-800">
                {(dict?.admin as Record<string, unknown>)?.noDisplayCurrencies as string || 'No display currencies configured. Please configure display currencies in Settings → Multi-Currency.'}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-all duration-200 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                  <span>{(dict?.common as Record<string, unknown>)?.saving as string || 'Saving...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{(dict?.common as Record<string, unknown>)?.save as string || 'Save Settings'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
