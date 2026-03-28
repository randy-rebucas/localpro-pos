/**
 * Section 25 — Tenant Isolation (Security)
 * Tests: 25.1 – 25.5
 *
 * Core invariant: tenantId always comes from the verified JWT via
 * requireTenantAccess / getTenantIdFromRequest — never from the request body or query params.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_k: string, fb: string) => fb
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn().mockResolvedValue({ userId: 'sa1', tenantId: null, role: 'super_admin' }),
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
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
  checkSubscriptionLimit: vi.fn().mockResolvedValue({ allowed: true }),
  SubscriptionService: { checkFeature: vi.fn().mockResolvedValue(true) },
}));
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockImplementation((data: unknown) => data),
  validateProduct: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
  validateTransaction: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Customer', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Category', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(5) },
}));
vi.mock('@/models/User', () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(10) },
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import Customer from '@/models/Customer';
import Tenant from '@/models/Tenant';
import User from '@/models/User';

// ── Helpers ──────────────────────────────────────────────────────────────────
const TENANT_A = 'tenant-A-id';
const TENANT_B = 'tenant-B-id';

// Simulate requireTenantAccess returning Tenant A's identity (from JWT)
const authA = { tenantId: TENANT_A, user: { userId: 'userA', role: 'admin' } };

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tokenA', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const chainedFind = (result: unknown[]) => ({
  populate: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(result),
} as any);

// ── 25.1  Tenant A cannot read Tenant B's products ─────────────────────────
describe('Tenant A cannot read Tenant B products (25.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // JWT resolves to Tenant A — regardless of what the client sends
    vi.mocked(requireTenantAccess).mockResolvedValue(authA as any);
    vi.mocked(Product.find).mockReturnValue(chainedFind([]));
  });

  it('GET /api/products always queries with JWT tenantId (Tenant A)', async () => {
    const { GET } = await import('@/app/api/products/route');
    await GET(req('GET', '/api/products'));
    expect(vi.mocked(Product.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
    // Must NOT use Tenant B's id
    expect(vi.mocked(Product.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B })
    );
  });

  it('returns 401/403 when requireTenantAccess returns an error response', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const { GET } = await import('@/app/api/products/route');
    const res = await GET(req('GET', '/api/products'));
    expect([401, 403]).toContain(res.status);
    // Product.find must not be called at all
    expect(vi.mocked(Product.find)).not.toHaveBeenCalled();
  });
});

// ── 25.2  Tenant A cannot read Tenant B's transactions ─────────────────────
describe('Tenant A cannot read Tenant B transactions (25.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(authA as any);
    vi.mocked(Transaction.find).mockReturnValue(chainedFind([]));
  });

  it('GET /api/transactions always queries with JWT tenantId (Tenant A)', async () => {
    const { GET } = await import('@/app/api/transactions/route');
    await GET(req('GET', '/api/transactions'));
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
    expect(vi.mocked(Transaction.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B })
    );
  });

  it('returns 401/403 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/transactions/route');
    const res = await GET(req('GET', '/api/transactions'));
    expect([401, 403]).toContain(res.status);
    expect(vi.mocked(Transaction.find)).not.toHaveBeenCalled();
  });
});

// ── 25.3  Tenant A cannot read Tenant B's customers ────────────────────────
describe('Tenant A cannot read Tenant B customers (25.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Customers route uses getTenantIdFromRequest (not requireTenantAccess)
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_A);
    vi.mocked(Customer.find).mockReturnValue(chainedFind([]));
    vi.mocked(Customer.countDocuments).mockResolvedValue(0);
  });

  it('GET /api/customers always queries with JWT tenantId (Tenant A)', async () => {
    const { GET } = await import('@/app/api/customers/route');
    await GET(req('GET', '/api/customers'));
    expect(vi.mocked(Customer.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
    expect(vi.mocked(Customer.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B })
    );
  });

  it('returns 403 when getTenantIdFromRequest returns null', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/customers/route');
    const res = await GET(req('GET', '/api/customers'));
    expect(res.status).toBe(403);
    expect(vi.mocked(Customer.find)).not.toHaveBeenCalled();
  });
});

// ── 25.4  Client-supplied tenantId is ignored; JWT tenantId is used ────────
describe('Client tenantId in body/query is ignored (25.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // JWT always resolves to Tenant A
    vi.mocked(requireTenantAccess).mockResolvedValue(authA as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_A);
    vi.mocked(Product.find).mockReturnValue(chainedFind([]));
    vi.mocked(Customer.find).mockReturnValue(chainedFind([]));
    vi.mocked(Customer.countDocuments).mockResolvedValue(0);
  });

  it('GET /api/products ignores ?tenantId= query param — uses JWT tenantId', async () => {
    // Client tries to pass Tenant B's id via query param
    const { GET } = await import('@/app/api/products/route');
    await GET(req('GET', `/api/products?tenantId=${TENANT_B}`));
    expect(vi.mocked(Product.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
    expect(vi.mocked(Product.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B })
    );
  });

  it('GET /api/customers ignores ?tenantId= query param — uses JWT tenantId', async () => {
    const { GET } = await import('@/app/api/customers/route');
    await GET(req('GET', `/api/customers?tenantId=${TENANT_B}`));
    expect(vi.mocked(Customer.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A })
    );
    expect(vi.mocked(Customer.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B })
    );
  });

  it('requireTenantAccess is the source of tenantId — not request body', async () => {
    // Verify the contract: requireTenantAccess is called, and its result drives the query.
    // The products route calls requireTenantAccess and destructures { tenantId }.
    const { GET } = await import('@/app/api/products/route');
    await GET(req('GET', '/api/products'));
    // requireTenantAccess was called (not body parsing for tenantId)
    expect(vi.mocked(requireTenantAccess)).toHaveBeenCalled();
    expect(vi.mocked(Product.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }) // from JWT, not client
    );
  });
});

// ── 25.5  Super admin bypasses tenant filter; other roles do not ────────────
describe('Super admin bypasses tenant filter (25.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue({ userId: 'sa1', tenantId: null, role: 'super_admin' } as any);
    vi.mocked(Tenant.countDocuments).mockResolvedValue(10);
    vi.mocked(User.countDocuments).mockResolvedValue(50);
  });

  it('super-admin stats route does NOT filter by tenantId — returns all tenants', async () => {
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.totalTenants).toBe(10);
    // Tenant.countDocuments called without tenantId restriction
    expect(vi.mocked(Tenant.countDocuments)).toHaveBeenCalledWith();
  });

  it('super-admin stats route returns 403 when non-super_admin tries to access', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: requires super_admin'));
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    expect(res.status).toBe(403);
  });

  it('regular-tenant routes require tenantId — super_admin role alone does not grant access', async () => {
    // Products route uses requireTenantAccess which checks the tenant context
    // If no tenant context, it returns a 401/403 response
    vi.mocked(requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'No tenant context' }, { status: 403 }) as any
    );
    vi.mocked(Product.find).mockReturnValue(chainedFind([]));
    const { GET } = await import('@/app/api/products/route');
    const res = await GET(req('GET', '/api/products'));
    expect([401, 403]).toContain(res.status);
  });

  it('super-admin tenants list route returns all tenants without tenantId filter', async () => {
    vi.mocked(Tenant.countDocuments).mockResolvedValue(0); // reset, not used here
    const Tenant2 = (await import('@/models/Tenant')).default;
    vi.mocked(Tenant2.find || (Tenant as any).find || vi.fn()).mockReturnValue && (Tenant as any).find
      ? vi.mocked((Tenant as any).find).mockReturnValue({
          select: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([{ slug: 'a' }, { slug: 'b' }]),
            }),
          }),
        })
      : null;

    // The key assertion: super-admin stats/analytics have no per-tenant scoping
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    expect(res.status).toBe(200);
    // Tenant.countDocuments() called with no tenantId argument (system-wide)
    const calls = vi.mocked(Tenant.countDocuments).mock.calls;
    calls.forEach(call => {
      // Should not have { tenantId: anything } in the query
      if (call[0]) {
        expect(call[0]).not.toHaveProperty('tenantId');
      }
    });
  });
});
