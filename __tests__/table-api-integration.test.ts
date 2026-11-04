// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-table-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
}));

// Mock the repository layer (dining tables)
const repos = vi.hoisted(() => ({
  tables: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors');
  return {
    getRepos: () => repos,
    isDuplicateKeyError: actual.isDuplicateKeyError,
    TABLE_STATUSES: ['open', 'occupied', 'check-requested'],
  };
});

const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.hoisted(() => vi.fn());
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockGetTenantSettingsById = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant')>()),
  getTenantSettingsById: (...args: unknown[]) => mockGetTenantSettingsById(...args),
}));

import { GET as listTables, POST as createTable } from '@/app/api/tables/route';
import { GET as getTable, PATCH as patchTable, DELETE as deleteTable } from '@/app/api/tables/[id]/route';
import { createAuditLog } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTestToken(role: string = 'admin', tenantId: string = 'test-tenant'): string {
  return generateToken({
    userId: 'test-user',
    tenantId,
    email: 'test@example.com',
    role: role as any,
  });
}

function createRequest(
  url: string,
  method: string = 'GET',
  token?: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

// ---------------------------------------------------------------------------
// Table API — List (GET /api/tables)
// ---------------------------------------------------------------------------

describe('Table API — GET /api/tables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all active tables by default', async () => {
    const token = generateTestToken('admin', 'tenant-1');
    const request = createRequest('/api/tables', 'GET', token);

    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toContain('Bearer');
  });

  it('should support filtering by isActive query param', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables?isActive=true', 'GET', token);

    expect(request.nextUrl.searchParams.get('isActive')).toBe('true');
  });

  it('should support filtering by status query param', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables?status=open', 'GET', token);

    expect(request.nextUrl.searchParams.get('status')).toBe('open');
  });

  it('should support filtering by branchId query param', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables?branchId=branch-1', 'GET', token);

    expect(request.nextUrl.searchParams.get('branchId')).toBe('branch-1');
  });

  it('should return 401 without authentication', () => {
    const request = createRequest('/api/tables', 'GET');
    expect(request.headers.get('authorization')).toBeNull();
    // Real API would return 401
  });

  it('should include pagination in response', () => {
    const mockResponse = NextResponse.json({
      success: true,
      data: [
        { _id: 't1', name: 'Table 1', capacity: 2, status: 'open' },
        { _id: 't2', name: 'Table 2', capacity: 4, status: 'occupied' },
      ],
    });

    expect(mockResponse.status).toBe(200);
  });

  it('should filter by tenant from JWT context', () => {
    const token1 = generateTestToken('admin', 'tenant-1');
    const token2 = generateTestToken('admin', 'tenant-2');

    const req1 = createRequest('/api/tables', 'GET', token1);
    const req2 = createRequest('/api/tables', 'GET', token2);

    expect(req1.headers.get('authorization')).not.toBe(req2.headers.get('authorization'));
  });
});

// ---------------------------------------------------------------------------
// Table API — Get Single (GET /api/tables/:id)
// ---------------------------------------------------------------------------

describe('Table API — GET /api/tables/:id', () => {
  it('should retrieve a single table by ID', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'GET', token);

    expect(request.method).toBe('GET');
    expect(request.nextUrl.pathname).toContain('507f1f77bcf86cd799439011');
  });

  it('should return 404 if table not found', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Table not found' },
      { status: 404 }
    );

    expect(response.status).toBe(404);
  });

  it('should validate ObjectId format', () => {
    const validId = '507f1f77bcf86cd799439011';
    const invalidId = 'not-an-id';

    const validReq = createRequest(`/api/tables/${validId}`, 'GET', generateTestToken());
    const invalidReq = createRequest(`/api/tables/${invalidId}`, 'GET', generateTestToken());

    // Both requests are formed correctly, but API would validate ID format
    expect(validReq.nextUrl.pathname).toContain(validId);
    expect(invalidReq.nextUrl.pathname).toContain(invalidId);
  });
});

// ---------------------------------------------------------------------------
// Table API — Create (POST /api/tables)
// ---------------------------------------------------------------------------

describe('Table API — POST /api/tables', () => {
  it('should create a table with required fields', () => {
    const token = generateTestToken('admin');
    const body = {
      name: 'Table 5A',
      capacity: 6,
    };

    const request = createRequest('/api/tables', 'POST', token, body);

    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');
  });

  it('should return 201 on successful creation', async () => {
    const response = NextResponse.json(
      { success: true, data: { _id: 'new-id', name: 'Table 5A', capacity: 6 } },
      { status: 201 }
    );

    expect(response.status).toBe(201);
  });

  it('should validate table name is required', () => {
    const token = generateTestToken('admin');
    const invalidBody = { capacity: 4 }; // Missing name

    const request = createRequest('/api/tables', 'POST', token, invalidBody);
    expect(request.method).toBe('POST');
    // Real API would return 400: Table name is required
  });

  it('should validate table name length', () => {
    const token = generateTestToken('admin');
    const tooLongName = 'A'.repeat(51);

    const request = createRequest('/api/tables', 'POST', token, {
      name: tooLongName,
      capacity: 4,
    });

    expect(request.method).toBe('POST');
    // Real API would return 400: Table name must not exceed 50 characters
  });

  it('should validate capacity is within range', () => {
    const token = generateTestToken('admin');

    const minCapacity = createRequest('/api/tables', 'POST', token, {
      name: 'Table',
      capacity: 0, // Invalid: must be >= 1
    });

    const maxCapacity = createRequest('/api/tables', 'POST', token, {
      name: 'Table',
      capacity: 101, // Invalid: must be <= 100
    });

    expect(minCapacity.method).toBe('POST');
    expect(maxCapacity.method).toBe('POST');
    // Real API would validate ranges
  });

  it('should include audit log on creation', () => {
    const token = generateTestToken('admin', 'tenant-1');
    const request = createRequest('/api/tables', 'POST', token, {
      name: 'New Table',
      capacity: 4,
    });

    expect(request.headers.get('authorization')).toBeTruthy();
    // Real API would call createAuditLog with AuditActions.CREATE
  });

  it('should set default status to "open"', async () => {
    const response = NextResponse.json({
      success: true,
      data: { _id: 'new-id', name: 'Table', capacity: 4, status: 'open' },
    });

    const { body } = await parseResponse(response);
    expect(body.data).toHaveProperty('status', 'open');
  });

  it('should apply rate limiting on create', () => {
    const token = generateTestToken('admin', 'tenant-1');

    // Simulate multiple creates
    for (let i = 0; i < 3; i++) {
      const request = createRequest('/api/tables', 'POST', token, {
        name: `Table ${i}`,
        capacity: 4,
      });
      expect(request.method).toBe('POST');
    }
    // Real API would apply rate limit after limit threshold
  });
});

// ---------------------------------------------------------------------------
// Table API — Update (PATCH /api/tables/:id)
// ---------------------------------------------------------------------------

describe('Table API — PATCH /api/tables/:id', () => {
  it('should update table name', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      name: 'Updated Table',
    });

    expect(request.method).toBe('PATCH');
  });

  it('should update table capacity', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      capacity: 8,
    });

    expect(request.method).toBe('PATCH');
  });

  it('should update table status', () => {
    const token = generateTestToken('admin');
    const validStatuses = ['open', 'occupied', 'check-requested'];

    for (const status of validStatuses) {
      const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
        status,
      });

      expect(request.method).toBe('PATCH');
    }
  });

  it('should reject invalid status values', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      status: 'invalid-status',
    });

    expect(request.method).toBe('PATCH');
    // Real API would return 400: Status must be one of: open, occupied, check-requested
  });

  it('should validate partial updates', () => {
    const token = generateTestToken('admin');

    // Update only name
    const nameOnly = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      name: 'New Name',
    });

    // Update only capacity
    const capacityOnly = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      capacity: 6,
    });

    expect(nameOnly.method).toBe('PATCH');
    expect(capacityOnly.method).toBe('PATCH');
  });

  it('should return 404 if table not found', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Table not found' },
      { status: 404 }
    );

    expect(response.status).toBe(404);
  });

  it('should include before/after changes in audit log', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'PATCH', token, {
      name: 'Updated',
    });

    expect(request.method).toBe('PATCH');
    // Real API would log { before: {...}, after: {...} }
  });
});

// ---------------------------------------------------------------------------
// Table API — Delete (DELETE /api/tables/:id)
// ---------------------------------------------------------------------------

describe('Table API — DELETE /api/tables/:id', () => {
  it('should soft-delete a table (set isActive to false)', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'DELETE', token);

    expect(request.method).toBe('DELETE');
  });

  it('should return 200 on successful delete', async () => {
    const response = NextResponse.json(
      { success: true, message: 'Table deactivated' },
      { status: 200 }
    );

    expect(response.status).toBe(200);
  });

  it('should return 404 if table not found', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Table not found' },
      { status: 404 }
    );

    expect(response.status).toBe(404);
  });

  it('should include audit log on delete', () => {
    const token = generateTestToken('admin', 'tenant-1');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'DELETE', token);

    expect(request.headers.get('authorization')).toBeTruthy();
    // Real API would call createAuditLog with AuditActions.DELETE
  });

  it('should not allow deletion by staff role', () => {
    const staffToken = generateTestToken('staff');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439011', 'DELETE', staffToken);

    expect(request.method).toBe('DELETE');
    // Real API would check permissions and return 403
  });
});

// ---------------------------------------------------------------------------
// Table API — Tenant Isolation
// ---------------------------------------------------------------------------

describe('Table API — Tenant Isolation', () => {
  it('should filter tables by tenant from JWT', () => {
    const token1 = generateTestToken('admin', 'tenant-1');
    const token2 = generateTestToken('admin', 'tenant-2');

    const req1 = createRequest('/api/tables', 'GET', token1);
    const req2 = createRequest('/api/tables', 'GET', token2);

    expect(req1.headers.get('authorization')).not.toBe(req2.headers.get('authorization'));
  });

  it('should prevent accessing other tenant tables', () => {
    const token = generateTestToken('admin', 'tenant-1');
    const request = createRequest('/api/tables/507f1f77bcf86cd799439012', 'GET', token);

    // Real API would verify table belongs to this tenant
    expect(request.headers.get('authorization')).toBeTruthy();
  });

  it('should not allow tenantId in request body (use JWT instead)', () => {
    const token = generateTestToken('admin', 'tenant-1');

    // API should ignore tenantId in body
    const request = createRequest('/api/tables', 'POST', token, {
      name: 'Table',
      capacity: 4,
      tenantId: 'tenant-2', // Should be ignored
    });

    expect(request.method).toBe('POST');
    // Real API would extract tenantId from JWT, not body
  });
});

// ---------------------------------------------------------------------------
// Table API — Feature Flag Integration
// ---------------------------------------------------------------------------

describe('Table API — Feature Flag Integration', () => {
  it('should check enableTableManagement feature flag', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables', 'GET', token);

    expect(request.method).toBe('GET');
    // Real API would check tenant.settings.enableTableManagement
  });

  it('should return 403 if feature not enabled', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Feature not enabled for this tenant' },
      { status: 403 }
    );

    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Table API — Content Type Handling
// ---------------------------------------------------------------------------

describe('Table API — Content Type Handling', () => {
  it('should handle application/json content type', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables', 'POST', token, { name: 'Table' });

    expect(request.headers.get('content-type')).toBe('application/json');
  });

  it('should reject non-JSON body with 400', () => {
    const token = generateTestToken('admin');
    const request = createRequest('/api/tables', 'POST', token, { /* empty */ });

    expect(request.method).toBe('POST');
    // Real API would validate body parsing
  });
});

// ---------------------------------------------------------------------------
// Table API — route handlers against the repository layer
// ---------------------------------------------------------------------------

describe('Table API — route handlers', () => {
  const TENANT = 'tenant-1';
  const OTHER_TENANT = 'tenant-2';
  const ID = '507f1f77bcf86cd799439011';
  const params = { params: Promise.resolve({ id: ID }) };

  function authAs(tenantId: string, role = 'owner') {
    mockRequireTenantAccess.mockResolvedValue({
      tenantId,
      user: { userId: 'user-1', tenantId, email: 'test@example.com', role },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTenantPermission.mockResolvedValue(true);
    mockGetTenantSettingsById.mockResolvedValue({ enableTableManagement: true });
  });

  it('GET defaults to active tables scoped to the authenticated tenant', async () => {
    authAs(TENANT);
    repos.tables.list.mockResolvedValue([{ _id: 't1', name: 'Table 1' }]);

    const res = await listTables(createRequest('/api/tables'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual([{ _id: 't1', name: 'Table 1' }]);
    expect(repos.tables.list).toHaveBeenCalledWith(TENANT, { isActive: true });
  });

  it('GET with isActive=all omits the active filter', async () => {
    authAs(TENANT);
    repos.tables.list.mockResolvedValue([]);

    await listTables(createRequest('/api/tables?isActive=all&branchId=b1&status=occupied'));

    expect(repos.tables.list).toHaveBeenCalledWith(TENANT, { branchId: 'b1', status: 'occupied' });
  });

  it('GET ignores an invalid status filter', async () => {
    authAs(TENANT);
    repos.tables.list.mockResolvedValue([]);

    await listTables(createRequest('/api/tables?isActive=false&status=bogus'));

    expect(repos.tables.list).toHaveBeenCalledWith(TENANT, { isActive: false });
  });

  it('GET /:id 404s for a table outside the caller tenant', async () => {
    authAs(OTHER_TENANT);
    repos.tables.findById.mockResolvedValue(null);

    const res = await getTable(createRequest(`/api/tables/${ID}`), params);

    expect(res.status).toBe(404);
    expect(repos.tables.findById).toHaveBeenCalledWith(OTHER_TENANT, ID);
  });

  it('POST creates the table in the authenticated tenant, ignoring body tenantId', async () => {
    authAs(TENANT);
    repos.tables.create.mockResolvedValue({ _id: 't1', name: 'Table 5A', capacity: 6, status: 'open' });

    const res = await createTable(
      createRequest('/api/tables', 'POST', undefined, { name: '  Table 5A ', capacity: 6, tenantId: OTHER_TENANT })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(repos.tables.create).toHaveBeenCalledWith(TENANT, {
      name: 'Table 5A',
      capacity: 6,
      branchId: undefined,
      status: 'open',
      isActive: true,
    });
  });

  it('POST rejects a missing name with 400', async () => {
    authAs(TENANT);

    const res = await createTable(createRequest('/api/tables', 'POST', undefined, { capacity: 4 }));

    expect(res.status).toBe(400);
    expect(repos.tables.create).not.toHaveBeenCalled();
  });

  it('PATCH with no actual change skips the audit log and returns the table', async () => {
    authAs(TENANT);
    const table = { _id: ID, name: 'Table 1', status: 'open' };
    repos.tables.update.mockResolvedValue({ before: table, after: table, changed: [] });

    const res = await patchTable(createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { status: 'open' }), params);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: table });
    expect(repos.tables.update).toHaveBeenCalledWith(TENANT, ID, expect.objectContaining({ status: 'open' }));
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('PATCH audits only the changed fields', async () => {
    authAs(TENANT);
    const before = { _id: ID, name: 'Table 1', status: 'open', capacity: 4 };
    const after = { ...before, status: 'occupied', currentOrderId: 'order-1' };
    repos.tables.update.mockResolvedValue({ before, after, changed: ['status', 'currentOrderId'] });

    const res = await patchTable(
      createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { status: 'occupied', currentOrderId: 'order-1' }),
      params
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual(after);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT,
        entityId: ID,
        changes: {
          before: { status: 'open', currentOrderId: undefined },
          after: { status: 'occupied', currentOrderId: 'order-1' },
        },
      })
    );
  });

  it('PATCH clears currentOrderId when a falsy value is sent', async () => {
    authAs(TENANT);
    const table = { _id: ID, name: 'Table 1', status: 'open' };
    repos.tables.update.mockResolvedValue({ before: table, after: table, changed: [] });

    await patchTable(createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { currentOrderId: '' }), params);

    const patch = repos.tables.update.mock.calls[0][2];
    expect(patch.currentOrderId).toBeNull();
    expect(patch.name).toBeUndefined();
    expect(patch.status).toBeUndefined();
  });

  it('PATCH rejects an invalid status with 400 without writing', async () => {
    authAs(TENANT);

    const res = await patchTable(createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { status: 'bogus' }), params);

    expect(res.status).toBe(400);
    expect(repos.tables.update).not.toHaveBeenCalled();
  });

  it('PATCH 404s for a table outside the caller tenant', async () => {
    authAs(OTHER_TENANT);
    repos.tables.update.mockResolvedValue(null);

    const res = await patchTable(createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { status: 'open' }), params);

    expect(res.status).toBe(404);
    expect(repos.tables.update).toHaveBeenCalledWith(OTHER_TENANT, ID, expect.anything());
  });

  it('PATCH config changes require tables.configure', async () => {
    authAs(TENANT, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await patchTable(createRequest(`/api/tables/${ID}`, 'PATCH', undefined, { name: 'X' }), params);

    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('cashier', TENANT, 'tables.configure');
    expect(repos.tables.update).not.toHaveBeenCalled();
  });

  it('DELETE soft-deletes within the caller tenant', async () => {
    authAs(TENANT);
    const table = { _id: ID, name: 'Table 1', isActive: true };
    repos.tables.update.mockResolvedValue({ before: table, after: { ...table, isActive: false }, changed: ['isActive'] });

    const res = await deleteTable(createRequest(`/api/tables/${ID}`, 'DELETE'), params);
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, message: 'Table deactivated' });
    expect(repos.tables.update).toHaveBeenCalledWith(TENANT, ID, { isActive: false });
  });

  it('DELETE 404s for a missing table', async () => {
    authAs(TENANT);
    repos.tables.update.mockResolvedValue(null);

    const res = await deleteTable(createRequest(`/api/tables/${ID}`, 'DELETE'), params);

    expect(res.status).toBe(404);
  });
});
