process.env.JWT_SECRET = 'test-secret-for-upload-api-tests-32chars!!!!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFileFindMany = vi.fn();
const mockFileFindFirst = vi.fn();
const mockFileCreate = vi.fn();
const mockFileDelete = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    file: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      findFirst: (...args: unknown[]) => mockFileFindFirst(...args),
      create: (...args: unknown[]) => mockFileCreate(...args),
      delete: (...args: unknown[]) => mockFileDelete(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockDeleteFromCloudinary = vi.fn();
vi.mock('@/lib/cloudinary', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: (...args: unknown[]) => mockDeleteFromCloudinary(...args),
}));

const mockHasAnyTenantPermission = vi.fn();
const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasAnyTenantPermission: (...args: unknown[]) => mockHasAnyTenantPermission(...args),
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

// Keep the real violation error + its 403 responder; only tenant resolution is mocked.
const mockGetTenantIdForUser = vi.fn();
vi.mock('@/lib/api-tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-tenant')>();
  return {
    ...actual,
    getTenantIdForUser: (...args: unknown[]) => mockGetTenantIdForUser(...args),
  };
});

import { GET, DELETE } from '@/app/api/upload/route';
import { TenantAccessViolationError } from '@/lib/api-tenant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

function createRequest(url: string, method: string = 'GET'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), { method });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string) {
  mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId, email: 'test@example.com', role: 'owner' });
  mockGetTenantIdForUser.mockResolvedValue(tenantId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasAnyTenantPermission.mockResolvedValue(true);
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/api/upload — auth and tenant errors are not server errors', () => {
  it('returns 401 (not 500) when the caller is not logged in', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const { status, body } = await parseResponse(await GET(createRequest('/api/upload')));
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 403 with a redirect (not 500) for a cross-tenant request', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_A, email: 'a@x.test', role: 'owner' });
    mockGetTenantIdForUser.mockRejectedValue(
      new TenantAccessViolationError('other-shop', 'Forbidden: Access denied to tenant other-shop')
    );
    for (const res of [
      await GET(createRequest('/api/upload?tenant=other-shop')),
      await DELETE(createRequest('/api/upload?tenant=other-shop&id=f1', 'DELETE')),
    ]) {
      const { status, body } = await parseResponse(res);
      expect(status).toBe(403);
      expect(body.redirect).toBe('/other-shop/forbidden');
    }
    expect(mockFileFindMany).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('keeps a safe message for genuine failures instead of leaking internals', async () => {
    authAs(TENANT_A);
    mockFileFindMany.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const { status, body } = await parseResponse(await GET(createRequest('/api/upload')));
    expect(status).toBe(500);
    expect(body.error).toBe('Failed to fetch files');
  });
});

describe('/api/upload — permissions', () => {
  it('lets anyone with files, products or settings access browse the library', async () => {
    authAs(TENANT_A);
    mockFileFindMany.mockResolvedValue([]);
    const { status } = await parseResponse(await GET(createRequest('/api/upload')));
    expect(status).toBe(200);
    expect(mockHasAnyTenantPermission).toHaveBeenCalledWith('owner', TENANT_A, ['files.manage', 'products.create', 'products.edit', 'settings.manage']);
  });

  it('returns 403 to a role with none of those permissions', async () => {
    authAs(TENANT_A);
    mockHasAnyTenantPermission.mockResolvedValue(false);
    const { status } = await parseResponse(await GET(createRequest('/api/upload')));
    expect(status).toBe(403);
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it('requires files.manage itself to delete', async () => {
    authAs(TENANT_A);
    mockHasTenantPermission.mockResolvedValue(false);
    const { status } = await parseResponse(await DELETE(createRequest('/api/upload?id=f1', 'DELETE')));
    expect(status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('owner', TENANT_A, 'files.manage');
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/upload — tenant scoping', () => {
  it("looks the file up within the caller's tenant only", async () => {
    authAs(TENANT_A);
    mockFileFindFirst.mockResolvedValue(null);
    await DELETE(createRequest('/api/upload?id=f1', 'DELETE'));
    expect(mockFileFindFirst).toHaveBeenCalledWith({ where: { id: 'f1', tenantId: TENANT_A } });
  });

  it("returns 404 for another tenant's file — the same as a missing one", async () => {
    authAs(TENANT_A);
    mockFileFindFirst.mockResolvedValue(null); // tenant-scoped lookup cannot see tenant B's row
    const { status, body } = await parseResponse(await DELETE(createRequest('/api/upload?id=tenant-b-file', 'DELETE')));
    expect(status).toBe(404);
    expect(body.error).toBe('File not found');
    expect(mockDeleteFromCloudinary).not.toHaveBeenCalled();
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('deletes an own-tenant file from storage and the database', async () => {
    authAs(TENANT_A);
    mockFileFindFirst.mockResolvedValue({ id: 'f1', tenantId: TENANT_A, filename: 'tenant-a/f1', name: 'a.png', size: 10, type: 'image/png' });
    mockDeleteFromCloudinary.mockResolvedValue(undefined);
    mockFileDelete.mockResolvedValue({});
    const { status, body } = await parseResponse(await DELETE(createRequest('/api/upload?id=f1', 'DELETE')));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeleteFromCloudinary).toHaveBeenCalledWith('tenant-a/f1');
    expect(mockFileDelete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});
