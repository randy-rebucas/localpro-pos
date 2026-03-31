'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface AnalyticsData {
  mrr: number;
  revenueLastMonth: number;
  transactions: { last30: number; last90: number; total: number };
  planBreakdown: { tier: string; name: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  tenantGrowth: { month: string; count: number }[];
  topTenants: { name: string; slug: string; txCount: number; revenue: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  trial: 'bg-yellow-500',
  cancelled: 'bg-red-500',
  suspended: 'bg-orange-500',
  inactive: 'bg-gray-400',
};

const TIER_COLORS: Record<string, string> = {
  starter: 'bg-gray-400',
  pro: 'bg-blue-500',
  business: 'bg-purple-500',
  enterprise: 'bg-indigo-600',
};

function formatCurrency(v: number) {
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24 shrink-0 capitalize">{label}</span>
      <div className="flex-1 bg-gray-100 h-4 overflow-hidden">
        <div className={`h-4 ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{value}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/analytics', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        const errorMsg = json.error || 'Failed to load analytics';
        setError(errorMsg);
        showToast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reach analytics endpoint';
      setError(errorMsg);
      showToast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const totalSubscribers = data
    ? data.statusBreakdown.reduce((s, r) => s + r.count, 0)
    : 0;

  const maxPlanCount = data
    ? Math.max(...data.planBreakdown.map(p => p.count), 1)
    : 1;

  const maxGrowth = data
    ? Math.max(...data.tenantGrowth.map(g => g.count), 1)
    : 1;

  return (
    <SuperAdminShell>
      <div className="p-6 w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Platform-wide metrics and revenue</p>
          </div>
          <button
            onClick={fetchAnalytics}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-28 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            {/* Top KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Monthly Recurring Revenue', value: formatCurrency(data.mrr), sub: 'active + trial subs' },
                { label: 'Revenue (Last 30 days)', value: formatCurrency(data.revenueLastMonth), sub: 'completed transactions' },
                { label: 'Transactions (30d)', value: data.transactions.last30.toLocaleString(), sub: `${data.transactions.total.toLocaleString()} all time` },
                { label: 'Active Subscribers', value: totalSubscribers.toLocaleString(), sub: 'active + trial plans' },
              ].map(card => (
                <div key={card.label} className="bg-white border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 leading-tight">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Plan distribution */}
              <div className="bg-white border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Plan Distribution</h2>
                {data.planBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No active subscribers</p>
                ) : (
                  <div className="space-y-3">
                    {data.planBreakdown.map(p => (
                      <BarRow
                        key={p.tier}
                        label={p.name}
                        value={p.count}
                        max={maxPlanCount}
                        color={TIER_COLORS[p.tier] || 'bg-blue-500'}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Subscription status */}
              <div className="bg-white border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Subscription Status</h2>
                {data.statusBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No subscriptions</p>
                ) : (
                  <div className="space-y-3">
                    {data.statusBreakdown.map(s => (
                      <BarRow
                        key={s.status}
                        label={s.status}
                        value={s.count}
                        max={totalSubscribers}
                        color={STATUS_COLORS[s.status] || 'bg-gray-400'}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tenant growth */}
              <div className="bg-white border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">New Tenants (Last 12 Months)</h2>
                {data.tenantGrowth.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No tenant registrations in this period</p>
                ) : (
                  <div className="space-y-2">
                    {data.tenantGrowth.map(g => (
                      <BarRow
                        key={g.month}
                        label={g.month}
                        value={g.count}
                        max={maxGrowth}
                        color="bg-blue-500"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Top tenants */}
              <div className="bg-white border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Top 10 Tenants by Transactions</h2>
                {data.topTenants.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No transaction data</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-2 text-left text-xs font-medium text-gray-500">Tenant</th>
                          <th className="pb-2 text-right text-xs font-medium text-gray-500">Transactions</th>
                          <th className="pb-2 text-right text-xs font-medium text-gray-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.topTenants.map((t, i) => (
                          <tr key={t.slug || i}>
                            <td className="py-2">
                              <p className="font-medium text-gray-900">{t.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                            </td>
                            <td className="py-2 text-right text-gray-700">{t.txCount.toLocaleString()}</td>
                            <td className="py-2 text-right text-gray-700">{formatCurrency(t.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </SuperAdminShell>
  );
}
