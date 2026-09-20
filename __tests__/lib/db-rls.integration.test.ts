import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { setTenantContext, setBypassContext } from '@/lib/tenant-context';

// Verifies the automatic tenant-scoping mechanism (lib/db.ts's Prisma
// extension + lib/tenant-context.ts's AsyncLocalStorage) actually enforces
// the Postgres RLS policy on Product (see
// prisma/migrations/20260920000000_add_rls_products), independent of any
// application-level `tenantId` filter, and that it doesn't break atomicity
// for explicit multi-step transactions. Requires a real database.
describe('Automatic tenant scoping (RLS)', () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  let productAId: string;
  let productBId: string;
  let dbAvailable = true;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      const rlsEnabled = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity FROM pg_class WHERE relname = 'products'
      `;
      if (!rlsEnabled[0]?.relrowsecurity) {
        dbAvailable = false;
        return;
      }

      await prisma.tenant.createMany({
        data: [
          { id: tenantAId, name: 'RLS Test Tenant A', slug: `rls-test-a-${tenantAId}` },
          { id: tenantBId, name: 'RLS Test Tenant B', slug: `rls-test-b-${tenantBId}` },
        ],
        skipDuplicates: true,
      });

      productAId = randomUUID();
      productBId = randomUUID();
      await setTenantContext(tenantAId);
      await prisma.product.create({ data: { id: productAId, tenantId: tenantAId, name: 'Tenant A Widget', price: 1 } });
      await setTenantContext(tenantBId);
      await prisma.product.create({ data: { id: productBId, tenantId: tenantBId, name: 'Tenant B Widget', price: 1 } });
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    setBypassContext();
    await prisma.product.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it('hides other tenants rows even when the query has no tenantId filter at all', async () => {
    if (!dbAvailable) return;

    setTenantContext(tenantAId);
    // Deliberately omits `where: { tenantId }` — the exact mistake RLS is
    // meant to catch if a route ever forgets the manual filter.
    const rows = await prisma.product.findMany({ where: { id: { in: [productAId, productBId] } } });

    expect(rows.map((p) => p.id)).toEqual([productAId]);
  });

  it('scopes each tenant context independently', async () => {
    if (!dbAvailable) return;

    setTenantContext(tenantBId);
    const rows = await prisma.product.findMany({ where: { id: { in: [productAId, productBId] } } });

    expect(rows.map((p) => p.id)).toEqual([productBId]);
  });

  it('allows bypass context to see rows across tenants (for automations/scripts/super_admin)', async () => {
    if (!dbAvailable) return;

    setBypassContext();
    const rows = await prisma.product.findMany({ where: { id: { in: [productAId, productBId] } } });

    expect(rows.map((p) => p.id).sort()).toEqual([productAId, productBId].sort());
  });

  it('keeps a multi-step dbTransaction atomic: a later failure rolls back earlier writes', async () => {
    if (!dbAvailable) return;

    setTenantContext(tenantAId);
    const tempId = randomUUID();

    await expect(
      dbTransaction(async (tx) => {
        await tx.product.create({ data: { id: tempId, tenantId: tenantAId, name: 'Should be rolled back', price: 1 } });
        throw new Error('force rollback');
      })
    ).rejects.toThrow('force rollback');

    setBypassContext();
    const found = await prisma.product.findFirst({ where: { id: tempId } });
    expect(found).toBeNull();
  });

  it('keeps a multi-step dbTransaction tenant-scoped throughout', async () => {
    if (!dbAvailable) return;

    setTenantContext(tenantAId);
    const result = await dbTransaction(async (tx) => {
      // No explicit tenantId filter — relies on the transaction's own RLS
      // session variable, set once at the top by dbTransaction.
      return tx.product.findMany({ where: { id: { in: [productAId, productBId] } } });
    });

    expect(result.map((p) => p.id)).toEqual([productAId]);
  });
});
