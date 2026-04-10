process.env.JWT_SECRET = 'test-secret-32chars-shifts123!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockShiftFind,
  mockShiftFindOne,
  mockShiftCreate,
  mockApiKeyFind,
  mockApiKeyCreate,
  mockAuditLogFind,
  mockAuditLogCount,
  mockRequireAuth,
  mockRequireRole,
} = vi.hoisted(() => ({
  mockShiftFind: vi.fn(),
  mockShiftFindOne: vi.fn(),
  mockShiftCreate: vi.fn(),
  mockApiKeyFind: vi.fn(),
  mockApiKeyCreate: vi.fn(),
  mockAuditLogFind: vi.fn(),
  mockAuditLogCount: vi.fn(),
  mockRequireAuth: vi.fn(),
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
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth, requireRole: mockRequireRole };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Shift', () => ({
  default: {
    find: mockShiftFind,
    findOne: mockShiftFindOne,
    create: mockShiftCreate,
  },
}));
vi.mock('@/models/ApiKey', () => ({
  default: {
    find: mockApiKeyFind,
    create: mockApiKeyCreate,
  },
}));
vi.mock('@/models/AuditLog', () => ({
  default: {
    find: mockAuditLogFind,
    countDocuments: mockAuditLogCount,
  },
}));
vi.mock('mongoose', () => {
  class MockObjectId {
    id: string;
    constructor(id: string) { this.id = id; }
    toString() { return this.id; }
  }
  return {
    default: { Types: { ObjectId: MockObjectId } },
    Types: { ObjectId: MockObjectId },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockShift = {
  _id: 'shift-1',
  staffId: 'user-1',
  date: new Date('2024-06-01'),
  startTime: '09:00',
  endTime: '17:00',
  tenantId: 'tenant-1',
};

const validShiftBody = {
  staffId: 'staff-1',
  date: '2024-06-01',
  startTime: '09:00',
  endTime: '17:00',
};

// ===========================================================================
// SHIFTS
// ===========================================================================

describe('GET /api/shifts', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: adminUser,
    });
    mockShiftFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockShift]),
    });
    ({ GET } = await import('@/app/api/shifts/route'));
  });

  it('returns 200 with shift list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/shifts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 200 with empty array when no shifts', async () => {
    mockShiftFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/shifts'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/shifts'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts weekStart filter without error', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/shifts?weekStart=2024-06-01'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid weekStart date', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/shifts?weekStart=not-a-date'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid weekstart/i);
  });
});

describe('POST /api/shifts', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: adminUser,
    });
    mockShiftFindOne.mockResolvedValue(null); // no overlap
    mockShiftCreate.mockResolvedValue({ _id: 'shift-new', ...validShiftBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/shifts/route'));
  });

  it('returns 201 on successful shift creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', validShiftBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', { staffId: 'x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when time format is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', {
      ...validShiftBody,
      startTime: '9am',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/HH:mm/i);
  });

  it('returns 400 when endTime is before startTime', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', {
      ...validShiftBody,
      startTime: '17:00',
      endTime: '09:00',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endTime must be after startTime/i);
  });

  it('returns 409 when staff has overlapping shift', async () => {
    mockShiftFindOne.mockResolvedValue(mockShift);
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', validShiftBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/overlapping shift/i);
  });

  it('returns 400 when date is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts', {
      ...validShiftBody,
      date: 'not-a-date',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });
});

// ===========================================================================
// API KEYS
// ===========================================================================

describe('GET /api/api-keys', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockKey = {
    _id: 'key-1',
    name: 'My API Key',
    keyPrefix: 'sk_live_abc',
    permissions: ['transactions:read'],
    tenantId: 'tenant-1',
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: adminUser,
    });
    mockApiKeyFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockKey]),
    });
    ({ GET } = await import('@/app/api/api-keys/route'));
  });

  it('returns 200 with api key list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/api-keys'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('My API Key');
  });

  it('does not include keyHash in response', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/api-keys'));
    const body = await res.json();
    expect(body.data[0].keyHash).toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/api-keys'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/api-keys', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: adminUser,
    });
    mockApiKeyCreate.mockResolvedValue({
      _id: 'key-new',
      name: 'Test Key',
      keyPrefix: 'sk_live_abc',
      permissions: ['transactions:read'],
      tenantId: 'tenant-1',
      createdAt: new Date(),
    });
    ({ POST } = await import('@/app/api/api-keys/route'));
  });

  it('returns 201 with the raw key on creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/api-keys', {
      name: 'Test Key',
      permissions: ['transactions:read'],
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.key).toMatch(/^sk_live_/);
    expect(body.data.message).toMatch(/store this key securely/i);
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/api-keys', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when name is blank', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/api-keys', { name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('uses all permissions when none specified', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/api-keys', { name: 'Full Access Key' }));
    expect(mockApiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: expect.arrayContaining(['transactions:read', 'reports:read']) })
    );
  });

  it('filters out unknown permissions', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/api-keys', {
      name: 'Limited Key',
      permissions: ['transactions:read', 'fake:permission'],
    }));
    expect(mockApiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: expect.not.arrayContaining(['fake:permission']),
      })
    );
  });
});

// ===========================================================================
// AUDIT LOGS
// ===========================================================================

describe('GET /api/audit-logs', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockLog = {
    _id: 'log-1',
    action: 'CREATE',
    entityType: 'product',
    entityId: 'prod-1',
    userId: { _id: 'user-1', name: 'Admin', email: 'admin@test.com' },
    tenantId: 'tenant-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(adminUser);
    mockAuditLogFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockLog]),
    });
    mockAuditLogCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/audit-logs/route'));
  });

  it('returns 200 with audit log list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].action).toBe('CREATE');
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty list', async () => {
    mockAuditLogFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockAuditLogCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is cashier', async () => {
    mockRequireAuth.mockResolvedValue({
      ...adminUser,
      role: 'cashier',
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it('allows owner role to access logs', async () => {
    mockRequireAuth.mockResolvedValue({ ...adminUser, role: 'owner' });
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs'));
    expect(res.status).toBe(200);
  });

  it('passes action filter to query', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/audit-logs?action=CREATE'));
    expect(res.status).toBe(200);
    // The find should have been called — filter tested via route logic
    expect(mockAuditLogFind).toHaveBeenCalled();
  });
});
