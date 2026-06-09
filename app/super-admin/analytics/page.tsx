'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface AnalyticsData {
  mrr: number;
  revenueLastMonth: number;
  revenuePrevPeriod: number;
  revenueChangePct: number | null;
  transactions: { last30: number; last90: number; total: number; inRange: number; prevRange: number; rangeChangePct: number | null };
  planBreakdown: { tier: string; name: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  tenantGrowth: { month: string; count: number }[];
  topTenants: { name: string; slug: string; txCount: number; revenue: number }[];
  dateRange: { start: string; end: string };
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
  pro: 'bg-brand-soft0',
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

function changeBadge(pct: number | null) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeStart, setRangeStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [rangeEnd, setRangeEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [csvLoading, setCsvLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ rangeStart, rangeEnd });
      const res = await fetch(`/api/super-admin/analytics?${params}`, { credentials: 'include' });
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
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const downloadCsv = async () => {
    setCsvLoading(true);
    try {
      const params = new URLSearchParams({ rangeStart, rangeEnd, format: 'csv' });
      const res = await fetch(`/api/super-admin/analytics?${params}`, { credentials: 'include' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${rangeStart}-to-${rangeEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  };

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
    <SuperAdminShell title="Analytics">
      <div className="space-y-5">
        {/* Date range + actions */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-gray-500">Date range:</label>
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
          {[
            { label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 },
          ].map(p => (
            <button key={p.label} onClick={() => { const d = new Date(); d.setDate(d.getDate() - p.days); setRangeStart(d.toISOString().slice(0, 10)); setRangeEnd(new Date().toISOString().slice(0, 10)); }}
              className="px-2.5 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={fetchAnalytics} className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Refresh</button>
            <button onClick={downloadCsv} disabled={csvLoading || loading}
              className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {csvLoading ? 'Exporting…' : '↓ CSV'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm rounded-xl">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse shadow-sm">
                <div className="h-4 bg-gray-200 rounded w-28 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            {/* Top KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Monthly Recurring Revenue', value: formatCurrency(data.mrr), sub: 'active + trial subs', change: null },
                { label: 'Revenue (Period)', value: formatCurrency(data.revenueLastMonth), sub: `prev: ${formatCurrency(data.revenuePrevPeriod)}`, change: data.revenueChangePct },
                { label: 'Transactions (Period)', value: data.transactions.inRange.toLocaleString(), sub: `${data.transactions.total.toLocaleString()} all time`, change: data.transactions.rangeChangePct },
                { label: 'Active Subscribers', value: totalSubscribers.toLocaleString(), sub: 'active + trial plans', change: null },
              ].map(card => (
                <div key={card.label} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <p className="text-xs text-gray-500 leading-tight">{card.label}</p>
                  <div className="flex items-end gap-2 mt-1">
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    {changeBadge(card.change)}
                  </div>
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
                        color={TIER_COLORS[p.tier] || 'bg-brand-soft0'}
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
                        color="bg-brand-soft0"
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

