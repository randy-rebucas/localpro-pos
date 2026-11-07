import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import Discount from '@/models/Discount';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import { getOnAccountTotalForTransaction } from '@/lib/customer-credit';
import { runWithOptionalMongoTransaction, sessionOpts, withOptionalSession } from '@/lib/mongo-session';
import { returnStockLines } from '@/lib/stock-returns';

/** Lost the race to a refund or another void. */
export class VoidConflictError extends Error {
  constructor() {
    super('VOID_CONFLICT');
    this.name = 'VoidConflictError';
  }
}

/** An older sale of a variant product, from before sale lines recorded which variant was sold. */
export class VoidVariationUnknownError extends Error {
  constructor() {
    super('VOID_VARIATION_UNKNOWN');
    this.name = 'VoidVariationUnknownError';
  }
}

/** Orders that belong to an online store, which a local void can't undo. */
export function isChannelOrder(sale: { salesChannel?: string }): boolean {
  return !!sale.salesChannel && sale.salesChannel !== 'pos';
}

interface VoidableLine {
  product?: { toString(): string } | null;
  quantity: number;
  variation?: { size?: string; color?: string; type?: string };
}

interface VoidableSale {
  _id: { toString(): string };
  items: VoidableLine[];
  total: number;
  paymentMethod: string;
  branchId?: { toString(): string };
  customerId?: { toString(): string };
  receiptNumber?: string;
  discountCode?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
}

interface VoidSaleInput {
  tenantId: string;
  sale: VoidableSale;
  userId: string;
  reason: string;
}

export interface VoidSaleResult {
  transaction: unknown;
  productIds: string[];
  onAccountReversed: number;
  loyaltyPointsReversed: number;
  discountReleased: boolean;
}

/**
 * Cancels a sale and undoes what it did: stock, payment records, on-account balance,
 * loyalty points and the discount's usage. The claim runs first, so a sale with any
 * refund, or one already voided, changes nothing. Reports, BIR readings and the cash
 * drawer already leave cancelled sales out, and the BIR grand total is never reduced.
 */
export async function voidSale({ tenantId, sale, userId, reason }: VoidSaleInput): Promise<VoidSaleResult> {
  const saleId = sale._id.toString();

  // Without the variant, stock would go back to the wrong place, so stop before changing anything
  const unspecified = sale.items.flatMap((line) => (line.product && !line.variation ? [line.product.toString()] : []));
  if (unspecified.length > 0 && await Product.exists({ _id: { $in: unspecified }, tenantId, hasVariations: true })) {
    throw new VoidVariationUnknownError();
  }

  const refundReason = `Void: ${reason}`;
  // Has to be read while the payments still count as completed
  const onAccountTotal = sale.customerId
    ? await getOnAccountTotalForTransaction(tenantId, saleId, sale.total, sale.paymentMethod)
    : 0;

  return runWithOptionalMongoTransaction(async (session) => {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: saleId, tenantId, status: 'completed', refundCount: { $in: [0, null] } },
      { $set: { status: 'cancelled', voidReason: reason, voidedAt: new Date(), voidedBy: userId } },
      { ...sessionOpts(session), new: true }
    );
    if (!transaction) throw new VoidConflictError();

    const productIds = await returnStockLines(
      {
        tenantId,
        lines: sale.items.flatMap((line) => {
          const id = line.product?.toString();
          return id ? [{ id, quantity: line.quantity, variation: line.variation }] : [];
        }),
        branchId: sale.branchId?.toString(),
        transactionId: saleId,
        userId,
        reason,
      },
      session
    );

    const now = new Date();
    const payments = await withOptionalSession(
      Payment.find({ tenantId, transactionId: saleId, status: 'completed' }),
      session
    );
    for (const payment of payments) {
      payment.status = 'refunded';
      payment.refundedAmount = payment.amount;
      payment.refundedAt = now;
      payment.refundReason = refundReason;
      await payment.save(sessionOpts(session));
    }

    let onAccountReversed = 0;
    if (onAccountTotal > 0) {
      const customer = await withOptionalSession(
        Customer.findOne({ _id: sale.customerId, tenantId }).select('accountBalance'),
        session
      );
      if (customer) {
        const before = customer.accountBalance ?? 0;
        const after = Math.max(0, Math.round((before - onAccountTotal) * 100) / 100);
        onAccountReversed = before - after;
        await Customer.updateOne({ _id: customer._id, tenantId }, { $set: { accountBalance: after } }, sessionOpts(session));
      }
    }

    let loyaltyPointsReversed = 0;
    const loyaltyChange = (sale.loyaltyPointsRedeemed ?? 0) - (sale.loyaltyPointsEarned ?? 0);
    if (loyaltyChange !== 0 && sale.customerId) {
      const customer = await withOptionalSession(
        Customer.findOne({ _id: sale.customerId, tenantId }).select('loyaltyPointsBalance'),
        session
      );
      if (customer) {
        const before = customer.loyaltyPointsBalance ?? 0;
        const after = Math.max(0, before + loyaltyChange);
        loyaltyPointsReversed = after - before;
        await Customer.updateOne({ _id: customer._id, tenantId }, { $set: { loyaltyPointsBalance: after } }, sessionOpts(session));
        await LoyaltyTransaction.create([{
          tenantId,
          customerId: customer._id,
          transactionId: saleId,
          type: 'adjust',
          points: loyaltyPointsReversed,
          balanceBefore: before,
          balanceAfter: after,
          description: `Reversed by void of receipt #${sale.receiptNumber ?? saleId.slice(-8)}`,
          createdBy: userId,
        }], sessionOpts(session));
      }
    }

    let discountReleased = false;
    if (sale.discountCode) {
      const released = await Discount.updateOne(
        { tenantId, code: sale.discountCode.toUpperCase(), usageCount: { $gt: 0 } },
        { $inc: { usageCount: -1 } },
        sessionOpts(session)
      );
      discountReleased = released.modifiedCount > 0;
    }

    return { transaction, productIds, onAccountReversed, loyaltyPointsReversed, discountReleased };
  });
}
