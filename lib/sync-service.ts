/**
 * Sync Service
 * Handles syncing offline transactions when connection is restored
 * Includes exponential backoff retry for failed syncs
 */

import { getOfflineStorage } from './offline-storage';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

class SyncService {
  private isSyncing = false;
  private syncListeners: Array<(result: SyncResult) => void> = [];

  async sync(tenant: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, synced: 0, failed: 0, errors: [] };
    }

    this.isSyncing = true;
    const storage = await getOfflineStorage();
    const pendingTransactions = await storage.getPendingTransactions(tenant);

    if (pendingTransactions.length === 0) {
      this.isSyncing = false;
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    let synced = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const transaction of pendingTransactions) {
      const syncSuccess = await this.syncWithRetry(transaction, tenant, storage);
      if (syncSuccess) {
        synced++;
      } else {
        failed++;
        errors.push({ id: transaction.id, error: transaction.syncError || 'Sync failed after retries' });
      }
    }

    this.isSyncing = false;

    const result: SyncResult = {
      success: failed === 0,
      synced,
      failed,
      errors,
    };

    // Notify listeners
    this.syncListeners.forEach(listener => listener(result));

    // Register for background sync if there are still failures
    if (failed > 0 && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await (registration as any).sync.register('sync-transactions'); // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      } catch {
        // Background sync not supported — rely on online event retry
      }
    }

    return result;
  }

  private async syncWithRetry(
    transaction: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    tenant: string,
    storage: Awaited<ReturnType<typeof getOfflineStorage>>
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`/api/transactions?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: transaction.items,
            paymentMethod: transaction.paymentMethod,
            cashReceived: transaction.cashReceived,
            discountCode: transaction.discountCode,
          }),
        });

        const data = await response.json();

        if (data.success) {
          await storage.markTransactionSynced(transaction.id);
          return true;
        }

        // Non-retryable errors (validation failures, etc.)
        if (response.status >= 400 && response.status < 500) {
          const errMsg = data.error || 'Validation error';
          console.error(`[SyncService] Non-retryable error for tx ${transaction.id} (attempt ${attempt + 1}):`, errMsg, 'status:', response.status);
          await storage.markTransactionError(transaction.id, errMsg);
          return false;
        }

        // Server error — retry
        console.warn(`[SyncService] Server error for tx ${transaction.id} (attempt ${attempt + 1}/${MAX_RETRIES}), status:`, response.status);
        if (attempt < MAX_RETRIES - 1) {
          await this.delay(BASE_DELAY_MS * Math.pow(2, attempt));
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Network error';
        console.error(`[SyncService] Network error for tx ${transaction.id} (attempt ${attempt + 1}/${MAX_RETRIES}):`, error);
        if (attempt < MAX_RETRIES - 1) {
          await this.delay(BASE_DELAY_MS * Math.pow(2, attempt));
        } else {
          await storage.markTransactionError(transaction.id, errMsg);
          return false;
        }
      }
    }

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  onSync(listener: (result: SyncResult) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

// Singleton instance
export const syncService = new SyncService();
