/**
 * Offline Transaction Sync Automation
 * Processes queued offline transactions and creates real Transaction records.
 */

import connectDB from '@/lib/mongodb';
import OfflineTransaction from '@/models/OfflineTransaction';
import Transaction from '@/models/Transaction';
import { generateReceiptNumber } from '@/lib/receipt';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

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
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: '_id' });
    if (options.tenantId && tenants.length === 0) {
      results.message = `Tenant ${options.tenantId} not found`;
      return results;
    }
    const tenantIds = tenants.map(t => t._id.toString());

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

      if (pending.length === 0) {
        continue;
      }

      // Mark the batch as processing to prevent duplicate processing (one write)
      await OfflineTransaction.updateMany(
        { tenantId, _id: { $in: pending.map(o => o._id) } },
        { $set: { syncStatus: 'processing' } }
      );

      // Final status per offline transaction, written in one bulkWrite after the batch
      const statusUpdates: mongoose.AnyBulkWriteOperation[] = [];

      for (const offline of pending) {
        const offlineId = offline._id.toString();

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
          statusUpdates.push({
            updateOne: {
              filter: { _id: offline._id, tenantId },
              update: {
                $set: { syncStatus: 'synced', syncedTransactionId: transaction._id, syncedAt: new Date() },
                $unset: { syncError: 1 },
              },
            },
          });

          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const nextRetry = (offline.retryCount ?? 0) + 1;
          const nextStatus = nextRetry >= maxRetries ? 'failed' : 'pending';

          statusUpdates.push({
            updateOne: {
              filter: { _id: offline._id, tenantId },
              update: { $set: { syncStatus: nextStatus, retryCount: nextRetry, syncError: message } },
            },
          });

          results.failed++;
          results.errors?.push(`OfflineTransaction ${offlineId}: ${message}`);
        }
      }

      await OfflineTransaction.bulkWrite(statusUpdates, { ordered: false });
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
