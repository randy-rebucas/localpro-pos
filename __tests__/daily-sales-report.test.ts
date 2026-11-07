import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  email: vi.fn(),
  sms: vi.fn(),
  salesReport: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/models/ZReading', () => ({ default: { updateOne: mocks.update } }));
vi.mock('@/lib/notifications', () => ({ sendEmail: mocks.email, sendSMS: mocks.sms }));
vi.mock('@/lib/analytics', () => ({ getSalesReport: mocks.salesReport }));

import { sendDailySalesReport } from '@/lib/automations/daily-sales-report';

const reading = {
  _id: 'z1',
  grossSales: 12345.5,
  netSales: 12000,
  refundTotal: 345.5,
  discountTotal: 100,
  vatAmount: 1322.73,
  beginningGT: 0,
  endingGT: 12345.5,
  transactionCount: 45,
  voidCount: 2,
} as never;

const businessDate = new Date('2026-11-05T16:00:00.000Z');
const tenant = (extra: Record<string, unknown> = {}) => ({
  _id: 'tenant-a',
  slug: 'a',
  name: 'Store A',
  settings: { currency: 'PHP', companyName: 'Kape <Co>' },
  ...extra,
});
const send = (t: ReturnType<typeof tenant>) => sendDailySalesReport(t, reading, businessDate, 'Asia/Manila');

describe('sendDailySalesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ modifiedCount: 1 });
    mocks.email.mockResolvedValue(true);
    mocks.sms.mockResolvedValue(true);
    mocks.salesReport.mockResolvedValue({ salesByPaymentMethod: { cash: 10000, card: 2000, digital: 0, on_account: 0 } });
  });

  it('sends nothing, and claims nothing, when no one is set up to receive it', async () => {
    await expect(send(tenant())).resolves.toEqual([]);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('emails the closed day with its figures and escapes the store name', async () => {
    await send(tenant({ dailyReport: { email: 'owner@example.com' } }));

    const { to, subject, message } = mocks.email.mock.calls[0][0];
    expect(to).toBe('owner@example.com');
    expect(subject).toContain('Nov 6, 2026');
    expect(message).toContain('12,345.50');
    expect(message).toContain('Kape &lt;Co&gt;');
    expect(message).not.toContain('\n');
    expect(mocks.sms).not.toHaveBeenCalled();
  });

  it('texts a short summary without characters that shrink an SMS', async () => {
    await send(tenant({ dailyReport: { phone: '+639171234567' } }));

    const { to, message } = mocks.sms.mock.calls[0][0];
    expect(to).toBe('+639171234567');
    expect(message).toContain('Gross PHP 12,345.50');
    expect(message).toMatch(/^[\x20-\x7e]+$/);
    expect(message.length).toBeLessThanOrEqual(160);
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('falls back to the business email only when email notifications are on', async () => {
    await send(tenant({ settings: { emailNotifications: true, email: 'shop@example.com' } }));
    expect(mocks.email.mock.calls[0][0].to).toBe('shop@example.com');

    vi.clearAllMocks();
    await send(tenant({ settings: { emailNotifications: false, email: 'shop@example.com' } }));
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('never sends again once the reading has been claimed', async () => {
    mocks.update.mockResolvedValue({ modifiedCount: 0 });

    await send(tenant({ dailyReport: { email: 'owner@example.com', phone: '+639171234567' } }));

    expect(mocks.update.mock.calls[0][0]).toMatchObject({ _id: 'z1', tenantId: 'tenant-a', ownerReportSentAt: { $exists: false } });
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
  });

  it('releases the claim for a retry when nothing got through', async () => {
    mocks.email.mockResolvedValue(false);

    await expect(send(tenant({ dailyReport: { email: 'owner@example.com' } }))).rejects.toThrow('could not be delivered');

    expect(mocks.update).toHaveBeenLastCalledWith({ _id: 'z1', tenantId: 'tenant-a' }, { $unset: { ownerReportSentAt: 1 } });
  });

  it('keeps the claim and names the failed channel when the other got through', async () => {
    mocks.sms.mockResolvedValue(false);

    await expect(send(tenant({ dailyReport: { email: 'owner@example.com', phone: '+639171234567' } }))).resolves.toEqual(['SMS']);

    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('still sends the totals when the payment breakdown fails', async () => {
    mocks.salesReport.mockRejectedValue(new Error('slow'));

    await send(tenant({ dailyReport: { email: 'owner@example.com' } }));

    const { message } = mocks.email.mock.calls[0][0];
    expect(message).toContain('Gross sales');
    expect(message).not.toContain('Sales by payment method');
  });
});
