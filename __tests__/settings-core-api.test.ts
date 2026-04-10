process.env.JWT_SECRET = 'test-secret-32chars-settings!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockGetCurrentUser,
  mockRequireRole,
  mockCheckRateLimit,
  mockGetDefaultTenantSettings,
  mockIsValidBusinessType,
  mockApplyBusinessTypeDefaults,
  mockCreateAuditLog,
  mockHandleApiError,
  mockTenantFindOne,
  mockTenantFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' }),
  mockRequireRole: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' }),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockGetDefaultTenantSettings: vi.fn().mockReturnValue({ currency: 'PHP', taxRate: 12 }),
  mockIsValidBusinessType: vi.fn().mockReturnValue(true),
  mockApplyBusinessTypeDefaults: vi.fn().mockImplementation((s: object) => s),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn(),
  mockTenantFindOne: vi.fn(),
  mockTenantFindOneAndUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
  requireRole: mockRequireRole,
  generateToken: () => 'test-token',
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/subscription', () => ({
  checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/currency', () => ({ getDefaultTenantSettings: mockGetDefaultTenantSettings }));
vi.mock('@/lib/business-types', () => ({
  isValidBusinessType: mockIsValidBusinessType,
  applyBusinessTypeDefaults: mockApplyBusinessTypeDefaults,
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', BUSINESS_TYPE_CHANGE: 'BUSINESS_TYPE_CHANGE' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: mockTenantFindOne, findOneAndUpdate: mockTenantFindOneAndUpdate },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: 'auth-token=test-token',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(slug = 'test-shop') {
  return { params: Promise.resolve({ slug }) };
}

function makeErrorResponse(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeTenantDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => 'tenant-id-1' },
    slug: 'test-shop',
    isActive: true,
    settings: {
      taxRules: [{ id: 'tax_rule_1', name: 'VAT', rate: 12, label: 'VAT 12%' }],
      businessHours: { schedule: { monday: { open: '09:00', close: '18:00' } }, timezone: 'Asia/Manila' },
      currency: 'PHP',
      taxRate: 12,
      birTin: '123-456-789-000',
      birPtuNumber: 'PTU-001',
      ...overrides.settings,
    },
    markModified: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Returns a mock query object with .lean() support for routes that call .lean() */
function makeTenantLeanQuery(overrides: Record<string, any> = {}) {
  const doc = makeTenantDoc(overrides);
  return { lean: () => Promise.resolve(doc) };
}

// ===========================================================================
// GET /api/tenants/[slug]/settings
// ===========================================================================

describe('GET /api/tenants/[slug]/settings', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTenantFindOne.mockReturnValue(makeTenantLeanQuery());
    ({ GET } = await import('@/app/api/tenants/[slug]/settings/route'));
  });

  it('returns tenant settings (public)', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/settings'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currency).toBe('PHP');
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/settings'), makeParams());
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// PUT /api/tenants/[slug]/settings
// ===========================================================================

describe('PUT /api/tenants/[slug]/settings', () => {
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;

  const SLUG = 'test-shop';
  const updatedTenant = { _id: { toString: () => 'tenant-id-1' }, settings: { currency: 'PHP', taxRate: 10 } };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockIsValidBusinessType.mockReturnValue(true);
    mockApplyBusinessTypeDefaults.mockImplementation((s: object) => s);
    mockGetDefaultTenantSettings.mockReturnValue({ currency: 'PHP', taxRate: 12 });
    mockTenantFindOne.mockReturnValue(makeTenantLeanQuery());
    mockTenantFindOneAndUpdate.mockResolvedValue(updatedTenant);
    ({ PUT } = await import('@/app/api/tenants/[slug]/settings/route'));
  });

  it('updates settings and returns merged data', async () => {
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { currency: 'PHP', taxRate: 10 },
    }), makeParams(SLUG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockTenantFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: SLUG },
      expect.objectContaining({ $set: expect.any(Object) }),
      expect.any(Object)
    );
  });

  it('calls audit log with BUSINESS_TYPE_CHANGE when type changes', async () => {
    mockTenantFindOne.mockReturnValue(makeTenantLeanQuery({ settings: { businessType: 'retail', currency: 'PHP' } }));
    mockApplyBusinessTypeDefaults.mockImplementation((s: object) => ({ ...s, features: [] }));
    await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { businessType: 'restaurant' },
    }), makeParams(SLUG));
    const auditArg = mockCreateAuditLog.mock.calls[0][1];
    expect(auditArg.action).toBe('BUSINESS_TYPE_CHANGE');
  });

  it('returns 400 for invalid business type', async () => {
    mockIsValidBusinessType.mockReturnValue(false);
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { businessType: 'spaceship' },
    }), makeParams(SLUG));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid business type/i);
  });

  it('returns 400 when taxRate is out of range', async () => {
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { taxRate: 150 },
    }), makeParams(SLUG));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tax rate/i);
  });

  it('returns 400 for invalid hex color format', async () => {
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { primaryColor: 'notahex' },
    }), makeParams(SLUG));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid color/i);
  });

  it('returns 403 when user belongs to different tenant', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'other-tenant', role: 'admin' });
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: { currency: 'PHP' },
    }), makeParams(SLUG));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await PUT(makeRequest('PUT', `http://localhost/api/tenants/${SLUG}/settings`, {
      settings: {},
    }), makeParams(SLUG));
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// Tax Rules CRUD  /api/tenants/[slug]/tax-rules
// ===========================================================================

describe('Tax rules — GET + POST + PUT + DELETE', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let POST: (req: NextRequest, ctx: any) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;
  let DELETE: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    ({ GET, POST, PUT, DELETE } = await import('@/app/api/tenants/[slug]/tax-rules/route'));
  });

  // GET
  it('GET returns tenant tax rules', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/tax-rules'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('VAT');
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/tax-rules'), makeParams());
    expect(res.status).toBe(401);
  });

  it('GET returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/tax-rules'), makeParams());
    expect(res.status).toBe(404);
  });

  // POST
  it('POST creates a new tax rule with defaults', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/tax-rules', {
      name: 'Service Tax', rate: 5, label: 'SVC 5%',
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Service Tax');
    expect(body.data.id).toMatch(/^tax_rule_/);
    expect(body.data.appliesTo).toBe('all');
  });

  it('POST returns 403 when user is cashier', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 't', role: 'cashier' });
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/tax-rules', {
      name: 'T', rate: 5, label: 'T',
    }), makeParams());
    expect(res.status).toBe(403);
  });

  it('POST returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/tax-rules', {
      rate: 5,
    }), makeParams());
    expect(res.status).toBe(400);
  });

  it('POST returns 400 when rate > 100', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/tax-rules', {
      name: 'Tax', rate: 101, label: 'T',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/rate must be between/i);
  });

  // PUT
  it('PUT updates an existing rule', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/tax-rules', {
      id: 'tax_rule_1', rate: 8, isActive: false,
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rate).toBe(8);
    expect(body.data.isActive).toBe(false);
  });

  it('PUT returns 400 when ID is missing', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/tax-rules', { rate: 8 }), makeParams());
    expect(res.status).toBe(400);
  });

  it('PUT returns 404 when rule not found', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/tax-rules', {
      id: 'no_such_rule', rate: 5,
    }), makeParams());
    expect(res.status).toBe(404);
  });

  // DELETE
  it('DELETE removes a tax rule', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/tax-rules?id=tax_rule_1'),
      makeParams()
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('DELETE returns 400 when id param is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/tax-rules'), makeParams());
    expect(res.status).toBe(400);
  });

  it('DELETE returns 404 when rule not found', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/tax-rules?id=nonexistent'),
      makeParams()
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// GET/PUT /api/tenants/[slug]/business-hours
// ===========================================================================

describe('Business hours — GET + PUT', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    ({ GET, PUT } = await import('@/app/api/tenants/[slug]/business-hours/route'));
  });

  it('GET returns business hours', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/business-hours'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.timezone).toBe('Asia/Manila');
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/business-hours'), makeParams());
    expect(res.status).toBe(401);
  });

  it('PUT updates timezone and schedule', async () => {
    const schedule = { monday: { open: '08:00', close: '20:00' } };
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/business-hours', {
      timezone: 'UTC', schedule,
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.timezone).toBe('UTC');
    expect(body.data.schedule).toEqual(schedule);
  });

  it('PUT only updates provided fields (partial update)', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/business-hours', {
      timezone: 'UTC',
    }), makeParams());
    const body = await res.json();
    // schedule from existing tenant is preserved
    expect(body.data.schedule).toBeDefined();
  });

  it('PUT returns 403 when user is cashier', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 't', role: 'cashier' });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/business-hours', { timezone: 'UTC' }), makeParams());
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET/PUT /api/tenants/[slug]/bir-settings
// ===========================================================================

describe('BIR settings — GET + PUT', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    // bir-settings GET uses .lean(), PUT uses no .lean()
    mockTenantFindOne.mockReturnValue(makeTenantLeanQuery());
    ({ GET, PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route'));
  });

  it('GET returns BIR data for own tenant', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/bir-settings'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.birTin).toBe('123-456-789-000');
    expect(body.data.birPtuNumber).toBe('PTU-001');
  });

  it('GET returns 403 when user is on different tenant', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 'other', role: 'admin' });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/bir-settings'), makeParams());
    expect(res.status).toBe(403);
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/bir-settings'), makeParams());
    expect(res.status).toBe(401);
  });

  it('GET returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/bir-settings'), makeParams());
    expect(res.status).toBe(404);
  });

  it('PUT updates BIR settings and logs audit', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/bir-settings', {
      birTin: '123-456-789-000',
      birPtuNumber: 'PTU-2026',
    }), makeParams());
    expect(res.status).toBe(200);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'bir_settings' })
    );
  });

  it('PUT returns 400 for invalid TIN format', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/bir-settings', {
      birTin: '12345',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/NNN-NNN-NNN-NNN/);
  });

  it('PUT returns 403 when user is cashier', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 'tenant-id-1', role: 'cashier' });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/bir-settings', {}), makeParams());
    expect(res.status).toBe(403);
  });

  it('PUT returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/bir-settings', {}), makeParams());
    expect(res.status).toBe(429);
  });
});
