import { describe, it, expect } from 'vitest';
import { isRefundRecord, planRefund, refundAmountFor, refundedPortion, RefundPlanError, saleLineKey, type RefundableLine } from '@/lib/refund-plan';

const line = (product: string | null, quantity: number, price = 100, refundedQuantity?: number): RefundableLine => ({
  product,
  name: product ?? 'Manual item',
  price,
  quantity,
  refundedQuantity,
});

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof RefundPlanError) return error.code;
    throw error;
  }
  return null;
};

describe('planRefund', () => {
  it('refunds everything when no items are given, including manual lines', () => {
    const plan = planRefund([line('a', 2), line(null, 1, 50)]);

    expect(plan.isFullRefund).toBe(true);
    expect(plan.subtotal).toBe(250);
    expect(plan.allocations.map((a) => a.productId)).toEqual(['a', undefined]);
  });

  it('marks a partial refund and records the new line quantity', () => {
    const plan = planRefund([line('a', 3), line('b', 1)], [{ productId: 'a', quantity: 1 }]);

    expect(plan.isFullRefund).toBe(false);
    expect(plan.subtotal).toBe(100);
    expect(plan.refundedQuantities.get(0)).toBe(1);
    expect(plan.refundedQuantities.has(1)).toBe(false);
  });

  it('counts earlier refunds, so a quantity cannot be refunded twice', () => {
    const lines = [line('a', 2, 100, 1)];

    expect(errorCode(() => planRefund(lines, [{ productId: 'a', quantity: 2 }]))).toBe('exceeds_remaining');
    expect(planRefund(lines, [{ productId: 'a', quantity: 1 }]).isFullRefund).toBe(true);
  });

  it('only refunds what is left when no items are given', () => {
    const plan = planRefund([line('a', 3, 100, 2), line('b', 1, 40, 1)]);

    expect(plan.subtotal).toBe(100);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.isFullRefund).toBe(true);
  });

  it('rejects a sale with nothing left', () => {
    expect(errorCode(() => planRefund([line('a', 1, 100, 1)]))).toBe('nothing_to_refund');
    expect(errorCode(() => planRefund([line('a', 1)], []))).toBe('nothing_to_refund');
  });

  it('draws a product across several lines at each line price', () => {
    const plan = planRefund([line('a', 1, 100), line('a', 2, 80)], [{ productId: 'a', quantity: 2 }]);

    expect(plan.subtotal).toBe(180);
    expect(plan.refundedQuantities.get(0)).toBe(1);
    expect(plan.refundedQuantities.get(1)).toBe(1);
  });

  it('applies repeated entries for one product cumulatively', () => {
    const items = [{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 1 }];

    expect(errorCode(() => planRefund([line('a', 1)], items))).toBe('exceeds_remaining');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects quantity %s', (quantity) => {
    expect(errorCode(() => planRefund([line('a', 2)], [{ productId: 'a', quantity }]))).toBe('invalid_quantity');
  });

  it('rejects a product that is not on the sale', () => {
    expect(errorCode(() => planRefund([line('a', 1)], [{ productId: 'z', quantity: 1 }]))).toBe('item_not_found');
  });
});

describe('refundAmountFor', () => {
  const sale = { saleSubtotal: 300, saleTotal: 336 };

  it('returns the share of the total for a partial refund', () => {
    expect(refundAmountFor({ ...sale, linesValue: 100, isFullRefund: false })).toBe(112);
  });

  it('never exceeds what is left', () => {
    expect(refundAmountFor({ ...sale, linesValue: 200, alreadyRefunded: 300, isFullRefund: false })).toBe(36);
  });

  it('pays the remainder on the last refund', () => {
    expect(refundAmountFor({ ...sale, linesValue: 100, alreadyRefunded: 224.01, isFullRefund: true })).toBe(111.99);
  });

  it('refunds nothing on a sale with no subtotal', () => {
    expect(refundAmountFor({ saleSubtotal: 0, saleTotal: 0, linesValue: 0, isFullRefund: false })).toBe(0);
  });
});

describe('refundedPortion', () => {
  it('adds up to the sale figure across refunds, despite rounding', () => {
    const parts = [0, 10, 20].map((before) => refundedPortion(10, 30, before, 10));

    expect(parts).toEqual([3.33, 3.34, 3.33]);
  });

  it('returns 0 on a sale with no total', () => {
    expect(refundedPortion(10, 0, 0, 0)).toBe(0);
  });
});

describe('isRefundRecord', () => {
  it('tells a refund record from a refunded sale', () => {
    expect(isRefundRecord({ status: 'refunded', receiptNumber: 'REF-R1-2' })).toBe(true);
    expect(isRefundRecord({ status: 'refunded', receiptNumber: 'R1' })).toBe(false);
    expect(isRefundRecord({ status: 'completed', receiptNumber: 'REF-R1' })).toBe(false);
    expect(isRefundRecord({ status: 'refunded' })).toBe(false);
  });
});

describe('saleLineKey', () => {
  it('reads plain, populated and legacy ids', () => {
    expect(saleLineKey({ product: 'prod-a' })).toBe('prod-a');
    expect(saleLineKey({ product: { _id: 'prod-a', name: 'Item A' } })).toBe('prod-a');
    expect(saleLineKey({ product: { toString: () => 'prod-a' } })).toBe('prod-a');
    expect(saleLineKey({ productId: 'prod-a' })).toBe('prod-a');
  });

  it('falls back to the line id on manual lines', () => {
    expect(saleLineKey({ _id: 'line-1', product: null })).toBe('line-1');
  });

  it('refunds a manual line by its line id', () => {
    const plan = planRefund([{ _id: 'line-1', name: 'Custom', price: 50, quantity: 2 }], [{ productId: 'line-1', quantity: 1 }]);

    expect(plan.allocations[0]).toMatchObject({ productId: undefined, subtotal: 50 });
  });
});
