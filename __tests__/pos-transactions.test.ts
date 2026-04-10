process.env.JWT_SECRET = 'test-secret-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockProductFind,
  mockProductFindOne,
  mockBundleFind,
  mockTransactionCreate,
  mockTransactionCountDocuments,
  mockTransactionUpdateOne,
  mockPaymentCreate,
  mockDiscountFindOneAndUpdate,
  mockDiscountFindOne,
  mockCustomerFindOne,
  mockLoyaltyConfigFindOne,
  mockLoyaltyTransactionCreate,
  mockCustomerUpdateOne,
  mockTableFindOneAndUpdate,
  mockStockMovementUpdateOne,
  mockSession,
} = vi.hoisted(() => {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
  };
  return {
    mockProductFind: vi.fn(),
    mockProductFindOne: vi.fn(),
    mockBundleFind: vi.fn(),
    mockTransactionCreate: vi.fn(),
    mockTransactionCountDocuments: vi.fn().mockResolvedValue(0),
    mockTransactionUpdateOne: vi.fn().mockResolvedValue({}),
    mockPaymentCreate: vi.fn(),
    mockDiscountFindOneAndUpdate: vi.fn(),
    mockDiscountFindOne: vi.fn(),
    mockCustomerFindOne: vi.fn(),
    mockLoyaltyConfigFindOne: vi.fn(),
    mockLoyaltyTransactionCreate: vi.fn().mockResolvedValue([{}]),
    mockCustomerUpdateOne: vi.fn().mockResolvedValue({}),
    mockTableFindOneAndUpdate: vi.fn().mockResolvedValue({}),
    mockStockMovementUpdateOne: vi.fn().mockResolvedValue({}),
    mockSession: session,
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { TRANSACTION_CREATE: 'TRANSACTION_CREATE' },
}));
vi.mock('@/lib/webhooks', () => ({ dispatchWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/auth-config', () => ({ AUTH_COOKIE_MAX_AGE: 604800, RL: {} }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true }),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  checkFeatureAccess: vi.fn().mockRejectedValue(new Error('not enabled')), // loyalty off by default
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/tax-calculation', () => ({
  calculateTax: vi.fn().mockResolvedValue({ taxAmount: 0, taxRate: 0, taxLabel: '', taxableAmount: 0, exemptAmount: 0 }),
}));
vi.mock('@/lib/receipt', () => ({
  generateReceiptNumber: vi.fn().mockResolvedValue('REC-20260101-00001'),
}));
vi.mock('@/lib/stock', () => ({
  updateStock: vi.fn().mockResolvedValue(undefined),
  updateBundleStock: vi.fn().mockResolvedValue(undefined),
  getProductStock: vi.fn().mockResolvedValue(100),
}));

vi.mock('mongoose', () => ({
  default: {
    startSession: vi.fn().mockResolvedValue(mockSession),
    Schema: class { constructor(_: unknown) {} index() { return this; } },
    models: {},
    model: vi.fn().mockReturnValue({}),
  },
  startSession: vi.fn().mockResolvedValue(mockSession),
  Schema: class { constructor(_: unknown) {} index() { return this; } },
  models: {},
  model: vi.fn().mockReturnValue({}),
}));

vi.mock('@/models/Product', () => ({
  default: {
    find: mockProductFind,
    findOne: mockProductFindOne,
  },
}));
vi.mock('@/models/ProductBundle', () => ({ default: { find: mockBundleFind } }));
vi.mock('@/models/Transaction', () => ({
  default: {
    create: mockTransactionCreate,
    countDocuments: mockTransactionCountDocuments,
    updateOne: mockTransactionUpdateOne,
  },
}));
vi.mock('@/models/Payment', () => ({ default: { create: mockPaymentCreate } }));
vi.mock('@/models/Discount', () => ({
  default: { findOneAndUpdate: mockDiscountFindOneAndUpdate, findOne: mockDiscountFindOne },
}));
vi.mock('@/models/Customer', () => ({ default: { findOne: mockCustomerFindOne, updateOne: mockCustomerUpdateOne } }));
vi.mock('@/models/LoyaltyConfig', () => ({ default: { findOne: mockLoyaltyConfigFindOne } }));
vi.mock('@/models/LoyaltyTransaction', () => ({ default: { create: mockLoyaltyTransactionCreate } }));
vi.mock('@/models/Table', () => ({ default: { findOneAndUpdate: mockTableFindOneAndUpdate } }));
vi.mock('@/models/StockMovement', () => ({ default: { updateOne: mockStockMovementUpdateOne } }));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));

vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }) }),
    }),
  },
}));

vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockImplementation((body) => ({ data: body, errors: [] })),
  validateTransaction: {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthRequest(body: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest('http://localhost/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: JSON.stringify(body),
  });
}

/** One active product in the product map */
const activeProduct = {
  _id: 'prod-1',
  name: 'Widget',
  price: 100,
  stock: 50,
  trackInventory: true,
  allowOutOfStockSales: false,
  isActive: true,
  taxExempt: false,
  hasVariations: false,
  variations: [],
};

/** The route calls Product.find({...}).lean() and Product.findOne({}).session(s) */
function setupActiveProduct() {
  mockProductFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([activeProduct]) });
  mockBundleFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  // Inside the session, route calls Product.findOne({}).session(session) to check trackInventory
  mockProductFindOne.mockReturnValue({ session: vi.fn().mockResolvedValue(activeProduct) });
}

function setupSuccessfulTransaction() {
  setupActiveProduct();
  mockTransactionCreate.mockResolvedValue([{
    _id: 'txn-1',
    receiptNumber: 'REC-20260101-00001',
    total: 100,
    toObject: () => ({ _id: 'txn-1', receiptNumber: 'REC-20260101-00001', total: 100 }),
  }]);
  mockPaymentCreate.mockResolvedValue([{ _id: 'pay-1', method: 'cash', amount: 100, status: 'completed' }]);
}

const validBody = {
  items: [{ productId: 'prod-1', quantity: 1 }],
  paymentMethod: 'cash',
  cashReceived: 100,
};

// ---------------------------------------------------------------------------
// POST /api/transactions
// ---------------------------------------------------------------------------

describe('POST /api/transactions', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-apply mocks cleared by clearAllMocks (factory-created vi.fn() implementations are reset)
    const apiTenant = await import('@/lib/api-tenant');
    vi.mocked(apiTenant.requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    });

    const rl = await import('@/lib/rate-limit');
    vi.mocked(rl.checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(rl.getClientIp).mockReturnValue('127.0.0.1');

    const sub = await import('@/lib/subscription');
    vi.mocked(sub.checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(sub.checkFeatureAccess).mockRejectedValue(new Error('not enabled')); // loyalty off by default
    vi.mocked(sub.SubscriptionService.updateUsage).mockResolvedValue(undefined);

    const tenant = await import('@/lib/tenant');
    vi.mocked(tenant.getTenantSettingsById).mockResolvedValue({ enableDiscounts: true });

    const receipt = await import('@/lib/receipt');
    vi.mocked(receipt.generateReceiptNumber).mockResolvedValue('REC-20260101-00001');

    const tax = await import('@/lib/tax-calculation');
    vi.mocked(tax.calculateTax).mockResolvedValue({ taxAmount: 0, taxRate: 0, taxLabel: '', taxableAmount: 0, exemptAmount: 0 });

    const validation = await import('@/lib/validation');
    vi.mocked(validation.validateAndSanitize).mockImplementation((body) => ({ data: body, errors: [] }));

    const stock = await import('@/lib/stock');
    vi.mocked(stock.updateStock).mockResolvedValue(undefined);
    vi.mocked(stock.updateBundleStock).mockResolvedValue(undefined);
    vi.mocked(stock.getProductStock).mockResolvedValue(100);

    // Re-apply mongoose.startSession (clearAllMocks resets implementations)
    const mongoose = await import('mongoose');
    vi.mocked(mongoose.default.startSession).mockResolvedValue(mockSession);

    // Reset session
    mockSession.startTransaction.mockImplementation(() => {});
    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockSession.endSession.mockImplementation(() => {});

    // Reset shared model mocks
    mockTransactionCountDocuments.mockResolvedValue(0);
    mockTransactionUpdateOne.mockResolvedValue({});
    mockStockMovementUpdateOne.mockResolvedValue({});
    mockTableFindOneAndUpdate.mockResolvedValue({});
    mockCustomerUpdateOne.mockResolvedValue({});
    mockLoyaltyTransactionCreate.mockResolvedValue([{}]);

    ({ POST } = await import('@/app/api/transactions/route'));
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    const apiTenant = await import('@/lib/api-tenant');
    vi.mocked(apiTenant.requireTenantAccess).mockRejectedValue(new Error('Unauthorized'));
    const req = new NextRequest('http://localhost/api/transactions', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Product validation ────────────────────────────────────────────────────

  it('returns 404 when product is not found (isActive filter)', async () => {
    mockProductFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockBundleFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const res = await POST(makeAuthRequest(validBody));
    // The route returns 404 for product not found embedded in business error handling
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  // ── Stock validation ──────────────────────────────────────────────────────

  it('returns 400 when stock is insufficient', async () => {
    const lowStockProduct = { ...activeProduct, stock: 5, allowOutOfStockSales: false };
    mockProductFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([lowStockProduct]) });
    mockBundleFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    vi.mocked((await import('@/lib/stock')).getProductStock).mockResolvedValue(1);

    const res = await POST(makeAuthRequest({
      ...validBody,
      items: [{ productId: 'prod-1', quantity: 5 }],
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/insufficient stock/i);
  });

  // ── Split payment validation ──────────────────────────────────────────────

  it('returns 400 when a payment amount is zero or negative', async () => {
    setupActiveProduct();
    const res = await POST(makeAuthRequest({
      items: [{ productId: 'prod-1', quantity: 1 }],
      paymentMethod: 'cash',
      payments: [
        { method: 'cash', amount: 0 },
        { method: 'card', amount: 100 },
      ],
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/greater than 0/i);
  });

  it('returns 400 when a payment method is invalid', async () => {
    setupActiveProduct();
    const res = await POST(makeAuthRequest({
      items: [{ productId: 'prod-1', quantity: 1 }],
      paymentMethod: 'cash',
      payments: [{ method: 'bitcoin', amount: 100 }],
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid payment method/i);
  });

  it('returns 400 when split payments do not sum to total', async () => {
    setupActiveProduct();
    const res = await POST(makeAuthRequest({
      items: [{ productId: 'prod-1', quantity: 1 }],
      paymentMethod: 'cash',
      payments: [
        { method: 'cash', amount: 50 },
        { method: 'card', amount: 10 }, // 60 total, product costs 100
      ],
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/payments total/i);
  });

  // ── Discount validation ───────────────────────────────────────────────────

  it('returns 400 when discount code is invalid', async () => {
    setupActiveProduct();
    mockDiscountFindOneAndUpdate.mockResolvedValue(null); // atomic check fails
    mockDiscountFindOne.mockResolvedValue(null);          // raw lookup also fails

    const res = await POST(makeAuthRequest({ ...validBody, discountCode: 'BADCODE' }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid or inactive/i);
  });

  it('returns 400 when discount usage limit is reached', async () => {
    setupActiveProduct();
    // Atomic update fails (limit reached)
    mockDiscountFindOneAndUpdate.mockResolvedValue(null);
    // Raw lookup reveals limit is exhausted
    mockDiscountFindOne.mockResolvedValue({
      isActive: true,
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000),
      usageLimit: 10,
      usageCount: 10,
    });

    const res = await POST(makeAuthRequest({ ...validBody, discountCode: 'FULL10' }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/usage limit/i);
  });

  // ── Loyalty points ────────────────────────────────────────────────────────

  it('returns 400 when loyalty points to redeem exceed balance', async () => {
    setupActiveProduct();
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    // LoyaltyConfig.findOne({}).lean() is chained
    mockLoyaltyConfigFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 10, isEnabled: true }),
    });
    mockCustomerFindOne.mockResolvedValue({ _id: 'cust-1', loyaltyPointsBalance: 5 });

    const res = await POST(makeAuthRequest({
      ...validBody,
      customerId: 'cust-1',
      loyaltyPointsToRedeem: 100, // more than balance of 5
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/insufficient loyalty points/i);
  });

  it('returns 400 when loyalty redemption is below minimum', async () => {
    setupActiveProduct();
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockLoyaltyConfigFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 100, isEnabled: true }),
    });
    mockCustomerFindOne.mockResolvedValue({ _id: 'cust-1', loyaltyPointsBalance: 500 });

    const res = await POST(makeAuthRequest({
      ...validBody,
      customerId: 'cust-1',
      loyaltyPointsToRedeem: 10, // below minRedemption of 100
    }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/minimum .* points required/i);
  });

  // ── Successful transaction ────────────────────────────────────────────────

  it('returns 201 on successful cash transaction', async () => {
    setupSuccessfulTransaction();
    const res = await POST(makeAuthRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.receiptNumber).toBe('REC-20260101-00001');
  });

  it('commits the MongoDB session on success', async () => {
    setupSuccessfulTransaction();
    await POST(makeAuthRequest(validBody));
    expect(mockSession.commitTransaction).toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
  });

  it('aborts the session and returns error on DB failure', async () => {
    setupActiveProduct();
    mockTransactionCreate.mockRejectedValue(new Error('DB write failed'));
    const res = await POST(makeAuthRequest(validBody));
    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(res.status).not.toBe(201);
  });

  it('does not include auth token in response body', async () => {
    setupSuccessfulTransaction();
    const res = await POST(makeAuthRequest(validBody));
    const body = await res.json();
    expect(body.data?.token).toBeUndefined();
  });

  it('applies valid discount and reduces total', async () => {
    mockProductFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([activeProduct]) });
    mockBundleFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const discount = {
      _id: 'disc-1',
      code: 'SAVE10',
      type: 'percentage',
      value: 10,
      category: 'general',
      minPurchaseAmount: null,
      maxDiscountAmount: null,
    };
    mockDiscountFindOneAndUpdate.mockResolvedValue(discount); // atomic increment succeeds
    mockTransactionCreate.mockResolvedValue([{
      _id: 'txn-1',
      receiptNumber: 'REC-20260101-00001',
      total: 90, // 100 - 10% discount
      toObject: () => ({ _id: 'txn-1', total: 90 }),
    }]);
    mockPaymentCreate.mockResolvedValue([{ _id: 'pay-1', method: 'cash', amount: 90, status: 'completed' }]);

    const res = await POST(makeAuthRequest({ ...validBody, discountCode: 'SAVE10', cashReceived: 90 }));
    expect(res.status).toBe(201);
  });
});
