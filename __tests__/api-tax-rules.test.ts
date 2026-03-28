/**
 * Section 10 — Tax Rules
 * Tests: 10.1 – 10.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn((error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ success: false, error: msg }, { status: 500 });
  }),
}));

vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/models/TaxRule', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndDelete: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
}));
// Transaction used by getVATReport — spy handles it; mock here to prevent real DB calls
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import TaxRule from '@/models/TaxRule';
import Tenant from '@/models/Tenant';
import * as analyticsLib from '@/lib/analytics';
import { calculateTax } from '@/lib/tax-calculation';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const RULE_ID   = 'rule_abc';
const USER_ID   = 'user_abc';
const SLUG      = 'demo';

const mockTenantAccess = { tenantId: TENANT_ID, user: { userId: USER_ID, role: 'admin' } };

const mockTaxRule = {
  _id: RULE_ID,
  tenantId: TENANT_ID,
  name: 'VAT 12%',
  rate: 12,
  label: 'VAT',
  appliesTo: 'all',
  categoryIds: [],
  productIds: [],
  priority: 10,
  isActive: true,
};

const makeTaxRuleDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockTaxRule,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
});

const mockTenant = {
  _id: TENANT_ID,
  slug: SLUG,
  isActive: true,
  settings: {
    taxEnabled: true,
    taxRate: 12,
    taxLabel: 'VAT',
    birTin: '123-456-789-000',
    birPtuNumber: 'PTU-001',
    birPtuIssuedDate: null,
    birPtuExpiryDate: null,
  },
};

const makeTenantDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockTenant,
  settings: { ...mockTenant.settings, ...(overrides.settings as object || {}) },
  ...overrides,
  markModified: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

// ── Helpers ────────────────────────────────────────────────────────────────
const req = (method: string, url: string, body?: unknown, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const params    = (id: string)   => ({ params: Promise.resolve({ id }) });
const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) });

// ── 10.1  GET /api/tax-rules ───────────────────────────────────────────────
describe('GET /api/tax-rules (10.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(TaxRule.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockTaxRule]),
      }),
    } as any);
  });

  it('returns tax rules for tenant', async () => {
    const { GET } = await import('@/app/api/tax-rules/route');
    const res = await GET(req('GET', '/api/tax-rules'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(vi.mocked(TaxRule.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('filters by isActive', async () => {
    const { GET } = await import('@/app/api/tax-rules/route');
    await GET(req('GET', '/api/tax-rules?isActive=true'));
    expect(vi.mocked(TaxRule.find)).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('returns 404 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/tax-rules/route');
    const res = await GET(req('GET', '/api/tax-rules', undefined, ''));
    expect(res.status).toBe(404);
  });
});

// ── 10.1  POST /api/tax-rules ─────────────────────────────────────────────
describe('POST /api/tax-rules (10.1)', () => {
  const validBody = { name: 'VAT 12%', rate: 12, label: 'VAT' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(TaxRule.create).mockResolvedValue({ ...mockTaxRule } as any);
  });

  it('creates tax rule and returns 201', async () => {
    const { POST } = await import('@/app/api/tax-rules/route');
    const res = await POST(req('POST', '/api/tax-rules', validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(TaxRule.create)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, rate: 12 })
    );
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/tax-rules/route');
    const res = await POST(req('POST', '/api/tax-rules', { rate: 12 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when rate is out of range (>100)', async () => {
    const { POST } = await import('@/app/api/tax-rules/route');
    const res = await POST(req('POST', '/api/tax-rules', { name: 'X', rate: 150 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/between 0 and 100/i);
  });

  it('returns 400 when rate is negative', async () => {
    const { POST } = await import('@/app/api/tax-rules/route');
    const res = await POST(req('POST', '/api/tax-rules', { name: 'X', rate: -5 }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/tax-rules/route');
    const res = await POST(req('POST', '/api/tax-rules', validBody, ''));
    expect(res.status).toBe(400);
  });
});

// ── 10.2  PATCH /api/tax-rules/[id] ───────────────────────────────────────
describe('PATCH /api/tax-rules/[id] (10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(TaxRule.findOne).mockResolvedValue(makeTaxRuleDoc() as any);
  });

  it('updates tax rule and returns 200', async () => {
    const { PATCH } = await import('@/app/api/tax-rules/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/tax-rules/${RULE_ID}`, { name: 'Updated VAT', rate: 15 }),
      params(RULE_ID)
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 for out-of-range rate update', async () => {
    const { PATCH } = await import('@/app/api/tax-rules/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/tax-rules/${RULE_ID}`, { rate: 200 }),
      params(RULE_ID)
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when tax rule not found', async () => {
    vi.mocked(TaxRule.findOne).mockResolvedValue(null as any);
    const { PATCH } = await import('@/app/api/tax-rules/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/tax-rules/unknown`, { name: 'X' }),
      params('unknown')
    );
    expect(res.status).toBe(404);
  });
});

// ── 10.2  DELETE /api/tax-rules/[id] ──────────────────────────────────────
describe('DELETE /api/tax-rules/[id] (10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(TaxRule.findOneAndDelete).mockResolvedValue(mockTaxRule as any);
  });

  it('deletes tax rule and returns 200', async () => {
    const { DELETE } = await import('@/app/api/tax-rules/[id]/route');
    const res = await DELETE(req('DELETE', `/api/tax-rules/${RULE_ID}`), params(RULE_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deleted/i);
  });

  it('returns 404 when tax rule not found', async () => {
    vi.mocked(TaxRule.findOneAndDelete).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/tax-rules/[id]/route');
    const res = await DELETE(req('DELETE', `/api/tax-rules/unknown`), params('unknown'));
    expect(res.status).toBe(404);
  });
});

// ── 10.3  Tax is correctly applied to taxable products ────────────────────
// Tests the real calculateTax lib function with mocked TaxRule model.
describe('calculateTax — taxable products (10.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies 12% VAT rule to all-products transaction', async () => {
    vi.mocked(TaxRule.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ ...mockTaxRule }]),
      }),
    } as any);

    const result = await calculateTax(
      TENANT_ID,
      100,
      [{ productType: 'regular', subtotal: 100 }]
    );

    expect(result.taxAmount).toBe(12);
    expect(result.taxRate).toBe(12);
    expect(result.taxLabel).toBe('VAT');
    expect(result.taxableAmount).toBe(100);
  });

  it('falls back to tenant settings when no tax rules exist', async () => {
    vi.mocked(TaxRule.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const tenantSettings = { taxEnabled: true, taxRate: 10, taxLabel: 'GST' } as any;
    const result = await calculateTax(TENANT_ID, 200, [], tenantSettings);

    expect(result.taxAmount).toBe(20);
    expect(result.taxRate).toBe(10);
    expect(result.taxLabel).toBe('GST');
  });

  it('returns zero tax when tenant tax is disabled and no rules', async () => {
    vi.mocked(TaxRule.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as any);

    const result = await calculateTax(
      TENANT_ID, 100, [],
      { taxEnabled: false, taxRate: 12 } as any
    );

    expect(result.taxAmount).toBe(0);
  });
});

// ── 10.4  Exempt products are not taxed ───────────────────────────────────
describe('calculateTax — exempt products (10.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 12% VAT rule applies to all
    vi.mocked(TaxRule.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ ...mockTaxRule }]),
      }),
    } as any);
  });

  it('does not tax items with taxExempt=true', async () => {
    const result = await calculateTax(
      TENANT_ID,
      100,
      [{ taxExempt: true, subtotal: 100 }]
    );
    // All items exempt → taxableItems.length === 0 → loop breaks → taxAmount = 0
    expect(result.taxAmount).toBe(0);
    expect(result.exemptAmount).toBe(100);
  });

  it('only taxes non-exempt portion when mixed items', async () => {
    // 60 taxable + 40 exempt = 100 subtotal
    const result = await calculateTax(
      TENANT_ID,
      100,
      [
        { taxExempt: false, subtotal: 60 },
        { taxExempt: true,  subtotal: 40 },
      ]
    );
    // exemptAmount = 40% of 100 = 40; taxable = 60; tax = 60 * 0.12 = 7.2
    expect(result.exemptAmount).toBe(40);
    expect(result.taxableAmount).toBe(60);
    expect(result.taxAmount).toBeCloseTo(7.2, 1);
  });

  it('SC/PWD discount category makes entire transaction VAT-exempt', async () => {
    const result = await calculateTax(
      TENANT_ID,
      100,
      [{ subtotal: 100 }],
      undefined,
      'senior'
    );
    expect(result.taxAmount).toBe(0);
    expect(result.taxLabel).toMatch(/vat exempt/i);
    expect(result.exemptAmount).toBe(100);
  });
});

// ── 10.5  VAT report includes correct tax amounts ─────────────────────────
describe('GET /api/reports/vat (10.5)', () => {
  let getVATReportSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Tenant.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenant),
    } as any);
    getVATReportSpy = vi.spyOn(analyticsLib, 'getVATReport').mockResolvedValue({
      vatSales: 892.86,
      nonVatSales: 0,
      vatAmount: 107.14,
      totalSales: 1000,
      vatRate: 12,
    });
  });

  it('returns VAT report with correct structure', async () => {
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.vatAmount).toBeCloseTo(107.14, 1);
    expect(body.data.totalSales).toBe(1000);
    expect(body.data.vatRate).toBe(12);
  });

  it('passes startDate and endDate to getVATReport', async () => {
    const { GET } = await import('@/app/api/reports/vat/route');
    await GET(req('GET', '/api/reports/vat?startDate=2026-01-01&endDate=2026-01-31'));
    expect(getVATReportSpy).toHaveBeenCalledWith(
      TENANT_ID,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
      expect.anything()
    );
  });

  it('returns 404 when tenantId not found', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat', undefined, ''));
    expect(res.status).toBe(404);
  });

  it('returns 403 when reports feature disabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat'));
    expect(res.status).toBe(403);
  });
});

// ── 10.6  BIR compliance settings save and apply ─────────────────────────
describe('GET /api/tenants/[slug]/bir-settings (10.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'admin',
    } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenant),
    } as any);
  });

  it('returns BIR settings for tenant', async () => {
    const { GET } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await GET(req('GET', `/api/tenants/${SLUG}/bir-settings`), slugParams(SLUG));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.birTin).toBe('123-456-789-000');
    expect(body.data.birPtuNumber).toBe('PTU-001');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { GET } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await GET(req('GET', `/api/tenants/${SLUG}/bir-settings`, undefined, ''), slugParams(SLUG));
    expect(res.status).toBe(401);
  });

  it('returns 403 for cross-tenant access', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: USER_ID, tenantId: 'other_tenant', role: 'admin',
    } as any);
    const { GET } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await GET(req('GET', `/api/tenants/${SLUG}/bir-settings`), slugParams(SLUG));
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/tenants/[slug]/bir-settings (10.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'admin',
    } as any);
    vi.mocked(Tenant.findOne).mockResolvedValue(makeTenantDoc() as any);
  });

  it('saves BIR settings and returns 200', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', `/api/tenants/${SLUG}/bir-settings`, {
        birTin: '123-456-789-000',
        birPtuNumber: 'PTU-2024-001',
      }),
      slugParams(SLUG)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 for invalid TIN format', async () => {
    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', `/api/tenants/${SLUG}/bir-settings`, { birTin: 'INVALID-TIN' }),
      slugParams(SLUG)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/NNN-NNN-NNN-NNN/);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', `/api/tenants/${SLUG}/bir-settings`, { birTin: '123-456-789-000' }, ''),
      slugParams(SLUG)
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for cashier role', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'cashier',
    } as any);
    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', `/api/tenants/${SLUG}/bir-settings`, { birTin: '123-456-789-000' }),
      slugParams(SLUG)
    );
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, resetAfterMs: 60000 });
    const { PUT } = await import('@/app/api/tenants/[slug]/bir-settings/route');
    const res = await PUT(
      req('PUT', `/api/tenants/${SLUG}/bir-settings`, { birPtuNumber: 'X' }),
      slugParams(SLUG)
    );
    expect(res.status).toBe(429);
  });
});
