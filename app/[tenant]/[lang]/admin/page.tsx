'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, AlertTriangle, Receipt, Plus, BarChart2, Boxes,
  CalendarClock, Loader2, Store,
} from 'lucide-react';
import { LineTag, ReceiptRow } from '@/components/marketing/primitives';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { getDictionaryClient } from '../dictionaries-client';

interface RecentTx {
  _id: string;
  receiptNumber?: string;
  total: number;
  paymentMethod: string;
  createdAt: string;
  customerId?: { firstName?: string; lastName?: string } | string;
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

function greeting(dict: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const h = new Date().getHours();
  if (h < 12) return dict?.admin?.goodMorning || 'Good morning';
  if (h < 17) return dict?.admin?.goodAfternoon || 'Good afternoon';
  return dict?.admin?.goodEvening || 'Good evening';
}

const KEY = 'flex min-h-[44px] items-center gap-2.5 px-3 font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export default function AdminDashboard() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { user } = useAuth();
  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();

  const tenantSettings = settings || getDefaultTenantSettings();
  const currencySymbol = tenantSettings.currencySymbol || '₱';
  const businessType = tenantSettings.businessType;
  const base = `/${tenant}/${lang}`;
  const dateLocale = lang === 'es' ? 'es' : 'en-PH';
  const timeZone = tenantSettings.timezone || 'Asia/Manila';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const todayStr = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone,
  });

  const fetchDashboard = useCallback(async () => {
    try {
      const [statsRes, txRes, productsRes, customersRes, lowStockRes] = await Promise.allSettled([
        fetch(`/api/transactions/stats?period=today`),
        fetch(`/api/transactions?limit=10`),
        fetch(`/api/products?page=1&limit=1`),
        fetch(`/api/customers?limit=1`),
        fetch(`/api/inventory/low-stock`),
      ]);

      let todayRevenue = 0;
      let todayTransactions = 0;
      let recentTransactions: RecentTx[] = [];
      let totalProducts = 0;
      let totalCustomers = 0;
      let lowStockCount = 0;

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const json = await statsRes.value.json();
        if (json.success) {
          todayRevenue = json.data?.totalSales ?? 0;
          todayTransactions = json.data?.totalTransactions ?? 0;
        }
      }
      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const json = await txRes.value.json();
        if (json.success) {
          recentTransactions = (json.data || []).slice(0, 10);
        }
      }
      if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
        const json = await productsRes.value.json();
        totalProducts = json.pagination?.total ?? 0;
      }
      if (customersRes.status === 'fulfilled' && customersRes.value.ok) {
        const json = await customersRes.value.json();
        totalCustomers = json.pagination?.total ?? 0;
      }
      if (lowStockRes.status === 'fulfilled' && lowStockRes.value.ok) {
        const json = await lowStockRes.value.json();
        lowStockCount = json.count ?? 0;
      }

      let expiringCount = 0;
      if (businessType === 'pharmacy') {
        try {
          const expRes = await fetch(`/api/reports/expiry?days=30&source=dashboard`);
          if (expRes.ok) {
            const j = await expRes.json();
            expiringCount = (j.data?.totalExpired ?? 0) + (j.data?.totalExpiring ?? 0);
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

  /** The LED readout. Peso amounts use the receipt face, since the LED font has no ₱ glyph. */
  const readouts = [
    {
      label: dict?.admin?.todaysRevenue || "Today's Revenue",
      value: data ? fmt(data.todayRevenue, currencySymbol) : '—',
      sub: `${data?.todayTransactions ?? 0} ${dict?.admin?.transactionsSuffix || 'transactions'}`,
      money: true,
      alert: false,
    },
    {
      label: dict?.admin?.transactionsToday || 'Transactions Today',
      value: data ? data.todayTransactions.toLocaleString() : '—',
      sub: dict?.admin?.completedSales || 'Completed sales',
      money: false,
      alert: false,
    },
    {
      label: dict?.admin?.totalProducts || 'Total Products',
      value: data ? data.totalProducts.toLocaleString() : '—',
      sub: data?.lowStockCount ? `${data.lowStockCount} ${dict?.admin?.lowStockSuffix || 'low stock'}` : (dict?.admin?.allStocked || 'All stocked'),
      money: false,
      alert: !!data?.lowStockCount,
    },
    {
      label: dict?.admin?.totalCustomers || 'Total Customers',
      value: data ? data.totalCustomers.toLocaleString() : '—',
      sub: dict?.admin?.registeredAccounts || 'Registered accounts',
      money: false,
      alert: false,
    },
  ];

  const quickActions = [
    { label: dict?.admin?.newTransaction || 'New Transaction', href: base, icon: Store, primary: true },
    { label: dict?.admin?.addProduct || 'Add Product', href: `${base}/admin/products`, icon: Plus, primary: false },
    { label: dict?.admin?.viewReports || 'View Reports', href: `${base}/admin/reports`, icon: BarChart2, primary: false },
    { label: dict?.admin?.transactions || 'Transactions', href: `${base}/admin/transactions`, icon: Receipt, primary: false },
    { label: dict?.nav?.inventory || 'Inventory', href: `${base}/admin/inventory`, icon: Boxes, primary: false },
  ];

  const statusText = subscriptionStatus?.isTrial
    ? (dict?.admin?.trialLabel || 'Trial')
    : subscriptionStatus?.isActive
      ? (dict?.admin?.activeStatus || 'Active')
      : (dict?.admin?.inactiveStatus || 'Inactive');

  return (
    <div className="mk-root pos-register min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <LineTag no="00" className="mb-3 text-brand-hover">{todayStr}</LineTag>
            <h1 className="text-5xl text-ink sm:text-6xl">
              {greeting(dict)}, {user?.name?.split(' ')[0] || 'there'}
            </h1>
          </div>
          <Link
            href={base}
            className="hidden items-center gap-2 bg-ink px-5 font-receipt text-sm font-semibold uppercase tracking-[0.08em] text-paper-white transition-colors hover:bg-brand-navy sm:flex"
          >
            <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {dict?.admin?.openPos || 'Open POS'}
          </Link>
        </div>

        {/* Alerts, stamped on a strip of paper */}
        {data && (data.lowStockCount > 0 || data.expiringCount > 0) && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {data.lowStockCount > 0 && (
              <Link
                href={`${base}/admin/inventory`}
                className="flex items-center gap-3 border-l-4 border-stamp bg-paper-white px-4 font-receipt text-sm text-ink hover:bg-white"
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-stamp" strokeWidth={1.75} aria-hidden />
                {(dict?.admin?.lowStockAlertMsg || '{count} product(s) low on stock').replace('{count}', String(data.lowStockCount))}
                <ArrowRight className="ml-auto h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
              </Link>
            )}
            {data.expiringCount > 0 && (
              <Link
                href={`${base}/admin/inventory`}
                className="flex items-center gap-3 border-l-4 border-stamp bg-paper-white px-4 font-receipt text-sm text-ink hover:bg-white"
              >
                <CalendarClock className="h-4 w-4 flex-shrink-0 text-stamp" strokeWidth={1.75} aria-hidden />
                {(dict?.admin?.expiringAlertMsg || '{count} item(s) expiring soon').replace('{count}', String(data.expiringCount))}
                <ArrowRight className="ml-auto h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
              </Link>
            )}
          </div>
        )}

        {/* Today's reading, as the till's LED display shows it */}
        <section className="mt-8 grid grid-cols-2 bg-ink text-paper xl:grid-cols-4" aria-busy={loading}>
          {readouts.map((r, i) => (
            <div
              key={r.label}
              className={`min-w-0 border-dashed border-white/15 p-4 sm:p-5 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t xl:border-t-0' : ''} ${i === 2 ? 'xl:border-l' : ''}`}
            >
              <p className="font-receipt text-[11px] uppercase tracking-[0.14em] text-paper/60">{r.label}</p>
              {loading ? (
                <div className="mt-3 h-9 w-24 animate-pulse bg-white/10 motion-reduce:animate-none" />
              ) : r.money ? (
                <p className="mt-2 truncate font-receipt text-2xl font-semibold text-[#7df0d6] sm:text-3xl">{r.value}</p>
              ) : (
                <p className="mk-led-glow mt-2 font-led text-4xl leading-none text-[#7df0d6] sm:text-5xl">{r.value}</p>
              )}
              <p className={`mt-2 inline-block font-receipt text-xs ${r.alert ? 'bg-stamp px-1.5 py-0.5 text-paper-white' : 'text-paper/55'}`}>
                {r.sub}
              </p>
            </div>
          ))}
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Recent transactions, printed as a till roll */}
          <section className="min-w-0 drop-shadow-[0_1px_0_rgb(16_32_43/0.12)] xl:col-span-2">
            <div className="bg-paper-white text-ink">
              <div className="flex items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
                <h2 className="text-3xl">{dict?.admin?.recentTransactions || 'Recent Transactions'}</h2>
                <Link
                  href={`${base}/admin/transactions`}
                  className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap font-receipt text-xs font-medium uppercase tracking-[0.08em] text-brand-hover hover:underline"
                >
                  {dict?.admin?.viewAll || 'View all'}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </Link>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2 className="h-5 w-5 animate-spin text-ink/30 motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
                </div>
              ) : !data?.recentTransactions.length ? (
                <div className="py-14 text-center">
                  <Receipt className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                  <p className="font-receipt text-sm text-ink/50">{dict?.admin?.noTransactionsToday || 'No transactions today'}</p>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-ink/10 px-4 py-2 font-receipt text-[11px] uppercase tracking-[0.12em] text-ink/50 sm:grid sm:px-5">
                    <span>{dict?.admin?.receiptCol || 'Receipt'} · {dict?.admin?.customerCol || 'Customer'} · {dict?.admin?.methodCol || 'Method'}</span>
                    <span className="text-right">{dict?.admin?.amountCol || 'Amount'}</span>
                  </div>
                  <ul className="divide-y divide-dashed divide-ink/20">
                    {data.recentTransactions.map(tx => {
                      const customer = (typeof tx.customerId === 'object' && tx.customerId
                        ? `${tx.customerId.firstName ?? ''} ${tx.customerId.lastName ?? ''}`.trim()
                        : '') || (dict?.admin?.walkIn || 'Walk-in');
                      return (
                        <li key={tx._id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <p className="truncate font-receipt text-sm font-medium">
                              {tx.receiptNumber || tx._id.slice(-6).toUpperCase()}
                            </p>
                            <p className="truncate text-sm text-ink/65">
                              {customer}
                              <span className="mx-1.5 text-ink/30">·</span>
                              <span className="font-receipt text-xs uppercase">{tx.paymentMethod}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="whitespace-nowrap font-receipt text-sm font-semibold">{fmt(tx.total, currencySymbol)}</p>
                            <p className="whitespace-nowrap font-receipt text-[11px] text-ink/50">
                              {new Date(tx.createdAt).toLocaleString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </section>

          <div className="grid min-w-0 grid-cols-1 content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
            {/* Quick actions, as function keys */}
            <section>
              <h2 className="mb-3 text-3xl text-ink">{dict?.admin?.quickActionsTitle || 'Quick Actions'}</h2>
              <div className="grid grid-cols-2 gap-px border border-ink bg-ink">
                {quickActions.map(a => {
                  const Icon = a.icon;
                  return (
                    <Link
                      key={a.href}
                      href={a.href}
                      className={`${KEY} min-h-16! ${
                        a.primary
                          ? 'bg-brand text-ink hover:bg-[#8fe3d0]'
                          : 'bg-paper-white text-ink hover:bg-paper'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{a.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Plan, as receipt lines */}
            {subscriptionStatus && (
              <section className="drop-shadow-[0_1px_0_rgb(16_32_43/0.12)]">
                <div className="bg-paper-white px-4 pb-4 pt-3 text-ink sm:px-5">
                  <h2 className="border-b border-dashed border-ink/30 pb-3 text-3xl">{dict?.admin?.subscriptionLabel || 'Subscription'}</h2>
                  <div className="mt-3 space-y-2 font-receipt text-sm">
                    <ReceiptRow label={dict?.admin?.planLabel || 'Plan'} value={<span className="capitalize">{subscriptionStatus.planName || 'Free'}</span>} />
                    <ReceiptRow
                      label={dict?.admin?.statusLabel || 'Status'}
                      value={
                        <span className={`px-1.5 py-0.5 text-xs font-semibold uppercase ${
                          subscriptionStatus.isTrial ? 'bg-ink text-[#7df0d6]' : subscriptionStatus.isActive ? 'bg-brand text-ink' : 'bg-stamp text-paper-white'
                        }`}>
                          {statusText}
                        </span>
                      }
                    />
                    {businessType && (
                      <ReceiptRow label={dict?.admin?.businessTypeLabel || 'Business Type'} value={<span className="capitalize">{businessType}</span>} />
                    )}
                    {subscriptionStatus.isTrial && subscriptionStatus.trialEndDate && (
                      <ReceiptRow
                        label={dict?.admin?.trialEnds || 'Trial ends'}
                        value={new Date(subscriptionStatus.trialEndDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', timeZone })}
                        strong
                      />
                    )}
                  </div>
                  <Link
                    href={`${base}/admin/subscriptions`}
                    className={`${KEY} mt-4 justify-center border border-ink text-ink hover:bg-ink hover:text-paper-white`}
                  >
                    {dict?.admin?.managePlan || 'Manage Plan'}
                  </Link>
                </div>
                <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
