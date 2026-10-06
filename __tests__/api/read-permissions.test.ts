process.env.JWT_SECRET = 'test-secret-for-read-permission-tests-32chars!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoiceFindMany = vi.fn();
const mockInvoiceCount = vi.fn();
const mockSettingsFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    invoice: {
      findMany: (...args: unknown[]) => mockInvoiceFindMany(...args),
      count: (...args: unknown[]) => mockInvoiceCount(...args),
    },
    tenantSettings: { findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args) },
  },
}));

const mockGetLowStockProducts = vi.fn();
vi.mock('@/lib/stock', () => ({
  getLowStockProducts: (...args: unknown[]) => mockGetLowStockProducts(...args),
}));

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: {} }));
vi.mock('@/lib/receipt', () => ({ generateInvoiceNumber: vi.fn() }));
vi.mock('@/lib/tax-calculation', () => ({ calculateTax: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn() }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockRequireTenantAccess = vi.fn();
const mockGetTenantIdForUser = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
  getTenantIdForUser: (...args: unknown[]) => mockGetTenantIdForUser(...args),
}));

const mockHasAnyTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasAnyTenantPermission: (...args: unknown[]) => mockHasAnyTenantPermission(...args),
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

import { GET as listInvoices } from '@/app/api/invoices/route';
import { GET as lowStock } from '@/app/api/inventory/low-stock/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const VIEWER = { userId: 'user-1', tenantId: TENANT_A, email: 'v@x.test', role: 'viewer' };

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_A, user: VIEWER });
  mockRequireAuth.mockResolvedValue(VIEWER);
  mockGetTenantIdForUser.mockResolvedValue(TENANT_A);
  mockInvoiceFindMany.mockResolvedValue([]);
  mockInvoiceCount.mockResolvedValue(0);
  mockSettingsFindUnique.mockResolvedValue({ lowStockThreshold: 5 });
  mockGetLowStockProducts.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/invoices — permission', () => {
  it('accepts invoices.view or deposit create/edit (the deposit invoice picker reads this list)', async () => {
    mockHasAnyTenantPermission.mockResolvedValue(true);
    const res = await listInvoices(req('/api/invoices'));
    expect(res.status).toBe(200);
    expect(mockHasAnyTenantPermission).toHaveBeenCalledWith('viewer', TENANT_A, ['invoices.view', 'deposits.create', 'deposits.edit']);
  });

  it('returns 403 and reads nothing without either permission', async () => {
    mockHasAnyTenantPermission.mockResolvedValue(false);
    const res = await listInvoices(req('/api/invoices'));
    expect(res.status).toBe(403);
    expect(mockInvoiceFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/inventory/low-stock — permission', () => {
  it('accepts anyone who can see the dashboard or inventory, or edit/restock products', async () => {
    mockHasAnyTenantPermission.mockResolvedValue(true);
    const res = await lowStock(req('/api/inventory/low-stock'));
    expect(res.status).toBe(200);
    expect(mockHasAnyTenantPermission).toHaveBeenCalledWith('viewer', TENANT_A, ['dashboard.view', 'inventory.view', 'products.edit', 'products.restock']);
  });

  it('returns 403 and reads nothing for a role with none of those permissions', async () => {
    mockHasAnyTenantPermission.mockResolvedValue(false);
    const res = await lowStock(req('/api/inventory/low-stock'));
    expect(res.status).toBe(403);
    expect(mockGetLowStockProducts).not.toHaveBeenCalled();
  });
});
