/**
 * Offline Transaction Sync Automation
 * Processes queued offline transactions and creates real Transaction records.
 */

import prisma from '@/lib/prisma';
import { runInTransaction } from '@/lib/db-transaction';
import { generateReceiptNumber } from '@/lib/receipt';
import { AutomationResult } from './types';

export interface OfflineSyncOptions {
  tenantId?: string;
  maxRetries?: number; // Maximum retry attempts before marking failed (default: 3)
}

interface OfflineItem {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

/**
 * Sync pending offline transactions.
 * Finds all OfflineTransaction rows with syncStatus 'pending' or 'failed'
 * (below maxRetries), creates proper Transaction (+ TransactionItem) records,
 * and marks them synced.
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
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId }, select: { id: true } });
      if (!tenant) {
        results.message = `Tenant ${options.tenantId} not found`;
        return results;
      }
      tenantIds = [options.tenantId];
    } else {
      const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } });
      tenantIds = tenants.map(t => t.id);
    }

    for (const tenantId of tenantIds) {
      // Find pending offline transactions, ordered oldest-first
      const pending = await prisma.offlineTransaction.findMany({
        where: {
          tenantId,
          syncStatus: { in: ['pending', 'failed'] },
          retryCount: { lt: maxRetries },
          isActive: true,
        },
        orderBy: { offlineCreatedAt: 'asc' },
        take: 100, // Process in batches of 100
      });

      for (const offline of pending) {
        const offlineId = offline.id;

        // Mark as processing to prevent duplicate processing
        await prisma.offlineTransaction.update({
          where: { id: offlineId },
          data: { syncStatus: 'processing' },
        });

        try {
          // Generate a receipt number for the transaction
          const receiptNumber = await generateReceiptNumber(tenantId);

          const items = (offline.items as unknown as OfflineItem[]).map(item => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal,
          }));

          // Create the real transaction (+ items) and mark the offline row synced,
          // atomically — this is checkout-equivalent money logic.
          const transactionId = await runInTransaction(async (tx) => {
            const transaction = await tx.transaction.create({
              data: {
                tenantId: offline.tenantId,
                branchId: offline.branchId,
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
                items: {
                  create: items,
                },
              },
            });

            await tx.offlineTransaction.update({
              where: { id: offlineId },
              data: {
                syncStatus: 'synced',
                syncedTransactionId: transaction.id,
                syncError: null,
              },
            });

            return transaction.id;
          });

          void transactionId;
          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const nextRetry = (offline.retryCount ?? 0) + 1;
          const nextStatus = nextRetry >= maxRetries ? 'failed' : 'pending';

          await prisma.offlineTransaction.update({
            where: { id: offlineId },
            data: {
              syncStatus: nextStatus,
              retryCount: nextRetry,
              syncError: message,
            },
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
