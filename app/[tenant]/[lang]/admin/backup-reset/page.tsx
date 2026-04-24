'use client';

import React, { useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
import toast from 'react-hot-toast';

export default function BackupResetPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = React.useState(true);
  const [selectedCollections, setSelectedCollections] = React.useState<string[]>([]);
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);

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

    const success = await createBackup(
      selectedCollections,
      (message) => toast.success(message),
      (error) => toast.error(error)
    );

    if (!success) {
      return;
    }
  }, [selectedCollections, createBackup, dict]);

  const handleRestoreClick = useCallback(async () => {
    if (!canRestore(restoreFile)) {
      toast.error(dict?.common?.selectBackupFile || 'Please select a backup file to restore.');
      return;
    }

    const clearExisting = (document.getElementById('clearExisting') as HTMLInputElement)?.checked || false;

    if (!restoreFile) {
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
  }, [restoreFile, restore, dict]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-brand hover:text-brand-hover font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict?.backupReset?.title || 'Collection Backup & Reset'}
          </h1>
          <p className="text-gray-600">
            {dict?.backupReset?.subtitle || 'Backup your data before resetting. Warning: Reset action will permanently delete all data in the selected collections for this tenant. This cannot be undone.'}
          </p>
        </div>

        <div className="space-y-8">
          {/* Backup Section */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
            <div className="mb-6 p-5 bg-brand-soft border-2 border-teal-300">
              <h3 className="text-lg font-semibold text-brand-navy-deep mb-3">{dict?.backupReset?.backupTitle || 'Backup Collections'}</h3>
              <p className="text-sm text-brand-navy mb-4">
                {dict?.backupReset?.backupDesc || 'Export selected collections as a JSON backup file. You can restore this backup later.'}
              </p>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackupClick}
                  disabled={backing || !canCreateBackup(selectedCollections)}
                  className="px-6 py-3 bg-brand text-white hover:bg-brand-hover font-semibold transition-all duration-200 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {backing ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                      <span>{dict?.backupReset?.creatingBackup || 'Creating Backup...'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>{dict?.backupReset?.downloadBackup || 'Download Backup'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Restore Section */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
            <div className="mb-6 p-5 bg-green-50 border-2 border-green-300">
              <h3 className="text-lg font-semibold text-green-900 mb-3">{dict?.backupReset?.restoreTitle || 'Restore Collections'}</h3>
              <p className="text-sm text-green-800 mb-4">
                {dict?.backupReset?.restoreDesc || 'Upload a backup JSON file to restore collections. You can choose to clear existing data before restoring.'}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-green-900 mb-2">
                    {dict?.backupReset?.selectBackupFile || 'Select Backup File'}
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setRestoreFile(file);
                      }
                    }}
                    className="w-full px-4 py-2 border-2 border-green-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white"
                  />
                </div>

                {restoreFile && (
                  <div className="p-3 bg-white border border-green-300">
                    <p className="text-sm text-green-800">
                      <span className="font-medium">{dict?.backupReset?.selectedFile || 'Selected:'}</span> {restoreFile.name} ({formatFileSize(restoreFile.size)} KB)
                    </p>
                  </div>
                )}

                {restoreResults && (
                  <div className="p-4 bg-white border-2 border-green-300">
                    <h4 className="font-semibold text-green-900 mb-2">{dict?.backupReset?.restoreResults || 'Restore Results:'}</h4>
                    <ul className="space-y-1">
                      {Object.entries(restoreResults).map(([collection, result]) => (
                        <li key={collection} className="text-sm text-green-800">
                          {formatResultsMessage(collection, result)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      id="clearExisting"
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer"
                    />
                    <span className="ml-2 text-sm font-medium text-green-900">
                      {dict?.backupReset?.clearExisting || 'Clear existing data before restoring'}
                    </span>
                  </label>
                </div>

                <button
                  onClick={handleRestoreClick}
                  disabled={restoring || !canRestore(restoreFile)}
                  className="px-6 py-3 bg-green-600 text-white hover:bg-green-700 font-semibold transition-all duration-200 border border-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {restoring ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                      <span>{dict?.backupReset?.restoring || 'Restoring...'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>{dict?.backupReset?.restoreBackup || 'Restore Backup'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Reset Section */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
            <div className="p-5 bg-red-50 border-2 border-red-300">
              <h3 className="text-lg font-semibold text-red-900 mb-3">{dict?.backupReset?.resetTitle || 'Reset Collections'}</h3>
              <p className="text-sm text-red-800 mb-4">
                {dict?.backupReset?.resetWarning || 'Warning: This action will permanently delete all data in the selected collections for this tenant. This cannot be undone.'}
              </p>

              {resetResults && (
                <div className="mb-6 p-4 bg-brand-soft border-2 border-teal-300">
                  <h3 className="font-semibold text-brand-navy-deep mb-2">{dict?.backupReset?.resetResults || 'Reset Results:'}</h3>
                  <ul className="space-y-1">
                    {Object.entries(resetResults).map(([collection, result]) => (
                      <li key={collection} className="text-sm text-brand-navy">
                        {formatResultsMessage(collection, result)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    {dict?.backupReset?.selectCollectionsToReset || 'Select Collections to Reset:'}
                  </label>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={handleSelectAll}
                      className="px-4 py-2 text-sm bg-brand-soft text-brand-hover hover:bg-teal-100 font-medium transition-colors"
                    >
                      {dict?.backupReset?.selectAll || 'Select All'}
                    </button>
                    <button
                      onClick={() => setSelectedCollections([])}
                      className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-colors"
                    >
                      {dict?.backupReset?.clearAll || 'Clear All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {BACKUP_RESET_COLLECTIONS.map((collection) => (
                      <label
                        key={collection.key}
                        className="flex items-center p-3 border-2 border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCollections.includes(collection.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCollections([...selectedCollections, collection.key]);
                            } else {
                              setSelectedCollections(selectedCollections.filter(c => c !== collection.key));
                            }
                          }}
                          className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 cursor-pointer"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-700">
                          {collection.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleResetClick}
                    disabled={!canReset(selectedCollections, resetting)}
                    className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 font-semibold transition-all duration-200 border border-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {resetting ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                        <span>{dict?.backupReset?.resetting || 'Resetting...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>{dict?.backupReset?.resetSelected || 'Reset Selected Collections'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
