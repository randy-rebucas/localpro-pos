process.env.JWT_SECRET = 'test-secret-32chars-txpay1234!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockTransactionFind,
  mockTransactionFindOne,
  mockTransactionCountDocuments,
  mockTransactionAggregate,
  mockPaymentFind,
  mockPaymentFindOne,
  mockPaymentCreate,
  mockPaymentCountDocuments,
  mockExpenseAggregate,
  mockProductFindOne,
  mockGetCurrentUser,
  mockRequireRole,
  mockRequireTenantAccess,
  mockRequireCustomerAuth,
  mockUpdateStock,
  mockSession,
} = vi.hoisted(() => {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
  };
  return {
    mockTransactionFind: vi.fn(),
    mockTransactionFindOne: vi.fn(),
    mockTransactionCountDocuments: vi.fn().mockResolvedValue(5),
    mockTransactionAggregate: vi.fn(),
    mockPaymentFind: vi.fn(),
    mockPaymentFindOne: vi.fn(),
    mockPaymentCreate: vi.fn(),
    mockPaymentCountDocuments: vi.fn().mockResolvedValue(3),
    mockExpenseAggregate: vi.fn(),
    mockProductFindOne: vi.fn(),
    mockGetCurrentUser: vi.fn(),
    mockRequireRole: vi.fn().mockResolvedValue(undefined),
    mockRequireTenantAccess: vi.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    }),
    mockRequireCustomerAuth: vi.fn(),
    mockUpdateStock: vi.fn().mockResolvedValue(undefined),
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
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    TRANSACTION_CREATE: 'TRANSACTION_CREATE',
    TRANSACTION_REFUND: 'TRANSACTION_REFUND',
    TRANSACTION_CANCEL: 'TRANSACTION_CANCEL',
    PAYMENT_CREATE: 'PAYMENT_CREATE',
    PAYMENT_REFUND: 'PAYMENT_REFUND',
  },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 59, resetAt: 0 }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: mockRequireTenantAccess,
  TenantAccessViolationError: class TenantAccessViolationError extends Error {},
  handleTenantAccessViolation: vi.fn(),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentUser: mockGetCurrentUser,
    requireRole: mockRequireRole,
  };
});
vi.mock('@/lib/auth-customer', () => ({
  requireCustomerAuth: mockRequireCustomerAuth,
}));
vi.mock('@/lib/stock', () => ({
  updateStock: mockUpdateStock,
  updateBundleStock: vi.fn().mockResolvedValue(undefined),
  getProductStock: vi.fn().mockResolvedValue(100),
}));
vi.mock('@/lib/webhooks', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/receipt', () => ({
  generateReceiptNumber: vi.fn().mockResolvedValue('REC-20240101-00001'),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  checkFeatureAccess: vi.fn().mockRejectedValue(new Error('Feature not available')),
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue(null),
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
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockReturnValue({
    data: {
      items: [{ productId: 'prod-1', quantity: 1 }],
      paymentMethod: 'cash',
      cashReceived: 10,
    },
    errors: [],
  }),
  validateTransaction: vi.fn(),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Transaction', () => ({
  default: {
    find: mockTransactionFind,
    findOne: mockTransactionFindOne,
    countDocuments: mockTransactionCountDocuments,
    aggregate: mockTransactionAggregate,
    create: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('@/models/Payment', () => ({
  default: {
    find: mockPaymentFind,
    findOne: mockPaymentFindOne,
    create: mockPaymentCreate,
    countDocuments: mockPaymentCountDocuments,
  },
}));
vi.mock('@/models/Product', () => ({
  default: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    findOne: mockProductFindOne,
  },
}));
vi.mock('@/models/ProductBundle', () => ({
  default: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));
vi.mock('@/models/Discount', () => ({
  default: { findOneAndUpdate: vi.fn(), findOne: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('@/models/Customer', () => ({
  default: { findOne: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue(null) }), updateOne: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/models/LoyaltyConfig', () => ({
  default: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock('@/models/LoyaltyTransaction', () => ({
  default: { create: vi.fn().mockResolvedValue([{}]) },
}));
vi.mock('@/models/Table', () => ({
  default: { findOneAndUpdate: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/models/StockMovement', () => ({
  default: { updateOne: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/models/Expense', () => ({
  default: { aggregate: mockExpenseAggregate },
}));
vi.mock('mongoose', () => {
  class MockObjectId {
    id: string;
    constructor(id: string) { this.id = id; }
    toString() { return this.id; }
  }
  return {
    default: {
      startSession: vi.fn().mockResolvedValue(mockSession),
      Types: { ObjectId: MockObjectId },
    },
    Types: { ObjectId: MockObjectId },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const TX_ID = 'tx-1';
const TX_URL = `http://localhost/api/transactions/${TX_ID}`;
const PAYMENT_ID = 'pay-1';

const mockTransaction = {
  _id: TX_ID,
  receiptNumber: 'REC-001',
  tenantId: 'tenant-1',
  total: 100,
  subtotal: 100,
  discountAmount: 0,
  status: 'completed',
  paymentMethod: 'cash',
  items: [
    { product: 'prod-1', name: 'Widget', price: 10, quantity: 2, subtotal: 20 },
  ],
  toObject: vi.fn().mockReturnThis(),
  save: vi.fn().mockResolvedValue(undefined),
};

// ===========================================================================
// GET /api/transactions
// ===========================================================================

describe('GET /api/transactions', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockTransaction]),
    });
    mockTransactionCountDocuments.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/transactions/route'));
  });

  it('returns 200 with transaction list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty array when no transactions', async () => {
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockTransactionCountDocuments.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when forbidden', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Forbidden: insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/transactions/[id]
// ===========================================================================

describe('GET /api/transactions/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: TX_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockTransactionFindOne.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockTransaction),
    });
    ({ GET } = await import('@/app/api/transactions/[id]/route'));
  });

  it('returns 200 with transaction data', async () => {
    const res = await GET(makeRequest('GET', TX_URL), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.receiptNumber).toBe('REC-001');
  });

  it('returns 404 when transaction not found', async () => {
    mockTransactionFindOne.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(makeRequest('GET', TX_URL), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/transaction not found/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', TX_URL), mockParams);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// PUT /api/transactions/[id]  (void / status update)
// ===========================================================================

describe('PUT /api/transactions/[id]', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: TX_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockRequireRole.mockResolvedValue(undefined);
    // Fresh object each test — route mutates status
    mockTransactionFindOne.mockResolvedValue({ ...mockTransaction, save: vi.fn().mockResolvedValue(undefined) });
    mockProductFindOne.mockResolvedValue({ _id: 'prod-1', tenantId: 'tenant-1', trackInventory: false });
    ({ PUT } = await import('@/app/api/transactions/[id]/route'));
  });

  it('returns 200 on successful void (cancelled)', async () => {
    const res = await PUT(makeRequest('PUT', TX_URL, { status: 'cancelled' }), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 200 on refund status update', async () => {
    const res = await PUT(makeRequest('PUT', TX_URL, { status: 'refunded' }), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when transaction not found', async () => {
    mockTransactionFindOne.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', TX_URL, { status: 'cancelled' }), mockParams);
    expect(res.status).toBe(404);
  });

  it('returns 400 when transaction is already cancelled', async () => {
    mockTransactionFindOne.mockResolvedValue({ ...mockTransaction, status: 'cancelled', save: vi.fn() });
    const res = await PUT(makeRequest('PUT', TX_URL, { status: 'cancelled' }), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/voided or refunded/i);
  });

  it('returns 400 when completed transaction receives non-status update', async () => {
    const res = await PUT(makeRequest('PUT', TX_URL, { notes: 'extra note' }), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be modified/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await PUT(makeRequest('PUT', TX_URL, {}), mockParams);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/transactions/[id]/refund
// ===========================================================================

describe('POST /api/transactions/[id]/refund', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: TX_ID }) };

  const createdRefundTx = {
    _id: 'refund-tx-1',
    receiptNumber: 'REF-REC-001',
    total: 20,
    status: 'refunded',
  };

  function makeTx(overrides = {}) {
    return {
      ...mockTransaction,
      save: vi.fn().mockResolvedValue(undefined),
      items: [{ product: { toString: () => 'prod-1' }, name: 'Widget', price: 10, quantity: 2, subtotal: 20 }],
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    // Fresh transaction object each test — route mutates .status
    mockTransactionFindOne.mockResolvedValue(makeTx());
    mockProductFindOne.mockResolvedValue({ _id: 'prod-1', tenantId: 'tenant-1', trackInventory: false });
    mockGetCurrentUser.mockResolvedValue(adminUser);
    const { default: Transaction } = await import('@/models/Transaction');
    vi.mocked(Transaction.create).mockResolvedValue(createdRefundTx as any);
    mockPaymentFindOne.mockResolvedValue(null);
    ({ POST } = await import('@/app/api/transactions/[id]/refund/route'));
  });

  it('returns 201 on successful full refund', async () => {
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, { reason: 'Customer request' }), mockParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.refundTransaction._id).toBe('refund-tx-1');
    expect(body.data.isFullRefund).toBe(true);
  });

  it('returns 400 when transaction is already refunded', async () => {
    mockTransactionFindOne.mockResolvedValue(makeTx({ status: 'refunded' }));
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {}), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already been refunded/i);
  });

  it('returns 400 when transaction is not completed', async () => {
    mockTransactionFindOne.mockResolvedValue(makeTx({ status: 'pending' }));
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {}), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only completed transactions/i);
  });

  it('returns 404 when transaction not found', async () => {
    mockTransactionFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {}), mockParams);
    expect(res.status).toBe(404);
  });

  it('returns 400 when refund item not in transaction', async () => {
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {
      items: [{ productId: 'non-existent-prod', quantity: 1 }],
    }), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found in transaction/i);
  });

  it('returns 400 when refund quantity exceeds purchased', async () => {
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {
      items: [{ productId: 'prod-1', quantity: 99 }],
    }), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot refund more/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', `${TX_URL}/refund`, {}), mockParams);
    expect(res.status).toBe(401);
  });

  it('restores stock for tracked items', async () => {
    mockProductFindOne.mockResolvedValue({ _id: 'prod-1', tenantId: 'tenant-1', trackInventory: true });
    await POST(makeRequest('POST', `${TX_URL}/refund`, {}), mockParams);
    expect(mockUpdateStock).toHaveBeenCalledWith(
      expect.any(String), 'tenant-1', expect.any(Number), 'return', expect.any(Object)
    );
  });
});

// ===========================================================================
// GET /api/transactions/stats
// ===========================================================================

describe('GET /api/transactions/stats', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    ({ GET } = await import('@/app/api/transactions/stats/route'));
  });

  function setupAggregates(
    stats = [{ _id: null, totalSales: 5000, totalTransactions: 50, averageTransaction: 100 }],
    pm = [{ _id: 'cash', total: 3000, count: 30 }, { _id: 'card', total: 2000, count: 20 }],
    ts: unknown[] = [],
    expenses = [{ _id: null, totalExpenses: 200, expenseCount: 5 }]
  ) {
    mockTransactionAggregate
      .mockResolvedValueOnce(stats)
      .mockResolvedValueOnce(pm)
      .mockResolvedValueOnce(ts);
    mockExpenseAggregate.mockResolvedValue(expenses);
  }

  it('returns 200 with transaction statistics', async () => {
    setupAggregates();
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions/stats'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalSales).toBe(5000);
    expect(body.data.totalTransactions).toBe(50);
    expect(body.data.totalExpenses).toBe(200);
    expect(body.data.paymentMethods).toHaveLength(2);
  });

  it('returns zeros when no transactions', async () => {
    setupAggregates([], [], [], []);
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions/stats'));
    const body = await res.json();
    expect(body.data.totalSales).toBe(0);
    expect(body.data.totalTransactions).toBe(0);
    expect(body.data.totalExpenses).toBe(0);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions/stats'));
    expect(res.status).toBe(404);
  });

  it('accepts period=week query param', async () => {
    setupAggregates();
    const res = await GET(makeRequest('GET', 'http://localhost/api/transactions/stats?period=week'));
    expect(res.status).toBe(200);
    expect(mockTransactionAggregate).toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/transactions/customer/[customerId]
// ===========================================================================

describe('GET /api/transactions/customer/[customerId]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) => Promise<Response>;
  const CUSTOMER_ID = 'cust-1';
  const mockParams = { params: Promise.resolve({ customerId: CUSTOMER_ID }) };
  const mockCustomer = { customerId: CUSTOMER_ID, tenantId: 'tenant-1', email: 'c@test.com', phone: '555' };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireCustomerAuth.mockResolvedValue(mockCustomer);
    mockTransactionCountDocuments.mockResolvedValue(2);
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockTransaction]),
    });
    ({ GET } = await import('@/app/api/transactions/customer/[customerId]/route'));
  });

  it('returns 200 with customer transactions and pagination', async () => {
    const res = await GET(
      makeRequest('GET', `http://localhost/api/transactions/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(2);
  });

  it('returns 401 when customer not authenticated', async () => {
    mockRequireCustomerAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(
      makeRequest('GET', `http://localhost/api/transactions/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessing another customer\'s transactions', async () => {
    mockRequireCustomerAuth.mockResolvedValue({ ...mockCustomer, customerId: 'other-cust' });
    const res = await GET(
      makeRequest('GET', `http://localhost/api/transactions/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid date params', async () => {
    const res = await GET(
      makeRequest('GET', `http://localhost/api/transactions/customer/${CUSTOMER_ID}?startDate=not-a-date`),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid startdate/i);
  });
});

// ===========================================================================
// GET /api/payments
// ===========================================================================

describe('GET /api/payments', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockPayment = {
    _id: PAYMENT_ID,
    method: 'cash',
    amount: 100,
    status: 'completed',
    tenantId: 'tenant-1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockPaymentFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockPayment]),
    });
    mockPaymentCountDocuments.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/payments/route'));
  });

  it('returns 200 with payment list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/payments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty list', async () => {
    mockPaymentFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockPaymentCountDocuments.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/payments'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/payments'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/payments
// ===========================================================================

describe('POST /api/payments', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const createdPayment = {
    _id: PAYMENT_ID,
    method: 'card',
    amount: 100,
    status: 'completed',
    tenantId: 'tenant-1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockTransactionFindOne.mockResolvedValue(mockTransaction);
    mockPaymentCreate.mockResolvedValue(createdPayment);
    ({ POST } = await import('@/app/api/payments/route'));
  });

  it('returns 201 on successful payment creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: TX_ID,
      method: 'card',
      amount: 100,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.method).toBe('card');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: TX_ID,
      // missing method and amount
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when payment method is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: TX_ID,
      method: 'bitcoin',
      amount: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid payment method/i);
  });

  it('returns 404 when transaction not found', async () => {
    mockTransactionFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: 'bad-tx',
      method: 'cash',
      amount: 50,
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/transaction not found/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: TX_ID, method: 'cash', amount: 100,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValueOnce({
      allowed: false, remaining: 0, resetAt: Date.now() + 60000,
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/payments', {
      transactionId: TX_ID, method: 'cash', amount: 100,
    }));
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// POST /api/payments/[id]/refund
// ===========================================================================

describe('POST /api/payments/[id]/refund', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: PAYMENT_ID }) };
  let mockPayment: { _id: string; method: string; amount: number; status: string; tenantId: string; save: ReturnType<typeof vi.fn>; refundReason?: string };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPayment = {
      _id: PAYMENT_ID,
      method: 'cash',
      amount: 100,
      status: 'completed',
      tenantId: 'tenant-1',
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: adminUser });
    mockPaymentFindOne.mockResolvedValue(mockPayment);
    ({ POST } = await import('@/app/api/payments/[id]/refund/route'));
  });

  it('returns 200 on successful refund', async () => {
    const res = await POST(
      makeRequest('POST', `http://localhost/api/payments/${PAYMENT_ID}/refund`, {
        refundReason: 'Customer request',
      }),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPayment.save).toHaveBeenCalled();
    expect(mockPayment.status).toBe('refunded');
  });

  it('returns 404 when payment not found', async () => {
    mockPaymentFindOne.mockResolvedValue(null);
    const res = await POST(
      makeRequest('POST', `http://localhost/api/payments/${PAYMENT_ID}/refund`, {}),
      mockParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/payment not found/i);
  });

  it('returns 400 when payment is already refunded', async () => {
    mockPaymentFindOne.mockResolvedValue({ ...mockPayment, status: 'refunded', save: vi.fn() });
    const res = await POST(
      makeRequest('POST', `http://localhost/api/payments/${PAYMENT_ID}/refund`, {}),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already refunded/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(
      makeRequest('POST', `http://localhost/api/payments/${PAYMENT_ID}/refund`, {}),
      mockParams
    );
    expect(res.status).toBe(401);
  });

  it('sets refundReason on payment when provided', async () => {
    await POST(
      makeRequest('POST', `http://localhost/api/payments/${PAYMENT_ID}/refund`, {
        refundReason: 'Defective item',
      }),
      mockParams
    );
    expect(mockPayment.refundReason).toBe('Defective item');
  });
});
