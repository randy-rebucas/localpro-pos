process.env.JWT_SECRET = 'test-secret-for-tenant-settings-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { UPDATE: 'UPDATE' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/currency', () => ({
  getDefaultTenantSettings: vi.fn().mockReturnValue({
    currency: 'PHP', currencySymbol: '₱', taxRate: 0, primaryColor: '#35979c',
  }),
}));

vi.mock('@/lib/business-types', () => ({
  applyBusinessTypeDefaults: vi.fn((settings: Record<string, unknown>) => settings),
  isBusinessTypeOpenForSignup: vi.fn((type: unknown) => ['retail', 'general'].includes(String(type))),
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockTenantFindOne = vi.fn();
const mockTenantFindOneAndUpdate = vi.fn();

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: (...args: unknown[]) => mockTenantFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockTenantFindOneAndUpdate(...args),
  },
}));

import { GET, PUT } from '@/app/api/tenants/[slug]/settings/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a-id';
const TENANT_B_ID = 'tenant-b-id';
const SLUG = 'store-a';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockGetCurrentUser.mockResolvedValue({ userId, tenantId, email: 'test@example.com', role });
}

/** findOne(...) chain supporting both `.lean()` and `.select(...).lean()`. */
function findOneChain(value: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }),
    lean: vi.fn().mockResolvedValue(value),
  };
}

/** PUT reads the existing tenant via `Tenant.findOne({ slug }).select(...).lean()`. */
function mockExistingTenant(tenant: Record<string, unknown> | null) {
  mockTenantFindOne.mockReturnValue(findOneChain(tenant));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// GET /api/tenants/:slug/settings
// ---------------------------------------------------------------------------

describe('GET /api/tenants/:slug/settings', () => {
  it('returns settings for an existing active tenant', async () => {
    mockTenantFindOne.mockReturnValue(findOneChain({ _id: TENANT_A_ID, slug: SLUG, settings: { companyName: 'Acme' } }));

    const res = await GET(createRequest(`/api/tenants/${SLUG}/settings`), { params: Promise.resolve({ slug: SLUG }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual({ companyName: 'Acme' });
    expect(mockTenantFindOne).toHaveBeenCalledWith({ slug: SLUG, isActive: true });
  });

  it('404s for a tenant that does not exist or is inactive', async () => {
    mockTenantFindOne.mockReturnValue(findOneChain(null));

    const res = await GET(createRequest(`/api/tenants/unknown/settings`), { params: Promise.resolve({ slug: 'unknown' }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it('strips secrets for anonymous callers', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockTenantFindOne.mockReturnValue(findOneChain({
      _id: TENANT_A_ID,
      slug: 'secret-anon',
      settings: {
        companyName: 'Acme',
        birEsalesPushUrl: 'https://push.example.com',
        multiCurrency: { enabled: true, exchangeRateApiKey: 'sk-live' },
      },
    }));

    const res = await GET(createRequest('/api/tenants/secret-anon/settings'), { params: Promise.resolve({ slug: 'secret-anon' }) });
    const { body } = await parseResponse(res);

    expect(body.data).toEqual({ companyName: 'Acme', multiCurrency: { enabled: true } });
  });

  it('strips secrets for a settings manager of a different tenant', async () => {
    authAs(TENANT_B_ID, 'owner');
    mockTenantFindOne.mockReturnValue(findOneChain({
      _id: TENANT_A_ID,
      slug: 'secret-other',
      settings: { multiCurrency: { exchangeRateApiKey: 'sk-live' } },
    }));

    const res = await GET(createRequest('/api/tenants/secret-other/settings'), { params: Promise.resolve({ slug: 'secret-other' }) });
    const { body } = await parseResponse(res);

    expect(body.data.multiCurrency.exchangeRateApiKey).toBeUndefined();
  });

  it('returns secrets to a settings manager of this tenant', async () => {
    authAs(TENANT_A_ID, 'manager');
    mockTenantFindOne.mockReturnValue(findOneChain({
      _id: TENANT_A_ID,
      slug: 'secret-own',
      settings: { birEsalesPushUrl: 'https://push.example.com', multiCurrency: { exchangeRateApiKey: 'sk-live' } },
    }));

    const res = await GET(createRequest('/api/tenants/secret-own/settings'), { params: Promise.resolve({ slug: 'secret-own' }) });
    const { body } = await parseResponse(res);

    expect(body.data.birEsalesPushUrl).toBe('https://push.example.com');
    expect(body.data.multiCurrency.exchangeRateApiKey).toBe('sk-live');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/tenants/:slug/settings
// ---------------------------------------------------------------------------

describe('PUT /api/tenants/:slug/settings', () => {
  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { companyName: 'New Name' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(401);
  });

  it('rejects the save when the caller lacks settings.manage', async () => {
    authAs(TENANT_A_ID, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { companyName: 'New Name' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a request from a user belonging to a different tenant', async () => {
    authAs(TENANT_B_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { companyName: 'New Name' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('$sets only the submitted keys, leaving other settings untouched (per-tab save)', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({
      _id: { toString: () => TENANT_A_ID },
      slug: SLUG,
      settings: { companyName: 'Old Name', primaryColor: '#111111' },
    });
    mockTenantFindOneAndUpdate.mockResolvedValue({
      _id: TENANT_A_ID,
      settings: { companyName: 'Old Name', primaryColor: '#111111' },
    });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: '#222222' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockTenantFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: SLUG },
      { $set: { 'settings.primaryColor': '#222222' } },
      { new: true, runValidators: true }
    );
  });

  it('skips the write when every submitted value is unchanged', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({
      _id: { toString: () => TENANT_A_ID },
      slug: SLUG,
      settings: { companyName: 'Same', primaryColor: '#111111' },
    });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { companyName: 'Same', primaryColor: '#111111' }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual({ companyName: 'Same', primaryColor: '#111111' });
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a move onto a closed business type', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: { businessType: 'retail' } });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { businessType: 'restaurant' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('lets a tenant already on a closed business type keep saving', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: { businessType: 'laundry' } });
    mockTenantFindOneAndUpdate.mockResolvedValue({ _id: TENANT_A_ID, settings: { businessType: 'laundry' } });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { businessType: 'laundry', primaryColor: '#222222' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it('rejects an invalid hex color', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: 'not-a-color' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a tax rate outside 0-100', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { taxRate: 150 }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a currency code that is not 3 characters', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { currency: 'US' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('never writes rolePermissionOverrides, even for an owner', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', {
        rolePermissionOverrides: { manager: { 'roles_permissions.manage': true } },
      }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('accepts an unchanged rolePermissionOverrides echoed back with other changes', async () => {
    authAs(TENANT_A_ID, 'manager');
    const overrides = { cashier: { 'refunds.process': true } };
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: { rolePermissionOverrides: overrides } });
    mockTenantFindOneAndUpdate.mockResolvedValue({ _id: TENANT_A_ID, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { rolePermissionOverrides: overrides, companyName: 'New' }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockTenantFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: SLUG },
      { $set: { 'settings.companyName': 'New' } },
      { new: true, runValidators: true }
    );
  });

  it('requires bir_compliance.manage to change BIR fields', async () => {
    authAs(TENANT_A_ID, 'manager');
    mockHasTenantPermission.mockImplementation(async (_role: string, _tenantId: string, key: string) => key === 'settings.manage');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { birEsalesPushUrl: 'http://169.254.169.254/' }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('manager', TENANT_A_ID, 'bir_compliance.manage');
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an eSales push URL that points at an internal address', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { birEsalesPushUrl: 'http://169.254.169.254/latest/meta-data' }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain('public address');
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires tax_rules.manage to change taxRules', async () => {
    authAs(TENANT_A_ID, 'manager');
    mockHasTenantPermission.mockImplementation(async (_role: string, _tenantId: string, key: string) => key === 'settings.manage');
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: { taxRules: [] } });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { taxRules: [{ id: 'r1', rate: 0 }] }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not block a save that echoes unchanged businessHours without business_hours.manage', async () => {
    authAs(TENANT_A_ID, 'manager');
    mockHasTenantPermission.mockImplementation(async (_role: string, _tenantId: string, key: string) => key === 'settings.manage');
    const businessHours = { timezone: 'Asia/Manila' };
    mockExistingTenant({ _id: { toString: () => TENANT_A_ID }, slug: SLUG, settings: { businessHours } });
    mockTenantFindOneAndUpdate.mockResolvedValue({ _id: TENANT_A_ID, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { businessHours, companyName: 'New' }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
  });

  it('keeps the stored exchange-rate API key when multiCurrency is sent without it', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({
      _id: { toString: () => TENANT_A_ID },
      slug: SLUG,
      settings: { multiCurrency: { enabled: false, exchangeRateApiKey: 'sk-live' } },
    });
    mockTenantFindOneAndUpdate.mockResolvedValue({ _id: TENANT_A_ID, settings: {} });

    const res = await PUT(
      createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { multiCurrency: { enabled: true } }),
      { params: Promise.resolve({ slug: SLUG }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockTenantFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: SLUG },
      { $set: { 'settings.multiCurrency': { enabled: true, exchangeRateApiKey: 'sk-live' } } },
      { new: true, runValidators: true }
    );
  });
});
