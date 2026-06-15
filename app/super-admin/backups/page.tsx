'use client';

import { useState, useEffect, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/backups', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBackups(data.data);
      } else {
        setError(data.error || 'Failed to load backups');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const triggerBackup = async (uploadToCloud = false) => {
    setTriggering(true);
    setTriggerMsg('');
    try {
      const res = await fetch('/api/super-admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uploadToCloud }),
      });
      const data = await res.json();
      if (data.success) {
        setTriggerMsg(data.message || 'Backup created successfully');
        fetchBackups();
      } else {
        setTriggerMsg(`Error: ${data.message || data.error || 'Failed'}`);
      }
    } catch {
      setTriggerMsg('Error: Network error');
    } finally {
      setTriggering(false);
    }
  };

  const downloadBackup = (filename: string) => {
    const a = document.createElement('a');
    a.href = `/api/super-admin/backups/${encodeURIComponent(filename)}`;
    a.download = filename;
    a.click();
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(`/api/super-admin/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setBackups(prev => prev.filter(b => b.name !== filename));
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Network error');
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <SuperAdminShell>
      <div className="p-6 w-full space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Backups</h1>
          <p className="text-sm text-gray-500 mt-1">
            Full database backups — scheduled daily at 2 AM UTC. Last 7 backups are kept automatically.
          </p>
        </div>

        {/* Trigger backup */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Create Backup</h2>
            <p className="text-sm text-gray-500">Trigger a full database backup immediately</p>
          </div>
          <div className="p-6">
            <div className="flex gap-3">
              <button
                onClick={() => triggerBackup(false)}
                disabled={triggering}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {triggering ? 'Creating...' : 'Create Backup'}
              </button>
              <button
                onClick={() => triggerBackup(true)}
                disabled={triggering}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {triggering ? 'Creating...' : 'Create & Upload to Cloud'}
              </button>
            </div>
            {triggerMsg && (
              <p className={`mt-3 text-sm ${triggerMsg.startsWith('Error') ? 'text-red-700' : 'text-green-700'}`}>
                {triggerMsg}
              </p>
            )}
          </div>
        </section>

        {/* Backup list */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Backup Files</h2>
              <p className="text-sm text-gray-500">Local backups stored on the server</p>
            </div>
            <button
              onClick={fetchBackups}
              disabled={loading}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{error}</div>
            )}

            {loading ? (
              <p className="text-sm text-gray-400 italic">Loading backups...</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No backup files found. Create your first backup above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Size</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {backups.map(backup => (
                      <tr key={backup.name} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{backup.name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{formatBytes(backup.size)}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {new Date(backup.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => downloadBackup(backup.name)}
                              className="px-3 py-1 text-xs bg-brand text-white hover:bg-brand-hover transition-colors font-medium"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => deleteBackup(backup.name)}
                              disabled={deletingFile === backup.name}
                              className="px-3 py-1 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                            >
                              {deletingFile === backup.name ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Schedule info */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Backup Schedule</h2>
          </div>
          <div className="p-6 space-y-2 text-sm text-gray-700">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-w-sm">
              <span className="text-gray-500">Frequency</span>
              <span className="font-medium">Daily at 2:00 AM UTC</span>
              <span className="text-gray-500">Retention</span>
              <span className="font-medium">Last 7 backups</span>
              <span className="text-gray-500">Format</span>
              <span className="font-medium">JSON (all collections)</span>
              <span className="text-gray-500">Cloud upload</span>
              <span className="font-medium">
                {process.env.NEXT_PUBLIC_BACKUP_CLOUD_ENABLED === 'true' ? 'Enabled' : 'Disabled (set S3 env vars)'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </SuperAdminShell>
  );
}
