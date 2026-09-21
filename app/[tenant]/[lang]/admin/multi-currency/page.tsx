'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useMultiCurrencySettings } from '@/hooks/useMultiCurrencySettings';
import { useExchangeRateFetch } from '@/hooks/useExchangeRateFetch';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrencySymbol } from '@/lib/currency';
import {
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getExchangeRateFetchSuccessMessage,
  getExchangeRateFetchErrorMessage,
} from '@/lib/multi-currency-helpers';

export default function MultiCurrencyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { settings, loading, saving, message, setMessage, fetchSettings, updateSetting, saveSettings } =
    useMultiCurrencySettings(tenant);
  const { fetching: fetchingRates, fetchRates, loadRates, saveManualRates } = useExchangeRateFetch(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  // Exchange rates live in their own table, not on TenantSettings — load
  // whatever's already on file once settings have resolved, so previously
  // saved/fetched rates actually show up instead of rendering blank inputs.
  useEffect(() => {
    if (!settings) return;
    (async () => {
      const result = await loadRates();
      if (result.success && result.data) {
        updateSetting('multiCurrency.exchangeRates', result.data.exchangeRates);
        updateSetting('multiCurrency.lastUpdated', result.data.lastUpdated ? new Date(result.data.lastUpdated) : undefined);
      }
    })();
  // Only once settings first resolve, not on every settings change (updateSetting above would otherwise loop).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!settings]);

  const handleFetchRates = async () => {
    const result = await fetchRates();
    if (result.success && result.data) {
      setMessage({ type: 'success', text: getExchangeRateFetchSuccessMessage(dict) });
      const multiCurrency = settings?.multiCurrency || {};
      updateSetting('multiCurrency', {
        ...multiCurrency,
        exchangeRates: result.data.exchangeRates,
        lastUpdated: new Date(result.data.lastUpdated),
      });
    } else {
      setMessage({ type: 'error', text: getExchangeRateFetchErrorMessage(dict) || result.error });
    }
  };

  const handleSave = async () => {
    if (!settings || !dict) return;

    const result = await saveSettings(settings);
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || getSaveErrorMessage(dict) });
      return;
    }

    // The settings PUT can't persist multiCurrency.exchangeRates (no flat
    // column for it — see lib/tenant-settings-flatten.ts); manually-entered
    // rates need the dedicated exchange-rates endpoint or they're silently
    // dropped. Only relevant in manual mode — API-sourced rates are already
    // persisted by handleFetchRates at fetch time.
    const rates = settings.multiCurrency?.exchangeRates;
    if (settings.multiCurrency?.exchangeRateSource === 'manual' && rates && Object.keys(rates).length > 0) {
      const ratesResult = await saveManualRates(rates);
      if (!ratesResult.success) {
        setMessage({ type: 'error', text: ratesResult.error || getSaveErrorMessage(dict) });
        return;
      }
    }

    setMessage({ type: 'success', text: getSaveSuccessMessage(dict) });
    setTimeout(() => setMessage(null), 3000);
  };

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
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
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict?.admin?.multiCurrency || 'Multi-Currency Management'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.multiCurrencyDescription || 'Configure exchange rates and API settings for multi-currency support'}
          </p>
        </div>

        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {dict?.admin?.baseCurrency || 'Base Currency'}
            </span>
            <p className="text-lg font-bold text-gray-900">
              {settings?.currency || 'PHP'} ({settings?.currencySymbol || getCurrencySymbol(settings?.currency || 'PHP')})
            </p>
          </div>
          <Link
            href={`/${tenant}/${lang}/admin/settings`}
            className="text-sm text-brand hover:text-brand-hover font-medium"
          >
            {dict?.admin?.changeBaseCurrency || 'Change in Settings →'}
          </Link>
        </div>

        {settings?.suggestedCurrency && settings.suggestedCurrency.currency !== settings?.currency && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-300 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-blue-800">
              {(
                dict?.admin?.suggestedCurrencyHint ||
                'Your tenant\'s country ({country}) commonly uses {currency} — want to use it as your base currency?'
              )
                .replace('{country}', settings.suggestedCurrency.countryName)
                .replace('{currency}', settings.suggestedCurrency.currency)}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  const code = settings.suggestedCurrency!.currency;
                  updateSetting('currency', code);
                  updateSetting('currencySymbol', getCurrencySymbol(code));
                }}
                className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover whitespace-nowrap"
              >
                {(dict?.admin?.useSuggestedCurrency || 'Use {currency}').replace('{currency}', settings.suggestedCurrency.currency)}
              </button>
            )}
          </div>
        )}

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

        <fieldset disabled={!canManage} className="bg-white border border-gray-300 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {dict?.admin?.exchangeRateSource || 'Exchange Rate Source'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict?.admin?.exchangeRateSource || 'Exchange Rate Source'}
                </label>
                <select
                  value={multiCurrency.exchangeRateSource || 'manual'}
                  onChange={(e) => {
                    updateSetting('multiCurrency.exchangeRateSource', e.target.value);
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                >
                  <option value="manual">{dict?.admin?.manualEntry || 'Manual Entry'}</option>
                  <option value="api">{dict?.admin?.automaticAPI || 'Automatic (API)'}</option>
                </select>
              </div>

              {multiCurrency.exchangeRateSource === 'api' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict?.admin?.exchangeRateApiKey || 'Exchange Rate API Key (Optional)'}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={multiCurrency.exchangeRateApiKey || ''}
                    onChange={(e) => {
                      updateSetting('multiCurrency.exchangeRateApiKey', e.target.value);
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    placeholder={
                      multiCurrency.exchangeRateApiKeyConfigured
                        ? dict?.admin?.apiKeyConfiguredPlaceholder || 'Key is configured — leave blank to keep it'
                        : dict?.admin?.apiKeyPlaceholder || 'API key for exchange rate service'
                    }
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {dict?.admin?.apiKeyHint || 'Leave empty to use free tier (exchangerate-api.com)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {multiCurrency.displayCurrencies && multiCurrency.displayCurrencies.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {dict?.admin?.exchangeRates || 'Exchange Rates'}
                </h2>
                <button
                  type="button"
                  onClick={handleFetchRates}
                  disabled={fetchingRates || multiCurrency.exchangeRateSource !== 'api'}
                  className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {fetchingRates 
                    ? (dict?.admin?.fetching || 'Fetching...') 
                    : (dict?.admin?.fetchLatestRates || 'Fetch Latest Rates')}
                </button>
              </div>
              {multiCurrency.lastUpdated && (
                <p className="text-xs text-gray-500 mb-4">
                  {dict?.admin?.lastUpdated || 'Last updated'}: {new Date(multiCurrency.lastUpdated).toLocaleString(undefined, { hour12: true })}
                </p>
              )}
              <div className="space-y-2">
                {multiCurrency.displayCurrencies.map((currency: string) => {
                  // exchangeRates may be a Mongoose Map or a plain object — handle both
                  const ratesRaw = multiCurrency.exchangeRates as unknown;
                  const rate: number | undefined =
                    ratesRaw instanceof Map
                      ? (ratesRaw as Map<string, number>).get(currency)
                      : (ratesRaw as Record<string, number> | undefined)?.[currency];
                  return (
                    <div key={currency} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200">
                      <span className="text-sm font-medium text-gray-900">{currency}</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={rate ?? ''}
                        onChange={(e) => {
                          // Build a plain-object copy so the spread below always works
                          const existing: Record<string, number> =
                            ratesRaw instanceof Map
                              ? Object.fromEntries(ratesRaw as Map<string, number>)
                              : { ...((ratesRaw as Record<string, number>) || {}) };
                          const parsed = parseFloat(e.target.value);
                          const newRates = { ...existing, [currency]: isNaN(parsed) ? 0 : parsed };
                          updateSetting('multiCurrency.exchangeRates', newRates);
                        }}
                        className="w-32 px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                        placeholder={dict?.admin?.ratePlaceholder || 'Rate'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(!multiCurrency.displayCurrencies || multiCurrency.displayCurrencies.length === 0) && (
            <div className="p-4 bg-yellow-50 border border-yellow-300">
              <p className="text-sm text-yellow-800">
                {dict?.admin?.noDisplayCurrencies || 'No display currencies configured. Please configure display currencies in Settings → Multi-Currency.'}
              </p>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-brand text-white hover:bg-brand-hover font-semibold transition-all duration-200 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                    <span>{dict?.common?.saving || 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{dict?.common?.save || 'Save Settings'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </fieldset>
      </div>
    </div>
  );
}
