import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenants: vi.fn(),
  generate: vi.fn(),
  audit: vi.fn(),
  report: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ AuditActions: { Z_READING_GENERATE: 'z_reading.generate' } }));
vi.mock('@/lib/tenant-active-query', () => ({ getActiveTenants: mocks.tenants }));
vi.mock('@/lib/z-reading', () => ({ generateZReading: mocks.generate }));
vi.mock('@/lib/automations/daily-sales-report', () => ({ DAILY_REPORT_TENANT_FIELDS: '', sendDailySalesReport: mocks.report }));
vi.mock('@/models/AuditLog', () => ({ default: { create: mocks.audit } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));

import { generateDailyZReadings } from '@/lib/automations/z-reading';

const created = {
  created: true,
  businessDate: new Date('2026-11-05T16:00:00.000Z'),
  reading: { _id: 'z1', grossSales: 100, beginningGT: 900, endingGT: 1000, transactionCount: 1 },
};

describe('generateDailyZReadings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 00:15 on the 7th in Manila, still the 6th in New York
    vi.setSystemTime(new Date('2026-11-06T16:15:00.000Z'));
    mocks.tenants.mockResolvedValue([{ _id: 'tenant-a', slug: 'a', name: 'A', settings: {} }]);
    mocks.generate.mockResolvedValue(created);
    mocks.audit.mockResolvedValue(undefined);
    mocks.report.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes yesterday in each store's own timezone", async () => {
    mocks.tenants.mockResolvedValue([
      { _id: 'manila', slug: 'm', name: 'M', settings: {} },
      { _id: 'new-york', slug: 'n', name: 'N', settings: { timezone: 'America/New_York' } },
    ]);

    await generateDailyZReadings();

    expect(mocks.generate).toHaveBeenCalledWith({ tenantId: 'manila', day: '2026-11-06', skipEmptyDay: true });
    expect(mocks.generate).toHaveBeenCalledWith({ tenantId: 'new-york', day: '2026-11-05', skipEmptyDay: true });
  });

  it('logs the reading as automated and leaves out any user', async () => {
    const result = await generateDailyZReadings();

    expect(result).toMatchObject({ success: true, processed: 1, failed: 0 });
    const entry = mocks.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ tenantId: 'tenant-a', action: 'z_reading.generate', entityId: 'z1', metadata: { automated: true } });
    expect(entry).not.toHaveProperty('userId');
  });

  it('counts nothing for a day that already has a reading or had no activity', async () => {
    mocks.tenants.mockResolvedValue([
      { _id: 'done', slug: 'd', name: 'D', settings: {} },
      { _id: 'quiet', slug: 'q', name: 'Q', settings: {} },
    ]);
    mocks.generate.mockResolvedValueOnce({ ...created, created: false }).mockResolvedValueOnce(null);

    const result = await generateDailyZReadings();

    expect(result).toMatchObject({ success: true, processed: 0, failed: 0 });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('refuses to lock a business day that is still open', async () => {
    const result = await generateDailyZReadings({ businessDate: '2026-11-07' });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, failed: 1 });
  });

  it('fills in a named past day', async () => {
    await generateDailyZReadings({ businessDate: '2026-11-02' });

    expect(mocks.generate).toHaveBeenCalledWith({ tenantId: 'tenant-a', day: '2026-11-02', skipEmptyDay: true });
  });

  it('carries on to the next store when one fails', async () => {
    mocks.tenants.mockResolvedValue([
      { _id: 'bad', slug: 'bad', name: 'B', settings: {} },
      { _id: 'good', slug: 'good', name: 'G', settings: {} },
    ]);
    mocks.generate.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(created);

    const result = await generateDailyZReadings();

    expect(result).toMatchObject({ success: false, processed: 1, failed: 1, errors: ['bad: boom'] });
  });

  it('reports on a day closed earlier by hand, but not on a day with no activity', async () => {
    mocks.tenants.mockResolvedValue([
      { _id: 'manual', slug: 'm', name: 'M', settings: {} },
      { _id: 'quiet', slug: 'q', name: 'Q', settings: {} },
    ]);
    mocks.generate.mockResolvedValueOnce({ ...created, created: false }).mockResolvedValueOnce(null);

    await generateDailyZReadings();

    expect(mocks.report).toHaveBeenCalledOnce();
    expect(mocks.report.mock.calls[0][0]).toMatchObject({ _id: 'manual' });
  });

  it('sends no report when filling in a past day', async () => {
    await generateDailyZReadings({ businessDate: '2026-11-02' });

    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('keeps the reading when the report cannot be delivered, and says so', async () => {
    mocks.report.mockRejectedValue(new Error('daily report could not be delivered'));

    const result = await generateDailyZReadings();

    expect(result).toMatchObject({ success: true, processed: 1, failed: 0, errors: ['a: daily report could not be delivered'] });
  });

  it('notes a channel that failed while the other got through', async () => {
    mocks.report.mockResolvedValue(['SMS']);

    const result = await generateDailyZReadings();

    expect(result.errors).toEqual(['a: daily report SMS failed']);
  });

  it('keeps the reading when the audit entry fails', async () => {
    mocks.audit.mockRejectedValue(new Error('log down'));

    const result = await generateDailyZReadings();

    expect(result).toMatchObject({ success: true, processed: 1, failed: 0 });
  });
});
