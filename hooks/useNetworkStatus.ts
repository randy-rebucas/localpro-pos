/**
 * Network Status Hook
 * Detects online/offline status and provides sync functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { syncService, SyncResult } from '@/lib/sync-service';

export interface NetworkStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  sync: (tenant: string) => Promise<SyncResult>;
}

export function useNetworkStatus(tenant: string): NetworkStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const sync = useCallback(async (syncTenant: string): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const result = await syncService.sync(syncTenant);
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (tenant) {
        sync(tenant);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial status
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenant, sync]);

  useEffect(() => {
    const unsubscribe = syncService.onSync((result) => {
      setLastSyncResult(result);
      setIsSyncing(false);
    });

    return unsubscribe;
  }, []);

  return {
    isOnline,
    isSyncing,
    lastSyncResult,
    sync,
  };
}

