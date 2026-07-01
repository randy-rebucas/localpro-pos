import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Customer from '@/models/Customer';
import ProductChannelListing from '@/models/ProductChannelListing';
import StockMovement from '@/models/StockMovement';
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
  await connectDB();
  const key = channelSyncKey(order);
  const existing = await Transaction.findOne({ tenantId, channelSyncKey: key }).lean();
  if (existing) {
    return { ok: false, duplicate: true, reason: 'already_imported' };
  }

  const listings = await ProductChannelListing.find({
    tenantId,
    provider: order.provider,
    externalVariantId: { $in: order.lines.map((l) => l.externalVariantId) },
  }).lean();

  const listingByVariant = new Map(listings.map((l) => [l.externalVariantId, l]));

  type BuiltItem = {
    productId: mongoose.Types.ObjectId;
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
      productId: list.productId as mongoose.Types.ObjectId,
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
  let customerId: mongoose.Types.ObjectId | undefined;
  const cs = order.customerSnapshot;
  if (cs?.email) {
    try {
      let cust = await Customer.findOne({ tenantId, email: cs.email });
      if (!cust) {
        cust = await Customer.create({
          tenantId,
          firstName: cs.firstName || '',
          lastName: cs.lastName || '',
          email: cs.email,
          phone: cs.phone,
          tags: [order.provider],
          shopifyCustomerId: cs.shopifyCustomerId,
        });
      } else if (cs.shopifyCustomerId && !cust.shopifyCustomerId) {
        cust.shopifyCustomerId = cs.shopifyCustomerId;
        await cust.save();
      }
      customerId = cust._id as mongoose.Types.ObjectId;
    } catch (err) {
      logger.warn('importPaidChannelOrder: customer auto-link failed', { err });
    }
  }

  const session = await mongoose.startSession();
  let transactionId = '';

  try {
    session.startTransaction();

    const syncNote = `channelSyncKey:${key}`;

    for (const item of items) {
      await updateStock(
        item.productId.toString(),
        tenantId,
        -item.quantity,
        'sale',
        {
          reason: STOCK_REASON_CHANNEL_SALE,
          notes: syncNote,
          variation: item.variation,
        },
        session
      );
    }

    const receiptNumber = await generateReceiptNumber(tenantId);
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const taxAmount = order.taxTotal > 0 ? order.taxTotal : Math.max(0, order.total - subtotal);
    const total = order.total > 0 ? order.total : subtotal + taxAmount;

    const [txn] = await Transaction.create(
      [
        {
          tenantId,
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
      ],
      { session }
    );
    transactionId = txn._id.toString();

    await StockMovement.updateMany(
      {
        tenantId,
        notes: syncNote,
        transactionId: { $exists: false },
      },
      { $set: { transactionId: txn._id } },
      { session }
    );

    await Payment.create(
      [
        {
          tenantId,
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
      ],
      { session }
    );

    await session.commitTransaction();
  } catch (e: unknown) {
    await session.abortTransaction();
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('E11000') || msg.includes('duplicate')) {
      return { ok: false, duplicate: true, reason: 'duplicate_key' };
    }
    logger.error('importPaidChannelOrder', e);
    return { ok: false, reason: msg };
  } finally {
    session.endSession();
  }

  try {
    const count = await Transaction.countDocuments({
      tenantId,
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      },
    });
    await SubscriptionService.updateUsage(tenantId, { transactions: count });
  } catch (e) {
    logger.warn('subscription usage update skipped', { error: e instanceof Error ? e.message : String(e) });
  }

  return { ok: true, transactionId };
}
