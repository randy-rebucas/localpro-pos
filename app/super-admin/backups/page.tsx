'use client';

import { useState, useEffect, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

interface RestoreCollectionResult {
  inserted: number;
  cleared: number;
  skipped?: boolean;
}

interface RestoreResult {
  success: boolean;
  message: string;
  dryRun: boolean;
  collections: Record<string, RestoreCollectionResult>;
  errors: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // Restore from server-side file
  const [restoreFilename, setRestoreFilename] = useState('');
  const [restoreClear, setRestoreClear] = useState(false);
  const [restoreDry, setRestoreDry] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState('');

  // Restore from uploaded file
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadClear, setUploadClear] = useState(false);
  const [uploadDry, setUploadDry] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<RestoreResult | null>(null);
  const [uploadError, setUploadError] = useState('');

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/super-admin/backups', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBackups(data.data);
      } else {
        setListError(data.error || 'Failed to load backups');
      }
    } catch {
      setListError('Network error');
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
        if (restoreFilename === filename) setRestoreFilename('');
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Network error');
    } finally {
      setDeletingFile(null);
    }
  };

  const restoreFromServer = async () => {
    if (!restoreFilename) return;
    if (!restoreDry && !confirm(
      restoreClear
        ? `This will DELETE all existing documents in each restored collection, then insert the backup data.\n\nBackup: ${restoreFilename}\n\nType OK to continue.`
        : `This will insert documents from "${restoreFilename}" into the live database (existing documents are kept).\n\nProceed?`
    )) return;

    setRestoring(true);
    setRestoreResult(null);
    setRestoreError('');
    try {
      const res = await fetch('/api/super-admin/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: restoreFilename, clearExisting: restoreClear, dryRun: restoreDry }),
      });
      const data: RestoreResult = await res.json();
      if (data.success) {
        setRestoreResult(data);
      } else {
        setRestoreError(data.message || 'Restore failed');
      }
    } catch {
      setRestoreError('Network error');
    } finally {
      setRestoring(false);
    }
  };

  const restoreFromUpload = async () => {
    if (!uploadFile) return;
    if (!uploadDry && !confirm(
      uploadClear
        ? `This will DELETE all existing documents in each restored collection, then insert the uploaded backup data.\n\nFile: ${uploadFile.name}\n\nProceed?`
        : `This will insert documents from "${uploadFile.name}" into the live database.\n\nProceed?`
    )) return;

    setUploading(true);
    setUploadResult(null);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('clearExisting', String(uploadClear));
      form.append('dryRun', String(uploadDry));

      const res = await fetch('/api/super-admin/backups/restore', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data: RestoreResult = await res.json();
      if (data.success) {
        setUploadResult(data);
      } else {
        setUploadError(data.message || 'Restore failed');
      }
    } catch {
      setUploadError('Network error');
    } finally {
      setUploading(false);
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

        {/* Create Backup */}
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

        {/* Backup Files */}
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
            {listError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{listError}</div>
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
                      <tr key={backup.name} className={`hover:bg-gray-50 ${restoreFilename === backup.name ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-2.5 font-mono text-gray-700">{backup.name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{formatBytes(backup.size)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{new Date(backup.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setRestoreFilename(backup.name); setRestoreResult(null); setRestoreError(''); }}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${restoreFilename === backup.name ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                            >
                              Restore
                            </button>
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

        {/* Restore from server file */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Restore from Server Backup</h2>
            <p className="text-sm text-gray-500">Restore a backup file already on the server. Click "Restore" on a file above to select it.</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Selected file</label>
              {restoreFilename ? (
                <p className="font-mono text-sm text-gray-800 bg-gray-50 border border-gray-200 px-3 py-2">{restoreFilename}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">No file selected — click "Restore" in the table above.</p>
              )}
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={restoreClear} onChange={e => setRestoreClear(e.target.checked)} className="h-4 w-4 text-red-600 border-gray-300 rounded" />
                Clear existing data before restore
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={restoreDry} onChange={e => setRestoreDry(e.target.checked)} className="h-4 w-4 text-gray-600 border-gray-300 rounded" />
                Dry run (preview only, no writes)
              </label>
            </div>

            {restoreClear && !restoreDry && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm">
                All documents in each restored collection will be <strong>permanently deleted</strong> before inserting backup data.
              </div>
            )}

            <button
              onClick={restoreFromServer}
              disabled={!restoreFilename || restoring}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {restoring ? 'Restoring...' : restoreDry ? 'Run Dry Run' : 'Restore'}
            </button>

            {restoreError && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{restoreError}</div>
            )}
            {restoreResult && <RestoreResultPanel result={restoreResult} />}
          </div>
        </section>

        {/* Restore from uploaded file */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Restore from Uploaded File</h2>
            <p className="text-sm text-gray-500">Upload a backup JSON file from your computer to restore into the database.</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Backup file (.json)</label>
              <input
                type="file"
                accept=".json"
                onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setUploadResult(null); setUploadError(''); }}
                className="block w-full text-sm text-gray-700 border border-gray-300 px-3 py-2 focus:outline-none focus:border-blue-500"
              />
              {uploadFile && (
                <p className="mt-1 text-xs text-gray-500">{uploadFile.name} — {formatBytes(uploadFile.size)}</p>
              )}
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={uploadClear} onChange={e => setUploadClear(e.target.checked)} className="h-4 w-4 text-red-600 border-gray-300 rounded" />
                Clear existing data before restore
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={uploadDry} onChange={e => setUploadDry(e.target.checked)} className="h-4 w-4 text-gray-600 border-gray-300 rounded" />
                Dry run (preview only, no writes)
              </label>
            </div>

            {uploadClear && !uploadDry && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm">
                All documents in each restored collection will be <strong>permanently deleted</strong> before inserting backup data.
              </div>
            )}

            <button
              onClick={restoreFromUpload}
              disabled={!uploadFile || uploading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Restoring...' : uploadDry ? 'Run Dry Run' : 'Restore'}
            </button>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm">{uploadError}</div>
            )}
            {uploadResult && <RestoreResultPanel result={uploadResult} />}
          </div>
        </section>

        {/* Schedule info */}
        <section className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Backup Schedule</h2>
          </div>
          <div className="p-6 text-sm text-gray-700">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-w-sm">
              <span className="text-gray-500">Frequency</span>
              <span className="font-medium">Daily at 2:00 AM UTC</span>
              <span className="text-gray-500">Retention</span>
              <span className="font-medium">Last 7 backups</span>
              <span className="text-gray-500">Format</span>
              <span className="font-medium">JSON (all collections)</span>
              <span className="text-gray-500">Cloud upload</span>
              <span className="font-medium">Disabled (set S3 env vars)</span>
            </div>
          </div>
        </section>
      </div>
    </SuperAdminShell>
  );
}

function RestoreResultPanel({ result }: { result: RestoreResult }) {
  const entries = Object.entries(result.collections);
  const totalInserted = entries.reduce((s, [, c]) => s + c.inserted, 0);
  const totalCleared = entries.reduce((s, [, c]) => s + c.cleared, 0);

  return (
    <div className={`p-4 border text-sm ${result.dryRun ? 'bg-gray-50 border-gray-300' : result.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
      <p className={`font-semibold mb-3 ${result.dryRun ? 'text-gray-800' : result.success ? 'text-green-800' : 'text-red-800'}`}>
        {result.dryRun && '[DRY RUN] '}{result.message}
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left pr-8 pb-1">Collection</th>
              <th className="text-right pr-8 pb-1">{result.dryRun ? 'Would insert' : 'Inserted'}</th>
              {totalCleared > 0 && <th className="text-right pr-8 pb-1">Cleared</th>}
              <th className="text-left pb-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, col]) => (
              <tr key={name} className="border-t border-gray-200">
                <td className="font-mono pr-8 py-1 text-gray-700">{name}</td>
                <td className="text-right pr-8 py-1 text-gray-700">{col.inserted.toLocaleString()}</td>
                {totalCleared > 0 && <td className="text-right pr-8 py-1 text-gray-500">{col.cleared.toLocaleString()}</td>}
                <td className="py-1">
                  {col.skipped
                    ? <span className="text-gray-400">skipped</span>
                    : <span className="text-green-600">ok</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 font-semibold">
              <td className="pr-8 py-1 text-gray-700">Total</td>
              <td className="text-right pr-8 py-1 text-gray-700">{totalInserted.toLocaleString()}</td>
              {totalCleared > 0 && <td className="text-right pr-8 py-1 text-gray-600">{totalCleared.toLocaleString()}</td>}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {result.errors.length > 0 && (
        <div className="mt-3">
          <p className="font-medium text-red-700 mb-1">Warnings ({result.errors.length})</p>
          <ul className="space-y-0.5">
            {result.errors.map((e, i) => (
              <li key={i} className="text-red-600">— {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
