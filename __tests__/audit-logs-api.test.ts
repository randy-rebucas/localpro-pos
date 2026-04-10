import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const {
  mockConnectDB,
  mockRequireAuth,
  mockGetValidationTranslator,
  mockAuditLogFind,
  mockAuditLogCountDocuments,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockGetValidationTranslator: vi.fn(),
  mockAuditLogFind: vi.fn(),
  mockAuditLogCountDocuments: vi.fn(),
  mockHandleApiError: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/auth', () => ({ requireAuth: mockRequireAuth }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: mockGetValidationTranslator,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/models/AuditLog', () => ({
  default: {
    find: mockAuditLogFind,
    countDocuments: mockAuditLogCountDocuments,
  },
}));
vi.mock('@/models/User', () => ({ default: {} }));

import { GET } from '@/app/api/audit-logs/route';
import AuditLog from '@/models/AuditLog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const tFn = (_: string, fallback: string) => fallback;

function makeReq(url = 'http://localhost/api/audit-logs') {
  return new NextRequest(url);
}

function makeChain(docs: unknown[] = []) {
  const chain = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/audit-logs', () => {
  let chain: ReturnType<typeof makeChain>;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = makeChain();
    mockConnectDB.mockResolvedValue(undefined);
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: 'tenant1', role: 'admin' });
    mockGetValidationTranslator.mockResolvedValue(tFn);
    mockAuditLogFind.mockReturnValue(chain);
    mockAuditLogCountDocuments.mockResolvedValue(0);
    mockHandleApiError.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
  });

  it('returns 200 with logs for admin role', async () => {
    const logs = [{ _id: 'l1', action: 'product.create', entityType: 'Product' }];
    chain.lean.mockResolvedValue(logs);
    mockAuditLogCountDocuments.mockResolvedValue(1);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(logs);
    expect(data.pagination).toEqual({ page: 1, limit: 50, total: 1, pages: 1 });
  });

  it('returns 200 with logs for owner role', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: 'tenant1', role: 'owner' });
    const logs = [{ _id: 'l2', action: 'user.create' }];
    chain.lean.mockResolvedValue(logs);
    mockAuditLogCountDocuments.mockResolvedValue(1);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(logs);
  });

  it('returns 403 for manager role', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: 'tenant1', role: 'manager' });

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Forbidden: Admin access required');
  });

  it('returns 403 for cashier role', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: 'tenant1', role: 'cashier' });

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('applies action, entityType, userId filters', async () => {
    const url = 'http://localhost/api/audit-logs?action=create&entityType=Product&userId=u99';
    await GET(makeReq(url));

    expect(AuditLog.find).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entityType: 'Product',
        userId: 'u99',
        tenantId: 'tenant1',
      })
    );
  });

  it('applies date range filter when both startDate and endDate provided', async () => {
    const url = 'http://localhost/api/audit-logs?startDate=2024-01-01&endDate=2024-12-31';
    await GET(makeReq(url));

    expect(AuditLog.find).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      })
    );
  });

  it('applies only startDate filter', async () => {
    const url = 'http://localhost/api/audit-logs?startDate=2024-06-01';
    await GET(makeReq(url));

    expect(AuditLog.find).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: expect.objectContaining({ $gte: expect.any(Date) }),
      })
    );
  });

  it('paginates correctly with custom page and limit', async () => {
    const url = 'http://localhost/api/audit-logs?page=3&limit=10';
    mockAuditLogCountDocuments.mockResolvedValue(50);

    const res = await GET(makeReq(url));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(chain.skip).toHaveBeenCalledWith(20); // (3 - 1) * 10
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(data.pagination.pages).toBe(5);
  });

  it('caps limit at 200', async () => {
    const url = 'http://localhost/api/audit-logs?limit=9999';
    await GET(makeReq(url));

    expect(chain.limit).toHaveBeenCalledWith(200);
  });

  it('enforces minimum limit of 1', async () => {
    const url = 'http://localhost/api/audit-logs?limit=0';
    await GET(makeReq(url));

    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('queries only the authenticated tenant\'s logs', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: 'myTenant', role: 'admin' });

    await GET(makeReq());

    expect(AuditLog.find).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'myTenant' })
    );
  });

  it('populates userId and sorts by createdAt descending', async () => {
    await GET(makeReq());

    expect(chain.populate).toHaveBeenCalledWith('userId', 'name email');
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });
});
