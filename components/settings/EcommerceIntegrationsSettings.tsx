'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import type { ITenantSettings } from '@/types/tenant';
import { normalizeShopifyShopDomain } from '@/lib/ecommerce/shopify-shop-domain';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

type StatusRow = {
  provider: string;
  shopDomain?: string | null;
  siteUrl?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  hasLocation?: boolean;
};

export default function EcommerceIntegrationsSettings({
  tenant,
  lang,
}: {
  tenant: string;
  lang: 'en' | 'es';
}) {
  const { settings, loading: settingsLoading, refreshSettings } = useTenantSettings();
  const [rows, setRows] = useState<StatusRow[]>([]);
  /** null = status not loaded yet; avoids flashing full UI as “unlocked” before GET returns */
  const [featureUnlocked, setFeatureUnlocked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  // Each connect rotates the webhook signing secret; two in flight can leave the
  // store's webhooks signed with a secret the DB no longer holds.
  const [connectingWoo, setConnectingWoo] = useState(false);
  const [shopDomain, setShopDomain] = useState('');
  const [wooUrl, setWooUrl] = useState('');
  const [wooKey, setWooKey] = useState('');
  const [wooSecret, setWooSecret] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string; code?: string } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);

  const ecDict = (dict?.settings as Record<string, unknown> | undefined)?.ecommerce as
    | Record<string, string | undefined>
    | undefined;
  const t = (key: string, fallback: string) => ecDict?.[key] || fallback;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/ecommerce/status?tenant=${encodeURIComponent(tenant)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setRows([]);
        setFeatureUnlocked(false);
        setMsg({ type: 'error', text: data.error || 'Failed to load integration status.', code: data.error ? undefined : 'loadFailed' });
        return;
      }
      setRows(data.data || []);
      setFeatureUnlocked(data.ecommerceFeatureUnlocked !== false);
    } catch {
      setRows([]);
      setFeatureUnlocked(false);
      setMsg({ type: 'error', text: 'Failed to load integration status.', code: 'loadFailed' });
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    load();
  }, [load]);

  const shopify = rows.find((r) => r.provider === 'shopify');
  const woo = rows.find((r) => r.provider === 'woocommerce');

  const shopifyLayer = settings?.integrations?.ecommerce?.shopifyEnabled === true;
  const wooLayer = settings?.integrations?.ecommerce?.wooCommerceEnabled === true;

  const persistIntegrationPrefs = async (next: {
    shopifyEnabled: boolean;
    wooCommerceEnabled: boolean;
  }) => {
    if (!settings) {
      setMsg({ type: 'error', text: t('settingsLoading', 'Settings are still loading.') });
      return;
    }
    if (next.shopifyEnabled === false && shopify?.shopDomain) {
      setMsg({ type: 'error', text: t('disconnectShopifyFirst', 'Disconnect Shopify before turning it off here.') });
      return;
    }
    if (next.wooCommerceEnabled === false && woo?.siteUrl) {
      setMsg({ type: 'error', text: t('disconnectWooFirst', 'Disconnect WooCommerce before turning it off here.') });
      return;
    }
    setSavingPrefs(true);
    setMsg(null);
    try {
      // Send only the integrations key: echoing the whole (page-load) settings
      // object back would revert anything changed since it was loaded.
      const merged: Pick<ITenantSettings, 'integrations'> = {
        integrations: {
          ...settings.integrations,
          ecommerce: {
            ...settings.integrations?.ecommerce,
            shopifyEnabled: next.shopifyEnabled,
            wooCommerceEnabled: next.wooCommerceEnabled,
          },
        },
      };
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: merged }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: t('prefsSaved', 'Store integration preferences saved.') });
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || t('prefsFailed', 'Failed to save preferences.') });
      }
    } catch {
      setMsg({ type: 'error', text: t('prefsFailed', 'Failed to save preferences.') });
    } finally {
      setSavingPrefs(false);
    }
  };

  const startShopify = () => {
    const normalized = normalizeShopifyShopDomain(shopDomain);
    if (!normalized) {
      setMsg({
        type: 'error',
        text: t('invalidShopDomain', 'Use only the shop hostname, e.g. your-store.myshopify.com — no https://, path, or admin URL.'),
      });
      return;
    }
    const q = new URLSearchParams();
    q.set('shop', normalized);
    q.set('tenant', tenant);
    q.set('lang', lang);
    window.location.href = `/api/integrations/shopify/oauth/start?${q.toString()}`;
  };

  const connectWoo = async () => {
    if (connectingWoo) return;
    setConnectingWoo(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/integrations/woocommerce/connect?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          siteUrl: wooUrl.trim(),
          consumerKey: wooKey.trim(),
          consumerSecret: wooSecret.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: t('wooConnected', 'WooCommerce connected.') });
        setWooSecret('');
        await load();
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || t('connectFailed', 'Connection failed.') });
      }
    } catch {
      setMsg({ type: 'error', text: t('connectFailed', 'Connection failed.') });
    } finally {
      setConnectingWoo(false);
    }
  };

  const sync = async (provider: 'shopify' | 'woocommerce') => {
    setSyncing(provider);
    setMsg(null);
    try {
      const res = await fetch(`/api/integrations/ecommerce/sync?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, autoCreateProducts: true }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({
          type: 'success',
          text: t('syncResult', 'Catalog sync: linked {linked}, created {created}, skipped {skipped}.')
            .replace('{linked}', data.data.linked)
            .replace('{created}', data.data.created)
            .replace('{skipped}', data.data.skipped),
        });
      } else {
        setMsg({ type: 'error', text: data.error || t('syncFailed', 'Sync failed.') });
      }
      await load();
    } catch {
      setMsg({ type: 'error', text: t('syncFailed', 'Sync failed.') });
    } finally {
      setSyncing(null);
    }
  };

  const disconnect = async (provider: 'shopify' | 'woocommerce') => {
    if (!window.confirm(t('disconnectConfirm', 'Disconnect this channel? Product links for this channel will be removed.'))) return;
    try {
      const res = await fetch(`/api/integrations/ecommerce/disconnect?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: t('disconnected', 'Disconnected.') });
        await load();
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || t('disconnectFailed', 'Failed to disconnect.') });
      }
    } catch {
      setMsg({ type: 'error', text: t('disconnectFailed', 'Failed to disconnect.') });
    }
  };

  const showShopifyCard = shopifyLayer || Boolean(shopify?.shopDomain);
  const showWooCard = wooLayer || Boolean(woo?.siteUrl);

  const planLocksEcommerce = featureUnlocked === false;
  const hasConnectedStore = Boolean(shopify?.shopDomain || woo?.siteUrl);
  /** When the plan blocks new setup and nothing is connected, hide toggles + “enable above” placeholders */
  const hideDisconnectedSetupUi = planLocksEcommerce && !hasConnectedStore;
  const gateClosed = featureUnlocked !== true;

  return (
    <section className="space-y-10">
      <div>
        <h2 className="mb-1 text-3xl">{t('heading', 'E-commerce channels')}</h2>
        <p className="text-sm text-ink/70">
          {t('intro', 'Choose which storefronts this tenant may use, then connect credentials. Secrets stay on the server; only preferences are stored in tenant settings.')}
        </p>
      </div>

      {featureUnlocked === null && (loading || settingsLoading) ? (
        <p className="text-ink/70 text-sm">{t('checkingPlan', 'Checking plan access…')}</p>
      ) : null}

      {planLocksEcommerce ? (
        <div
          className="border-l-4 border-stamp bg-paper p-5"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1.5 font-semibold text-ink">
                {ecDict?.productionNoticeTitle || 'Custom integrations required'}
              </p>
              <p className="text-sm leading-relaxed text-ink/80">
                {ecDict?.productionNoticeBody ||
                  'In production, this feature requires a subscription plan that includes custom integrations.'}
              </p>
            </div>
            <Link
              href={`/${tenant}/${lang}/subscription`}
              className="inline-flex min-h-[44px] flex-shrink-0 items-center justify-center gap-2 px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ecDict?.viewPlansCta || 'View subscription & plans'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      ) : null}

      {msg && (
        <div
          className={`border-l-4 bg-paper p-3 font-receipt text-sm text-ink ${
            msg.type === 'success' ? 'border-brand' : 'border-stamp'
          }`}
        >
          {msg.code ? t(msg.code, msg.text) : msg.text}
        </div>
      )}

      {(loading || settingsLoading) && !settings && featureUnlocked !== null ? (
        <p className="text-ink/70 text-sm">{t('loading', 'Loading…')}</p>
      ) : null}

      {!hideDisconnectedSetupUi && (
        <div className="border-2 border-ink/25 bg-paper-white p-5">
          <h3 className="text-lg font-semibold text-ink mb-1">{t('storeIntegrations', 'Store integrations')}</h3>
          <p className="text-sm text-ink/70 mb-4">
            {t('storeIntegrationsDesc', 'Turn on each channel your business uses. OAuth and API connect are only allowed for enabled channels.')}
          </p>
          <div className="space-y-4 max-w-xl">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8 mt-1 cursor-pointer"
                checked={shopifyLayer}
                disabled={
                  savingPrefs ||
                  gateClosed ||
                  Boolean(shopify?.shopDomain) ||
                  settingsLoading ||
                  !settings
                }
                onChange={(e) =>
                  persistIntegrationPrefs({
                    shopifyEnabled: e.target.checked,
                    wooCommerceEnabled: settings?.integrations?.ecommerce?.wooCommerceEnabled === true,
                  })
                }
              />
              <span>
                <span className="font-medium text-ink">Shopify</span>
                <span className="block text-xs text-ink/60 mt-0.5">
                  {t('shopifyToggleDesc', 'Allow connecting a Shopify store for this tenant.')}
                  {shopify?.shopDomain ? ` ${t('disconnectToTurnOff', 'Disconnect first to turn this off.')}` : ''}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8 mt-1 cursor-pointer"
                checked={wooLayer}
                disabled={
                  savingPrefs ||
                  gateClosed ||
                  Boolean(woo?.siteUrl) ||
                  settingsLoading ||
                  !settings
                }
                onChange={(e) =>
                  persistIntegrationPrefs({
                    shopifyEnabled: settings?.integrations?.ecommerce?.shopifyEnabled === true,
                    wooCommerceEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <span className="font-medium text-ink">WooCommerce</span>
                <span className="block text-xs text-ink/60 mt-0.5">
                  {t('wooToggleDesc', 'Allow connecting a WooCommerce site (REST API keys).')}
                  {woo?.siteUrl ? ` ${t('disconnectToTurnOff', 'Disconnect first to turn this off.')}` : ''}
                </span>
              </span>
            </label>
            {savingPrefs ? <p className="text-xs text-ink/60">{t('saving', 'Saving…')}</p> : null}
          </div>
        </div>
      )}

      {loading && featureUnlocked !== null ? (
        <p className="text-ink/70 text-sm">{t('loadingStatus', 'Loading channel status…')}</p>
      ) : null}

      {!hideDisconnectedSetupUi &&
        (showShopifyCard ? (
        <div className="border-2 border-ink/25 bg-paper p-5">
          <h3 className="text-lg font-semibold text-ink mb-3">Shopify</h3>
          {shopify?.shopDomain ? (
            <div className="space-y-3 text-sm">
              <p>
                {t('store', 'Store')}:{' '}
                <span className="break-all border border-ink/25 bg-paper-white px-2 py-0.5 font-receipt">{shopify.shopDomain}</span>
              </p>
              {!shopify.hasLocation ? (
                <p className="text-stamp">{t('noLocation', 'No default inventory location detected; stock push may be skipped.')}</p>
              ) : null}
              {shopify.lastSyncAt ? (
                <p className="text-ink/70">{t('lastSync', 'Last catalog sync')}: {new Date(shopify.lastSyncAt).toLocaleString(lang)}</p>
              ) : null}
              {shopify.lastError ? <p className="text-stamp">{t('lastError', 'Last error')}: {shopify.lastError}</p> : null}
              <div className="flex gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  disabled={syncing !== null || gateClosed}
                  onClick={() => sync('shopify')}
                  className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {syncing === 'shopify' ? t('syncing', 'Syncing…') : t('runSync', 'Run catalog sync')}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect('shopify')}
                  className="min-h-[44px] px-4 border border-ink/25 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('disconnect', 'Disconnect')}
                </button>
              </div>
            </div>
          ) : shopifyLayer ? (
            <div className="space-y-3 max-w-lg">
              <label className="block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{t('shopDomain', 'Shop domain')}</label>
              <input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                disabled={gateClosed || !normalizeShopifyShopDomain(shopDomain)}
                onClick={startShopify}
                className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('connectShopify', 'Connect with Shopify')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink/70">
              {t('shopifyToggleOff', 'Shopify is connected but the store integration toggle is off. Turn Shopify on under Store integrations, or disconnect if you no longer use this channel.')}
            </p>
          )}
        </div>
        ) : (
        <p className="text-sm text-ink/60 border border-dashed border-ink/25 p-4 ">
          {t('enableShopifyHint', 'Enable Shopify above to connect a store.')}
        </p>
        ))}

      {!hideDisconnectedSetupUi &&
        (showWooCard ? (
        <div className="border-2 border-ink/25 bg-paper p-5">
          <h3 className="text-lg font-semibold text-ink mb-3">WooCommerce</h3>
          {woo?.siteUrl ? (
            <div className="space-y-3 text-sm">
              <p>
                {t('site', 'Site')}: <span className="break-all border border-ink/25 bg-paper-white px-2 py-0.5 font-receipt">{woo.siteUrl}</span>
              </p>
              {woo.lastSyncAt ? (
                <p className="text-ink/70">{t('lastSync', 'Last catalog sync')}: {new Date(woo.lastSyncAt).toLocaleString(lang)}</p>
              ) : null}
              {woo.lastError ? <p className="text-stamp">{t('lastError', 'Last error')}: {woo.lastError}</p> : null}
              <div className="flex gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  disabled={syncing !== null || gateClosed}
                  onClick={() => sync('woocommerce')}
                  className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {syncing === 'woocommerce' ? t('syncing', 'Syncing…') : t('runSync', 'Run catalog sync')}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect('woocommerce')}
                  className="min-h-[44px] px-4 border border-ink/25 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('disconnect', 'Disconnect')}
                </button>
              </div>
            </div>
          ) : wooLayer ? (
            <div className="space-y-3 max-w-lg">
              <label className="block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{t('siteUrl', 'Site URL')}</label>
              <input
                value={wooUrl}
                onChange={(e) => setWooUrl(e.target.value)}
                placeholder="https://your-wordpress-site.com"
                className="w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
              />
              <label className="block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{t('consumerKey', 'REST API consumer key')}</label>
              <input
                value={wooKey}
                onChange={(e) => setWooKey(e.target.value)}
                placeholder="ck_…"
                className="w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
              />
              <label className="block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{t('consumerSecret', 'REST API consumer secret')}</label>
              <input
                value={wooSecret}
                onChange={(e) => setWooSecret(e.target.value)}
                placeholder="cs_…"
                type="password"
                className="w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                disabled={connectingWoo || gateClosed || !wooUrl.trim() || !wooKey.trim() || !wooSecret.trim()}
                onClick={connectWoo}
                className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('saveAndConnect', 'Save and connect')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink/70">
              {t('wooToggleOff', 'WooCommerce is connected but the store integration toggle is off. Turn WooCommerce on under Store integrations, or disconnect if you no longer use this channel.')}
            </p>
          )}
        </div>
        ) : (
        <p className="text-sm text-ink/60 border border-dashed border-ink/25 p-4 ">
          {t('enableWooHint', 'Enable WooCommerce above to connect a site.')}
        </p>
        ))}
    </section>
  );
}
