import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAutomationTenants: vi.fn(),
  customerUpdateMany: vi.fn(),
  collections: new Map<string, {
    find: ReturnType<typeof vi.fn>;
    insertMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    createIndex: ReturnType<typeof vi.fn>;
  }>(),
  tenantFind: vi.fn(),
}));

function collection(name: string) {
  if (!mocks.collections.has(name)) {
    mocks.collections.set(name, {
      find: vi.fn(() => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) })),
      insertMany: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      createIndex: vi.fn().mockResolvedValue('ok'),
    });
  }
  return mocks.collections.get(name)!;
}

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/automations/tenants', () => ({ getAutomationTenants: mocks.getAutomationTenants }));
vi.mock('@/models/Customer', () => ({ default: { updateMany: mocks.customerUpdateMany } }));
vi.mock('@/models/Tenant', () => ({ default: { find: mocks.tenantFind } }));
vi.mock('@/lib/bir-readings', () => ({
  getDailySalesAggregate: vi.fn().mockResolvedValue({
    grossSales: 100, vatableSales: 0, vatAmount: 0, vatExemptSales: 0, zeroRatedSales: 0,
    discountTotal: 0, transactionCount: 1, voidCount: 0,
    startDate: new Date('2026-10-30T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z'),
  }),
  startOfBusinessDay: (d: Date) => d,
}));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  const connection = { db: { collection: (name: string) => collection(name) } };
  return { ...actual, default: { ...actual.default, connection }, connection };
});

import { anonymizeInactiveCustomers } from '@/lib/automations/customer-data-retention';
import { archiveOldData } from '@/lib/automations/data-archiving';
import { generateSalesSummaryExport } from '@/lib/automations/sales-summary-export';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collections.clear();
  mocks.getAutomationTenants.mockResolvedValue([{ _id: 't1', name: 'T1' }]);
});

describe('customer data retention', () => {
  it('anonymises only long-deactivated customers with no balance', async () => {
    mocks.customerUpdateMany.mockResolvedValue({ modifiedCount: 3 });
    const result = await anonymizeInactiveCustomers();

    const [filter, update] = mocks.customerUpdateMany.mock.calls[0];
    expect(filter).toMatchObject({
      tenantId: 't1',
      isActive: false,
      anonymizedAt: { $exists: false },
      accountBalance: { $in: [0, null] },
    });
    expect(update.$unset).toHaveProperty('email');
    expect(update.$unset).toHaveProperty('phone');
    expect(update.$set).toMatchObject({ firstName: 'Deleted', lastName: 'Customer' });
    expect(result.processed).toBe(3);
  });

  it('never shortens the retention period below 5 years', async () => {
    mocks.customerUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    await anonymizeInactiveCustomers({ retentionYears: 1 });
    const cutoff: Date = mocks.customerUpdateMany.mock.calls[0][0].$or[0].deactivatedAt.$lt;
    expect(new Date().getFullYear() - cutoff.getFullYear()).toBe(5);
  });
});

describe('data archiving', () => {
  it('refuses collections outside the allow-list', async () => {
    const result = await archiveOldData({ collections: ['users'] });
    expect(result.success).toBe(false);
    expect(mocks.collections.size).toBe(0);
  });

  it('never archives inside the 10-year BIR period', async () => {
    await archiveOldData({ archiveYears: 2, collections: ['transactions'] });
    const filter = collection('transactions').find.mock.calls[0][0];
    expect(new Date().getFullYear() - filter.createdAt.$lt.getFullYear()).toBe(10);
  });

  it('moves old sale records to *_archive with an index, scoped by tenant', async () => {
    const docs = [{ _id: 'a', tenantId: 't1' }, { _id: 'b', tenantId: 't1' }];
    collection('payments').find.mockReturnValueOnce({ limit: () => ({ toArray: () => Promise.resolve(docs) }) });
    collection('payments').deleteMany.mockResolvedValue({ deletedCount: 2 });

    const result = await archiveOldData({ collections: ['payments', 'zreadings'] });

    expect(collection('payments_archive').createIndex).toHaveBeenCalledWith({ tenantId: 1, createdAt: -1 });
    expect(collection('payments_archive').insertMany.mock.calls[0][0]).toHaveLength(2);
    expect(collection('payments').deleteMany).toHaveBeenCalledWith({ tenantId: 't1', _id: { $in: ['a', 'b'] } });
    // Z-readings age by businessDate, not createdAt
    expect(collection('zreadings').find.mock.calls[0][0]).toHaveProperty('businessDate');
    expect(result.processed).toBe(2);
  });
});

describe('sales summary export on serverless', () => {
  const originalVercel = process.env.VERCEL;
  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    vi.unstubAllGlobals();
  });

  it('only loads tenants with a push endpoint and counts failed pushes', async () => {
    process.env.VERCEL = '1';
    mocks.tenantFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { _id: 't1', slug: 'shop', grandTotalSales: 0, settings: { birEsalesPushUrl: 'https://x.test/push' } },
        ]),
      }),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await generateSalesSummaryExport({ period: 'daily' });

    expect(mocks.tenantFind.mock.calls[0][0]).toMatchObject({
      'settings.birEsalesPushUrl': { $nin: [null, ''] },
    });
    expect(result.failed).toBe(1);
  });
});
