(process.env as Record<string, string>).JWT_SECRET = 'test-secret-for-adjust-billing-date-tests-32chars!!';
(process.env as Record<string, string>).NODE_ENV = 'test';
(process.env as Record<string, string>).MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const TENANT = '507f1f77bcf86cd799439011';
const SUB = '507f1f77bcf86cd799439022';
const ADMIN = '507f1f77bcf86cd799439033';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn().mockResolvedValue({ userId: '507f1f77bcf86cd799439033', role: 'super_admin' }) }));
const mockAudit = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', () => ({ createAuditLog: (...a: unknown[]) => mockAudit(...a) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const mockNotify = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/automations/subscription-billing', () => ({
  notifyTenant: (...a: unknown[]) => mockNotify(...a),
  DEACTIVATION_BUFFER_DAYS: 3,
}));

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: () => ({ select: () => ({ lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', slug: 'shop', name: 'Shop' }) }) }),
    findByIdAndUpdate: vi.fn(),
  },
}));
const mockSubFindOne = vi.fn();
vi.mock('@/models/Subscription', () => ({
  default: {
    findOne: (...a: unknown[]) => mockSubFindOne(...a),
    findById: () => ({ populate: () => ({ lean: vi.fn().mockResolvedValue({ _id: 'updated' }) }) }),
  },
}));
vi.mock('@/models/SubscriptionPlan', () => ({ default: { findById: vi.fn() } }));
const mockEventCreate = vi.fn().mockResolvedValue([]);
vi.mock('@/models/BillingEvent', () => ({ default: { create: (...a: unknown[]) => mockEventCreate(...a), findOne: vi.fn() } }));
vi.mock('@/models/SuperAdminAction', () => ({ default: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  const session = { startTransaction: vi.fn(), commitTransaction: vi.fn(), abortTransaction: vi.fn(), endSession: vi.fn() };
  const patched = { ...actual.default, startSession: vi.fn().mockResolvedValue(session) };
  return { ...actual, default: patched, startSession: patched.startSession };
});

import { PUT } from '@/app/api/super-admin/subscriptions/[tenantSlug]/route';

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    _id: SUB,
    tenantId: TENANT,
    status: 'active',
    paymentOverdue: false,
    nextBillingDate: new Date(Date.now() + 5 * DAY),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/super-admin/subscriptions/shop', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ tenantSlug: 'shop' }) }
  );

describe('PUT /api/super-admin/subscriptions/[tenantSlug] — adjust-billing-date', () => {
  beforeEach(() => {
    mockSubFindOne.mockReset();
    mockEventCreate.mockClear();
    mockAudit.mockClear();
    mockNotify.mockReset().mockResolvedValue(undefined);
  });

  it('moves nextBillingDate and records a manual_adjustment billing event', async () => {
    const sub = makeSub();
    const previous = sub.nextBillingDate;
    mockSubFindOne.mockResolvedValue(sub);

    const res = await put({ action: 'adjust-billing-date', nextBillingDate: iso(20), reason: 'Align with payroll' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(sub.nextBillingDate.toISOString().slice(0, 10)).toBe(iso(20));
    expect(sub.save).toHaveBeenCalledTimes(1);

    const [[events]] = mockEventCreate.mock.calls;
    expect(events[0]).toMatchObject({
      tenantId: TENANT,
      type: 'manual_adjustment',
      amount: 0,
      notes: 'Align with payroll',
      recordedBy: ADMIN,
      metadata: { field: 'nextBillingDate', from: previous },
    });
    expect(mockAudit.mock.calls[0][1]).toMatchObject({ action: 'subscription.adjust_billing_date', tenantId: TENANT });

    expect(mockNotify).toHaveBeenCalledWith(TENANT, 'Shop', 'email_billing_date_changed', {
      previousDate: previous.toDateString(),
      nextBillingDate: sub.nextBillingDate.toDateString(),
    });
  });

  it('skips the email when notifyTenant is false', async () => {
    mockSubFindOne.mockResolvedValue(makeSub());
    const res = await put({ action: 'adjust-billing-date', nextBillingDate: iso(20), notifyTenant: false });
    expect(res.status).toBe(200);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('still succeeds when the email fails', async () => {
    const sub = makeSub();
    mockSubFindOne.mockResolvedValue(sub);
    mockNotify.mockRejectedValue(new Error('SMTP down'));
    const res = await put({ action: 'adjust-billing-date', nextBillingDate: iso(20) });
    expect(res.status).toBe(200);
    expect(sub.save).toHaveBeenCalled();
  });

  it('works on a paused subscription', async () => {
    mockSubFindOne.mockResolvedValue(makeSub({ status: 'paused' }));
    const res = await put({ action: 'adjust-billing-date', nextBillingDate: iso(10) });
    expect(res.status).toBe(200);
  });

  it.each([
    ['missing date', {}, makeSub(), /required/],
    ['invalid date', { nextBillingDate: 'not-a-date' }, makeSub(), /Invalid/],
    ['date in the past', { nextBillingDate: iso(-1) }, makeSub(), /future/],
    ['date > 2 years ahead', { nextBillingDate: iso(800) }, makeSub(), /2 years/],
    ['trial subscription', { nextBillingDate: iso(10) }, makeSub({ status: 'trial' }), /active or paused/],
    ['cancelled subscription', { nextBillingDate: iso(10) }, makeSub({ status: 'cancelled' }), /active or paused/],
    ['overdue payment', { nextBillingDate: iso(10) }, makeSub({ paymentOverdue: true }), /overdue/],
  ])('rejects %s with 400 and writes nothing', async (_label, extra, sub, msg) => {
    mockSubFindOne.mockResolvedValue(sub);
    const res = await put({ action: 'adjust-billing-date', ...extra });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(msg);
    expect(sub.save).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });
});

describe('PUT /api/super-admin/subscriptions/[tenantSlug] — extend-grace', () => {
  const overdue = (overrides: Record<string, unknown> = {}) =>
    makeSub({
      paymentOverdue: true,
      nextBillingDate: new Date(Date.now() - 5 * DAY),
      gracePeriodEndDate: new Date(Date.now() + 2 * DAY),
      ...overrides,
    });

  beforeEach(() => {
    mockSubFindOne.mockReset();
    mockEventCreate.mockClear();
    mockAudit.mockClear();
    mockNotify.mockReset().mockResolvedValue(undefined);
  });

  it('moves gracePeriodEndDate, logs the reason and emails the deactivation date', async () => {
    const sub = overdue();
    const previous = sub.gracePeriodEndDate;
    const dueDate = sub.nextBillingDate;
    mockSubFindOne.mockResolvedValue(sub);

    const res = await put({ action: 'extend-grace', gracePeriodEndDate: iso(14), reason: 'Promised payment on the 20th' });
    expect(res.status).toBe(200);

    expect((sub.gracePeriodEndDate as Date).toISOString().slice(0, 10)).toBe(iso(14));
    expect(sub.nextBillingDate).toBe(dueDate); // fee clock untouched
    expect(sub.paymentOverdue).toBe(true);

    const [[events]] = mockEventCreate.mock.calls;
    expect(events[0]).toMatchObject({
      type: 'manual_adjustment',
      notes: 'Promised payment on the 20th',
      metadata: { field: 'gracePeriodEndDate', from: previous },
    });
    expect(mockAudit.mock.calls[0][1]).toMatchObject({ action: 'subscription.extend_grace' });

    const grace = sub.gracePeriodEndDate as Date;
    expect(mockNotify).toHaveBeenCalledWith(TENANT, 'Shop', 'email_grace_period_extended', {
      dueDate: dueDate.toDateString(),
      gracePeriodEndDate: grace.toDateString(),
      deactivationDate: new Date(grace.getTime() + 3 * DAY).toDateString(),
    });
  });

  it.each([
    ['not overdue', { gracePeriodEndDate: iso(14), reason: 'x' }, () => makeSub(), /overdue/],
    ['already deactivated', { gracePeriodEndDate: iso(14), reason: 'x' }, () => overdue({ deactivatedAt: new Date() }), /deactivated/],
    ['suspended', { gracePeriodEndDate: iso(14), reason: 'x' }, () => overdue({ status: 'suspended' }), /active subscription/],
    ['missing reason', { gracePeriodEndDate: iso(14), reason: '  ' }, () => overdue(), /reason is required/],
    ['missing date', { reason: 'x' }, () => overdue(), /required/],
    ['date in the past', { gracePeriodEndDate: iso(-1), reason: 'x' }, () => overdue(), /future/],
    ['not later than current grace end', { gracePeriodEndDate: iso(1), reason: 'x' }, () => overdue({ gracePeriodEndDate: new Date(Date.now() + 5 * DAY) }), /later than/],
    ['more than 60 days ahead', { gracePeriodEndDate: iso(61), reason: 'x' }, () => overdue(), /60 days/],
  ])('rejects %s with 400 and writes nothing', async (_label, extra, build, msg) => {
    const sub = build();
    mockSubFindOne.mockResolvedValue(sub);
    const res = await put({ action: 'extend-grace', ...extra });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(msg);
    expect(sub.save).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
