/**
 * Section 20 — Super Admin
 * Tests: 20.1 – 20.13
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ userId: 'sa1', tenantId: null, role: 'super_admin' }),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockImplementation(() =>
    new Response(JSON.stringify({ success: false, error: 'Error' }), { status: 500 })
  ),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/currency', () => ({
  getDefaultTenantSettings: vi.fn().mockReturnValue({ currency: 'PHP', language: 'en' }),
}));
vi.mock('@/lib/business-types', () => ({
  applyBusinessTypeDefaults: vi.fn().mockImplementation((settings: object) => settings),
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));
vi.mock('@/models/User', () => ({
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
    findByIdAndUpdate: vi.fn(),
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
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));
vi.mock('@/models/AuditLog', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal() as any;
  const mockPing = vi.fn().mockResolvedValue({});
  const mockToArray = vi.fn().mockResolvedValue([
    { name: 'tenants' }, { name: 'users' }, { name: 'subscriptions' },
  ]);
  const mockEstimatedCount = vi.fn().mockResolvedValue(5);
  return {
    ...actual,
    default: {
      ...actual.default,
      connection: {
        db: {
          admin: vi.fn().mockReturnValue({ ping: mockPing }),
          listCollections: vi.fn().mockReturnValue({ toArray: mockToArray }),
          collection: vi.fn().mockReturnValue({ estimatedDocumentCount: mockEstimatedCount }),
        },
      },
    },
  };
});

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireRole } from '@/lib/auth';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Transaction from '@/models/Transaction';
import AuditLog from '@/models/AuditLog';

// ── Fixtures ───────────────────────────────────────────────────────────────
const SUPER_ADMIN = { userId: 'sa1', tenantId: null, role: 'super_admin' };
const TENANT_ID = 'tenant123';
const PLAN_ID = 'plan1';

const mockTenant = {
  _id: TENANT_ID, slug: 'acme', name: 'Acme Corp',
  isActive: true, createdAt: new Date('2026-01-01'),
  settings: { currency: 'PHP', businessType: 'retail' },
};

const mockPlan = {
  _id: PLAN_ID, name: 'Pro', tier: 'pro', isActive: true,
  price: { monthly: 999, currency: 'PHP' },
  features: { maxUsers: 10, enableReports: true },
  isCustom: false,
  save: vi.fn().mockResolvedValue(undefined),
  deleteOne: vi.fn().mockResolvedValue(undefined),
};

const mockSubscription = {
  _id: 'sub1', tenantId: TENANT_ID, planId: PLAN_ID,
  status: 'trial', isTrial: true, billingCycle: 'monthly',
  startDate: new Date('2026-01-01'),
  trialEndDate: new Date('2026-01-15'),
  save: vi.fn().mockResolvedValue(undefined),
};

const mockLog = {
  _id: 'log1', tenantId: TENANT_ID,
  action: 'CREATE', entityType: 'product',
  createdAt: new Date('2026-01-01'),
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer supertoken', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 20.1  GET /api/super-admin/stats — system-wide metrics ────────────────
describe('GET /api/super-admin/stats (20.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.countDocuments)
      .mockResolvedValueOnce(10) // totalTenants
      .mockResolvedValueOnce(8); // activeTenants
    vi.mocked(User.countDocuments).mockResolvedValue(42);
  });

  it('returns system-wide tenant and user statistics', async () => {
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalTenants).toBe(10);
    expect(body.data.activeTenants).toBe(8);
    expect(body.data.inactiveTenants).toBe(2);
    expect(body.data.totalUsers).toBe(42);
  });

  it('returns 403 when role is not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    expect(res.status).toBe(401);
  });
});

// ── 20.2  GET /api/super-admin/analytics — cross-tenant analytics ──────────
describe('GET /api/super-admin/analytics (20.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Subscription.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { planId: { price: { monthly: 999 } } },
          { planId: { price: { monthly: 2499 } } },
        ]),
      }),
    } as any);
    vi.mocked(Subscription.aggregate).mockResolvedValue([
      { tier: 'pro', name: 'Pro', count: 5 },
    ] as any);
    vi.mocked(Transaction.countDocuments)
      .mockResolvedValueOnce(150)  // last 30
      .mockResolvedValueOnce(400)  // last 90
      .mockResolvedValueOnce(1200); // total
    vi.mocked(Transaction.aggregate)
      .mockResolvedValueOnce([{ _id: null, total: 50000 }]) // revenue agg
      .mockResolvedValueOnce([{ tenantId: TENANT_ID, txCount: 300, revenue: 30000, name: 'Acme' }]); // top tenants
    vi.mocked(Tenant.aggregate).mockResolvedValue([
      { month: '2026-01', count: 3 },
    ] as any);
  });

  it('returns MRR and cross-tenant analytics', async () => {
    const { GET } = await import('@/app/api/super-admin/analytics/route');
    const res = await GET(req('GET', '/api/super-admin/analytics'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mrr).toBe(3498); // 999 + 2499
    expect(body.data.transactions.last30).toBe(150);
    expect(body.data.transactions.total).toBe(1200);
    expect(body.data.revenueLastMonth).toBe(50000);
  });

  it('returns 403 when not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { GET } = await import('@/app/api/super-admin/analytics/route');
    const res = await GET(req('GET', '/api/super-admin/analytics'));
    expect(res.status).toBe(403);
  });
});

// ── 20.4  GET/POST /api/super-admin/tenants ────────────────────────────────
describe('GET /api/super-admin/tenants (20.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockTenant]),
        }),
      }),
    } as any);
  });

  it('returns list of all tenants', async () => {
    const { GET } = await import('@/app/api/super-admin/tenants/route');
    const res = await GET(req('GET', '/api/super-admin/tenants'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('acme');
  });

  it('filters by active status', async () => {
    const { GET } = await import('@/app/api/super-admin/tenants/route');
    await GET(req('GET', '/api/super-admin/tenants?active=true'));
    expect(vi.mocked(Tenant.find)).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('returns 403 when not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { GET } = await import('@/app/api/super-admin/tenants/route');
    const res = await GET(req('GET', '/api/super-admin/tenants'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/super-admin/tenants (20.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);
    vi.mocked(Tenant.create).mockResolvedValue({
      ...mockTenant, _id: { toString: () => TENANT_ID },
    } as any);
  });

  it('creates a new tenant and returns 201', async () => {
    const { POST } = await import('@/app/api/super-admin/tenants/route');
    const res = await POST(req('POST', '/api/super-admin/tenants', {
      slug: 'new-shop', name: 'New Shop',
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when slug is missing', async () => {
    const { POST } = await import('@/app/api/super-admin/tenants/route');
    const res = await POST(req('POST', '/api/super-admin/tenants', { name: 'No Slug' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid slug characters', async () => {
    const { POST } = await import('@/app/api/super-admin/tenants/route');
    const res = await POST(req('POST', '/api/super-admin/tenants', {
      slug: 'INVALID SLUG!', name: 'Bad',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when slug already exists', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    const { POST } = await import('@/app/api/super-admin/tenants/route');
    const res = await POST(req('POST', '/api/super-admin/tenants', {
      slug: 'acme', name: 'Duplicate',
    }));
    expect(res.status).toBe(400);
  });
});

// ── 20.5  PUT /api/super-admin/tenants/[slug] ─────────────────────────────
describe('PUT /api/super-admin/tenants/[slug] (20.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenant),
    } as any);
    vi.mocked(Tenant.findOneAndUpdate).mockResolvedValue({
      ...mockTenant, name: 'Acme Updated',
    } as any);
  });

  it('updates tenant and returns 200', async () => {
    const { PUT } = await import('@/app/api/super-admin/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/tenants/acme', { name: 'Acme Updated' }),
      { params: Promise.resolve({ slug: 'acme' }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('can deactivate a tenant', async () => {
    const { PUT } = await import('@/app/api/super-admin/tenants/[slug]/route');
    await PUT(
      req('PUT', '/api/super-admin/tenants/acme', { isActive: false }),
      { params: Promise.resolve({ slug: 'acme' }) }
    );
    expect(vi.mocked(Tenant.findOneAndUpdate)).toHaveBeenCalledWith(
      { slug: 'acme' },
      expect.objectContaining({ isActive: false }),
      expect.any(Object)
    );
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { PUT } = await import('@/app/api/super-admin/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/tenants/no-such', { name: 'X' }),
      { params: Promise.resolve({ slug: 'no-such' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 20.6  GET /api/super-admin/users ──────────────────────────────────────
describe('GET /api/super-admin/users (20.6)', () => {
  const mockUser = {
    _id: 'u1', name: 'Alice', email: 'alice@test.com',
    role: 'admin', isActive: true, tenantId: { slug: 'acme', name: 'Acme Corp' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TENANT_ID }),
      }),
    } as any);
    vi.mocked(User.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([mockUser]),
              }),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(User.countDocuments).mockResolvedValue(1);
  });

  it('returns paginated users with pagination metadata', async () => {
    const { GET } = await import('@/app/api/super-admin/users/route');
    const res = await GET(req('GET', '/api/super-admin/users'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('excludes super_admin accounts from results', async () => {
    const { GET } = await import('@/app/api/super-admin/users/route');
    await GET(req('GET', '/api/super-admin/users'));
    expect(vi.mocked(User.find)).toHaveBeenCalledWith(
      expect.objectContaining({ role: { $ne: 'super_admin' } })
    );
  });

  it('returns empty list for unknown tenantSlug', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as any);
    const { GET } = await import('@/app/api/super-admin/users/route');
    const res = await GET(req('GET', '/api/super-admin/users?tenantSlug=unknown'));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ── 20.7  GET/POST /api/super-admin/plans ─────────────────────────────────
describe('GET /api/super-admin/plans (20.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(SubscriptionPlan.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockPlan]),
      }),
    } as any);
  });

  it('returns all subscription plans', async () => {
    const { GET } = await import('@/app/api/super-admin/plans/route');
    const res = await GET(req('GET', '/api/super-admin/plans'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].tier).toBe('pro');
  });
});

describe('POST /api/super-admin/plans (20.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue(null as any);
    vi.mocked(SubscriptionPlan.create).mockResolvedValue(mockPlan as any);
  });

  it('creates a new plan and returns 201', async () => {
    const { POST } = await import('@/app/api/super-admin/plans/route');
    const res = await POST(req('POST', '/api/super-admin/plans', {
      name: 'Pro', tier: 'pro', price: { monthly: 999 },
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/super-admin/plans/route');
    const res = await POST(req('POST', '/api/super-admin/plans', {
      tier: 'pro', price: { monthly: 999 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when tier already exists', async () => {
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue(mockPlan as any);
    const { POST } = await import('@/app/api/super-admin/plans/route');
    const res = await POST(req('POST', '/api/super-admin/plans', {
      name: 'Pro', tier: 'pro', price: { monthly: 999 },
    }));
    expect(res.status).toBe(409);
  });
});

// ── 20.8  PUT/DELETE /api/super-admin/plans/[id] ──────────────────────────
describe('PUT /api/super-admin/plans/[id] (20.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(SubscriptionPlan.findByIdAndUpdate).mockResolvedValue({
      ...mockPlan, name: 'Pro Updated',
    } as any);
  });

  it('updates plan and returns 200', async () => {
    const { PUT } = await import('@/app/api/super-admin/plans/[id]/route');
    const res = await PUT(
      req('PUT', `/api/super-admin/plans/${PLAN_ID}`, { name: 'Pro Updated' }),
      { params: Promise.resolve({ id: PLAN_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findByIdAndUpdate).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/super-admin/plans/[id]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/plans/bad-id', { name: 'X' }),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/super-admin/plans/[id] (20.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue({ ...mockPlan } as any);
    vi.mocked(Subscription.countDocuments).mockResolvedValue(0);
  });

  it('hard-deletes plan when no active subscriptions', async () => {
    const planDoc = { ...mockPlan, deleteOne: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue(planDoc as any);
    const { DELETE } = await import('@/app/api/super-admin/plans/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/super-admin/plans/${PLAN_ID}`),
      { params: Promise.resolve({ id: PLAN_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(planDoc.deleteOne).toHaveBeenCalled();
  });

  it('soft-deletes plan when active subscriptions exist', async () => {
    vi.mocked(Subscription.countDocuments).mockResolvedValue(3);
    const planDoc = { ...mockPlan, isActive: true, save: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue(planDoc as any);
    const { DELETE } = await import('@/app/api/super-admin/plans/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/super-admin/plans/${PLAN_ID}`),
      { params: Promise.resolve({ id: PLAN_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toContain('deactivated');
    expect(planDoc.isActive).toBe(false);
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findById).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/super-admin/plans/[id]/route');
    const res = await DELETE(
      req('DELETE', '/api/super-admin/plans/bad-id'),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 20.9  GET /api/super-admin/subscriptions ──────────────────────────────
describe('GET /api/super-admin/subscriptions (20.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Subscription.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              skip: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue([mockSubscription]),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(Subscription.countDocuments).mockResolvedValue(1);
  });

  it('returns paginated list of all tenant subscriptions', async () => {
    const { GET } = await import('@/app/api/super-admin/subscriptions/route');
    const res = await GET(req('GET', '/api/super-admin/subscriptions'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('filters by status', async () => {
    const { GET } = await import('@/app/api/super-admin/subscriptions/route');
    await GET(req('GET', '/api/super-admin/subscriptions?status=trial'));
    expect(vi.mocked(Subscription.find)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'trial' })
    );
  });
});

// ── 20.10  PUT /api/super-admin/subscriptions/[tenantSlug] ────────────────
describe('PUT /api/super-admin/subscriptions/[tenantSlug] (20.10)', () => {
  let subDoc: typeof mockSubscription & { save: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TENANT_ID, slug: 'acme', name: 'Acme' }),
      }),
    } as any);
    subDoc = { ...mockSubscription, save: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(Subscription.findOne).mockResolvedValue(subDoc as any);
    vi.mocked(Subscription.findById).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...subDoc, status: 'active' }),
      }),
    } as any);
    vi.mocked(SubscriptionPlan.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockPlan),
    } as any);
  });

  it('assigns a plan to a tenant subscription', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'assign-plan', planId: PLAN_ID }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(subDoc.save).toHaveBeenCalled();
  });

  it('extends trial by specified days', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'extend-trial', days: 7 }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    expect(subDoc.save).toHaveBeenCalled();
    expect(subDoc.status).toBe('trial');
  });

  it('cancels subscription', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    expect(subDoc.status).toBe('cancelled');
    expect(subDoc.save).toHaveBeenCalled();
  });

  it('activates subscription', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'activate' }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    expect(subDoc.status).toBe('active');
    expect(subDoc.save).toHaveBeenCalled();
  });

  it('returns 400 for unknown action', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'unknown' }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as any);
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/subscriptions/no-such', { action: 'cancel' }),
      { params: Promise.resolve({ tenantSlug: 'no-such' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when extend-trial days is not positive', async () => {
    const { PUT } = await import('@/app/api/super-admin/subscriptions/[tenantSlug]/route');
    const res = await PUT(
      req('PUT', '/api/super-admin/subscriptions/acme', { action: 'extend-trial', days: 0 }),
      { params: Promise.resolve({ tenantSlug: 'acme' }) }
    );
    expect(res.status).toBe(400);
  });
});

// ── 20.11  GET /api/super-admin/logs ──────────────────────────────────────
describe('GET /api/super-admin/logs (20.11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    const auditChain = {
      populate: vi.fn(),
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      lean: vi.fn().mockResolvedValue([mockLog]),
    };
    auditChain.populate.mockReturnValue(auditChain);
    auditChain.sort.mockReturnValue(auditChain);
    auditChain.skip.mockReturnValue(auditChain);
    auditChain.limit.mockReturnValue(auditChain);
    vi.mocked(AuditLog.find).mockReturnValue(auditChain as any);
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(1);
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: TENANT_ID }),
      }),
    } as any);
  });

  it('returns audit logs across all tenants', async () => {
    const { GET } = await import('@/app/api/super-admin/logs/route');
    const res = await GET(req('GET', '/api/super-admin/logs'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('filters by action', async () => {
    const { GET } = await import('@/app/api/super-admin/logs/route');
    await GET(req('GET', '/api/super-admin/logs?action=CREATE'));
    expect(vi.mocked(AuditLog.find)).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ $regex: 'CREATE' }) })
    );
  });

  it('returns empty list for unknown tenantSlug', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as any);
    const { GET } = await import('@/app/api/super-admin/logs/route');
    const res = await GET(req('GET', '/api/super-admin/logs?tenantSlug=no-such'));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ── 20.12  GET /api/super-admin/system/health ─────────────────────────────
describe('GET /api/super-admin/system/health (20.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
  });

  it('returns healthy status with collection stats', async () => {
    const { GET } = await import('@/app/api/super-admin/system/health/route');
    const res = await GET(req('GET', '/api/super-admin/system/health'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.latencyMs).toBe('number');
    expect(Array.isArray(body.data.collections)).toBe(true);
  });

  it('returns 403 when not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { GET } = await import('@/app/api/super-admin/system/health/route');
    const res = await GET(req('GET', '/api/super-admin/system/health'));
    expect(res.status).toBe(403);
  });
});

// ── 20.13  POST /api/super-admin/system/seed ──────────────────────────────
describe('POST /api/super-admin/system/seed (20.13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as any);
    vi.mocked(SubscriptionPlan.findOneAndUpdate).mockResolvedValue(mockPlan as any);
  });

  it('seeds default plans and returns seeded list', async () => {
    const { POST } = await import('@/app/api/super-admin/system/seed/route');
    const res = await POST(req('POST', '/api/super-admin/system/seed', { target: 'plans' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.seeded).toContain('plan:starter');
    expect(body.seeded).toContain('plan:pro');
    expect(vi.mocked(SubscriptionPlan.findOneAndUpdate)).toHaveBeenCalled();
  });

  it('seeds all data when target is "all"', async () => {
    const { POST } = await import('@/app/api/super-admin/system/seed/route');
    const res = await POST(req('POST', '/api/super-admin/system/seed', { target: 'all' }));
    const body = await res.json();
    expect(body.seeded.length).toBeGreaterThan(0);
  });

  it('returns 400 for invalid target', async () => {
    const { POST } = await import('@/app/api/super-admin/system/seed/route');
    const res = await POST(req('POST', '/api/super-admin/system/seed', { target: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { POST } = await import('@/app/api/super-admin/system/seed/route');
    const res = await POST(req('POST', '/api/super-admin/system/seed', { target: 'plans' }));
    expect(res.status).toBe(403);
  });
});
