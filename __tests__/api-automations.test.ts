/**
 * Section 21 — Automations (Cron Jobs)
 * Tests: 21.1 – 21.29
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Helpers ─────────────────────────────────────────────────────────────────
const VALID_SECRET = 'test-cron-secret';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/automation-auth', () => ({
  verifyCronAuth: vi.fn().mockReturnValue(null), // null = authorized
}));
vi.mock('@/lib/automation-validation', () => ({
  validTenantId: vi.fn().mockImplementation((v: unknown) => v ?? undefined),
  positiveFloat: vi.fn().mockImplementation((_v: unknown, def: number) => def),
  positiveInt: vi.fn().mockImplementation((_v: unknown, def: number) => def),
}));
const _OK = { success: true, message: 'OK', processed: 1, failed: 0, errors: [] };
vi.mock('@/lib/automations', () => ({
  autoClockOutForgottenSessions: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  detectBreaks: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  detectAttendanceViolations: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  cleanupAuditLogs: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  createDatabaseBackup: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendBookingReminders: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  autoConfirmBookings: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  detectNoShows: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendAbandonedCartReminders: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  autoCloseCashDrawers: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendCashCountReminders: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  calculateCustomerLifetimeValue: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  archiveOldData: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  manageDiscountStatus: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendLowStockAlerts: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  applyDynamicPricing: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  analyzeProductPerformance: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  generatePurchaseOrders: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendSalesReport: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  detectSuspiciousActivity: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  expireInactiveSessions: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  predictStockNeeds: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  detectStockImbalances: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  syncMultiBranchData: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  syncOfflineTransactions: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendTransactionReceipt: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
  sendPendingReceipts: vi.fn().mockResolvedValue({ success: true, message: 'OK', processed: 1, failed: 0, errors: [] }),
}));
vi.mock('@/lib/stock', () => ({
  getLowStockProducts: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/models/Tenant', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(5) } }));
vi.mock('@/models/Booking', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(3) } }));
vi.mock('@/models/Discount', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(2) } }));
vi.mock('@/models/Attendance', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(1) } }));
vi.mock('@/models/CashDrawerSession', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(0) } }));
vi.mock('@/models/Transaction', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('@/models/Subscription', () => ({
  default: {
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
  },
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { verifyCronAuth } from '@/lib/automation-auth';
import {
  autoClockOutForgottenSessions, detectBreaks, detectAttendanceViolations,
  cleanupAuditLogs, createDatabaseBackup, sendBookingReminders, autoConfirmBookings,
  detectNoShows, sendAbandonedCartReminders, autoCloseCashDrawers, sendCashCountReminders,
  calculateCustomerLifetimeValue, archiveOldData, manageDiscountStatus, sendLowStockAlerts,
  applyDynamicPricing, analyzeProductPerformance, generatePurchaseOrders, sendSalesReport,
  detectSuspiciousActivity, expireInactiveSessions, predictStockNeeds, detectStockImbalances,
  syncMultiBranchData, syncOfflineTransactions, sendPendingReceipts,
} from '@/lib/automations';
import Subscription from '@/models/Subscription';

// ── Helpers ──────────────────────────────────────────────────────────────────
const post = (url: string, body: object = { secret: VALID_SECRET }) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const get = (url: string) =>
  new NextRequest(`http://localhost${url}?secret=${VALID_SECRET}`, { method: 'GET' });

const UNAUTH_RESPONSE = NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

// ── 21.1  /automations/status ─────────────────────────────────────────────
describe('/automations/status (21.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns status of all automations', async () => {
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(get('/api/automations/status'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('discounts');
    expect(body.data).toHaveProperty('attendance');
    expect(body.data).toHaveProperty('cashDrawer');
  });
});

// ── 21.2  /automations/attendance/auto-clockout ────────────────────────────
describe('/automations/attendance/auto-clockout (21.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clocks out unclosed sessions and returns success', async () => {
    const { POST } = await import('@/app/api/automations/attendance/auto-clockout/route');
    const res = await POST(post('/api/automations/attendance/auto-clockout'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(autoClockOutForgottenSessions)).toHaveBeenCalled();
  });
});

// ── 21.3  /automations/attendance/break-detection ─────────────────────────
describe('/automations/attendance/break-detection (21.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags untracked breaks and returns success', async () => {
    const { POST } = await import('@/app/api/automations/attendance/break-detection/route');
    const res = await POST(post('/api/automations/attendance/break-detection'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(detectBreaks)).toHaveBeenCalled();
  });
});

// ── 21.4  /automations/attendance/violations ──────────────────────────────
describe('/automations/attendance/violations (21.4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags attendance rule violations and returns success', async () => {
    const { POST } = await import('@/app/api/automations/attendance/violations/route');
    const res = await POST(post('/api/automations/attendance/violations'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(detectAttendanceViolations)).toHaveBeenCalled();
  });
});

// ── 21.5  /automations/audit-logs/cleanup ─────────────────────────────────
describe('/automations/audit-logs/cleanup (21.5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes logs older than retention window', async () => {
    const { POST } = await import('@/app/api/automations/audit-logs/cleanup/route');
    const res = await POST(post('/api/automations/audit-logs/cleanup'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(cleanupAuditLogs)).toHaveBeenCalled();
  });
});

// ── 21.6  /automations/backups/create ─────────────────────────────────────
describe('/automations/backups/create (21.6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates DB backup successfully', async () => {
    const { POST } = await import('@/app/api/automations/backups/create/route');
    const res = await POST(post('/api/automations/backups/create'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(createDatabaseBackup)).toHaveBeenCalled();
  });
});

// ── 21.7  /automations/booking-reminders ──────────────────────────────────
describe('/automations/booking-reminders (21.7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends upcoming booking reminders', async () => {
    const { POST } = await import('@/app/api/automations/booking-reminders/route');
    const res = await POST(post('/api/automations/booking-reminders'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendBookingReminders)).toHaveBeenCalled();
  });
});

// ── 21.8  /automations/bookings/confirm ───────────────────────────────────
describe('/automations/bookings/confirm (21.8)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-confirms pending bookings', async () => {
    const { POST } = await import('@/app/api/automations/bookings/confirm/route');
    const res = await POST(post('/api/automations/bookings/confirm'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(autoConfirmBookings)).toHaveBeenCalled();
  });
});

// ── 21.9  /automations/bookings/no-show ───────────────────────────────────
describe('/automations/bookings/no-show (21.9)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks missed bookings as no-show', async () => {
    const { POST } = await import('@/app/api/automations/bookings/no-show/route');
    const res = await POST(post('/api/automations/bookings/no-show'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(detectNoShows)).toHaveBeenCalled();
  });
});

// ── 21.10  /automations/carts/abandoned ───────────────────────────────────
describe('/automations/carts/abandoned (21.10)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends recovery messages for old carts', async () => {
    const { POST } = await import('@/app/api/automations/carts/abandoned/route');
    const res = await POST(post('/api/automations/carts/abandoned'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendAbandonedCartReminders)).toHaveBeenCalled();
  });
});

// ── 21.11  /automations/cash-drawer/auto-close ────────────────────────────
describe('/automations/cash-drawer/auto-close (21.11)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('closes open drawer sessions', async () => {
    const { POST } = await import('@/app/api/automations/cash-drawer/auto-close/route');
    const res = await POST(post('/api/automations/cash-drawer/auto-close'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(autoCloseCashDrawers)).toHaveBeenCalled();
  });
});

// ── 21.12  /automations/cash-drawer/reminders ─────────────────────────────
describe('/automations/cash-drawer/reminders (21.12)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends reconciliation reminders', async () => {
    const { POST } = await import('@/app/api/automations/cash-drawer/reminders/route');
    const res = await POST(post('/api/automations/cash-drawer/reminders'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendCashCountReminders)).toHaveBeenCalled();
  });
});

// ── 21.13  /automations/customers/lifetime-value ──────────────────────────
describe('/automations/customers/lifetime-value (21.13)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recalculates CLV for all customers', async () => {
    const { POST } = await import('@/app/api/automations/customers/lifetime-value/route');
    const res = await POST(post('/api/automations/customers/lifetime-value'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(calculateCustomerLifetimeValue)).toHaveBeenCalled();
  });
});

// ── 21.14  /automations/data/archive ──────────────────────────────────────
describe('/automations/data/archive (21.14)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives stale records', async () => {
    const { POST } = await import('@/app/api/automations/data/archive/route');
    const res = await POST(post('/api/automations/data/archive'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(archiveOldData)).toHaveBeenCalled();
  });
});

// ── 21.15  /automations/discounts/manage ──────────────────────────────────
describe('/automations/discounts/manage (21.15)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires outdated discounts', async () => {
    const { POST } = await import('@/app/api/automations/discounts/manage/route');
    const res = await POST(post('/api/automations/discounts/manage'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(manageDiscountStatus)).toHaveBeenCalled();
  });
});

// ── 21.16  /automations/low-stock-alerts ──────────────────────────────────
describe('/automations/low-stock-alerts (21.16)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends low-stock notifications', async () => {
    const { POST } = await import('@/app/api/automations/low-stock-alerts/route');
    const res = await POST(post('/api/automations/low-stock-alerts'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendLowStockAlerts)).toHaveBeenCalled();
  });
});

// ── 21.17  /automations/pricing/dynamic ───────────────────────────────────
describe('/automations/pricing/dynamic (21.17)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies dynamic pricing rules', async () => {
    const { POST } = await import('@/app/api/automations/pricing/dynamic/route');
    const res = await POST(post('/api/automations/pricing/dynamic'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(applyDynamicPricing)).toHaveBeenCalled();
  });
});

// ── 21.18  /automations/products/performance ──────────────────────────────
describe('/automations/products/performance (21.18)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recalculates product performance metrics', async () => {
    const { POST } = await import('@/app/api/automations/products/performance/route');
    const res = await POST(post('/api/automations/products/performance'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(analyzeProductPerformance)).toHaveBeenCalled();
  });
});

// ── 21.19  /automations/purchase-orders ───────────────────────────────────
describe('/automations/purchase-orders (21.19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates POs for low-stock items', async () => {
    const { POST } = await import('@/app/api/automations/purchase-orders/route');
    const res = await POST(post('/api/automations/purchase-orders'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(generatePurchaseOrders)).toHaveBeenCalled();
  });
});

// ── 21.20  /automations/reports/sales ─────────────────────────────────────
describe('/automations/reports/sales (21.20)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delivers scheduled sales reports', async () => {
    const { POST } = await import('@/app/api/automations/reports/sales/route');
    const res = await POST(post('/api/automations/reports/sales'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendSalesReport)).toHaveBeenCalled();
  });
});

// ── 21.21  /automations/security/suspicious-activity ──────────────────────
describe('/automations/security/suspicious-activity (21.21)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags anomalous activity', async () => {
    const { POST } = await import('@/app/api/automations/security/suspicious-activity/route');
    const res = await POST(post('/api/automations/security/suspicious-activity'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(detectSuspiciousActivity)).toHaveBeenCalled();
  });
});

// ── 21.22  /automations/sessions/expire ───────────────────────────────────
describe('/automations/sessions/expire (21.22)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears expired user sessions', async () => {
    const { POST } = await import('@/app/api/automations/sessions/expire/route');
    const res = await POST(post('/api/automations/sessions/expire'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(expireInactiveSessions)).toHaveBeenCalled();
  });
});

// ── 21.23  /automations/stock/predictive ──────────────────────────────────
describe('/automations/stock/predictive (21.23)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs stock forecasting model', async () => {
    const { POST } = await import('@/app/api/automations/stock/predictive/route');
    const res = await POST(post('/api/automations/stock/predictive'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(predictStockNeeds)).toHaveBeenCalled();
  });
});

// ── 21.24  /automations/stock/transfer ────────────────────────────────────
describe('/automations/stock/transfer (21.24)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes inter-branch stock transfers', async () => {
    const { POST } = await import('@/app/api/automations/stock/transfer/route');
    const res = await POST(post('/api/automations/stock/transfer'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(detectStockImbalances)).toHaveBeenCalled();
  });
});

// ── 21.25  /automations/subscriptions/expire ──────────────────────────────
describe('/automations/subscriptions/expire (21.25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Subscription.updateMany).mockResolvedValue({ modifiedCount: 2 } as any);
  });

  it('expires lapsed subscriptions via POST', async () => {
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await POST(post('/api/automations/subscriptions/expire'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.processed).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(Subscription.updateMany)).toHaveBeenCalled();
  });

  it('expires lapsed subscriptions via GET', async () => {
    const { GET } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await GET(get('/api/automations/subscriptions/expire'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── 21.26  /automations/sync/multi-branch ─────────────────────────────────
describe('/automations/sync/multi-branch (21.26)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('syncs data across branches', async () => {
    const { POST } = await import('@/app/api/automations/sync/multi-branch/route');
    const res = await POST(post('/api/automations/sync/multi-branch'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(syncMultiBranchData)).toHaveBeenCalled();
  });
});

// ── 21.27  /automations/sync/offline ──────────────────────────────────────
describe('/automations/sync/offline (21.27)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('syncs offline-collected data', async () => {
    const { POST } = await import('@/app/api/automations/sync/offline/route');
    const res = await POST(post('/api/automations/sync/offline'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(syncOfflineTransactions)).toHaveBeenCalled();
  });
});

// ── 21.28  /automations/transaction-receipts ──────────────────────────────
describe('/automations/transaction-receipts (21.28)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates pending receipts (batch mode)', async () => {
    const { POST } = await import('@/app/api/automations/transaction-receipts/route');
    const res = await POST(post('/api/automations/transaction-receipts'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendPendingReceipts)).toHaveBeenCalled();
  });
});

// ── 21.29  Unauthorized request returns 401 ────────────────────────────────
describe('Unauthorized request returns 401 (21.29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCronAuth).mockReturnValue(UNAUTH_RESPONSE);
  });

  it('returns 401 from /automations/attendance/auto-clockout with wrong token', async () => {
    const { POST } = await import('@/app/api/automations/attendance/auto-clockout/route');
    const res = await POST(post('/api/automations/attendance/auto-clockout', { secret: 'wrong' }));
    expect(res.status).toBe(401);
    expect(vi.mocked(autoClockOutForgottenSessions)).not.toHaveBeenCalled();
  });

  it('returns 401 from /automations/status with wrong token', async () => {
    const { GET } = await import('@/app/api/automations/status/route');
    const badReq = new NextRequest('http://localhost/api/automations/status?secret=wrong', { method: 'GET' });
    const res = await GET(badReq);
    expect(res.status).toBe(401);
  });

  it('returns 401 from /automations/subscriptions/expire with wrong token', async () => {
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await POST(post('/api/automations/subscriptions/expire', { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });
});
