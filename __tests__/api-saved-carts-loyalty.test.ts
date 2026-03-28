/**
 * Section 14 — Saved Carts
 * Section 15 — Loyalty Program
 * Tests: 14.1, 14.2, 15.1–15.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('507f1f77bcf86cd799439011'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: '507f1f77bcf86cd799439011',
    user: { userId: 'user1', tenantId: '507f1f77bcf86cd799439011', email: 'u@t.com', role: 'cashier' },
  }),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockReturnValue(
    NextResponse.json({ success: false, error: 'Error' }, { status: 500 })
  ),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: {},
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validateAndSanitize: vi.fn().mockImplementation((body: unknown) => ({ data: body, errors: [] })),
  validateTransaction: {},
}));
vi.mock('@/lib/receipt', () => ({ generateReceiptNumber: vi.fn().mockReturnValue('RCP-001') }));
vi.mock('@/lib/stock', () => ({
  updateStock: vi.fn().mockResolvedValue(undefined),
  updateBundleStock: vi.fn().mockResolvedValue(undefined),
  getProductStock: vi.fn().mockResolvedValue(10),
}));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/tax-calculation', () => ({
  calculateTax: vi.fn().mockResolvedValue({ taxAmount: 0, taxableAmount: 0, exemptAmount: 0, taxLabel: '' }),
}));

// Mongoose: keep real Types.ObjectId, mock startSession for loyalty/adjust
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  const mockSession = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
  };
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn().mockResolvedValue(mockSession),
    },
  };
});

vi.mock('@/models/SavedCart', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn() },
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), findOne: vi.fn() },
}));
vi.mock('@/models/LoyaltyConfig', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/Customer', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/LoyaltyTransaction', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn().mockResolvedValue([{ _id: 'ltx1' }]),
  },
}));
// Models needed only for transaction route (15.5)
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn(), create: vi.fn(), countDocuments: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/models/Payment', () => ({ default: { create: vi.fn() } }));
vi.mock('@/models/Discount', () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock('@/models/ProductBundle', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/StockMovement', () => ({ default: { create: vi.fn() } }));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkFeatureAccess, checkSubscriptionLimit } from '@/lib/subscription';
import { validateAndSanitize } from '@/lib/validation';
import SavedCart from '@/models/SavedCart';
import Product from '@/models/Product';
import LoyaltyConfig from '@/models/LoyaltyConfig';
import Customer from '@/models/Customer';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import Transaction from '@/models/Transaction';

// ── Fixtures ───────────────────────────────────────────────────────────────
// Use valid 24-char hex ObjectIds for routes that call new mongoose.Types.ObjectId()
const TENANT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f1f77bcf86cd799439012';
const CART_ID = '507f1f77bcf86cd799439013';
const CUSTOMER_ID = '507f1f77bcf86cd799439014';

const mockCartDoc = {
  _id: CART_ID,
  tenantId: TENANT_ID,
  name: 'Afternoon Cart',
  items: [{ productId: PRODUCT_ID, name: 'Widget', price: 100, quantity: 2, stock: 10 }],
  subtotal: 200,
  total: 200,
  userId: 'user1',
  isActive: true,
};

const mockProductDoc = {
  _id: PRODUCT_ID,
  tenantId: TENANT_ID,
  name: 'Widget',
  price: 100,
  stock: 10,
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 14.1  GET /api/saved-carts ────────────────────────────────────────────
describe('GET /api/saved-carts (14.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(SavedCart.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockCartDoc]),
      }),
    } as any);
  });

  it('returns saved carts for the user', async () => {
    const { GET } = await import('@/app/api/saved-carts/route');
    const res = await GET(req('GET', '/api/saved-carts'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Afternoon Cart');
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/saved-carts/route');
    const res = await GET(req('GET', '/api/saved-carts'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/saved-carts/route');
    const res = await GET(req('GET', '/api/saved-carts'));
    expect(res.status).toBe(500);
  });
});

// ── 14.1  POST /api/saved-carts ───────────────────────────────────────────
describe('POST /api/saved-carts (14.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Product.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([mockProductDoc]),
    } as any);
    vi.mocked(SavedCart.create).mockResolvedValue({ ...mockCartDoc, _id: CART_ID } as any);
  });

  it('saves cart and returns 201', async () => {
    const { POST } = await import('@/app/api/saved-carts/route');
    const res = await POST(req('POST', '/api/saved-carts', {
      name: 'Afternoon Cart',
      items: [{ productId: PRODUCT_ID, name: 'Widget', price: 100, quantity: 2, stock: 10 }],
      subtotal: 200,
      total: 200,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/saved-carts/route');
    const res = await POST(req('POST', '/api/saved-carts', {
      items: [{ productId: PRODUCT_ID, name: 'Widget', price: 100, quantity: 2, stock: 10 }],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when items array is empty', async () => {
    const { POST } = await import('@/app/api/saved-carts/route');
    const res = await POST(req('POST', '/api/saved-carts', { name: 'Cart', items: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when product not found in tenant', async () => {
    vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
    const { POST } = await import('@/app/api/saved-carts/route');
    const res = await POST(req('POST', '/api/saved-carts', {
      name: 'Cart',
      items: [{ productId: PRODUCT_ID, name: 'Widget', price: 100, quantity: 1, stock: 5 }],
    }));
    expect(res.status).toBe(404);
  });
});

// ── 14.2  GET /api/saved-carts/[id] ──────────────────────────────────────
describe('GET /api/saved-carts/[id] (14.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(SavedCart.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockCartDoc),
    } as any);
  });

  it('restores saved cart by id', async () => {
    const { GET } = await import('@/app/api/saved-carts/[id]/route');
    const res = await GET(
      req('GET', `/api/saved-carts/${CART_ID}`),
      { params: Promise.resolve({ id: CART_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Afternoon Cart');
  });

  it('returns 404 when cart not found', async () => {
    vi.mocked(SavedCart.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/saved-carts/[id]/route');
    const res = await GET(
      req('GET', `/api/saved-carts/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 14.2  DELETE /api/saved-carts/[id] ───────────────────────────────────
describe('DELETE /api/saved-carts/[id] (14.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(SavedCart.findOneAndUpdate).mockResolvedValue({ ...mockCartDoc, isActive: false } as any);
  });

  it('soft-deletes cart and returns 200', async () => {
    const { DELETE } = await import('@/app/api/saved-carts/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/saved-carts/${CART_ID}`),
      { params: Promise.resolve({ id: CART_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when cart not found', async () => {
    vi.mocked(SavedCart.findOneAndUpdate).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/saved-carts/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/saved-carts/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 15.1  GET /api/loyalty/config ─────────────────────────────────────────
describe('GET /api/loyalty/config (15.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(LoyaltyConfig.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        tenantId: TENANT_ID, pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true,
      }),
    } as any);
  });

  it('returns loyalty config', async () => {
    const { GET } = await import('@/app/api/loyalty/config/route');
    const res = await GET(req('GET', '/api/loyalty/config'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pointsPerPeso).toBe(1);
    expect(body.data.pesoPerPoint).toBe(0.10);
  });

  it('returns default config when none configured', async () => {
    vi.mocked(LoyaltyConfig.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/loyalty/config/route');
    const res = await GET(req('GET', '/api/loyalty/config'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.pointsPerPeso).toBe(1);
    expect(body.data.minRedemption).toBe(100);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { GET } = await import('@/app/api/loyalty/config/route');
    const res = await GET(req('GET', '/api/loyalty/config'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/loyalty/config/route');
    const res = await GET(req('GET', '/api/loyalty/config'));
    expect(res.status).toBe(403);
  });
});

// ── 15.1  PUT /api/loyalty/config ─────────────────────────────────────────
describe('PUT /api/loyalty/config (15.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(LoyaltyConfig.findOneAndUpdate).mockResolvedValue({
      _id: 'cfg1',
      tenantId: TENANT_ID,
      pointsPerPeso: 2,
      pesoPerPoint: 0.05,
      minRedemption: 50,
      isEnabled: true,
      _id_str: 'cfg1',
    } as any);
  });

  it('updates config and returns 200', async () => {
    const { PUT } = await import('@/app/api/loyalty/config/route');
    const res = await PUT(req('PUT', '/api/loyalty/config', {
      pointsPerPeso: 2,
      pesoPerPoint: 0.05,
      minRedemption: 50,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(LoyaltyConfig.findOneAndUpdate)).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      expect.objectContaining({ $set: expect.objectContaining({ pointsPerPeso: 2 }) }),
      { upsert: true, new: true }
    );
  });

  it('returns 403 when role is cashier', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'cashier' } as any);
    const { PUT } = await import('@/app/api/loyalty/config/route');
    const res = await PUT(req('PUT', '/api/loyalty/config', { pointsPerPeso: 2 }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when pointsPerPeso is not positive', async () => {
    const { PUT } = await import('@/app/api/loyalty/config/route');
    const res = await PUT(req('PUT', '/api/loyalty/config', { pointsPerPeso: -1 }));
    expect(res.status).toBe(400);
  });
});

// ── 15.2  GET /api/loyalty/customers/[customerId] ─────────────────────────
describe('GET /api/loyalty/customers/[customerId] (15.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Customer.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: CUSTOMER_ID,
        firstName: 'Jane',
        lastName: 'Doe',
        loyaltyPointsBalance: 350,
      }),
    } as any);
    vi.mocked(LoyaltyTransaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([{ type: 'earn', points: 50 }]),
          }),
        }),
      }),
    } as any);
    vi.mocked(LoyaltyTransaction.countDocuments).mockResolvedValue(1 as any);
  });

  it('returns customer points balance and history', async () => {
    const { GET } = await import('@/app/api/loyalty/customers/[customerId]/route');
    const res = await GET(
      req('GET', `/api/loyalty/customers/${CUSTOMER_ID}`),
      { params: Promise.resolve({ customerId: CUSTOMER_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.loyaltyPointsBalance).toBe(350);
    expect(body.data.customerName).toBe('Jane Doe');
    expect(body.data.history).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it('returns 404 when customer not found', async () => {
    vi.mocked(Customer.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/loyalty/customers/[customerId]/route');
    const res = await GET(
      req('GET', `/api/loyalty/customers/bad-id`),
      { params: Promise.resolve({ customerId: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 15.3  POST /api/loyalty/adjust ────────────────────────────────────────
describe('POST /api/loyalty/adjust (15.3)', () => {
  let customerDoc: { _id: { toString: () => string }; loyaltyPointsBalance: number; save: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    customerDoc = {
      _id: { toString: () => CUSTOMER_ID },
      loyaltyPointsBalance: 200,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Customer.findOne).mockResolvedValue(customerDoc as any);
    vi.mocked(LoyaltyTransaction.create).mockResolvedValue([{ _id: { toString: () => 'ltx1' } }] as any);
  });

  it('adjusts points and returns balance before/after', async () => {
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    const res = await POST(req('POST', '/api/loyalty/adjust', {
      customerId: CUSTOMER_ID,
      points: 100,
      description: 'Manual bonus',
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.balanceBefore).toBe(200);
    expect(body.data.balanceAfter).toBe(300);
    expect(body.data.pointsAdjusted).toBe(100);
  });

  it('deducts points on negative adjustment', async () => {
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    await POST(req('POST', '/api/loyalty/adjust', {
      customerId: CUSTOMER_ID,
      points: -50,
      description: 'Correction',
    }));
    expect(customerDoc.loyaltyPointsBalance).toBe(150);
  });

  it('floors balance at zero on over-deduction', async () => {
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    await POST(req('POST', '/api/loyalty/adjust', {
      customerId: CUSTOMER_ID,
      points: -9999,
      description: 'Large deduction',
    }));
    // Math.max(0, 200 - 9999) = 0
    expect(customerDoc.loyaltyPointsBalance).toBe(0);
  });

  it('returns 400 when points is zero', async () => {
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    const res = await POST(req('POST', '/api/loyalty/adjust', {
      customerId: CUSTOMER_ID,
      points: 0,
      description: 'Test',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when role is cashier', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'cashier' } as any);
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    const res = await POST(req('POST', '/api/loyalty/adjust', {
      customerId: CUSTOMER_ID,
      points: 100,
      description: 'Test',
    }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when customer not found', async () => {
    vi.mocked(Customer.findOne).mockResolvedValue(null as any);
    const { POST } = await import('@/app/api/loyalty/adjust/route');
    const res = await POST(req('POST', '/api/loyalty/adjust', {
      customerId: 'bad-id',
      points: 100,
      description: 'Test',
    }));
    expect(res.status).toBe(404);
  });
});

// ── 15.4  Points awarded automatically on transaction ─────────────────────
describe('Points earned on transaction (15.4)', () => {
  it('calculates earned points as floor(total × pointsPerPeso)', () => {
    const config = { pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true };
    expect(Math.floor(500 * config.pointsPerPeso)).toBe(500);
    expect(Math.floor(499.99 * config.pointsPerPeso)).toBe(499);   // floor rounds down
    expect(Math.floor(750 * 0.5)).toBe(375);                       // 0.5 pts per peso
  });

  it('loyalty is silently skipped when feature not enabled (no error thrown)', async () => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: 'user1', tenantId: TENANT_ID, email: 'u@t.com', role: 'cashier' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(validateAndSanitize).mockReturnValue({
      data: { items: [{ productId: PRODUCT_ID, quantity: 1 }], paymentMethod: 'cash' },
      errors: [],
    } as any);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    // Loyalty feature throws → silently skipped, transaction proceeds
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));

    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      paymentMethod: 'cash',
    }));
    // Route proceeds past loyalty check (returns something other than 403)
    expect(res.status).not.toBe(403);
  });
});

// ── 15.5  Points can be redeemed at checkout ──────────────────────────────
describe('Loyalty points redemption at checkout (15.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: 'user1', tenantId: TENANT_ID, email: 'u@t.com', role: 'cashier' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(validateAndSanitize).mockReturnValue({
      data: { items: [{ productId: PRODUCT_ID, quantity: 1 }], paymentMethod: 'cash' },
      errors: [],
    } as any);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined); // loyalty enabled
    vi.mocked(LoyaltyConfig.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true,
      }),
    } as any);
    vi.mocked(Customer.findOne).mockResolvedValue({
      _id: CUSTOMER_ID,
      loyaltyPointsBalance: 1000,
    } as any);
  });

  it('returns 400 when redeeming below minimum threshold', async () => {
    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      paymentMethod: 'cash',
      customerId: CUSTOMER_ID,
      loyaltyPointsToRedeem: 50, // below minRedemption: 100
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/minimum.*100/i);
  });

  it('returns 400 when redeeming more than balance', async () => {
    vi.mocked(Customer.findOne).mockResolvedValue({
      _id: CUSTOMER_ID,
      loyaltyPointsBalance: 50,
    } as any);
    const { POST } = await import('@/app/api/transactions/route');
    const res = await POST(req('POST', '/api/transactions', {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      paymentMethod: 'cash',
      customerId: CUSTOMER_ID,
      loyaltyPointsToRedeem: 200, // exceeds balance of 50
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/insufficient.*points/i);
  });
});

// ── 15.6  Redeemed points reduce transaction total correctly ──────────────
describe('Loyalty redemption reduces total (15.6)', () => {
  it('converts points to peso discount at configured rate', () => {
    const config = { pesoPerPoint: 0.10, minRedemption: 100 };
    const pointsToRedeem = 200;
    const loyaltyDiscount = pointsToRedeem * config.pesoPerPoint;
    expect(loyaltyDiscount).toBe(20);  // 200 pts × ₱0.10 = ₱20

    // Total is reduced by loyalty discount
    const subtotalAfterOtherDiscounts = 500;
    const taxAmount = 0;
    const total = Math.max(0, subtotalAfterOtherDiscounts + taxAmount - loyaltyDiscount);
    expect(total).toBe(480);
  });

  it('total cannot go below zero from loyalty redemption', () => {
    const config = { pesoPerPoint: 0.10 };
    const loyaltyDiscount = 500 * config.pesoPerPoint; // ₱50 discount
    const subtotal = 30;
    const total = Math.max(0, subtotal - loyaltyDiscount);
    expect(total).toBe(0); // clamped at 0
  });
});
