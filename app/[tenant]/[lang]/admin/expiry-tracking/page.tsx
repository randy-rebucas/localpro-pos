'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

interface ExpiryProduct {
  _id: string;
  name: string;
  genericName?: string;
  sku?: string;
  batchNumber?: string;
  expiryDate: string;
  stock: number;
  drugSchedule?: string;
  daysUntilExpiry: number;
  status: 'expired' | 'critical' | 'warning';
}

interface ExpiryReport {
  alertDays: number;
  totalExpired: number;
  totalExpiring: number;
  expired: ExpiryProduct[];
  expiring: ExpiryProduct[];
}

const STATUS_BADGE: Record<string, string> = {
  expired: 'bg-win8-danger text-white',
  critical: 'bg-win8-suspended text-white',
  warning: 'bg-win8-warning text-white',
};

const SCHEDULE_BADGE: Record<string, string> = {
  otc: 'bg-gray-500 text-white',
  rx: 'bg-win8-info text-white',
  dangerous: 'bg-win8-danger text-white',
};

const SCHEDULE_LABEL: Record<string, string> = {
  otc: 'OTC',
  rx: 'Rx',
  dangerous: 'DD',
};

const ALERT_WINDOWS = [30, 60, 90, 180];

export default function ExpiryTrackingPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canView = canAccess('expiry_tracking.manage');

  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertDays, setAlertDays] = useState(90);
  const [scheduleFilter, setScheduleFilter] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const t = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ days: String(alertDays) });
      if (scheduleFilter) qs.set('schedule', scheduleFilter);
      const res = await fetch(`/api/reports/expiry?${qs}`);
      const json = await res.json();
      if (json.success) setReport(json.data);
      else setError(json.error || dict?.admin?.failedToLoadReport || 'Failed to load report');
    } catch {
      setError(dict?.admin?.failedToLoadExpiryReport || 'Failed to load expiry report');
    } finally {
      setLoading(false);
    }
  }, [alertDays, scheduleFilter, dict]);

  useEffect(() => {
    if (canView) fetchReport();
    else setLoading(false);
  }, [fetchReport, canView]);

  const title = t('expiryTrackingTitle', 'Expiry Tracking');
  const description = t('expiryTrackingSubtitle', 'Monitor near-expiry and expired pharmacy products');

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader title={title} description={description} />
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{t('accessRestricted', 'Access Restricted')}</h2>
          <p className="text-sm text-gray-700">
            {t('accessRestrictedExpiryTracking', "You don't have permission to view expiry tracking. Contact an admin or owner.")}
          </p>
        </div>
      </div>
    );
  }

  const headers = [
    t('product', 'Product'),
    t('batch', 'Batch'),
    t('expiryDate', 'Expiry Date'),
    t('status', 'Status'),
    t('stock', 'Stock'),
    t('schedule', 'Schedule'),
  ];

  const daysLabel = (p: ExpiryProduct) =>
    p.daysUntilExpiry < 0
      ? t('daysAgo', '{days}d ago').replace('{days}', Math.abs(p.daysUntilExpiry).toLocaleString())
      : t('daysLeft', '{days}d left').replace('{days}', p.daysUntilExpiry.toLocaleString());

  const renderTable = (rows: ExpiryProduct[]) => (
    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={`px-4 py-3 font-medium ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map(p => (
            <tr key={p._id} className="hover:bg-gray-100 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{p.name}</p>
                {p.genericName && <p className="text-xs text-gray-500">{p.genericName}</p>}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.batchNumber || '—'}</td>
              <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{new Date(p.expiryDate).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[p.status] || 'bg-gray-500 text-white'}`}>
                  {daysLabel(p)}
                </span>
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${p.stock > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                {p.stock.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                {p.drugSchedule ? (
                  <span className={`px-2 py-0.5 text-xs font-semibold ${SCHEDULE_BADGE[p.drugSchedule] || 'bg-gray-500 text-white'}`}>
                    {SCHEDULE_LABEL[p.drugSchedule] ?? p.drugSchedule}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const criticalCount = report ? report.expiring.filter(p => p.daysUntilExpiry <= 30).length : 0;
  const isEmpty = !!report && report.totalExpired === 0 && report.totalExpiring === 0;

  const kpis = report
    ? [
        { label: t('expiredStat', 'Expired'), value: report.totalExpired, note: t('pullFromShelfImmediately', 'Pull from shelf immediately'), color: 'bg-win8-danger' },
        { label: t('criticalWithinDays', 'Critical (≤30d)'), value: criticalCount, note: null, color: 'bg-win8-suspended' },
        { label: t('withinDays', 'Within {days}d').replace('{days}', String(alertDays)), value: report.totalExpiring, note: null, color: 'bg-brand' },
      ]
    : [];

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader title={title} description={description} />

      <div className="space-y-4">
        {/* Filter bar */}
        <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="expiry-window" className="block text-xs font-medium text-gray-600 mb-1">{t('alertWindow', 'Alert Window')}</label>
            <select
              id="expiry-window"
              value={alertDays}
              onChange={e => setAlertDays(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900 w-36"
            >
              {ALERT_WINDOWS.map(d => (
                <option key={d} value={d}>{d} {t('daysUnit', 'days')}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="expiry-schedule" className="block text-xs font-medium text-gray-600 mb-1">{t('drugSchedule', 'Drug Schedule')}</label>
            <select
              id="expiry-schedule"
              value={scheduleFilter}
              onChange={e => setScheduleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900 w-44"
            >
              <option value="">{t('all', 'All')}</option>
              <option value="otc">OTC</option>
              <option value="rx">Rx</option>
              <option value="dangerous">{t('dangerousDrugs', 'Dangerous Drugs')}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="ml-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? t('refreshingReport', 'Refreshing…') : t('refresh', 'Refresh')}
          </button>
        </div>

        {/* KPI tiles */}
        {loading && !report ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-300 p-5 animate-pulse">
                <div className="h-3 bg-gray-200 w-24 mb-3" /><div className="h-8 bg-gray-200 w-16 mb-2" /><div className="h-3 bg-gray-200 w-20" />
              </div>
            ))}
          </div>
        ) : report && !error ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {kpis.map(k => (
              <div key={k.label} className={`${k.color} text-white p-5`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{k.label}</p>
                <p className="text-3xl font-bold tabular-nums mt-2">{k.value.toLocaleString()}</p>
                {k.note && <p className="text-xs text-white/80 mt-1">{k.note}</p>}
              </div>
            ))}
          </div>
        ) : null}

        {/* Report */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{t('loadingReport', 'Loading report…')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{error}</p>
            <button
              onClick={fetchReport}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : !report || isEmpty ? (
          <div className="text-center py-12 text-sm text-gray-400 bg-white border border-gray-300">
            {t('noExpiringProductsFound', 'No expiring products found in the selected window')}
          </div>
        ) : (
          <>
            {report.expired.length > 0 && (
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 bg-win8-danger shrink-0" aria-hidden="true" />
                  <h2 className="text-base font-bold text-gray-900">
                    {t('expiredRemoveFromShelf', 'Expired — Remove from Shelf ({count})').replace('{count}', report.expired.length.toLocaleString())}
                  </h2>
                </div>
                {renderTable(report.expired)}
              </section>
            )}

            {report.expiring.length > 0 && (
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 bg-win8-warning shrink-0" aria-hidden="true" />
                  <h2 className="text-base font-bold text-gray-900">
                    {t('expiringWithinDays', 'Expiring Within {days} Days ({count})')
                      .replace('{days}', String(alertDays))
                      .replace('{count}', report.expiring.length.toLocaleString())}
                  </h2>
                </div>
                {renderTable(report.expiring)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
