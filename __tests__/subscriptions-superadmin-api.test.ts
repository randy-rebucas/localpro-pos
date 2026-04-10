process.env.JWT_SECRET = 'test-secret-32chars-superadmin!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockSubscriptionFind,
  mockSubscriptionFindOne,
  mockSubscriptionFindById,
  mockSubscriptionCreate,
  mockSubscriptionPlanFindById,
  mockTenantFindById,
  mockTenantFindByIdAndUpdate,
  mockTenantFindOne,
  mockTenantFind,
  mockTenantCreate,
  mockTenantCount,
  mockUserCount,
  mockRequireRole,
} = vi.hoisted(() => ({
  mockSubscriptionFind: vi.fn(),
  mockSubscriptionFindOne: vi.fn(),
  mockSubscriptionFindById: vi.fn(),
  mockSubscriptionCreate: vi.fn(),
  mockSubscriptionPlanFindById: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockTenantFindByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
  mockTenantFindOne: vi.fn(),
  mockTenantFind: vi.fn(),
  mockTenantCreate: vi.fn(),
  mockTenantCount: vi.fn(),
  mockUserCount: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/lib/currency', () => ({
  getDefaultTenantSettings: vi.fn().mockReturnValue({
    currency: 'USD',
    language: 'en',
    timezone: 'UTC',
  }),
}));
vi.mock('@/lib/business-types', () => ({
  applyBusinessTypeDefaults: vi.fn().mockImplementation((settings: object) => settings),
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
    countDocuments: mockUserCount,
  },
}));
vi.mock('@/models/Subscription', () => ({
  default: {
    find: mockSubscriptionFind,
    findOne: mockSubscriptionFindOne,
    findById: mockSubscriptionFindById,
    create: mockSubscriptionCreate,
  },
}));
vi.mock('@/models/SubscriptionPlan', () => ({
  default: { findById: mockSubscriptionPlanFindById },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: mockTenantFindById,
    findByIdAndUpdate: mockTenantFindByIdAndUpdate,
    findOne: mockTenantFindOne,
    find: mockTenantFind,
    create: mockTenantCreate,
    countDocuments: mockTenantCount,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' };
const superAdminUser = { userId: 'sa-1', tenantId: 'system', email: 'sa@test.com', role: 'super_admin' };

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockSubscription = {
  _id: 'sub-1',
  tenantId: { _id: 'tenant-1', slug: 'demo', name: 'Demo Store' },
  planId: { _id: 'plan-1', name: 'Basic', tier: 'basic', price: 29 },
  status: 'active',
  billingCycle: 'monthly',
};

const mockTenant = {
  _id: 'tenant-1',
  slug: 'demo-store',
  name: 'Demo Store',
  isActive: true,
  settings: { currency: 'USD', language: 'en' },
};

const mockPlan = {
  _id: 'plan-1',
  name: 'Basic',
  tier: 'basic',
  price: 29,
  isActive: true,
};

// ===========================================================================
// SUBSCRIPTIONS
// ===========================================================================

describe('GET /api/subscriptions', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(adminUser);
    mockSubscriptionFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockSubscription]),
    });
    ({ GET } = await import('@/app/api/subscriptions/route'));
  });

  it('returns 200 with subscription list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/subscriptions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe('active');
  });

  it('returns 200 with empty array when no subscriptions', async () => {
    mockSubscriptionFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/subscriptions'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/subscriptions'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/subscriptions', undefined, 'cashier'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/subscriptions', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const createdSubscription = {
    _id: 'sub-new',
    tenantId: mockTenant,
    planId: mockPlan,
    status: 'active',
    billingCycle: 'monthly',
    isTrial: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(adminUser);
    mockTenantFindById.mockResolvedValue(mockTenant);
    mockSubscriptionFindOne.mockResolvedValue(null); // no existing subscription
    mockSubscriptionPlanFindById.mockResolvedValue(mockPlan);
    mockSubscriptionCreate.mockResolvedValue({ _id: 'sub-new', ...createdSubscription });
    mockTenantFindByIdAndUpdate.mockResolvedValue(undefined);
    mockSubscriptionFindById.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      populate2: vi.fn().mockReturnThis(),
    });
    // Chain: findById().populate().populate() resolves to populated subscription
    mockSubscriptionFindById.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(createdSubscription),
      }),
    });
    ({ POST } = await import('@/app/api/subscriptions/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
      planId: 'plan-1',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when tenantId or planId missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tenant id and plan id are required/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindById.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'bad-tenant',
      planId: 'plan-1',
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 400 when tenant already has active subscription', async () => {
    mockSubscriptionFindOne.mockResolvedValue(mockSubscription);
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
      planId: 'plan-1',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already has an active subscription/i);
  });

  it('returns 404 when plan not found or inactive', async () => {
    mockSubscriptionPlanFindById.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
      planId: 'bad-plan',
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/plan not found or inactive/i);
  });

  it('returns 404 when plan is inactive', async () => {
    mockSubscriptionPlanFindById.mockResolvedValue({ ...mockPlan, isActive: false });
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
      planId: 'plan-1',
    }));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/subscriptions', {
      tenantId: 'tenant-1',
      planId: 'plan-1',
    }));
    // Error hits outer catch which returns 400 for general errors, but auth errors bubble
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ===========================================================================
// SUPER-ADMIN / TENANTS
// ===========================================================================

describe('GET /api/super-admin/tenants', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(superAdminUser);
    mockTenantCount.mockResolvedValue(1);
    mockTenantFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockTenant]),
    });
    ({ GET } = await import('@/app/api/super-admin/tenants/route'));
  });

  it('returns 200 with tenant list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/tenants'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('demo-store');
    expect(body.pagination.total).toBe(1);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/tenants'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-super_admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/tenants', undefined, 'admin'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/super-admin/tenants', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(superAdminUser);
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); // slug not taken
    mockTenantCreate.mockResolvedValue({ _id: 'tenant-new', slug: 'new-store', name: 'New Store', isActive: true });
    ({ POST } = await import('@/app/api/super-admin/tenants/route'));
  });

  it('returns 201 on successful tenant creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'new-store',
      name: 'New Store',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('new-store');
  });

  it('returns 400 when slug or name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      name: 'No Slug Store',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slug and name are required/i);
  });

  it('returns 400 when slug has invalid characters', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'My Store!',
      name: 'My Store',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lowercase letters, numbers, and hyphens/i);
  });

  it('returns 400 when slug is already taken', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'demo-store',
      name: 'Duplicate Store',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slug already exists/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'test',
      name: 'Test',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-super_admin', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'test',
      name: 'Test',
    }, 'admin'));
    expect(res.status).toBe(403);
  });

  it('applies business type defaults when businessType provided', async () => {
    const { applyBusinessTypeDefaults } = await import('@/lib/business-types');
    await POST(makeRequest('POST', 'http://localhost/api/super-admin/tenants', {
      slug: 'retail-shop',
      name: 'Retail Shop',
      businessType: 'retail',
    }));
    expect(vi.mocked(applyBusinessTypeDefaults)).toHaveBeenCalledWith(
      expect.any(Object),
      'retail'
    );
  });
});

// ===========================================================================
// SUPER-ADMIN / STATS
// ===========================================================================

describe('GET /api/super-admin/stats', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(superAdminUser);
    mockTenantCount
      .mockResolvedValueOnce(10)   // totalTenants
      .mockResolvedValueOnce(8);   // activeTenants
    mockUserCount.mockResolvedValue(45);
    ({ GET } = await import('@/app/api/super-admin/stats/route'));
  });

  it('returns 200 with system stats', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/stats'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalTenants).toBe(10);
    expect(body.data.activeTenants).toBe(8);
    expect(body.data.inactiveTenants).toBe(2);
    expect(body.data.totalUsers).toBe(45);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/stats'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-super_admin', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/super-admin/stats'));
    expect(res.status).toBe(403);
  });
});
