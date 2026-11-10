'use client';

import { useState, useEffect, useCallback } from 'react';
import { CloudUpload, Database, DatabaseBackup, Download, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  CHECKBOX,
  CHECK_ROW,
  Empty,
  HINT,
  ICON,
  INPUT,
  KEY,
  KEY_DANGER,
  KEY_PRIMARY,
  KEY_SM,
  KEY_SM_DANGER,
  LABEL,
  LedReadout,
  Printing,
  SaPage,
  Slip,
  Strip,
  TABLE,
  TBODY,
  TD,
  TD_RIGHT,
  TH,
  TH_RIGHT,
  THEAD,
  TR,
  Tag,
} from '@/components/super-admin/ui';

/** What the scheduled backup does on this server, from GET /api/super-admin/backups. */
interface BackupSchedule {
  schedulerEnabled: boolean;
  frequency: string;
  retention: number;
  collectionLimit: number;
  cloudConfigured: boolean;
}

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
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
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
        if (data.schedule) setSchedule(data.schedule);
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
    <SaPage
      tagNo="12"
      tag="Night safe"
      title="Backups"
      subtitle="Full database backups you can take now, restore or download. Older files are deleted automatically."
      side={<LedReadout value={loading ? '--' : backups.length} label="On file" />}
    >
      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Create Backup */}
        <Slip title="Create backup" className="lg:col-span-7" bodyClassName="px-4 py-4 sm:px-5">
          <p className="text-sm text-ink/65">Take a full database backup right now.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => triggerBackup(false)} disabled={triggering} className={KEY_PRIMARY}>
              <DatabaseBackup className={ICON} strokeWidth={1.75} aria-hidden />
              {triggering ? 'Creating…' : 'Create backup'}
            </button>
            <button
              type="button"
              onClick={() => triggerBackup(true)}
              disabled={triggering || !schedule?.cloudConfigured}
              className={KEY}
              aria-describedby={schedule && !schedule.cloudConfigured ? 'backup-cloud-hint' : undefined}
            >
              <CloudUpload className={ICON} strokeWidth={1.75} aria-hidden />
              {triggering ? 'Creating…' : 'Create & upload to cloud'}
            </button>
          </div>
          {schedule && !schedule.cloudConfigured && (
            <p id="backup-cloud-hint" className="mt-2 font-receipt text-xs text-ink/60">
              Cloud upload needs BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY on the server.
            </p>
          )}
          {triggerMsg && (
            <div className="mt-4">
              <Strip tone={triggerMsg.startsWith('Error') ? 'error' : 'ok'}>{triggerMsg}</Strip>
            </div>
          )}
        </Slip>

        {/* Schedule info */}
        <Slip title="Schedule" tear className="lg:col-span-5" bodyClassName="space-y-1.5 px-4 py-4 font-receipt text-sm sm:px-5">
          {!schedule ? (
            <p className="text-ink/60">{loading ? 'Reading the schedule…' : 'The schedule didn’t load.'}</p>
          ) : (
            <>
              <ReceiptRow label="Scheduler" value={schedule.schedulerEnabled ? 'On' : 'Off'} />
              <ReceiptRow label="Frequency" value={schedule.frequency} />
              <ReceiptRow label="Retention" value={`Last ${schedule.retention} files`} />
              <ReceiptRow label="Per collection" value={`Up to ${schedule.collectionLimit.toLocaleString()} docs`} />
              <ReceiptRow label="Cloud upload" value={schedule.cloudConfigured ? 'On (S3)' : 'Off'} />
              {!schedule.schedulerEnabled && (
                <p className="pt-2 text-xs leading-relaxed text-ink/60">
                  The built-in scheduler is off on this server. Set ENABLE_CRON_JOBS=true, or call /api/automations/backups/create from an external cron.
                </p>
              )}
              {schedule.cloudConfigured && (
                <p className="pt-2 text-xs leading-relaxed text-ink/60">Scheduled backups are uploaded to S3 as well as kept on the server.</p>
              )}
            </>
          )}
        </Slip>
      </div>

      {/* Backup Files */}
      <Slip
        title="Backup files · on the server"
        className="mt-8"
        action={
          <button type="button" onClick={fetchBackups} disabled={loading} className={KEY_SM}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      >
        {listError && (
          <div className="px-4 pt-4 sm:px-5">
            <Strip tone="error">{listError}</Strip>
          </div>
        )}
        {loading ? (
          <Printing label="Loading backups…" />
        ) : backups.length === 0 ? (
          <Empty icon={<Database className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>
            No backup files found. Create your first backup above.
          </Empty>
        ) : (
          <>
            {/* Below lg: one printed line per file */}
            <ul className="divide-y divide-dashed divide-ink/20 lg:hidden">
              {backups.map(backup => {
                const selected = restoreFilename === backup.name;
                return (
                  <li key={backup.name} className={`px-4 py-3 ${selected ? 'bg-brand-soft' : ''}`}>
                    <p className="break-all font-receipt text-sm">{backup.name}</p>
                    <p className="mt-0.5 font-receipt text-xs text-ink/60">
                      {formatBytes(backup.size)} · {new Date(backup.createdAt).toLocaleString(undefined, { hour12: true })}
                    </p>
                    <div className="mt-2">{renderRowKeys(backup.name, selected)}</div>
                  </li>
                );
              })}
            </ul>

            {/* From lg: the full table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th scope="col" className={TH}>Filename</th>
                    <th scope="col" className={TH_RIGHT}>Size</th>
                    <th scope="col" className={TH}>Created</th>
                    <th scope="col" className={TH_RIGHT}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {backups.map(backup => {
                    const selected = restoreFilename === backup.name;
                    return (
                      <tr key={backup.name} className={`${TR} ${selected ? 'bg-brand-soft' : ''}`}>
                        <td className={`${TD} break-all`}>{backup.name}</td>
                        <td className={TD_RIGHT}>{formatBytes(backup.size)}</td>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>
                          {new Date(backup.createdAt).toLocaleString(undefined, { hour12: true })}
                        </td>
                        <td className="px-4 py-2">{renderRowKeys(backup.name, selected, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Slip>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-2">
        {/* Restore from server file */}
        <Slip title="Restore from server backup" bodyClassName="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-sm text-ink/65">Restore a backup file already on the server. Press Restore on a file above to select it.</p>
          <div>
            <p className={LABEL}>Selected file</p>
            {restoreFilename ? (
              <p className="break-all border border-dashed border-ink/30 bg-paper px-3 py-2 font-receipt text-sm">{restoreFilename}</p>
            ) : (
              <p className="font-receipt text-sm text-ink/50">No file selected. Press Restore in the list above.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6">
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={restoreClear} onChange={e => setRestoreClear(e.target.checked)} className={CHECKBOX} />
              Clear existing data before restore
            </label>
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={restoreDry} onChange={e => setRestoreDry(e.target.checked)} className={CHECKBOX} />
              Dry run (preview only, no writes)
            </label>
          </div>

          {restoreClear && !restoreDry && (
            <Strip tone="error">
              All documents in each restored collection will be <strong>permanently deleted</strong> before inserting backup data.
            </Strip>
          )}

          <button
            type="button"
            onClick={restoreFromServer}
            disabled={!restoreFilename || restoring}
            className={restoreClear && !restoreDry ? KEY_DANGER : KEY_PRIMARY}
          >
            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
            {restoring ? 'Restoring…' : restoreDry ? 'Run dry run' : 'Restore'}
          </button>

          {restoreError && <Strip tone="error">{restoreError}</Strip>}
          {restoreResult && <RestoreResultPanel result={restoreResult} />}
        </Slip>

        {/* Restore from uploaded file */}
        <Slip title="Restore from uploaded file" bodyClassName="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-sm text-ink/65">Upload a backup JSON file from your computer to restore into the database.</p>
          <div>
            <label htmlFor="backup-upload" className={LABEL}>Backup file (.json)</label>
            <input
              id="backup-upload"
              type="file"
              accept=".json"
              onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setUploadResult(null); setUploadError(''); }}
              className={`${INPUT} font-receipt file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-1.5 file:font-receipt file:text-xs file:uppercase file:tracking-[0.08em] file:text-paper-white`}
            />
            {uploadFile && (
              <p className={HINT}>{uploadFile.name} · {formatBytes(uploadFile.size)}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6">
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={uploadClear} onChange={e => setUploadClear(e.target.checked)} className={CHECKBOX} />
              Clear existing data before restore
            </label>
            <label className={CHECK_ROW}>
              <input type="checkbox" checked={uploadDry} onChange={e => setUploadDry(e.target.checked)} className={CHECKBOX} />
              Dry run (preview only, no writes)
            </label>
          </div>

          {uploadClear && !uploadDry && (
            <Strip tone="error">
              All documents in each restored collection will be <strong>permanently deleted</strong> before inserting backup data.
            </Strip>
          )}

          <button
            type="button"
            onClick={restoreFromUpload}
            disabled={!uploadFile || uploading}
            className={uploadClear && !uploadDry ? KEY_DANGER : KEY_PRIMARY}
          >
            <Upload className={ICON} strokeWidth={1.75} aria-hidden />
            {uploading ? 'Restoring…' : uploadDry ? 'Run dry run' : 'Restore'}
          </button>

          {uploadError && <Strip tone="error">{uploadError}</Strip>}
          {uploadResult && <RestoreResultPanel result={uploadResult} />}
        </Slip>
      </div>
    </SaPage>
  );

  function renderRowKeys(name: string, selected: boolean, alignEnd = false) {
    return (
      <div className={`flex flex-wrap gap-2 ${alignEnd ? 'justify-end' : ''}`}>
        <button
          type="button"
          onClick={() => { setRestoreFilename(name); setRestoreResult(null); setRestoreError(''); }}
          aria-pressed={selected}
          className={selected ? `${KEY_SM} border-ink bg-ink text-paper-white hover:bg-brand-navy` : KEY_SM}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {selected ? 'Selected' : 'Restore'}
        </button>
        <button type="button" onClick={() => downloadBackup(name)} className={KEY_SM}>
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Download
        </button>
        <button
          type="button"
          onClick={() => deleteBackup(name)}
          disabled={deletingFile === name}
          className={KEY_SM_DANGER}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {deletingFile === name ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    );
  }
}

function RestoreResultPanel({ result }: { result: RestoreResult }) {
  const entries = Object.entries(result.collections);
  const totalInserted = entries.reduce((s, [, c]) => s + c.inserted, 0);
  const totalCleared = entries.reduce((s, [, c]) => s + c.cleared, 0);
  const accent = result.dryRun ? 'border-ink/40' : result.success ? 'border-brand-hover' : 'border-stamp';

  return (
    <div role="status" className={`border-l-4 bg-paper px-4 py-3 font-receipt text-sm text-ink ${accent}`}>
      <p className="mb-3 font-semibold">
        {result.dryRun && <span className="mr-2"><Tag tone="info">Dry run</Tag></span>}
        {result.message}
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="border-b border-dashed border-ink/30 text-ink/60">
            <tr>
              <th scope="col" className="pb-1 pr-6 text-left font-medium uppercase tracking-[0.08em]">Collection</th>
              <th scope="col" className="pb-1 pr-6 text-right font-medium uppercase tracking-[0.08em]">{result.dryRun ? 'Would insert' : 'Inserted'}</th>
              {totalCleared > 0 && <th scope="col" className="pb-1 pr-6 text-right font-medium uppercase tracking-[0.08em]">Cleared</th>}
              <th scope="col" className="pb-1 text-left font-medium uppercase tracking-[0.08em]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-ink/15">
            {entries.map(([name, col]) => (
              <tr key={name}>
                <td className="py-1 pr-6">{name}</td>
                <td className="py-1 pr-6 text-right">{col.inserted.toLocaleString()}</td>
                {totalCleared > 0 && <td className="py-1 pr-6 text-right text-ink/60">{col.cleared.toLocaleString()}</td>}
                <td className="py-1">
                  {col.skipped ? <Tag>Skipped</Tag> : <Tag tone="ok">OK</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/40 font-semibold">
              <td className="py-1 pr-6">Total</td>
              <td className="py-1 pr-6 text-right">{totalInserted.toLocaleString()}</td>
              {totalCleared > 0 && <td className="py-1 pr-6 text-right">{totalCleared.toLocaleString()}</td>}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {result.errors.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 font-medium text-stamp">Warnings ({result.errors.length})</p>
          <ul className="space-y-0.5">
            {result.errors.map((e, i) => (
              <li key={i} className="text-stamp">— {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
