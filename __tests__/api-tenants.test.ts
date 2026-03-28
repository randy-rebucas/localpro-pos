/**
 * Tenant Management API Route Tests
 * Covers checklist items 2.1 – 2.15
 */

process.env.JWT_SECRET = 'test-secret-for-unit-tests-only-32chars!!';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', VIEW: 'view' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
  getValidationTranslator: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  validateTenant: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  generateToken: vi.fn().mockReturnValue('mock-jwt-token'),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockImplementation((err: unknown) =>
    Response.json({ success: false, error: String(err) }, { status: 500 })
  ),
}));
vi.mock('@/lib/currency', () => ({
  getDefaultTenantSettings: vi.fn().mockReturnValue({
    currency: 'PHP',
    language: 'en',
    taxRate: 12,
    primaryColor: '#000000',
  }),
}));
vi.mock('@/lib/business-types', () => ({
  applyBusinessTypeDefaults: vi.fn().mockImplementation((settings: unknown) => settings),
}));
vi.mock('@/lib/subscription', () => ({
  checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/receipt-templates', () => ({
  validateTemplate: vi.fn().mockReturnValue({ valid: true }),
}));
vi.mock('@/lib/notification-templates', () => ({
  validateNotificationTemplate: vi.fn().mockReturnValue({ valid: true }),
}));
vi.mock('@/lib/multi-currency', () => ({
  fetchExchangeRates: vi.fn().mockResolvedValue({ USD: 0.018, EUR: 0.016 }),
}));

// ── Tenant model ─────────────────────────────────────────────────────────────
vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));

// ── User model ────────────────────────────────────────────────────────────────
vi.mock('@/models/User', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
}));

// ── Seed-sample-data models ───────────────────────────────────────────────────
vi.mock('@/models/Category', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ _id: 'cat1' }),
  },
}));
vi.mock('@/models/Product', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ _id: 'prod1' }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 5 }),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));
vi.mock('@/models/Customer', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ _id: 'cust1' }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 3 }),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));
vi.mock('@/models/Discount', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ _id: 'disc1' }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));

// ── Reset-collections models (the remaining 9) ────────────────────────────────
vi.mock('@/models/Transaction', () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 10 }),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));
vi.mock('@/models/StockMovement', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/Expense', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/Branch', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/CashDrawerSession', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/ProductBundle', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/Attendance', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/Booking', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/SavedCart', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/AuditLog', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('@/models/TaxRule', () => ({
  default: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }), find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { checkRateLimit } from '@/lib/rate-limit';
import { getCurrentUser, requireRole } from '@/lib/auth';
import Tenant from '@/models/Tenant';
import User from '@/models/User';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const mockAdminUser = {
  userId: 'user123',
  tenantId: 'tenant123',
  email: 'admin@demo.com',
  role: 'admin',
};

// Lean (plain object) version for routes using .lean()
const mockTenantLean = {
  _id: 'tenant123',
  slug: 'demo',
  name: 'Demo Store',
  isActive: true,
  settings: {
    currency: 'PHP',
    language: 'en',
    taxRate: 12,
    businessHours: { schedule: [] },
    holidays: [{ id: 'h1', name: 'Christmas', date: '2025-12-25', type: 'single' }],
    receiptTemplates: { templates: [{ id: 'tpl1', name: 'Default', html: '<html>{{items}}</html>', isDefault: true }], default: 'tpl1' },
    notificationTemplates: { email: {}, sms: {} },
    multiCurrency: { enabled: true, exchangeRates: { USD: 0.018 }, lastUpdated: new Date(), displayCurrencies: ['USD'] },
    birTin: '123-456-789-000',
    birPtuNumber: 'PTU-001',
    businessType: 'retail',
  },
};

// Document version (with save/markModified) for routes that mutate via doc.save()
const makeTenantDoc = () => ({
  ...mockTenantLean,
  settings: { ...mockTenantLean.settings },
  markModified: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

// Helper: build requests
const URL_BASE = 'http://localhost';

function req(method: string, path: string, body?: object, cookie = 'auth-token=valid') {
  return new NextRequest(new URL(path, URL_BASE), {
    method,
    headers: {
      'content-type': 'application/json',
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

// ─── 2.1  POST /api/tenants/signup ──────────────────────────────────────────
describe('POST /api/tenants/signup (2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(Tenant.findOne).mockResolvedValue(null); // no existing tenant
    vi.mocked(User.findOne).mockResolvedValue(null);  // no existing user
    vi.mocked(Tenant.create).mockResolvedValue({ _id: 'tenant123', slug: 'newstore', name: 'New Store' } as any);
    vi.mocked(User.create).mockResolvedValue({ _id: 'user123', email: 'admin@new.com', name: 'Admin' } as any);
  });

  it('creates tenant and admin user, returns 201', async () => {
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', {
      slug: 'newstore',
      name: 'New Store',
      adminEmail: 'admin@new.com',
      adminPassword: 'Pass1234!',
      adminName: 'Admin User',
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.tenant.slug).toBe('newstore');
    expect(body.data.adminUser.email).toBe('admin@new.com');
    expect(Tenant.create).toHaveBeenCalledOnce();
    expect(User.create).toHaveBeenCalledOnce();
  });

  it('returns 400 if slug is already taken', async () => {
    vi.mocked(Tenant.findOne).mockResolvedValue({ _id: 'existing', slug: 'newstore' } as any);

    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', {
      slug: 'newstore',
      name: 'New Store',
      adminEmail: 'other@new.com',
      adminPassword: 'Pass1234!',
      adminName: 'Admin',
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 3600000 });

    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', {}));

    expect(res.status).toBe(429);
  });

  it('returns 400 when admin fields are missing', async () => {
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', {
      slug: 'newstore',
      name: 'New Store',
      // missing adminEmail, adminPassword, adminName
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ─── 2.2  GET /api/tenants/[slug] ───────────────────────────────────────────
describe('GET /api/tenants/[slug] (2.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns correct tenant data', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/route');
    const res = await GET(req('GET', '/api/tenants/demo'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('demo');
  });

  it('returns 404 for unknown slug', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/route');
    const res = await GET(req('GET', '/api/tenants/unknown'), params('unknown'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ─── 2.3  PUT /api/tenants/[slug] ───────────────────────────────────────────
describe('PUT /api/tenants/[slug] (2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);
    vi.mocked(Tenant.findOneAndUpdate).mockResolvedValue({ ...mockTenantLean, name: 'Updated Store' } as any);
  });

  it('updates tenant name and returns 200', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo', { name: 'Updated Store' }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Tenant.findOneAndUpdate).toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { PUT } = await import('@/app/api/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo', { name: 'Hacked' }),
      params('demo')
    );

    expect(res.status).toBe(401);
  });

  it('returns 403 when insufficient role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: Insufficient permissions'));

    const { PUT } = await import('@/app/api/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo', { name: 'Hacked' }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/route');
    const res = await PUT(
      req('PUT', '/api/tenants/ghost', { name: 'Ghost' }),
      params('ghost')
    );

    expect(res.status).toBe(404);
  });
});

// ─── 2.4  DELETE /api/tenants/[slug] ────────────────────────────────────────
describe('DELETE /api/tenants/[slug] (2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);
    vi.mocked(Tenant.findOneAndUpdate).mockResolvedValue(mockTenantLean as any);
  });

  it('soft-deletes tenant (sets isActive: false) and returns 200', async () => {
    const { DELETE } = await import('@/app/api/tenants/[slug]/route');
    const res = await DELETE(req('DELETE', '/api/tenants/demo'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verifies soft delete — not hard delete
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'demo' },
      { isActive: false }
    );
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { DELETE } = await import('@/app/api/tenants/[slug]/route');
    const res = await DELETE(req('DELETE', '/api/tenants/demo'), params('demo'));

    expect(res.status).toBe(401);
  });
});

// ─── 2.5  GET /api/tenants/route ────────────────────────────────────────────
describe('GET /api/tenants/route (2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockTenantLean]),
      }),
    } as any);
  });

  it('public request returns limited tenant fields', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized')); // not authenticated

    const { GET } = await import('@/app/api/tenants/route');
    const res = await GET(req('GET', '/api/tenants', undefined, '')); // no cookie
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('admin request returns full tenant list', async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);

    const { GET } = await import('@/app/api/tenants/route');
    const res = await GET(req('GET', '/api/tenants'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── 2.6  GET/PUT /api/tenants/[slug]/settings ──────────────────────────────
describe('GET/PUT /api/tenants/[slug]/settings (2.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
  });

  it('GET returns settings without authentication (public)', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/settings/route');
    const res = await GET(req('GET', '/api/tenants/demo/settings', undefined, ''), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.currency).toBe('PHP');
  });

  it('GET returns 404 for inactive tenant', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/settings/route');
    const res = await GET(req('GET', '/api/tenants/ghost/settings'), params('ghost'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('PUT updates settings with valid admin auth', async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);
    vi.mocked(Tenant.findOneAndUpdate).mockResolvedValue({
      ...mockTenantLean,
      settings: { ...mockTenantLean.settings, currency: 'USD' },
    } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/settings', { settings: { currency: 'USD' } }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT returns 400 for invalid currency code', async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/settings', { settings: { currency: 'TOOLONG' } }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid currency/i);
  });

  it('PUT blocks cross-tenant access (403)', async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(getCurrentUser).mockResolvedValue({
      ...mockAdminUser,
      tenantId: 'other-tenant', // different tenant
    } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/settings', { settings: { currency: 'USD' } }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/forbidden/i);
  });
});

// ─── 2.7  GET/PUT /api/tenants/[slug]/business-hours ───────────────────────
describe('GET/PUT /api/tenants/[slug]/business-hours (2.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('GET returns business hours for authenticated user', async () => {
    const { GET } = await import('@/app/api/tenants/[slug]/business-hours/route');
    const res = await GET(req('GET', '/api/tenants/demo/business-hours'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('GET returns 401 for unauthenticated request', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/tenants/[slug]/business-hours/route');
    const res = await GET(req('GET', '/api/tenants/demo/business-hours'), params('demo'));

    expect(res.status).toBe(401);
  });

  it('PUT updates business hours for admin/manager', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/business-hours/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/business-hours', {
        schedule: [{ day: 'monday', open: '08:00', close: '18:00' }],
        timezone: 'Asia/Manila',
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT returns 403 for cashier role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, role: 'cashier' } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/business-hours/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/business-hours', { schedule: [] }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });
});

// ─── 2.8  GET/POST /api/tenants/[slug]/holidays ─────────────────────────────
describe('GET/POST /api/tenants/[slug]/holidays (2.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('GET returns holidays array', async () => {
    const { GET } = await import('@/app/api/tenants/[slug]/holidays/route');
    const res = await GET(req('GET', '/api/tenants/demo/holidays'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST creates a new single-date holiday', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/holidays/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/holidays', {
        name: 'New Year',
        date: '2026-01-01',
        type: 'single',
        isBusinessClosed: true,
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Year');
  });

  it('POST returns 400 when name or type is missing', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/holidays/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/holidays', { date: '2026-01-01' }), // no name or type
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST returns 403 for cashier role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, role: 'cashier' } as any);

    const { POST } = await import('@/app/api/tenants/[slug]/holidays/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/holidays', { name: 'Holiday', date: '2026-01-01', type: 'single' }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });

  it('POST returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/tenants/[slug]/holidays/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/holidays', { name: 'X', date: '2026-01-01', type: 'single' }),
      params('demo')
    );

    expect(res.status).toBe(401);
  });
});

// ─── 2.9  GET/PUT /api/tenants/[slug]/receipt-templates ─────────────────────
describe('GET/PUT /api/tenants/[slug]/receipt-templates (2.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
  });

  it('GET returns templates for own tenant', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/receipt-templates/route');
    const res = await GET(req('GET', '/api/tenants/demo/receipt-templates'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.templates)).toBe(true);
  });

  it('GET returns 403 when accessing another tenant', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, tenantId: 'other' } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/receipt-templates/route');
    const res = await GET(req('GET', '/api/tenants/demo/receipt-templates'), params('demo'));

    expect(res.status).toBe(403);
  });

  it('GET returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/tenants/[slug]/receipt-templates/route');
    const res = await GET(req('GET', '/api/tenants/demo/receipt-templates'), params('demo'));

    expect(res.status).toBe(401);
  });

  it('PUT updates an existing receipt template', async () => {
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/receipt-templates/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/receipt-templates', {
        id: 'tpl1',
        name: 'Updated Template',
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── 2.10  GET/PUT /api/tenants/[slug]/notification-templates ───────────────
describe('GET/PUT /api/tenants/[slug]/notification-templates (2.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('GET returns notification templates', async () => {
    const { GET } = await import('@/app/api/tenants/[slug]/notification-templates/route');
    const res = await GET(req('GET', '/api/tenants/demo/notification-templates'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT saves notification template', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/notification-templates/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/notification-templates', {
        type: 'email',
        category: 'booking',
        body: 'Your booking is confirmed.',
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT returns 400 when required fields missing', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/notification-templates/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/notification-templates', { type: 'email' }), // missing category and body
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('PUT returns 403 for cashier', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, role: 'cashier' } as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/notification-templates/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/notification-templates', {
        type: 'sms', category: 'booking', body: 'Confirmed',
      }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });
});

// ─── 2.11  GET/POST /api/tenants/[slug]/exchange-rates ─────────────────────
describe('GET/POST /api/tenants/[slug]/exchange-rates (2.11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('GET returns exchange rates when multi-currency is enabled', async () => {
    const { GET } = await import('@/app/api/tenants/[slug]/exchange-rates/route');
    const res = await GET(req('GET', '/api/tenants/demo/exchange-rates'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.exchangeRates).toBeDefined();
  });

  it('GET returns 400 when multi-currency is not enabled', async () => {
    const tenantWithoutMultiCurrency = makeTenantDoc();
    tenantWithoutMultiCurrency.settings.multiCurrency = { enabled: false } as any;
    vi.mocked(Tenant.findOne).mockResolvedValue(tenantWithoutMultiCurrency as any);

    const { GET } = await import('@/app/api/tenants/[slug]/exchange-rates/route');
    const res = await GET(req('GET', '/api/tenants/demo/exchange-rates'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/multi-currency not enabled/i);
  });

  it('POST with action=update saves manual exchange rates', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/exchange-rates/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/exchange-rates', {
        action: 'update',
        exchangeRates: { USD: 0.018, EUR: 0.016 },
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.exchangeRates.USD).toBe(0.018);
  });

  it('POST returns 403 for cashier role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, role: 'cashier' } as any);

    const { POST } = await import('@/app/api/tenants/[slug]/exchange-rates/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/exchange-rates', { action: 'update', exchangeRates: {} }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });
});

// ─── 2.12  GET/PUT /api/tenants/[slug]/tax-rules ────────────────────────────
describe('GET/POST /api/tenants/[slug]/tax-rules (2.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
  });

  it('GET returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenantLean) } as any);
    // tax-rules uses getCurrentUser, not requireRole
    const { GET } = await import('@/app/api/tenants/[slug]/tax-rules/route');
    const res = await GET(req('GET', '/api/tenants/demo/tax-rules', undefined, ''), params('demo'));

    expect(res.status).toBe(401);
  });
});

// ─── 2.13  GET/PUT /api/tenants/[slug]/bir-settings ─────────────────────────
describe('GET/PUT /api/tenants/[slug]/bir-settings (2.13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(getCurrentUser).mockResolvedValue(mockAdminUser as any);
  });

  it('GET returns BIR settings for own tenant', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await GET(req('GET', '/api/tenants/demo/bir-settings'), params('demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.birTin).toBe('123-456-789-000');
  });

  it('GET returns 403 when accessing another tenant', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, tenantId: 'other' } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenantLean),
    } as any);

    const { GET } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await GET(req('GET', '/api/tenants/demo/bir-settings'), params('demo'));

    expect(res.status).toBe(403);
  });

  it('PUT saves BIR TIN in correct format', async () => {
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/bir-settings', {
        birTin: '123-456-789-000',
        birPtuNumber: 'PTU-2025-001',
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT returns 400 for invalid TIN format', async () => {
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/bir-settings', { birTin: '12345' }), // wrong format
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/NNN-NNN-NNN-NNN/);
  });

  it('PUT returns 403 for manager role (admin/owner only)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...mockAdminUser, role: 'manager' } as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);

    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', '/api/tenants/demo/bir-settings', { birTin: '123-456-789-000' }),
      params('demo')
    );

    expect(res.status).toBe(403);
  });
});

// ─── 2.14  POST /api/tenants/[slug]/seed-sample-data ───────────────────────
describe('POST /api/tenants/[slug]/seed-sample-data (2.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue({
      ...makeTenantDoc(),
      _id: 'tenant123',
      settings: { businessType: 'retail' },
    } as any);
  });

  it('seeds categories, products, customers, and discounts', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/seed-sample-data/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/seed-sample-data', { skipExisting: true }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.businessType).toBe('retail');
    expect(body.data.results.categories).toBeDefined();
    expect(body.data.results.products).toBeDefined();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/tenants/[slug]/seed-sample-data/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/seed-sample-data', {}),
      params('demo')
    );

    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockResolvedValue(null);

    const { POST } = await import('@/app/api/tenants/[slug]/seed-sample-data/route');
    const res = await POST(
      req('POST', '/api/tenants/ghost/seed-sample-data', {}),
      params('ghost')
    );

    expect(res.status).toBe(404);
  });
});

// ─── 2.15  POST /api/tenants/[slug]/reset-collections ──────────────────────
describe('POST /api/tenants/[slug]/reset-collections (2.15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockAdminUser as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('deletes specified collections and returns counts', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/reset-collections/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/reset-collections', {
        collections: ['products', 'transactions'],
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.results.products).toBeDefined();
    expect(body.data.results.transactions).toBeDefined();
  });

  it('returns 400 for invalid collection name', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/reset-collections/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/reset-collections', {
        collections: ['nonExistentCollection'],
      }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid collections/i);
  });

  it('returns 400 when collections array is empty', async () => {
    const { POST } = await import('@/app/api/tenants/[slug]/reset-collections/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/reset-collections', { collections: [] }),
      params('demo')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/tenants/[slug]/reset-collections/route');
    const res = await POST(
      req('POST', '/api/tenants/demo/reset-collections', { collections: ['products'] }),
      params('demo')
    );

    expect(res.status).toBe(401);
  });
});
