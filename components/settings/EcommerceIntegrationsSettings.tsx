'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import type { ITenantSettings } from '@/types/tenant';
import { normalizeShopifyShopDomain } from '@/lib/ecommerce/shopify-shop-domain';

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
  const [featureUnlocked, setFeatureUnlocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [shopDomain, setShopDomain] = useState('');
  const [wooUrl, setWooUrl] = useState('');
  const [wooKey, setWooKey] = useState('');
  const [wooSecret, setWooSecret] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/ecommerce/status?tenant=${encodeURIComponent(tenant)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setRows(data.data || []);
        setFeatureUnlocked(data.ecommerceFeatureUnlocked !== false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed to load integration status.' });
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
      setMsg({ type: 'error', text: 'Settings are still loading.' });
      return;
    }
    if (next.shopifyEnabled === false && shopify?.shopDomain) {
      setMsg({ type: 'error', text: 'Disconnect Shopify before turning it off here.' });
      return;
    }
    if (next.wooCommerceEnabled === false && woo?.siteUrl) {
      setMsg({ type: 'error', text: 'Disconnect WooCommerce before turning it off here.' });
      return;
    }
    setSavingPrefs(true);
    setMsg(null);
    try {
      const merged: ITenantSettings = {
        ...settings,
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
        setMsg({ type: 'success', text: 'Store integration preferences saved.' });
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || 'Failed to save preferences' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed to save preferences.' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const startShopify = () => {
    const normalized = normalizeShopifyShopDomain(shopDomain);
    if (!normalized) {
      setMsg({
        type: 'error',
        text: 'Use only the shop hostname, e.g. your-store.myshopify.com — no https://, path, or admin URL.',
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
        setMsg({ type: 'success', text: 'WooCommerce connected.' });
        setWooSecret('');
        await load();
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || 'Connection failed' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Connection failed.' });
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
          text: `Catalog sync: linked ${data.data.linked}, created ${data.data.created}, skipped ${data.data.skipped}.`,
        });
      } else {
        setMsg({ type: 'error', text: data.error || 'Sync failed' });
      }
      await load();
    } catch {
      setMsg({ type: 'error', text: 'Sync failed.' });
    } finally {
      setSyncing(null);
    }
  };

  const disconnect = async (provider: 'shopify' | 'woocommerce') => {
    if (!window.confirm('Disconnect this channel? Product links for this channel will be removed.')) return;
    try {
      const res = await fetch(`/api/integrations/ecommerce/disconnect?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'Disconnected.' });
        await load();
        await refreshSettings();
      } else {
        setMsg({ type: 'error', text: data.error || 'Failed to disconnect' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed to disconnect.' });
    }
  };

  const showShopifyCard = shopifyLayer || Boolean(shopify?.shopDomain);
  const showWooCard = wooLayer || Boolean(woo?.siteUrl);

  return (
    <section className="space-y-10">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">E-commerce channels</h2>
        <p className="text-sm text-gray-600">
          Choose which storefronts this tenant may use, then connect credentials. Secrets stay on the server; only
          preferences are stored in tenant settings.
        </p>
      </div>

      {!featureUnlocked && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-sm">
          In production, this feature requires a subscription plan that includes custom integrations.
        </div>
      )}

      {msg && (
        <div
          className={`p-3 text-sm border rounded-sm ${
            msg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      {(loading || settingsLoading) && !settings ? (
        <p className="text-gray-600 text-sm">Loading…</p>
      ) : null}

      <div className="border border-gray-300 p-5 rounded-sm bg-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Store integrations</h3>
        <p className="text-sm text-gray-600 mb-4">
          Turn on each channel your business uses. OAuth and API connect are only allowed for enabled channels.
        </p>
        <div className="space-y-4 max-w-xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 border-gray-400"
              checked={shopifyLayer}
              disabled={
                savingPrefs ||
                !featureUnlocked ||
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
              <span className="font-medium text-gray-900">Shopify</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Allow connecting a Shopify store for this tenant.
                {shopify?.shopDomain ? ' Disconnect first to turn this off.' : ''}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 border-gray-400"
              checked={wooLayer}
              disabled={
                savingPrefs ||
                !featureUnlocked ||
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
              <span className="font-medium text-gray-900">WooCommerce</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Allow connecting a WooCommerce site (REST API keys).
                {woo?.siteUrl ? ' Disconnect first to turn this off.' : ''}
              </span>
            </span>
          </label>
          {savingPrefs ? <p className="text-xs text-gray-500">Saving…</p> : null}
        </div>
      </div>

      {loading ? <p className="text-gray-600 text-sm">Loading channel status…</p> : null}

      {showShopifyCard ? (
        <div className="border border-gray-200 p-5 rounded-sm bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Shopify</h3>
          {shopify?.shopDomain ? (
            <div className="space-y-3 text-sm">
              <p>
                Store:{' '}
                <span className="font-mono bg-white px-2 py-0.5 border border-gray-200">{shopify.shopDomain}</span>
              </p>
              {!shopify.hasLocation ? (
                <p className="text-amber-800">No default inventory location detected; stock push may be skipped.</p>
              ) : null}
              {shopify.lastSyncAt ? (
                <p className="text-gray-600">Last catalog sync: {new Date(shopify.lastSyncAt).toLocaleString()}</p>
              ) : null}
              {shopify.lastError ? <p className="text-red-700">Last error: {shopify.lastError}</p> : null}
              <div className="flex gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  disabled={syncing !== null || !featureUnlocked}
                  onClick={() => sync('shopify')}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium disabled:opacity-50 border border-gray-900"
                >
                  {syncing === 'shopify' ? 'Syncing…' : 'Run catalog sync'}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect('shopify')}
                  className="px-4 py-2 border-2 border-gray-400 text-sm font-medium text-gray-800 hover:bg-gray-100"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : shopifyLayer ? (
            <div className="space-y-3 max-w-lg">
              <label className="block text-sm font-medium text-gray-700">Shop domain</label>
              <input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="w-full px-3 py-2 border-2 border-gray-300 text-sm bg-white"
              />
              <button
                type="button"
                disabled={!featureUnlocked || !normalizeShopifyShopDomain(shopDomain)}
                onClick={startShopify}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium disabled:opacity-50 border border-gray-900"
              >
                Connect with Shopify
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Shopify is connected but the store integration toggle is off. Turn Shopify on under Store integrations,
              or disconnect if you no longer use this channel.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 border border-dashed border-gray-300 p-4 rounded-sm">
          Enable <strong>Shopify</strong> above to connect a store.
        </p>
      )}

      {showWooCard ? (
        <div className="border border-gray-200 p-5 rounded-sm bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">WooCommerce</h3>
          {woo?.siteUrl ? (
            <div className="space-y-3 text-sm">
              <p>
                Site: <span className="font-mono bg-white px-2 py-0.5 border border-gray-200">{woo.siteUrl}</span>
              </p>
              {woo.lastSyncAt ? (
                <p className="text-gray-600">Last catalog sync: {new Date(woo.lastSyncAt).toLocaleString()}</p>
              ) : null}
              {woo.lastError ? <p className="text-red-700">Last error: {woo.lastError}</p> : null}
              <div className="flex gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  disabled={syncing !== null || !featureUnlocked}
                  onClick={() => sync('woocommerce')}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium disabled:opacity-50 border border-gray-900"
                >
                  {syncing === 'woocommerce' ? 'Syncing…' : 'Run catalog sync'}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect('woocommerce')}
                  className="px-4 py-2 border-2 border-gray-400 text-sm font-medium text-gray-800 hover:bg-gray-100"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : wooLayer ? (
            <div className="space-y-3 max-w-lg">
              <label className="block text-sm font-medium text-gray-700">Site URL</label>
              <input
                value={wooUrl}
                onChange={(e) => setWooUrl(e.target.value)}
                placeholder="https://your-wordpress-site.com"
                className="w-full px-3 py-2 border-2 border-gray-300 text-sm bg-white"
              />
              <label className="block text-sm font-medium text-gray-700">REST API consumer key</label>
              <input
                value={wooKey}
                onChange={(e) => setWooKey(e.target.value)}
                placeholder="ck_…"
                className="w-full px-3 py-2 border-2 border-gray-300 text-sm font-mono bg-white"
              />
              <label className="block text-sm font-medium text-gray-700">REST API consumer secret</label>
              <input
                value={wooSecret}
                onChange={(e) => setWooSecret(e.target.value)}
                placeholder="cs_…"
                type="password"
                className="w-full px-3 py-2 border-2 border-gray-300 text-sm font-mono bg-white"
              />
              <button
                type="button"
                disabled={!featureUnlocked || !wooUrl.trim() || !wooKey.trim() || !wooSecret.trim()}
                onClick={connectWoo}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium disabled:opacity-50 border border-gray-900"
              >
                Save and connect
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              WooCommerce is connected but the store integration toggle is off. Turn WooCommerce on under Store
              integrations, or disconnect if you no longer use this channel.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 border border-dashed border-gray-300 p-4 rounded-sm">
          Enable <strong>WooCommerce</strong> above to connect a site.
        </p>
      )}
    </section>
  );
}
