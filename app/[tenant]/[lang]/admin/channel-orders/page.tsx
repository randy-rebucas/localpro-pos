'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronDown, Package, PackageCheck, PlugZap, RefreshCw, Truck } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_KEY, DARK_LABEL, HINT, INPUT, KEY, KEY_PRIMARY, LABEL,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';

interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  variant_title?: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  customer?: { first_name?: string; last_name?: string; email?: string };
  line_items: ShopifyLineItem[];
}

type StatusFilter = 'unfulfilled' | 'partial' | 'all';

/** The most the orders API returns in one go. */
const ORDER_LIMIT = 50;

const FILTER_KEY = 'flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-3 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation';

const needsFulfilling = (o: ShopifyOrder) => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled' || o.fulfillment_status === 'partial';

export default function ChannelOrdersPage() {
  const { settings: tenantSettings } = useTenantSettings();
  const dateSettings = tenantSettings || getDefaultTenantSettings();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const dictRef = useRef<TranslationDict | null>(null);
  dictRef.current = dict;
  const { canAccess } = usePermissions();
  const canManage = canAccess('integrations.manage');

  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('unfulfilled');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [fulfillTarget, setFulfillTarget] = useState<ShopifyOrder | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // The dictionary is read through a ref, so its arrival does not fetch the orders again.
  const fetchOrders = useCallback(async () => {
    const admin = dictRef.current?.admin;
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/shopify/orders?status=${status}&limit=${ORDER_LIMIT}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setOrders(json.data || []);
        setNotConnected(false);
      } else if (json.code === 'not_connected') {
        setOrders([]);
        setNotConnected(true);
      } else {
        toast.error(json.error || admin?.failedToLoadOrders || 'Failed to load orders');
      }
    } catch {
      toast.error(admin?.failedToLoadShopifyOrders || 'Failed to load Shopify orders');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [status]);

  useEffect(() => {
    if (canManage) fetchOrders();
  }, [canManage, fetchOrders]);

  if (!dict) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const title = t('channelOrders', 'Channel Orders');

  if (!canManage) {
    return (
      <RegisterPage tagNo="CH" title={title}>
        <div className="mt-6">
          <Strip tone="error">{t('accessRestrictedChannelOrders', "You don't have permission to view channel orders. Contact an admin or owner.")}</Strip>
        </div>
      </RegisterPage>
    );
  }

  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const money = (amount: number, currency: string) => {
    try {
      // narrowSymbol prints ₱ in Spanish too, where the default would spell out "PHP".
      return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };
  const customerName = (o: ShopifyOrder) => {
    const c = o.customer;
    if (!c) return t('guestCustomer', 'Guest');
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || t('guestCustomer', 'Guest');
  };
  const itemCount = (o: ShopifyOrder) => {
    const n = o.line_items.reduce((sum, li) => sum + li.quantity, 0);
    return `${n} ${n === 1 ? t('itemSingular', 'item') : t('itemPlural', 'items')}`;
  };
  const statusTag = (fs: string | null) => {
    const base = 'inline-block whitespace-nowrap px-1.5 py-0.5 font-receipt text-[11px] uppercase';
    if (!fs || fs === 'unfulfilled') return <span className={`${base} border border-ink/40 text-ink`}>{t('statusUnfulfilled', 'Unfulfilled')}</span>;
    if (fs === 'partial') return <span className={`${base} border border-dashed border-stamp text-stamp`}>{t('statusPartial', 'Partial')}</span>;
    if (fs === 'fulfilled') return <span className={`${base} border border-ink bg-ink text-paper-white`}>{t('statusFulfilled', 'Fulfilled')}</span>;
    return <span className={`${base} border border-ink/25 text-ink/60`}>{fs}</span>;
  };

  const filters: { value: StatusFilter; label: string }[] = [
    { value: 'unfulfilled', label: t('statusUnfulfilled', 'Unfulfilled') },
    { value: 'partial', label: t('statusPartiallyFulfilled', 'Partially Fulfilled') },
    { value: 'all', label: t('statusAllOrders', 'All Orders') },
  ];
  const toPack = orders.filter(needsFulfilling).length;

  return (
    <RegisterPage
      tagNo="CH"
      tag={tenantSettings?.companyName}
      title={title}
      subtitle={t('channelOrdersSubtitle', 'View and fulfill Shopify orders from POS')}
      side={<LedReadout value={toPack} label={t('ordersToPack', 'To pack')} />}
    >
      {/* Which paid Shopify orders to show */}
      {!notConnected && (<>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <fieldset className="min-w-0 flex-1">
          <legend className={DARK_LABEL}>{t('fulfillmentStatus', 'Fulfillment Status')}</legend>
          <div className="grid grid-cols-1 border-l border-t border-white/25 sm:inline-grid sm:grid-cols-3">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setStatus(f.value)}
                className={`${FILTER_KEY} ${status === f.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" onClick={fetchOrders} disabled={loading} className={DARK_KEY}>
          <RefreshCw className={`${ICON} ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
          {t('refresh', 'Refresh')}
        </button>
      </div>
      <p className="mt-3 font-receipt text-xs text-white/60">{t('paidOpenOrdersHint', 'Paid, open orders from your Shopify store, newest first.')}</p>
      </>)}

      {notConnected ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-10 text-center text-ink">
            <PlugZap className="mx-auto mb-2 h-8 w-8 text-ink/30" strokeWidth={1.75} aria-hidden />
            <h2 className="text-2xl sm:text-3xl">{t('shopifyNotConnected', 'Shopify is not connected')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink/70">{t('shopifyNotConnectedDesc', 'Connect your Shopify store to pack and ship its orders from here.')}</p>
            <Link href={`/${tenant}/${lang}/settings?tab=ecommerce`} className={`${KEY_PRIMARY} mx-auto mt-4 w-fit`}>
              <PlugZap className={ICON} strokeWidth={1.75} aria-hidden />
              {t('connectShopify', 'Connect Shopify')}
            </Link>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <section className="mt-6" aria-busy={loading} aria-labelledby="channel-orders-title">
          <div className={`bg-paper-white text-ink transition-opacity ${loading && loadedOnce ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3">
              <h2 id="channel-orders-title" className="text-2xl sm:text-3xl">{t('shopifyOrders', 'Shopify Orders')}</h2>
              <p className="font-receipt text-xs text-ink/60">{orders.length} {t('ordersShown', 'orders shown')}</p>
            </div>

            {!loadedOnce ? (
              <div className="flex justify-center px-4 py-14"><LoadingSpinner size="md" color="#2d868a" /></div>
            ) : orders.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Package className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{t('noOrdersFound', 'No orders found')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/20">
                {orders.map((order) => {
                  const open = expanded === order.id;
                  const panelId = `order-${order.id}-items`;
                  return (
                    <li key={order.id}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : order.id)}
                          aria-expanded={open}
                          aria-controls={panelId}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left touch-manipulation"
                        >
                          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-ink/50 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} strokeWidth={1.75} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-receipt text-sm font-semibold">{order.name}</span>
                              {statusTag(order.fulfillment_status)}
                            </span>
                            <span className="mt-0.5 block text-sm">{customerName(order)}</span>
                            <span className="block font-receipt text-xs text-ink/60">{formatDateTime(order.created_at, dateSettings)} · {itemCount(order)}</span>
                          </span>
                          <span className="shrink-0 font-receipt text-base font-semibold">{money(parseFloat(order.total_price), order.currency)}</span>
                        </button>
                        {needsFulfilling(order) && (
                          <button type="button" onClick={() => setFulfillTarget(order)} className={`${KEY_PRIMARY} w-full sm:w-auto`}>
                            <Truck className={ICON} strokeWidth={1.75} aria-hidden />
                            {t('fulfill', 'Fulfill')}
                          </button>
                        )}
                      </div>
                      {open && (
                        <div id={panelId} className="border-t border-dashed border-ink/20 bg-paper/60 px-4 py-3 sm:pl-11">
                          <p className={LABEL}>{t('lineItems', 'Line Items')}</p>
                          <div className="space-y-1 font-receipt text-sm">
                            {order.line_items.map((li) => (
                              <ReceiptRow
                                key={li.id}
                                label={`${li.quantity} × ${li.title}${li.variant_title ? ` — ${li.variant_title}` : ''}`}
                                value={money(parseFloat(li.price) * li.quantity, order.currency)}
                              />
                            ))}
                            <div className="border-t border-dashed border-ink/30 pt-1">
                              <ReceiptRow strong label={t('orderTotal', 'Order total')} value={money(parseFloat(order.total_price), order.currency)} />
                            </div>
                          </div>
                          {order.customer?.email && <p className={HINT}>{order.customer.email}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {orders.length >= ORDER_LIMIT && (
              <p className="border-t border-dashed border-ink/30 px-4 py-3 font-receipt text-xs text-ink/60">
                {t('ordersLimitNote', 'Showing the newest {count} orders. Fulfill some to see older ones.').replace('{count}', String(ORDER_LIMIT))}
              </p>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      )}

      {fulfillTarget && (
        <FulfillSheet
          order={fulfillTarget}
          dict={dict}
          money={money}
          onClose={() => setFulfillTarget(null)}
          onDone={async () => {
            setFulfillTarget(null);
            await fetchOrders();
          }}
        />
      )}
    </RegisterPage>
  );
}

/** The packing slip: what goes in the box, optional tracking, then one irreversible key. */
function FulfillSheet({ order, dict, money, onClose, onDone }: {
  order: ShopifyOrder;
  dict: TranslationDict;
  money: (amount: number, currency: string) => string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCompany, setTrackingCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/integrations/shopify/orders/${order.id}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim() || undefined,
          trackingCompany: trackingCompany.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        toast.success(t('orderFulfilled', 'Order fulfilled'));
        await onDone();
      } else {
        setError(json.error || t('fulfillmentFailed', 'Fulfillment failed'));
      }
    } catch {
      setError(t('fulfillmentFailed', 'Fulfillment failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      wide
      title={`${t('fulfill', 'Fulfill')} ${order.name}`}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="fulfill-form" disabled={submitting} className={KEY_PRIMARY}>
            <PackageCheck className={ICON} strokeWidth={1.75} aria-hidden />
            {submitting ? t('fulfilling', 'Fulfilling...') : t('fulfillAndNotify', 'Fulfill and notify')}
          </button>
        </>
      }
    >
      <form id="fulfill-form" onSubmit={submit} className="space-y-4">
        <div>
          <p className={LABEL}>{t('lineItems', 'Line Items')}</p>
          <div className="space-y-1 font-receipt text-sm">
            {order.line_items.map((li) => (
              <ReceiptRow key={li.id} label={`${li.quantity} × ${li.title}${li.variant_title ? ` — ${li.variant_title}` : ''}`} value={money(parseFloat(li.price) * li.quantity, order.currency)} />
            ))}
            <div className="border-t border-dashed border-ink/30 pt-1">
              <ReceiptRow strong label={t('orderTotal', 'Order total')} value={money(parseFloat(order.total_price), order.currency)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fulfill-tracking" className={LABEL}>{t('trackingNumber', 'Tracking number')} ({dict.common?.optional || 'optional'})</label>
            <input id="fulfill-tracking" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className={`${INPUT} font-receipt`} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="fulfill-carrier" className={LABEL}>{t('trackingCompany', 'Carrier')} ({dict.common?.optional || 'optional'})</label>
            <input id="fulfill-carrier" value={trackingCompany} onChange={(e) => setTrackingCompany(e.target.value)} className={INPUT} autoComplete="off" />
          </div>
        </div>

        <div className="border-l-4 border-stamp bg-stamp/5 px-3 py-2 text-sm">
          {t('fulfillWarning', 'Shopify marks every remaining item as shipped and emails the customer. This cannot be undone here.')}
        </div>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
