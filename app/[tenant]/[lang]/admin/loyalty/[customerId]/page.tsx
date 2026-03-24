'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/lib/toast';

interface LoyaltyEntry {
  _id: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

interface LoyaltyData {
  customerId: string;
  customerName: string;
  loyaltyPointsBalance: number;
  history: LoyaltyEntry[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const typeColors: Record<string, string> = {
  earn: 'bg-green-100 text-green-700',
  redeem: 'bg-orange-100 text-orange-700',
  adjust: 'bg-blue-100 text-blue-700',
};

export default function LoyaltyCustomerPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const customerId = params.customerId as string;

  const [data, setData] = useState<LoyaltyData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/loyalty/customers/${customerId}?page=${page}&limit=20`
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        showToast.error(json.error || 'Failed to load loyalty data');
      }
    } catch {
      showToast.error('Failed to load loyalty data');
    } finally {
      setLoading(false);
    }
  }, [customerId, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const points = parseInt(adjustPoints);
    if (!points || points === 0) {
      showToast.error('Enter a non-zero point value');
      return;
    }
    if (!adjustDesc.trim()) {
      showToast.error('Description is required');
      return;
    }
    setAdjusting(true);
    try {
      const res = await fetch(`/api/loyalty/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, points, description: adjustDesc }),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success('Points adjusted successfully');
        setAdjustPoints('');
        setAdjustDesc('');
        setPage(1);
        fetchData();
      } else {
        showToast.error(json.error || 'Adjustment failed');
      }
    } catch {
      showToast.error('Adjustment failed');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full p-6">
        <div className="mb-4">
          <Link
            href={`/${tenant}/${lang}/admin/loyalty`}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Loyalty Program
          </Link>
        </div>

        {loading && !data ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : data ? (
          <>
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{data.customerName}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Loyalty Points Account</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">
                    {data.loyaltyPointsBalance.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">points balance</div>
                </div>
              </div>
            </div>

            {/* Manual Adjustment */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-base font-semibold text-gray-800 mb-3">Manual Adjustment</h2>
              <form onSubmit={handleAdjust} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="number"
                  placeholder="Points (+ to add, - to deduct)"
                  value={adjustPoints}
                  onChange={e => setAdjustPoints(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Reason / description"
                  value={adjustDesc}
                  onChange={e => setAdjustDesc(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={adjusting}
                  className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {adjusting ? 'Saving...' : 'Apply'}
                </button>
              </form>
            </div>

            {/* History */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Points History</h2>
              {data.history.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No history yet.</div>
              ) : (
                <div className="space-y-3">
                  {data.history.map(entry => (
                    <div key={entry._id} className="flex items-start justify-between py-2 border-b last:border-0">
                      <div className="flex items-start gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded mt-0.5 ${typeColors[entry.type]}`}>
                          {entry.type}
                        </span>
                        <div>
                          <p className="text-sm text-gray-800">{entry.description}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(entry.createdAt).toLocaleString()} · Balance: {entry.balanceBefore} → {entry.balanceAfter}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ml-4 ${entry.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.points > 0 ? `+${entry.points}` : entry.points}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">
                    {page} / {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
