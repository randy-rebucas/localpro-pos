/**
 * Tests for automation routes that follow the standard pattern:
 *   verifyCronAuth → call lib function → return result
 *
 * Routes covered (GET + POST for each):
 *   booking-reminders, bookings/confirm, bookings/no-show,
 *   discounts/manage, low-stock-alerts, sessions/expire,
 *   transaction-receipts, reports/sales,
 *   attendance/auto-clockout, attendance/break-detection, attendance/violations,
 *   cash-drawer/auto-close, cash-drawer/reminders,
 *   analytics/sales-trends, carts/abandoned, customers/lifetime-value,
 *   data/archive, pricing/dynamic, products/performance, purchase-orders,
 *   security/suspicious-activity, stock/predictive, stock/transfer,
 *   sync/offline, audit-logs/cleanup, backups/create
 */
import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockVerifyCronAuth = vi.hoisted(() => vi.fn().mockReturnValue(null)); // null = authorized
const mockHandleApiError = vi.hoisted(() =>
  vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false }), { status: 500, headers: { 'content-type': 'application/json' } })
  )
);

// @/lib/automations barrel mocks (implementations set below after vi.mock calls)
const mockSendBookingReminders = vi.hoisted(() => vi.fn());
const mockAutoConfirmBookings = vi.hoisted(() => vi.fn());
const mockDetectNoShows = vi.hoisted(() => vi.fn());
const mockManageDiscountStatus = vi.hoisted(() => vi.fn());
const mockSendLowStockAlerts = vi.hoisted(() => vi.fn());
const mockExpireInactiveSessions = vi.hoisted(() => vi.fn());
const mockSendTransactionReceipt = vi.hoisted(() => vi.fn());
const mockSendPendingReceipts = vi.hoisted(() => vi.fn());
const mockSendSalesReport = vi.hoisted(() => vi.fn());
const mockAutoClockOutForgottenSessions = vi.hoisted(() => vi.fn());
const mockDetectBreaks = vi.hoisted(() => vi.fn());
const mockDetectAttendanceViolations = vi.hoisted(() => vi.fn());
const mockAutoCloseCashDrawers = vi.hoisted(() => vi.fn());
const mockSendCashCountReminders = vi.hoisted(() => vi.fn());
const mockAnalyzeSalesTrends = vi.hoisted(() => vi.fn());
const mockSendAbandonedCartReminders = vi.hoisted(() => vi.fn());
const mockCalculateCustomerLifetimeValue = vi.hoisted(() => vi.fn());
const mockArchiveOldData = vi.hoisted(() => vi.fn());
const mockApplyDynamicPricing = vi.hoisted(() => vi.fn());
const mockAnalyzeProductPerformance = vi.hoisted(() => vi.fn());
const mockGeneratePurchaseOrders = vi.hoisted(() => vi.fn());
const mockDetectSuspiciousActivity = vi.hoisted(() => vi.fn());
const mockPredictStockNeeds = vi.hoisted(() => vi.fn());
const mockDetectStockImbalances = vi.hoisted(() => vi.fn());
const mockSyncOfflineTransactions = vi.hoisted(() => vi.fn());
const mockCleanupAuditLogs = vi.hoisted(() => vi.fn());
const mockCreateDatabaseBackup = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/automation-auth', () => ({ verifyCronAuth: mockVerifyCronAuth }));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/automation-validation', () => ({
  positiveFloat: vi.fn((v: any, def: number) => (v != null && !isNaN(Number(v)) ? Number(v) : def)),
  positiveInt: vi.fn((v: any, def: number) => (v != null && !isNaN(Number(v)) ? Number(v) : def)),
  validTenantId: vi.fn((v: any) => v || undefined),
}));
vi.mock('@/lib/automations', () => ({
  sendBookingReminders: mockSendBookingReminders,
  autoConfirmBookings: mockAutoConfirmBookings,
  detectNoShows: mockDetectNoShows,
  manageDiscountStatus: mockManageDiscountStatus,
  sendLowStockAlerts: mockSendLowStockAlerts,
  expireInactiveSessions: mockExpireInactiveSessions,
  sendTransactionReceipt: mockSendTransactionReceipt,
  sendPendingReceipts: mockSendPendingReceipts,
  sendSalesReport: mockSendSalesReport,
  autoClockOutForgottenSessions: mockAutoClockOutForgottenSessions,
  detectBreaks: mockDetectBreaks,
  detectAttendanceViolations: mockDetectAttendanceViolations,
  autoCloseCashDrawers: mockAutoCloseCashDrawers,
  sendCashCountReminders: mockSendCashCountReminders,
  analyzeSalesTrends: mockAnalyzeSalesTrends,
  sendAbandonedCartReminders: mockSendAbandonedCartReminders,
  calculateCustomerLifetimeValue: mockCalculateCustomerLifetimeValue,
  archiveOldData: mockArchiveOldData,
  applyDynamicPricing: mockApplyDynamicPricing,
  analyzeProductPerformance: mockAnalyzeProductPerformance,
  generatePurchaseOrders: mockGeneratePurchaseOrders,
  detectSuspiciousActivity: mockDetectSuspiciousActivity,
  predictStockNeeds: mockPredictStockNeeds,
  detectStockImbalances: mockDetectStockImbalances,
  syncOfflineTransactions: mockSyncOfflineTransactions,
  cleanupAuditLogs: mockCleanupAuditLogs,
  createDatabaseBackup: mockCreateDatabaseBackup,
}));

// ── Default mock implementations (set after vi.mock calls, before tests) ──────
// vi.clearAllMocks() only clears calls/results, not implementations, so these persist.
const STD_RESULT = { success: true, message: 'Done', processed: 1, failed: 0, errors: [] };
mockSendBookingReminders.mockResolvedValue(STD_RESULT);
mockAutoConfirmBookings.mockResolvedValue(STD_RESULT);
mockDetectNoShows.mockResolvedValue(STD_RESULT);
mockManageDiscountStatus.mockResolvedValue(STD_RESULT);
mockSendLowStockAlerts.mockResolvedValue(STD_RESULT);
mockExpireInactiveSessions.mockResolvedValue(STD_RESULT);
mockSendTransactionReceipt.mockResolvedValue(STD_RESULT);
mockSendPendingReceipts.mockResolvedValue(STD_RESULT);
mockSendSalesReport.mockResolvedValue(STD_RESULT);
mockAutoClockOutForgottenSessions.mockResolvedValue(STD_RESULT);
mockDetectBreaks.mockResolvedValue(STD_RESULT);
mockDetectAttendanceViolations.mockResolvedValue(STD_RESULT);
mockAutoCloseCashDrawers.mockResolvedValue(STD_RESULT);
mockSendCashCountReminders.mockResolvedValue(STD_RESULT);
mockAnalyzeSalesTrends.mockResolvedValue(STD_RESULT);
mockSendAbandonedCartReminders.mockResolvedValue(STD_RESULT);
mockCalculateCustomerLifetimeValue.mockResolvedValue(STD_RESULT);
mockArchiveOldData.mockResolvedValue(STD_RESULT);
mockApplyDynamicPricing.mockResolvedValue(STD_RESULT);
mockAnalyzeProductPerformance.mockResolvedValue(STD_RESULT);
mockGeneratePurchaseOrders.mockResolvedValue(STD_RESULT);
mockDetectSuspiciousActivity.mockResolvedValue(STD_RESULT);
mockPredictStockNeeds.mockResolvedValue(STD_RESULT);
mockDetectStockImbalances.mockResolvedValue(STD_RESULT);
mockSyncOfflineTransactions.mockResolvedValue(STD_RESULT);
mockCleanupAuditLogs.mockResolvedValue(STD_RESULT);
mockCreateDatabaseBackup.mockResolvedValue(STD_RESULT);

// ── Helpers ───────────────────────────────────────────────────────────────────
function makePost(url: string, body: Record<string, any> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function deniedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// ── Booking Reminders ─────────────────────────────────────────────────────────
describe('booking-reminders', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls sendBookingReminders with body params', async () => {
    const { POST } = await import('@/app/api/automations/booking-reminders/route');
    const res = await POST(makePost('http://localhost/api/automations/booking-reminders', { tenantId: 'tid', hoursBefore: 48 }));
    expect(res.status).toBe(200);
    expect(mockSendBookingReminders).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', hoursBefore: 48 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/booking-reminders/route');
    const res = await POST(makePost('http://localhost/api/automations/booking-reminders'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls sendBookingReminders', async () => {
    const { GET } = await import('@/app/api/automations/booking-reminders/route');
    const res = await GET(makeGet('http://localhost/api/automations/booking-reminders?tenantId=tid&hoursBefore=12'));
    expect(res.status).toBe(200);
    expect(mockSendBookingReminders).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', hoursBefore: 12 }));
  });
});

// ── Bookings Confirm ──────────────────────────────────────────────────────────
describe('bookings/confirm', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls autoConfirmBookings', async () => {
    const { POST } = await import('@/app/api/automations/bookings/confirm/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', bookingId: 'bid' }));
    expect(res.status).toBe(200);
    expect(mockAutoConfirmBookings).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', bookingId: 'bid' }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/bookings/confirm/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes query params', async () => {
    const { GET } = await import('@/app/api/automations/bookings/confirm/route');
    const res = await GET(makeGet('http://localhost?tenantId=tid&bookingId=bid'));
    expect(res.status).toBe(200);
    expect(mockAutoConfirmBookings).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', bookingId: 'bid' }));
  });
});

// ── Bookings No-Show ──────────────────────────────────────────────────────────
describe('bookings/no-show', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls detectNoShows', async () => {
    const { POST } = await import('@/app/api/automations/bookings/no-show/route');
    const res = await POST(makePost('http://localhost', { gracePeriodMinutes: 15 }));
    expect(res.status).toBe(200);
    expect(mockDetectNoShows).toHaveBeenCalledWith(expect.objectContaining({ gracePeriodMinutes: 15 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/bookings/no-show/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes gracePeriodMinutes from query', async () => {
    const { GET } = await import('@/app/api/automations/bookings/no-show/route');
    const res = await GET(makeGet('http://localhost?gracePeriodMinutes=30'));
    expect(res.status).toBe(200);
    expect(mockDetectNoShows).toHaveBeenCalledWith(expect.objectContaining({ gracePeriodMinutes: 30 }));
  });
});

// ── Discounts Manage ──────────────────────────────────────────────────────────
describe('discounts/manage', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls manageDiscountStatus', async () => {
    const { POST } = await import('@/app/api/automations/discounts/manage/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid' }));
    expect(res.status).toBe(200);
    expect(mockManageDiscountStatus).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid' }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/discounts/manage/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls manageDiscountStatus', async () => {
    const { GET } = await import('@/app/api/automations/discounts/manage/route');
    const res = await GET(makeGet('http://localhost?tenantId=tid'));
    expect(res.status).toBe(200);
    expect(mockManageDiscountStatus).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid' }));
  });
});

// ── Low Stock Alerts ──────────────────────────────────────────────────────────
describe('low-stock-alerts', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls sendLowStockAlerts with threshold', async () => {
    const { POST } = await import('@/app/api/automations/low-stock-alerts/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', threshold: 5 }));
    expect(res.status).toBe(200);
    expect(mockSendLowStockAlerts).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', threshold: 5 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/low-stock-alerts/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes threshold from query', async () => {
    const { GET } = await import('@/app/api/automations/low-stock-alerts/route');
    const res = await GET(makeGet('http://localhost?threshold=10'));
    expect(res.status).toBe(200);
    expect(mockSendLowStockAlerts).toHaveBeenCalledWith(expect.objectContaining({ threshold: 10 }));
  });
});

// ── Sessions Expire ───────────────────────────────────────────────────────────
describe('sessions/expire', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls expireInactiveSessions', async () => {
    const { POST } = await import('@/app/api/automations/sessions/expire/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', inactivityHours: 48 }));
    expect(res.status).toBe(200);
    expect(mockExpireInactiveSessions).toHaveBeenCalled();
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/sessions/expire/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls expireInactiveSessions', async () => {
    const { GET } = await import('@/app/api/automations/sessions/expire/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockExpireInactiveSessions).toHaveBeenCalled();
  });
});

// ── Transaction Receipts ──────────────────────────────────────────────────────
describe('transaction-receipts', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — sends specific receipt when transactionId provided', async () => {
    const { POST } = await import('@/app/api/automations/transaction-receipts/route');
    const res = await POST(makePost('http://localhost', { transactionId: 'txn-1', customerEmail: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(mockSendTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'txn-1' }));
    expect(mockSendPendingReceipts).not.toHaveBeenCalled();
  });

  it('POST 200 — sends pending receipts when no transactionId', async () => {
    const { POST } = await import('@/app/api/automations/transaction-receipts/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', hoursAgo: 12 }));
    expect(res.status).toBe(200);
    expect(mockSendPendingReceipts).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', hoursAgo: 12 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/transaction-receipts/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — routes by transactionId presence', async () => {
    const { GET } = await import('@/app/api/automations/transaction-receipts/route');
    const res = await GET(makeGet('http://localhost?transactionId=txn-1'));
    expect(res.status).toBe(200);
    expect(mockSendTransactionReceipt).toHaveBeenCalled();
  });
});

// ── Reports / Sales ───────────────────────────────────────────────────────────
describe('reports/sales', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls sendSalesReport with period', async () => {
    const { POST } = await import('@/app/api/automations/reports/sales/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', period: 'weekly' }));
    expect(res.status).toBe(200);
    expect(mockSendSalesReport).toHaveBeenCalledWith(expect.objectContaining({ period: 'weekly' }));
  });

  it('POST 200 — defaults period to daily', async () => {
    const { POST } = await import('@/app/api/automations/reports/sales/route');
    await POST(makePost('http://localhost', {}));
    expect(mockSendSalesReport).toHaveBeenCalledWith(expect.objectContaining({ period: 'daily' }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/reports/sales/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes period from query', async () => {
    const { GET } = await import('@/app/api/automations/reports/sales/route');
    const res = await GET(makeGet('http://localhost?period=monthly'));
    expect(res.status).toBe(200);
    expect(mockSendSalesReport).toHaveBeenCalledWith(expect.objectContaining({ period: 'monthly' }));
  });
});

// ── Attendance Auto-Clockout ──────────────────────────────────────────────────
describe('attendance/auto-clockout', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls autoClockOutForgottenSessions', async () => {
    const { POST } = await import('@/app/api/automations/attendance/auto-clockout/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', gracePeriodHours: 10 }));
    expect(res.status).toBe(200);
    expect(mockAutoClockOutForgottenSessions).toHaveBeenCalled();
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/attendance/auto-clockout/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls autoClockOutForgottenSessions', async () => {
    const { GET } = await import('@/app/api/automations/attendance/auto-clockout/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockAutoClockOutForgottenSessions).toHaveBeenCalled();
  });
});

// ── Attendance Break Detection ────────────────────────────────────────────────
describe('attendance/break-detection', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls detectBreaks', async () => {
    const { POST } = await import('@/app/api/automations/attendance/break-detection/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', inactivityMinutes: 15 }));
    expect(res.status).toBe(200);
    expect(mockDetectBreaks).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tid', inactivityMinutes: 15 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/attendance/break-detection/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes inactivityMinutes from query', async () => {
    const { GET } = await import('@/app/api/automations/attendance/break-detection/route');
    const res = await GET(makeGet('http://localhost?inactivityMinutes=20'));
    expect(res.status).toBe(200);
    expect(mockDetectBreaks).toHaveBeenCalledWith(expect.objectContaining({ inactivityMinutes: 20 }));
  });
});

// ── Attendance Violations ─────────────────────────────────────────────────────
describe('attendance/violations', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls detectAttendanceViolations', async () => {
    const { POST } = await import('@/app/api/automations/attendance/violations/route');
    const res = await POST(makePost('http://localhost', { lateThresholdMinutes: 10 }));
    expect(res.status).toBe(200);
    expect(mockDetectAttendanceViolations).toHaveBeenCalledWith(
      expect.objectContaining({ lateThresholdMinutes: 10 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/attendance/violations/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes lateThresholdMinutes from query', async () => {
    const { GET } = await import('@/app/api/automations/attendance/violations/route');
    const res = await GET(makeGet('http://localhost?lateThresholdMinutes=5'));
    expect(res.status).toBe(200);
    expect(mockDetectAttendanceViolations).toHaveBeenCalledWith(
      expect.objectContaining({ lateThresholdMinutes: 5 })
    );
  });
});

// ── Cash Drawer Auto-Close ────────────────────────────────────────────────────
describe('cash-drawer/auto-close', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls autoCloseCashDrawers', async () => {
    const { POST } = await import('@/app/api/automations/cash-drawer/auto-close/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', forceClose: true }));
    expect(res.status).toBe(200);
    expect(mockAutoCloseCashDrawers).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tid', forceClose: true })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/cash-drawer/auto-close/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — parses forceClose=true from query', async () => {
    const { GET } = await import('@/app/api/automations/cash-drawer/auto-close/route');
    const res = await GET(makeGet('http://localhost?forceClose=true'));
    expect(res.status).toBe(200);
    expect(mockAutoCloseCashDrawers).toHaveBeenCalledWith(
      expect.objectContaining({ forceClose: true })
    );
  });
});

// ── Cash Drawer Reminders ─────────────────────────────────────────────────────
describe('cash-drawer/reminders', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls sendCashCountReminders', async () => {
    const { POST } = await import('@/app/api/automations/cash-drawer/reminders/route');
    const res = await POST(makePost('http://localhost', { reminderMinutesBefore: 30 }));
    expect(res.status).toBe(200);
    expect(mockSendCashCountReminders).toHaveBeenCalledWith(
      expect.objectContaining({ reminderMinutesBefore: 30 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/cash-drawer/reminders/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes reminderMinutesBefore from query', async () => {
    const { GET } = await import('@/app/api/automations/cash-drawer/reminders/route');
    const res = await GET(makeGet('http://localhost?reminderMinutesBefore=15'));
    expect(res.status).toBe(200);
    expect(mockSendCashCountReminders).toHaveBeenCalledWith(
      expect.objectContaining({ reminderMinutesBefore: 15 })
    );
  });
});

// ── Analytics / Sales Trends ──────────────────────────────────────────────────
describe('analytics/sales-trends', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls analyzeSalesTrends', async () => {
    const { POST } = await import('@/app/api/automations/analytics/sales-trends/route');
    const res = await POST(makePost('http://localhost', { period: 'weekly', comparePeriods: 3 }));
    expect(res.status).toBe(200);
    expect(mockAnalyzeSalesTrends).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'weekly', comparePeriods: 3 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/analytics/sales-trends/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls analyzeSalesTrends', async () => {
    const { GET } = await import('@/app/api/automations/analytics/sales-trends/route');
    const res = await GET(makeGet('http://localhost?period=daily'));
    expect(res.status).toBe(200);
    expect(mockAnalyzeSalesTrends).toHaveBeenCalled();
  });
});

// ── Carts / Abandoned ─────────────────────────────────────────────────────────
describe('carts/abandoned', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls sendAbandonedCartReminders', async () => {
    const { POST } = await import('@/app/api/automations/carts/abandoned/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', hoursAgo: 6 }));
    expect(res.status).toBe(200);
    expect(mockSendAbandonedCartReminders).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tid', hoursAgo: 6 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/carts/abandoned/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes hoursAgo from query', async () => {
    const { GET } = await import('@/app/api/automations/carts/abandoned/route');
    const res = await GET(makeGet('http://localhost?hoursAgo=8'));
    expect(res.status).toBe(200);
    expect(mockSendAbandonedCartReminders).toHaveBeenCalledWith(
      expect.objectContaining({ hoursAgo: 8 })
    );
  });
});

// ── Customers / Lifetime Value ────────────────────────────────────────────────
describe('customers/lifetime-value', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls calculateCustomerLifetimeValue', async () => {
    const { POST } = await import('@/app/api/automations/customers/lifetime-value/route');
    const res = await POST(makePost('http://localhost', { updateCustomers: true }));
    expect(res.status).toBe(200);
    expect(mockCalculateCustomerLifetimeValue).toHaveBeenCalledWith(
      expect.objectContaining({ updateCustomers: true })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/customers/lifetime-value/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls calculateCustomerLifetimeValue', async () => {
    const { GET } = await import('@/app/api/automations/customers/lifetime-value/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockCalculateCustomerLifetimeValue).toHaveBeenCalled();
  });
});

// ── Data / Archive ────────────────────────────────────────────────────────────
describe('data/archive', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls archiveOldData', async () => {
    const { POST } = await import('@/app/api/automations/data/archive/route');
    const res = await POST(makePost('http://localhost', { archiveYears: 3 }));
    expect(res.status).toBe(200);
    expect(mockArchiveOldData).toHaveBeenCalledWith(expect.objectContaining({ archiveYears: 3 }));
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/data/archive/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls archiveOldData', async () => {
    const { GET } = await import('@/app/api/automations/data/archive/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockArchiveOldData).toHaveBeenCalled();
  });
});

// ── Pricing / Dynamic ─────────────────────────────────────────────────────────
describe('pricing/dynamic', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls applyDynamicPricing', async () => {
    const { POST } = await import('@/app/api/automations/pricing/dynamic/route');
    const res = await POST(makePost('http://localhost', { enableTimeBased: true, enableDemandBased: false }));
    expect(res.status).toBe(200);
    expect(mockApplyDynamicPricing).toHaveBeenCalledWith(
      expect.objectContaining({ enableTimeBased: true, enableDemandBased: false })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/pricing/dynamic/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — parses boolean flags from query', async () => {
    const { GET } = await import('@/app/api/automations/pricing/dynamic/route');
    const res = await GET(makeGet('http://localhost?enableTimeBased=true&enableStockBased=true'));
    expect(res.status).toBe(200);
    expect(mockApplyDynamicPricing).toHaveBeenCalledWith(
      expect.objectContaining({ enableTimeBased: true, enableStockBased: true })
    );
  });
});

// ── Products / Performance ────────────────────────────────────────────────────
describe('products/performance', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls analyzeProductPerformance', async () => {
    const { POST } = await import('@/app/api/automations/products/performance/route');
    const res = await POST(makePost('http://localhost', { daysToAnalyze: 30, slowMovingThreshold: 5 }));
    expect(res.status).toBe(200);
    expect(mockAnalyzeProductPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ daysToAnalyze: 30, slowMovingThreshold: 5 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/products/performance/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls analyzeProductPerformance', async () => {
    const { GET } = await import('@/app/api/automations/products/performance/route');
    const res = await GET(makeGet('http://localhost?daysToAnalyze=14'));
    expect(res.status).toBe(200);
    expect(mockAnalyzeProductPerformance).toHaveBeenCalled();
  });
});

// ── Purchase Orders ───────────────────────────────────────────────────────────
describe('purchase-orders', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls generatePurchaseOrders', async () => {
    const { POST } = await import('@/app/api/automations/purchase-orders/route');
    const res = await POST(makePost('http://localhost', { generateDocuments: true, sendToSuppliers: false }));
    expect(res.status).toBe(200);
    expect(mockGeneratePurchaseOrders).toHaveBeenCalledWith(
      expect.objectContaining({ generateDocuments: true, sendToSuppliers: false })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/purchase-orders/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls generatePurchaseOrders', async () => {
    const { GET } = await import('@/app/api/automations/purchase-orders/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockGeneratePurchaseOrders).toHaveBeenCalled();
  });
});

// ── Security / Suspicious Activity ───────────────────────────────────────────
describe('security/suspicious-activity', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls detectSuspiciousActivity', async () => {
    const { POST } = await import('@/app/api/automations/security/suspicious-activity/route');
    const res = await POST(makePost('http://localhost', { refundThreshold: 5, voidThreshold: 3 }));
    expect(res.status).toBe(200);
    expect(mockDetectSuspiciousActivity).toHaveBeenCalledWith(
      expect.objectContaining({ refundThreshold: 5, voidThreshold: 3 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/security/suspicious-activity/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls detectSuspiciousActivity', async () => {
    const { GET } = await import('@/app/api/automations/security/suspicious-activity/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockDetectSuspiciousActivity).toHaveBeenCalled();
  });
});

// ── Stock / Predictive ────────────────────────────────────────────────────────
describe('stock/predictive', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls predictStockNeeds', async () => {
    const { POST } = await import('@/app/api/automations/stock/predictive/route');
    const res = await POST(makePost('http://localhost', { analysisDays: 30, predictionDays: 7 }));
    expect(res.status).toBe(200);
    expect(mockPredictStockNeeds).toHaveBeenCalledWith(
      expect.objectContaining({ analysisDays: 30, predictionDays: 7 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/stock/predictive/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes params from query', async () => {
    const { GET } = await import('@/app/api/automations/stock/predictive/route');
    const res = await GET(makeGet('http://localhost?analysisDays=14&predictionDays=3'));
    expect(res.status).toBe(200);
    expect(mockPredictStockNeeds).toHaveBeenCalled();
  });
});

// ── Stock / Transfer ──────────────────────────────────────────────────────────
describe('stock/transfer', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls detectStockImbalances', async () => {
    const { POST } = await import('@/app/api/automations/stock/transfer/route');
    const res = await POST(makePost('http://localhost', { autoApprove: true, minStockThreshold: 10 }));
    expect(res.status).toBe(200);
    expect(mockDetectStockImbalances).toHaveBeenCalledWith(
      expect.objectContaining({ autoApprove: true, minStockThreshold: 10 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/stock/transfer/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls detectStockImbalances', async () => {
    const { GET } = await import('@/app/api/automations/stock/transfer/route');
    const res = await GET(makeGet('http://localhost?autoApprove=true'));
    expect(res.status).toBe(200);
    expect(mockDetectStockImbalances).toHaveBeenCalledWith(
      expect.objectContaining({ autoApprove: true })
    );
  });
});

// ── Sync / Offline ────────────────────────────────────────────────────────────
describe('sync/offline', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls syncOfflineTransactions', async () => {
    const { POST } = await import('@/app/api/automations/sync/offline/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', maxRetries: 3 }));
    expect(res.status).toBe(200);
    expect(mockSyncOfflineTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tid', maxRetries: 3 })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/sync/offline/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — passes maxRetries from query', async () => {
    const { GET } = await import('@/app/api/automations/sync/offline/route');
    const res = await GET(makeGet('http://localhost?maxRetries=5'));
    expect(res.status).toBe(200);
    expect(mockSyncOfflineTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 5 })
    );
  });
});

// ── Audit Logs / Cleanup ──────────────────────────────────────────────────────
describe('audit-logs/cleanup', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls cleanupAuditLogs', async () => {
    const { POST } = await import('@/app/api/automations/audit-logs/cleanup/route');
    const res = await POST(makePost('http://localhost', { retentionYears: 2, archive: true }));
    expect(res.status).toBe(200);
    expect(mockCleanupAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ retentionYears: 2, archive: true })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/audit-logs/cleanup/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls cleanupAuditLogs', async () => {
    const { GET } = await import('@/app/api/automations/audit-logs/cleanup/route');
    const res = await GET(makeGet('http://localhost?archive=true'));
    expect(res.status).toBe(200);
    expect(mockCleanupAuditLogs).toHaveBeenCalled();
  });
});

// ── Backups / Create ──────────────────────────────────────────────────────────
describe('backups/create', () => {
  beforeEach(() => { vi.clearAllMocks(); mockVerifyCronAuth.mockReturnValue(null); });

  it('POST 200 — calls createDatabaseBackup', async () => {
    const { POST } = await import('@/app/api/automations/backups/create/route');
    const res = await POST(makePost('http://localhost', { tenantId: 'tid', uploadToCloud: true }));
    expect(res.status).toBe(200);
    expect(mockCreateDatabaseBackup).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tid', uploadToCloud: true })
    );
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(deniedResponse());
    const { POST } = await import('@/app/api/automations/backups/create/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('GET 200 — calls createDatabaseBackup', async () => {
    const { GET } = await import('@/app/api/automations/backups/create/route');
    const res = await GET(makeGet('http://localhost?tenantId=tid'));
    expect(res.status).toBe(200);
    expect(mockCreateDatabaseBackup).toHaveBeenCalled();
  });
});
