process.env.JWT_SECRET = 'test-secret-for-tables-api-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTableCreate = vi.fn();
const mockTableUpdate = vi.fn();
const mockTableFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    posTable: {
      create: (...args: unknown[]) => mockTableCreate(...args),
      update: (...args: unknown[]) => mockTableUpdate(...args),
      findFirst: (...args: unknown[]) => mockTableFindFirst(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockRequireTableManagementAccess = vi.fn();
vi.mock('@/lib/table-management-access', () => ({
  requireTableManagementAccess: (...args: unknown[]) => mockRequireTableManagementAccess(...args),
}));

import { POST } from '@/app/api/tables/route';
import { PATCH } from '@/app/api/tables/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockRequireTenantAccess.mockResolvedValue({
    tenantId,
    user: { userId, tenantId, email: 'test@example.com', role },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
  mockRequireTableManagementAccess.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Feature gate (business-type-aware default + tenant override)
// ---------------------------------------------------------------------------

describe('POST /api/tables — feature gate', () => {
  it('blocks table creation when table management resolves off for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireTableManagementAccess.mockRejectedValue(
      new Error('Table management is turned off for this store. Enable it under Settings → Feature Flags.')
    );

    const res = await POST(createRequest('/api/tables', 'POST', { name: 'Table 1' }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockTableCreate).not.toHaveBeenCalled();
  });

  it('creates the table when table management is enabled (e.g. a restaurant tenant with the default applied)', async () => {
    authAs(TENANT_A);
    mockTableCreate.mockResolvedValue({ id: 'table-new', tenantId: TENANT_A, name: 'Table 1', status: 'open' });

    const res = await POST(createRequest('/api/tables', 'POST', { name: 'Table 1' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockTableCreate).toHaveBeenCalled();
    expect(mockRequireTableManagementAccess).toHaveBeenCalledWith(TENANT_A);
  });
});

describe('PATCH /api/tables/[id] — feature gate on config changes only', () => {
  it('blocks a config change (rename) when table management is off', async () => {
    authAs(TENANT_A);
    mockTableFindFirst.mockResolvedValue({ id: 'table-1', tenantId: TENANT_A, name: 'Old Name', status: 'open' });
    mockRequireTableManagementAccess.mockRejectedValue(
      new Error('Table management is turned off for this store. Enable it under Settings → Feature Flags.')
    );

    const res = await PATCH(
      createRequest('/api/tables/table-1', 'PATCH', { name: 'New Name' }),
      { params: Promise.resolve({ id: 'table-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockTableUpdate).not.toHaveBeenCalled();
  });

  it('does not gate a plain status/order update (not a config change) behind the feature flag', async () => {
    authAs(TENANT_A);
    mockTableFindFirst.mockResolvedValue({ id: 'table-1', tenantId: TENANT_A, name: 'Table 1', status: 'open' });
    mockTableUpdate.mockResolvedValue({ id: 'table-1', tenantId: TENANT_A, status: 'occupied' });

    const res = await PATCH(
      createRequest('/api/tables/table-1', 'PATCH', { status: 'occupied' }),
      { params: Promise.resolve({ id: 'table-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    // Feature-gate helper is only consulted for config changes (name/capacity/isActive).
    expect(mockRequireTableManagementAccess).not.toHaveBeenCalled();
  });
});
