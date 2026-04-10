import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const {
  mockConnectDB,
  mockRequireRole,
  mockCreateAuditLog,
  mockHandleApiError,
  mockGetDefaultTenantSettings,
  mockApplyBusinessTypeDefaults,
  mockConnection,
  mockDb,
} = vi.hoisted(() => {
  const mockDb = {
    admin: vi.fn(),
    listCollections: vi.fn(),
    collection: vi.fn(),
  };
  const mockConnection = { db: mockDb as unknown };
  return {
    mockConnectDB: vi.fn(),
    mockRequireRole: vi.fn(),
    mockCreateAuditLog: vi.fn(),
    mockHandleApiError: vi.fn(),
    mockGetDefaultTenantSettings: vi.fn(),
    mockApplyBusinessTypeDefaults: vi.fn(),
    mockConnection,
    mockDb,
  };
});

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/auth', () => ({ requireRole: mockRequireRole }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/currency', () => ({ getDefaultTenantSettings: mockGetDefaultTenantSettings }));
vi.mock('@/lib/business-types', () => ({ applyBusinessTypeDefaults: mockApplyBusinessTypeDefaults }));
vi.mock('mongoose', () => ({ default: { connection: mockConnection } }));

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findById: vi.fn(),
  },
}));
vi.mock('@/models/User', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('@/models/AuditLog', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('@/models/Subscription', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));
vi.mock('@/models/SubscriptionPlan', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/Transaction', () => ({
  default: {
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));

// Route imports
import { GET as statsGET } from '@/app/api/super-admin/stats/route';
import { GET as logsGET } from '@/app/api/super-admin/logs/route';
import { GET as tenantsGET, POST as tenantsPOST } from '@/app/api/super-admin/tenants/route';
import { GET as tenantSlugGET, PUT as tenantSlugPUT } from '@/app/api/super-admin/tenants/[slug]/route';
import { GET as saSubsGET } from '@/app/api/super-admin/subscriptions/route';
import { GET as subTenantGET, PUT as subTenantPUT } from '@/app/api/super-admin/subscriptions/[tenantSlug]/route';
import { GET as analyticsGET } from '@/app/api/super-admin/analytics/route';
import { GET as usersGET } from '@/app/api/super-admin/users/route';
import { PUT as userIdPUT } from '@/app/api/super-admin/users/[id]/route';
import { GET as plansGET, POST as plansPOST } from '@/app/api/super-admin/plans/route';
import { GET as planIdGET, PUT as planIdPUT, DELETE as planIdDELETE } from '@/app/api/super-admin/plans/[id]/route';
import { GET as healthGET } from '@/app/api/super-admin/system/health/route';
import { POST as seedPOST } from '@/app/api/super-admin/system/seed/route';

// Model imports for assertions
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import AuditLog from '@/models/AuditLog';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Transaction from '@/models/Transaction';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

function makeChain(doc: unknown = null) {
  return {
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(doc),
  };
}

const saUser = { userId: 'sa1', tenantId: '', role: 'super_admin' };
const errResponse = (status = 500) =>
  new Response(JSON.stringify({ success: false, error: 'Server error' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Module-level defaults (persist through vi.clearAllMocks via vi.resetAllMocks is not called)
// ---------------------------------------------------------------------------
mockHandleApiError.mockResolvedValue(errResponse());

// ---------------------------------------------------------------------------
// GET /api/super-admin/stats
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.countDocuments).mockResolvedValue(10);
    vi.mocked(User.countDocuments).mockResolvedValue(50);
  });

  it('returns 200 with tenant and user counts', async () => {
    vi.mocked(Tenant.countDocuments)
      .mockResolvedValueOnce(10)  // totalTenants
      .mockResolvedValueOnce(8);  // activeTenants

    const res = await statsGET(makeReq('http://localhost/api/super-admin/stats'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.totalTenants).toBe(10);
    expect(data.data.activeTenants).toBe(8);
    expect(data.data.inactiveTenants).toBe(2);
    expect(data.data.totalUsers).toBe(50);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await statsGET(makeReq('http://localhost/api/super-admin/stats'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns 403 when not super_admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden: insufficient role'));

    const res = await statsGET(makeReq('http://localhost/api/super-admin/stats'));
    const data = await res.json();

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/logs
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/logs', () => {
  const logDocs = [{ _id: 'l1', action: 'product.create' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain({ _id: 'tid' }) as ReturnType<typeof makeChain>);
    vi.mocked(AuditLog.find).mockReturnValue(makeChain(logDocs) as ReturnType<typeof makeChain>);
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(1);
  });

  it('returns 200 with logs', async () => {
    const res = await logsGET(makeReq('http://localhost/api/super-admin/logs'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(logDocs);
    expect(data.pagination).toBeDefined();
  });

  it('resolves tenantSlug to tenantId', async () => {
    const url = 'http://localhost/api/super-admin/logs?tenantSlug=my-shop';
    await logsGET(makeReq(url));

    expect(Tenant.findOne).toHaveBeenCalledWith({ slug: 'my-shop' });
    expect(AuditLog.find).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.anything() })
    );
  });

  it('returns empty data when tenantSlug not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const url = 'http://localhost/api/super-admin/logs?tenantSlug=nonexistent';
    const res = await logsGET(makeReq(url));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await logsGET(makeReq('http://localhost/api/super-admin/logs'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/tenants
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/tenants', () => {
  const tenantDocs = [{ _id: 't1', slug: 'shop1', name: 'Shop 1', isActive: true }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.countDocuments).mockResolvedValue(1);
    vi.mocked(Tenant.find).mockReturnValue(makeChain(tenantDocs) as ReturnType<typeof makeChain>);
  });

  it('returns 200 with tenant list and pagination', async () => {
    const res = await tenantsGET(makeReq('http://localhost/api/super-admin/tenants'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(tenantDocs);
    expect(data.pagination).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
  });

  it('filters by search query', async () => {
    vi.mocked(Tenant.countDocuments).mockResolvedValue(1);
    const url = 'http://localhost/api/super-admin/tenants?search=shop&active=true';
    await tenantsGET(makeReq(url));

    expect(Tenant.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.any(Array), isActive: true })
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await tenantsGET(makeReq('http://localhost/api/super-admin/tenants'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/tenants
// ---------------------------------------------------------------------------
describe('POST /api/super-admin/tenants', () => {
  const newTenant = { _id: 'newt1', slug: 'new-shop', name: 'New Shop', isActive: true };
  const defaultSettings = { currency: 'PHP', language: 'en' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    mockGetDefaultTenantSettings.mockReturnValue({ ...defaultSettings });
    mockApplyBusinessTypeDefaults.mockImplementation((s: unknown) => s);
    mockCreateAuditLog.mockResolvedValue(undefined);
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);
    vi.mocked(Tenant.create).mockResolvedValue(newTenant as unknown as never);
  });

  it('returns 201 with created tenant', async () => {
    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { slug: 'new-shop', name: 'New Shop' })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(newTenant);
  });

  it('returns 400 when slug is missing', async () => {
    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { name: 'No Slug' })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 when name is missing', async () => {
    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { slug: 'ok-slug' })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 for invalid slug format', async () => {
    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { slug: 'Has Spaces!', name: 'Shop' })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/slug/i);
  });

  it('returns 400 when slug already exists', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(
      makeChain({ _id: 't99', slug: 'exists' }) as ReturnType<typeof makeChain>
    );

    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { slug: 'exists', name: 'Existing' })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/already exists/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', { slug: 'x', name: 'X' })
    );
    expect(res.status).toBe(401);
  });

  it('applies businessType defaults when provided', async () => {
    const mergedSettings = { currency: 'PHP', language: 'en', businessType: 'restaurant' };
    mockApplyBusinessTypeDefaults.mockReturnValue(mergedSettings);

    await tenantsPOST(
      makeReq('http://localhost/api/super-admin/tenants', 'POST', {
        slug: 'new-shop',
        name: 'New Shop',
        businessType: 'restaurant',
      })
    );

    expect(mockApplyBusinessTypeDefaults).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/tenants/[slug]
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/tenants/[slug]', () => {
  const tenantDoc = { _id: 't1', slug: 'my-shop', name: 'My Shop' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(tenantDoc) as ReturnType<typeof makeChain>);
  });

  it('returns 200 with tenant data', async () => {
    const res = await tenantSlugGET(makeReq('http://localhost/api/super-admin/tenants/my-shop'), {
      params: Promise.resolve({ slug: 'my-shop' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(tenantDoc);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await tenantSlugGET(makeReq('http://localhost/api/super-admin/tenants/ghost'), {
      params: Promise.resolve({ slug: 'ghost' }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await tenantSlugGET(makeReq('http://localhost/api/super-admin/tenants/x'), {
      params: Promise.resolve({ slug: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/super-admin/tenants/[slug]
// ---------------------------------------------------------------------------
describe('PUT /api/super-admin/tenants/[slug]', () => {
  const oldTenant = { _id: 't1', slug: 'my-shop', name: 'Old Name', settings: { businessType: 'retail' } };
  const updatedTenant = { ...oldTenant, name: 'New Name' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    mockCreateAuditLog.mockResolvedValue(undefined);
    mockApplyBusinessTypeDefaults.mockImplementation((s: unknown) => s);
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(oldTenant) as ReturnType<typeof makeChain>);
    vi.mocked(Tenant.findOneAndUpdate).mockResolvedValue(updatedTenant as unknown as never);
  });

  it('returns 200 with updated tenant', async () => {
    const res = await tenantSlugPUT(
      makeReq('http://localhost/api/super-admin/tenants/my-shop', 'PUT', { name: 'New Name' }),
      { params: Promise.resolve({ slug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(updatedTenant);
  });

  it('returns 404 when tenant not found (findOne)', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await tenantSlugPUT(
      makeReq('http://localhost/api/super-admin/tenants/ghost', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ slug: 'ghost' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(404);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await tenantSlugPUT(
      makeReq('http://localhost/api/super-admin/tenants/my-shop', 'PUT', { name: '   ' }),
      { params: Promise.resolve({ slug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await tenantSlugPUT(
      makeReq('http://localhost/api/super-admin/tenants/x', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ slug: 'x' }) }
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/subscriptions
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/subscriptions', () => {
  const subDocs = [{ _id: 's1', status: 'active' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain({ _id: 'tid' }) as ReturnType<typeof makeChain>);
    vi.mocked(Subscription.find).mockReturnValue(makeChain(subDocs) as ReturnType<typeof makeChain>);
    vi.mocked(Subscription.countDocuments).mockResolvedValue(1);
  });

  it('returns 200 with subscriptions list', async () => {
    const res = await saSubsGET(makeReq('http://localhost/api/super-admin/subscriptions'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(subDocs);
    expect(data.pagination).toBeDefined();
  });

  it('returns empty data when tenantSlug not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const url = 'http://localhost/api/super-admin/subscriptions?tenantSlug=ghost';
    const res = await saSubsGET(makeReq(url));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await saSubsGET(makeReq('http://localhost/api/super-admin/subscriptions'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/subscriptions/[tenantSlug]
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/subscriptions/[tenantSlug]', () => {
  const tenantDoc = { _id: 'tid', slug: 'my-shop', name: 'My Shop' };
  const subDoc = { _id: 's1', status: 'active', planId: { name: 'Pro', tier: 'pro' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(tenantDoc) as ReturnType<typeof makeChain>);
    vi.mocked(Subscription.findOne).mockReturnValue(makeChain(subDoc) as ReturnType<typeof makeChain>);
  });

  it('returns 200 with subscription data', async () => {
    const res = await subTenantGET(makeReq('http://localhost/api/super-admin/subscriptions/my-shop'), {
      params: Promise.resolve({ tenantSlug: 'my-shop' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(subDoc);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await subTenantGET(makeReq('http://localhost/api/super-admin/subscriptions/ghost'), {
      params: Promise.resolve({ tenantSlug: 'ghost' }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/tenant not found/i);
  });

  it('returns 404 when no subscription found', async () => {
    vi.mocked(Subscription.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await subTenantGET(makeReq('http://localhost/api/super-admin/subscriptions/my-shop'), {
      params: Promise.resolve({ tenantSlug: 'my-shop' }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/no subscription/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await subTenantGET(makeReq('http://localhost/api/super-admin/subscriptions/x'), {
      params: Promise.resolve({ tenantSlug: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/super-admin/subscriptions/[tenantSlug]
// ---------------------------------------------------------------------------
describe('PUT /api/super-admin/subscriptions/[tenantSlug]', () => {
  const tenantDoc = { _id: 'tid', slug: 'my-shop', name: 'My Shop' };
  const updatedSub = { _id: 's1', status: 'active', planId: { name: 'Pro', tier: 'pro' } };

  const makeMutableSub = (overrides = {}) => ({
    _id: 's1',
    status: 'trial',
    isTrial: true,
    planId: 'plan1',
    billingCycle: 'monthly',
    trialEndDate: null as Date | null,
    startDate: undefined as Date | undefined,
    nextBillingDate: undefined as Date | undefined,
    trialEndDate2: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    cancelledAt: undefined as Date | undefined,
    suspendedAt: undefined as Date | undefined,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    mockCreateAuditLog.mockResolvedValue(undefined);
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(tenantDoc) as ReturnType<typeof makeChain>);
    vi.mocked(Subscription.findOne).mockResolvedValue(makeMutableSub() as unknown as never);
    vi.mocked(Subscription.findById).mockReturnValue(makeChain(updatedSub) as ReturnType<typeof makeChain>);
    vi.mocked(SubscriptionPlan.findById).mockReturnValue(
      makeChain({ _id: 'plan2', name: 'Pro', tier: 'pro' }) as ReturnType<typeof makeChain>
    );
  });

  it('returns 200 on cancel action', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 200 on activate action', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'activate' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 on suspend action', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'suspend' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 on assign-plan action', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', {
        action: 'assign-plan',
        planId: 'plan2',
      }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 on assign-plan when planId missing', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'assign-plan' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/planId/i);
  });

  it('returns 400 on extend-trial with invalid days', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', {
        action: 'extend-trial',
        days: 0,
      }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/days/i);
  });

  it('returns 400 on unknown action', async () => {
    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'fly' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/unknown action/i);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/ghost', 'PUT', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'ghost' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no subscription found', async () => {
    vi.mocked(Subscription.findOne).mockResolvedValue(null as unknown as never);

    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/my-shop', 'PUT', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'my-shop' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await subTenantPUT(
      makeReq('http://localhost/api/super-admin/subscriptions/x', 'PUT', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'x' }) }
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/analytics
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Subscription.find).mockReturnValue(makeChain([]) as ReturnType<typeof makeChain>);
    vi.mocked(Subscription.aggregate).mockResolvedValue([]);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(0);
    vi.mocked(Transaction.aggregate).mockResolvedValue([]);
    vi.mocked(Tenant.aggregate).mockResolvedValue([]);
  });

  it('returns 200 with analytics data shape', async () => {
    const res = await analyticsGET(makeReq('http://localhost/api/super-admin/analytics'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('mrr');
    expect(data.data).toHaveProperty('transactions');
    expect(data.data).toHaveProperty('planBreakdown');
    expect(data.data).toHaveProperty('statusBreakdown');
    expect(data.data).toHaveProperty('tenantGrowth');
    expect(data.data).toHaveProperty('topTenants');
  });

  it('calculates MRR from active subscriptions', async () => {
    vi.mocked(Subscription.find).mockReturnValue(
      makeChain([
        { planId: { price: { monthly: 999 } } },
        { planId: { price: { monthly: 2499 } } },
      ]) as ReturnType<typeof makeChain>
    );

    const res = await analyticsGET(makeReq('http://localhost/api/super-admin/analytics'));
    const data = await res.json();

    expect(data.data.mrr).toBe(3498);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await analyticsGET(makeReq('http://localhost/api/super-admin/analytics'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/users
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/users', () => {
  const userDocs = [{ _id: 'u1', name: 'Alice', email: 'alice@x.com', role: 'admin' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain({ _id: 'tid' }) as ReturnType<typeof makeChain>);
    vi.mocked(User.find).mockReturnValue(makeChain(userDocs) as ReturnType<typeof makeChain>);
    vi.mocked(User.countDocuments).mockResolvedValue(1);
  });

  it('returns 200 with users list', async () => {
    const res = await usersGET(makeReq('http://localhost/api/super-admin/users'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(userDocs);
    expect(data.pagination).toBeDefined();
  });

  it('returns empty list when tenantSlug not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const url = 'http://localhost/api/super-admin/users?tenantSlug=ghost';
    const res = await usersGET(makeReq(url));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it('excludes super_admin from query by default', async () => {
    await usersGET(makeReq('http://localhost/api/super-admin/users'));

    expect(User.find).toHaveBeenCalledWith(
      expect.objectContaining({ role: { $ne: 'super_admin' } })
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await usersGET(makeReq('http://localhost/api/super-admin/users'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/super-admin/users/[id]
// ---------------------------------------------------------------------------
describe('PUT /api/super-admin/users/[id]', () => {
  const mutableUser = {
    _id: 'u1',
    role: 'admin',
    isActive: true,
    tenantId: 'tid',
    save: vi.fn().mockResolvedValue(undefined),
  };
  const updatedUser = { _id: 'u1', name: 'Alice', role: 'admin', isActive: false };

  // Helper: first findById → mutable doc, second → lean chain
  function setupStandardFindById() {
    vi.mocked(User.findById)
      .mockReturnValueOnce(mutableUser as unknown as ReturnType<typeof User.findById>)
      .mockReturnValue(makeChain(updatedUser) as unknown as ReturnType<typeof User.findById>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    mockCreateAuditLog.mockResolvedValue(undefined);
    mutableUser.save.mockResolvedValue(undefined);
    // User.findById is set up per-test to avoid mockReturnValueOnce queue interference
  });

  it('returns 200 on deactivate action', async () => {
    setupStandardFindById();
    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'deactivate' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mutableUser.isActive).toBe(false);
  });

  it('returns 200 on activate action', async () => {
    const inactiveUser = { ...mutableUser, isActive: false, save: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(User.findById)
      .mockReturnValueOnce(inactiveUser as unknown as ReturnType<typeof User.findById>)
      .mockReturnValue(makeChain(updatedUser) as unknown as ReturnType<typeof User.findById>);

    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'activate' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 on change-role action', async () => {
    setupStandardFindById();
    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'change-role', role: 'manager' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    expect(res.status).toBe(200);
    expect(mutableUser.role).toBe('manager');
  });

  it('returns 400 on change-role with invalid role', async () => {
    setupStandardFindById();
    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'change-role', role: 'super_admin' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/role/i);
  });

  it('returns 400 on unknown action', async () => {
    setupStandardFindById();
    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'nuke' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/unknown action/i);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(User.findById).mockReturnValueOnce(null as unknown as ReturnType<typeof User.findById>);

    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/missing', 'PUT', { action: 'deactivate' }),
      { params: Promise.resolve({ id: 'missing' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it('returns 403 when trying to modify super_admin user', async () => {
    vi.mocked(User.findById).mockReturnValueOnce(
      { ...mutableUser, role: 'super_admin', save: vi.fn() } as unknown as ReturnType<typeof User.findById>
    );

    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/sa99', 'PUT', { action: 'deactivate' }),
      { params: Promise.resolve({ id: 'sa99' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/cannot modify/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await userIdPUT(
      makeReq('http://localhost/api/super-admin/users/u1', 'PUT', { action: 'deactivate' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/plans
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/plans', () => {
  const planDocs = [{ _id: 'p1', name: 'Starter', tier: 'starter', price: { monthly: 0 } }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(SubscriptionPlan.find).mockReturnValue(makeChain(planDocs) as ReturnType<typeof makeChain>);
  });

  it('returns 200 with plans list', async () => {
    const res = await plansGET(makeReq('http://localhost/api/super-admin/plans'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(planDocs);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await plansGET(makeReq('http://localhost/api/super-admin/plans'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/plans
// ---------------------------------------------------------------------------
describe('POST /api/super-admin/plans', () => {
  const newPlan = { _id: 'p99', name: 'Custom', tier: 'custom', price: { monthly: 500 } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue(null as unknown as never);
    vi.mocked(SubscriptionPlan.create).mockResolvedValue(newPlan as unknown as never);
  });

  it('returns 201 with created plan', async () => {
    const res = await plansPOST(
      makeReq('http://localhost/api/super-admin/plans', 'POST', {
        name: 'Custom',
        tier: 'custom',
        price: { monthly: 500 },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(newPlan);
  });

  it('returns 400 when name is missing', async () => {
    const res = await plansPOST(
      makeReq('http://localhost/api/super-admin/plans', 'POST', { tier: 'custom', price: { monthly: 0 } })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 when tier is missing', async () => {
    const res = await plansPOST(
      makeReq('http://localhost/api/super-admin/plans', 'POST', { name: 'X', price: { monthly: 0 } })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
  });

  it('returns 409 when tier already exists', async () => {
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue({ _id: 'existing' } as unknown as never);

    const res = await plansPOST(
      makeReq('http://localhost/api/super-admin/plans', 'POST', {
        name: 'Starter',
        tier: 'starter',
        price: { monthly: 0 },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already exists/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await plansPOST(
      makeReq('http://localhost/api/super-admin/plans', 'POST', { name: 'X', tier: 'x', price: { monthly: 0 } })
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/plans/[id]
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/plans/[id]', () => {
  const planDoc = { _id: 'p1', name: 'Starter', tier: 'starter' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(SubscriptionPlan.findById).mockReturnValue(makeChain(planDoc) as ReturnType<typeof makeChain>);
  });

  it('returns 200 with plan data', async () => {
    const res = await planIdGET(makeReq('http://localhost/api/super-admin/plans/p1'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(planDoc);
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findById).mockReturnValue(makeChain(null) as ReturnType<typeof makeChain>);

    const res = await planIdGET(makeReq('http://localhost/api/super-admin/plans/ghost'), {
      params: Promise.resolve({ id: 'ghost' }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await planIdGET(makeReq('http://localhost/api/super-admin/plans/p1'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/super-admin/plans/[id]
// ---------------------------------------------------------------------------
describe('PUT /api/super-admin/plans/[id]', () => {
  const updatedPlan = { _id: 'p1', name: 'Starter+', tier: 'starter' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(SubscriptionPlan.findByIdAndUpdate).mockResolvedValue(updatedPlan as unknown as never);
  });

  it('returns 200 with updated plan', async () => {
    const res = await planIdPUT(
      makeReq('http://localhost/api/super-admin/plans/p1', 'PUT', { name: 'Starter+' }),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(updatedPlan);
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findByIdAndUpdate).mockResolvedValue(null as unknown as never);

    const res = await planIdPUT(
      makeReq('http://localhost/api/super-admin/plans/ghost', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: 'ghost' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await planIdPUT(
      makeReq('http://localhost/api/super-admin/plans/p1', 'PUT', {}),
      { params: Promise.resolve({ id: 'p1' }) }
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/super-admin/plans/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/super-admin/plans/[id]', () => {
  const planDoc = {
    _id: 'p1',
    name: 'Starter',
    tier: 'starter',
    isActive: true,
    deleteOne: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    planDoc.deleteOne.mockResolvedValue(undefined);
    planDoc.save.mockResolvedValue(undefined);
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue(planDoc as unknown as never);
    vi.mocked(Subscription.countDocuments).mockResolvedValue(0);
  });

  it('hard-deletes plan when no active subscriptions reference it', async () => {
    const res = await planIdDELETE(makeReq('http://localhost/api/super-admin/plans/p1', 'DELETE'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/deleted/i);
    expect(planDoc.deleteOne).toHaveBeenCalled();
  });

  it('soft-deletes (deactivates) plan when active subscriptions exist', async () => {
    vi.mocked(Subscription.countDocuments).mockResolvedValue(3);

    const res = await planIdDELETE(makeReq('http://localhost/api/super-admin/plans/p1', 'DELETE'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/deactivated/i);
    expect(planDoc.deleteOne).not.toHaveBeenCalled();
    expect(planDoc.save).toHaveBeenCalled();
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue(null as unknown as never);

    const res = await planIdDELETE(makeReq('http://localhost/api/super-admin/plans/ghost', 'DELETE'), {
      params: Promise.resolve({ id: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await planIdDELETE(makeReq('http://localhost/api/super-admin/plans/p1', 'DELETE'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/system/health
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/system/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    (mockConnection as { db: unknown }).db = mockDb;
    mockDb.admin.mockReturnValue({ ping: vi.fn().mockResolvedValue(true) });
    mockDb.listCollections.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ name: 'tenants' }]) });
    mockDb.collection.mockReturnValue({ estimatedDocumentCount: vi.fn().mockResolvedValue(5) });
  });

  it('returns 200 with health data when DB is connected', async () => {
    const res = await healthGET(makeReq('http://localhost/api/super-admin/system/health'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
    expect(data.data).toHaveProperty('latencyMs');
    expect(data.data).toHaveProperty('collections');
  });

  it('returns 503 when DB is not connected (db is null)', async () => {
    (mockConnection as { db: unknown }).db = null;

    const res = await healthGET(makeReq('http://localhost/api/super-admin/system/health'));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.success).toBe(false);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await healthGET(makeReq('http://localhost/api/super-admin/system/health'));
    expect(res.status).toBe(401);
  });

  it('returns 503 when DB ping throws', async () => {
    mockDb.admin.mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error('Connection timeout')),
    });

    const res = await healthGET(makeReq('http://localhost/api/super-admin/system/health'));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.data.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/system/seed
// ---------------------------------------------------------------------------
describe('POST /api/super-admin/system/seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(saUser);
    mockHandleApiError.mockResolvedValue(errResponse());
    vi.mocked(SubscriptionPlan.findOneAndUpdate).mockResolvedValue({} as unknown as never);
  });

  it('returns 200 and seeds all 4 default plans with target=plans', async () => {
    const res = await seedPOST(
      makeReq('http://localhost/api/super-admin/system/seed', 'POST', { target: 'plans' })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.seeded).toHaveLength(4);
    expect(data.seeded).toContain('plan:starter');
    expect(data.seeded).toContain('plan:pro');
    expect(data.seeded).toContain('plan:business');
    expect(data.seeded).toContain('plan:enterprise');
    expect(SubscriptionPlan.findOneAndUpdate).toHaveBeenCalledTimes(4);
  });

  it('returns 200 and seeds with target=all', async () => {
    const res = await seedPOST(
      makeReq('http://localhost/api/super-admin/system/seed', 'POST', { target: 'all' })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.seeded).toHaveLength(4);
  });

  it('returns 400 for invalid target', async () => {
    const res = await seedPOST(
      makeReq('http://localhost/api/super-admin/system/seed', 'POST', { target: 'users' })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/target/i);
  });

  it('returns 400 when target is missing', async () => {
    const res = await seedPOST(
      makeReq('http://localhost/api/super-admin/system/seed', 'POST', {})
    );
    const data = await res.json();

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    const res = await seedPOST(
      makeReq('http://localhost/api/super-admin/system/seed', 'POST', { target: 'plans' })
    );
    expect(res.status).toBe(401);
  });
});
