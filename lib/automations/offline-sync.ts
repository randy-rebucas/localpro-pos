/**
 * Offline Transaction Sync Automation
 * Processes queued offline transactions and creates real Transaction records.
 */

import connectDB from '@/lib/mongodb';
import OfflineTransaction from '@/models/OfflineTransaction';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
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
  await connectDB();

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
      const tenant = await Tenant.findById(options.tenantId).select('_id').lean();
      if (!tenant) {
        results.message = `Tenant ${options.tenantId} not found`;
        return results;
      }
      tenantIds = [options.tenantId];
    } else {
      const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();
      tenantIds = tenants.map(t => t._id.toString());
    }

    for (const tenantId of tenantIds) {
      // Find pending offline transactions, ordered oldest-first
      const pending = await OfflineTransaction.find({
        tenantId,
        syncStatus: { $in: ['pending', 'failed'] },
        retryCount: { $lt: maxRetries },
        isActive: true,
      })
        .sort({ offlineCreatedAt: 1 })
        .limit(100) // Process in batches of 100
        .lean();

      for (const offline of pending) {
        const offlineId = offline._id.toString();

        // Mark as processing to prevent duplicate processing
        await OfflineTransaction.findByIdAndUpdate(offlineId, {
          syncStatus: 'processing',
        });

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
          const transaction = await Transaction.create({
            tenantId: offline.tenantId,
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

          // Mark offline transaction as synced
          await OfflineTransaction.findByIdAndUpdate(offlineId, {
            syncStatus: 'synced',
            syncedTransactionId: transaction._id,
            syncError: undefined,
          });

          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const nextRetry = (offline.retryCount ?? 0) + 1;
          const nextStatus = nextRetry >= maxRetries ? 'failed' : 'pending';

          await OfflineTransaction.findByIdAndUpdate(offlineId, {
            syncStatus: nextStatus,
            retryCount: nextRetry,
            syncError: message,
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
