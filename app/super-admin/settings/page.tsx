'use client';

import { useState } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface CollectionStat {
  name: string;
  count: number;
}

interface HealthData {
  status: 'ok' | 'error';
  latencyMs: number;
  totalCollections: number;
  collections: CollectionStat[];
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');

  const [seedLoading, setSeedLoading] = useState<string | null>(null);
  const [seedResults, setSeedResults] = useState<{ target: string; seeded: string[]; error?: string }[]>([]);

  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const res = await fetch('/api/super-admin/system/health', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setHealth(data.data);
      } else {
        setHealthError(data.error || 'Health check failed');
        setHealth(data.data || null);
      }
    } catch {
      setHealthError('Failed to reach the health endpoint');
    } finally {
      setHealthLoading(false);
    }
  };

  const runSeed = async (target: string) => {
    setSeedLoading(target);
    try {
      const res = await fetch('/api/super-admin/system/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      setSeedResults(prev => [
        { target, seeded: data.seeded || [], error: data.success ? undefined : (data.error || 'Failed') },
        ...prev.slice(0, 9),
      ]);
    } catch {
      setSeedResults(prev => [
        { target, seeded: [], error: 'Network error' },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setSeedLoading(null);
    }
  };

  return (
    <SuperAdminShell>
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Database health and seed data management</p>
        </div>

        {/* DB Health */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Database Health</h2>
              <p className="text-sm text-gray-500">Check MongoDB connection and collection stats</p>
            </div>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {healthLoading ? 'Checking...' : 'Check Health'}
            </button>
          </div>

          <div className="p-6">
            {healthError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{healthError}</div>
            )}

            {health ? (
              <div>
                <div className="flex items-center gap-6 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={`text-sm font-semibold ${health.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                      {health.status === 'ok' ? 'Connected' : 'Error'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Latency: <span className="font-medium text-gray-700">{health.latencyMs} ms</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Collections: <span className="font-medium text-gray-700">{health.totalCollections}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Collection</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Documents</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {health.collections.map(col => (
                        <tr key={col.name} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-gray-700">{col.name}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">
                            {col.count === -1 ? 'N/A' : col.count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Click "Check Health" to run diagnostics.</p>
            )}
          </div>
        </section>

        {/* Seed Data */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Seed Data</h2>
            <p className="text-sm text-gray-500">Upsert default platform data</p>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="border border-gray-200 p-4 flex flex-col gap-2 min-w-48">
                <p className="text-sm font-semibold text-gray-900">Subscription Plans</p>
                <p className="text-xs text-gray-500">Upsert Starter, Pro, Business, Enterprise plans</p>
                <button
                  onClick={() => runSeed('plans')}
                  disabled={seedLoading !== null}
                  className="mt-auto px-3 py-1.5 bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {seedLoading === 'plans' ? 'Seeding...' : 'Seed Plans'}
                </button>
              </div>

              <div className="border border-gray-200 p-4 flex flex-col gap-2 min-w-48">
                <p className="text-sm font-semibold text-gray-900">Seed All</p>
                <p className="text-xs text-gray-500">Runs all seed operations in sequence</p>
                <button
                  onClick={() => runSeed('all')}
                  disabled={seedLoading !== null}
                  className="mt-auto px-3 py-1.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {seedLoading === 'all' ? 'Seeding...' : 'Seed All'}
                </button>
              </div>
            </div>

            {/* Seed results log */}
            {seedResults.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Operations</p>
                <div className="space-y-2">
                  {seedResults.map((r, i) => (
                    <div key={i} className={`p-3 border text-sm ${r.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      {r.error ? (
                        <p className="text-red-800"><span className="font-medium">Error [{r.target}]:</span> {r.error}</p>
                      ) : (
                        <p className="text-green-800">
                          <span className="font-medium">Seeded [{r.target}]:</span> {r.seeded.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </SuperAdminShell>
  );
}
