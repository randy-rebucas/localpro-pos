'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowDown, ArrowUp, Download, RefreshCw } from 'lucide-react';
import { showToast } from '@/lib/toast';
import { ReceiptRow } from '@/components/marketing/primitives';
import { DARK_FIELD, DARK_KEY, DARK_LABEL, ICON, Printing, SaPage, Slip, Strip, TABLE, TBODY, TD_RIGHT, TD_TEXT, TH, TH_RIGHT, THEAD, TR } from '@/components/super-admin/ui';

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

const STATUS_BAR: Record<string, string> = {
  active: 'bg-brand',
  trial: 'bg-[#8fe3d0]',
  cancelled: 'bg-stamp',
  suspended: 'bg-stamp/60',
  inactive: 'bg-ink/30',
};

const TIER_BAR: Record<string, string> = {
  starter: 'bg-ink/40',
  pro: 'bg-brand',
  business: 'bg-brand-navy',
  enterprise: 'bg-ink',
};

function formatCurrency(v: number) {
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** A receipt line with a flat bar under it, for a count out of a total. */
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <li className="font-receipt text-sm">
      <ReceiptRow label={<span className="capitalize">{label}</span>} value={value.toLocaleString()} />
      <div className="mt-1.5 h-2 bg-ink/10" aria-hidden>
        <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function ChangeTag({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 font-receipt text-xs ${up ? 'text-[#8fe3d0]' : 'text-[#ff9a85]'}`}>
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** A counter on the dark page. Peso amounts print in mono, since the LED face has no peso sign. */
function Counter({ label, value, sub, change, led }: { label: string; value: string; sub: string; change: number | null; led: boolean }) {
  return (
    <div className="border border-white/10 bg-black/30 px-4 py-4">
      <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p
        className={
          led
            ? 'mk-led-glow mt-2 font-led text-4xl leading-none text-[#7df0d6] sm:text-5xl'
            : 'mt-2 font-receipt text-3xl font-semibold leading-none text-[#7df0d6] sm:text-4xl'
        }
      >
        {value}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2 font-receipt text-xs text-white/50">
        <span>{sub}</span>
        <ChangeTag pct={change} />
      </p>
    </div>
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

  const setPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setRangeStart(d.toISOString().slice(0, 10));
    setRangeEnd(new Date().toISOString().slice(0, 10));
  };

  return (
    <SaPage
      tagNo="09"
      tag="Period reading"
      title="Analytics"
      subtitle="Revenue, subscribers and store activity across the platform for the dates you pick."
      side={
        <>
          <button type="button" onClick={fetchAnalytics} className={DARK_KEY}>
            <RefreshCw className={ICON} strokeWidth={1.75} aria-hidden />
            Refresh
          </button>
          <button type="button" onClick={downloadCsv} disabled={csvLoading || loading} className={DARK_KEY}>
            <Download className={ICON} strokeWidth={1.75} aria-hidden />
            {csvLoading ? 'Exporting…' : 'CSV'}
          </button>
        </>
      }
    >
      {/* Date range */}
      <section aria-label="Date range" className="mt-8 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="an-start" className={DARK_LABEL}>From</label>
          <input id="an-start" type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className={DARK_FIELD} />
        </div>
        <div>
          <label htmlFor="an-end" className={DARK_LABEL}>To</label>
          <input id="an-end" type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className={DARK_FIELD} />
        </div>
        <div className="flex gap-2">
          {[{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }].map(p => (
            <button key={p.label} type="button" onClick={() => setPreset(p.days)} className={DARK_KEY}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="mt-4">
          <Strip tone="error">{error}</Strip>
        </div>
      )}

      {loading ? (
        <div className="mt-6 border border-white/10 bg-black/30">
          <Printing dark label="Reading the period…" />
        </div>
      ) : data ? (
        <>
          {/* Counters */}
          <section aria-label="Totals" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Counter label="Monthly recurring revenue" value={formatCurrency(data.mrr)} sub="Active + trial subs" change={null} led={false} />
            <Counter label="Revenue (period)" value={formatCurrency(data.revenueLastMonth)} sub={`Prev: ${formatCurrency(data.revenuePrevPeriod)}`} change={data.revenueChangePct} led={false} />
            <Counter label="Transactions (period)" value={data.transactions.inRange.toLocaleString()} sub={`${data.transactions.total.toLocaleString()} all time`} change={data.transactions.rangeChangePct} led />
            <Counter label="Active subscribers" value={totalSubscribers.toLocaleString()} sub="Active + trial plans" change={null} led />
          </section>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Slip title="Plan distribution" bodyClassName="px-4 py-4 sm:px-5">
              {data.planBreakdown.length === 0 ? (
                <p className="font-receipt text-sm text-ink/60">No active subscribers</p>
              ) : (
                <ul className="space-y-3">
                  {data.planBreakdown.map(p => (
                    <BarRow key={p.tier} label={p.name} value={p.count} max={maxPlanCount} color={TIER_BAR[p.tier] || 'bg-brand'} />
                  ))}
                </ul>
              )}
            </Slip>

            <Slip title="Subscription status" bodyClassName="px-4 py-4 sm:px-5">
              {data.statusBreakdown.length === 0 ? (
                <p className="font-receipt text-sm text-ink/60">No subscriptions</p>
              ) : (
                <ul className="space-y-3">
                  {data.statusBreakdown.map(s => (
                    <BarRow key={s.status} label={s.status} value={s.count} max={totalSubscribers} color={STATUS_BAR[s.status] || 'bg-ink/30'} />
                  ))}
                </ul>
              )}
            </Slip>

            <Slip title="New tenants · last 12 months" bodyClassName="px-4 py-4 sm:px-5">
              {data.tenantGrowth.length === 0 ? (
                <p className="font-receipt text-sm text-ink/60">No tenant registrations in this period</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.tenantGrowth.map(g => (
                    <BarRow key={g.month} label={g.month} value={g.count} max={maxGrowth} color="bg-brand" />
                  ))}
                </ul>
              )}
            </Slip>

            <Slip title="Top 10 tenants by transactions">
              {data.topTenants.length === 0 ? (
                <p className="px-4 py-4 font-receipt text-sm text-ink/60 sm:px-5">No transaction data</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className={TABLE}>
                    <thead className={THEAD}>
                      <tr>
                        <th scope="col" className={TH}>Tenant</th>
                        <th scope="col" className={TH_RIGHT}>Transactions</th>
                        <th scope="col" className={TH_RIGHT}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {data.topTenants.map((t, i) => (
                        <tr key={t.slug || i} className={TR}>
                          <td className={TD_TEXT}>
                            <p className="font-medium">{t.name}</p>
                            <p className="mt-0.5 font-receipt text-xs text-ink/60">{t.slug}</p>
                          </td>
                          <td className={TD_RIGHT}>{t.txCount.toLocaleString()}</td>
                          <td className={TD_RIGHT}>{formatCurrency(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Slip>
          </div>
        </>
      ) : null}
    </SaPage>
  );
}
