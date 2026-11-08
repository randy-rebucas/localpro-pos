(process.env as Record<string, string>).JWT_SECRET = 'test-secret-for-crm-bookings-fixes-tests-32chars!!';
(process.env as Record<string, string>).NODE_ENV = 'test';
(process.env as Record<string, string>).MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 1, resetAfterMs: 0 }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { UPDATE: 'update', DELETE: 'delete', DISCOUNT_UPDATE: 'discount.update' },
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/subscription', () => ({ checkFeatureAccess: vi.fn().mockResolvedValue(undefined) }));

const TENANT = '507f1f77bcf86cd799439011';
const CUSTOMER = '507f1f77bcf86cd799439044';
const { tenantSettings } = vi.hoisted(() => ({ tenantSettings: { emailNotifications: true, smsNotifications: false, timezone: 'Asia/Manila' } }));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn().mockResolvedValue(tenantSettings) }));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('507f1f77bcf86cd799439011'),
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: '507f1f77bcf86cd799439011', user: { userId: 'u1', role: 'manager' } }),
}));
const mockCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => mockCurrentUser(...a) }));

const mockCancel = vi.fn().mockResolvedValue({ email: true, sms: false });
vi.mock('@/lib/notifications', () => ({
  sendBookingCancellation: (...a: unknown[]) => mockCancel(...a),
  sendBookingConfirmation: vi.fn(),
  sendBookingReminder: vi.fn(),
}));

const mockBookingFindOne = vi.fn();
vi.mock('@/models/Booking', () => ({ default: { findOne: (...a: unknown[]) => mockBookingFindOne(...a) } }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/lib/booking-scheduling-access', () => ({ requireBookingSchedulingAccess: vi.fn().mockResolvedValue(undefined) }));

const mockDiscountFindOne = vi.fn();
vi.mock('@/models/Discount', () => ({ default: { findOne: (...a: unknown[]) => mockDiscountFindOne(...a) } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) } }));

const mockCustomerUpdate = vi.fn();
vi.mock('@/models/Customer', () => ({ default: { findOneAndUpdate: (...a: unknown[]) => mockCustomerUpdate(...a) } }));
const mockLoyaltyCreate = vi.fn();
vi.mock('@/models/LoyaltyTransaction', () => ({ default: { create: (...a: unknown[]) => mockLoyaltyCreate(...a) } }));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  const session = { startTransaction: vi.fn(), commitTransaction: vi.fn(), abortTransaction: vi.fn(), endSession: vi.fn() };
  const patched = { ...actual.default, startSession: vi.fn().mockResolvedValue(session) };
  return { ...actual, default: patched, startSession: patched.startSession };
});

import { classifyCustomerSegment, isInSegment } from '@/lib/crm-segments';
import { DELETE as cancelBooking } from '@/app/api/bookings/[id]/route';
import { PUT as putDiscount } from '@/app/api/discounts/[id]/route';
import { POST as adjustLoyalty } from '@/app/api/loyalty/adjust/route';

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('emailHtmlBody', () => {
  it('escapes plain-text messages (campaign bodies, customer names)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/notifications')>('@/lib/notifications');
    expect(actual.emailHtmlBody({ message: 'Hi <a href=//evil>Verify</a>\nThanks' })).toBe('Hi &lt;a href=//evil&gt;Verify&lt;/a&gt;<br>Thanks');
    expect(actual.emailHtmlBody({ message: '<p>Report</p>', html: true })).toBe('<p>Report</p>');
  });
});

describe('classifyCustomerSegment', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  it('puts each customer in exactly one segment, in order', () => {
    expect(classifyCustomerSegment({}, undefined, now)).toBe('prospect');
    // 1 order, 100 days ago: lapsed, not new
    expect(classifyCustomerSegment({ lastPurchaseDate: daysAgo(100) }, { orderCount: 1, totalSpent: 50 }, now)).toBe('lapsed');
    expect(classifyCustomerSegment({ lastPurchaseDate: daysAgo(40) }, { orderCount: 2, totalSpent: 50 }, now)).toBe('at_risk');
    expect(classifyCustomerSegment({ lastPurchaseDate: daysAgo(1) }, { orderCount: 3, totalSpent: 6000 }, now)).toBe('vip');
    expect(classifyCustomerSegment({ lastPurchaseDate: daysAgo(1) }, { orderCount: 1, totalSpent: 10 }, now)).toBe('new');
    expect(classifyCustomerSegment({ lastPurchaseDate: daysAgo(1) }, { orderCount: 5, totalSpent: 100 }, now)).toBe('regular');
  });

  it('a prospect with imported points is not VIP', () => {
    expect(isInSegment('vip', { loyaltyPointsBalance: 900 }, undefined, now)).toBe(false);
    expect(isInSegment('all', { loyaltyPointsBalance: 900 }, undefined, now)).toBe(true);
  });
});

describe('DELETE /api/bookings/[id] (cancel)', () => {
  const params = { params: Promise.resolve({ id: 'b1' }) };
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: TENANT });
  });

  it("passes the store's settings so the customer is actually notified", async () => {
    const booking = { status: 'confirmed', customerName: 'Ana', serviceName: 'Cut', save: vi.fn().mockResolvedValue(undefined) };
    mockBookingFindOne.mockResolvedValue(booking);
    const res = await cancelBooking(new NextRequest('http://x/api/bookings/b1', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(mockCancel).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Ana' }), tenantSettings);
    expect(booking).toMatchObject({ status: 'cancelled' });
  });

  it('refuses cancelling a completed booking', async () => {
    mockBookingFindOne.mockResolvedValue({ status: 'completed', save: vi.fn() });
    const res = await cancelBooking(new NextRequest('http://x/api/bookings/b1', { method: 'DELETE' }), params);
    expect(res.status).toBe(400);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('PUT /api/discounts/[id]', () => {
  const params = { params: Promise.resolve({ id: 'd1' }) };
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: TENANT });
  });

  it('applies a type change and checks the value against the new type', async () => {
    const discount = { code: 'X', type: 'fixed', value: 50, save: vi.fn().mockResolvedValue(undefined) };
    mockDiscountFindOne.mockResolvedValue(discount);
    const res = await putDiscount(json('http://x/api/discounts/d1', 'PUT', { type: 'percentage', value: 50 }), params);
    expect(res.status).toBe(200);
    expect(discount).toMatchObject({ type: 'percentage', value: 50 });
  });

  it('lets a 10% discount become a fixed 500', async () => {
    const discount = { code: 'X', type: 'percentage', value: 10, save: vi.fn().mockResolvedValue(undefined) };
    mockDiscountFindOne.mockResolvedValue(discount);
    const res = await putDiscount(json('http://x/api/discounts/d1', 'PUT', { type: 'fixed', value: 500 }), params);
    expect(res.status).toBe(200);
    expect(discount).toMatchObject({ type: 'fixed', value: 500 });
  });
});

describe('POST /api/loyalty/adjust', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: TENANT });
    mockLoyaltyCreate.mockResolvedValue([{ _id: { toString: () => 'l1' } }]);
  });

  it('updates atomically and ledgers what was actually deducted', async () => {
    mockCustomerUpdate.mockReturnValue({ lean: () => Promise.resolve({ _id: CUSTOMER, loyaltyPointsBalance: 100 }) });
    const res = await adjustLoyalty(json('http://x/api/loyalty/adjust', 'POST', { customerId: CUSTOMER, points: -500, description: 'Fix' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    // pipeline update, not read-then-save
    expect(Array.isArray(mockCustomerUpdate.mock.calls[0][1])).toBe(true);
    expect(mockLoyaltyCreate.mock.calls[0][0][0]).toMatchObject({ points: -100, balanceBefore: 100, balanceAfter: 0 });
    expect(body.data.pointsAdjusted).toBe(-100);
  });

  it('refuses fractional points', async () => {
    const res = await adjustLoyalty(json('http://x/api/loyalty/adjust', 'POST', { customerId: CUSTOMER, points: 1.5, description: 'Fix' }));
    expect(res.status).toBe(400);
  });
});
