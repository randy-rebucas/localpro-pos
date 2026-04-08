'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

interface Commission {
  _id: string;
  staffId: { name: string; role: string };
  transactionId: { receiptNumber: string; total: number; createdAt: string };
  amount: number;
  rate: number;
  saleAmount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  period: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function fmt(v: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

export default function CommissionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { settings } = useTenantSettings();
  const currency = (settings || getDefaultTenantSettings()).currency || 'PHP';

  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/commissions?period=${period}&limit=200`);
      const data = await res.json();
      if (data.success) setCommissions(data.data);
      else setError(data.error);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(status: string) {
    if (selected.size === 0) return;
    try {
      const res = await fetch('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      const data = await res.json();
      if (data.success) { setSelected(new Set()); load(); }
      else setError(data.error);
    } catch { setError('Failed to update'); }
  }

  async function calculate() {
    setLoading(true);
    try {
      const [year, month] = period.split('-');
      const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString();
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59).toISOString();
      const res = await fetch('/api/commissions/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (data.success) { load(); }
      else setError(data.error);
    } catch { setError('Calculation failed'); }
    finally { setLoading(false); }
  }

  const total = commissions.reduce((s, c) => s + c.amount, 0);
  const pendingTotal = commissions.filter(c => c.status === 'pending' || c.status === 'approved').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
          <div className="flex gap-2 items-center">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
            <button onClick={calculate} disabled={loading} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">
              Recalculate
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

        {/* Summary bar */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded border p-3">
            <p className="text-xs text-gray-400">Total Commissions</p>
            <p className="text-xl font-bold text-gray-900">{fmt(total, currency)}</p>
          </div>
          <div className="bg-white rounded border p-3">
            <p className="text-xs text-gray-400">Pending Payment</p>
            <p className="text-xl font-bold text-yellow-600">{fmt(pendingTotal, currency)}</p>
          </div>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded flex items-center gap-3 text-sm">
            <span className="text-blue-700 font-medium">{selected.size} selected</span>
            <button onClick={() => updateStatus('approved')} className="text-blue-600 hover:underline">Approve</button>
            <button onClick={() => updateStatus('paid')} className="text-green-600 hover:underline">Mark Paid</button>
            <button onClick={() => updateStatus('rejected')} className="text-red-600 hover:underline">Reject</button>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-3 py-2"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(commissions.map(c => c._id)) : new Set())} /></th>
                <th className="px-3 py-2 text-left">Staff</th>
                <th className="px-3 py-2 text-left">Receipt</th>
                <th className="px-3 py-2 text-right">Sale</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : commissions.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-sm">No commissions for this period. Click Recalculate to generate.</td></tr>
              ) : commissions.map(c => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(c._id)} onChange={e => { const s = new Set(selected); e.target.checked ? s.add(c._id) : s.delete(c._id); setSelected(s); }} /></td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{c.staffId?.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{c.staffId?.role}</p>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.transactionId?.receiptNumber}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.saleAmount, currency)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{c.rate}%</td>
                  <td className="px-3 py-2 text-right font-medium text-green-600">{fmt(c.amount, currency)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
