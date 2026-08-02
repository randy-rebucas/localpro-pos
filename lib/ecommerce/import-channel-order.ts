import prisma from '@/lib/prisma';
import { runInTransaction } from '@/lib/db-transaction';
import { Prisma } from '@prisma/client';
import { generateReceiptNumber } from '@/lib/receipt';
import { updateStock } from '@/lib/stock';
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
  const existing = await prisma.transaction.findFirst({ where: { tenantId, channelSyncKey: key } });
  if (existing) {
    return { ok: false, duplicate: true, reason: 'already_imported' };
  }

  const listings = await prisma.productChannelListing.findMany({
    where: {
      tenantId,
      provider: order.provider,
      externalVariantId: { in: order.lines.map((l) => l.externalVariantId) },
    },
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
      const cust = await prisma.customer.findFirst({ where: { tenantId, email: cs.email } });
      if (!cust) {
        const created = await prisma.customer.create({
          data: {
            tenantId,
            firstName: cs.firstName || '',
            lastName: cs.lastName || '',
            email: cs.email,
            phone: cs.phone,
            tags: [order.provider],
            shopifyCustomerId: cs.shopifyCustomerId,
          },
        });
        customerId = created.id;
      } else {
        if (cs.shopifyCustomerId && !cust.shopifyCustomerId) {
          await prisma.customer.update({
            where: { id: cust.id },
            data: { shopifyCustomerId: cs.shopifyCustomerId },
          });
        }
        customerId = cust.id;
      }
    } catch (err) {
      logger.warn('importPaidChannelOrder: customer auto-link failed', { err });
    }
  }

  let transactionId = '';

  try {
    transactionId = await runInTransaction(async (tx) => {
      const syncNote = `channelSyncKey:${key}`;

      for (const item of items) {
        await updateStock(
          item.productId,
          tenantId,
          -item.quantity,
          'sale',
          {
            reason: STOCK_REASON_CHANNEL_SALE,
            notes: syncNote,
            variation: item.variation,
          },
          tx
        );
      }

      const receiptNumber = await generateReceiptNumber(tenantId);
      const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const taxAmount = order.taxTotal > 0 ? order.taxTotal : Math.max(0, order.total - subtotal);
      const total = order.total > 0 ? order.total : subtotal + taxAmount;

      const txn = await tx.transaction.create({
        data: {
          tenantId,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              subtotal: i.subtotal,
            })),
          },
          subtotal,
          taxAmount: taxAmount > 0 ? taxAmount : 0,
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
      });

      await tx.stockMovement.updateMany({
        where: {
          tenantId,
          notes: syncNote,
          transactionId: null,
        },
        data: { transactionId: txn.id },
      });

      await tx.payment.create({
        data: {
          tenantId,
          transactionId: txn.id,
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
      });

      return txn.id;
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, duplicate: true, reason: 'duplicate_key' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('importPaidChannelOrder', e);
    return { ok: false, reason: msg };
  }

  try {
    const now = new Date();
    const count = await prisma.transaction.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
          lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      },
    });
    await SubscriptionService.updateUsage(tenantId, { transactions: count });
  } catch (e) {
    logger.warn('subscription usage update skipped', { error: e instanceof Error ? e.message : String(e) });
  }

  return { ok: true, transactionId };
}
