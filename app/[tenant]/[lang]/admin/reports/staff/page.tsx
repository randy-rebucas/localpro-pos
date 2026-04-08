'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminNavBar from '@/components/AdminNavBar';
import StaffPerformanceTable from '@/components/reports/StaffPerformanceTable';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function StaffReportPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { settings } = useTenantSettings();
  const currency = (settings || getDefaultTenantSettings()).currency || 'PHP';

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [meta, setMeta] = useState<{ staffCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/staff-performance?startDate=${startDate}&endDate=${endDate}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setMeta(json.meta);
      } else {
        setError(json.error || 'Failed to load report');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <main className="px-6 py-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Staff Performance</h1>
            {meta && <p className="text-xs text-gray-400 mt-0.5">{meta.staffCount} staff members</p>}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Apply'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white border border-gray-200 shadow-sm">
          <StaffPerformanceTable data={data} currency={currency} />
        </div>
      </main>
    </div>
  );
}
