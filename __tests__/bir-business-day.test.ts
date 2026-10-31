/**
 * BIR X/Z-Readings and the eSales sales-summary export must bucket sales by the
 * tenant's local calendar day (default Asia/Manila, UTC+8), not the server's
 * clock (UTC on Vercel).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const TENANT_ID = '64b000000000000000000001';

type Tx = { createdAt: Date; status: string; total: number; subtotal?: number };
type Range = { $gte: Date; $lt: Date };

const mocks = vi.hoisted(() => ({
  transactions: [] as Tx[],
  txFind: vi.fn(),
  txCount: vi.fn(),
  zReadings: [] as Array<Record<string, unknown>>,
  zFindOne: vi.fn(),
  zCreate: vi.fn(),
  tenantFindById: vi.fn(),
  tenantFind: vi.fn(),
  tenantSettings: vi.fn(),
  createAuditLog: vi.fn(),
}));

function inRange(d: Date, r: Range) {
  return d.getTime() >= r.$gte.getTime() && d.getTime() < r.$lt.getTime();
}

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'u1', tenantId: '64b000000000000000000001', role: 'owner' }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('64b000000000000000000001'),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fallback: string) => fallback),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, remaining: 9, resetAfterMs: 0 }) }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: (...a: unknown[]) => mocks.createAuditLog(...a),
  AuditActions: { X_READING_VIEW: 'x_reading.view', Z_READING_GENERATE: 'z_reading.generate', Z_READING_VIEW: 'z_reading.view' },
}));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: (...a: unknown[]) => mocks.tenantSettings(...a) }));
vi.mock('@/models/Transaction', () => ({
  default: {
    find: (...a: unknown[]) => mocks.txFind(...a),
    countDocuments: (...a: unknown[]) => mocks.txCount(...a),
  },
}));
vi.mock('@/models/ZReading', () => ({
  default: {
    findOne: (...a: unknown[]) => mocks.zFindOne(...a),
    create: (...a: unknown[]) => mocks.zCreate(...a),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: (...a: unknown[]) => mocks.tenantFindById(...a),
    find: (...a: unknown[]) => mocks.tenantFind(...a),
  },
}));

import { getDailySalesAggregate, startOfBusinessDay, getBusinessDayRange } from '@/lib/bir-readings';
import { POST as zReadingPOST } from '@/app/api/reports/z-reading/route';
import { GET as xReadingGET } from '@/app/api/reports/x-reading/route';
import {
  generateSalesSummaryExport,
  resolveExportDayYmd,
  resolveExportMonthStartYmd,
} from '@/lib/automations/sales-summary-export';
import { ptuExpiringSoon } from '@/lib/bir-compliance-helpers';

// 02:00 Manila on 2026-10-30 == 18:00 UTC on 2026-10-29.
const EARLY_MORNING_SALE = new Date('2026-10-29T18:00:00Z');
const MANILA_OCT30_START = new Date('2026-10-29T16:00:00.000Z');
const MANILA_OCT31_START = new Date('2026-10-30T16:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactions = [
    { createdAt: new Date('2026-10-29T15:59:59Z'), status: 'completed', total: 1 }, // 23:59 Manila Oct 29
    { createdAt: EARLY_MORNING_SALE, status: 'completed', total: 100 }, // 02:00 Manila Oct 30
    { createdAt: new Date('2026-10-30T03:00:00Z'), status: 'completed', total: 50 }, // 11:00 Manila Oct 30
    { createdAt: new Date('2026-10-30T16:00:00Z'), status: 'completed', total: 7 }, // 00:00 Manila Oct 31
  ];
  mocks.txFind.mockImplementation((filter: { status: string; createdAt: Range }) => ({
    select: () => ({
      lean: () => Promise.resolve(
        mocks.transactions.filter((t) => t.status === filter.status && inRange(t.createdAt, filter.createdAt))
      ),
    }),
  }));
  mocks.txCount.mockResolvedValue(0);
  mocks.tenantSettings.mockResolvedValue({ timezone: 'Asia/Manila' });
  mocks.createAuditLog.mockResolvedValue(undefined);
  mocks.tenantFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ grandTotalSales: 1000 }) }) });

  mocks.zReadings = [];
  mocks.zFindOne.mockImplementation((filter: { businessDate: { $gte: Date; $lt: Date }; branchId: unknown }) => ({
    populate: () => ({
      lean: () => Promise.resolve(
        mocks.zReadings.find(
          (r) => (r.branchId ?? null) === filter.branchId && inRange(r.businessDate as Date, filter.businessDate)
        ) ?? null
      ),
    }),
  }));
  mocks.zCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: 'z-new', ...doc }));
});

describe('bir-readings business day (tenant timezone)', () => {
  it('puts a 02:00 Manila sale (18:00 UTC previous day) on the Manila calendar day', async () => {
    expect(startOfBusinessDay(EARLY_MORNING_SALE, 'Asia/Manila')).toEqual(MANILA_OCT30_START);

    const agg = await getDailySalesAggregate(TENANT_ID, EARLY_MORNING_SALE, 'Asia/Manila');
    expect(agg.startDate).toEqual(MANILA_OCT30_START);
    expect(agg.endDate).toEqual(MANILA_OCT31_START);
    expect(agg.grossSales).toBe(150); // 02:00 + 11:00 sales; not 23:59 Oct 29 nor 00:00 Oct 31
    expect(agg.transactionCount).toBe(2);
    expect(mocks.txFind.mock.calls[0][0]).toMatchObject({ tenantId: TENANT_ID });
  });

  it("treats a 'YYYY-MM-DD' string as that local calendar day", async () => {
    const agg = await getDailySalesAggregate(TENANT_ID, '2026-10-29', 'Asia/Manila');
    expect(agg.startDate).toEqual(new Date('2026-10-28T16:00:00Z'));
    expect(agg.grossSales).toBe(1);
  });

  it('defaults to Asia/Manila and honours other timezones', () => {
    expect(startOfBusinessDay('2026-10-30')).toEqual(MANILA_OCT30_START);
    const ny = getBusinessDayRange('2026-11-01', 'America/New_York'); // DST ends: 25-hour day
    expect(ny.start).toEqual(new Date('2026-11-01T04:00:00Z'));
    expect(ny.end).toEqual(new Date('2026-11-02T05:00:00Z'));
  });
});

describe('POST /api/reports/z-reading', () => {
  function zReq(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/reports/z-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it("uses Manila boundaries for body.date 'YYYY-MM-DD' and stores local midnight", async () => {
    const res = await zReadingPOST(zReq({ date: '2026-10-30' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.reprint).toBe(false);
    const created = mocks.zCreate.mock.calls[0][0];
    expect(created.businessDate).toEqual(MANILA_OCT30_START);
    expect(created.grossSales).toBe(150);
    expect(created.tenantId).toBe(TENANT_ID);
    expect(mocks.txFind.mock.calls[0][0].createdAt).toEqual({ $gte: MANILA_OCT30_START, $lt: MANILA_OCT31_START });

    // Duplicate lookup: tenant-wide (branchId null) reading anywhere in the local day.
    expect(mocks.zFindOne.mock.calls[0][0]).toEqual({
      tenantId: TENANT_ID,
      branchId: null,
      businessDate: { $gte: MANILA_OCT30_START, $lt: MANILA_OCT31_START },
    });
  });

  it('reprints a legacy reading keyed at UTC midnight of the same calendar day', async () => {
    mocks.zReadings.push({ _id: 'legacy', tenantId: TENANT_ID, businessDate: new Date('2026-10-30T00:00:00Z') });
    const res = await zReadingPOST(zReq({ date: '2026-10-30' }));
    const json = await res.json();

    expect(json.reprint).toBe(true);
    expect(json.data._id).toBe('legacy');
    expect(mocks.zCreate).not.toHaveBeenCalled();
  });

  it('does not treat the previous day legacy reading as a duplicate', async () => {
    mocks.zReadings.push({ _id: 'legacy-29', tenantId: TENANT_ID, businessDate: new Date('2026-10-29T00:00:00Z') });
    const res = await zReadingPOST(zReq({ date: '2026-10-30' }));
    expect((await res.json()).reprint).toBe(false);
    expect(mocks.zCreate).toHaveBeenCalledTimes(1);
  });

  it('ignores branch-scoped readings for the tenant-wide reading', async () => {
    mocks.zReadings.push({ _id: 'branch', tenantId: TENANT_ID, branchId: 'b1', businessDate: MANILA_OCT30_START });
    const res = await zReadingPOST(zReq({ date: '2026-10-30' }));
    expect((await res.json()).reprint).toBe(false);
  });

  it('rejects an unparseable date', async () => {
    const res = await zReadingPOST(zReq({ date: 'not-a-date' }));
    expect(res.status).toBe(400);
    expect(mocks.zCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/reports/x-reading', () => {
  it("uses the tenant's timezone for ?date=YYYY-MM-DD", async () => {
    const res = await xReadingGET(new NextRequest('http://localhost/api/reports/x-reading?date=2026-10-30'));
    const json = await res.json();
    expect(json.data.grossSales).toBe(150);
    expect(json.data.businessDay).toBe('2026-10-30');
    expect(new Date(json.data.startDate)).toEqual(MANILA_OCT30_START);
  });

  it('falls back to Asia/Manila when the tenant has no timezone set', async () => {
    mocks.tenantSettings.mockResolvedValue(null);
    const res = await xReadingGET(new NextRequest('http://localhost/api/reports/x-reading?date=2026-10-30'));
    expect((await res.json()).data.timezone).toBe('Asia/Manila');
  });
});

describe('sales summary export (tenant timezone)', () => {
  const originalVercel = process.env.VERCEL;
  beforeEach(() => {
    process.env.VERCEL = '1'; // push-only: no files written
    mocks.tenantFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { _id: TENANT_ID, slug: 'shop', grandTotalSales: 0, settings: { birEsalesPushUrl: 'https://x.test/push', timezone: 'Asia/Manila' } },
        ]),
      }),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it("resolves 'yesterday' and 'last month' in the tenant timezone", () => {
    // 01:00 Manila Oct 31 == 17:00 UTC Oct 30 (UTC "yesterday" would be Oct 29).
    expect(resolveExportDayYmd(undefined, 'Asia/Manila', new Date('2026-10-30T17:00:00Z'))).toBe('2026-10-30');
    // 07:00 Manila Nov 1 is still Oct 31 in UTC (UTC "last month" would be September).
    expect(resolveExportMonthStartYmd(undefined, 'Asia/Manila', new Date('2026-10-31T23:00:00Z'))).toBe('2026-10-01');
    expect(resolveExportMonthStartYmd(undefined, 'Asia/Manila', new Date('2026-01-01T01:00:00Z'))).toBe('2025-12-01');
    expect(resolveExportMonthStartYmd(new Date('2026-09-15T00:00:00Z'), 'Asia/Manila')).toBe('2026-09-01');
  });

  it('daily export at 01:00 Manila (17:00 UTC) covers the previous Manila day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T17:00:00Z'));

    const result = await generateSalesSummaryExport({ period: 'daily' });

    expect(result.processed).toBe(1);
    expect(mocks.tenantFind.mock.calls[0][0]).toMatchObject({ isActive: true });
    expect(mocks.txFind.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_ID,
      createdAt: { $gte: MANILA_OCT30_START, $lt: MANILA_OCT31_START },
    });
    const payload = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(payload).toMatchObject({
      businessDate: '2026-10-30',
      timezone: 'Asia/Manila',
      startDate: MANILA_OCT30_START.toISOString(),
      endDate: MANILA_OCT31_START.toISOString(),
      grossSales: 150,
    });
  });

  it('monthly export on the 1st at 09:00 Manila covers the previous Manila month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));

    await generateSalesSummaryExport({ period: 'monthly' });

    expect(mocks.txFind.mock.calls[0][0].createdAt).toEqual({
      $gte: new Date('2026-09-30T16:00:00Z'),
      $lt: new Date('2026-10-31T16:00:00Z'),
    });
    const payload = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(payload.businessDate).toBe('2026-10-01');
    expect(payload.grossSales).toBe(158); // every October-Manila sale
  });
});

describe('ptuExpiringSoon', () => {
  afterEach(() => vi.useRealTimers());

  it('compares Manila calendar days regardless of server clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T17:00:00Z')); // 01:00 Manila Oct 31; UTC still Oct 30
    expect(ptuExpiringSoon('2026-11-30')).toBe(true); // exactly 30 Manila days out
    expect(ptuExpiringSoon('2026-12-01T00:00:00.000Z')).toBe(false);
    expect(ptuExpiringSoon('')).toBe(false);
  });
});
