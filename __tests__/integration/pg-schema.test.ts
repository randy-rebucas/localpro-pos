/**
 * Postgres schema constraints (db/schema, db/migrations). Each test runs in a
 * transaction that is rolled back, so the database stays empty.
 *
 *   pnpm pg:up && pnpm pg:migrate && pnpm test:integration
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';

const DATABASE_URL = process.env.DATABASE_URL_DIRECT || 'postgres://pos:pos@localhost:5433/localpro_pos';

let client: Client;
let db: NodePgDatabase<typeof schema>;

/** Runs `fn` in a savepoint and returns the SQLSTATE it failed with (or null). */
async function pgErrorCode(fn: () => Promise<unknown>): Promise<string | null> {
  await client.query('SAVEPOINT expect_error');
  try {
    await fn();
    await client.query('RELEASE SAVEPOINT expect_error');
    return null;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT expect_error');
    // drizzle wraps driver errors; the SQLSTATE lives on the cause
    const e = err as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code ?? 'unknown';
  }
}

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FK_VIOLATION = '23503';
const EXCLUSION_VIOLATION = '23P01';

async function createTenant(slug = 'acme') {
  const [tenant] = await db.insert(schema.tenants).values({ slug, name: slug }).returning();
  return tenant;
}

async function createUser(tenantId: string | null, email: string, role: (typeof schema.USER_ROLES)[number] = 'cashier') {
  const [user] = await db
    .insert(schema.users)
    .values({ tenantId, email, password: 'hash', name: email, role })
    .returning();
  return user;
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('ids', () => {
  it('generates 24-char ObjectId hex ids', async () => {
    const tenant = await createTenant();
    expect(tenant.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('keeps an explicit id (ETL copies Mongo _id verbatim)', async () => {
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ id: '64abc123def4567890abcdef', slug: 'kept', name: 'Kept' })
      .returning();
    expect(tenant.id).toBe('64abc123def4567890abcdef');
  });
});

describe('tenants and users', () => {
  it('rejects slugs outside [a-z0-9-]', async () => {
    expect(await pgErrorCode(() => createTenant('Bad_Slug'))).toBe(CHECK_VIOLATION);
  });

  it('allows many tenants without a domain but keeps set domains unique', async () => {
    await createTenant('a');
    await createTenant('b');
    await db.update(schema.tenants).set({ domain: 'shop.example.com' }).where(eq(schema.tenants.slug, 'a'));
    expect(
      await pgErrorCode(() => db.update(schema.tenants).set({ domain: 'shop.example.com' }).where(eq(schema.tenants.slug, 'b')))
    ).toBe(UNIQUE_VIOLATION);
  });

  it('requires tenant_id for every role except super_admin', async () => {
    expect(await pgErrorCode(() => createUser(null, 'cashier@example.com'))).toBe(CHECK_VIOLATION);
    expect(await pgErrorCode(() => createUser(null, 'root@example.com', 'super_admin'))).toBeNull();
  });

  it('keeps email unique across tenants', async () => {
    const a = await createTenant('a');
    const b = await createTenant('b');
    await createUser(a.id, 'same@example.com');
    expect(await pgErrorCode(() => createUser(b.id, 'same@example.com'))).toBe(UNIQUE_VIOLATION);
  });

  it('blocks deleting a tenant that still has data', async () => {
    const tenant = await createTenant();
    await createUser(tenant.id, 'owner@example.com', 'owner');
    expect(await pgErrorCode(() => db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id)))).toBe(FK_VIOLATION);
  });
});

describe('catalog', () => {
  it('scopes sku uniqueness to the tenant and ignores products without a sku', async () => {
    const a = await createTenant('a');
    const b = await createTenant('b');
    await db.insert(schema.products).values([
      { tenantId: a.id, name: 'No SKU 1', price: 10 },
      { tenantId: a.id, name: 'No SKU 2', price: 10 },
      { tenantId: a.id, name: 'Shirt', price: 10, sku: 'SKU-1' },
      { tenantId: b.id, name: 'Shirt', price: 10, sku: 'SKU-1' },
    ]);
    expect(
      await pgErrorCode(() => db.insert(schema.products).values({ tenantId: a.id, name: 'Dup', price: 10, sku: 'SKU-1' }))
    ).toBe(UNIQUE_VIOLATION);
  });

  it('round-trips money as JS numbers with 2 decimals', async () => {
    const tenant = await createTenant();
    const [product] = await db.insert(schema.products).values({ tenantId: tenant.id, name: 'Rice', price: 33.33 }).returning();
    expect(product.price).toBe(33.33);
  });

  it('blocks deleting a category that products use', async () => {
    const tenant = await createTenant();
    const [category] = await db.insert(schema.categories).values({ tenantId: tenant.id, name: 'Drinks' }).returning();
    await db.insert(schema.products).values({ tenantId: tenant.id, name: 'Cola', price: 1, categoryId: category.id });
    expect(await pgErrorCode(() => db.delete(schema.categories).where(eq(schema.categories.id, category.id)))).toBe(FK_VIOLATION);
  });
});

describe('operations', () => {
  it('allows only one open attendance shift per user', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, 'staff@example.com');
    const [shift] = await db.insert(schema.attendance).values({ tenantId: tenant.id, userId: user.id, clockIn: new Date() }).returning();
    expect(
      await pgErrorCode(() => db.insert(schema.attendance).values({ tenantId: tenant.id, userId: user.id, clockIn: new Date() }))
    ).toBe(UNIQUE_VIOLATION);

    await db.update(schema.attendance).set({ clockOut: new Date() }).where(eq(schema.attendance.id, shift.id));
    expect(
      await pgErrorCode(() => db.insert(schema.attendance).values({ tenantId: tenant.id, userId: user.id, clockIn: new Date() }))
    ).toBeNull();
  });

  it('allows only one open cash drawer per tenant', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, 'cashier@example.com');
    await db.insert(schema.cashDrawerSessions).values({ tenantId: tenant.id, userId: user.id, openingAmount: 100, status: 'open' });
    expect(
      await pgErrorCode(() =>
        db.insert(schema.cashDrawerSessions).values({ tenantId: tenant.id, userId: user.id, openingAmount: 100, status: 'open' })
      )
    ).toBe(UNIQUE_VIOLATION);
  });

  it('treats a null branch as one value for the z-reading business day', async () => {
    const tenant = await createTenant();
    const user = await createUser(tenant.id, 'manager@example.com', 'manager');
    const reading = {
      tenantId: tenant.id,
      businessDate: new Date('2026-11-03T00:00:00+08:00'),
      beginningGt: 0,
      endingGt: 100,
      grossSales: 100,
      generatedBy: user.id,
    };
    await db.insert(schema.zReadings).values(reading);
    expect(await pgErrorCode(() => db.insert(schema.zReadings).values(reading))).toBe(UNIQUE_VIOLATION);
  });

  describe('booking overlap', () => {
    const at = (hour: number) => new Date(`2026-11-03T${String(hour).padStart(2, '0')}:00:00Z`);

    async function book(tenantId: string, staffId: string | null, start: number, end: number, status: 'pending' | 'confirmed' | 'cancelled' = 'confirmed') {
      return db.insert(schema.bookings).values({
        tenantId,
        customerName: 'Ana',
        serviceName: 'Haircut',
        startTime: at(start),
        endTime: at(end),
        duration: (end - start) * 60,
        staffId,
        status,
      });
    }

    it('rejects overlapping active bookings for the same staff member', async () => {
      const tenant = await createTenant();
      const staff = await createUser(tenant.id, 'stylist@example.com');
      await book(tenant.id, staff.id, 9, 11);
      expect(await pgErrorCode(() => book(tenant.id, staff.id, 10, 12, 'pending'))).toBe(EXCLUSION_VIOLATION);
    });

    it('allows back-to-back, cancelled, unassigned and other-staff bookings', async () => {
      const tenant = await createTenant();
      const staff = await createUser(tenant.id, 'stylist@example.com');
      const other = await createUser(tenant.id, 'other@example.com');
      await book(tenant.id, staff.id, 9, 11);
      expect(await pgErrorCode(() => book(tenant.id, staff.id, 11, 12))).toBeNull();
      expect(await pgErrorCode(() => book(tenant.id, staff.id, 9, 11, 'cancelled'))).toBeNull();
      expect(await pgErrorCode(() => book(tenant.id, other.id, 9, 11))).toBeNull();
      expect(await pgErrorCode(() => book(tenant.id, null, 9, 11))).toBeNull();
      expect(await pgErrorCode(() => book(tenant.id, null, 9, 11))).toBeNull();
    });
  });
});

describe('updated_at trigger', () => {
  it('bumps updated_at on raw SQL updates that bypass Drizzle', async () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const [tenant] = await db.insert(schema.tenants).values({ slug: 'acme', name: 'Acme', updatedAt: old }).returning();
    await db.execute(sql`UPDATE tenants SET name = 'Acme Inc' WHERE id = ${tenant.id}`);
    const [row] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
    expect(row.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('is attached to every table with an updated_at column', async () => {
    const { rows } = await client.query<{ table_name: string }>(`
      SELECT c.table_name FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
        AND NOT EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = format('public.%I', c.table_name)::regclass
            AND t.tgname = c.table_name || '_set_updated_at'
        )`);
    expect(rows.map(r => r.table_name)).toEqual([]);
  });
});
