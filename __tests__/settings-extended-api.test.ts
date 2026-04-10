process.env.JWT_SECRET = 'test-secret-32chars-settings!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockGetCurrentUser,
  mockCheckRateLimit,
  mockCheckBirFeatureAccess,
  mockValidateTemplate,
  mockFetchExchangeRates,
  mockCreateAuditLog,
  mockHandleApiError,
  mockTenantFindOne,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' }),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockCheckBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
  mockValidateTemplate: vi.fn().mockReturnValue({ valid: true }),
  mockFetchExchangeRates: vi.fn(),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn(),
  mockTenantFindOne: vi.fn(),
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
  generateToken: () => 'test-token',
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/subscription', () => ({
  checkBirFeatureAccess: mockCheckBirFeatureAccess,
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/receipt-templates', () => ({ validateTemplate: mockValidateTemplate }));
vi.mock('@/lib/notification-templates', () => ({
  validateNotificationTemplate: vi.fn().mockReturnValue({ valid: true }),
}));
vi.mock('@/lib/multi-currency', () => ({ fetchExchangeRates: mockFetchExchangeRates }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
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
  default: { findOne: mockTenantFindOne, findOneAndUpdate: vi.fn() },
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

function makeTenantDoc(settingOverrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => 'tenant-id-1' },
    slug: 'test-shop',
    isActive: true,
    settings: {
      holidays: [{ id: 'holiday_1', name: 'New Year', type: 'single', date: '2026-01-01' }],
      receiptTemplates: {
        templates: [{ id: 'tmpl_1', name: 'Default', html: '<html/>', isDefault: true }],
        default: 'tmpl_1',
      },
      notificationTemplates: { email: {}, sms: {} },
      multiCurrency: {
        enabled: true,
        displayCurrencies: ['USD', 'EUR'],
        exchangeRates: { USD: 0.018, EUR: 0.016 },
        exchangeRateApiKey: 'test-api-key',
        lastUpdated: new Date('2026-04-01'),
        toObject: () => ({ enabled: true, displayCurrencies: ['USD', 'EUR'], exchangeRates: { USD: 0.018, EUR: 0.016 }, exchangeRateApiKey: 'test-api-key' }),
      },
      currency: 'PHP',
      ...settingOverrides,
    },
    markModified: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

/** Returns a mock query object with .lean() support for routes that call .lean() */
function makeTenantLeanQuery(settingOverrides: Record<string, any> = {}) {
  const doc = makeTenantDoc(settingOverrides);
  return { lean: () => Promise.resolve(doc) };
}

// ===========================================================================
// Holidays CRUD  /api/tenants/[slug]/holidays
// ===========================================================================

describe('Holidays — GET + POST + PUT + DELETE', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let POST: (req: NextRequest, ctx: any) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;
  let DELETE: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    ({ GET, POST, PUT, DELETE } = await import('@/app/api/tenants/[slug]/holidays/route'));
  });

  // GET
  it('GET returns holidays list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/holidays'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('New Year');
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/holidays'), makeParams());
    expect(res.status).toBe(401);
  });

  // POST
  it('POST creates a single-date holiday', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      name: 'Independence Day',
      type: 'single',
      date: '2026-06-12',
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Independence Day');
    expect(body.data.id).toMatch(/^holiday_/);
    expect(body.data.isBusinessClosed).toBe(true); // default
  });

  it('POST creates a yearly recurring holiday', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      name: 'Christmas',
      type: 'recurring',
      recurring: { pattern: 'yearly', month: 12, dayOfMonth: 25 },
    }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).data.recurring.pattern).toBe('yearly');
  });

  it('POST returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      type: 'single', date: '2026-01-01',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name and type/i);
  });

  it('POST returns 400 when single holiday has no date', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      name: 'Holiday', type: 'single',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/date is required/i);
  });

  it('POST returns 400 when recurring has no pattern', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      name: 'Holiday', type: 'recurring', recurring: {},
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/recurring pattern/i);
  });

  it('POST returns 400 for yearly pattern missing dayOfMonth', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/holidays', {
      name: 'H', type: 'recurring', recurring: { pattern: 'yearly', month: 12 },
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/month and day/i);
  });

  // PUT
  it('PUT updates holiday name', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/holidays', {
      id: 'holiday_1', name: 'New Year Holiday',
    }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe('New Year Holiday');
  });

  it('PUT returns 400 when ID is missing', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/holidays', { name: 'X' }), makeParams());
    expect(res.status).toBe(400);
  });

  it('PUT returns 404 when holiday not found', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/holidays', {
      id: 'nonexistent', name: 'X',
    }), makeParams());
    expect(res.status).toBe(404);
  });

  // DELETE
  it('DELETE removes a holiday', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/holidays?id=holiday_1'),
      makeParams()
    );
    expect(res.status).toBe(200);
  });

  it('DELETE returns 400 when id is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/holidays'), makeParams());
    expect(res.status).toBe(400);
  });

  it('DELETE returns 404 when holiday not found', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/holidays?id=nonexistent'),
      makeParams()
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Receipt Templates CRUD  /api/tenants/[slug]/receipt-templates
// ===========================================================================

describe('Receipt templates — GET + POST + PUT + DELETE', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let POST: (req: NextRequest, ctx: any) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: any) => Promise<Response>;
  let DELETE: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockCheckBirFeatureAccess.mockResolvedValue(undefined);
    mockValidateTemplate.mockReturnValue({ valid: true });
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    mockTenantFindOne.mockReturnValue(makeTenantLeanQuery());
    ({ GET, POST, PUT, DELETE } = await import('@/app/api/tenants/[slug]/receipt-templates/route'));
  });

  // GET
  it('GET returns templates list and default', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/receipt-templates'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.templates).toHaveLength(1);
    expect(body.data.default).toBe('tmpl_1');
  });

  it('GET returns 403 when user is on different tenant', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 'other', role: 'admin' });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/receipt-templates'), makeParams());
    expect(res.status).toBe(403);
  });

  // POST
  it('POST creates a new receipt template', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      name: 'Custom Receipt',
      html: '<html><body>{{receiptNumber}}</body></html>',
    }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Custom Receipt');
    expect(body.data.id).toMatch(/^template_/);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'receipt_template', action: 'CREATE' })
    );
  });

  it('POST marks previous templates non-default when isDefault=true', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      name: 'New Default', html: '<html/>', isDefault: true,
    }), makeParams());
    expect((await res.json()).data.isDefault).toBe(true);
  });

  it('POST returns 400 when html is missing', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      name: 'Broken',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name and html/i);
  });

  it('POST returns 400 when template validation fails', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    mockValidateTemplate.mockReturnValue({ valid: false, error: 'Missing {{total}} tag' });
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      name: 'Bad', html: '<html/>',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing {{total}} tag');
  });

  it('POST returns 403 when receipt feature is disabled', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    mockCheckBirFeatureAccess.mockRejectedValue(new Error('Feature not enabled'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      name: 'X', html: '<html/>',
    }), makeParams());
    expect(res.status).toBe(403);
  });

  // PUT
  it('PUT updates template name and logs audit', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      id: 'tmpl_1', name: 'Updated Receipt',
    }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe('Updated Receipt');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'receipt_template', action: 'UPDATE' })
    );
  });

  it('PUT returns 404 when template not found', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/tenants/test-shop/receipt-templates', {
      id: 'no_tmpl', name: 'X',
    }), makeParams());
    expect(res.status).toBe(404);
  });

  // DELETE
  it('DELETE removes template and logs audit', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/receipt-templates?id=tmpl_1'),
      makeParams()
    );
    expect(res.status).toBe(200);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'receipt_template', action: 'DELETE' })
    );
  });

  it('DELETE clears default when the deleted template was default', async () => {
    // tmpl_1 is the default; deleting it should clear default
    const tenantDoc = makeTenantDoc();
    mockTenantFindOne.mockResolvedValue(tenantDoc);
    await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/receipt-templates?id=tmpl_1'),
      makeParams()
    );
    // The tenant.save() should have been called with cleared default
    expect(tenantDoc.save).toHaveBeenCalled();
  });

  it('DELETE returns 400 when id is missing', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/receipt-templates'),
      makeParams()
    );
    expect(res.status).toBe(400);
  });

  it('DELETE returns 404 when template not found', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tenants/test-shop/receipt-templates?id=nonexistent'),
      makeParams()
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// GET/POST /api/tenants/[slug]/exchange-rates
// ===========================================================================

describe('Exchange rates — GET + POST', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;
  let POST: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-id-1', role: 'admin' });
    mockTenantFindOne.mockResolvedValue(makeTenantDoc());
    ({ GET, POST } = await import('@/app/api/tenants/[slug]/exchange-rates/route'));
  });

  it('GET returns current exchange rates', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/exchange-rates'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.exchangeRates).toEqual({ USD: 0.018, EUR: 0.016 });
  });

  it('GET returns 400 when multi-currency is disabled', async () => {
    mockTenantFindOne.mockResolvedValue(makeTenantDoc({ multiCurrency: { enabled: false } }));
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/exchange-rates'), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not enabled/i);
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/tenants/test-shop/exchange-rates'), makeParams());
    expect(res.status).toBe(401);
  });

  it('POST action=update manually sets rates', async () => {
    const rates = { USD: 0.02, EUR: 0.018 };
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'update', exchangeRates: rates,
    }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).data.exchangeRates).toEqual(rates);
  });

  it('POST action=update returns 400 for non-positive rate', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'update', exchangeRates: { USD: -1 },
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/positive number/i);
  });

  it('POST action=fetch calls fetchExchangeRates with correct args', async () => {
    mockFetchExchangeRates.mockResolvedValue({ USD: 0.019, EUR: 0.017 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'fetch',
    }), makeParams());
    expect(res.status).toBe(200);
    expect(mockFetchExchangeRates).toHaveBeenCalledWith('PHP', ['USD', 'EUR'], expect.anything());
  });

  it('POST action=fetch returns 502 when provider unavailable', async () => {
    mockFetchExchangeRates.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'fetch',
    }), makeParams());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it('POST returns 400 for unknown action', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'unknown',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid action/i);
  });

  it('POST returns 403 when user is cashier', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 'tenant-id-1', role: 'cashier' });
    const res = await POST(makeRequest('POST', 'http://localhost/api/tenants/test-shop/exchange-rates', {
      action: 'update', exchangeRates: { USD: 0.02 },
    }), makeParams());
    expect(res.status).toBe(403);
  });
});
