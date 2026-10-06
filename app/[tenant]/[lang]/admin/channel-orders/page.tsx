'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

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

const FULFILLMENT_BADGE: Record<string, string> = {
  unfulfilled: 'bg-win8-warning text-white',
  partial: 'bg-win8-suspended text-white',
  fulfilled: 'bg-win8-success text-white',
};

const COLS = 7;

const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ChannelOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('integrations.view');
  const canSync = canAccess('integrations.sync');

  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [status, setStatus] = useState('unfulfilled');
  const [fulfilling, setFulfilling] = useState<number | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const STATUS_OPTIONS = [
    { value: 'unfulfilled', label: dict?.admin?.statusUnfulfilled || 'Unfulfilled' },
    { value: 'partial', label: dict?.admin?.statusPartiallyFulfilled || 'Partially Fulfilled' },
    { value: 'all', label: dict?.admin?.statusAllOrders || 'All Orders' },
  ];

  const FULFILLMENT_LABEL: Record<string, string> = {
    unfulfilled: dict?.admin?.statusUnfulfilled || 'Unfulfilled',
    partial: dict?.admin?.statusPartial || 'Partial',
    fulfilled: dict?.admin?.statusFulfilled || 'Fulfilled',
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConnected(false);
    try {
      const res = await fetch(`/api/integrations/shopify/orders?status=${status}&limit=20`);
      const json = await res.json();
      if (json.success) setOrders(json.data);
      else if (json.code === 'SHOPIFY_NOT_CONNECTED') setNotConnected(true);
      else setError(json.error || dict?.admin?.failedToLoadOrders || 'Failed to load orders');
    } catch {
      setError(dict?.admin?.failedToLoadShopifyOrders || 'Failed to load Shopify orders');
    } finally {
      setLoading(false);
    }
  }, [status, dict]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleFulfill = async (orderId: number) => {
    setFulfilling(orderId);
    try {
      const res = await fetch(`/api/integrations/shopify/orders/${orderId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(dict?.admin?.orderFulfilled || 'Order fulfilled');
        fetchOrders();
      } else {
        showToast.error(json.error || dict?.admin?.fulfillmentFailed || 'Fulfillment failed');
      }
    } catch {
      showToast.error(dict?.admin?.fulfillmentFailed || 'Fulfillment failed');
    } finally {
      setFulfilling(null);
    }
  };

  const title = dict?.admin?.channelOrders || 'Channel Orders';
  const description = dict?.admin?.channelOrdersSubtitle || 'View and fulfill Shopify orders from POS';

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader icon={ShoppingCart} title={title} description={description} />
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict?.admin?.accessRestrictedChannelOrders || "You don't have permission to view channel orders. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const customerName = (o: ShopifyOrder) => {
    const c = o.customer;
    if (!c) return '—';
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
  };

  const fulfillmentKey = (fs: string | null) => fs || 'unfulfilled';

  const canFulfill = (o: ShopifyOrder) =>
    !o.fulfillment_status || o.fulfillment_status === 'unfulfilled' || o.fulfillment_status === 'partial';

  const headers = [
    dict?.admin?.channelOrderNumber || 'Order',
    dict?.admin?.customer || 'Customer',
    dict?.admin?.date || 'Date',
    dict?.admin?.fulfillmentStatus || 'Fulfillment Status',
    dict?.admin?.items || 'Items',
    dict?.admin?.total || 'Total',
    dict?.common?.actions || 'Actions',
  ];
  const rightAligned = new Set([4, 5, 6]);

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? (dict?.admin?.refreshingOrders || 'Refreshing…') : (dict?.admin?.refresh || 'Refresh')}
          </button>
        }
      />

      <div className="space-y-4">
        {/* Filter bar */}
        {!notConnected && (
          <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="channel-orders-status" className="block text-xs font-medium text-gray-600 mb-1">
                {dict?.admin?.fulfillmentStatus || 'Fulfillment Status'}
              </label>
              <select
                id="channel-orders-status"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900 w-52"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {!loading && !error && (
              <p className="ml-auto text-sm text-gray-500 pb-2">
                <span className="font-semibold text-gray-900 tabular-nums">{orders.length.toLocaleString()}</span>{' '}
                {dict?.admin?.ordersShown || 'orders shown'}
              </p>
            )}
          </div>
        )}

        {/* Orders */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingOrders || 'Loading orders…'}</p>
          </div>
        ) : notConnected ? (
          <div className="bg-brand-soft border border-brand p-6 text-sm text-brand-navy">
            <h2 className="text-base font-bold mb-1">{dict?.admin?.shopifyNotConnected || 'Shopify is not connected'}</h2>
            <p className="mb-4">
              {dict?.admin?.shopifyNotConnectedHint || 'Connect your Shopify store in Settings → E-commerce to view and fulfill its orders here.'}
            </p>
            <Link
              href={`/${tenant}/${lang}/settings?tab=ecommerce`}
              className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict?.admin?.connectShopify || 'Connect Shopify'}
            </Link>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{error}</p>
            <button
              onClick={fetchOrders}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400 bg-white border border-gray-300">
            {status !== 'all'
              ? (dict?.admin?.noOrdersMatchFilters || 'No orders match your filters.')
              : (dict?.admin?.noOrdersYet || 'No orders yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {headers.map((h, i) => (
                    <th key={h} className={`px-4 py-3 font-medium ${rightAligned.has(i) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map(order => {
                  const fsKey = fulfillmentKey(order.fulfillment_status);
                  const expanded = expandedOrder === order.id;
                  return (
                    <Fragment key={order.id}>
                      <tr className={`transition-colors ${expanded ? 'bg-brand-soft' : 'hover:bg-gray-100'}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{order.name}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <p>{customerName(order)}</p>
                          {order.customer?.email && customerName(order) !== order.customer.email && (
                            <p className="text-xs text-gray-400">{order.customer.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-semibold ${FULFILLMENT_BADGE[fsKey] || 'bg-gray-500 text-white'}`}>
                            {FULFILLMENT_LABEL[fsKey] || fsKey.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{order.line_items.length.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                          <span className="text-xs font-normal text-gray-500 mr-1">{order.currency}</span>
                          {money(parseFloat(order.total_price))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setExpandedOrder(expanded ? null : order.id)}
                              aria-expanded={expanded}
                              title={expanded ? (dict?.common?.hide || 'Hide') : (dict?.admin?.lineItems || 'Line Items')}
                              aria-label={expanded ? (dict?.common?.hide || 'Hide') : (dict?.admin?.lineItems || 'Line Items')}
                              className="inline-flex items-center justify-center p-2.5 text-white bg-brand-navy hover:brightness-110 transition-[filter]"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d={expanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
                              </svg>
                            </button>
                            {canSync && canFulfill(order) && (
                              <button
                                onClick={() => handleFulfill(order.id)}
                                disabled={fulfilling === order.id}
                                className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors whitespace-nowrap"
                              >
                                {fulfilling === order.id ? (dict?.admin?.fulfilling || 'Fulfilling…') : (dict?.admin?.fulfill || 'Fulfill')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={COLS} className="px-4 py-3 bg-gray-100">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              {dict?.admin?.lineItems || 'Line Items'}
                            </div>
                            <div className="bg-white border border-gray-300 p-3 overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="pb-2 text-left text-xs font-medium text-gray-500">{dict?.admin?.product || 'Product'}</th>
                                    <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict?.admin?.qty || 'Qty'}</th>
                                    <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict?.admin?.price || 'Price'}</th>
                                    <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict?.admin?.subtotal || 'Subtotal'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {order.line_items.map(li => (
                                    <tr key={li.id}>
                                      <td className="py-2 text-gray-900">
                                        {li.title}
                                        {li.variant_title && <span className="block text-xs text-gray-500">{li.variant_title}</span>}
                                      </td>
                                      <td className="py-2 text-right tabular-nums text-gray-700">{li.quantity.toLocaleString()}</td>
                                      <td className="py-2 text-right tabular-nums text-gray-700">{money(parseFloat(li.price))}</td>
                                      <td className="py-2 text-right tabular-nums text-gray-900">{money(parseFloat(li.price) * li.quantity)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
