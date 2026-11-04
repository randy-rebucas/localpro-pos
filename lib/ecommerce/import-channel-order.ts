import { generateReceiptNumber } from '@/lib/receipt';
import {
  updateStock,
  insertStockMovements,
  STOCK_SNAPSHOT_FIELDS,
  type StockMovementInput,
  type StockProductSnapshot,
} from '@/lib/stock';
import { getRepos, isDuplicateKeyError, newId, runInTransaction } from '@/lib/db';
import type { NormalizedPaidOrder } from '@/lib/ecommerce/types';
import { STOCK_REASON_CHANNEL_SALE } from '@/lib/ecommerce/constants';
import { SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';

function channelSyncKey(order: NormalizedPaidOrder): string {
  return `${order.provider}:${order.externalOrderId}`;
}

export async function importPaidChannelOrder(
  tenantId: string,
  order: NormalizedPaidOrder
): Promise<{ ok: true; transactionId: string } | { ok: false; duplicate?: boolean; reason: string }> {
  const key = channelSyncKey(order);
  const existing = await getRepos().transactions.findByChannelSyncKey(tenantId, key);
  if (existing) {
    return { ok: false, duplicate: true, reason: 'already_imported' };
  }

  const listings = await getRepos().channelListings.list(tenantId, {
    provider: order.provider,
    externalVariantIds: order.lines.map((l) => l.externalVariantId),
  });

  const listingByVariant = new Map(listings.map((l) => [l.externalVariantId, l]));

  type BuiltItem = {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
    variation?: { size?: string; color?: string; type?: string };
  };

  const items: BuiltItem[] = [];
  for (const line of order.lines) {
    const list = listingByVariant.get(line.externalVariantId);
    if (!list?.productId) continue;
    items.push({
      productId: list.productId,
      name: line.name,
      price: line.unitPrice,
      quantity: line.quantity,
      subtotal: line.unitPrice * line.quantity,
      variation: list.variation as { size?: string; color?: string; type?: string } | undefined,
    });
  }

  if (!items.length) {
    return { ok: false, reason: 'no_mapped_line_items' };
  }

  // Auto-link or create customer from order snapshot
  let customerId: string | undefined;
  const cs = order.customerSnapshot;
  if (cs?.email) {
    try {
      const { customers } = getRepos();
      let cust = await customers.findOne(tenantId, { email: cs.email });
      if (!cust) {
        cust = await customers.create(tenantId, {
          firstName: cs.firstName || '',
          lastName: cs.lastName || '',
          email: cs.email,
          phone: cs.phone,
          tags: [order.provider],
          shopifyCustomerId: cs.shopifyCustomerId,
        });
      } else if (cs.shopifyCustomerId && !cust.shopifyCustomerId) {
        await customers.update(tenantId, cust._id, { shopifyCustomerId: cs.shopifyCustomerId });
      }
      customerId = cust._id;

    } catch (err) {
      logger.warn('importPaidChannelOrder: customer auto-link failed', { err });
    }
  }

  let transactionId: string;

  try {
    // The callback is retried on transient errors, so everything it builds
    // (ids, movements, snapshots) is created per attempt, inside it.
    transactionId = await runInTransaction(async (tx) => {
      const { products, transactions, payments } = getRepos();
      const syncNote = `channelSyncKey:${key}`;
      // Pre-generated so stock movements carry the transaction id at insert time
      // (no follow-up updateMany over the tenant's movements to back-fill it).
      const txnId = newId();

      // One snapshot read for all lines instead of one per updateStock call
      const productIds = [...new Set(items.map((i) => i.productId.toString()))];
      const snapshots = await products.list(tenantId, { ids: productIds }, { select: STOCK_SNAPSHOT_FIELDS, tx });
      const snapshotById = new Map<string, StockProductSnapshot>(snapshots.map((p) => [p._id, p]));

      const movements: StockMovementInput[] = [];
      for (const item of items) {
        const productId = item.productId.toString();
        await updateStock(
          productId,
          tenantId,
          -item.quantity,
          'sale',
          {
            reason: STOCK_REASON_CHANNEL_SALE,
            notes: syncNote,
            variation: item.variation,
            transactionId: txnId,
            product: snapshotById.get(productId),
            movements,
          },
          tx
        );
      }
      await insertStockMovements(movements, tx);

      const receiptNumber = await generateReceiptNumber(tenantId);
      const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const taxAmount = order.taxTotal > 0 ? order.taxTotal : Math.max(0, order.total - subtotal);
      const total = order.total > 0 ? order.total : subtotal + taxAmount;

      const txn = await transactions.create(
        tenantId,
        {
          _id: txnId,
          items: items.map((i) => ({
            product: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
          subtotal,
          taxAmount: taxAmount > 0 ? taxAmount : undefined,
          total,
          paymentMethod: 'digital',
          paymentProvider: order.provider,
          paymentReference: order.externalOrderId,
          status: 'completed',
          receiptNumber,
          notes: `Imported ${order.provider} order ${order.externalOrderId}`,
          salesChannel: order.provider,
          externalOrderId: order.externalOrderId,
          channelSyncKey: key,
          channelImportedAt: new Date(),
          ...(customerId ? { customerId } : {}),
        },
        { tx }
      );

      await payments.create(
        tenantId,
        {
          transactionId: txn._id,
          method: 'digital',
          amount: total,
          status: 'completed',
          details: {
            provider: order.provider,
            transactionId: order.externalOrderId,
            notes: `Online order ${order.externalOrderId}`,
          },
          processedAt: new Date(),
        },
        { tx }
      );

      return txn._id;
    });
  } catch (e: unknown) {
    if (isDuplicateKeyError(e)) {
      return { ok: false, duplicate: true, reason: 'duplicate_key' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('importPaidChannelOrder', e);
    return { ok: false, reason: msg };
  }

  try {
    await SubscriptionService.recordTransaction(tenantId, () =>
      getRepos().transactions.count(tenantId, {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        },
      })
    );
  } catch (e) {
    logger.warn('subscription usage update skipped', { error: e instanceof Error ? e.message : String(e) });
  }

  return { ok: true, transactionId };
}
