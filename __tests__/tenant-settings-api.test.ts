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
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const repos = vi.hoisted(() => ({ tenants: { findBySlug: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  isDuplicateKeyError: (e: any) => e?.code === 11000 || e?.name === 'DuplicateKeyError', // eslint-disable-line @typescript-eslint/no-explicit-any
}));
const mockTenantFindBySlug = repos.tenants.findBySlug;
const mockTenantUpdate = repos.tenants.update;

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

/** PUT reads the existing tenant via `tenants.findBySlug(slug, { select })`. */
function mockExistingTenant(tenant: Record<string, unknown> | null) {
  mockTenantFindBySlug.mockResolvedValue(tenant);
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
    mockTenantFindBySlug.mockResolvedValue({ _id: TENANT_A_ID, slug: SLUG, settings: { companyName: 'Acme' } });

    const res = await GET(createRequest(`/api/tenants/${SLUG}/settings`), { params: Promise.resolve({ slug: SLUG }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual({ companyName: 'Acme' });
    expect(mockTenantFindBySlug).toHaveBeenCalledWith(SLUG, expect.objectContaining({ activeOnly: true }));
  });

  it('404s for a tenant that does not exist or is inactive', async () => {
    mockTenantFindBySlug.mockResolvedValue(null);

    const res = await GET(createRequest(`/api/tenants/unknown/settings`), { params: Promise.resolve({ slug: 'unknown' }) });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
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
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('rejects a request from a user belonging to a different tenant', async () => {
    authAs(TENANT_B_ID, 'owner');
    mockExistingTenant({ _id: TENANT_A_ID, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { companyName: 'New Name' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('$sets only the submitted keys, leaving other settings untouched (per-tab save)', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({
      _id: TENANT_A_ID,
      slug: SLUG,
      settings: { companyName: 'Old Name', primaryColor: '#111111' },
    });
    mockTenantUpdate.mockResolvedValue({
      _id: TENANT_A_ID,
      settings: { companyName: 'Old Name', primaryColor: '#111111' },
    });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: '#222222' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockTenantFindBySlug).toHaveBeenCalledWith(SLUG, { select: '_id settings' });
    expect(mockTenantUpdate).toHaveBeenCalledWith(TENANT_A_ID, { set: { 'settings.primaryColor': '#222222' } });
  });

  it('skips the write when every submitted value is unchanged', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({
      _id: TENANT_A_ID,
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
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('404s when the tenant does not exist', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant(null);

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: '#222222' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('404s when the tenant disappears before the write (update returns null)', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: TENANT_A_ID, slug: SLUG, settings: {} });
    mockTenantUpdate.mockResolvedValue(null);

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: '#222222' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it('rejects an invalid hex color', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: TENANT_A_ID, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { primaryColor: 'not-a-color' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('rejects a tax rate outside 0-100', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: TENANT_A_ID, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { taxRate: 150 }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it('rejects a currency code that is not 3 characters', async () => {
    authAs(TENANT_A_ID, 'owner');
    mockExistingTenant({ _id: TENANT_A_ID, slug: SLUG, settings: {} });

    const res = await PUT(createRequest(`/api/tenants/${SLUG}/settings`, 'PUT', { currency: 'US' }), {
      params: Promise.resolve({ slug: SLUG }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });
});
