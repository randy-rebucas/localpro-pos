/**
 * Offline Transaction Sync Automation
 * Processes queued offline transactions and creates real Transaction records.
 */

import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { generateReceiptNumber } from '@/lib/receipt';
import { AutomationResult } from './types';

export interface OfflineSyncOptions {
  tenantId?: string;
  maxRetries?: number; // Maximum retry attempts before marking failed (default: 3)
}

/**
 * Sync pending offline transactions.
 * Finds all OfflineTransaction records with syncStatus 'pending' or 'failed'
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
        include: { items: true },
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

          // Build the transaction items matching Transaction schema
          const items = offline.items.map(item => ({
            id: randomUUID(),
            productId: item.productId ?? undefined,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal,
          }));

          // Create the real transaction, using offline timestamp as the creation time
          const transaction = await prisma.transaction.create({
            data: {
              id: randomUUID(),
              tenantId: offline.tenantId,
              branchId: offline.branchId ?? undefined,
              subtotal: offline.subtotal,
              discountCode: offline.discountCode ?? undefined,
              discountCategory: offline.discountCategory ?? undefined,
              discountAmount: offline.discountAmount ?? undefined,
              taxExemptAmount: offline.taxExemptAmount ?? 0,
              taxAmount: offline.taxAmount ?? 0,
              total: offline.total,
              paymentMethod: offline.paymentMethod as any,
              cashReceived: offline.cashReceived ?? undefined,
              change: offline.change ?? undefined,
              status: 'completed',
              customerId: offline.customerId ?? undefined,
              userId: offline.userId ?? undefined,
              receiptNumber,
              notes: offline.notes ?? undefined,
              isActive: true,
              items: { create: items },
            },
          });

          // Mark offline transaction as synced
          await prisma.offlineTransaction.update({
            where: { id: offlineId },
            data: {
              syncStatus: 'synced',
              syncedTransactionId: transaction.id,
              syncError: null,
            },
          });

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
