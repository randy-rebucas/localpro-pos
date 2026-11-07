process.env.JWT_SECRET = 'test-secret-for-refund-api-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a') }));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user-a', role: 'manager' }),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user-a' }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { TRANSACTION_REFUND: 'TRANSACTION_REFUND' },
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/mongo-session', () => ({
  runWithOptionalMongoTransaction: (run: (session: undefined) => Promise<unknown>) => run(undefined),
}));
vi.mock('@/lib/subscription', () => ({
  SubscriptionService: { trackTransactionCreated: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/ecommerce/inventory-push', () => ({
  pushChannelInventoryForProducts: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdateStock = vi.fn();
const mockUpdateBundleStock = vi.fn();
vi.mock('@/lib/stock', () => ({
  updateStock: (...args: unknown[]) => mockUpdateStock(...args),
  updateBundleStock: (...args: unknown[]) => mockUpdateBundleStock(...args),
  insertStockMovements: vi.fn().mockResolvedValue(undefined),
  STOCK_SNAPSHOT_FIELDS: 'stock',
}));

const mockTxFindOne = vi.fn();
const mockTxExists = vi.fn();
const mockTxClaim = vi.fn();
const mockTxCreate = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    findOne: (...args: unknown[]) => mockTxFindOne(...args),
    exists: (...args: unknown[]) => mockTxExists(...args),
    findOneAndUpdate: (...args: unknown[]) => mockTxClaim(...args),
    create: (...args: unknown[]) => mockTxCreate(...args),
  },
}));

const mockPaymentFindOne = vi.fn();
const mockPaymentCreate = vi.fn();
vi.mock('@/models/Payment', () => ({
  default: {
    findOne: (...args: unknown[]) => mockPaymentFindOne(...args),
    create: (...args: unknown[]) => mockPaymentCreate(...args),
  },
}));

const mockProductFind = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { find: (...args: unknown[]) => mockProductFind(...args) },
}));
vi.mock('@/models/Customer', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));

const mockBundleFind = vi.fn();
vi.mock('@/models/ProductBundle', () => ({ default: { find: (...args: unknown[]) => mockBundleFind(...args) } }));

const mockDrawerFindOne = vi.fn();
vi.mock('@/models/CashDrawerSession', () => ({ default: { findOne: (...args: unknown[]) => mockDrawerFindOne(...args) } }));

import { POST } from '@/app/api/transactions/[id]/refund/route';

const refund = (body: Record<string, unknown>) =>
  POST(
    new NextRequest(new URL('http://localhost/api/transactions/tx-1/refund'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'tx-1' }) }
  );

const sale = (overrides: Record<string, unknown> = {}) => ({
  _id: 'tx-1',
  status: 'completed',
  receiptNumber: 'R1',
  subtotal: 300,
  total: 300,
  paymentMethod: 'cash',
  items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300 }],
  ...overrides,
});

const payment = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  _id: 'pay-1',
  method: 'cash',
  amount: 300,
  status: 'completed',
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('POST /api/transactions/[id]/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxExists.mockResolvedValue(null);
    mockDrawerFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    mockTxClaim.mockResolvedValue({ _id: 'tx-1' });
    mockTxCreate.mockResolvedValue([{ _id: { toString: () => 'refund-1' } }]);
    mockPaymentCreate.mockResolvedValue([{ _id: { toString: () => 'pay-2' } }]);
    mockProductFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: { toString: () => 'prod-a' }, trackInventory: true }]),
      }),
    });
  });

  it('keeps the sale completed and marks the payment partially refunded', async () => {
    const original = payment();
    mockTxFindOne.mockResolvedValue(sale());
    mockPaymentFindOne.mockResolvedValue(original);

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ refundAmount: 100, isFullRefund: false });

    const [filter, update] = mockTxClaim.mock.calls[0];
    expect(filter).toMatchObject({ tenantId: 'tenant-a', status: 'completed', refundCount: { $in: [0, null] } });
    expect(update.$set).toEqual({ status: 'completed', 'items.0.refundedQuantity': 1 });
    expect(update.$inc).toEqual({ refundCount: 1, refundedAmount: 100 });

    expect(original.status).toBe('partially_refunded');
    expect(original.refundedAmount).toBe(100);
    expect(mockTxCreate.mock.calls[0][0][0].receiptNumber).toBe('REF-R1');
    expect(mockUpdateStock.mock.calls[0].slice(0, 3)).toEqual(['prod-a', 'tenant-a', 1]);
  });

  it('allows a second partial refund and finishes the sale when nothing is left', async () => {
    const original = payment({ status: 'partially_refunded', refundedAmount: 100 });
    mockTxFindOne.mockResolvedValue(sale({
      refundCount: 1,
      refundedAmount: 100,
      items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300, refundedQuantity: 1 }],
    }));
    mockPaymentFindOne.mockResolvedValue(original);

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 2 }] });

    expect(res.status).toBe(201);
    expect((await res.json()).data.isFullRefund).toBe(true);
    expect(mockTxExists).not.toHaveBeenCalled();
    expect(mockTxClaim.mock.calls[0][0].refundCount).toBe(1);
    expect(mockTxClaim.mock.calls[0][1].$set.status).toBe('refunded');
    expect(mockTxCreate.mock.calls[0][0][0].receiptNumber).toBe('REF-R1-2');
    expect(original.status).toBe('refunded');
    expect(original.refundedAmount).toBe(300);
    expect(mockPaymentFindOne.mock.calls[0][0].status).toEqual({ $in: ['completed', 'partially_refunded'] });
  });

  it('refuses a sale with an untracked refund from before per-line tracking', async () => {
    mockTxFindOne.mockResolvedValue(sale());
    mockTxExists.mockResolvedValue({ _id: 'old-refund' });

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(mockTxExists.mock.calls[0][0]).toEqual({ tenantId: 'tenant-a', receiptNumber: 'REF-R1' });
    expect(mockTxClaim).not.toHaveBeenCalled();
    expect(mockUpdateStock).not.toHaveBeenCalled();
  });

  it('returns 409 and changes nothing when a concurrent refund wins the claim', async () => {
    mockTxFindOne.mockResolvedValue(sale());
    mockTxClaim.mockResolvedValue(null);

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(mockTxCreate).not.toHaveBeenCalled();
    expect(mockUpdateStock).not.toHaveBeenCalled();
  });

  it('refunds tax with a full refund', async () => {
    mockTxFindOne.mockResolvedValue(sale({ taxAmount: 36, total: 336 }));
    mockPaymentFindOne.mockResolvedValue(payment({ amount: 336 }));

    const res = await refund({});

    expect((await res.json()).data.refundAmount).toBe(336);
    expect(mockTxCreate.mock.calls[0][0][0]).toMatchObject({ userId: 'user-a', subtotal: 300, taxAmount: 36, total: 336 });
  });

  it('records the refund share of tax and discount on a partial refund', async () => {
    mockTxFindOne.mockResolvedValue(sale({ discountAmount: 30, taxAmount: 32.4, total: 302.4 }));
    mockPaymentFindOne.mockResolvedValue(payment({ amount: 302.4 }));

    await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(mockTxCreate.mock.calls[0][0][0]).toMatchObject({ subtotal: 100, discountAmount: 10, taxAmount: 10.8, total: 100.8 });
  });

  it('refunds a share of what was paid after discount, tax and loyalty', async () => {
    // 300 less 30 discount, plus 32.40 tax, less 2.40 of loyalty points
    mockTxFindOne.mockResolvedValue(sale({ discountAmount: 30, taxAmount: 32.4, total: 300 - 30 + 32.4 - 2.4 }));
    mockPaymentFindOne.mockResolvedValue(payment());

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect((await res.json()).data.refundAmount).toBe(100);
  });

  it('pays exactly what is left on the last refund', async () => {
    mockTxFindOne.mockResolvedValue(sale({
      total: 100,
      refundCount: 2,
      refundedAmount: 66.66,
      items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300, refundedQuantity: 2 }],
    }));
    mockPaymentFindOne.mockResolvedValue(payment({ amount: 100, refundedAmount: 66.66 }));

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect((await res.json()).data.refundAmount).toBe(33.34);
  });

  it('takes a cash refund from the open drawer, whoever processes it', async () => {
    mockDrawerFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ userId: 'cashier-b' }) }) });
    mockTxFindOne.mockResolvedValue(sale());
    mockPaymentFindOne.mockResolvedValue(payment());

    await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(mockDrawerFindOne.mock.calls[0][0]).toEqual({ tenantId: 'tenant-a', status: 'open' });
    expect(mockTxCreate.mock.calls[0][0][0].userId).toBe('cashier-b');
  });

  it('leaves the drawer alone on a card sale', async () => {
    mockTxFindOne.mockResolvedValue(sale({ paymentMethod: 'card' }));
    mockPaymentFindOne.mockResolvedValue(payment({ method: 'card' }));

    await refund({ items: [{ productId: 'prod-a', quantity: 1 }] });

    expect(mockDrawerFindOne).not.toHaveBeenCalled();
    expect(mockTxCreate.mock.calls[0][0][0].userId).toBe('user-a');
  });

  it('returns a bundle line through its components, tenant scoped', async () => {
    mockProductFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });
    const bundle = { _id: { toString: () => 'bundle-a' }, name: 'Set', trackInventory: true, items: [] };
    mockBundleFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([bundle]) }) });
    mockTxFindOne.mockResolvedValue(sale({
      items: [{ product: 'bundle-a', name: 'Set', price: 100, quantity: 3, subtotal: 300 }],
    }));
    mockPaymentFindOne.mockResolvedValue(payment());

    const res = await refund({ items: [{ productId: 'bundle-a', quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(mockBundleFind.mock.calls[0][0]).toEqual({ _id: { $in: ['bundle-a'] }, tenantId: 'tenant-a' });
    expect(mockUpdateBundleStock.mock.calls[0].slice(0, 4)).toEqual(['bundle-a', 'tenant-a', 2, 'return']);
    expect(mockUpdateStock).not.toHaveBeenCalled();
  });

  it('returns stock to the branch and variation the sale took it from', async () => {
    mockTxFindOne.mockResolvedValue(sale({
      branchId: 'branch-1',
      items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300, variation: { size: 'L', color: 'Red' } }],
    }));

    const res = await refund({ reason: 'customer_request' });

    expect(res.status).toBe(201);
    const [id, tenantId, quantity, type, options] = mockUpdateStock.mock.calls[0];
    expect([id, tenantId, quantity, type]).toEqual(['prod-a', 'tenant-a', 3, 'return']);
    expect(options).toMatchObject({ branchId: 'branch-1', variation: { size: 'L', color: 'Red' } });
  });

  it('keeps two variations of one product apart', async () => {
    mockTxFindOne.mockResolvedValue(sale({
      items: [
        { product: 'prod-a', name: 'Item A', price: 100, quantity: 1, subtotal: 100, variation: { size: 'S' } },
        { product: 'prod-a', name: 'Item A', price: 100, quantity: 2, subtotal: 200, variation: { size: 'L' } },
      ],
    }));

    await refund({ reason: 'customer_request' });

    const returned = mockUpdateStock.mock.calls.map(([, , quantity, , options]) => [quantity, options.variation.size]);
    expect(returned).toEqual([[1, 'S'], [2, 'L']]);
  });

  it('rejects refunding more than remains', async () => {
    mockTxFindOne.mockResolvedValue(sale({
      refundCount: 1,
      items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300, refundedQuantity: 2 }],
    }));

    const res = await refund({ items: [{ productId: 'prod-a', quantity: 2 }] });

    expect(res.status).toBe(400);
    expect(mockTxClaim).not.toHaveBeenCalled();
  });

  it('never pays back more than the sale total across refunds', async () => {
    mockTxFindOne.mockResolvedValue(sale({
      total: 299.99,
      refundCount: 1,
      refundedAmount: 200,
      items: [{ product: 'prod-a', name: 'Item A', price: 100, quantity: 3, subtotal: 300, refundedQuantity: 2 }],
    }));
    mockPaymentFindOne.mockResolvedValue(payment({ amount: 299.99, refundedAmount: 200 }));

    const res = await refund({});

    expect((await res.json()).data.refundAmount).toBe(99.99);
  });
});
