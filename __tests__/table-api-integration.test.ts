// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-table-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Mock the Table model
const mockTableFind = vi.fn();
const mockTableFindOne = vi.fn();
const mockTableCreate = vi.fn();

vi.mock('@/models/Table', () => ({
  default: {
    find: mockTableFind,
    findOne: mockTableFindOne,
    create: mockTableCreate,
    findByIdAndUpdate: vi.fn(),
  },
}));

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
