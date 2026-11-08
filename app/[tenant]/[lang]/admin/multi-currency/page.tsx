'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowRight, RefreshCw, Save } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, CHECKBOX, CHECK_ROW, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, HINT, INPUT, KEY, LABEL,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useMultiCurrencySettings } from '@/hooks/useMultiCurrencySettings';
import { useExchangeRateFetch } from '@/hooks/useExchangeRateFetch';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatDateTime } from '@/lib/formatting';
import type { ITenantSettings } from '@/types/tenant';

type Dict = Record<string, Record<string, string | undefined> | undefined>;
type MultiCurrency = NonNullable<ITenantSettings['multiCurrency']>;

/** exchangeRates may arrive as a Mongoose Map or a plain object. */
const plainRates = (raw: unknown): Record<string, number> =>
  raw instanceof Map ? Object.fromEntries(raw as Map<string, number>) : { ...((raw as Record<string, number>) || {}) };

const draftsFrom = (currencies: string[], rates: Record<string, number>) =>
  Object.fromEntries(currencies.map((c) => [c, rates[c] != null && rates[c] > 0 ? String(rates[c]) : '']));

/** A rate the way a change board shows it: up to 4 decimals, no trailing zeros. */
const boardRate = (rate: number) => String(Number(rate.toFixed(4)));

/**
 * The exchange board. Each display currency is a line on the board with its rate against
 * the shop's own currency; the slip beside it says where the rates come from.
 */
export default function MultiCurrencyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings: tenantSettings, applySettings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const [dict, setDict] = useState<Dict | null>(null);

  const { settings, loading, saving, fetchSettings, updateSetting, saveSettings } = useMultiCurrencySettings(tenant);
  const { fetching, fetchRates } = useExchangeRateFetch(tenant);

  const [draftState, setDrafts] = useState<Record<string, string> | null>(null);
  const [removeKey, setRemoveKey] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const mc: MultiCurrency = settings?.multiCurrency || { enabled: false, displayCurrencies: [], exchangeRates: {}, exchangeRateSource: 'manual' };
  const base = settings?.currency || tenantSettings?.currency || 'PHP';
  const currencies = useMemo(() => (mc.displayCurrencies || []).filter((c) => c !== base), [mc.displayCurrencies, base]);
  const savedMc = tenantSettings?.multiCurrency;
  const savedRates = plainRates(savedMc?.exchangeRates);

  // Seed the rate fields once the settings arrive.
  if (settings && draftState === null) setDrafts(draftsFrom(currencies, plainRates(settings.multiCurrency?.exchangeRates)));
  const drafts = draftState ?? {};

  if (!dict || loading || !settings) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const a = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const source = mc.exchangeRateSource || 'manual';
  const locale = lang === 'es' ? 'es' : 'en';
  const money = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const ratesDirty = currencies.some((c) => (drafts[c] ?? '') !== (savedRates[c] != null && savedRates[c] > 0 ? String(savedRates[c]) : ''));
  const keyDirty = removeKey || !!mc.exchangeRateApiKey;
  const dirty = ratesDirty || keyDirty || source !== (savedMc?.exchangeRateSource || 'manual');
  const setCount = currencies.filter((c) => Number(drafts[c]) > 0).length;

  const handleFetch = async () => {
    setError('');
    const result = await fetchRates();
    if (result.success && result.data) {
      const rates = plainRates(result.data.exchangeRates);
      const next = { ...mc, exchangeRates: rates, lastUpdated: new Date(result.data.lastUpdated) };
      updateSetting('multiCurrency', next);
      // The server already saved them, so the shared settings match too.
      applySettings({ multiCurrency: { ...(savedMc || mc), exchangeRates: rates, lastUpdated: next.lastUpdated } });
      setDrafts(draftsFrom(currencies, rates));
      toast.success(a('exchangeRatesUpdated', 'Exchange rates updated successfully'));
    } else {
      setError(a('failedToFetchRates', 'Failed to fetch exchange rates'));
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const rates = { ...plainRates(mc.exchangeRates) };
    for (const c of currencies) {
      const raw = (drafts[c] ?? '').trim();
      if (!raw) {
        delete rates[c];
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setError(a('rateMustBePositive', 'Each rate must be a number above zero. Leave a rate blank to hide that currency.') + ` (${c})`);
        return;
      }
      rates[c] = n;
    }
    setError('');
    const nextMc: MultiCurrency = {
      ...mc,
      exchangeRates: rates,
      ...(ratesDirty ? { lastUpdated: new Date() } : {}),
    };
    // A blank key field keeps the saved key (it is never sent back to the browser); clearing it is explicit.
    if (removeKey) nextMc.exchangeRateApiKey = '';
    else if (!nextMc.exchangeRateApiKey) delete nextMc.exchangeRateApiKey;

    const result = await saveSettings({ ...settings, multiCurrency: nextMc });
    if (result.success) {
      setRemoveKey(false);
      setDrafts(draftsFrom(currencies, rates));
      toast.success(a('multiCurrencySaved', 'Multi-currency settings saved successfully!'));
    } else {
      setError(a('failedToSaveMultiCurrency', 'Failed to save multi-currency settings'));
    }
  };

  const settingsHref = `/${tenant}/${lang}/settings?tab=multiCurrency`;

  return (
    <RegisterPage
      tagNo="FX"
      tag={settings.companyName}
      title={a('multiCurrency', 'Multi-Currency')}
      subtitle={a('multiCurrencySubtitleShort', 'Rates for showing prices in other currencies. Sales are still charged in your own currency.')}
      side={<LedReadout value={`${setCount}/${currencies.length}`} label={a('ratesSet', 'Rates set')} />}
    >
      <div className="mt-6 space-y-3">
        {!mc.enabled && (
          <Strip tone="error">
            {a('multiCurrencyOff', 'Showing other currencies is switched off, so these rates are not used yet.')}{' '}
            <Link href={settingsHref} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              {a('turnOnInSettings', 'Turn it on in Settings')}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          </Strip>
        )}
        {error && <Strip tone="error">{error}</Strip>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        {/* The board: one line per currency */}
        <section className="min-w-0 xl:col-span-7" aria-labelledby="fx-board">
          <div className="border border-white/10 bg-black/30">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
              <h2 id="fx-board" className="text-3xl text-paper-white sm:text-4xl">{a('exchangeRates', 'Exchange Rates')}</h2>
              <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">
                {a('perOne', '1 {base} =').replace('{base}', base)}
              </span>
            </div>
            {currencies.length === 0 ? (
              <div className="px-4 py-10 font-receipt text-sm text-paper/70 sm:px-5">
                <p>{a('noDisplayCurrenciesShort', 'No currencies picked yet. Choose which ones to show in Settings.')}</p>
                <Link href={settingsHref} className={`${DARK_KEY} mt-4 inline-flex`}>
                  {a('pickCurrencies', 'Pick currencies')}
                  <ArrowRight className={ICON} strokeWidth={1.75} aria-hidden />
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {currencies.map((c) => {
                  const n = Number(drafts[c]);
                  const ok = Number.isFinite(n) && n > 0;
                  return (
                    <li key={c} className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[5rem_1fr_9rem] sm:px-5">
                      <span className="font-display text-4xl uppercase leading-none text-paper-white">{c}</span>
                      <div className="min-w-0">
                        <span className={`mk-led-glow block truncate font-led text-3xl leading-none ${ok ? 'text-[#7df0d6]' : 'text-white/25'}`} aria-hidden>
                          {ok ? boardRate(n) : '----'}
                        </span>
                        <span className="mt-1 block font-receipt text-[11px] uppercase tracking-[0.06em] text-white/60">
                          {ok ? `${money(100, base)} = ${money(100 * n, c)}` : a('rateNotSet', 'Not set, so it is not shown')}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label htmlFor={`rate-${c}`} className="sr-only">{a('rateFor', 'Rate for {currency}').replace('{currency}', c)}</label>
                        <input
                          id={`rate-${c}`}
                          type="text"
                          inputMode="decimal"
                          disabled={!canManage}
                          value={drafts[c] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [c]: e.target.value.replace(/[^0-9.]/g, '') }))}
                          className={`${DARK_FIELD} text-right`}
                          placeholder={a('ratePlaceholder', 'Rate')}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {mc.lastUpdated && (
              <p className="border-t border-white/10 px-4 py-2 font-receipt text-xs text-white/60 sm:px-5">
                {a('lastUpdated', 'Last updated')}: {formatDateTime(mc.lastUpdated, settings)}
              </p>
            )}
          </div>
        </section>

        {/* Where the rates come from */}
        <section className="min-w-0 xl:col-span-5" aria-labelledby="fx-source">
          <fieldset disabled={!canManage} className="bg-paper-white px-4 py-4 text-ink sm:px-5">
            <h2 id="fx-source" className="text-3xl sm:text-4xl">{a('exchangeRateSource', 'Exchange Rate Source')}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={a('exchangeRateSource', 'Exchange Rate Source')}>
              {(['manual', 'api'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={source === s}
                  onClick={() => updateSetting('multiCurrency.exchangeRateSource', s)}
                  className={`${KEY} ${source === s ? 'border-ink bg-ink text-paper-white hover:bg-ink' : ''}`}
                >
                  {s === 'manual' ? a('manualEntry', 'Manual Entry') : a('automaticAPI', 'Automatic (API)')}
                </button>
              ))}
            </div>
            <p className={HINT}>
              {source === 'manual'
                ? a('manualHint', 'Type each rate on the board and save.')
                : a('apiHint', 'Fetch the latest rates from the rate service. You can still adjust a rate by hand.')}
            </p>

            {source === 'api' && (
              <div className="mt-4 space-y-3 border-t border-dashed border-ink/30 pt-4">
                <div>
                  <label htmlFor="fx-key" className={LABEL}>{a('exchangeRateApiKey', 'Exchange Rate API Key (Optional)')}</label>
                  <input
                    id="fx-key"
                    type="password"
                    autoComplete="off"
                    value={mc.exchangeRateApiKey || ''}
                    disabled={removeKey}
                    onChange={(e) => updateSetting('multiCurrency.exchangeRateApiKey', e.target.value)}
                    className={INPUT}
                    placeholder={a('apiKeyPlaceholder', 'API key for exchange rate service')}
                  />
                  <p className={HINT}>
                    {a('apiKeyHiddenHint', 'A saved key is never shown. Leave this blank to keep it, or to use the free tier (exchangerate-api.com).')}
                  </p>
                </div>
                <label className={CHECK_ROW}>
                  <input type="checkbox" checked={removeKey} onChange={(e) => { setRemoveKey(e.target.checked); if (e.target.checked) updateSetting('multiCurrency.exchangeRateApiKey', ''); }} className={CHECKBOX} />
                  {a('removeSavedKey', 'Remove the saved key')}
                </label>
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={fetching || dirty || !mc.enabled || currencies.length === 0}
                  className={`${KEY} w-full`}
                >
                  <RefreshCw className={`${ICON} ${fetching ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
                  {fetching ? a('fetching', 'Fetching...') : a('fetchLatestRates', 'Fetch Latest Rates')}
                </button>
                {dirty && <p className={HINT}>{a('saveBeforeFetch', 'Save your changes first. Fetching uses the saved settings.')}</p>}
              </div>
            )}
          </fieldset>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>

      {canManage && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {dirty && <span className="font-receipt text-xs uppercase tracking-[0.08em] text-[#8fe3d0]">{a('unsavedChanges', 'Unsaved changes')}</span>}
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}>
            <Save className={ICON} strokeWidth={1.75} aria-hidden />
            {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </div>
      )}
    </RegisterPage>
  );
}
