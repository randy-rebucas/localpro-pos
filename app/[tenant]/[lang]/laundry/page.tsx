'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import Currency from '@/components/Currency';

// ── Service catalog ──────────────────────────────────────────────
interface ServiceDef {
  id: string;
  name: string;
  icon: string;
  unitPrice: number;
  pricingType: 'per_piece' | 'per_kg' | 'custom';
  category: string;
  defaultModifiers?: Partial<ItemModifiers>;
}

const SERVICES: ServiceDef[] = [
  { id: 'shirt',    name: 'Shirt',        icon: '👔', unitPrice: 2,  pricingType: 'per_piece', category: 'Garments' },
  { id: 'pants',    name: 'Pants',        icon: '👖', unitPrice: 4,  pricingType: 'per_piece', category: 'Garments' },
  { id: 'dress',    name: 'Dress / Gown', icon: '👗', unitPrice: 15, pricingType: 'per_piece', category: 'Garments' },
  { id: 'suit',     name: 'Suit',         icon: '🤵', unitPrice: 20, pricingType: 'per_piece', category: 'Garments' },
  { id: 'jacket',   name: 'Jacket',       icon: '🧥', unitPrice: 12, pricingType: 'per_piece', category: 'Garments' },
  { id: 'blanket',  name: 'Blanket',      icon: '🛏️', unitPrice: 8,  pricingType: 'per_piece', category: 'Bedding' },
  { id: 'duvet',    name: 'Duvet / Comforter', icon: '🪸', unitPrice: 10, pricingType: 'per_piece', category: 'Bedding' },
  { id: 'curtain',  name: 'Curtains',     icon: '🪟', unitPrice: 6,  pricingType: 'per_piece', category: 'Bedding' },
  { id: 'wf',       name: 'Wash & Fold',  icon: '⚖️', unitPrice: 3,  pricingType: 'per_kg',    category: 'Bulk' },
  { id: 'wh',       name: 'Wash & Hang',  icon: '🧺', unitPrice: 2.5, pricingType: 'per_kg',   category: 'Bulk' },
  { id: 'dryclean', name: 'Dry Clean',    icon: '✨', unitPrice: 18, pricingType: 'per_piece', category: 'Premium' },
  { id: 'alter',    name: 'Alterations',  icon: '✂️', unitPrice: 0,  pricingType: 'custom',    category: 'Premium' },
];

// ── Types ──────────────────────────────────────────────────────────
interface ItemModifiers {
  starchLevel: 'none' | 'light' | 'heavy';
  finish: 'folded' | 'hangered';
  stainTreatment: boolean;
  notes: string;
}

interface TicketItem {
  serviceId: string;
  serviceName: string;
  icon: string;
  unitPrice: number;
  pricingType: ServiceDef['pricingType'];
  quantity: number;
  weight?: number;
  subtotal: number;
  modifiers: ItemModifiers;
}

type OrderStatus = 'inbasket' | 'processing' | 'ready' | 'picked_up';

interface LaundryOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  items: TicketItem[];
  subtotal: number;
  total: number;
  status: OrderStatus;
  rackLocation?: string;
  readyBy: string;
  paymentStatus: 'pending' | 'paid';
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; dot: string; next?: OrderStatus; nextLabel?: string }> = {
  inbasket:   { label: 'In Basket',  color: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: 'bg-yellow-400', next: 'processing', nextLabel: 'Start Processing' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800 border-blue-200',       dot: 'bg-blue-400',   next: 'ready',      nextLabel: 'Mark Ready' },
  ready:      { label: 'Ready',      color: 'bg-green-100 text-green-800 border-green-200',    dot: 'bg-green-400 animate-pulse', next: 'picked_up', nextLabel: 'Mark Picked Up' },
  picked_up:  { label: 'Picked Up',  color: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
};

const DEFAULT_MODIFIERS: ItemModifiers = {
  starchLevel: 'none',
  finish: 'folded',
  stainTreatment: false,
  notes: '',
};

// Default ready-by: next day 5 PM
function defaultReadyBy(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(17, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function LaundryPOSPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const { settings } = useTenantSettings();
  const { confirm, Dialog } = useConfirm();

  // ── View state ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<OrderStatus | 'new'>('new');
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<LaundryOrder | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  // ── New order / ticket state ───────────────────────────────────
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [readyBy, setReadyBy] = useState(defaultReadyBy());
  const [orderNotes, setOrderNotes] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [rackInput, setRackInput] = useState('');

  // ── Modifier modal ─────────────────────────────────────────────
  const [modifierModal, setModifierModal] = useState<{ service: ServiceDef } | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<ItemModifiers>(DEFAULT_MODIFIERS);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingWeight, setPendingWeight] = useState('');
  const [pendingCustomPrice, setPendingCustomPrice] = useState('');

  // ── Order detail modal ─────────────────────────────────────────
  const [detailOrder, setDetailOrder] = useState<LaundryOrder | null>(null);
  const [rackEdit, setRackEdit] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const savingRef = useRef(false);

  // Live clock
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  // ── Load orders by status ──────────────────────────────────────
  const fetchOrders = useCallback(async (status: OrderStatus) => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/laundry/orders?tenant=${tenant}&status=${status}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
        setStatusCounts(data.statusCounts || {});
      }
    } catch {
      showToast.error('Failed to load orders');
    } finally {
      setLoadingOrders(false);
    }
  }, [tenant]);

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/laundry/orders?tenant=${tenant}&limit=1`);
      const data = await res.json();
      if (data.success) setStatusCounts(data.statusCounts || {});
    } catch { /* silent */ }
  }, [tenant]);

  useEffect(() => {
    if (activeTab !== 'new') fetchOrders(activeTab as OrderStatus);
    else refreshCounts();
  }, [activeTab, fetchOrders, refreshCounts]);

  // ── Ticket calculations ────────────────────────────────────────
  const ticketTotal = useMemo(
    () => ticketItems.reduce((sum, i) => sum + i.subtotal, 0),
    [ticketItems]
  );

  const itemCount = useMemo(
    () => ticketItems.reduce((sum, i) => sum + (i.pricingType === 'per_kg' ? 1 : i.quantity), 0),
    [ticketItems]
  );

  // ── Open modifier modal ────────────────────────────────────────
  const openModifier = (service: ServiceDef) => {
    setPendingModifiers({ ...DEFAULT_MODIFIERS });
    setPendingQty(1);
    setPendingWeight('');
    setPendingCustomPrice(service.pricingType === 'custom' ? '' : String(service.unitPrice));
    setModifierModal({ service });
  };

  const confirmAddItem = () => {
    if (!modifierModal) return;
    const svc = modifierModal.service;

    let qty = pendingQty;
    let weight: number | undefined;
    let unitPrice = svc.unitPrice;
    let subtotal = 0;

    if (svc.pricingType === 'per_kg') {
      weight = parseFloat(pendingWeight) || 0;
      if (weight <= 0) { showToast.error('Enter a valid weight'); return; }
      subtotal = Math.round(unitPrice * weight * 100) / 100;
      qty = 1;
    } else if (svc.pricingType === 'custom') {
      unitPrice = parseFloat(pendingCustomPrice) || 0;
      if (unitPrice <= 0) { showToast.error('Enter a valid price'); return; }
      subtotal = Math.round(unitPrice * qty * 100) / 100;
    } else {
      subtotal = Math.round(unitPrice * qty * 100) / 100;
    }

    const newItem: TicketItem = {
      serviceId: svc.id,
      serviceName: svc.name,
      icon: svc.icon,
      unitPrice,
      pricingType: svc.pricingType,
      quantity: qty,
      weight,
      subtotal,
      modifiers: { ...pendingModifiers },
    };

    setTicketItems(prev => [...prev, newItem]);
    setModifierModal(null);
  };

  const removeTicketItem = (index: number) => {
    setTicketItems(prev => prev.filter((_, i) => i !== index));
  };

  // ── Create order ───────────────────────────────────────────────
  const createOrder = async () => {
    if (savingRef.current) return;
    if (!customerName.trim()) { showToast.error('Enter customer name'); return; }
    if (!ticketItems.length) { showToast.error('Add at least one item'); return; }

    savingRef.current = true;
    setSavingOrder(true);
    try {
      const res = await fetch(`/api/laundry/orders?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          items: ticketItems,
          readyBy,
          notes: orderNotes,
          paymentStatus: 'pending',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(`Order ${data.data.orderNumber} created`);
        // Reset ticket
        setCustomerName('');
        setCustomerPhone('');
        setTicketItems([]);
        setReadyBy(defaultReadyBy());
        setOrderNotes('');
        setRackInput('');
        refreshCounts();
      } else {
        showToast.error(data.error || 'Failed to create order');
      }
    } catch {
      showToast.error('Network error');
    } finally {
      savingRef.current = false;
      setSavingOrder(false);
    }
  };

  // ── Advance order status ───────────────────────────────────────
  const advanceStatus = async (order: LaundryOrder, nextStatus: OrderStatus) => {
    setUpdatingStatus(true);
    try {
      const body: Record<string, unknown> = { status: nextStatus };
      if (rackEdit) body.rackLocation = rackEdit;
      if (nextStatus === 'ready') body.notifiedAt = new Date().toISOString();

      const res = await fetch(`/api/laundry/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(`Order moved to ${STATUS_CONFIG[nextStatus].label}`);
        setDetailOrder(null);
        fetchOrders(activeTab as OrderStatus);
      } else {
        showToast.error(data.error || 'Failed to update order');
      }
    } catch {
      showToast.error('Network error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveRackLocation = async (order: LaundryOrder) => {
    if (!rackEdit.trim()) return;
    try {
      await fetch(`/api/laundry/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rackLocation: rackEdit }),
      });
      showToast.success('Rack location saved');
      fetchOrders(activeTab as OrderStatus);
    } catch {
      showToast.error('Failed to save rack');
    }
  };

  // ── Modifier label helper ──────────────────────────────────────
  const modifierSummary = (m: ItemModifiers) => {
    const parts: string[] = [];
    if (m.starchLevel !== 'none') parts.push(`Starch: ${m.starchLevel}`);
    if (m.finish === 'hangered') parts.push('Hangered');
    if (m.stainTreatment) parts.push('Stain Tx');
    return parts.join(' · ') || 'No extras';
  };

  const formatReadyBy = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Group services by category
  const serviceCategories = useMemo(() => {
    const map = new Map<string, ServiceDef[]>();
    SERVICES.forEach(s => {
      const list = map.get(s.category) || [];
      list.push(s);
      map.set(s.category, list);
    });
    return Array.from(map.entries());
  }, []);

  const tabs: Array<{ key: OrderStatus | 'new'; label: string; icon: string }> = [
    { key: 'new',        label: 'New Order',  icon: '➕' },
    { key: 'inbasket',   label: 'In Basket',  icon: '🧺' },
    { key: 'processing', label: 'Processing', icon: '🔄' },
    { key: 'ready',      label: 'Ready',      icon: '✅' },
    { key: 'picked_up',  label: 'Picked Up',  icon: '🏠' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <Navbar />

      {/* ── Register Header ── */}
      <header className="flex-shrink-0 bg-gray-900 text-white px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-blue-500 flex items-center justify-center flex-shrink-0 text-base">🧺</div>
          <div>
            <p className="font-bold text-sm leading-tight">{settings?.companyName || 'Laundry POS'}</p>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {currentTime}</p>
          </div>
        </div>
        <button
          onClick={() => router.push(`/${tenant}/en`)}
          className="p-2 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors text-xs flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Exit
        </button>
      </header>

      {/* ── Workflow Tabs ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 flex overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedOrder(null); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.key !== 'new' && statusCounts[tab.key] ? (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                tab.key === 'ready' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {statusCounts[tab.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ NEW ORDER VIEW ══ */}
        {activeTab === 'new' && (
          <>
            {/* Left: Service intake grid */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {serviceCategories.map(([category, services]) => (
                  <div key={category}>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{category}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {services.map(svc => (
                        <button
                          key={svc.id}
                          onClick={() => openModifier(svc)}
                          className="bg-white border border-gray-200 hover:border-green-400 hover:bg-green-50 hover:shadow-md transition-all p-3 flex flex-col items-center gap-1.5 group"
                        >
                          <span className="text-2xl group-hover:scale-110 transition-transform">{svc.icon}</span>
                          <span className="text-xs font-semibold text-gray-800 text-center leading-tight">{svc.name}</span>
                          <span className="text-xs text-green-600 font-bold">
                            {svc.pricingType === 'per_kg'
                              ? `$${svc.unitPrice}/kg`
                              : svc.pricingType === 'custom'
                              ? 'Custom'
                              : `$${svc.unitPrice}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom action buttons */}
              <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 flex gap-2">
                <button
                  disabled={!ticketItems.length}
                  onClick={() => showToast.success('Tag print queued (printer integration required)')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold border-2 border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  🏷️ Print Heat-Seal Tags
                </button>
                <button
                  disabled={!ticketItems.length || !customerPhone}
                  onClick={() => showToast.success('SMS queued (gateway integration required)')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold border-2 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  💬 Send SMS Notif
                </button>
              </div>
            </div>

            {/* Right: Customer ticket */}
            <div className="w-72 lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white shadow-xl">

              {/* Customer info */}
              <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200 px-4 py-3 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</p>
                <input
                  type="text"
                  placeholder="Customer Name *"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value.slice(0, 100))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white placeholder:text-gray-400"
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value.slice(0, 30))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white placeholder:text-gray-400"
                />
              </div>

              {/* Ticket items */}
              <div className="flex-1 overflow-y-auto">
                {ticketItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                    <span className="text-4xl mb-3">🧺</span>
                    <p className="text-gray-400 text-sm">No items yet</p>
                    <p className="text-gray-300 text-xs mt-1">Tap a service to add it</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {ticketItems.map((item, idx) => (
                      <div key={idx} className="px-4 py-2.5 flex items-start gap-2 hover:bg-gray-50 group">
                        <span className="text-lg flex-shrink-0 mt-0.5">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-gray-900">
                              {item.serviceName}
                              {item.pricingType === 'per_kg'
                                ? ` — ${item.weight}kg`
                                : ` ×${item.quantity}`}
                            </p>
                            <span className="text-xs font-bold text-gray-900 tabular-nums flex-shrink-0">
                              <Currency amount={item.subtotal} />
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">{modifierSummary(item.modifiers)}</p>
                        </div>
                        <button
                          onClick={() => removeTicketItem(idx)}
                          className="p-0.5 text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ticket footer */}
              <div className="flex-shrink-0 border-t border-gray-200">
                <div className="px-4 py-3 space-y-2">
                  {/* Ready by */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap font-medium w-16">Ready by</label>
                    <input
                      type="datetime-local"
                      value={readyBy}
                      onChange={e => setReadyBy(e.target.value)}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                    />
                  </div>
                  {/* Notes */}
                  <textarea
                    placeholder="Order notes…"
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value.slice(0, 500))}
                    rows={2}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white resize-none placeholder:text-gray-400"
                  />
                </div>

                {/* Total + create */}
                <div className="px-4 pb-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-green-600 tabular-nums"><Currency amount={ticketTotal} /></span>
                  </div>
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={createOrder}
                    disabled={savingOrder || !customerName.trim() || !ticketItems.length}
                    className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-3.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 rounded shadow-sm shadow-green-200"
                  >
                    {savingOrder ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
                    ) : (
                      <>📋 Create Order</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══ ORDER LIST VIEWS ══ */}
        {activeTab !== 'new' && (
          <>
            {/* Orders list */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingOrders ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="text-5xl mb-4">🧺</span>
                  <p className="text-gray-500 font-medium">No orders in {STATUS_CONFIG[activeTab as OrderStatus].label}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {orders.map(order => {
                    const cfg = STATUS_CONFIG[order.status];
                    return (
                      <button
                        key={order._id}
                        onClick={() => { setDetailOrder(order); setRackEdit(order.rackLocation || ''); }}
                        className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all p-4 text-left group"
                      >
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{order.orderNumber}</p>
                            <p className="text-xs text-gray-500">{order.customerName}</p>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0 ${cfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </div>

                        {/* Items summary */}
                        <div className="text-xs text-gray-500 mb-2 space-y-0.5">
                          {order.items.slice(0, 3).map((item, i) => (
                            <p key={i} className="truncate">
                              {(item as unknown as TicketItem).icon} {item.serviceName}
                              {(item as unknown as TicketItem).pricingType === 'per_kg'
                                ? ` — ${item.weight}kg`
                                : ` ×${item.quantity}`}
                            </p>
                          ))}
                          {order.items.length > 3 && (
                            <p className="text-gray-400">+{order.items.length - 3} more</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-400">Ready by</p>
                            <p className="text-xs font-semibold text-gray-700">{formatReadyBy(order.readyBy)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-blue-600"><Currency amount={order.total} /></p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              order.paymentStatus === 'paid'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>{order.paymentStatus}</span>
                          </div>
                        </div>

                        {order.rackLocation && (
                          <div className="mt-2 flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200">
                            📍 Rack: <span className="font-bold">{order.rackLocation}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected order quick panel */}
            {selectedOrder && (
              <div className="w-72 lg:w-80 flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-xl">
                {/* content same as detail modal but inline */}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modifier Modal ── */}
      {modifierModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModifierModal(null)}>
          <div className="bg-white w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{modifierModal.service.icon}</span>
                <div>
                  <p className="font-bold text-gray-900">{modifierModal.service.name}</p>
                  <p className="text-xs text-gray-500">Set options before adding</p>
                </div>
              </div>
              <button onClick={() => setModifierModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Quantity or weight */}
              {modifierModal.service.pricingType === 'per_kg' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Weight (kg) *</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="0.0"
                    value={pendingWeight}
                    onChange={e => setPendingWeight(e.target.value)}
                    className="w-full px-3 py-2.5 text-lg font-bold text-center border-2 border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 text-center mt-1">@ ${modifierModal.service.unitPrice}/kg</p>
                </div>
              ) : modifierModal.service.pricingType === 'custom' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Price ($) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={pendingCustomPrice}
                    onChange={e => setPendingCustomPrice(e.target.value)}
                    className="w-full px-3 py-2.5 text-lg font-bold text-center border-2 border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Quantity</label>
                  <div className="flex items-center border-2 border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setPendingQty(q => Math.max(1, q - 1))}
                      className="px-4 py-2.5 hover:bg-gray-100 font-bold text-xl transition-colors"
                    >−</button>
                    <span className="flex-1 text-center font-bold text-xl py-2.5">{pendingQty}</span>
                    <button
                      onClick={() => setPendingQty(q => q + 1)}
                      className="px-4 py-2.5 hover:bg-gray-100 font-bold text-xl transition-colors"
                    >+</button>
                  </div>
                </div>
              )}

              {/* Starch level */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Starch Level</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['none', 'light', 'heavy'] as const).map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setPendingModifiers(m => ({ ...m, starchLevel: lvl }))}
                      className={`py-2 text-xs font-semibold border-2 rounded transition-colors capitalize ${
                        pendingModifiers.starchLevel === lvl
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {lvl === 'none' ? 'None' : lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Finish */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Finish</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['folded', 'hangered'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setPendingModifiers(m => ({ ...m, finish: f }))}
                      className={`py-2 text-xs font-semibold border-2 rounded transition-colors capitalize ${
                        pendingModifiers.finish === f
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {f === 'folded' ? '📦 Folded' : '🪝 Hangered'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stain treatment */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setPendingModifiers(m => ({ ...m, stainTreatment: !m.stainTreatment }))}
                  className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    pendingModifiers.stainTreatment ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    pendingModifiers.stainTreatment ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </div>
                <span className="text-sm font-medium text-gray-700">Stain Treatment</span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Special Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. gentle cycle, no bleach…"
                  value={pendingModifiers.notes}
                  onChange={e => setPendingModifiers(m => ({ ...m, notes: e.target.value.slice(0, 200) }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setModifierModal(null)}
                className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddItem}
                className="flex-1 py-3 text-sm font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors rounded shadow-sm shadow-green-200"
              >
                Add to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Detail Modal ── */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailOrder(null)}>
          <div className="bg-white w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-lg">{detailOrder.orderNumber}</p>
                <p className="text-sm text-gray-600">{detailOrder.customerName}{detailOrder.customerPhone ? ` · ${detailOrder.customerPhone}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${STATUS_CONFIG[detailOrder.status].color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[detailOrder.status].dot}`} />
                  {STATUS_CONFIG[detailOrder.status].label}
                </span>
                <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 transition-colors ml-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Items */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Items</p>
                <div className="space-y-2">
                  {detailOrder.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 bg-gray-50 p-3 rounded">
                      <span className="text-xl flex-shrink-0">{(item as unknown as TicketItem).icon || '🧺'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.serviceName}
                            {(item as unknown as TicketItem).pricingType === 'per_kg'
                              ? ` — ${item.weight}kg`
                              : ` ×${item.quantity}`}
                          </p>
                          <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">
                            <Currency amount={item.subtotal} />
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {modifierSummary(item.modifiers as ItemModifiers)}
                        </p>
                        {item.modifiers.notes && (
                          <p className="text-xs text-blue-600 mt-0.5 italic">"{item.modifiers.notes}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-400 mb-0.5">Ready By</p>
                  <p className="font-semibold text-gray-900">{formatReadyBy(detailOrder.readyBy)}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-400 mb-0.5">Payment</p>
                  <p className={`font-semibold capitalize ${detailOrder.paymentStatus === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {detailOrder.paymentStatus}
                  </p>
                </div>
              </div>

              {/* Rack location */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Rack / Slot Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Rack B, Slot 42"
                    value={rackEdit}
                    onChange={e => setRackEdit(e.target.value.slice(0, 50))}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                  />
                  <button
                    onClick={() => saveRackLocation(detailOrder)}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded transition-colors"
                  >
                    Save
                  </button>
                </div>
                {detailOrder.rackLocation && (
                  <p className="text-xs text-amber-600 mt-1">📍 Current: {detailOrder.rackLocation}</p>
                )}
              </div>

              {detailOrder.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <p className="text-xs font-bold text-yellow-700 mb-0.5">Order Notes</p>
                  <p className="text-sm text-yellow-800">{detailOrder.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-200 px-5 py-4 space-y-2">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-green-600"><Currency amount={detailOrder.total} /></span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {detailOrder.status === 'ready' && (
                  <button
                    onClick={() => showToast.success('SMS queued (gateway integration required)')}
                    className="flex-1 py-2.5 text-sm font-semibold border-2 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors rounded"
                  >
                    💬 Notify Customer
                  </button>
                )}
                {STATUS_CONFIG[detailOrder.status].next && (
                  <button
                    onClick={() => advanceStatus(detailOrder, STATUS_CONFIG[detailOrder.status].next!)}
                    disabled={updatingStatus}
                    className="flex-1 py-2.5 text-sm font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors disabled:opacity-50 rounded flex items-center justify-center gap-2 shadow-sm shadow-green-200"
                  >
                    {updatingStatus
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <span>→ {STATUS_CONFIG[detailOrder.status].nextLabel}</span>
                    }
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {Dialog}
    </div>
  );
}
