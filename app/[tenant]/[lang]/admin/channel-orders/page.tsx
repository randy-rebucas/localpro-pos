'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShoppingCart, RefreshCw, Package } from 'lucide-react';

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

const STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'partial', label: 'Partially Fulfilled' },
  { value: 'all', label: 'All Orders' },
];

export default function ChannelOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;

  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('unfulfilled');
  const [fulfilling, setFulfilling] = useState<number | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/shopify/orders?status=${status}&limit=20`);
      const json = await res.json();
      if (json.success) setOrders(json.data);
      else toast.error(json.error || 'Failed to load orders');
    } catch {
      toast.error('Failed to load Shopify orders');
    } finally {
      setLoading(false);
    }
  }, [status]);

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
        toast.success('Order fulfilled');
        fetchOrders();
      } else {
        toast.error(json.error || 'Fulfillment failed');
      }
    } catch {
      toast.error('Fulfillment failed');
    } finally {
      setFulfilling(null);
    }
  };

  const customerName = (o: ShopifyOrder) => {
    const c = o.customer;
    if (!c) return '—';
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
  };

  const fulfillmentBadge = (fs: string | null) => {
    if (!fs || fs === 'unfulfilled') return <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 border border-yellow-200">Unfulfilled</span>;
    if (fs === 'partial') return <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 border border-orange-200">Partial</span>;
    if (fs === 'fulfilled') return <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 border border-green-200">Fulfilled</span>;
    return <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 border border-gray-200">{fs}</span>;
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Channel Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">View and fulfill Shopify orders from POS</p>
          </div>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left sidebar */}
        <aside className="w-52 shrink-0 sticky top-6 space-y-4">
          <div className="bg-white border border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filters</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fulfillment Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stats */}
          {!loading && (
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Results</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">orders shown</p>
            </div>
          )}
        </aside>

        {/* Right — orders table */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Shopify Orders</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
                  <p className="text-sm text-gray-400">Loading orders...</p>
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">No orders found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map(order => (
                  <div key={order.id}>
                    <div
                      className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">{order.name}</span>
                          {fulfillmentBadge(order.fulfillment_status)}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {customerName(order)} · {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {order.currency} {parseFloat(order.total_price).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">{order.line_items.length} item{order.line_items.length !== 1 ? 's' : ''}</p>
                      </div>
                      {(!order.fulfillment_status || order.fulfillment_status === 'unfulfilled' || order.fulfillment_status === 'partial') && (
                        <button
                          onClick={e => { e.stopPropagation(); handleFulfill(order.id); }}
                          disabled={fulfilling === order.id}
                          className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors shrink-0"
                        >
                          {fulfilling === order.id ? 'Fulfilling...' : 'Fulfill'}
                        </button>
                      )}
                    </div>

                    {expandedOrder === order.id && (
                      <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Line Items</p>
                        <div className="space-y-1">
                          {order.line_items.map(li => (
                            <div key={li.id} className="flex justify-between text-sm text-gray-700">
                              <span>{li.title}{li.variant_title ? ` — ${li.variant_title}` : ''} × {li.quantity}</span>
                              <span>{order.currency} {(parseFloat(li.price) * li.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
