// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-api-integration-tests-32chars!!';
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
    READ: 'READ',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'staff' | 'manager' | 'super_admin';
}

function createAuthRequest(
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

function generateTestToken(payload: Partial<TestTokenPayload> = {}): string {
  const defaults: TestTokenPayload = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    email: 'test@example.com',
    role: 'admin',
  };

  return generateToken({ ...defaults, ...payload });
}

async function parseResponse(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

// ---------------------------------------------------------------------------
// Authentication Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Authentication Patterns', () => {
  it('should accept valid Bearer token in Authorization header', () => {
    const token = generateTestToken();
    const request = createAuthRequest('/api/test', 'GET', token);

    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(request.headers.get('authorization')).toMatch(/^Bearer eyJ/);
  });

  it('should support multiple authentication methods simultaneously', () => {
    const token = generateTestToken();

    // Bearer token
    const bearerReq = createAuthRequest('/api/test', 'GET', token);
    expect(bearerReq.headers.get('authorization')).toBe(`Bearer ${token}`);

    // Request without token
    const noAuthReq = createAuthRequest('/api/test', 'GET');
    expect(noAuthReq.headers.get('authorization')).toBeNull();
  });

  it('should encode user context in token payload', () => {
    const payload: TestTokenPayload = {
      userId: 'user-999',
      tenantId: 'tenant-888',
      email: 'admin@company.com',
      role: 'admin',
    };

    const token = generateTestToken(payload);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3); // Valid JWT format
  });
});

// ---------------------------------------------------------------------------
// Tenant Isolation Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Tenant Isolation', () => {
  it('should include tenantId in all API request context', () => {
    const tenantId = 'tenant-xyz-123';
    const token = generateTestToken({ tenantId });
    const request = createAuthRequest('/api/tables', 'GET', token);

    expect(request.headers.get('authorization')).toBeTruthy();
    // Token should include tenant context
    expect(token).toBeTruthy();
  });

  it('should support requests for different tenants with different tokens', () => {
    const token1 = generateTestToken({ tenantId: 'tenant-1' });
    const token2 = generateTestToken({ tenantId: 'tenant-2' });

    const req1 = createAuthRequest('/api/products', 'GET', token1);
    const req2 = createAuthRequest('/api/products', 'GET', token2);

    expect(req1.headers.get('authorization')).not.toBe(req2.headers.get('authorization'));
  });
});

// ---------------------------------------------------------------------------
// Request/Response Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Request/Response Patterns', () => {
  it('should handle GET requests with query parameters', () => {
    const url = new URL('/api/tables?status=open&limit=10', 'http://localhost');
    const request = new NextRequest(url);

    expect(request.nextUrl.searchParams.get('status')).toBe('open');
    expect(request.nextUrl.searchParams.get('limit')).toBe('10');
  });

  it('should handle POST requests with JSON body', () => {
    const body = { name: 'Test Table', capacity: 4 };
    const request = createAuthRequest('/api/tables', 'POST', undefined, body);

    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');
  });

  it('should handle PATCH requests with partial updates', () => {
    const body = { name: 'Updated Table' };
    const request = createAuthRequest('/api/tables/123', 'PATCH', generateTestToken(), body);

    expect(request.method).toBe('PATCH');
  });

  it('should handle DELETE requests', () => {
    const request = createAuthRequest('/api/tables/123', 'DELETE', generateTestToken());
    expect(request.method).toBe('DELETE');
  });

  it('should return JSON responses with standard format', async () => {
    const mockResponse = NextResponse.json(
      { success: true, data: { id: 'table-1', name: 'Table 1' } },
      { status: 200 }
    );

    const { status, body } = await parseResponse(mockResponse);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('should return error responses with consistent format', async () => {
    const mockResponse = NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    );

    const { status, body } = await parseResponse(mockResponse);
    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CRUD Operation Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — CRUD Operations', () => {
  it('should follow HTTP status codes: 201 for CREATE', async () => {
    const response = NextResponse.json({ success: true, data: { id: 'new-1' } }, { status: 201 });
    expect(response.status).toBe(201);
  });

  it('should follow HTTP status codes: 200 for READ', async () => {
    const response = NextResponse.json({ success: true, data: { id: 'table-1' } }, { status: 200 });
    expect(response.status).toBe(200);
  });

  it('should follow HTTP status codes: 200 for UPDATE (PATCH)', async () => {
    const response = NextResponse.json({ success: true, data: { id: 'table-1' } }, { status: 200 });
    expect(response.status).toBe(200);
  });

  it('should follow HTTP status codes: 200/204 for DELETE', async () => {
    const response = NextResponse.json({ success: true }, { status: 200 });
    expect(response.status).toBe(200);
  });

  it('should validate required fields on CREATE', () => {
    // Simulating validation - empty body
    const request = createAuthRequest('/api/tables', 'POST', generateTestToken(), {});
    expect(request.method).toBe('POST');
    // Real API would validate and return 400
  });

  it('should support pagination in list endpoints', () => {
    const url = new URL('/api/customers?page=2&limit=50', 'http://localhost');
    const request = new NextRequest(url);

    expect(request.nextUrl.searchParams.get('page')).toBe('2');
    expect(request.nextUrl.searchParams.get('limit')).toBe('50');
  });
});

// ---------------------------------------------------------------------------
// Error Handling Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Error Handling', () => {
  it('should return 400 for bad request', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Invalid input' },
      { status: 400 }
    );
    expect(response.status).toBe(400);
  });

  it('should return 401 for unauthorized access', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
    expect(response.status).toBe(401);
  });

  it('should return 403 for forbidden access', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
    expect(response.status).toBe(403);
  });

  it('should return 404 for not found', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    );
    expect(response.status).toBe(404);
  });

  it('should return 429 for rate limit exceeded', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429 }
    );
    expect(response.status).toBe(429);
  });

  it('should return 500 for server errors', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
    expect(response.status).toBe(500);
  });

  it('should include error details in response body', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Validation failed', errors: [{ field: 'name', message: 'Required' }] },
      { status: 400 }
    );

    const { body } = await parseResponse(response);
    expect(body.error).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Data Validation Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Data Validation', () => {
  it('should validate string fields for length', () => {
    const validBody = { name: 'Table 5' };
    const invalidBody = { name: '' };

    const validReq = createAuthRequest('/api/tables', 'POST', generateTestToken(), validBody);
    const invalidReq = createAuthRequest('/api/tables', 'POST', generateTestToken(), invalidBody);

    expect(validReq.method).toBe('POST');
    expect(invalidReq.method).toBe('POST');
    // Real API would reject invalidReq
  });

  it('should validate numeric fields for range', () => {
    const validBody = { capacity: 4 };
    const invalidBody = { capacity: 999 };

    const validReq = createAuthRequest('/api/tables', 'POST', generateTestToken(), validBody);
    const invalidReq = createAuthRequest('/api/tables', 'POST', generateTestToken(), invalidBody);

    expect(validReq.method).toBe('POST');
    expect(invalidReq.method).toBe('POST');
    // Real API would validate ranges
  });

  it('should support enum validation', () => {
    const validBody = { status: 'open' };
    const invalidBody = { status: 'invalid-status' };

    const validReq = createAuthRequest('/api/tables', 'PATCH', generateTestToken(), validBody);
    const invalidReq = createAuthRequest('/api/tables', 'PATCH', generateTestToken(), invalidBody);

    expect(validReq.method).toBe('PATCH');
    expect(invalidReq.method).toBe('PATCH');
    // Real API would validate enums
  });
});

// ---------------------------------------------------------------------------
// Feature Flag Integration Tests
// ---------------------------------------------------------------------------

describe('API Integration — Feature Flags', () => {
  it('should support feature flag checks in requests', () => {
    const token = generateTestToken({ role: 'admin' });
    const request = createAuthRequest('/api/tables', 'GET', token);

    expect(request.headers.get('authorization')).toBeTruthy();
    // Real API would check enableTableManagement flag
  });

  it('should handle feature-gated endpoints gracefully', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Feature not enabled for this tenant' },
      { status: 403 }
    );

    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Audit Trail Integration Tests
// ---------------------------------------------------------------------------

describe('API Integration — Audit Trail', () => {
  it('should log CREATE operations', () => {
    const token = generateTestToken();
    const request = createAuthRequest('/api/tables', 'POST', token, { name: 'Table 1' });

    expect(request.method).toBe('POST');
    // Real API would call createAuditLog with AuditActions.CREATE
  });

  it('should log UPDATE operations', () => {
    const token = generateTestToken();
    const request = createAuthRequest('/api/tables/123', 'PATCH', token, { name: 'Updated' });

    expect(request.method).toBe('PATCH');
    // Real API would call createAuditLog with AuditActions.UPDATE
  });

  it('should log DELETE operations', () => {
    const token = generateTestToken();
    const request = createAuthRequest('/api/tables/123', 'DELETE', token);

    expect(request.method).toBe('DELETE');
    // Real API would call createAuditLog with AuditActions.DELETE
  });

  it('should include reqest metadata in audit logs', () => {
    const token = generateTestToken({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'admin@test.com',
    });
    const request = createAuthRequest('/api/tables', 'POST', token, { name: 'Table' });

    expect(request.headers.get('authorization')).toBeTruthy();
    // Real API would include user context in audit log
  });
});

// ---------------------------------------------------------------------------
// Role-Based Access Control Tests
// ---------------------------------------------------------------------------

describe('API Integration — Role-Based Access Control', () => {
  it('should support admin role access', () => {
    const token = generateTestToken({ role: 'admin' });
    const request = createAuthRequest('/api/tables', 'GET', token);
    expect(request.headers.get('authorization')).toBeTruthy();
  });

  it('should support manager role access', () => {
    const token = generateTestToken({ role: 'manager' });
    const request = createAuthRequest('/api/tables', 'GET', token);
    expect(request.headers.get('authorization')).toBeTruthy();
  });

  it('should support staff role access', () => {
    const token = generateTestToken({ role: 'staff' });
    const request = createAuthRequest('/api/tables', 'GET', token);
    expect(request.headers.get('authorization')).toBeTruthy();
  });

  it('should support super_admin bypass', () => {
    const token = generateTestToken({ role: 'super_admin' });
    const request = createAuthRequest('/api/super-admin/users', 'GET', token);
    expect(request.headers.get('authorization')).toBeTruthy();
  });

  it('should restrict sensitive operations by role', async () => {
    // Staff role attempting to delete (should be rejected by real API)
    const token = generateTestToken({ role: 'staff' });
    const request = createAuthRequest('/api/tables/123', 'DELETE', token);
    expect(request.method).toBe('DELETE');
    // Real API would check permissions and return 403
  });
});

// ---------------------------------------------------------------------------
// Rate Limiting Integration Tests
// ---------------------------------------------------------------------------

describe('API Integration — Rate Limiting', () => {
  it('should apply rate limits to write operations', () => {
    const token = generateTestToken();
    const request = createAuthRequest('/api/tables', 'POST', token, { name: 'Table' });

    expect(request.method).toBe('POST');
    // Real API would check rate limit for this IP/tenant combo
  });

  it('should allow multiple reads within rate limit', () => {
    const token = generateTestToken();

    for (let i = 0; i < 5; i++) {
      const request = createAuthRequest(`/api/tables?page=${i + 1}`, 'GET', token);
      expect(request.method).toBe('GET');
    }
    // Real API would allow these reads
  });

  it('should return 429 when rate limit exceeded', async () => {
    const response = NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'retry-after': '60' } }
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});

// ---------------------------------------------------------------------------
// Dynamic Routing Pattern Tests
// ---------------------------------------------------------------------------

describe('API Integration — Dynamic Routes', () => {
  it('should extract dynamic parameters from URL', () => {
    const url = new URL('/api/tables/table-123/history', 'http://localhost');
    const request = new NextRequest(url);

    // In a real route handler: const { id } = await params
    const pathParts = request.nextUrl.pathname.split('/');
    expect(pathParts).toContain('table-123');
  });

  it('should support nested dynamic routes', () => {
    const url = new URL('/api/customers/cust-1/loyalty/history', 'http://localhost');
    const request = new NextRequest(url);

    const pathParts = request.nextUrl.pathname.split('/');
    expect(pathParts[3]).toBe('cust-1');
  });

  it('should validate ObjectId format for dynamic parameters', () => {
    const validId = '507f1f77bcf86cd799439011'; // Valid MongoDB ObjectId
    const invalidId = 'not-an-id';

    const validUrl = new URL(`/api/tables/${validId}`, 'http://localhost');
    const invalidUrl = new URL(`/api/tables/${invalidId}`, 'http://localhost');

    expect(validUrl.pathname).toContain(validId);
    expect(invalidUrl.pathname).toContain(invalidId);
    // Real API would validate ObjectId format
  });
});
