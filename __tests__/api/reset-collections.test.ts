process.env.JWT_SECRET = 'test-secret-for-reset-collections-tests-32chars!!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// One explicit delegate per registry model (plain objects, no Proxy, so
// nothing exposes a `.then`).
type Delegate = { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
const { delegates, mockTenantFindFirst } = vi.hoisted(() => ({
  delegates: {} as Record<string, Delegate>,
  mockTenantFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', async () => {
  const { BACKUP_COLLECTION_SPECS, delegateName } = await vi.importActual<typeof import('@/lib/backup-reset-collections')>('@/lib/backup-reset-collections');
  const client: Record<string, unknown> = {
    tenant: { findFirst: (...args: unknown[]) => mockTenantFindFirst(...args) },
  };
  const models = BACKUP_COLLECTION_SPECS.flatMap((s) => [s.model, ...(s.children || []).map((c) => c.model)]);
  for (const model of models) {
    const name = delegateName(model);
    delegates[name] = {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    };
    client[name] = delegates[name];
  }
  return {
    default: client,
    dbTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', VIEW: 'view' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

import { GET, POST, PUT } from '@/app/api/tenants/[slug]/reset-collections/route';

const TENANT_ID = 'tenant-1';
const ctx = { params: Promise.resolve({ slug: 'store' }) };

function req(method: string, body?: unknown, query = '') {
  return new NextRequest(`http://localhost/api/tenants/store/reset-collections${query}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

beforeEach(() => {
  for (const d of Object.values(delegates)) {
    d.findMany.mockReset().mockResolvedValue([]);
    d.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    d.createMany.mockReset().mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  }
  mockTenantFindFirst.mockResolvedValue({ id: TENANT_ID, name: 'Store', slug: 'store' });
  mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT_ID, role: 'owner' });
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------
describe('GET (backup)', () => {
  it('exports cascade child tables scoped through their parent relation', async () => {
    delegates.transaction.findMany.mockResolvedValue([{ id: 't1', tenantId: TENANT_ID }]);
    delegates.transactionItem.findMany.mockResolvedValue([{ id: 'ti1', transactionId: 't1' }]);

    const res = await GET(req('GET', undefined, '?collections=transactions'), ctx);
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());

    expect(delegates.transaction.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
    expect(delegates.transactionItem.findMany).toHaveBeenCalledWith({ where: { transaction: { tenantId: TENANT_ID } } });
    expect(delegates.transactionItemModifier.findMany).toHaveBeenCalledWith({
      where: { transactionItem: { transaction: { tenantId: TENANT_ID } } },
    });
    expect(body.collections.transactionItems).toEqual([{ id: 'ti1', transactionId: 't1' }]);
    expect(body.counts.transactionItems).toBe(1);
  });

  it('rejects unknown collection names', async () => {
    const res = await GET(req('GET', undefined, '?collections=users'), ctx);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
describe('POST (reset)', () => {
  it('rejects a selection whose rows are still referenced by unselected collections', async () => {
    const res = await POST(req('POST', { collections: ['transactions'] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missingDependencies).toEqual([{ collection: 'transactions', missing: ['payments', 'kitchenTickets'] }]);
    expect(delegates.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes dependents before the tables they reference, scoped to the tenant', async () => {
    const order: string[] = [];
    for (const name of ['transaction', 'payment', 'kitchenTicket']) {
      delegates[name].deleteMany.mockImplementation(async () => { order.push(name); return { count: 1 }; });
    }

    const res = await POST(req('POST', { collections: ['transactions', 'payments', 'kitchenTickets'] }), ctx);
    expect(res.status).toBe(200);
    expect(order.indexOf('transaction')).toBe(2);
    expect(delegates.transaction.deleteMany).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
  });

  it('refuses another tenant', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u2', tenantId: 'other-tenant', role: 'owner' });
    const res = await POST(req('POST', { collections: ['categories'] }), ctx);
    expect(res.status).toBe(403);
    expect(delegates.category.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------
describe('PUT (restore)', () => {
  it('only inserts child rows whose parent belongs to this tenant', async () => {
    // t1 is ours; t-foreign belongs to someone else and must not get rows attached.
    delegates.transaction.findMany.mockImplementation(async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
      where.id.in.filter((id) => id === 't1').map((id) => ({ id }))
    );

    const backupData = {
      version: '2.0',
      collections: {
        transactions: [{ id: 't1', tenantId: 'whatever' }],
        transactionItems: [
          { id: 'ti1', transactionId: 't1' },
          { id: 'ti2', transactionId: 't-foreign' },
        ],
      },
    };
    const res = await PUT(req('PUT', { backupData }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(delegates.transaction.createMany).toHaveBeenCalledWith({
      data: [{ id: 't1', tenantId: TENANT_ID }],
      skipDuplicates: true,
    });
    expect(delegates.transaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, id: { in: ['t1', 't-foreign'] } },
      select: { id: true },
    });
    expect(delegates.transactionItem.createMany).toHaveBeenCalledWith({
      data: [{ id: 'ti1', transactionId: 't1' }],
      skipDuplicates: true,
    });
    expect(body.data.results.transactionItems).toEqual({ restored: 1, cleared: 0, skipped: 1 });
  });

  it('validates grandchild rows against the in-tenant child rows', async () => {
    delegates.product.findMany.mockResolvedValue([{ id: 'p1' }]);
    delegates.productModifier.findMany.mockResolvedValue([{ id: 'm1' }]);

    const backupData = {
      collections: {
        products: [{ id: 'p1' }],
        productModifiers: [{ id: 'm1', productId: 'p1' }],
        productModifierOptions: [{ id: 'o1', modifierId: 'm1' }],
      },
    };
    const res = await PUT(req('PUT', { backupData }), ctx);
    expect(res.status).toBe(200);
    expect(delegates.productModifier.findMany).toHaveBeenCalledWith({
      where: { product: { tenantId: TENANT_ID }, id: { in: ['m1'] } },
      select: { id: true },
    });
    expect(delegates.productModifierOption.createMany).toHaveBeenCalledWith({
      data: [{ id: 'o1', modifierId: 'm1' }],
      skipDuplicates: true,
    });
  });

  it('forces tenantId onto child tables that have their own tenantId column', async () => {
    delegates.kitchenTicket.findMany.mockResolvedValue([{ id: 'k1' }]);
    const backupData = {
      collections: {
        kitchenTickets: [{ id: 'k1' }],
        kitchenTicketItems: [{ id: 'ki1', kitchenTicketId: 'k1', tenantId: 'other-tenant' }],
      },
    };
    await PUT(req('PUT', { backupData }), ctx);
    expect(delegates.kitchenTicketItem.createMany).toHaveBeenCalledWith({
      data: [{ id: 'ki1', kitchenTicketId: 'k1', tenantId: TENANT_ID }],
      skipDuplicates: true,
    });
  });

  it('drops the circular currentOrderId on restaurant tables', async () => {
    const backupData = { collections: { posTables: [{ id: 'tbl1', currentOrderId: 't9' }] } };
    await PUT(req('PUT', { backupData }), ctx);
    expect(delegates.posTable.createMany).toHaveBeenCalledWith({
      data: [{ id: 'tbl1', currentOrderId: null, tenantId: TENANT_ID }],
      skipDuplicates: true,
    });
  });

  it('ignores child keys whose parent collection is not in the backup', async () => {
    const backupData = { collections: { transactionItems: [{ id: 'ti1', transactionId: 't1' }] } };
    const res = await PUT(req('PUT', { backupData }), ctx);
    expect(res.status).toBe(200);
    expect(delegates.transactionItem.createMany).not.toHaveBeenCalled();
  });

  it('refuses to clear existing data that unrestored collections still reference', async () => {
    const backupData = { collections: { transactions: [] } };
    const res = await PUT(req('PUT', { backupData, clearExisting: true }), ctx);
    expect(res.status).toBe(400);
    expect(delegates.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects pre-migration backups', async () => {
    const res = await PUT(req('PUT', { backupData: { version: '1.0', collections: {} } }), ctx);
    expect(res.status).toBe(400);
  });
});
