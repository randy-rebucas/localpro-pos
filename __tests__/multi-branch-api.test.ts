process.env.JWT_SECRET = 'test-secret-32chars-branches!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockRequireTenantAccess,
  mockCheckRateLimit,
  mockCheckFeatureAccess,
  mockCheckSubscriptionLimit,
  mockSubscriptionServiceUpdateUsage,
  mockCreateAuditLog,
  mockHandleApiError,
  mockGetValidationTranslator,
  mockBranchFind,
  mockBranchFindOne,
  mockBranchCreate,
  mockBranchCountDocuments,
  mockVerifyCronAuth,
  mockSyncMultiBranchData,
} = vi.hoisted(() => ({
  mockRequireTenantAccess: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockCheckFeatureAccess: vi.fn().mockResolvedValue(undefined),
  mockCheckSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  mockSubscriptionServiceUpdateUsage: vi.fn().mockResolvedValue(undefined),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn(),
  mockGetValidationTranslator: vi.fn(),
  mockBranchFind: vi.fn(),
  mockBranchFindOne: vi.fn(),
  mockBranchCreate: vi.fn(),
  mockBranchCountDocuments: vi.fn(),
  mockVerifyCronAuth: vi.fn().mockReturnValue(null),
  mockSyncMultiBranchData: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  generateToken: () => 'test-token',
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: mockRequireTenantAccess,
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
  checkSubscriptionLimit: mockCheckSubscriptionLimit,
  SubscriptionService: { updateUsage: mockSubscriptionServiceUpdateUsage },
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: mockGetValidationTranslator,
}));
vi.mock('@/lib/automation-auth', () => ({ verifyCronAuth: mockVerifyCronAuth }));
vi.mock('@/lib/automations', () => ({ syncMultiBranchData: mockSyncMultiBranchData }));
vi.mock('@/models/Branch', () => ({
  default: {
    find: mockBranchFind,
    findOne: mockBranchFindOne,
    create: mockBranchCreate,
    countDocuments: mockBranchCountDocuments,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: 'auth-token=test-token', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id = 'branch-id-1') {
  return { params: Promise.resolve({ id }) };
}

const TENANT_ID = 'tenant-id-1';

function makeBranchDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => 'branch-id-1' },
    tenantId: TENANT_ID,
    name: 'Main Branch',
    code: 'MAIN',
    address: { street: '123 Main St', city: 'Manila', country: 'PH' },
    phone: '+63-2-1234567',
    email: 'main@shop.com',
    managerId: null,
    isActive: true,
    toObject: vi.fn().mockReturnValue({ _id: 'branch-id-1', name: 'Main Branch', isActive: true }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const syncResult = {
  success: true,
  message: '3 branches synced',
  processed: 3,
  failed: 0,
  errors: [],
};

// ===========================================================================
// GET /api/branches
// ===========================================================================

describe('GET /api/branches', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    const branches = [makeBranchDoc(), makeBranchDoc({ name: 'North Branch', _id: { toString: () => 'branch-id-2' } })];
    mockBranchFind.mockReturnValue({
      populate: () => ({ sort: () => ({ lean: () => Promise.resolve(branches) }) }),
    });
    ({ GET } = await import('@/app/api/branches/route'));
  });

  it('returns 200 with all branches', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Main Branch');
  });

  it('filters by isActive=true query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/branches?isActive=true'));
    expect(mockBranchFind).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('filters by isActive=false query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/branches?isActive=false'));
    expect(mockBranchFind).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/branches
// ===========================================================================

describe('POST /api/branches', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const newBranch = {
    _id: { toString: () => 'branch-new-1' },
    tenantId: TENANT_ID,
    name: 'New Branch',
    code: 'NEW',
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockGetValidationTranslator.mockResolvedValue((_key: string, fallback: string) => fallback);
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockCheckSubscriptionLimit.mockResolvedValue(undefined);
    mockBranchCountDocuments.mockResolvedValue(0); // first branch
    mockBranchCreate.mockResolvedValue(newBranch);
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ POST } = await import('@/app/api/branches/route'));
  });

  it('returns 201 when creating first branch (no feature check)', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', {
      name: 'New Branch', code: 'NEW',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Branch');
    // Feature check should NOT be called when count is 0
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled();
  });

  it('checks multi-branch feature when count >= 1', async () => {
    mockBranchCountDocuments.mockResolvedValue(1);
    await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'Branch 2' }));
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(TENANT_ID, 'enableMultiBranch');
  });

  it('returns 403 when multi-branch feature is disabled', async () => {
    mockBranchCountDocuments.mockResolvedValue(1);
    mockCheckFeatureAccess.mockRejectedValue(new Error('Multi-branch not enabled'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'Branch 2' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Multi-branch not enabled');
  });

  it('returns 403 when subscription limit reached', async () => {
    mockCheckSubscriptionLimit.mockRejectedValue(new Error('Branch limit reached'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'New Branch' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Branch limit reached');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/branch name is required/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'New Branch' }));
    expect(res.status).toBe(429);
  });

  it('calls createAuditLog after successful creation', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'New Branch', code: 'NEW' }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'branch' })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/branches', { name: 'X' }));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/branches/[id]
// ===========================================================================

describe('GET /api/branches/[id]', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockGetValidationTranslator.mockResolvedValue((_key: string, fallback: string) => fallback);
    mockBranchFindOne.mockReturnValue({
      populate: () => ({ lean: () => Promise.resolve(makeBranchDoc()) }),
    });
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ GET } = await import('@/app/api/branches/[id]/route'));
  });

  it('returns 200 with branch data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Main Branch');
  });

  it('queries branch by id and tenantId', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/branches/branch-id-1'), makeParams('branch-id-1'));
    expect(mockBranchFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'branch-id-1', tenantId: TENANT_ID })
    );
  });

  it('returns 404 when branch not found', async () => {
    mockBranchFindOne.mockReturnValue({
      populate: () => ({ lean: () => Promise.resolve(null) }),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches/nope'), makeParams('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/branch not found/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// PUT /api/branches/[id]
// ===========================================================================

describe('PUT /api/branches/[id]', () => {
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockBranchFindOne.mockResolvedValue(makeBranchDoc());
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ PUT } = await import('@/app/api/branches/[id]/route'));
  });

  it('returns 200 and updates branch fields', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/branches/branch-id-1', {
      name: 'Updated Branch', phone: '+63-2-9999999',
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('calls createAuditLog with UPDATE action', async () => {
    await PUT(makeRequest('PUT', 'http://localhost/api/branches/branch-id-1', { name: 'Updated' }), makeParams());
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'branch' })
    );
  });

  it('returns 404 when branch not found', async () => {
    mockBranchFindOne.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/branches/nope', { name: 'X' }), makeParams('nope'));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/branches/branch-id-1', { name: 'X' }), makeParams());
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/branches/branch-id-1', { name: 'X' }), makeParams());
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/branches/[id]
// ===========================================================================

describe('DELETE /api/branches/[id]', () => {
  let DELETE: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGetValidationTranslator.mockResolvedValue((_key: string, fallback: string) => fallback);
    mockBranchFindOne.mockResolvedValue(makeBranchDoc());
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ DELETE } = await import('@/app/api/branches/[id]/route'));
  });

  it('returns 200 and soft-deletes the branch (sets isActive=false)', async () => {
    const branchDoc = makeBranchDoc();
    mockBranchFindOne.mockResolvedValue(branchDoc);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(res.status).toBe(200);
    expect(branchDoc.isActive).toBe(false);
    expect(branchDoc.save).toHaveBeenCalled();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deactivated/i);
  });

  it('calls createAuditLog with DELETE action', async () => {
    await DELETE(makeRequest('DELETE', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'branch' })
    );
  });

  it('returns 404 when branch not found', async () => {
    mockBranchFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/branches/nope'), makeParams('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/branch not found/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/branches/branch-id-1'), makeParams());
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/automations/sync/multi-branch
// ===========================================================================

describe('POST /api/automations/sync/multi-branch', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSyncMultiBranchData.mockResolvedValue(syncResult);
    ({ POST } = await import('@/app/api/automations/sync/multi-branch/route'));
  });

  it('returns 200 with sync result', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/sync/multi-branch', {
      tenantId: 'tenant-1',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(3);
  });

  it('passes tenantId and sync flags to syncMultiBranchData', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/automations/sync/multi-branch', {
      tenantId: 'tenant-1',
      syncProducts: true,
      syncCustomers: false,
      syncDiscounts: true,
      conflictResolution: 'last-write-wins',
    }));
    expect(mockSyncMultiBranchData).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      syncProducts: true,
      syncCustomers: false,
      syncDiscounts: true,
      conflictResolution: 'last-write-wins',
    });
  });

  it('strips invalid conflictResolution to undefined', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/automations/sync/multi-branch', {
      conflictResolution: 'invalid-strategy',
    }));
    expect(mockSyncMultiBranchData).toHaveBeenCalledWith(
      expect.objectContaining({ conflictResolution: undefined })
    );
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/sync/multi-branch', {}));
    expect(res.status).toBe(401);
  });

  it('returns 500 when syncMultiBranchData throws', async () => {
    mockSyncMultiBranchData.mockRejectedValue(new Error('Sync failed'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/sync/multi-branch', {}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain('Sync failed');
  });
});

// ===========================================================================
// GET /api/automations/sync/multi-branch
// ===========================================================================

describe('GET /api/automations/sync/multi-branch', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSyncMultiBranchData.mockResolvedValue(syncResult);
    ({ GET } = await import('@/app/api/automations/sync/multi-branch/route'));
  });

  it('returns 200 with sync result', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('defaults to syncProducts/Customers/Discounts=true when not specified', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch?tenantId=t1'));
    expect(mockSyncMultiBranchData).toHaveBeenCalledWith(
      expect.objectContaining({ syncProducts: true, syncCustomers: true, syncDiscounts: true })
    );
  });

  it('parses syncProducts=false from query string', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch?syncProducts=false&tenantId=t1'));
    expect(mockSyncMultiBranchData).toHaveBeenCalledWith(
      expect.objectContaining({ syncProducts: false, tenantId: 't1' })
    );
  });

  it('defaults conflictResolution to last-write-wins for invalid value', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch?conflictResolution=bogus'));
    expect(mockSyncMultiBranchData).toHaveBeenCalledWith(
      expect.objectContaining({ conflictResolution: 'last-write-wins' })
    );
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch'));
    expect(res.status).toBe(401);
  });

  it('returns 500 when syncMultiBranchData throws', async () => {
    mockSyncMultiBranchData.mockRejectedValue(new Error('Network error'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/sync/multi-branch'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
