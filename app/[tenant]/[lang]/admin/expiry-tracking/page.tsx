'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarClock, Package } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';

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

const STATUS_CHIP: Record<string, string> = {
  expired: 'bg-red-100 text-red-800 border border-red-200',
  critical: 'bg-orange-100 text-orange-800 border border-orange-200',
  warning: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
};

const SCHEDULE_LABEL: Record<string, string> = {
  otc: 'OTC',
  rx: 'Rx',
  dangerous: 'DD',
};

export default function ExpiryTrackingPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertDays, setAlertDays] = useState(90);
  const [scheduleFilter, setScheduleFilter] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(alertDays) });
      if (scheduleFilter) qs.set('schedule', scheduleFilter);
      const res = await fetch(`/api/reports/expiry?${qs}`);
      const json = await res.json();
      if (json.success) setReport(json.data);
      else toast.error(json.error || dict?.admin?.failedToLoadReport || 'Failed to load report');
    } catch {
      toast.error(dict?.admin?.failedToLoadExpiryReport || 'Failed to load expiry report');
    } finally {
      setLoading(false);
    }
  }, [alertDays, scheduleFilter, dict]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const ProductRow = ({ p }: { p: ExpiryProduct }) => (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{p.name}</p>
        {p.genericName && <p className="text-xs text-gray-500">{p.genericName}</p>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{p.batchNumber ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{new Date(p.expiryDate).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 font-medium ${STATUS_CHIP[p.status]}`}>
          {p.daysUntilExpiry < 0
            ? (dict?.admin?.daysAgo || '{days}d ago').replace('{days}', String(Math.abs(p.daysUntilExpiry)))
            : (dict?.admin?.daysLeft || '{days}d left').replace('{days}', String(p.daysUntilExpiry))}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{p.stock}</td>
      <td className="px-4 py-3">
        {p.drugSchedule && (
          <span className="text-xs px-2 py-0.5 border border-gray-200 bg-gray-100 text-gray-700">
            {SCHEDULE_LABEL[p.drugSchedule] ?? p.drugSchedule}
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dict?.admin?.expiryTrackingTitle || 'Expiry Tracking'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{dict?.admin?.expiryTrackingSubtitle || 'Monitor near-expiry and expired pharmacy products'}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — filters sidebar */}
        <aside className="w-52 shrink-0 sticky top-6">
          <div className="bg-white border border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.filters || 'Filters'}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.alertWindow || 'Alert Window'}</label>
                <select
                  value={alertDays}
                  onChange={e => setAlertDays(Number(e.target.value))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  {[30, 60, 90, 180].map(d => (
                    <option key={d} value={d}>{d} {dict?.admin?.daysUnit || 'days'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.drugSchedule || 'Drug Schedule'}</label>
                <select
                  value={scheduleFilter}
                  onChange={e => setScheduleFilter(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">{dict?.admin?.all || 'All'}</option>
                  <option value="otc">OTC</option>
                  <option value="rx">Rx</option>
                  <option value="dangerous">{dict?.admin?.dangerousDrugs || 'Dangerous Drugs'}</option>
                </select>
              </div>
            </div>
          </div>
        </aside>

        {/* Right — content */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Summary Cards */}
          {report && (
            <div className="grid grid-cols-3 gap-4">
              <div className="px-5 py-4 text-white" style={{ backgroundColor: '#c0392b' }}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-white/80" />
                  <span className="text-xs font-medium text-white/80 uppercase tracking-wide">{dict?.admin?.expiredStat || 'Expired'}</span>
                </div>
                <p className="text-2xl font-bold">{report.totalExpired}</p>
                <p className="text-xs text-white/80 mt-0.5">{dict?.admin?.pullFromShelfImmediately || 'Pull from shelf immediately'}</p>
              </div>
              <div className="px-5 py-4 text-white" style={{ backgroundColor: '#e3a008' }}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-white/80" />
                  <span className="text-xs font-medium text-white/80 uppercase tracking-wide">{dict?.admin?.criticalWithinDays || 'Critical (≤30d)'}</span>
                </div>
                <p className="text-2xl font-bold">
                  {report.expiring.filter(p => p.daysUntilExpiry <= 30).length}
                </p>
              </div>
              <div className="px-5 py-4 text-white" style={{ backgroundColor: '#35979c' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-white/80" />
                  <span className="text-xs font-medium text-white/80 uppercase tracking-wide">{(dict?.admin?.withinDays || 'Within {days}d').replace('{days}', String(alertDays))}</span>
                </div>
                <p className="text-2xl font-bold">{report.totalExpiring}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
                <p className="text-sm text-gray-400">{dict?.admin?.loadingReport || 'Loading report...'}</p>
              </div>
            </div>
          ) : !report || (report.totalExpired === 0 && report.totalExpiring === 0) ? (
            <div className="bg-white border border-gray-300 py-16 text-center">
              <CalendarClock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">{dict?.admin?.noExpiringProductsFound || 'No expiring products found in the selected window'}</p>
            </div>
          ) : (
            <>
              {report.expired.length > 0 && (
                <div className="bg-white border border-gray-300 overflow-hidden">
                  <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <h2 className="text-xs font-semibold text-red-800 uppercase tracking-wide">{(dict?.admin?.expiredRemoveFromShelf || 'Expired — Remove from Shelf ({count})').replace('{count}', String(report.expired.length))}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.product || 'Product'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.batch || 'Batch'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.expiryDate || 'Expiry Date'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.status || 'Status'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.stock || 'Stock'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.schedule || 'Schedule'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.expired.map(p => <ProductRow key={p._id} p={p} />)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.expiring.length > 0 && (
                <div className="bg-white border border-gray-300 overflow-hidden">
                  <div className="bg-yellow-50 border-b border-yellow-200 px-5 py-3 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-yellow-600" />
                    <h2 className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">{(dict?.admin?.expiringWithinDays || 'Expiring Within {days} Days ({count})').replace('{days}', String(alertDays)).replace('{count}', String(report.expiring.length))}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.product || 'Product'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.batch || 'Batch'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.expiryDate || 'Expiry Date'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.status || 'Status'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.stock || 'Stock'}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{dict?.admin?.schedule || 'Schedule'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.expiring.map(p => <ProductRow key={p._id} p={p} />)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
