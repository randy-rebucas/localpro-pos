'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useMultiCurrencySettings } from '@/hooks/useMultiCurrencySettings';
import { useExchangeRateFetch } from '@/hooks/useExchangeRateFetch';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrencySymbol } from '@/lib/currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getExchangeRateFetchSuccessMessage,
  getExchangeRateFetchErrorMessage,
} from '@/lib/multi-currency-helpers';

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function MultiCurrencyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('multi_currency.manage');
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

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
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
  const displayCurrencies: string[] = multiCurrency.displayCurrencies ?? [];
  const hasDisplayCurrencies = displayCurrencies.length > 0;
  const baseCurrency = settings?.currency || 'PHP';

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.multiCurrency || 'Multi-Currency Management'}
        description={dict?.admin?.multiCurrencyDescription || 'Configure exchange rates and API settings for multi-currency support'}
      />

      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingMultiCurrency || 'Loading multi-currency settings…'}</p>
          </div>
        ) : !settings ? (
          <div className="text-center py-12 bg-white border border-gray-300 px-4">
            <p className="text-sm font-bold text-gray-900">{dict?.settings?.failedToLoad || 'Failed to Load Settings'}</p>
            <p className="mt-1 text-win8-danger text-sm font-medium">
              {message?.text || dict?.settings?.loadErrorDescription || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={() => fetchSettings()}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.settings?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-300 p-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {dict?.admin?.baseCurrency || 'Base Currency'}
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {settings.currency || 'PHP'} ({settings.currencySymbol || getCurrencySymbol(settings.currency || 'PHP')})
                </p>
              </div>
              <Link
                href={`/${tenant}/${lang}/admin/settings`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
              >
                {dict?.admin?.changeBaseCurrency || 'Change in Settings →'}
              </Link>
            </div>

            {settings.suggestedCurrency && settings.suggestedCurrency.currency !== settings.currency && (
              <div className="bg-brand-soft border border-brand p-4 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-brand-navy">
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
                    className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
                  >
                    {(dict?.admin?.useSuggestedCurrency || 'Use {currency}').replace('{currency}', settings.suggestedCurrency.currency)}
                  </button>
                )}
              </div>
            )}

            {!canManage && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
              </div>
            )}

            <fieldset disabled={!canManage} className="space-y-6">
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">
                    {dict?.admin?.exchangeRateSource || 'Exchange Rate Source'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {dict?.admin?.exchangeRateSourceDescription || 'Enter rates by hand or pull them from an exchange rate provider'}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label htmlFor="mc-rate-source" className={LABEL}>
                      {dict?.admin?.exchangeRateSource || 'Exchange Rate Source'}
                    </label>
                    <select
                      id="mc-rate-source"
                      value={multiCurrency.exchangeRateSource || 'manual'}
                      onChange={(e) => {
                        updateSetting('multiCurrency.exchangeRateSource', e.target.value);
                      }}
                      className={`${INPUT} md:w-80`}
                    >
                      <option value="manual">{dict?.admin?.manualEntry || 'Manual Entry'}</option>
                      <option value="api">{dict?.admin?.automaticAPI || 'Automatic (API)'}</option>
                    </select>
                  </div>

                  {multiCurrency.exchangeRateSource === 'api' && (
                    <div>
                      <label htmlFor="mc-api-key" className={LABEL}>
                        {dict?.admin?.exchangeRateApiKey || 'Exchange Rate API Key (Optional)'}
                      </label>
                      <input
                        id="mc-api-key"
                        type="password"
                        autoComplete="new-password"
                        value={multiCurrency.exchangeRateApiKey || ''}
                        onChange={(e) => {
                          updateSetting('multiCurrency.exchangeRateApiKey', e.target.value);
                        }}
                        className={`${INPUT} font-mono`}
                        placeholder={
                          multiCurrency.exchangeRateApiKeyConfigured
                            ? dict?.admin?.apiKeyConfiguredPlaceholder || 'Key is configured — leave blank to keep it'
                            : dict?.admin?.apiKeyPlaceholder || 'API key for exchange rate service'
                        }
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {dict?.admin?.apiKeyHint || 'Leave empty to use free tier (exchangerate-api.com)'}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      {dict?.admin?.exchangeRates || 'Exchange Rates'}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {dict?.admin?.lastUpdated || 'Last updated'}:{' '}
                      {multiCurrency.lastUpdated
                        ? new Date(multiCurrency.lastUpdated).toLocaleString(undefined, { hour12: true })
                        : '—'}
                    </p>
                  </div>
                  {hasDisplayCurrencies && multiCurrency.exchangeRateSource === 'api' && (
                    <button
                      type="button"
                      onClick={handleFetchRates}
                      disabled={fetchingRates}
                      className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
                    >
                      {fetchingRates
                        ? (dict?.admin?.fetching || 'Fetching…')
                        : (dict?.admin?.fetchLatestRates || 'Fetch Latest Rates')}
                    </button>
                  )}
                </div>

                {hasDisplayCurrencies ? (
                  <div className="divide-y divide-gray-200">
                    {displayCurrencies.map((currency) => {
                      // exchangeRates may be a Mongoose Map or a plain object — handle both
                      const ratesRaw = multiCurrency.exchangeRates as unknown;
                      const rate: number | undefined =
                        ratesRaw instanceof Map
                          ? (ratesRaw as Map<string, number>).get(currency)
                          : (ratesRaw as Record<string, number> | undefined)?.[currency];
                      return (
                        <div key={currency} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-gray-100 transition-colors">
                          <span className="text-sm font-semibold font-mono text-gray-900">{currency}</span>
                          <div className="flex items-center gap-2">
                            {/* Rate = units of this currency per 1 base unit (lib/multi-currency.ts) */}
                            <span className="text-xs font-mono text-gray-500 whitespace-nowrap" aria-hidden="true">1 {baseCurrency} =</span>
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
                                // A cleared field drops the rate rather than storing 0 —
                                // conversion treats ≤0 as invalid, and the input must be clearable.
                                const parsed = parseFloat(e.target.value);
                                const newRates = { ...existing };
                                if (isNaN(parsed)) delete newRates[currency];
                                else newRates[currency] = parsed;
                                updateSetting('multiCurrency.exchangeRates', newRates);
                              }}
                              aria-label={(dict?.admin?.rateFor || 'Exchange rate for {currency}').replace('{currency}', currency)}
                              className="w-36 border border-gray-300 px-3 py-2 text-sm text-right tabular-nums bg-white disabled:bg-gray-100"
                              placeholder={dict?.admin?.ratePlaceholder || 'Rate'}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-6">
                    <p className="text-sm text-gray-400 italic">
                      {dict?.admin?.noDisplayCurrencies || 'No display currencies configured. Please configure display currencies in Settings → Multi-Currency.'}
                    </p>
                    <Link
                      href={`/${tenant}/${lang}/settings?tab=multiCurrency`}
                      className="mt-4 inline-flex items-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                    >
                      {dict?.admin?.configureDisplayCurrencies || 'Configure Display Currencies →'}
                    </Link>
                  </div>
                )}
              </section>
            </fieldset>

            {(canManage || message) && (
              <div className="flex items-center justify-end gap-4 flex-wrap">
                {message && (
                  <p
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`mr-auto text-sm font-medium ${message.type === 'success' ? 'text-win8-success' : 'text-win8-danger'}`}
                  >
                    {message.text}
                  </p>
                )}
                {canManage && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                  >
                    {saving ? (dict?.settings?.saving || 'Saving…') : (dict?.settings?.save || 'Save Settings')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
