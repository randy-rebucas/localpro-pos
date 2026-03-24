'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/lib/toast';

interface LoyaltyConfig {
  pointsPerPeso: number;
  pesoPerPoint: number;
  minRedemption: number;
  isEnabled: boolean;
}

interface LoyaltyCustomer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyPointsBalance: number;
  totalSpent?: number;
  isActive: boolean;
}

export default function LoyaltyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [configForm, setConfigForm] = useState<LoyaltyConfig>({
    pointsPerPeso: 1,
    pesoPerPoint: 0.10,
    minRedemption: 100,
    isEnabled: true,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/loyalty/config', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setConfigForm(json.data);
        setConfigDirty(false);
      }
    } catch {
      showToast.error('Failed to load loyalty configuration');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) qs.set('search', search);
      const res = await fetch(`/api/customers?${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data);
        setTotalPages(json.pagination?.pages ?? 1);
        setTotalCustomers(json.pagination?.total ?? 0);
      }
    } catch {
      showToast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch('/api/loyalty/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(configForm),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setConfigDirty(false);
        showToast.success('Loyalty settings saved');
      } else {
        showToast.error(json.error || 'Failed to save settings');
      }
    } catch {
      showToast.error('Failed to save settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const updateConfigForm = (patch: Partial<LoyaltyConfig>) => {
    setConfigForm(f => ({ ...f, ...patch }));
    setConfigDirty(true);
  };

  // Stats derived from current customers list
  const enrolledCount = customers.filter(c => (c.loyaltyPointsBalance ?? 0) > 0).length;
  const totalPoints = customers.reduce((sum, c) => sum + (c.loyaltyPointsBalance ?? 0), 0);
  const pesoValue = config ? totalPoints * config.pesoPerPoint : 0;

  if (configLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Admin
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Loyalty Program</h1>
              <p className="text-gray-600">Configure points settings and manage customer rewards.</p>
            </div>
            <span
              className={`px-3 py-1 text-xs font-semibold border ${
                config?.isEnabled
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}
            >
              {config?.isEnabled ? 'Active' : 'Paused'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Customers', value: totalCustomers.toLocaleString() },
            { label: 'With Points', value: enrolledCount.toLocaleString() },
            { label: 'Points Outstanding', value: totalPoints.toLocaleString() },
            { label: 'Est. Liability', value: `₱${pesoValue.toFixed(2)}` },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-300 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium mb-1">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Settings Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-300 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                Program Settings
              </h2>
              <form onSubmit={handleConfigSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Points per ₱1 spent
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={configForm.pointsPerPeso}
                    onChange={e => updateConfigForm({ pointsPerPeso: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    e.g. 1 = earn 1 pt per ₱1
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    ₱ value per point
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={configForm.pesoPerPoint}
                    onChange={e => updateConfigForm({ pesoPerPoint: parseFloat(e.target.value) || 0.1 })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    e.g. 0.10 = 100 pts = ₱10
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Minimum pts to redeem
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={configForm.minRedemption}
                    onChange={e => updateConfigForm({ minRedemption: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={configForm.isEnabled}
                    onClick={() => updateConfigForm({ isEnabled: !configForm.isEnabled })}
                    className={`relative inline-block h-5 w-10 cursor-pointer transition-colors duration-200 focus:outline-none ${
                      configForm.isEnabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-3 w-3 bg-white transition-transform duration-200 ${
                        configForm.isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">
                    {configForm.isEnabled ? 'Program enabled' : 'Program paused'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig || !configDirty}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingConfig ? 'Saving...' : configDirty ? 'Save Changes' : 'Saved'}
                </button>
              </form>

              {config && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                  <p>Rate: {config.pointsPerPeso} pt / ₱1 spent</p>
                  <p>Value: ₱{config.pesoPerPoint} / point</p>
                  <p>Min redeem: {config.minRedemption} points (₱{(config.minRedemption * config.pesoPerPoint).toFixed(2)})</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer List */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-300 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Customer Balances</h2>
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500 w-52"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="inline-block animate-spin h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : customers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <p className="text-sm">No customers found.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Customers appear here once they are added to the system.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Points</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Value</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {customers.map(c => {
                        const balance = c.loyaltyPointsBalance ?? 0;
                        const value = config ? balance * config.pesoPerPoint : 0;
                        return (
                          <tr key={c._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                              {!c.isActive && (
                                <span className="text-xs text-gray-400">Inactive</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {c.email || c.phone || '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              {balance > 0 ? (
                                <span className="text-sm font-semibold text-blue-700">
                                  {balance.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                              {value > 0 ? `₱${value.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <Link
                                href={`/${tenant}/${lang}/admin/loyalty/${c._id}`}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Manage
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
