process.env.JWT_SECRET = 'test-secret-32chars-branches!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockBranchFind,
  mockBranchCreate,
  mockBranchCount,
  mockExpenseFind,
  mockExpenseCreate,
  mockTaxRuleFind,
  mockTaxRuleCreate,
  mockRequireRole,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockBranchFind: vi.fn(),
  mockBranchCreate: vi.fn(),
  mockBranchCount: vi.fn(),
  mockExpenseFind: vi.fn(),
  mockExpenseCreate: vi.fn(),
  mockTaxRuleFind: vi.fn(),
  mockTaxRuleCreate: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 }),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
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
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireRole: mockRequireRole };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Branch', () => ({
  default: {
    find: mockBranchFind,
    create: mockBranchCreate,
    countDocuments: mockBranchCount,
  },
}));
vi.mock('@/models/Expense', () => ({
  default: {
    find: mockExpenseFind,
    create: mockExpenseCreate,
  },
}));
vi.mock('@/models/TaxRule', () => ({
  default: {
    find: mockTaxRuleFind,
    create: mockTaxRuleCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// GET /api/branches
// ---------------------------------------------------------------------------

describe('GET /api/branches', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockBranchFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'br-1', name: 'Main Branch', tenantId: 'tenant-1' }]),
    });
    ({ GET } = await import('@/app/api/branches/route'));
  });

  it('returns 200 with branch list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Main Branch');
  });

  it('returns 200 with empty array when no branches', async () => {
    mockBranchFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/branches
// ---------------------------------------------------------------------------

describe('POST /api/branches', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    mockBranchCount.mockResolvedValue(0); // no existing branches → skip multi-branch gate
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockResolvedValue(undefined);
    mockBranchCreate.mockResolvedValue({ _id: 'br-new', name: 'New Branch', tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/branches/route'));
  });

  it('returns 201 on successful creation (first branch, no feature gate)', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'New Branch' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('br-new');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 403 when multi-branch feature not enabled (2nd branch)', async () => {
    mockBranchCount.mockResolvedValue(1); // already has one branch
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Multi-branch requires upgraded plan')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'Branch 2' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when branch subscription limit reached', async () => {
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockRejectedValue(
      new Error('Branch limit reached')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'Extra' }));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'X' }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/expenses
// ---------------------------------------------------------------------------

describe('GET /api/expenses', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockExpenseFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'exp-1', name: 'Rent', amount: 5000 }]),
    });
    ({ GET } = await import('@/app/api/expenses/route'));
  });

  it('returns 200 with expense list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/expenses'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Rent');
  });

  it('returns 200 with empty array when no expenses', async () => {
    mockExpenseFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/expenses'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/expenses'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/expenses
// ---------------------------------------------------------------------------

describe('POST /api/expenses', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const validExpenseBody = {
    name: 'Office Supplies',
    description: 'Pens and paper',
    amount: 500,
    date: '2024-01-15',
    paymentMethod: 'cash',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    mockExpenseCreate.mockResolvedValue({ _id: 'exp-new', ...validExpenseBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/expenses/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', validExpenseBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('exp-new');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', { ...validExpenseBody, name: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name of expense is required/i);
  });

  it('returns 400 when description is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', { ...validExpenseBody, description: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description is required/i);
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _a, ...bodyWithoutAmount } = validExpenseBody;
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', bodyWithoutAmount));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/amount is required/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', validExpenseBody));
    expect(res.status).toBe(429);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/expenses', validExpenseBody));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tax-rules
// ---------------------------------------------------------------------------

describe('GET /api/tax-rules', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockTaxRuleFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'tax-1', name: 'VAT 12%', rate: 12, tenantId: 'tenant-1' }]),
    });
    ({ GET } = await import('@/app/api/tax-rules/route'));
  });

  it('returns 200 with tax rule list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tax-rules'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('VAT 12%');
  });

  it('returns 200 with empty array when no rules', async () => {
    mockTaxRuleFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tax-rules'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tax-rules'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tax-rules
// ---------------------------------------------------------------------------

describe('POST /api/tax-rules', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const validTaxBody = { name: 'VAT 12%', rate: 12 };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockTaxRuleCreate.mockResolvedValue({ _id: 'tax-new', name: 'VAT 12%', rate: 12, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/tax-rules/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', validTaxBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('tax-new');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', { rate: 12 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when rate is out of range (>100)', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', { name: 'High Tax', rate: 101 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/between 0 and 100/i);
  });

  it('returns 400 when rate is negative', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', { name: 'Neg Tax', rate: -1 }));
    expect(res.status).toBe(400);
  });

  it('returns error when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', validTaxBody));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns error when cashier role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', validTaxBody, 'cashier'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/tax-rules', validTaxBody));
    expect(res.status).toBe(404);
  });
});
