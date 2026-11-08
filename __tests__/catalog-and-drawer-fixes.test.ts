(process.env as Record<string, string>).JWT_SECRET = 'test-secret-for-catalog-and-drawer-fixes-tests-32chars!!';
(process.env as Record<string, string>).NODE_ENV = 'test';
(process.env as Record<string, string>).MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 1, resetAfterMs: 0 }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined), AuditActions: { UPDATE: 'update', CREATE: 'create', TRANSACTION_CREATE: 'transaction.create' } }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn().mockResolvedValue({ timezone: 'Asia/Manila' }) }));
vi.mock('@/lib/business-type-helpers', () => ({ validateProductForBusiness: () => ({ valid: true, errors: [] }) }));
vi.mock('@/lib/product-variations-save', () => ({
  findTakenVariationSku: vi.fn().mockResolvedValue(null),
  saveVariationRows: vi.fn().mockResolvedValue(undefined),
  variationProblemMessage: vi.fn(),
}));

const mockUpdateStock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/stock', () => ({ updateStock: (...a: unknown[]) => mockUpdateStock(...a) }));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: {
    getMonthlyTransactionCount: vi.fn().mockResolvedValue(3),
    countTransactionsThisMonth: vi.fn().mockResolvedValue(3),
    trackTransactionCreated: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...a: unknown[]) => mockRequireTenantAccess(...a),
  getTenantIdFromRequest: vi.fn().mockResolvedValue('507f1f77bcf86cd799439011'),
}));
const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
vi.mock('@/lib/receipt', () => ({ generateReceiptNumber: vi.fn().mockResolvedValue('R-1') }));

const mockProductFindOne = vi.fn();
const mockProductFindOneAndUpdate = vi.fn();
const mockProductFind = vi.fn();
vi.mock('@/models/Product', () => ({
  default: {
    findOne: (...a: unknown[]) => mockProductFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockProductFindOneAndUpdate(...a),
    find: (...a: unknown[]) => mockProductFind(...a),
    countDocuments: vi.fn().mockResolvedValue(1),
  },
}));
const mockCategoryFindOne = vi.fn();
vi.mock('@/models/Category', () => ({ default: { findOne: (...a: unknown[]) => mockCategoryFindOne(...a) } }));

const mockSessionFindOne = vi.fn();
const mockSessionFindOneAndUpdate = vi.fn();
vi.mock('@/models/CashDrawerSession', () => ({
  default: {
    findOne: (...a: unknown[]) => mockSessionFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockSessionFindOneAndUpdate(...a),
  },
}));
const mockTxFind = vi.fn();
const mockTxCreate = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    find: (...a: unknown[]) => mockTxFind(...a),
    create: (...a: unknown[]) => mockTxCreate(...a),
    findOne: vi.fn().mockReturnValue({ lean: () => Promise.resolve(null) }),
  },
}));
const mockExpenseFind = vi.fn();
vi.mock('@/models/Expense', () => ({ default: { find: (...a: unknown[]) => mockExpenseFind(...a) } }));

import { pickProductFields } from '@/lib/product-input';
import { parseBundleInput } from '@/lib/bundle-input';
import { PUT as putProduct } from '@/app/api/products/[id]/route';
import { POST as drawerPost } from '@/app/api/cash-drawer/sessions/route';
import { POST as manualPost } from '@/app/api/transactions/manual/route';

const TENANT = '507f1f77bcf86cd799439011';
const PRODUCT = '507f1f77bcf86cd799439022';
const PRODUCT_2 = '507f1f77bcf86cd799439033';
const t = (_k: string, fallback: string) => fallback;
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const leanOf = <T,>(value: T) => ({ select: () => ({ lean: () => Promise.resolve(value) }), lean: () => Promise.resolve(value) });

// ---------------------------------------------------------------------------
// lib/product-input
// ---------------------------------------------------------------------------

describe('pickProductFields', () => {
  it('drops fields that have their own path', () => {
    const { set } = pickProductFields({
      name: 'Tea', price: 5, stock: 99, tenantId: 'x', isActive: false, pinned: true,
      branchStock: [{ branchId: 'b', stock: 999 }], variations: [], hasVariations: true,
    });
    expect(set).toEqual({ name: 'Tea', price: 5 });
  });

  it('turns emptied optional fields into unsets', () => {
    const { set, unset } = pickProductFields({ name: 'Tea', sku: '', barcode: '  ', categoryId: '', image: null, allergens: [] });
    expect(unset.sort()).toEqual(['barcode', 'categoryId', 'image', 'sku']);
    expect(set).toEqual({ name: 'Tea', allergens: [] });
  });
});

// ---------------------------------------------------------------------------
// lib/bundle-input
// ---------------------------------------------------------------------------

describe('parseBundleInput', () => {
  beforeEach(() => {
    mockProductFind.mockReset();
    mockCategoryFindOne.mockReset();
  });

  const products = (list: unknown[]) => mockProductFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(list) }) });

  it("refuses a product that isn't the tenant's", async () => {
    products([]); // the tenant-scoped lookup finds nothing
    const result = await parseBundleInput({ name: 'Combo', price: 10, items: [{ productId: PRODUCT, quantity: 1 }] }, TENANT, t, { partial: false });
    expect(result).toEqual({ ok: false, error: 'A product in this bundle was not found' });
    expect(mockProductFind.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });

  it('requires a variation for a product that has them, and stores the matched one', async () => {
    products([{ _id: PRODUCT, name: 'Shirt', hasVariations: true, variations: [{ size: 'S', color: 'Red' }, { size: 'L', color: 'Red' }] }]);
    const missing = await parseBundleInput({ name: 'Combo', price: 10, items: [{ productId: PRODUCT, quantity: 1 }] }, TENANT, t, { partial: false });
    expect(missing.ok).toBe(false);

    const chosen = await parseBundleInput({ name: 'Combo', price: 10, items: [{ productId: PRODUCT, quantity: 2, variation: { size: 'L' } }] }, TENANT, t, { partial: false });
    expect(chosen.ok && chosen.value.set.items).toEqual([{ productId: PRODUCT, productName: 'Shirt', quantity: 2, variation: { size: 'L', color: 'Red' } }]);
  });

  it('accepts a price of 0 and takes product names from the catalogue', async () => {
    products([{ _id: PRODUCT_2, name: 'Real name' }]);
    const result = await parseBundleInput({ name: 'Free', price: 0, items: [{ productId: PRODUCT_2, productName: 'Spoofed', quantity: 1 }] }, TENANT, t, { partial: false });
    expect(result.ok && result.value.set.price).toBe(0);
    expect(result.ok && (result.value.set.items as Array<{ productName: string }>)[0].productName).toBe('Real name');
  });

  it("refuses another tenant's category and clears an emptied one on edit", async () => {
    mockCategoryFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const foreign = await parseBundleInput({ categoryId: PRODUCT }, TENANT, t, { partial: true });
    expect(foreign).toEqual({ ok: false, error: 'Category not found' });

    const cleared = await parseBundleInput({ categoryId: '', sku: '', description: '' }, TENANT, t, { partial: true });
    expect(cleared.ok && cleared.value.unset.sort()).toEqual(['categoryId', 'description', 'sku']);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/products/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/products/[id]', () => {
  const params = { params: Promise.resolve({ id: PRODUCT }) };
  const oldProduct = { _id: PRODUCT, name: 'Tea', price: 5, stock: 15, trackInventory: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProductFindOne.mockReset();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT, user: { userId: 'u1', role: 'manager' } });
    mockProductFindOne.mockReturnValueOnce(leanOf(oldProduct)).mockResolvedValue({ ...oldProduct });
    mockProductFindOneAndUpdate.mockResolvedValue({ ...oldProduct });
  });

  it('leaves stock alone when the form did not change it', async () => {
    const res = await putProduct(json(`http://x/api/products/${PRODUCT}`, 'PUT', { name: 'Green tea', price: 5 }), params);
    expect(res.status).toBe(200);
    expect(mockUpdateStock).not.toHaveBeenCalled();
    const [, update] = mockProductFindOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('stock');
  });

  it('books a typed count as an adjustment against the live figure', async () => {
    const res = await putProduct(json(`http://x/api/products/${PRODUCT}`, 'PUT', { name: 'Tea', price: 5, stock: 30 }), params);
    expect(res.status).toBe(200);
    expect(mockUpdateStock).toHaveBeenCalledWith(PRODUCT, TENANT, 15, 'adjustment', expect.objectContaining({ userId: 'u1' }));
  });

  it('ignores branchStock / isActive in the body and unsets an emptied sku', async () => {
    await putProduct(
      json(`http://x/api/products/${PRODUCT}`, 'PUT', { name: 'Tea', price: 5, sku: '', isActive: false, branchStock: [{ branchId: 'b', stock: 999 }] }),
      params
    );
    const [, update] = mockProductFindOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('branchStock');
    expect(update.$set).not.toHaveProperty('isActive');
    expect(update.$unset).toEqual({ sku: '' });
  });
});

// ---------------------------------------------------------------------------
// Cash drawer close and manual sales
// ---------------------------------------------------------------------------

describe('cash drawer close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'cashier', tenantId: TENANT });
  });

  it('subtracts cash expenses recorded during the session, skipping deleted ones', async () => {
    const openingTime = new Date('2026-11-08T01:00:00Z'); // 09:00 in Manila
    mockSessionFindOne.mockResolvedValue({ _id: 's1', userId: { toString: () => 'u1' }, openingAmount: 1000, openingTime });
    mockTxFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ total: 200, status: 'completed' }]) }) });
    mockExpenseFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ amount: 500 }]) }) });
    mockSessionFindOneAndUpdate.mockImplementation((_f: unknown, update: { $set: Record<string, unknown> }) => Promise.resolve({ _id: 's1', ...update.$set }));

    const res = await drawerPost(json('http://x/api/cash-drawer/sessions', 'POST', { action: 'close', closingAmount: 700 }));
    expect(res.status).toBe(200);

    const filter = mockExpenseFind.mock.calls[0][0];
    expect(filter.isActive).toEqual({ $ne: false });
    expect(filter.createdAt.$gte).toBe(openingTime);
    // A same-day expense stored at UTC midnight of the picked day still counts
    expect(filter.date.$gte.getTime()).toBeLessThanOrEqual(Date.parse('2026-11-08T00:00:00Z'));

    const [, update] = mockSessionFindOneAndUpdate.mock.calls[0];
    expect(update.$set.expectedAmount).toBe(700); // 1000 + 200 − 500
    expect(update.$set.overage).toBe(0);
  });

  it('refuses opening the drawer without drawer permission', async () => {
    const { hasTenantPermission } = await import('@/lib/permissions-server');
    vi.mocked(hasTenantPermission).mockResolvedValueOnce(false);
    mockRequireAuth.mockResolvedValue({ userId: 'u9', role: 'viewer', tenantId: TENANT });
    const res = await drawerPost(json('http://x/api/cash-drawer/sessions', 'POST', { action: 'open', openingAmount: 100 }));
    expect(res.status).toBe(403);
  });
});

describe('manual sale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: TENANT });
    mockTxCreate.mockImplementation((doc: Record<string, unknown>) => Promise.resolve({ _id: { toString: () => 't1' }, ...doc }));
  });

  it('records who rang it up and checks the plan limit', async () => {
    const { checkSubscriptionLimit } = await import('@/lib/subscription');
    const res = await manualPost(json('http://x/api/transactions/manual', 'POST', { items: [{ name: 'Fix', price: 50, quantity: 1 }], paymentMethod: 'cash', cashReceived: 50 }));
    expect(res.status).toBe(201);
    expect(mockTxCreate.mock.calls[0][0]).toMatchObject({ userId: 'u1' });
    expect(checkSubscriptionLimit).toHaveBeenCalledWith(TENANT, 'maxTransactions', 3);
  });

  it('refuses cash received below the total', async () => {
    const res = await manualPost(json('http://x/api/transactions/manual', 'POST', { items: [{ name: 'Fix', price: 200, quantity: 1 }], paymentMethod: 'cash', cashReceived: 50 }));
    expect(res.status).toBe(400);
    expect(mockTxCreate).not.toHaveBeenCalled();
  });
});
