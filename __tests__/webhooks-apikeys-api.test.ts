import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }));
const mockGetClientIp = vi.hoisted(() => vi.fn().mockReturnValue('127.0.0.1'));
const mockCreateAuditLog = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHandleApiError = vi.hoisted(() =>
  vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false, error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  )
);
const mockValidateWebhookUrl = vi.hoisted(() => vi.fn().mockReturnValue(null));
const mockDispatchWebhook = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Webhook model mocks
const mockWebhookFind = vi.hoisted(() => vi.fn());
const mockWebhookFindOne = vi.hoisted(() => vi.fn());
const mockWebhookFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockWebhookFindOneAndDelete = vi.hoisted(() => vi.fn());
const mockWebhookCreate = vi.hoisted(() => vi.fn());

// WebhookDelivery model mocks
const mockDeliveryFind = vi.hoisted(() => vi.fn());

// ApiKey model mocks
const mockApiKeyFind = vi.hoisted(() => vi.fn());
const mockApiKeyFindOne = vi.hoisted(() => vi.fn());
const mockApiKeyFindByIdAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockApiKeyCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/api-tenant', () => ({ requireTenantAccess: mockRequireTenantAccess }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/webhooks', () => ({
  validateWebhookUrl: mockValidateWebhookUrl,
  dispatchWebhook: mockDispatchWebhook,
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
    'booking.created',
    'inventory.low_stock',
  ] as const,
}));
vi.mock('@/models/WebhookDelivery', () => ({
  default: { find: mockDeliveryFind },
}));
vi.mock('@/models/ApiKey', () => ({
  default: {
    find: mockApiKeyFind,
    findOne: mockApiKeyFindOne,
    findByIdAndUpdate: mockApiKeyFindByIdAndUpdate,
    create: mockApiKeyCreate,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-abc';
const USER_ID = 'user-xyz';
const WEBHOOK_ID = 'webhook-001';
const APIKEY_ID = 'apikey-001';

function makeWebhookDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => WEBHOOK_ID },
    tenantId: TENANT_ID,
    name: 'My Webhook',
    url: 'https://example.com/hook',
    events: ['transaction.created'],
    isActive: true,
    secret: 'abc123',
    createdAt: new Date(),
    toObject: vi.fn(function () { return { ...this }; }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeApiKeyDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => APIKEY_ID },
    tenantId: TENANT_ID,
    name: 'My API Key',
    keyHash: 'hash123',
    keyPrefix: 'sk_live_abc12',
    permissions: ['transactions:read'],
    isActive: true,
    expiresAt: undefined,
    createdAt: new Date(),
    toObject: vi.fn(function () { return { ...this }; }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRequest(opts: {
  method?: string;
  url?: string;
  body?: Record<string, any>;
} = {}): NextRequest {
  const url = opts.url ?? 'http://localhost/api/webhooks';
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
  };
  if (opts.body) init.body = JSON.stringify(opts.body);
  return new NextRequest(url, init);
}

// ── Webhook tests ─────────────────────────────────────────────────────────────

describe('GET /api/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockWebhookFind.mockReturnValue({
      select: () => ({ sort: () => ({ lean: () => Promise.resolve([makeWebhookDoc()]) }) }),
    });
  });

  it('returns 200 with webhook list', async () => {
    const { GET } = await import('@/app/api/webhooks/route');
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('queries by tenantId', async () => {
    const { GET } = await import('@/app/api/webhooks/route');
    await GET(makeRequest());
    expect(mockWebhookFind).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('excludes secret field', async () => {
    const selectSpy = vi.fn().mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([]) }),
    });
    mockWebhookFind.mockReturnValue({ select: selectSpy });
    const { GET } = await import('@/app/api/webhooks/route');
    await GET(makeRequest());
    expect(selectSpy).toHaveBeenCalledWith('-secret');
  });
});

describe('POST /api/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockValidateWebhookUrl.mockReturnValue(null);
    mockWebhookCreate.mockResolvedValue(makeWebhookDoc());
  });

  it('returns 201 with created webhook and secret', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', url: 'https://example.com/hook', events: ['transaction.created'] },
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.secret).toBeDefined();
    expect(json.data.message).toMatch(/Store the secret/);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { url: 'https://example.com/hook', events: ['transaction.created'] },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when url is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', events: ['transaction.created'] },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when URL fails SSRF validation', async () => {
    mockValidateWebhookUrl.mockReturnValue('URL is not allowed');
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', url: 'http://localhost/internal', events: ['transaction.created'] },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when events list is empty', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', url: 'https://example.com/hook', events: [] },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when all events are invalid', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', url: 'https://example.com/hook', events: ['invalid.event'] },
    }));
    expect(res.status).toBe(400);
  });

  it('filters out invalid events and creates with only valid ones', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    await POST(makeRequest({
      method: 'POST',
      body: {
        name: 'My Hook',
        url: 'https://example.com/hook',
        events: ['transaction.created', 'invalid.event'],
      },
    }));
    const createArg = mockWebhookCreate.mock.calls[0][0];
    expect(createArg.events).toEqual(['transaction.created']);
    expect(createArg.events).not.toContain('invalid.event');
  });

  it('calls createAuditLog with CREATE action', async () => {
    const { POST } = await import('@/app/api/webhooks/route');
    await POST(makeRequest({
      method: 'POST',
      body: { name: 'My Hook', url: 'https://example.com/hook', events: ['transaction.created'] },
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'webhook' })
    );
  });
});

describe('PATCH /api/webhooks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockWebhookFindOne.mockResolvedValue(makeWebhookDoc());
    mockWebhookFindOneAndUpdate.mockReturnValue({
      select: () => Promise.resolve(makeWebhookDoc()),
    });
  });

  it('returns 200 on successful update', async () => {
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { name: 'Updated Hook' } }),
      { params: Promise.resolve({ id: WEBHOOK_ID }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 400 for invalid URL', async () => {
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { url: 'not-a-url' } }),
      { params: Promise.resolve({ id: WEBHOOK_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when updated events are all invalid', async () => {
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { events: ['invalid.event'] } }),
      { params: Promise.resolve({ id: WEBHOOK_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it('calls findOneAndUpdate with correct updates', async () => {
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    await PATCH(
      makeRequest({ method: 'PATCH', body: { name: 'New Name', isActive: false } }),
      { params: Promise.resolve({ id: WEBHOOK_ID }) }
    );
    expect(mockWebhookFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: WEBHOOK_ID, tenantId: TENANT_ID },
      expect.objectContaining({ name: 'New Name', isActive: false }),
      { new: true }
    );
  });

  it('calls createAuditLog with UPDATE action', async () => {
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    await PATCH(
      makeRequest({ method: 'PATCH', body: { name: 'Updated' } }),
      { params: Promise.resolve({ id: WEBHOOK_ID }) }
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'webhook' })
    );
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOne.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/webhooks/[id]/route');
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { name: 'Test' } }),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/webhooks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockWebhookFindOneAndDelete.mockResolvedValue(makeWebhookDoc());
  });

  it('returns 200 on successful deletion', async () => {
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls findOneAndDelete with _id and tenantId', async () => {
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(mockWebhookFindOneAndDelete).toHaveBeenCalledWith({ _id: WEBHOOK_ID, tenantId: TENANT_ID });
  });

  it('calls createAuditLog with DELETE action', async () => {
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'webhook' })
    );
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOneAndDelete.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/webhooks/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: 'missing-id' }) });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/webhooks/[id]/deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockWebhookFindOne.mockResolvedValue(makeWebhookDoc());
    mockDeliveryFind.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }),
    });
  });

  it('returns 200 with delivery list', async () => {
    const { GET } = await import('@/app/api/webhooks/[id]/deliveries/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('queries deliveries by webhookId and tenantId', async () => {
    const { GET } = await import('@/app/api/webhooks/[id]/deliveries/route');
    await GET(makeRequest(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(mockDeliveryFind).toHaveBeenCalledWith({ webhookId: WEBHOOK_ID, tenantId: TENANT_ID });
  });

  it('applies default limit of 50', async () => {
    const limitSpy = vi.fn().mockReturnValue({ lean: () => Promise.resolve([]) });
    mockDeliveryFind.mockReturnValue({ sort: () => ({ limit: limitSpy }) });
    const { GET } = await import('@/app/api/webhooks/[id]/deliveries/route');
    await GET(makeRequest(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(limitSpy).toHaveBeenCalledWith(50);
  });

  it('caps limit at 200', async () => {
    const limitSpy = vi.fn().mockReturnValue({ lean: () => Promise.resolve([]) });
    mockDeliveryFind.mockReturnValue({ sort: () => ({ limit: limitSpy }) });
    const { GET } = await import('@/app/api/webhooks/[id]/deliveries/route');
    const req = makeRequest({ url: 'http://localhost/api/webhooks/x/deliveries?limit=9999' });
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(limitSpy).toHaveBeenCalledWith(200);
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOne.mockResolvedValue(null);
    const { GET } = await import('@/app/api/webhooks/[id]/deliveries/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'missing-id' }) });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/webhooks/[id]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true, resetAfterMs: 0 });
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockWebhookFindOne.mockResolvedValue(makeWebhookDoc());
    mockValidateWebhookUrl.mockReturnValue(null);
    mockDispatchWebhook.mockResolvedValue(undefined);
  });

  it('returns 200 and dispatches test event', async () => {
    const { POST } = await import('@/app/api/webhooks/[id]/test/route');
    const res = await POST(makeRequest({ method: 'POST' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockDispatchWebhook).toHaveBeenCalledWith(
      TENANT_ID,
      'transaction.created',
      expect.objectContaining({ test: true })
    );
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, resetAfterMs: 30000 });
    const { POST } = await import('@/app/api/webhooks/[id]/test/route');
    const res = await POST(makeRequest({ method: 'POST' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(429);
  });

  it('returns 404 when webhook not found', async () => {
    mockWebhookFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/webhooks/[id]/test/route');
    const res = await POST(makeRequest({ method: 'POST' }), { params: Promise.resolve({ id: 'missing-id' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when webhook URL is invalid at test time', async () => {
    mockValidateWebhookUrl.mockReturnValue('Private IP not allowed');
    const { POST } = await import('@/app/api/webhooks/[id]/test/route');
    const res = await POST(makeRequest({ method: 'POST' }), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(400);
  });
});

// ── API Key tests ─────────────────────────────────────────────────────────────

describe('GET /api/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockApiKeyFind.mockReturnValue({
      select: () => ({ sort: () => ({ lean: () => Promise.resolve([makeApiKeyDoc()]) }) }),
    });
  });

  it('returns 200 with API key list', async () => {
    const { GET } = await import('@/app/api/api-keys/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/api-keys' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('queries only active keys for tenant', async () => {
    const { GET } = await import('@/app/api/api-keys/route');
    await GET(makeRequest({ url: 'http://localhost/api/api-keys' }));
    expect(mockApiKeyFind).toHaveBeenCalledWith({ tenantId: TENANT_ID, isActive: true });
  });

  it('excludes keyHash field', async () => {
    const selectSpy = vi.fn().mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([]) }),
    });
    mockApiKeyFind.mockReturnValue({ select: selectSpy });
    const { GET } = await import('@/app/api/api-keys/route');
    await GET(makeRequest({ url: 'http://localhost/api/api-keys' }));
    expect(selectSpy).toHaveBeenCalledWith('-keyHash');
  });
});

describe('POST /api/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockApiKeyCreate.mockResolvedValue(makeApiKeyDoc());
  });

  it('returns 201 with key and prefix', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: 'My Key' },
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.key).toMatch(/^sk_live_/);
    expect(json.data.message).toMatch(/Store this key/);
  });

  it('generates a key with sk_live_ prefix', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: 'My Key' },
    }));
    const json = await res.json();
    expect(json.data.key).toMatch(/^sk_live_[0-9a-f]{64}$/);
  });

  it('stores keyHash (sha256) not the raw key', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: 'My Key' },
    }));
    const createArg = mockApiKeyCreate.mock.calls[0][0];
    expect(createArg.keyHash).toBeDefined();
    expect(createArg.keyHash).toHaveLength(64); // sha256 hex
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: {},
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty string', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: '  ' },
    }));
    expect(res.status).toBe(400);
  });

  it('filters invalid permissions', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: 'My Key', permissions: ['transactions:read', 'invalid:permission'] },
    }));
    const createArg = mockApiKeyCreate.mock.calls[0][0];
    expect(createArg.permissions).toContain('transactions:read');
    expect(createArg.permissions).not.toContain('invalid:permission');
  });

  it('calls createAuditLog with CREATE action', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/api-keys',
      body: { name: 'My Key' },
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'api_key' })
    );
  });
});

describe('DELETE /api/api-keys/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockApiKeyFindOne.mockResolvedValue(makeApiKeyDoc());
    mockApiKeyFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns 200 on successful revocation', async () => {
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    const res = await DELETE(
      makeRequest({ method: 'DELETE', url: 'http://localhost/api/api-keys/x' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls findByIdAndUpdate to set isActive=false', async () => {
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    await DELETE(
      makeRequest({ method: 'DELETE', url: 'http://localhost/api/api-keys/x' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    expect(mockApiKeyFindByIdAndUpdate).toHaveBeenCalledWith(APIKEY_ID, { isActive: false });
  });

  it('calls createAuditLog with DELETE action', async () => {
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    await DELETE(
      makeRequest({ method: 'DELETE', url: 'http://localhost/api/api-keys/x' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'api_key' })
    );
  });

  it('returns 404 when API key not found', async () => {
    mockApiKeyFindOne.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/api-keys/[id]/route');
    const res = await DELETE(
      makeRequest({ method: 'DELETE', url: 'http://localhost/api/api-keys/x' }),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/api-keys/[id]/rotate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockApiKeyFindOne.mockResolvedValue(makeApiKeyDoc());
    mockApiKeyFindByIdAndUpdate.mockResolvedValue(undefined);
    mockApiKeyCreate.mockResolvedValue(makeApiKeyDoc({ _id: { toString: () => 'apikey-002' } }));
  });

  it('returns 200 with new key', async () => {
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    const res = await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/api-keys/x/rotate' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.key).toMatch(/^sk_live_/);
    expect(json.data.message).toMatch(/Store this key/);
  });

  it('revokes old key before creating new one', async () => {
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/api-keys/x/rotate' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    expect(mockApiKeyFindByIdAndUpdate).toHaveBeenCalledWith(APIKEY_ID, { isActive: false });
    expect(mockApiKeyCreate).toHaveBeenCalled();
  });

  it('preserves name and permissions from old key', async () => {
    const oldKey = makeApiKeyDoc({ permissions: ['reports:read'] });
    mockApiKeyFindOne.mockResolvedValue(oldKey);
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/api-keys/x/rotate' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    const createArg = mockApiKeyCreate.mock.calls[0][0];
    expect(createArg.name).toBe(oldKey.name);
    expect(createArg.permissions).toEqual(['reports:read']);
  });

  it('calls createAuditLog with UPDATE action', async () => {
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/api-keys/x/rotate' }),
      { params: Promise.resolve({ id: APIKEY_ID }) }
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'api_key' })
    );
  });

  it('returns 404 when key not found or inactive', async () => {
    mockApiKeyFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/api-keys/[id]/rotate/route');
    const res = await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/api-keys/x/rotate' }),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(res.status).toBe(404);
  });
});
