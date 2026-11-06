/** Refund records are Transactions whose receipt starts with this. */
export const REFUND_RECEIPT_PREFIX = 'REF-';

/** Sales, including ones refunded later, plus their refund records. Voids are left out. */
export const SALE_AND_REFUND_STATUSES = ['completed', 'refunded'];

/** For aggregates: what a sale is worth after any partial refunds. */
export const NET_SALE_TOTAL = { $subtract: ['$total', { $ifNull: ['$refundedAmount', 0] }] };

/** A refunded sale is also 'refunded'; only its refund records carry the REF- receipt. */
export function isRefundRecord(txn: { status?: string; receiptNumber?: string }): boolean {
  return txn.status === 'refunded' && !!txn.receiptNumber?.startsWith(REFUND_RECEIPT_PREFIX);
}

/** A sale line as stored on a transaction. `product` holds a bundle's id on bundle lines and is missing on manual ones. */
export interface RefundableLine {
  _id?: unknown;
  product?: { toString(): string } | null;
  name: string;
  price: number;
  quantity: number;
  refundedQuantity?: number;
}

export interface RefundRequestItem {
  productId: string;
  quantity: number;
}

export interface RefundAllocation {
  lineIndex: number;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface RefundPlan {
  allocations: RefundAllocation[];
  subtotal: number;
  /** True when this refund leaves nothing refundable on the sale. */
  isFullRefund: boolean;
  /** New `refundedQuantity` per changed line, keyed by line index. */
  refundedQuantities: Map<number, number>;
}

export type RefundErrorCode = 'invalid_quantity' | 'item_not_found' | 'exceeds_remaining' | 'nothing_to_refund';

export class RefundPlanError extends Error {
  constructor(public code: RefundErrorCode, public productId?: string) {
    super(code);
    this.name = 'RefundPlanError';
  }
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * What identifies a sale line in a refund request: its product or bundle id, or
 * the line's own id on manual lines. API responses populate `product` into an object.
 */
export function saleLineKey(line: { _id?: unknown; product?: unknown; productId?: string }): string | undefined {
  const product = line.product as { _id?: unknown } | string | null | undefined;
  if (typeof product === 'string') return product;
  if (product?._id) return String(product._id);
  if (product) return String(product);
  if (line.productId) return line.productId;
  return line._id ? String(line._id) : undefined;
}

export interface RefundAmountInput {
  /** Value of the lines being refunded, at sale prices. */
  linesValue: number;
  saleSubtotal: number;
  saleTotal: number;
  alreadyRefunded?: number;
  isFullRefund: boolean;
}

/**
 * The lines' share of what the customer actually paid, so discounts, tax and
 * loyalty redemptions all come back in proportion. The last refund pays exactly
 * what's left, so a sale's refunds always add up to its total.
 */
export function refundAmountFor({ linesValue, saleSubtotal, saleTotal, alreadyRefunded = 0, isFullRefund }: RefundAmountInput): number {
  const refundable = roundMoney(Math.max(0, saleTotal - alreadyRefunded));
  if (isFullRefund) return refundable;
  if (saleSubtotal <= 0) return 0;
  return Math.min(roundMoney((saleTotal * linesValue) / saleSubtotal), refundable);
}

/**
 * This refund's part of a sale-level figure such as tax. Worked out on the
 * running total, so the parts of several refunds add up to the sale's figure.
 */
export function refundedPortion(saleAmount: number, saleTotal: number, refundedBefore: number, refundAmount: number): number {
  if (saleTotal <= 0) return 0;
  const upTo = (refunded: number) => roundMoney((saleAmount * refunded) / saleTotal);
  return roundMoney(upTo(refundedBefore + refundAmount) - upTo(refundedBefore));
}

/**
 * Works out which sale lines a refund draws from, counting what earlier
 * refunds already took. Without `requested`, refunds everything still
 * refundable. A product sold on several lines is drawn from each in turn.
 */
export function planRefund(lines: RefundableLine[], requested?: RefundRequestItem[]): RefundPlan {
  const remaining = lines.map((line) => line.quantity - (line.refundedQuantity ?? 0));
  const taken = lines.map(() => 0);

  if (requested) {
    for (const { productId, quantity } of requested) {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new RefundPlanError('invalid_quantity', productId);
      }
      const matching = lines.flatMap((line, index) => (saleLineKey(line) === productId ? [index] : []));
      if (matching.length === 0) throw new RefundPlanError('item_not_found', productId);

      let needed = quantity;
      for (const index of matching) {
        const take = Math.min(needed, remaining[index] - taken[index]);
        taken[index] += take;
        needed -= take;
      }
      if (needed > 0) throw new RefundPlanError('exceeds_remaining', productId);
    }
  } else {
    remaining.forEach((quantity, index) => {
      taken[index] = quantity;
    });
  }

  const allocations: RefundAllocation[] = [];
  const refundedQuantities = new Map<number, number>();
  lines.forEach((line, index) => {
    if (taken[index] <= 0) return;
    allocations.push({
      lineIndex: index,
      productId: line.product?.toString(),
      name: line.name,
      price: line.price,
      quantity: taken[index],
      subtotal: roundMoney(line.price * taken[index]),
    });
    refundedQuantities.set(index, (line.refundedQuantity ?? 0) + taken[index]);
  });

  if (allocations.length === 0) throw new RefundPlanError('nothing_to_refund');

  return {
    allocations,
    subtotal: roundMoney(allocations.reduce((sum, allocation) => sum + allocation.subtotal, 0)),
    isFullRefund: remaining.every((quantity, index) => quantity === taken[index]),
    refundedQuantities,
  };
}
