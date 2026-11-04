/**
 * POST /api/transactions (checkout) and POST /api/transactions/[id]/refund:
 * the money path. Repositories are mocked; the assertions cover what must hold
 * on any driver: everything runs in one transaction for the caller's tenant,
 * retries and races don't double-charge, and failures give back what they took.
 */
process.env.JWT_SECRET = 'test-secret-for-checkout-api-tests-32chars!';
(process.env as Record<string, string>).NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { TENANT, USER } = vi.hoisted(() => ({
  TENANT: '64abc123def4567890abcdef',
  USER: '64abc123def4567890abc111',
}));
const PRODUCT = '64abc123def4567890abc222';
const CUSTOMER = '64abc123def4567890abc333';
const DISCOUNT = '64abc123def4567890abc444';
const TXN = '64abc123def4567890abc555';

const { repos, tx, runInTransaction, isTransactional, stock, credit } = vi.hoisted(() => {
  const tx = { driver: 'mongo', session: { id: 'session' } };
  return {
    tx,
    runInTransaction: vi.fn(),
    isTransactional: vi.fn(),
    stock: { updateStock: vi.fn(), updateBundleStock: vi.fn(), insertStockMovements: vi.fn() },
    credit: { getOnAccountTotalForTransaction: vi.fn() },
    repos: {
      transactions: {
        findByIdempotencyKey: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        setLoyaltyPoints: vi.fn(),
        findById: vi.fn(),
        claimStatus: vi.fn(),
      },
      payments: { create: vi.fn(), findOne: vi.fn(), markRefunded: vi.fn() },
      products: { list: vi.fn() },
      bundles: { list: vi.fn() },
      discounts: { claimUsage: vi.fn(), releaseUsage: vi.fn(), findByCode: vi.fn() },
      customers: { findById: vi.fn(), findOne: vi.fn(), setBalances: vi.fn(), adjustAccountBalance: vi.fn() },
      loyaltyConfigs: { get: vi.fn() },
      loyaltyTransactions: { create: vi.fn() },
      tenants: { addToGrandTotals: vi.fn() },
      branches: { findById: vi.fn() },
      devices: { findById: vi.fn() },
      tables: { update: vi.fn() },
      ecommerceIntegrations: { findActive: vi.fn() },
    },
  };
});

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getRepos: () => repos,
  runInTransaction,
  isTransactional,
}));

vi.mock('@/lib/stock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stock')>()),
  ...stock,
}));

vi.mock('@/lib/customer-credit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/customer-credit')>()),
  ...credit,
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { TRANSACTION_CREATE: 'create', TRANSACTION_REFUND: 'refund' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: TENANT,
    user: { userId: USER, tenantId: TENANT, email: 'a@b.c', role: 'cashier' },
  }),
  getTenantIdFromRequest: vi.fn().mockResolvedValue(TENANT),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: USER, tenantId: TENANT, role: 'manager' }),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: USER, tenantId: TENANT, role: 'manager' }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/receipt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/receipt')>()),
  generateReceiptNumber: vi.fn().mockResolvedValue('REC-20261101-00001'),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true, enableOnAccountSales: true }),
}));
vi.mock('@/lib/tax-calculation', () => ({
  calculateTax: vi.fn().mockResolvedValue({
    taxAmount: 0,
    taxRate: 0,
    taxLabel: 'Tax',
    taxableAmount: 0,
    exemptAmount: 0,
    zeroRatedAmount: 0,
  }),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: {
    getMonthlyTransactionCount: vi.fn().mockResolvedValue(1),
    recordTransaction: vi.fn().mockResolvedValue(undefined),
    trackTransactionCreated: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/ecommerce/inventory-push', () => ({ pushChannelInventoryForProducts: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { POST as checkout } from '@/app/api/transactions/route';
import { POST as refund } from '@/app/api/transactions/[id]/refund/route';
import { DuplicateKeyError } from '@/lib/db';
import { checkFeatureAccess } from '@/lib/subscription';

const product = { _id: PRODUCT, name: 'Coffee', price: 100, stock: 10, trackInventory: true };

function sale(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: PRODUCT, quantity: 2 }],
      paymentMethod: 'cash',
      cashReceived: 500,
      ...overrides,
    }),
  });
}

const dupError = (field: string) =>
  new DuplicateKeyError('E11000', Object.assign(new Error('E11000'), { code: 11000, keyPattern: { tenantId: 1, [field]: 1 } }));

beforeEach(() => {
  vi.clearAllMocks();
  runInTransaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  isTransactional.mockReturnValue(true);
  stock.updateStock.mockResolvedValue(undefined);
  stock.updateBundleStock.mockResolvedValue(undefined);
  stock.insertStockMovements.mockResolvedValue(undefined);
  vi.mocked(checkFeatureAccess).mockResolvedValue(undefined as never);
  repos.transactions.findByIdempotencyKey.mockResolvedValue(null);
  repos.transactions.create.mockImplementation(async (_t: string, input: object) => ({ ...input, createdAt: new Date() }));
  repos.products.list.mockResolvedValue([product]);
  repos.bundles.list.mockResolvedValue([]);
  repos.loyaltyConfigs.get.mockResolvedValue(null);
  repos.payments.create.mockImplementation(async (_t: string, input: object) => ({ _id: 'pay-1', ...input }));
  repos.discounts.releaseUsage.mockResolvedValue(undefined);
  repos.customers.findById.mockResolvedValue({ _id: CUSTOMER, loyaltyPointsBalance: 200 });
});

describe('POST /api/transactions', () => {
  it('records the sale in one transaction', async () => {
    const res = await checkout(sale());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(stock.updateStock).toHaveBeenCalledWith(PRODUCT, TENANT, -2, 'sale', expect.anything(), tx);
    expect(stock.insertStockMovements).toHaveBeenCalledWith([], tx);

    const [tenantId, input, opts] = repos.transactions.create.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(input).toMatchObject({ subtotal: 200, total: 200, change: 300, status: 'completed', userId: USER });
    expect(opts).toEqual({ tx });

    expect(repos.tenants.addToGrandTotals).toHaveBeenCalledWith(TENANT, 200, { tx });
    expect(repos.payments.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ method: 'cash', amount: 200, status: 'completed' }),
      { tx }
    );
    expect(body.data.payments).toEqual([{ _id: 'pay-1', method: 'cash', amount: 200, status: 'completed' }]);
  });

  it('writes stock movements with the id the transaction gets', async () => {
    await checkout(sale());

    const movementOptions = stock.updateStock.mock.calls[0][4];
    expect(movementOptions.transactionId).toMatch(/^[0-9a-f]{24}$/);
    expect(repos.transactions.create.mock.calls[0][1]._id).toBe(movementOptions.transactionId);
  });

  it('replays an idempotent retry without writing anything', async () => {
    repos.transactions.findByIdempotencyKey.mockResolvedValue({ _id: TXN, total: 200 });

    const res = await checkout(sale({ idempotencyKey: 'key-1' }));

    expect(res.status).toBe(200);
    expect((await res.json()).data._id).toBe(TXN);
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(stock.updateStock).not.toHaveBeenCalled();
  });

  it('returns the winner of an idempotency race and gives the discount use back', async () => {
    repos.discounts.claimUsage.mockResolvedValue({ _id: DISCOUNT, code: 'SAVE', type: 'fixed', value: 10 });
    repos.transactions.create.mockRejectedValue(dupError('idempotencyKey'));
    repos.transactions.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: TXN, total: 190 });

    const res = await checkout(sale({ idempotencyKey: 'key-1', discountCode: 'SAVE' }));

    expect(res.status).toBe(200);
    expect((await res.json()).data._id).toBe(TXN);
    expect(repos.discounts.releaseUsage).toHaveBeenCalledTimes(1);
    expect(repos.discounts.releaseUsage).toHaveBeenCalledWith(TENANT, DISCOUNT);
  });

  it('retries with the next number on a duplicate receipt number', async () => {
    repos.transactions.create
      .mockRejectedValueOnce(dupError('receiptNumber'))
      .mockImplementationOnce(async (_t: string, input: object) => ({ ...input }));

    const res = await checkout(sale());

    expect(res.status).toBe(201);
    expect(repos.transactions.create).toHaveBeenCalledTimes(2);
  });

  it('reports another duplicate key as a client error without retrying', async () => {
    repos.transactions.create.mockRejectedValue(dupError('channelSyncKey'));

    const res = await checkout(sale({ idempotencyKey: 'key-1' }));

    expect(res.status).toBe(400);
    expect(repos.transactions.create).toHaveBeenCalledTimes(1);
  });

  it('gives the discount use back when the sale fails', async () => {
    repos.discounts.claimUsage.mockResolvedValue({ _id: DISCOUNT, code: 'SAVE', type: 'fixed', value: 10 });
    stock.updateStock.mockRejectedValue(new Error('Insufficient stock'));

    const res = await checkout(sale({ discountCode: 'SAVE' }));

    expect(res.status).toBe(400);
    expect(repos.discounts.releaseUsage).toHaveBeenCalledWith(TENANT, DISCOUNT);
    expect(repos.transactions.create).not.toHaveBeenCalled();
  });

  it('gives the discount use back when the minimum purchase is not met', async () => {
    repos.discounts.claimUsage.mockResolvedValue({
      _id: DISCOUNT,
      code: 'SAVE',
      type: 'fixed',
      value: 10,
      minPurchaseAmount: 1000,
    });

    const res = await checkout(sale({ discountCode: 'SAVE' }));

    expect(res.status).toBe(400);
    expect(repos.discounts.releaseUsage).toHaveBeenCalledWith(TENANT, DISCOUNT);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('explains why a discount could not be claimed', async () => {
    repos.discounts.claimUsage.mockResolvedValue(null);
    repos.discounts.findByCode.mockResolvedValue({
      isActive: true,
      validFrom: new Date(0),
      validUntil: new Date(Date.now() + 86_400_000),
    });

    const res = await checkout(sale({ discountCode: 'SAVE' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('usage limit');
    expect(repos.discounts.releaseUsage).not.toHaveBeenCalled();
  });

  it('applies the discount claimed for this tenant', async () => {
    repos.discounts.claimUsage.mockResolvedValue({
      _id: DISCOUNT,
      code: 'SAVE',
      type: 'percentage',
      value: 10,
      category: 'promo',
    });

    await checkout(sale({ discountCode: 'save' }));

    expect(repos.discounts.claimUsage).toHaveBeenCalledWith(TENANT, 'save', expect.any(Date));
    expect(repos.transactions.create.mock.calls[0][1]).toMatchObject({
      discountCode: 'SAVE',
      discountCategory: 'promo',
      discountAmount: 20,
      total: 180,
    });
  });

  it('keeps movements of lines already deducted when running without a transaction', async () => {
    isTransactional.mockReturnValue(false);
    stock.updateStock.mockRejectedValue(new Error('Insufficient stock'));

    await checkout(sale());

    expect(stock.insertStockMovements).toHaveBeenCalledWith([]);
  });

  it('writes no partial movements when a real transaction rolls back', async () => {
    stock.updateStock.mockRejectedValue(new Error('Insufficient stock'));

    await checkout(sale());

    expect(stock.insertStockMovements).not.toHaveBeenCalled();
  });

  it('earns and redeems loyalty points in the transaction', async () => {
    repos.loyaltyConfigs.get.mockResolvedValue({ pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 100, isEnabled: true });

    const res = await checkout(sale({ customerId: CUSTOMER, loyaltyPointsToRedeem: 100 }));

    expect(res.status).toBe(201);
    // ₱200 less ₱10 redeemed
    expect(repos.transactions.create.mock.calls[0][1].total).toBe(190);
    expect(repos.loyaltyTransactions.create).toHaveBeenCalledTimes(2);
    expect(repos.loyaltyTransactions.create.mock.calls[0][1]).toMatchObject({ type: 'redeem', points: -100, balanceAfter: 100 });
    expect(repos.loyaltyTransactions.create.mock.calls[1][1]).toMatchObject({ type: 'earn', points: 190, balanceAfter: 290 });
    expect(repos.customers.setBalances).toHaveBeenCalledWith(TENANT, CUSTOMER, { loyaltyPointsBalance: 290 }, { tx });
  });

  it('rejects a redemption above the balance before taking anything', async () => {
    repos.loyaltyConfigs.get.mockResolvedValue({ pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 100, isEnabled: true });

    const res = await checkout(sale({ customerId: CUSTOMER, loyaltyPointsToRedeem: 500 }));

    expect(res.status).toBe(400);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('charges an on-account sale to the customer balance', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('not on this plan'));
    repos.customers.findOne.mockResolvedValue({ _id: CUSTOMER, accountBalance: 50, creditLimit: 1000 });

    const res = await checkout(sale({ paymentMethod: 'on_account', cashReceived: undefined, customerId: CUSTOMER }));

    expect(res.status).toBe(201);
    expect(repos.customers.findOne).toHaveBeenCalledWith(
      TENANT,
      { ids: [CUSTOMER], isActive: true },
      { select: 'accountBalance creditLimit', tx }
    );
    expect(repos.customers.adjustAccountBalance).toHaveBeenCalledWith(TENANT, CUSTOMER, 200, { tx });
  });

  it('fails the sale when it would exceed the credit limit', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('not on this plan'));
    repos.customers.findOne.mockResolvedValue({ _id: CUSTOMER, accountBalance: 900, creditLimit: 1000 });

    const res = await checkout(sale({ paymentMethod: 'on_account', cashReceived: undefined, customerId: CUSTOMER }));

    expect(res.status).toBe(400);
    expect(repos.customers.adjustAccountBalance).not.toHaveBeenCalled();
  });

  it('skips the payment record when the client asks', async () => {
    const res = await checkout(sale({ createPaymentRecord: false }));

    expect(res.status).toBe(201);
    expect(repos.payments.create).not.toHaveBeenCalled();
  });

  it('frees the table after a dine-in sale, and a failure there keeps the sale', async () => {
    repos.tables.update.mockRejectedValue(new Error('down'));

    const res = await checkout(sale({ orderType: 'dine-in', tableId: 'table-1' }));

    expect(res.status).toBe(201);
    expect(repos.tables.update).toHaveBeenCalledWith(TENANT, 'table-1', { status: 'open', currentOrderId: undefined });
  });

  it('rejects an invalid customer id', async () => {
    const res = await checkout(sale({ customerId: 'nope' }));

    expect(res.status).toBe(400);
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/transactions/[id]/refund', () => {
  const original = {
    _id: TXN,
    status: 'completed',
    items: [
      { product: PRODUCT, name: 'Coffee', price: 100, quantity: 2, subtotal: 200 },
      { product: 'other-product', name: 'Tea', price: 50, quantity: 1, subtotal: 50 },
    ],
    subtotal: 250,
    total: 250,
    paymentMethod: 'cash',
    receiptNumber: 'REC-1',
  };

  const params = { params: Promise.resolve({ id: TXN }) };
  const request = (body: object = {}) =>
    new NextRequest(`http://localhost/api/transactions/${TXN}/refund`, { method: 'POST', body: JSON.stringify(body) });

  beforeEach(() => {
    repos.transactions.findById.mockResolvedValue({ ...original });
    repos.transactions.claimStatus.mockResolvedValue({ ...original });
    repos.transactions.create.mockImplementation(async (_t: string, input: object) => ({ _id: 'refund-1', ...input }));
    repos.products.list.mockResolvedValue([{ _id: PRODUCT, trackInventory: true }]);
    repos.payments.findOne.mockResolvedValue(null);
    credit.getOnAccountTotalForTransaction.mockResolvedValue(0);
  });

  it('refunds everything in one transaction when no items are named', async () => {
    const res = await refund(request({ reason: 'damaged' }), params);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ isFullRefund: true, refundAmount: 250 });
    expect(body.data.originalTransaction.status).toBe('refunded');
    expect(repos.transactions.claimStatus).toHaveBeenCalledWith(TENANT, TXN, 'completed', 'refunded', { tx });
    expect(repos.transactions.create.mock.calls[0][1]).toMatchObject({
      status: 'refunded',
      total: 250,
      receiptNumber: 'REF-REC-1',
    });
    expect(stock.updateStock).toHaveBeenCalledWith(PRODUCT, TENANT, 2, 'return', expect.anything(), tx);
    expect(stock.insertStockMovements).toHaveBeenCalledWith([], tx);
  });

  it('a partial refund leaves the status completed', async () => {
    const res = await refund(request({ items: [{ productId: PRODUCT, quantity: 1 }] }), params);

    expect((await res.json()).data).toMatchObject({ isFullRefund: false, refundAmount: 100 });
    expect(repos.transactions.claimStatus).toHaveBeenCalledWith(TENANT, TXN, 'completed', 'completed', { tx });
  });

  it('loses a refund race with 409 and restores no stock', async () => {
    repos.transactions.claimStatus.mockResolvedValue(null);

    const res = await refund(request(), params);

    expect(res.status).toBe(409);
    expect(repos.transactions.create).not.toHaveBeenCalled();
    expect(stock.updateStock).not.toHaveBeenCalled();
  });

  it('rejects an already refunded transaction', async () => {
    repos.transactions.findById.mockResolvedValue({ ...original, status: 'refunded' });

    const res = await refund(request(), params);

    expect(res.status).toBe(400);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects refunding more than was bought', async () => {
    const res = await refund(request({ items: [{ productId: PRODUCT, quantity: 3 }] }), params);

    expect(res.status).toBe(400);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('records the refund payment and marks the original refunded', async () => {
    repos.payments.findOne.mockResolvedValue({ _id: 'pay-1', method: 'cash', details: { cashReceived: 300 } });

    const res = await refund(request({ reason: 'damaged' }), params);

    expect(res.status).toBe(201);
    expect(repos.payments.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        transactionId: 'refund-1',
        method: 'cash',
        amount: 250,
        status: 'refunded',
        refundReason: 'damaged',
        details: { cashReceived: 300 },
      }),
      { tx }
    );
    expect(repos.payments.markRefunded).toHaveBeenCalledWith(TENANT, 'pay-1', { at: expect.any(Date), reason: 'damaged' }, { tx });
  });

  it('credits an on-account refund back to the customer', async () => {
    repos.transactions.findById.mockResolvedValue({ ...original, customerId: CUSTOMER, paymentMethod: 'on_account' });
    credit.getOnAccountTotalForTransaction.mockResolvedValue(250);
    repos.customers.findById.mockResolvedValue({ _id: CUSTOMER, accountBalance: 300 });

    const res = await refund(request(), params);

    expect(res.status).toBe(201);
    expect(repos.customers.adjustAccountBalance).toHaveBeenCalledWith(TENANT, CUSTOMER, -250, { tx });
    expect(repos.customers.setBalances).not.toHaveBeenCalled();
  });

  it('reads the on-account total outside the transaction', async () => {
    repos.transactions.findById.mockResolvedValue({ ...original, customerId: CUSTOMER });

    await refund(request(), params);

    // The payment was just marked refunded inside the transaction, so a read in
    // it would no longer count that payment. The helper takes no tx at all.
    expect(credit.getOnAccountTotalForTransaction).toHaveBeenCalledWith(TENANT, TXN, 250, 'cash');
  });

  it('clamps a balance that a refund would take below zero', async () => {
    repos.transactions.findById.mockResolvedValue({ ...original, customerId: CUSTOMER, paymentMethod: 'on_account' });
    credit.getOnAccountTotalForTransaction.mockResolvedValue(250);
    repos.customers.findById.mockResolvedValue({ _id: CUSTOMER, accountBalance: 100 });

    await refund(request(), params);

    expect(repos.customers.setBalances).toHaveBeenCalledWith(TENANT, CUSTOMER, { accountBalance: 0 }, { tx });
  });

  it('mirrors the refund on Shopify only for Shopify orders', async () => {
    await refund(request(), params);

    expect(repos.ecommerceIntegrations.findActive).not.toHaveBeenCalled();
  });
});
