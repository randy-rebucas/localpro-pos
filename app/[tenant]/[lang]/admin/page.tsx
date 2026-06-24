'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, ShoppingCart, Package, Users, ArrowRight, AlertTriangle,
  Receipt, Plus, BarChart2, ShieldCheck, Boxes, CalendarClock, Loader2,
  Store,
} from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';

interface RecentTx {
  _id: string;
  receiptNumber?: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  customerName?: string;
}

interface DashboardData {
  todayRevenue: number;
  todayTransactions: number;
  totalProducts: number;
  totalCustomers: number;
  recentTransactions: RecentTx[];
  lowStockCount: number;
  expiringCount: number;
}

function fmt(n: number | undefined | null, symbol: string) {
  const safe = isFinite(Number(n)) ? Number(n) : 0;
  return `${symbol ?? ''}${safe.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminDashboard() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { user } = useAuth();
  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();

  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#35979c';
  const currencySymbol = tenantSettings.currencySymbol || '₱';
  const businessType = tenantSettings.businessType;
  const base = `/${tenant}/${lang}`;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const todayStr = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const fetchDashboard = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = today.toISOString();
      const endDate = new Date().toISOString();

      const [txRes, productsRes, customersRes, lowStockRes] = await Promise.allSettled([
        fetch(`/api/transactions?startDate=${startDate}&endDate=${endDate}&limit=5`),
        fetch(`/api/products?limit=1`),
        fetch(`/api/customers?limit=1`),
        fetch(`/api/products?lowStock=true&limit=1`),
      ]);

      let todayRevenue = 0;
      let todayTransactions = 0;
      let recentTransactions: RecentTx[] = [];
      let totalProducts = 0;
      let totalCustomers = 0;
      let lowStockCount = 0;

      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const json = await txRes.value.json();
        if (json.success) {
          recentTransactions = (json.transactions || json.data || []).slice(0, 5);
          todayTransactions = json.total ?? recentTransactions.length;
          todayRevenue = recentTransactions.reduce((s: number, t: RecentTx) => s + (t.totalAmount || 0), 0);
        }
      }
      if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
        const json = await productsRes.value.json();
        totalProducts = json.total ?? json.count ?? 0;
      }
      if (customersRes.status === 'fulfilled' && customersRes.value.ok) {
        const json = await customersRes.value.json();
        totalCustomers = json.total ?? json.count ?? 0;
      }
      if (lowStockRes.status === 'fulfilled' && lowStockRes.value.ok) {
        const json = await lowStockRes.value.json();
        lowStockCount = json.total ?? json.count ?? 0;
      }

      let expiringCount = 0;
      if (businessType === 'pharmacy') {
        try {
          const expRes = await fetch(`/api/reports/expiry?days=30`);
          if (expRes.ok) {
            const j = await expRes.json();
            expiringCount = (j.expiring?.length ?? 0) + (j.expired?.length ?? 0);
          }
        } catch { /* ignore */ }
      }

      setData({ todayRevenue, todayTransactions, totalProducts, totalCustomers, recentTransactions, lowStockCount, expiringCount });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tenant, businessType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const stats = [
    {
      label: "Today's Revenue",
      value: data ? fmt(data.todayRevenue, currencySymbol) : '—',
      sub: `${data?.todayTransactions ?? 0} transactions`,
      icon: TrendingUp,
      accent: '#10b981',
      bg: '#f0fdf4',
    },
    {
      label: 'Transactions Today',
      value: data ? data.todayTransactions.toLocaleString() : '—',
      sub: 'Completed sales',
      icon: ShoppingCart,
      accent: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      label: 'Total Products',
      value: data ? data.totalProducts.toLocaleString() : '—',
      sub: data?.lowStockCount ? `${data.lowStockCount} low stock` : 'All stocked',
      icon: Package,
      accent: '#3b82f6',
      bg: '#eff6ff',
    },
    {
      label: 'Total Customers',
      value: data ? data.totalCustomers.toLocaleString() : '—',
      sub: 'Registered accounts',
      icon: Users,
      accent: '#8b5cf6',
      bg: '#f5f3ff',
    },
  ];

  const quickActions = [
    { label: 'New Transaction', href: base, icon: Store, primary: true },
    { label: 'Add Product', href: `${base}/admin/products`, icon: Plus, primary: false },
    { label: 'View Reports', href: `${base}/admin/reports`, icon: BarChart2, primary: false },
    { label: 'Compliance Status', href: `${base}/admin/compliance`, icon: ShieldCheck, primary: false },
    { label: 'Transactions', href: `${base}/admin/transactions`, icon: Receipt, primary: false },
    { label: 'Inventory', href: `${base}/admin/inventory`, icon: Boxes, primary: false },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {greeting()}, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-gray-600">{todayStr}</p>
          </div>
          <Link
            href={base}
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: primaryColor }}
          >
            <Store className="w-4 h-4" />
            Open POS
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {data && (data.lowStockCount > 0 || data.expiringCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {data.lowStockCount > 0 && (
            <Link
              href={`${base}/admin/inventory`}
              className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 text-sm text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {data.lowStockCount} product{data.lowStockCount !== 1 ? 's' : ''} low on stock
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          )}
          {data.expiringCount > 0 && (
            <Link
              href={`${base}/admin/expiry-tracking`}
              className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 text-sm text-red-700 hover:bg-red-100 transition-colors"
            >
              <CalendarClock className="w-4 h-4 flex-shrink-0" />
              {data.expiringCount} item{data.expiringCount !== 1 ? 's' : ''} expiring soon
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-gray-300 p-4">
              <div
                className="inline-flex p-2 mb-3"
                style={{ backgroundColor: s.bg, color: s.accent }}
              >
                <Icon className="w-5 h-5" />
              </div>
              {loading ? (
                <div className="h-7 w-24 bg-gray-100 animate-pulse mb-1" />
              ) : (
                <p className="text-xl font-bold text-gray-900 mb-0.5">{s.value}</p>
              )}
              <p className="text-xs text-gray-500">{s.sub}</p>
              <p className="text-xs font-medium text-gray-400 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main content: transactions + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent transactions */}
        <div className="lg:col-span-2 bg-white border border-gray-300">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Recent Transactions</h2>
            <Link
              href={`${base}/admin/transactions`}
              className="text-xs font-medium hover:underline"
              style={{ color: primaryColor }}
            >
              View all
            </Link>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : !data?.recentTransactions.length ? (
            <div className="text-center py-12">
              <Receipt className="w-8 h-8 mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No transactions today</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500">Receipt</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Customer</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Method</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Amount</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentTransactions.map(tx => (
                  <tr key={tx._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">
                      {tx.receiptNumber || tx._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-gray-700 truncate max-w-[120px]">
                      {tx.customerName || 'Walk-in'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 capitalize">{tx.paymentMethod}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {fmt(tx.totalAmount, currencySymbol)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs">
                      {new Date(tx.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="bg-white border border-gray-300 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="flex flex-col gap-1">
              {quickActions.map(a => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium border transition-colors ${
                      a.primary
                        ? 'text-white'
                        : 'border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-200'
                    }`}
                    style={a.primary ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{a.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Subscription */}
          {subscriptionStatus && (
            <div className="bg-white border border-gray-300 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Subscription</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Plan</span>
                  <span className="text-xs font-semibold text-gray-800 capitalize">
                    {subscriptionStatus.planName || 'Free'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Status</span>
                  <span className={`text-xs font-semibold ${
                    subscriptionStatus.isTrial ? 'text-amber-600' : subscriptionStatus.isActive ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {subscriptionStatus.isTrial ? 'Trial' : subscriptionStatus.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {businessType && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Business Type</span>
                    <span className="text-xs font-semibold text-gray-800 capitalize">{businessType}</span>
                  </div>
                )}
                {subscriptionStatus.isTrial && subscriptionStatus.trialEndDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Trial ends</span>
                    <span className="text-xs font-semibold text-amber-700">
                      {new Date(subscriptionStatus.trialEndDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
              <Link
                href={`${base}/admin/subscriptions`}
                className="mt-3 flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Manage Plan
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
