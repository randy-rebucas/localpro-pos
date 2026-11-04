/**
 * Offline Transaction Sync Automation
 * Processes queued offline transactions and creates real Transaction records.
 */

import { SubscriptionService } from '@/lib/subscription';
import { getRepos } from '@/lib/db';
import { getActiveTenants } from '@/lib/tenant-active-query';
import { generateReceiptNumber } from '@/lib/receipt';
import { AutomationResult } from './types';

export interface OfflineSyncOptions {
  tenantId?: string;
  maxRetries?: number; // Maximum retry attempts before marking failed (default: 3)
}

/**
 * Sync pending offline transactions.
 * Finds all OfflineTransaction documents with syncStatus 'pending' or 'failed'
 * (below maxRetries), creates proper Transaction records, and marks them synced.
 */
export async function syncOfflineTransactions(
  options: OfflineSyncOptions = {}
): Promise<AutomationResult> {
  const maxRetries = options.maxRetries ?? 3;

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get tenants to process
    let tenantIds: string[];
    if (options.tenantId) {
      const tenant = await getRepos().tenants.findById(options.tenantId, { select: '_id' });
      if (!tenant) {
        results.message = `Tenant ${options.tenantId} not found`;
        return results;
      }
      tenantIds = [options.tenantId];
    } else {
      // No tenant settings needed — only ids
      const tenants = await getActiveTenants();
      tenantIds = tenants.map(t => t._id.toString());
    }

    const { offlineTransactions, transactions } = getRepos();

    for (const tenantId of tenantIds) {
      // Find pending offline transactions, ordered oldest-first, in batches of 100
      const pending = await offlineTransactions.listSyncable(tenantId, { maxRetries, limit: 100 });

      for (const offline of pending) {
        const offlineId = offline._id;

        // Atomically claim it (status guard) so overlapping runs can't both
        // create a Transaction for the same offline record. Same single write
        // as before, but race-safe; skip if another run already claimed it.
        const claimed = await offlineTransactions.claimForSync(tenantId, offlineId);
        if (!claimed) continue;

        try {
          // Generate a receipt number for the transaction
          const receiptNumber = await generateReceiptNumber(tenantId);

          // Build the transaction items matching Transaction schema
          const items = offline.items.map(item => ({
            product: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal,
          }));

          // Create the real transaction, using offline timestamp as the creation time
          const transaction = await transactions.create(tenantId, {
            branchId: offline.branchId,
            items,
            subtotal: offline.subtotal,
            discountCode: offline.discountCode,
            discountCategory: offline.discountCategory,
            discountAmount: offline.discountAmount,
            taxExemptAmount: offline.taxExemptAmount ?? 0,
            taxAmount: offline.taxAmount ?? 0,
            total: offline.total,
            paymentMethod: offline.paymentMethod,
            cashReceived: offline.cashReceived,
            change: offline.change,
            status: 'completed',
            customerId: offline.customerId,
            userId: offline.userId,
            receiptNumber,
            notes: offline.notes,
            isActive: true,
          });

          await SubscriptionService.trackTransactionCreated(tenantId);

          // Mark offline transaction as synced
          await offlineTransactions.markSynced(tenantId, offlineId, transaction._id);

          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const nextRetry = (offline.retryCount ?? 0) + 1;
          const nextStatus = nextRetry >= maxRetries ? 'failed' : 'pending';

          await offlineTransactions.recordSyncFailure(tenantId, offlineId, {
            status: nextStatus,
            retryCount: nextRetry,
            error: message,
          });

          results.failed++;
          results.errors?.push(`OfflineTransaction ${offlineId}: ${message}`);
        }
      }
    }

    results.message = `Synced ${results.processed} offline transaction(s)${results.failed > 0 ? `, ${results.failed} failed` : ''}`;
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.message = `Error syncing offline transactions: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
