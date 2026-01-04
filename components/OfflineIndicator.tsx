'use client';

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

export default function OfflineIndicator() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const { isOnline, isSyncing, lastSyncResult, sync } = useNetworkStatus(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const handleSync = useCallback(() => {
    sync(tenant);
  }, [sync, tenant]);
  const [showSyncResult, setShowSyncResult] = useState(false);

  useEffect(() => {
    if (lastSyncResult && lastSyncResult.synced > 0) {
      // Use setTimeout to avoid setState in effect
      const timer = setTimeout(() => {
        setShowSyncResult(true);
        setTimeout(() => setShowSyncResult(false), 5000);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [lastSyncResult]);

  if (isOnline && !isSyncing && !showSyncResult) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {!isOnline && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
            </svg>
            <span>{dict?.components?.offlineIndicator?.offlineMode || dict?.common?.offlineMode || 'Offline Mode - Transactions will sync when connection is restored'}</span>
          </div>
        </div>
      )}

      {isOnline && isSyncing && (
        <div className="bg-blue-500 text-white px-4 py-2 text-center text-sm font-medium">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin h-4 w-4 border-b-2 border-white"></div>
            <span>{dict?.components?.offlineIndicator?.syncingOfflineTransactions || dict?.common?.syncingOfflineTransactions || 'Syncing offline transactions...'}</span>
          </div>
        </div>
      )}

      {isOnline && showSyncResult && lastSyncResult && (
        <div
          className={`px-4 py-2 text-center text-sm font-medium ${
            lastSyncResult.success
              ? 'bg-green-500 text-white'
              : 'bg-orange-500 text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            {lastSyncResult.success ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  {(dict?.components?.offlineIndicator?.syncedTransactions || dict?.common?.syncedTransactions || 'Synced {count} transaction{s}').replace('{count}', lastSyncResult.synced.toString()).replace('{s}', lastSyncResult.synced !== 1 ? 's' : '')}
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {(dict?.components?.offlineIndicator?.syncedWithFailures || dict?.common?.syncedWithFailures || 'Synced {synced}, {failed} failed').replace('{synced}', lastSyncResult.synced.toString()).replace('{failed}', lastSyncResult.failed.toString())}
                </span>
                <button
                  onClick={handleSync}
                  className="ml-2 underline hover:no-underline"
                >
                  {dict?.components?.offlineIndicator?.retry || dict?.common?.retry || 'Retry'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

