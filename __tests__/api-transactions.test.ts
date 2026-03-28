/**
 * Section 5 — Transactions & Orders
 * Tests: 5.1 – 5.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted fixtures (available inside vi.mock factories) ──────────────────
const { mockSession } = vi.hoisted(() => {
  const mockSession = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
  };
  return { mockSession };
});

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('mongoose', () => {
  class MockObjectId {
    private _val: string;
    constructor(id?: string) { this._val = id ?? 'mock-id'; }
    toString() { return this._val; }
  }
  return {
    default: {
      startSession: vi.fn().mockResolvedValue(mockSession),
      Types: { ObjectId: MockObjectId },
    },
    Types: { ObjectId: MockObjectId },
  };
});

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
    TRANSACTION_CREATE: 'TRANSACTION_CREATE',
    TRANSACTION_REFUND: 'TRANSACTION_REFUND',
    TRANSACTION_CANCEL: 'TRANSACTION_CANCEL',
  },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'cashier' }),
  requireRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
  TenantAccessViolationError: class TenantAccessViolationError extends Error {
    tenantSlug: string;
    constructor(slug: string, msg: string) { super(msg); this.tenantSlug = slug; }
  },
  handleTenantAccessViolation: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 })
  ),
}));

vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn(),
  validateTransaction: vi.fn(),
}));

vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  checkFeatureAccess: vi.fn().mockRejectedValue(new Error('Feature not available')), // loyalty off by default
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/receipt', () => ({
  generateReceiptNumber: vi.fn().mockResolvedValue('RCP-001'),
}));

vi.mock('@/lib/tax-calculation', () => ({
  calculateTax: vi.fn().mockResolvedValue({
    taxAmount: 0,
    taxRate: 0,
    taxLabel: 'VAT',
    taxableAmount: 0,
    exemptAmount: 0,
  }),
}));

vi.mock('@/lib/stock', () => ({
  updateStock: vi.fn().mockResolvedValue(undefined),
  updateBundleStock: vi.fn().mockResolvedValue(undefined),
  getProductStock: vi.fn().mockResolvedValue(100),
}));

vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/models/Payment', () => ({
  default: { create: vi.fn() },
}));
vi.mock('@/models/ProductBundle', () => ({
  default: { find: vi.fn() },
}));
vi.mock('@/models/Discount', () => ({
  default: { findOneAndUpdate: vi.fn(), findOne: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('@/models/StockMovement', () => ({
  default: { updateOne: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/models/Customer', () => ({
  default: { findOne: vi.fn(), updateOne: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/models/LoyaltyConfig', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/LoyaltyTransaction', () => ({
  default: { create: vi.fn().mockResolvedValue([{}]) },
}));
vi.mock('@/models/Expense', () => ({
  default: { aggregate: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireRole, requireAuth } from '@/lib/auth';
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { validateAndSanitize } from '@/lib/validation';
import { checkSubscriptionLimit, checkFeatureAccess, SubscriptionService } from '@/lib/subscription';
import { calculateTax } from '@/lib/tax-calculation';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import ProductBundle from '@/models/ProductBundle';
import Discount from '@/models/Discount';
import Customer from '@/models/Customer';
import LoyaltyConfig from '@/models/LoyaltyConfig';
import Expense from '@/models/Expense';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const PRODUCT_ID = 'prod_abc';
const TXN_ID = 'txn_abc';

const mockTenantUser = {
  userId: 'user1',
  tenantId: TENANT_ID,
  email: 'cashier@demo.com',
  role: 'cashier',
};

// Product with trackInventory:false — skips stock update in session loop
const mockProduct = {
  _id: PRODUCT_ID,
  name: 'Test Product',
  price: 100,
  stock: 20,
  tenantId: TENANT_ID,
  isActive: true,
  trackInventory: false,
  allowOutOfStockSales: true,
  taxExempt: false,
};

const mockTransaction = {
  _id: TXN_ID,
  tenantId: TENANT_ID,
  receiptNumber: 'RCP-001',
  items: [{ product: PRODUCT_ID, name: 'Test Product', price: 100, quantity: 2, subtotal: 200 }],
  subtotal: 200,
  total: 200,
  paymentMethod: 'cash',
  status: 'completed',
  toObject: vi.fn().mockReturnValue({
    _id: TXN_ID,
    receiptNumber: 'RCP-001',
    total: 200,
    status: 'completed',
  }),
};

// Request helpers
function req(method: string, url: string, body?: object, token = 'Bearer valid-token'): NextRequest {
  const init: RequestInit = { method, headers: { authorization: token } };
  if (body) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

// ── 5.5  GET /api/transactions ─────────────────────────────────────────────
describe('GET /api/transactions — paginated list filtered by tenant (5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: mockTenantUser });
    vi.mocked(Transaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockTransaction]),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(25 as any);
  });

  it('returns paginated transaction list for tenant', async () => {
    const { GET } = await import('@/app/api/transactions/route');
    const res = await GET(req('GET', '/api/transactions?limit=10&page=1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(25);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(10);
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('caps limit at 200', async () => {
    const { GET } = await import('@/app/api/transactions/route');
    // Pass limit=500; should be capped at 200
    const res = await GET(req('GET', '/api/transactions?limit=500'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pagination.limit).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { GET } = await import('@/app/api/transactions/route');
    const res = await GET(req('GET', '/api/transactions', undefined, ''));

    expect(res.status).toBe(401);
  });
});

// ── 5.1 / 5.2 / 5.3 / 5.4  POST /api/transactions ────────────────────────
describe('POST /api/transactions (5.1–5.4)', () => {
  const validBody = {
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    paymentMethod: 'cash',
    cashReceived: 200,
  };

  const setupBasicMocks = () => {
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: mockTenantUser });
    vi.mocked(validateAndSanitize).mockReturnValue({
      data: validBody,
      errors: [],
    });
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available')); // loyalty off
    vi.mocked(Transaction.countDocuments).mockResolvedValue(5 as any);
    vi.mocked(SubscriptionService.updateUsage).mockResolvedValue(undefined);
    // Reset calculateTax to zero so it never makes cashReceived insufficient
    vi.mocked(calculateTax).mockResolvedValue({
      taxAmount: 0, taxRate: 0, taxLabel: 'VAT', taxableAmount: 0, exemptAmount: 0,
    });

    // Batch-load: Product.find().lean() → [mockProduct]
    vi.mocked(Product.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([mockProduct]),
    } as any);
    // Bundle batch-load: ProductBundle.find().lean() → []
    vi.mocked(ProductBundle.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    // Session loop: Product.findOne().session() → trackInventory:false (skip updateStock)
    vi.mocked(Product.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ ...mockProduct, trackInventory: false }),
    } as any);

    vi.mocked(Transaction.create).mockResolvedValue([mockTransaction] as any);
    vi.mocked(Payment.create).mockResolvedValue([{ _id: 'pay1', method: 'cash', amount: 200, status: 'completed' }] as any);
    vi.mocked(Transaction.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupBasicMocks();
  });

  // 5.1 — basic creation
  it('creates transaction with line items and payment (201)', async () => {
    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(Transaction.create)).toHaveBeenCalled();
    expect(vi.mocked(Payment.create)).toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', validBody, ''));

    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, resetAfterMs: 60000 });

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', validBody));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked(validateAndSanitize).mockReturnValue({
      data: {},
      errors: [{ field: 'items', message: 'Items are required', code: 'required' }],
    });

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', {}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errors).toBeDefined();
  });

  it('returns 404 when product not found in items', async () => {
    // Batch-load returns empty → productMap has no entry for PRODUCT_ID
    vi.mocked(Product.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as any);

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', validBody));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  // 5.2 — tax calculation
  it('applies tax calculation to the transaction total', async () => {
    vi.mocked(calculateTax).mockResolvedValue({
      taxAmount: 24,
      taxRate: 12,
      taxLabel: 'VAT',
      taxableAmount: 200,
      exemptAmount: 0,
    });
    // cashReceived must cover subtotal(200) + tax(24) = 224
    const bodyWithTax = { ...validBody, cashReceived: 300 };
    vi.mocked(validateAndSanitize).mockReturnValue({ data: bodyWithTax, errors: [] });

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', bodyWithTax));

    expect(res.status).toBe(201);
    expect(vi.mocked(calculateTax)).toHaveBeenCalled();
  });

  // 5.3 — discount code
  it('applies a valid percentage discount code', async () => {
    const bodyWithDiscount = { ...validBody, discountCode: 'SAVE10' };
    vi.mocked(validateAndSanitize).mockReturnValue({ data: bodyWithDiscount, errors: [] });

    const mockDiscount = {
      _id: 'disc1',
      code: 'SAVE10',
      type: 'percentage',
      value: 10,
      isActive: true,
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000),
      usageCount: 0,
      minPurchaseAmount: 0,
    };
    vi.mocked(Discount.findOneAndUpdate).mockResolvedValue(mockDiscount as any);

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', bodyWithDiscount));

    expect(res.status).toBe(201);
    expect(vi.mocked(Discount.findOneAndUpdate)).toHaveBeenCalled();
  });

  it('returns 400 for invalid discount code', async () => {
    const bodyWithBadDiscount = { ...validBody, discountCode: 'BADCODE' };
    vi.mocked(validateAndSanitize).mockReturnValue({ data: bodyWithBadDiscount, errors: [] });

    vi.mocked(Discount.findOneAndUpdate).mockResolvedValue(null as any);
    vi.mocked(Discount.findOne).mockResolvedValue(null as any);

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', bodyWithBadDiscount));
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid|discount/i);
  });

  // 5.4 — loyalty points
  it('earns loyalty points for customer when loyalty is enabled', async () => {
    const bodyWithCustomer = { ...validBody, customerId: 'cust1' };
    vi.mocked(validateAndSanitize).mockReturnValue({ data: validBody, errors: [] });

    // Enable loyalty feature
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);

    const mockLoyaltyConfig = {
      pointsPerPeso: 1,
      pesoPerPoint: 0.1,
      minRedemption: 100,
      isEnabled: true,
    };
    vi.mocked(LoyaltyConfig.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockLoyaltyConfig),
    } as any);

    const mockCustomer = {
      _id: 'cust1',
      tenantId: TENANT_ID,
      loyaltyPointsBalance: 500,
    };
    vi.mocked(Customer.findOne).mockResolvedValue(mockCustomer as any);

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', bodyWithCustomer));

    expect(res.status).toBe(201);
    // Loyalty is enabled and customer found — LoyaltyTransaction.create should be called for earn
    const { default: LoyaltyTransaction } = await import('@/models/LoyaltyTransaction');
    expect(vi.mocked(LoyaltyTransaction.create)).toHaveBeenCalled();
  });
});

// ── 5.6  GET /api/transactions/[id] ───────────────────────────────────────
describe('GET /api/transactions/[id] — returns correct transaction (5.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: mockTenantUser });
    vi.mocked(Transaction.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockTransaction),
        }),
      }),
    } as any);
  });

  it('returns transaction for authenticated user', async () => {
    const { GET } = await import('@/app/api/transactions/[id]/route');
    const res = await GET(req('GET', `/api/transactions/${TXN_ID}`), idParams(TXN_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(Transaction.findOne)).toHaveBeenCalledWith(
      expect.objectContaining({ _id: TXN_ID, tenantId: TENANT_ID })
    );
  });

  it('returns 404 for unknown transaction', async () => {
    vi.mocked(Transaction.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      }),
    } as any);

    const { GET } = await import('@/app/api/transactions/[id]/route');
    const res = await GET(req('GET', '/api/transactions/ghost'), idParams('ghost'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { GET } = await import('@/app/api/transactions/[id]/route');
    const res = await GET(req('GET', `/api/transactions/${TXN_ID}`, undefined, ''), idParams(TXN_ID));

    expect(res.status).toBe(401);
  });
});

// ── 5.7  PUT /api/transactions/[id] ───────────────────────────────────────
describe('PUT /api/transactions/[id] — updates transaction (5.7)', () => {
  const makeTxnDoc = (status = 'completed') => ({
    _id: TXN_ID,
    tenantId: TENANT_ID,
    status,
    items: [{ product: PRODUCT_ID, quantity: 2, subtotal: 200 }],
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn().mockReturnValue({ _id: TXN_ID, status }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: mockTenantUser });
    vi.mocked(requireRole).mockResolvedValue(undefined);
  });

  it('voids (cancels) a completed transaction', async () => {
    const txnDoc = makeTxnDoc('completed');
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { status: 'cancelled' }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(txnDoc.save).toHaveBeenCalled();
    expect(txnDoc.status).toBe('cancelled');
  });

  it('refunds a completed transaction and restores stock', async () => {
    const txnDoc = makeTxnDoc('completed');
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);
    vi.mocked(Product.findOne).mockResolvedValue({ ...mockProduct, trackInventory: true } as any);

    const { updateStock } = await import('@/lib/stock');
    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { status: 'refunded' }),
      idParams(TXN_ID)
    );

    expect(res.status).toBe(200);
    expect(txnDoc.status).toBe('refunded');
    expect(vi.mocked(updateStock)).toHaveBeenCalledWith(
      PRODUCT_ID,
      TENANT_ID,
      2, // positive — restoring stock
      'return',
      expect.any(Object)
    );
  });

  it('returns 400 when modifying a completed transaction other than void/refund', async () => {
    const txnDoc = makeTxnDoc('completed');
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { notes: 'update notes' }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/immutable|cannot be modified/i);
  });

  it('returns 400 when modifying an already-refunded transaction', async () => {
    const txnDoc = makeTxnDoc('refunded');
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { status: 'cancelled' }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 404 for unknown transaction', async () => {
    vi.mocked(Transaction.findOne).mockResolvedValue(null as any);

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', '/api/transactions/ghost', { status: 'cancelled' }),
      idParams('ghost')
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { status: 'cancelled' }, ''),
      idParams(TXN_ID)
    );

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is insufficient', async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const res = await PUT(
      req('PUT', `/api/transactions/${TXN_ID}`, { status: 'cancelled' }),
      idParams(TXN_ID)
    );

    expect(res.status).toBe(403);
  });
});

// ── 5.8  GET /api/transactions/stats ──────────────────────────────────────
describe('GET /api/transactions/stats — aggregated stats (5.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);

    // 3 aggregate calls on Transaction: summary, paymentMethod, timeSeries
    vi.mocked(Transaction.aggregate)
      .mockResolvedValueOnce([{ totalSales: 5000, totalTransactions: 30, averageTransaction: 166.67 }] as any)
      .mockResolvedValueOnce([{ _id: 'cash', total: 3000, count: 20 }, { _id: 'card', total: 2000, count: 10 }] as any)
      .mockResolvedValueOnce([{ _id: 14, sales: 2500, transactions: 15 }] as any);

    vi.mocked(Expense.aggregate).mockResolvedValue([
      { totalExpenses: 800, expenseCount: 5 },
    ] as any);
  });

  it('returns aggregated sales stats with payment method breakdown', async () => {
    const { GET } = await import('@/app/api/transactions/stats/route');
    const res = await GET(req('GET', '/api/transactions/stats?period=today'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalSales).toBe(5000);
    expect(body.data.totalTransactions).toBe(30);
    expect(body.data.averageTransaction).toBeCloseTo(166.67);
    expect(body.data.paymentMethods).toHaveLength(2);
    expect(body.data.chartData).toBeDefined();
  });

  it('includes expense stats for the same period', async () => {
    const { GET } = await import('@/app/api/transactions/stats/route');
    const res = await GET(req('GET', '/api/transactions/stats'));
    const body = await res.json();

    expect(body.data.totalExpenses).toBe(800);
    expect(body.data.expenseCount).toBe(5);
  });

  it('returns zeros when no transactions exist', async () => {
    // Reset the queue so beforeEach values don't get consumed first
    vi.mocked(Transaction.aggregate).mockReset();
    vi.mocked(Transaction.aggregate)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(Expense.aggregate).mockResolvedValue([] as any);

    const { GET } = await import('@/app/api/transactions/stats/route');
    const res = await GET(req('GET', '/api/transactions/stats'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.totalSales).toBe(0);
    expect(body.data.totalTransactions).toBe(0);
  });

  it('returns 404 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);

    const { GET } = await import('@/app/api/transactions/stats/route');
    const res = await GET(req('GET', '/api/transactions/stats'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});
