/**
 * Sync Service
 * Handles syncing offline transactions when connection is restored
 */

import { getOfflineStorage } from './offline-storage';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

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
          synced++;
        } else {
          const errorMsg = data.error || 'Unknown error';
          await storage.markTransactionError(transaction.id, errorMsg);
          failed++;
          errors.push({ id: transaction.id, error: errorMsg });
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Network error';
        await storage.markTransactionError(transaction.id, errorMsg);
        failed++;
        errors.push({ id: transaction.id, error: errorMsg });
      }
    }

    // Clean up synced transactions (optional - keep for history or delete)
    // For now, we'll keep them marked as synced

    this.isSyncing = false;

    const result: SyncResult = {
      success: failed === 0,
      synced,
      failed,
      errors,
    };

    // Notify listeners
    this.syncListeners.forEach(listener => listener(result));

    return result;
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

