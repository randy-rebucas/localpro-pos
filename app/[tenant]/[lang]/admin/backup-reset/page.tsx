'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Download, Eraser, FileUp, Upload } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  CHECK_ROW, CHECKBOX, HINT, ICON, INPUT, KEY, KEY_PRIMARY, LABEL,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBackupCollections } from '@/hooks/useBackupCollections';
import { useRestoreCollections } from '@/hooks/useRestoreCollections';
import { useResetCollections } from '@/hooks/useResetCollections';
import { BACKUP_RESET_COLLECTIONS, COLLECTION_GROUPS, clearableKeys, formatFileSize } from '@/lib/backup-reset-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';

type Dict = Record<string, Record<string, unknown> | undefined>;

const KEY_DANGER = 'flex min-h-[44px] items-center justify-center gap-2 bg-stamp px-5 font-receipt text-xs font-semibold uppercase tracking-[0.08em] text-paper-white transition-colors hover:bg-[#a5341f] touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
const SLIP = 'bg-paper-white p-5 text-ink sm:p-6';

/** What the confirmation sheet is asking about. */
type Pending =
  | { kind: 'reset'; keys: string[] }
  | { kind: 'restore'; file: File };

export default function BackupResetPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('reset_collections.manage');
  const [dict, setDict] = useState<Dict | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const t = useCallback((key: string, fallback: string) => {
    const v = dict?.backupReset?.[key];
    return typeof v === 'string' ? v : fallback;
  }, [dict]);
  const c = useCallback((key: string, fallback: string) => {
    const v = dict?.common?.[key];
    return typeof v === 'string' ? v : fallback;
  }, [dict]);

  const { backing, createBackup } = useBackupCollections(tenant, {
    selectFirst: c('selectAtLeastOneCollection', 'Please select at least one collection to backup.'),
    unauthorized: c('unauthorizedBackup', 'Unauthorized. Only admins can backup collections.'),
    failed: c('failedToCreateBackup', 'Failed to create backup. Please check your connection.'),
  });
  const { restoring, restoreResults, ignored, restore } = useRestoreCollections(tenant, {
    selectFirst: c('selectBackupFile', 'Please select a backup file to restore.'),
    unauthorized: c('unauthorizedBackup', 'Unauthorized. Only admins can backup collections.'),
    failed: c('failedToRestoreBackup', 'Failed to restore backup. Please check your connection.'),
    invalidFormat: c('invalidBackupFormat', 'Invalid backup file format. Please select a valid JSON backup file.'),
    invalidFile: c('invalidBackupFile', 'Invalid backup file. Missing collections data.'),
    tooLarge: t('restoreTooLarge', 'The backup file is too large to restore (25 MB at most).'),
    tooManyRecords: t('restoreTooManyRecords', 'The backup file has too many records to restore at once (50,000 in all, 25,000 per collection).'),
  });
  const { resetting, resetResults, reset } = useResetCollections(tenant, {
    selectFirst: c('selectAtLeastOneCollectionReset', 'Please select at least one collection to reset.'),
    unauthorized: c('unauthorizedReset', 'Unauthorized. Only admins can reset collections.'),
    failed: c('failedToResetCollections', 'Failed to reset collections. Please check your connection.'),
  });

  const labelOf = useCallback((key: string) => {
    const known = BACKUP_RESET_COLLECTIONS.find((col) => col.key === key);
    return t(`collection_${key}`, known?.label ?? key.replace(/([A-Z])/g, ' $1').trim());
  }, [t]);

  const confirmWord = t('confirmWord', 'RESET');
  const busy = backing || restoring || resetting;
  const allKeys = useMemo(() => BACKUP_RESET_COLLECTIONS.map((col) => col.key), []);
  // Audit logs can be backed up but never cleared, so the Clear key counts only the rest.
  const clearable = clearableKeys(selected);

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));

  const handleBackup = async () => {
    const count = selected.length;
    await createBackup(
      selected,
      () => toast.success(t('backupDone', 'Backup downloaded: {count} collection(s)').replace('{count}', String(count))),
      (error) => toast.error(error),
    );
  };

  const runRestore = async (file: File, clear: boolean) => {
    await restore(
      file,
      clear,
      (_message, results) => {
        const total = Object.values(results).reduce((sum, r) => sum + (r.restored || 0), 0);
        toast.success(t('restoreDone', 'Backup restored: {count} record(s) added').replace('{count}', String(total)));
        setRestoreFile(null);
        setClearExisting(false);
        if (fileInput.current) fileInput.current.value = '';
      },
      (error) => toast.error(error),
    );
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast.error(c('selectBackupFile', 'Please select a backup file to restore.'));
      return;
    }
    if (clearExisting) {
      setTyped('');
      setPending({ kind: 'restore', file: restoreFile });
      return;
    }
    // Even without clearing, a restore adds every record in the file (sales,
    // stock movements, customers…) to the live store, so ask first
    const ok = await confirm(
      t('restoreAddTitle', 'Restore {file}?').replace('{file}', restoreFile.name),
      t('restoreAddConfirm', 'Every record in this backup that the store does not have yet is added to it, including sales and stock movements. Records it already has are kept as they are.'),
      { variant: 'warning', confirmText: t('restoreAddKey', 'Restore'), cancelText: c('cancel', 'Cancel') }
    );
    if (!ok) return;
    void runRestore(restoreFile, false);
  };

  const handleReset = () => {
    if (clearable.length === 0) {
      toast.error(c('selectAtLeastOneCollectionReset', 'Please select at least one collection to reset.'));
      return;
    }
    setTyped('');
    setPending({ kind: 'reset', keys: [...clearable] });
  };

  const confirmPending = async () => {
    if (!pending || typed.trim().toUpperCase() !== confirmWord.toUpperCase()) return;
    const job = pending;
    setPending(null);
    if (job.kind === 'restore') {
      await runRestore(job.file, true);
      return;
    }
    await reset(
      job.keys,
      (_message, results) => {
        const total = Object.values(results).reduce((sum, r) => sum + (r.deleted || 0), 0);
        toast.success(t('resetDone', 'Cleared {count} record(s)').replace('{count}', String(total)));
        setSelected([]);
      },
      (error) => toast.error(error),
    );
  };

  if (!dict) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-brand-navy-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <RegisterPage
      tag={t('tag', 'Memory · Z-reading')}
      tagNo="BK"
      title={t('titleShort', 'Backup & reset')}
      subtitle={t('subtitleShort', 'Print your store’s memory to a file, load it back, or clear it. Back up before you clear anything.')}
      side={<LedReadout value={String(selected.length).padStart(2, '0')} label={t('selectedLed', 'selected')} />}
    >
      {!canManage && (
        <div className="mt-8">
          <Strip tone="error">{t('accessRestricted', 'You don’t have permission to back up, restore or clear store data. Contact an owner.')}</Strip>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* Memory banks */}
        <section className={`${SLIP} lg:col-span-7`} aria-labelledby="banks-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-ink/30 pb-4">
            <div>
              <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">01</p>
              <h2 id="banks-heading" className="text-3xl sm:text-4xl">{t('banksTitle', 'Memory banks')}</h2>
              <p className="mt-1 text-sm text-ink/70">{t('banksDesc', 'Pick what to back up or clear. Restore uses whatever is in the file.')}</p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelected(allKeys)} className={KEY}>{t('selectAll', 'Select All')}</button>
                <button type="button" onClick={() => setSelected([])} className={KEY} disabled={selected.length === 0}>{t('clearAll', 'Clear All')}</button>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-5">
            {COLLECTION_GROUPS.map((group) => {
              const cols = BACKUP_RESET_COLLECTIONS.filter((col) => col.group === group.key);
              return (
                <fieldset key={group.key}>
                  <legend className="mb-1 flex w-full items-baseline gap-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
                    <span>{t(`group_${group.key}`, group.label)}</span>
                    <span className="mk-leader" aria-hidden />
                  </legend>
                  <div className="grid sm:grid-cols-2">
                    {cols.map((col) => (
                      <label key={col.key} className={`${CHECK_ROW} ${canManage ? '' : 'cursor-not-allowed opacity-60'}`}>
                        <input
                          type="checkbox"
                          className={CHECKBOX}
                          disabled={!canManage || busy}
                          checked={selected.includes(col.key)}
                          onChange={(e) => toggle(col.key, e.target.checked)}
                        />
                        <span>{labelOf(col.key)}</span>
                        {col.backupOnly && (
                          <span className="font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">{t('backupOnlyTag', 'Backup only')}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        <div className="space-y-6 lg:col-span-5">
          {/* Back up */}
          <section className={SLIP} aria-labelledby="backup-heading">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">02</p>
            <h2 id="backup-heading" className="text-3xl sm:text-4xl">{t('backupTitle', 'Backup Collections')}</h2>
            <p className="mt-1 text-sm text-ink/70">{t('backupDesc', 'Export selected collections as a JSON backup file. You can restore this backup later.')}</p>
            <div className="mt-4 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm">
              <ReceiptRow label={t('banksSelected', 'Collections selected')} value={selected.length} />
            </div>
            <button
              type="button"
              onClick={handleBackup}
              disabled={!canManage || busy || selected.length === 0}
              className={`${KEY_PRIMARY} mt-4 w-full sm:w-auto`}
            >
              {backing ? <LoadingSpinner size="sm" /> : <Download className={ICON} strokeWidth={1.75} aria-hidden />}
              {backing ? t('creatingBackup', 'Creating Backup...') : t('downloadBackup', 'Download Backup')}
            </button>
          </section>

          {/* Restore */}
          <section className={SLIP} aria-labelledby="restore-heading">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">03</p>
            <h2 id="restore-heading" className="text-3xl sm:text-4xl">{t('restoreTitle', 'Restore Collections')}</h2>
            <p className="mt-1 text-sm text-ink/70">{t('restoreDescShort', 'Load a backup file. Records already in the store are skipped, so loading the same file twice adds nothing.')}</p>

            <div className="mt-4">
              <label htmlFor="restore-file" className={LABEL}>{t('selectBackupFile', 'Select Backup File')}</label>
              <input
                id="restore-file"
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                disabled={!canManage || busy}
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                className={`${INPUT} file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-1.5 file:font-receipt file:text-xs file:uppercase file:tracking-[0.08em] file:text-paper-white`}
              />
              {restoreFile && (
                <div className="mt-3 font-receipt text-sm">
                  <ReceiptRow label={<span className="break-all">{restoreFile.name}</span>} value={`${formatFileSize(restoreFile.size)} KB`} />
                </div>
              )}
            </div>

            <label className={`${CHECK_ROW} mt-3`}>
              <input
                type="checkbox"
                className={CHECKBOX}
                disabled={!canManage || busy}
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
              />
              <span>{t('clearExisting', 'Clear existing data before restoring')}</span>
            </label>
            {clearExisting && <p className={`${HINT} text-stamp`}>{t('clearExistingHint', 'Everything now in the collections inside the file is deleted first.')}</p>}

            <button
              type="button"
              onClick={handleRestore}
              disabled={!canManage || busy || !restoreFile}
              className={`${clearExisting ? KEY_DANGER : KEY_PRIMARY} mt-4 w-full sm:w-auto`}
            >
              {restoring ? <LoadingSpinner size="sm" /> : <Upload className={ICON} strokeWidth={1.75} aria-hidden />}
              {restoring ? t('restoring', 'Restoring...') : t('restoreBackup', 'Restore Backup')}
            </button>

            {restoreResults && (
              <div className="mt-5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm" role="status">
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-ink/60">{t('restoreResultsShort', 'Restored')}</p>
                <div className="space-y-1">
                  {Object.entries(restoreResults).map(([key, r]) => (
                    <ReceiptRow
                      key={key}
                      label={labelOf(key)}
                      value={[
                        `+${r.restored}`,
                        r.skipped ? t('skippedCount', '{count} skipped').replace('{count}', String(r.skipped)) : null,
                        r.badReference ? t('badReferenceCount', '{count} bad link').replace('{count}', String(r.badReference)) : null,
                        r.cleared ? t('clearedCount', '{count} cleared').replace('{count}', String(r.cleared)) : null,
                      ].filter(Boolean).join(' · ')}
                    />
                  ))}
                </div>
                {Object.values(restoreResults).some((r) => r.badReference) && (
                  <p className={HINT}>{t('badReferenceHint', 'Bad link: the record points at something that is neither in the file nor in this store, so it was left out.')}</p>
                )}
                {ignored.length > 0 && (
                  <p className={HINT}>
                    {t('notRestored', 'Not restored: {list}').replace('{list}', ignored.map(labelOf).join(', '))}
                    {ignored.includes('auditLogs') && <> · {t('auditLogsNeverRestored', 'audit logs are never restored, so the trail can’t be edited')}</>}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Clear memory */}
          <section className={`${SLIP} relative border-l-4 border-stamp`} aria-labelledby="reset-heading">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-stamp">04</p>
            <h2 id="reset-heading" className="text-3xl sm:text-4xl">{t('resetTitleShort', 'Clear memory')}</h2>
            <p className="mt-1 text-sm text-ink/80">{t('resetWarning', 'Warning: This action will permanently delete all data in the selected collections for this tenant. This cannot be undone.')}</p>
            <p className={HINT}>{t('auditLogsNeverCleared', 'Audit logs can be backed up but never cleared.')}</p>
            <button
              type="button"
              onClick={handleReset}
              disabled={!canManage || busy || clearable.length === 0}
              className={`${KEY_DANGER} mt-4 w-full sm:w-auto`}
            >
              {resetting ? <LoadingSpinner size="sm" /> : <Eraser className={ICON} strokeWidth={1.75} aria-hidden />}
              {resetting ? t('resetting', 'Resetting...') : t('resetSelectedCount', 'Clear {count} selected').replace('{count}', String(clearable.length))}
            </button>

            {resetResults && (
              <div className="relative mt-5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm" role="status">
                <span className="mk-stamp pointer-events-none absolute right-2 top-3 border-2 border-stamp px-2 py-0.5 font-receipt text-sm font-semibold uppercase tracking-[0.14em] text-stamp" aria-hidden>
                  {t('clearedStamp', 'Cleared')}
                </span>
                <p className="mb-2 text-xs uppercase tracking-[0.14em] text-ink/60">{t('resetResultsShort', 'Deleted')}</p>
                <div className="space-y-1">
                  {Object.entries(resetResults).map(([key, r]) => (
                    <ReceiptRow key={key} label={labelOf(key)} value={`−${r.deleted}`} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {pending && (
        <Sheet
          title={pending.kind === 'reset'
            ? t('confirmResetTitle', 'Clear {count} collection(s)?').replace('{count}', String(pending.keys.length))
            : t('confirmRestoreTitle', 'Clear, then restore?')}
          subtitle={pending.kind === 'reset'
            ? t('confirmResetSubtitle', 'Every record in these collections is deleted for good.')
            : t('confirmRestoreSubtitle', 'Current data in every collection inside the file is deleted before the file is loaded.')}
          onClose={() => setPending(null)}
          closeLabel={c('close', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setPending(null)} className={KEY}>{c('cancel', 'Cancel')}</button>
              <button
                type="button"
                onClick={confirmPending}
                disabled={typed.trim().toUpperCase() !== confirmWord.toUpperCase()}
                className={KEY_DANGER}
              >
                {pending.kind === 'reset'
                  ? <><Eraser className={ICON} strokeWidth={1.75} aria-hidden />{t('confirmResetKey', 'Clear for good')}</>
                  : <><FileUp className={ICON} strokeWidth={1.75} aria-hidden />{t('confirmRestoreKey', 'Clear and restore')}</>}
              </button>
            </>
          }
        >
          {pending.kind === 'reset' ? (
            <>
              <div className="space-y-1 font-receipt text-sm">
                {pending.keys.map((key) => <ReceiptRow key={key} label={labelOf(key)} value="−" />)}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-ink/30 pt-4">
                <p className="min-w-0 flex-1 text-sm text-ink/70">{t('backupFirstHint', 'No backup of these yet? Download one before you clear them.')}</p>
                <button
                  type="button"
                  onClick={() => createBackup(
                    pending.keys,
                    () => toast.success(t('backupDone', 'Backup downloaded: {count} collection(s)').replace('{count}', String(pending.keys.length))),
                    (error) => toast.error(error),
                  )}
                  disabled={backing}
                  className={KEY}
                >
                  {backing ? <LoadingSpinner size="sm" /> : <Download className={ICON} strokeWidth={1.75} aria-hidden />}
                  {t('downloadBackup', 'Download Backup')}
                </button>
              </div>
            </>
          ) : (
            <div className="font-receipt text-sm">
              <ReceiptRow label={<span className="break-all">{pending.file.name}</span>} value={`${formatFileSize(pending.file.size)} KB`} />
            </div>
          )}

          <div className="mt-5">
            <label htmlFor="confirm-word" className={LABEL}>
              {t('typeToConfirm', 'Type {word} to confirm').replace('{word}', confirmWord)}
            </label>
            <input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmPending(); }}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className={`${INPUT} font-receipt uppercase tracking-[0.14em]`}
            />
          </div>
        </Sheet>
      )}
      {ConfirmDialog}
    </RegisterPage>
  );
}
