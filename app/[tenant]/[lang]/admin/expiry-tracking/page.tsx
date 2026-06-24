'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarClock, Package } from 'lucide-react';

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

  const [report, setReport] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertDays, setAlertDays] = useState(90);
  const [scheduleFilter, setScheduleFilter] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(alertDays) });
      if (scheduleFilter) qs.set('schedule', scheduleFilter);
      const res = await fetch(`/api/reports/expiry?${qs}`);
      const json = await res.json();
      if (json.success) setReport(json.data);
      else toast.error(json.error || 'Failed to load report');
    } catch {
      toast.error('Failed to load expiry report');
    } finally {
      setLoading(false);
    }
  }, [alertDays, scheduleFilter]);

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
          {p.daysUntilExpiry < 0 ? `${Math.abs(p.daysUntilExpiry)}d ago` : `${p.daysUntilExpiry}d left`}
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
            <h1 className="text-2xl font-bold text-gray-900">Expiry Tracking</h1>
            <p className="text-sm text-gray-500 mt-0.5">Monitor near-expiry and expired pharmacy products</p>
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — filters sidebar */}
        <aside className="w-52 shrink-0 sticky top-6">
          <div className="bg-white border border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filters</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alert Window</label>
                <select
                  value={alertDays}
                  onChange={e => setAlertDays(Number(e.target.value))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  {[30, 60, 90, 180].map(d => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Drug Schedule</label>
                <select
                  value={scheduleFilter}
                  onChange={e => setScheduleFilter(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">All</option>
                  <option value="otc">OTC</option>
                  <option value="rx">Rx</option>
                  <option value="dangerous">Dangerous Drugs</option>
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
              <div className="bg-red-50 border border-red-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-red-800 uppercase tracking-wide">Expired</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{report.totalExpired}</p>
                <p className="text-xs text-red-600 mt-0.5">Pull from shelf immediately</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-orange-800 uppercase tracking-wide">Critical (≤30d)</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">
                  {report.expiring.filter(p => p.daysUntilExpiry <= 30).length}
                </p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-medium text-yellow-800 uppercase tracking-wide">Within {alertDays}d</span>
                </div>
                <p className="text-2xl font-bold text-yellow-700">{report.totalExpiring}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
                <p className="text-sm text-gray-400">Loading report...</p>
              </div>
            </div>
          ) : !report || (report.totalExpired === 0 && report.totalExpiring === 0) ? (
            <div className="bg-white border border-gray-300 py-16 text-center">
              <CalendarClock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">No expiring products found in the selected window</p>
            </div>
          ) : (
            <>
              {report.expired.length > 0 && (
                <div className="bg-white border border-gray-300 overflow-hidden">
                  <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <h2 className="text-xs font-semibold text-red-800 uppercase tracking-wide">Expired — Remove from Shelf ({report.expired.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Product</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Batch</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Stock</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Schedule</th>
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
                    <h2 className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">Expiring Within {alertDays} Days ({report.expiring.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Product</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Batch</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Stock</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Schedule</th>
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
