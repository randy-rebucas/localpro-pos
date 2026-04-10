process.env.JWT_SECRET = 'test-secret-32chars-crm!!!!!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockCampaignFind,
  mockCampaignFindOne,
  mockCampaignCreate,
  mockCustomerFind,
  mockTransactionAggregate,
  mockCheckRateLimit,
  mockObjectIdIsValid,
} = vi.hoisted(() => ({
  mockCampaignFind: vi.fn(),
  mockCampaignFindOne: vi.fn(),
  mockCampaignCreate: vi.fn(),
  mockCustomerFind: vi.fn(),
  mockTransactionAggregate: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 19, resetAt: 0 }),
  mockObjectIdIsValid: vi.fn().mockReturnValue(true),
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
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Campaign', () => ({
  default: {
    find: mockCampaignFind,
    findOne: mockCampaignFindOne,
    create: mockCampaignCreate,
  },
}));
vi.mock('@/models/Customer', () => ({
  default: { find: mockCustomerFind },
}));
vi.mock('@/models/Transaction', () => ({
  default: { aggregate: mockTransactionAggregate },
}));
vi.mock('mongoose', () => ({
  default: {
    Types: { ObjectId: { isValid: mockObjectIdIsValid } },
  },
  Types: { ObjectId: { isValid: mockObjectIdIsValid } },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockCampaign = {
  _id: 'camp-1',
  name: 'Welcome Email',
  channel: 'email',
  segment: 'new',
  subject: 'Welcome!',
  body: 'Thanks for joining.',
  status: 'draft',
  tenantId: 'tenant-1',
  sentCount: 0,
  save: vi.fn().mockResolvedValue(undefined),
};

const validCampaignBody = {
  name: 'Welcome Email',
  channel: 'email',
  segment: 'new',
  subject: 'Welcome!',
  body: 'Thanks for joining.',
};

// ---------------------------------------------------------------------------
// GET /api/crm/campaigns
// ---------------------------------------------------------------------------

describe('GET /api/crm/campaigns', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCampaignFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockCampaign]),
    });
    ({ GET } = await import('@/app/api/crm/campaigns/route'));
  });

  it('returns 200 with campaign list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/campaigns'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Welcome Email');
  });

  it('returns 200 with empty array when no campaigns', async () => {
    mockCampaignFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/campaigns'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/campaigns'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/crm/campaigns
// ---------------------------------------------------------------------------

describe('POST /api/crm/campaigns', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 19, resetAt: 0 });
    mockCampaignCreate.mockResolvedValue({ _id: 'camp-new', ...validCampaignBody, status: 'draft', tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/crm/campaigns/route'));
  });

  it('returns 201 on successful email campaign creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', validCampaignBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('camp-new');
    expect(body.data.status).toBe('draft');
  });

  it('returns 201 for sms campaign without subject', async () => {
    mockCampaignCreate.mockResolvedValue({ _id: 'camp-sms', channel: 'sms', status: 'draft' });
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', {
      name: 'SMS Blast',
      channel: 'sms',
      segment: 'all',
      body: 'Check out our sale!',
    }));
    expect(res.status).toBe(201);
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', { ...validCampaignBody, name: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when channel is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', { ...validCampaignBody, channel: 'push' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid channel/i);
  });

  it('returns 400 when segment is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', { ...validCampaignBody, segment: 'unknown' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid segment/i);
  });

  it('returns 400 when body is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', { ...validCampaignBody, body: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/body is required/i);
  });

  it('returns 400 when email campaign is missing subject', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', { ...validCampaignBody, subject: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/subject is required for email/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns', validCampaignBody));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/crm/segments
// ---------------------------------------------------------------------------

describe('GET /api/crm/segments', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const newCustomer = {
    _id: 'cust-1',
    firstName: 'Alice',
    lastName: 'New',
    email: 'alice@test.com',
    lastPurchaseDate: new Date(),
    loyaltyPointsBalance: 10,
    totalSpent: 200,
  };

  const vipCustomer = {
    _id: 'cust-2',
    firstName: 'Bob',
    lastName: 'Vip',
    email: 'bob@test.com',
    lastPurchaseDate: new Date(),
    loyaltyPointsBalance: 600,   // > VIP_POINTS_THRESHOLD (500)
    totalSpent: 6000,             // > VIP_SPEND_THRESHOLD (5000)
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockTransactionAggregate.mockResolvedValue([
      { _id: 'cust-1', orderCount: 1, totalSpent: 200 },
      { _id: 'cust-2', orderCount: 25, totalSpent: 6000 },
    ]);
    mockCustomerFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([newCustomer, vipCustomer]),
    });
    ({ GET } = await import('@/app/api/crm/segments/route'));
  });

  it('returns 200 with segment counts and customers', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/segments'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.counts).toBeDefined();
    expect(body.data.counts.all).toBe(2);
    expect(body.data.customers).toBeDefined();
  });

  it('returns 200 with empty data when no customers', async () => {
    mockTransactionAggregate.mockResolvedValue([]);
    mockCustomerFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/segments'));
    const body = await res.json();
    expect(body.data.counts.all).toBe(0);
    expect(body.data.customers).toHaveLength(0);
  });

  it('classifies vip customer correctly', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/segments?segment=vip'));
    const body = await res.json();
    expect(body.data.customers.some((c: any) => c.computedSegment === 'vip')).toBe(true);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/segments'));
    expect(res.status).toBe(401);
  });

  it('includes pagination metadata', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/crm/segments?page=1&limit=10'));
    const body = await res.json();
    expect(body.data.page).toBe(1);
    expect(body.data.totalPages).toBeGreaterThanOrEqual(1);
    expect(body.data.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/crm/campaigns/[id]/send
// ---------------------------------------------------------------------------

describe('POST /api/crm/campaigns/[id]/send', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'camp-1' }) };

  const mockDraftCampaign = {
    ...mockCampaign,
    status: 'draft',
    sentCount: 0,
    sentAt: undefined,
    save: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockObjectIdIsValid.mockReturnValue(true);
    mockCampaignFindOne.mockResolvedValue({ ...mockDraftCampaign, save: vi.fn().mockResolvedValue(undefined) });
    mockCustomerFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'cust-1', email: 'a@b.com', totalSpent: 100 },
        { _id: 'cust-2', email: 'b@c.com', totalSpent: 200 },
      ]),
    });
    ({ POST } = await import('@/app/api/crm/campaigns/[id]/send/route'));
  });

  it('returns 200 with sentCount on successful send', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/camp-1/send'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sentCount).toBeGreaterThanOrEqual(0);
    expect(body.data.channel).toBe('email');
  });

  it('returns 404 when campaign not found', async () => {
    mockCampaignFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/camp-1/send'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 409 when campaign already sent', async () => {
    mockCampaignFindOne.mockResolvedValue({ ...mockDraftCampaign, status: 'sent' });
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/camp-1/send'), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already sent/i);
  });

  it('returns 400 when campaign ID is invalid', async () => {
    mockObjectIdIsValid.mockReturnValueOnce(false);
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/bad-id/send'), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid campaign id/i);
  });

  it('returns 0 sentCount when no matching recipients', async () => {
    mockCustomerFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/camp-1/send'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sentCount).toBe(0);
  });

  it('returns auth response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/crm/campaigns/camp-1/send'), ctx);
    expect(res.status).toBe(401);
  });
});
