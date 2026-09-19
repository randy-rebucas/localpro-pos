'use client';

import { useEffect, useState } from 'react';

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

interface CronJob {
  name: string;
  schedule: string;
  running: boolean;
}

interface CronStatus {
  enabled: boolean;
  activeJobs: number;
  jobs: CronJob[];
}

interface MaintenanceSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');

  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState('');

  const [maintenance, setMaintenance] = useState<MaintenanceSettings | null>(null);
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState('');
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState('');

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

  const checkCronStatus = async () => {
    setCronLoading(true);
    setCronError('');
    try {
      const res = await fetch('/api/super-admin/system/cron', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCronStatus(data.data);
      } else {
        setCronError(data.error || 'Failed to load cron status');
      }
    } catch {
      setCronError('Failed to reach the cron status endpoint');
    } finally {
      setCronLoading(false);
    }
  };

  const loadMaintenance = async () => {
    setMaintenanceError('');
    try {
      const res = await fetch('/api/super-admin/system/maintenance', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMaintenance(data.data);
        setMaintenanceMessageDraft(data.data.maintenanceMessage || '');
      } else {
        setMaintenanceError(data.error || 'Failed to load maintenance settings');
      }
    } catch {
      setMaintenanceError('Failed to reach the maintenance settings endpoint');
    }
  };

  const toggleMaintenance = async (enabled: boolean) => {
    setMaintenanceLoading(true);
    setMaintenanceError('');
    try {
      const res = await fetch('/api/super-admin/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled, message: maintenanceMessageDraft }),
      });
      const data = await res.json();
      if (data.success) {
        setMaintenance(data.data);
      } else {
        setMaintenanceError(data.error || 'Failed to update maintenance settings');
      }
    } catch {
      setMaintenanceError('Failed to reach the maintenance settings endpoint');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  useEffect(() => {
    loadMaintenance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <div className="p-6 w-full space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Database health, automation jobs, and maintenance mode</p>
        </div>

        {/* Maintenance Mode */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Maintenance Mode</h2>
            <p className="text-sm text-gray-500">Block all tenant-facing traffic platform-wide</p>
          </div>

          <div className="p-6">
            {maintenanceError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{maintenanceError}</div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <span className={`inline-block w-2.5 h-2.5 ${maintenance?.maintenanceMode ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className={`text-sm font-semibold ${maintenance?.maintenanceMode ? 'text-red-700' : 'text-green-700'}`}>
                {maintenance?.maintenanceMode ? 'Maintenance mode is ON' : 'Live'}
              </span>
            </div>

            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Message shown to tenants while enabled
            </label>
            <textarea
              value={maintenanceMessageDraft}
              onChange={e => setMaintenanceMessageDraft(e.target.value)}
              placeholder="We're performing scheduled maintenance. Please check back shortly."
              rows={2}
              className="w-full border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:border-brand"
            />

            <div className="flex gap-3">
              <button
                onClick={() => toggleMaintenance(true)}
                disabled={maintenanceLoading || maintenance?.maintenanceMode === true}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium border border-red-700 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {maintenanceLoading ? 'Saving...' : 'Enable Maintenance Mode'}
              </button>
              <button
                onClick={() => toggleMaintenance(false)}
                disabled={maintenanceLoading || maintenance?.maintenanceMode === false}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium border border-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {maintenanceLoading ? 'Saving...' : 'Disable Maintenance Mode'}
              </button>
            </div>
          </div>
        </section>

        {/* Cron Jobs */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Automation Jobs</h2>
              <p className="text-sm text-gray-500">Scheduled cron job status</p>
            </div>
            <button
              onClick={checkCronStatus}
              disabled={cronLoading}
              className="px-4 py-2 bg-brand text-white text-sm font-medium border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {cronLoading ? 'Checking...' : 'Check Status'}
            </button>
          </div>

          <div className="p-6">
            {cronError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{cronError}</div>
            )}

            {cronStatus ? (
              <div>
                <div className="flex items-center gap-6 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 ${cronStatus.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className={`text-sm font-semibold ${cronStatus.enabled ? 'text-green-700' : 'text-gray-500'}`}>
                      {cronStatus.enabled ? 'Cron enabled' : 'Cron disabled (ENABLE_CRON_JOBS not set)'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Jobs: <span className="font-medium text-gray-700">{cronStatus.activeJobs}</span>
                  </div>
                </div>

                {cronStatus.jobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {cronStatus.jobs.map(job => (
                          <tr key={job.name} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{job.name}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{job.schedule}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={job.running ? 'text-green-700 font-medium' : 'text-gray-400'}>
                                {job.running ? 'Running' : 'Stopped'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No jobs registered in this process.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Click &quot;Check Status&quot; to view registered automation jobs.</p>
            )}
          </div>
        </section>

        {/* DB Health */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Database Health</h2>
              <p className="text-sm text-gray-500">Check PostgreSQL connection and table stats</p>
            </div>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="px-4 py-2 bg-brand text-white text-sm font-medium border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
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
                    <span className={`inline-block w-2.5 h-2.5 ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
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
              <p className="text-sm text-gray-400 italic">Click &quot;Check Health&quot; to run diagnostics.</p>
            )}
          </div>
        </section>
      </div>
  );
}
