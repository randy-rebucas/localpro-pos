process.env.JWT_SECRET = 'test-secret-32chars-webhooks!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockWebhookFind,
  mockWebhookFindOne,
  mockWebhookFindOneAndUpdate,
  mockWebhookFindOneAndDelete,
  mockWebhookCreate,
  mockValidateWebhookUrl,
} = vi.hoisted(() => ({
  mockWebhookFind: vi.fn(),
  mockWebhookFindOne: vi.fn(),
  mockWebhookFindOneAndUpdate: vi.fn(),
  mockWebhookFindOneAndDelete: vi.fn(),
  mockWebhookCreate: vi.fn(),
  mockValidateWebhookUrl: vi.fn().mockReturnValue(null), // null = no error
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
vi.mock('@/lib/webhooks', () => ({
  validateWebhookUrl: mockValidateWebhookUrl,
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/models/Webhook', () => ({
  default: {
    find: mockWebhookFind,
    findOne: mockWebhookFindOne,
    findOneAndUpdate: mockWebhookFindOneAndUpdate,
    findOneAndDelete: mockWebhookFindOneAndDelete,
    create: mockWebhookCreate,
  },
  WEBHOOK_EVENTS: [
    'transaction.created',
    'transaction.refunded',
    'customer.created',
    'customer.updated',
    'inventory.low_stock',
  ],
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

const mockWebhook = {
  _id: 'wh-1',
  name: 'Order Notifier',
  url: 'https://example.com/webhook',
  events: ['transaction.created'],
  isActive: true,
  tenantId: 'tenant-1',
  name: 'Order Notifier',
};

// ---------------------------------------------------------------------------
// GET /api/webhooks
// ---------------------------------------------------------------------------

describe('GET /api/webhooks', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockWebhookFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockWebhook]),
    });
    ({ GET } = await import('@/app/api/webhooks/route'));
  });

  it('returns 200 with webhook list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/webhooks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Order Notifier');
  });

  it('returns 200 with empty array when no webhooks', async () => {
    mockWebhookFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/webhooks'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns error when auth fails', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/webhooks'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks
// ---------------------------------------------------------------------------

describe('POST /api/webhooks', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const validBody = {
    name: 'My Hook',
    url: 'https://example.com/hook',
    events: ['transaction.created'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockValidateWebhookUrl.mockReturnValue(null);
    mockWebhookCreate.mockResolvedValue({
      ...mockWebhook,
      _id: 'wh-new',
      name: 'My Hook',
      createdAt: new Date(),
    });
    ({ POST } = await import('@/app/api/webhooks/route'));
  });

  it('returns 201 with webhook and secret on creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toBeDefined(); // secret shown only on creation
    expect(body.data.events).toContain('transaction.created');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', { url: 'https://x.com', events: ['transaction.created'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name and url are required/i);
  });

  it('returns 400 when url is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', { name: 'Hook', events: ['transaction.created'] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when URL fails SSRF validation', async () => {
    mockValidateWebhookUrl.mockReturnValue('URL targets a private network address');
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', { ...validBody, url: 'http://192.168.1.1/hook' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/private network/i);
  });

  it('returns 400 when no valid events provided', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', {
      name: 'Hook',
      url: 'https://example.com/hook',
      events: ['not.a.real.event'],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one valid event/i);
  });

  it('returns 400 when events array is empty', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', {
      ...validBody,
      events: [],
    }));
    expect(res.status).toBe(400);
  });

  it('filters out invalid events and creates with only valid ones', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks', {
      ...validBody,
      events: ['transaction.created', 'not.valid', 'customer.created'],
    }));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/webhooks/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/webhooks/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'wh-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockWebhookFindOne.mockResolvedValue({ ...mockWebhook });
    mockWebhookFindOneAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockWebhook, name: 'Updated Hook' }),
    });
    ({ PATCH } = await import('@/app/api/webhooks/[id]/route'));
  });

  it('returns 200 on successful update', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/webhooks/wh-1', { name: 'Updated Hook' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOne.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/webhooks/wh-1', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 when URL is invalid', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/webhooks/wh-1', { url: 'not-a-url' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid url/i);
  });

  it('returns 400 when events update has no valid events', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/webhooks/wh-1', { events: ['bogus.event'] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one valid event/i);
  });

  it('can deactivate a webhook via isActive flag', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/webhooks/wh-1', { isActive: false }), ctx);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/webhooks/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/webhooks/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'wh-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockWebhookFindOneAndDelete.mockResolvedValue({ ...mockWebhook });
    ({ DELETE } = await import('@/app/api/webhooks/[id]/route'));
  });

  it('returns 200 on successful deletion', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/webhooks/wh-1'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOneAndDelete.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/webhooks/wh-1'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns auth error when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/webhooks/wh-1'), ctx);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
