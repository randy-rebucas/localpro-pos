process.env.JWT_SECRET = 'test-secret-for-tenant-array-settings-tests-32chars!!';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const repos = vi.hoisted(() => ({ tenants: { findBySlug: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  isDuplicateKeyError: (e: any) => e?.code === 11000 || e?.name === 'DuplicateKeyError', // eslint-disable-line @typescript-eslint/no-explicit-any
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/receipt-templates', () => ({
  validateTemplate: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/subscription', () => ({
  checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn(() => new Response(JSON.stringify({ success: false }), { status: 500 })),
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

import * as holidays from '@/app/api/tenants/[slug]/holidays/route';
import * as receiptTemplates from '@/app/api/tenants/[slug]/receipt-templates/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SLUG = 'store-a';
const ctx = { params: Promise.resolve({ slug: SLUG }) };

function req(url: string, method: string, body?: Record<string, unknown>): NextRequest {
  const init: ConstructorParameters<typeof NextRequest>[1] = { method, headers: { 'content-type': 'application/json' } };
  if (body) init!.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

async function parse(res: Response) {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

function tenantWith(settings: Record<string, unknown>) {
  return { _id: TENANT_ID, slug: SLUG, settings };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_ID, email: 'a@b.c', role: 'owner' });
});

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

describe('holidays route → TenantUpdate ops', () => {
  const holiday = { id: 'holiday_1', name: 'New Year', type: 'single', date: '2026-01-01', isBusinessClosed: true };

  it('POST pushes the new holiday', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [] }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await holidays.POST(
      req(`/api/tenants/${SLUG}/holidays`, 'POST', { name: 'New Year', type: 'single', date: '2026-01-01' }),
      ctx
    );
    const { status, body } = await parse(res);

    expect(status).toBe(200);
    expect(repos.tenants.findBySlug).toHaveBeenCalledWith(SLUG, { select: 'settings.holidays' });
    expect(repos.tenants.update).toHaveBeenCalledTimes(1);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      push: {
        'settings.holidays': {
          id: expect.stringMatching(/^holiday_\d+$/),
          name: 'New Year',
          type: 'single',
          date: '2026-01-01',
          isBusinessClosed: true,
          createdAt: expect.any(Date),
        },
      },
    });
    expect(body.data.name).toBe('New Year');
  });

  it('PUT replaces the matched holiday in place', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [holiday] }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await holidays.PUT(req(`/api/tenants/${SLUG}/holidays`, 'PUT', { id: 'holiday_1', name: 'Renamed' }), ctx);
    const { status, body } = await parse(res);

    expect(status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      setOnItem: { path: 'settings.holidays', id: 'holiday_1', replace: { ...holiday, name: 'Renamed' } },
    });
    expect(body.data).toEqual({ ...holiday, name: 'Renamed' });
  });

  it('PUT 404s when the holiday vanished before the write (update returns null)', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [holiday] }));
    repos.tenants.update.mockResolvedValue(null);

    const res = await holidays.PUT(req(`/api/tenants/${SLUG}/holidays`, 'PUT', { id: 'holiday_1', name: 'Renamed' }), ctx);
    const { status, body } = await parse(res);

    expect(status).toBe(404);
    expect(body.error).toBe('Holiday not found');
  });

  it('PUT 404s without writing when the holiday id is unknown', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [holiday] }));

    const res = await holidays.PUT(req(`/api/tenants/${SLUG}/holidays`, 'PUT', { id: 'nope', name: 'X' }), ctx);

    expect(res.status).toBe(404);
    expect(repos.tenants.update).not.toHaveBeenCalled();
  });

  it('DELETE pulls the holiday by id', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [holiday] }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await holidays.DELETE(req(`/api/tenants/${SLUG}/holidays?id=holiday_1`, 'DELETE'), ctx);

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, { pull: { 'settings.holidays': { id: 'holiday_1' } } });
  });

  it('404s when the tenant does not exist', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);

    const res = await holidays.DELETE(req(`/api/tenants/${SLUG}/holidays?id=holiday_1`, 'DELETE'), ctx);

    expect(res.status).toBe(404);
    expect(repos.tenants.update).not.toHaveBeenCalled();
  });

  it('403s for a user of another tenant', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u', tenantId: 'bbbbbbbbbbbbbbbbbbbbbbbb', email: 'x@y.z', role: 'owner' });
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ holidays: [holiday] }));

    const res = await holidays.DELETE(req(`/api/tenants/${SLUG}/holidays?id=holiday_1`, 'DELETE'), ctx);

    expect(res.status).toBe(403);
    expect(repos.tenants.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Receipt templates
// ---------------------------------------------------------------------------

describe('receipt-templates route → TenantUpdate ops', () => {
  const PATH = 'settings.receiptTemplates.templates';
  const tplA = { id: 'template_a', name: 'A', html: '<p>A</p>', isDefault: true };
  const tplB = { id: 'template_b', name: 'B', html: '<p>B</p>', isDefault: false };

  it('POST (non-default) pushes the template only', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [] } }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await receiptTemplates.POST(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'POST', { name: 'New', html: '<p>x</p>' }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(repos.tenants.findBySlug).toHaveBeenCalledWith(SLUG, { select: 'settings.receiptTemplates' });
    expect(repos.tenants.update).toHaveBeenCalledTimes(1);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      push: { [PATH]: expect.objectContaining({ name: 'New', html: '<p>x</p>', isDefault: false }) },
    });
  });

  it('POST (default) clears every isDefault, then pushes and sets the default in one call', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA], default: 'template_a' } }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await receiptTemplates.POST(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'POST', { name: 'New', html: '<p>x</p>', isDefault: true }),
      ctx
    );
    const { body } = await parse(res);

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledTimes(2);
    expect(repos.tenants.update).toHaveBeenNthCalledWith(1, TENANT_ID, {
      setOnAllItems: { path: PATH, set: { isDefault: false } },
    });
    expect(repos.tenants.update).toHaveBeenNthCalledWith(2, TENANT_ID, {
      push: { [PATH]: expect.objectContaining({ id: body.data.id, name: 'New', isDefault: true }) },
      set: { 'settings.receiptTemplates.default': body.data.id },
    });
  });

  it('PUT edits fields on the one item', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, tplB] } }));
    const updatedB = { ...tplB, name: 'B2' };
    repos.tenants.update.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, updatedB] } }));

    const res = await receiptTemplates.PUT(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'PUT', { id: 'template_b', name: 'B2' }),
      ctx
    );
    const { status, body } = await parse(res);

    expect(status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledTimes(1);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      setOnItem: { path: PATH, id: 'template_b', set: { updatedAt: expect.any(Date), name: 'B2' } },
    });
    expect(body.data).toEqual(updatedB);
  });

  it('PUT set-default clears every isDefault, then flags the item and sets the default', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, tplB], default: 'template_a' } }));
    repos.tenants.update.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, { ...tplB, isDefault: true }] } }));

    const res = await receiptTemplates.PUT(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'PUT', { id: 'template_b', isDefault: true }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledTimes(2);
    expect(repos.tenants.update).toHaveBeenNthCalledWith(1, TENANT_ID, {
      setOnAllItems: { path: PATH, set: { isDefault: false } },
    });
    expect(repos.tenants.update).toHaveBeenNthCalledWith(2, TENANT_ID, {
      setOnItem: { path: PATH, id: 'template_b', set: { updatedAt: expect.any(Date), isDefault: true } },
      set: { 'settings.receiptTemplates.default': 'template_b' },
    });
  });

  it('PUT un-default of the current default also unsets the default pointer', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, tplB], default: 'template_a' } }));
    repos.tenants.update.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [{ ...tplA, isDefault: false }, tplB] } }));

    const res = await receiptTemplates.PUT(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'PUT', { id: 'template_a', isDefault: false }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledTimes(1);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      setOnItem: { path: PATH, id: 'template_a', set: { updatedAt: expect.any(Date), isDefault: false } },
      unset: ['settings.receiptTemplates.default'],
    });
  });

  it('PUT 404s without writing when the template id is unknown', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA] } }));

    const res = await receiptTemplates.PUT(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'PUT', { id: 'nope', name: 'X' }),
      ctx
    );

    expect(res.status).toBe(404);
    expect(repos.tenants.update).not.toHaveBeenCalled();
  });

  it('PUT returns no data when the template vanished before the write (update returns null)', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplB] } }));
    repos.tenants.update.mockResolvedValue(null);

    const res = await receiptTemplates.PUT(
      req(`/api/tenants/${SLUG}/receipt-templates`, 'PUT', { id: 'template_b', name: 'B2' }),
      ctx
    );
    const { status, body } = await parse(res);

    expect(status).toBe(200);
    expect(body.data).toBeUndefined();
  });

  it('DELETE of the default template pulls it and unsets the default in one call', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, tplB], default: 'template_a' } }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await receiptTemplates.DELETE(req(`/api/tenants/${SLUG}/receipt-templates?id=template_a`, 'DELETE'), ctx);

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledTimes(1);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, {
      pull: { [PATH]: { id: 'template_a' } },
      unset: ['settings.receiptTemplates.default'],
    });
  });

  it('DELETE of a non-default template only pulls it', async () => {
    repos.tenants.findBySlug.mockResolvedValue(tenantWith({ receiptTemplates: { templates: [tplA, tplB], default: 'template_a' } }));
    repos.tenants.update.mockResolvedValue(tenantWith({}));

    const res = await receiptTemplates.DELETE(req(`/api/tenants/${SLUG}/receipt-templates?id=template_b`, 'DELETE'), ctx);

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledWith(TENANT_ID, { pull: { [PATH]: { id: 'template_b' } } });
  });

  it('404s when the tenant does not exist', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);

    const res = await receiptTemplates.DELETE(req(`/api/tenants/${SLUG}/receipt-templates?id=template_a`, 'DELETE'), ctx);

    expect(res.status).toBe(404);
    expect(repos.tenants.update).not.toHaveBeenCalled();
  });
});
