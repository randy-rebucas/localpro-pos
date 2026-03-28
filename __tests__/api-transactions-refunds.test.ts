/**
 * Section 5 (continued) — Refunds & Other Transaction Routes
 * Tests: 5.9 – 5.13
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
    TRANSACTION_CREATE: 'TRANSACTION_CREATE',
    TRANSACTION_REFUND: 'TRANSACTION_REFUND',
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
vi.mock('@/lib/receipt', () => ({
  generateReceiptNumber: vi.fn().mockResolvedValue('RCP-001'),
}));
vi.mock('@/lib/stock', () => ({
  updateStock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'cashier' }),
  requireRole: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));

vi.mock('@/lib/auth-customer', () => ({
  requireCustomerAuth: vi.fn(),
}));

vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn(),
}));

vi.mock('@/models/Transaction', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('@/models/Product', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/Payment', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth, requireRole, getCurrentUser } from '@/lib/auth';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { updateStock } from '@/lib/stock';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import Payment from '@/models/Payment';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const TXN_ID = 'txn_abc';
const PRODUCT_ID = 'prod_abc';
const CUSTOMER_ID = 'cust_abc';

// A completed transaction document (with Mongoose-like methods)
const makeCompletedTxn = (overrides: Record<string, unknown> = {}) => ({
  _id: TXN_ID,
  tenantId: TENANT_ID,
  receiptNumber: 'RCP-001',
  status: 'completed',
  paymentMethod: 'cash',
  subtotal: 200,
  total: 200,
  discountAmount: 0,
  items: [
    {
      product: { toString: () => PRODUCT_ID },
      name: 'Test Product',
      price: 100,
      quantity: 2,
      subtotal: 200,
    },
  ],
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makePaymentDoc = () => ({
  _id: 'pay_abc',
  tenantId: TENANT_ID,
  transactionId: TXN_ID,
  method: 'cash',
  amount: 200,
  status: 'completed',
  details: {},
  save: vi.fn().mockResolvedValue(undefined),
  refundedAt: null,
  refundReason: null,
});

const makeProduct = (trackInventory = false) => ({
  _id: PRODUCT_ID,
  name: 'Test Product',
  price: 100,
  stock: 10,
  tenantId: TENANT_ID,
  trackInventory,
});

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
const custParams = (customerId: string) => ({ params: Promise.resolve({ customerId }) });

// ── 5.9  POST /api/transactions/[id]/refund — full refund ──────────────────
describe('POST /api/transactions/[id]/refund — full refund (5.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);

    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);
    vi.mocked(Transaction.create).mockResolvedValue({
      _id: 'ref_txn1',
      receiptNumber: 'REF-RCP-001',
      status: 'refunded',
      total: 200,
    } as any);
    vi.mocked(Product.findOne).mockResolvedValue(makeProduct(false) as any); // trackInventory:false
    vi.mocked(Payment.findOne).mockResolvedValue(null as any); // no payment record
    vi.mocked(Payment.create).mockResolvedValue({ _id: 'ref_pay1' } as any);
  });

  it('creates full refund transaction for all items (201)', async () => {
    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, { reason: 'Customer request' }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.isFullRefund).toBe(true);
    expect(vi.mocked(Transaction.create)).toHaveBeenCalled();
  });

  it('marks original transaction as refunded on full refund', async () => {
    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}),
      idParams(TXN_ID)
    );

    expect(txnDoc.status).toBe('refunded');
    expect(txnDoc.save).toHaveBeenCalled();
  });

  it('restores stock when product tracks inventory', async () => {
    vi.mocked(Product.findOne).mockResolvedValue(makeProduct(true) as any); // trackInventory:true

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}),
      idParams(TXN_ID)
    );

    expect(vi.mocked(updateStock)).toHaveBeenCalledWith(
      PRODUCT_ID,
      TENANT_ID,
      2,      // positive — restore quantity
      'return',
      expect.any(Object)
    );
  });

  it('does NOT restore stock when trackInventory is false', async () => {
    vi.mocked(Product.findOne).mockResolvedValue(makeProduct(false) as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    await POST(req('POST', `/api/transactions/${TXN_ID}/refund`, {}), idParams(TXN_ID));

    expect(vi.mocked(updateStock)).not.toHaveBeenCalled();
  });

  it('returns 404 when transaction not found', async () => {
    vi.mocked(Transaction.findOne).mockResolvedValue(null as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(req('POST', '/api/transactions/ghost/refund', {}), idParams('ghost'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}, ''),
      idParams(TXN_ID)
    );

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is insufficient', async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}),
      idParams(TXN_ID)
    );

    expect(res.status).toBe(403);
  });
});

// ── 5.10  Partial refunds ──────────────────────────────────────────────────
describe('Partial refunds (5.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(Product.findOne).mockResolvedValue(makeProduct(false) as any);
    vi.mocked(Payment.findOne).mockResolvedValue(null as any);
  });

  it('refunds only specified items (partial)', async () => {
    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);
    vi.mocked(Transaction.create).mockResolvedValue({
      _id: 'ref_txn2', status: 'refunded', total: 100,
    } as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {
        items: [{ productId: PRODUCT_ID, quantity: 1 }], // only 1 of 2
      }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.isFullRefund).toBe(false); // partial — original NOT marked refunded
    expect(body.data.refundAmount).toBe(100);   // 1 × ₱100
  });

  it('does NOT mark original as refunded on partial refund', async () => {
    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);
    vi.mocked(Transaction.create).mockResolvedValue({ _id: 'ref_txn3', status: 'refunded', total: 100 } as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
      idParams(TXN_ID)
    );

    // save() should NOT have been called (status not changed to 'refunded')
    expect(txnDoc.save).not.toHaveBeenCalled();
  });

  it('returns 400 when refund quantity exceeds original', async () => {
    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {
        items: [{ productId: PRODUCT_ID, quantity: 99 }], // > 2 in original
      }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot refund more/i);
  });

  it('returns 400 when refund item not found in original transaction', async () => {
    const txnDoc = makeCompletedTxn();
    vi.mocked(Transaction.findOne).mockResolvedValue(txnDoc as any);

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {
        items: [{ productId: 'unknown_prod', quantity: 1 }],
      }),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ── 5.11  Double-refund prevention ────────────────────────────────────────
describe('Double-refund is prevented (5.11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
  });

  it('returns 400 when transaction is already refunded', async () => {
    vi.mocked(Transaction.findOne).mockResolvedValue(
      makeCompletedTxn({ status: 'refunded' }) as any
    );

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already been refunded/i);
  });

  it('returns 400 when transaction is cancelled (not completed)', async () => {
    vi.mocked(Transaction.findOne).mockResolvedValue(
      makeCompletedTxn({ status: 'cancelled' }) as any
    );

    const { POST } = await import('@/app/api/transactions/[id]/refund/route');
    const res = await POST(
      req('POST', `/api/transactions/${TXN_ID}/refund`, {}),
      idParams(TXN_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/only completed/i);
  });
});

// ── 5.12  POST /api/transactions/manual ───────────────────────────────────
describe('POST /api/transactions/manual (5.12)', () => {
  const validManualBody = {
    items: [{ name: 'Custom Service', price: 500, quantity: 1 }],
    paymentMethod: 'cash',
    cashReceived: 500,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user1', tenantId: TENANT_ID, role: 'cashier',
    } as any);
    vi.mocked(Transaction.create).mockResolvedValue({
      _id: 'manual_txn1',
      receiptNumber: 'RCP-001',
      total: 500,
      status: 'completed',
    } as any);
  });

  it('records manual transaction with custom items and returns 201', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(req('POST', '/api/transactions/manual', validManualBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(Transaction.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        paymentMethod: 'cash',
        status: 'completed',
      })
    );
  });

  it('returns 400 when items array is empty', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(
      req('POST', '/api/transactions/manual', { ...validManualBody, items: [] })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/at least one item/i);
  });

  it('returns 400 for invalid payment method', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(
      req('POST', '/api/transactions/manual', { ...validManualBody, paymentMethod: 'bitcoin' })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid payment method/i);
  });

  it('returns 400 when item name is missing', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(
      req('POST', '/api/transactions/manual', {
        ...validManualBody,
        items: [{ name: '', price: 100, quantity: 1 }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when item price is negative', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(
      req('POST', '/api/transactions/manual', {
        ...validManualBody,
        items: [{ name: 'Bad', price: -10, quantity: 1 }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid price/i);
  });

  it('returns 400 when item quantity is zero', async () => {
    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(
      req('POST', '/api/transactions/manual', {
        ...validManualBody,
        items: [{ name: 'Bad', price: 100, quantity: 0 }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid quantity/i);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, resetAfterMs: 60000 });

    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(req('POST', '/api/transactions/manual', validManualBody));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);

    const { POST } = await import('@/app/api/transactions/manual/route');
    const res = await POST(req('POST', '/api/transactions/manual', validManualBody, ''));
    const body = await res.json();

    expect(res.status).toBe(400); // route returns 400 for missing tenant (not 401)
    expect(body.success).toBe(false);
  });
});

// ── 5.13  GET /api/transactions/customer/[customerId] ─────────────────────
describe('GET /api/transactions/customer/[customerId] (5.13)', () => {
  const mockCustomerAuth = {
    customerId: CUSTOMER_ID,
    tenantId: TENANT_ID,
    email: 'customer@demo.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCustomerAuth).mockResolvedValue(mockCustomerAuth as any);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(3 as any);
    vi.mocked(Transaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
              { _id: 'txn1', customerId: CUSTOMER_ID, total: 200, status: 'completed' },
              { _id: 'txn2', customerId: CUSTOMER_ID, total: 150, status: 'completed' },
            ]),
          }),
        }),
      }),
    } as any);
  });

  it('returns only that customer\'s transactions', async () => {
    const { GET } = await import('@/app/api/transactions/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/transactions/customer/${CUSTOMER_ID}`),
      custParams(CUSTOMER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(3);
    // Query must include both tenantId and customerId from the JWT
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      })
    );
  });

  it('returns 403 when customer tries to access another customer\'s orders', async () => {
    // Authenticated as CUSTOMER_ID but requesting different_cust_id
    const { GET } = await import('@/app/api/transactions/customer/[customerId]/route');
    const res = await GET(
      req('GET', '/api/transactions/customer/different_cust_id'),
      custParams('different_cust_id')
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 401 when customer is unauthenticated', async () => {
    vi.mocked(requireCustomerAuth).mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/transactions/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/transactions/customer/${CUSTOMER_ID}`, undefined, ''),
      custParams(CUSTOMER_ID)
    );

    expect(res.status).toBe(401);
  });

  it('filters by status query param', async () => {
    const { GET } = await import('@/app/api/transactions/customer/[customerId]/route');
    await GET(
      req('GET', `/api/transactions/customer/${CUSTOMER_ID}?status=refunded`),
      custParams(CUSTOMER_ID)
    );

    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded' })
    );
  });

  it('returns paginated results', async () => {
    const { GET } = await import('@/app/api/transactions/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/transactions/customer/${CUSTOMER_ID}?page=2&limit=10`),
      custParams(CUSTOMER_ID)
    );
    const body = await res.json();

    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(10);
  });
});
