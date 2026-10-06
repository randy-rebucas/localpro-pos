'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBackupCollections } from '@/hooks/useBackupCollections';
import { useRestoreCollections } from '@/hooks/useRestoreCollections';
import { useResetCollections } from '@/hooks/useResetCollections';
import {
  BACKUP_RESET_COLLECTIONS,
  formatFileSize,
  hasSelectedCollections,
  buildResetConfirmMessage,
  buildClearExistingConfirmMessage,
  canCreateBackup,
  canRestore,
  canReset,
  formatResultsMessage,
} from '@/lib/backup-reset-helpers';
import {
  COLLECTION_GROUPS,
  collectionLabel,
  getMissingResetDependencies,
  withResetDependencies,
} from '@/lib/backup-reset-collections';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

const SPINNER_SM = (
  <span className="win8-spinner win8-spinner-sm" aria-hidden="true"><span /><span /><span /><span /><span /></span>
);

export default function BackupResetPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('reset_collections.manage');
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = React.useState(true);
  const [selectedCollections, setSelectedCollections] = React.useState<string[]>([]);
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);
  const [clearExisting, setClearExisting] = React.useState(false);

  const { backing, createBackup } = useBackupCollections(tenant);
  const { restoring, restoreResults, restore } = useRestoreCollections(tenant);
  const { resetting, resetResults, reset } = useResetCollections(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, [lang]);

  const handleBackupClick = useCallback(async () => {
    if (!canCreateBackup(selectedCollections)) {
      toast.error(dict?.common?.selectAtLeastOneCollection || 'Please select at least one collection to backup.');
      return;
    }

    await createBackup(
      selectedCollections,
      (message) => toast.success(message),
      (error) => toast.error(error)
    );
  }, [selectedCollections, createBackup, dict]);

  const handleRestoreClick = useCallback(async () => {
    if (!canRestore(restoreFile) || !restoreFile) {
      toast.error(dict?.common?.selectBackupFile || 'Please select a backup file to restore.');
      return;
    }

    if (clearExisting) {
      const message = buildClearExistingConfirmMessage(dict);
      if (!confirm(message)) {
        return;
      }
    }

    await restore(
      restoreFile,
      clearExisting,
      (message) => {
        toast.success(message);
        setRestoreFile(null);
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      },
      (error) => toast.error(error)
    );
  }, [restoreFile, clearExisting, restore, dict]);

  const handleResetClick = useCallback(async () => {
    if (!hasSelectedCollections(selectedCollections)) {
      toast.error(dict?.common?.selectAtLeastOneCollectionReset || 'Please select at least one collection to reset.');
      return;
    }

    const message = buildResetConfirmMessage(dict, selectedCollections.length, selectedCollections);
    if (!confirm(message)) {
      return;
    }

    await reset(
      selectedCollections,
      (message) => {
        toast.success(message);
        setSelectedCollections([]);
      },
      (error) => toast.error(error)
    );
  }, [selectedCollections, reset, dict]);

  const handleSelectAll = useCallback(() => {
    const allCollectionKeys = BACKUP_RESET_COLLECTIONS.map(c => c.key);
    setSelectedCollections(allCollectionKeys);
  }, []);

  if (!dict || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-sm text-gray-400">{dict?.common?.loading || 'Loading…'}</p>
      </div>
    );
  }

  const missingResetDeps = getMissingResetDependencies(selectedCollections);

  const selectedCount = (dict?.backupReset?.selectedCount || '{count} of {total} selected')
    .replace('{count}', String(selectedCollections.length))
    .replace('{total}', String(BACKUP_RESET_COLLECTIONS.length));

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.backupReset?.title || 'Collection Backup & Reset'}
        description={dict?.backupReset?.subtitle || 'Backup your data before resetting. Warning: Reset action will permanently delete all data in the selected collections for this tenant. This cannot be undone.'}
      />

      <div className="space-y-6">
        {/* Collections */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-gray-900">{dict?.backupReset?.collectionsTitle || 'Collections'}</h2>
              <p className="text-sm text-gray-500">
                {dict?.backupReset?.collectionsDesc || 'Choose which collections to back up or reset.'}
                {' '}<span className="tabular-nums">{selectedCount}</span>
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict?.backupReset?.selectAll || 'Select All'}
                </button>
                <button
                  onClick={() => setSelectedCollections([])}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict?.backupReset?.clearAll || 'Clear All'}
                </button>
              </div>
            )}
          </div>
          <div className="p-6 space-y-5">
            {COLLECTION_GROUPS.map((group) => (
              <div key={group.key}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {dict?.backupReset?.groups?.[group.key] || group.label}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {BACKUP_RESET_COLLECTIONS.filter((c) => c.group === group.key).map((collection) => {
                    const checked = selectedCollections.includes(collection.key);
                    return (
                      <label
                        key={collection.key}
                        className={`flex items-center gap-2 px-3 py-2 border text-sm text-gray-700 transition-colors ${
                          checked ? 'bg-brand-soft border-brand' : 'border-gray-300 hover:bg-gray-100'
                        } ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <input
                          type="checkbox"
                          className="checkbox-win8"
                          disabled={!canManage}
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCollections([...selectedCollections, collection.key]);
                            } else {
                              setSelectedCollections(selectedCollections.filter(c => c !== collection.key));
                            }
                          }}
                        />
                        {collection.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Backup */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-gray-900">{dict?.backupReset?.backupTitle || 'Backup Collections'}</h2>
              <p className="text-sm text-gray-500">
                {dict?.backupReset?.backupDesc || 'Export selected collections as a JSON backup file. You can restore this backup later.'}
              </p>
            </div>
            <button
              onClick={handleBackupClick}
              disabled={!canManage || backing || !canCreateBackup(selectedCollections)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {backing ? SPINNER_SM : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              <span>{backing ? (dict?.backupReset?.creatingBackup || 'Creating Backup…') : (dict?.backupReset?.downloadBackup || 'Download Backup')}</span>
            </button>
          </div>
        </section>

        {/* Restore */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300">
            <h2 className="text-base font-bold text-gray-900">{dict?.backupReset?.restoreTitle || 'Restore Collections'}</h2>
            <p className="text-sm text-gray-500">
              {dict?.backupReset?.restoreDesc || 'Upload a backup JSON file to restore collections. You can choose to clear existing data before restoring.'}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="restore-file" className="block text-xs font-medium text-gray-600 mb-1">
                {dict?.backupReset?.selectBackupFile || 'Select Backup File'}
              </label>
              <input
                id="restore-file"
                type="file"
                accept=".json"
                disabled={!canManage}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setRestoreFile(file);
                  }
                }}
                className="w-full max-w-md border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 file:mr-3 file:px-3 file:py-1 file:border-0 file:bg-brand-navy file:text-white file:text-sm file:font-medium file:cursor-pointer"
              />
              {restoreFile && (
                <p className="text-xs text-gray-500 mt-1">
                  {dict?.backupReset?.selectedFile || 'Selected:'}{' '}
                  <span className="font-mono text-gray-700">{restoreFile.name}</span>{' '}
                  <span className="tabular-nums">({formatFileSize(restoreFile.size)} KB)</span>
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                id="clearExisting"
                className="checkbox-win8"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
              />
              {dict?.backupReset?.clearExisting || 'Clear existing data before restoring'}
            </label>

            {clearExisting && (
              <div className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">
                {dict?.backupReset?.clearExistingWarning || 'Existing records in every collection contained in the backup file will be permanently deleted before the restore runs.'}
              </div>
            )}

            <button
              onClick={handleRestoreClick}
              disabled={!canManage || restoring || !canRestore(restoreFile)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-[filter]"
            >
              {restoring ? SPINNER_SM : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              <span>{restoring ? (dict?.backupReset?.restoring || 'Restoring…') : (dict?.backupReset?.restoreBackup || 'Restore Backup')}</span>
            </button>

            {restoreResults && (
              <div className="p-4 bg-white border border-win8-success text-sm">
                <p className="font-semibold text-win8-success mb-2">{dict?.backupReset?.restoreResults || 'Restore Results:'}</p>
                <ul className="space-y-0.5 text-gray-700 tabular-nums">
                  {Object.entries(restoreResults).map(([collection, result]) => (
                    <li key={collection}>{formatResultsMessage(collection, result)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Reset */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300">
            <h2 className="text-base font-bold text-gray-900">{dict?.backupReset?.resetTitle || 'Reset Collections'}</h2>
            <p className="text-sm text-gray-500">
              <span className="tabular-nums">{selectedCount}</span>
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">
              {dict?.backupReset?.resetWarning || 'Warning: This action will permanently delete all data in the selected collections for this tenant. This cannot be undone.'}
            </div>

            {missingResetDeps.length > 0 && (
              <div className="p-3 bg-white border border-win8-warning text-sm space-y-2">
                <p className="font-semibold text-win8-warning">
                  {dict?.backupReset?.resetDependenciesTitle || 'Other data still points at your selection, so these must be reset together:'}
                </p>
                <ul className="space-y-0.5 text-gray-700">
                  {missingResetDeps.map((dep) => (
                    <li key={dep.collection}>
                      <span className="font-medium">{collectionLabel(dep.collection)}</span>
                      {' → '}
                      {dep.missing.map(collectionLabel).join(', ')}
                    </li>
                  ))}
                </ul>
                {canManage && (
                  <button
                    onClick={() => setSelectedCollections(withResetDependencies(selectedCollections))}
                    className="px-4 py-2 bg-win8-warning text-white text-sm font-medium hover:brightness-110 transition-[filter]"
                  >
                    {dict?.backupReset?.addRequiredCollections || 'Add Required Collections'}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleResetClick}
              disabled={!canManage || !canReset(selectedCollections, resetting) || missingResetDeps.length > 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-[filter]"
            >
              {resetting ? SPINNER_SM : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                </svg>
              )}
              <span>{resetting ? (dict?.backupReset?.resetting || 'Resetting…') : (dict?.backupReset?.resetSelected || 'Reset Selected Collections')}</span>
            </button>

            {resetResults && (
              <div className="p-4 bg-white border border-gray-300 text-sm">
                <p className="font-semibold text-gray-900 mb-2">{dict?.backupReset?.resetResults || 'Reset Results:'}</p>
                <ul className="space-y-0.5 text-gray-700 tabular-nums">
                  {Object.entries(resetResults).map(([collection, result]) => (
                    <li key={collection}>{formatResultsMessage(collection, result)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
