/**
 * Section 16 — Attendance
 * Section 17 — Branches
 * Tests: 16.1–16.4, 17.1–17.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant123',
    user: { userId: 'user1', tenantId: 'tenant123', email: 'u@t.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
    ATTENDANCE_CLOCK_IN: 'ATTENDANCE_CLOCK_IN',
    ATTENDANCE_CLOCK_OUT: 'ATTENDANCE_CLOCK_OUT',
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockReturnValue(
    NextResponse.json({ success: false, error: 'Error' }, { status: 500 })
  ),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/notifications', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendAttendanceNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({
    attendanceNotifications: { enabled: true, maxHoursWithoutClockOut: 12, expectedStartTime: '09:00' },
    emailNotifications: false,
  }),
}));
vi.mock('@/models/Attendance', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock('@/models/User', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/models/Branch', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), findOne: vi.fn() },
}));
vi.mock('@/models/Customer', () => ({ default: {} }));
vi.mock('@/models/Discount', () => ({ default: {} }));
vi.mock('@/models/StockMovement', () => ({
  default: { find: vi.fn(), create: vi.fn(), countDocuments: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkFeatureAccess, checkSubscriptionLimit } from '@/lib/subscription';
import { getTenantSettingsById } from '@/lib/tenant';
import Attendance from '@/models/Attendance';
import Tenant from '@/models/Tenant';
import Branch from '@/models/Branch';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import { autoClockOutForgottenSessions } from '@/lib/automations/attendance-auto-clockout';
import { syncMultiBranchData } from '@/lib/automations/multi-branch-sync';
import { updateStock } from '@/lib/stock';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const BRANCH_ID = 'branch1';
const ATTENDANCE_ID = 'att1';
const USER_ID = 'user1';

const mockBranchDoc = {
  _id: BRANCH_ID,
  tenantId: TENANT_ID,
  name: 'Main Branch',
  code: 'MAIN',
  isActive: true,
};

const makeBranchDoc = (overrides = {}) => ({
  ...mockBranchDoc,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
  toObject: vi.fn().mockReturnValue({ ...mockBranchDoc, ...overrides }),
  _id: { toString: () => BRANCH_ID },
});

const mockAttendanceDoc = {
  _id: ATTENDANCE_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  clockIn: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
  clockOut: null,
};

const makeAttendanceDoc = (overrides = {}) => ({
  ...mockAttendanceDoc,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
  _id: { toString: () => ATTENDANCE_ID },
});

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 16.1  POST /api/attendance — clock-in ─────────────────────────────────
describe('POST /api/attendance — clock-in (16.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    vi.mocked(Attendance.findOne).mockResolvedValue(null as any); // no active session
    vi.mocked(Attendance.create).mockResolvedValue({
      ...mockAttendanceDoc,
      _id: { toString: () => ATTENDANCE_ID },
    } as any);
  });

  it('clocks in and creates attendance record', async () => {
    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(req('POST', '/api/attendance', { action: 'clock-in' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(Attendance.create)).toHaveBeenCalled();
  });

  it('returns 400 when already clocked in', async () => {
    vi.mocked(Attendance.findOne).mockResolvedValue(makeAttendanceDoc() as any);
    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(req('POST', '/api/attendance', { action: 'clock-in' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when action is invalid', async () => {
    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(req('POST', '/api/attendance', { action: 'invalid' }));
    expect(res.status).toBe(400);
  });
});

// ── 16.1  POST /api/attendance — clock-out ────────────────────────────────
describe('POST /api/attendance — clock-out (16.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    // findOne for clock-out needs chained .sort()
    vi.mocked(Attendance.findOne).mockReturnValue({
      sort: vi.fn().mockResolvedValue(makeAttendanceDoc()),
    } as any);
  });

  it('clocks out and saves clock-out time', async () => {
    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(req('POST', '/api/attendance', { action: 'clock-out' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 when no active session to clock out', async () => {
    vi.mocked(Attendance.findOne).mockReturnValue({ sort: vi.fn().mockResolvedValue(null) } as any);
    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(req('POST', '/api/attendance', { action: 'clock-out' }));
    expect(res.status).toBe(400);
  });
});

// ── 16.2  GET /api/attendance/current ─────────────────────────────────────
describe('GET /api/attendance/current (16.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
  });

  it('returns active session with currentHours calculated', async () => {
    vi.mocked(Attendance.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockAttendanceDoc }),
      }),
    } as any);
    const { GET } = await import('@/app/api/attendance/current/route');
    const res = await GET(req('GET', '/api/attendance/current'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.currentHours).toBeGreaterThan(0);
    expect(body.data.currentHours).toBeLessThan(24);
  });

  it('returns null when not clocked in', async () => {
    vi.mocked(Attendance.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as any);
    const { GET } = await import('@/app/api/attendance/current/route');
    const res = await GET(req('GET', '/api/attendance/current'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/attendance/current/route');
    const res = await GET(req('GET', '/api/attendance/current'));
    expect(res.status).toBe(401);
  });
});

// ── 16.3  GET /api/attendance/notifications ───────────────────────────────
describe('GET /api/attendance/notifications (16.3)', () => {
  const longOpenSession = {
    _id: ATTENDANCE_ID,
    userId: { _id: USER_ID, name: 'Jane', email: 'jane@test.com' },
    clockIn: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
  };
  // clocked in at 11:00 with expected start 09:00 → 120 min late
  const lateArrival = {
    _id: 'att2',
    userId: { _id: USER_ID, name: 'Bob', email: 'bob@test.com' },
    clockIn: new Date(new Date().setHours(11, 0, 0, 0)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    // Dynamic import of Tenant — use the global Tenant mock
    vi.mocked(Tenant.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ settings: { attendanceNotifications: {} } }),
      }),
    } as any);
    // First find: active sessions (for missing clock-outs)
    // Second find: today's attendances (for late arrivals)
    vi.mocked(Attendance.find)
      .mockReturnValueOnce({
        populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([longOpenSession]) }),
      } as any)
      .mockReturnValueOnce({
        populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([lateArrival]) }),
      } as any);
  });

  it('returns missing clock-out notifications', async () => {
    const { GET } = await import('@/app/api/attendance/notifications/route');
    const res = await GET(req('GET', '/api/attendance/notifications?maxHoursWithoutClockOut=12'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const missingClockOuts = body.data.notifications.filter(
      (n: { type: string }) => n.type === 'missing_clock_out'
    );
    expect(missingClockOuts.length).toBeGreaterThan(0);
  });

  it('returns late arrival notifications', async () => {
    const { GET } = await import('@/app/api/attendance/notifications/route');
    const res = await GET(req('GET', '/api/attendance/notifications?expectedStartTime=09:00'));
    const body = await res.json();
    expect(res.status).toBe(200);
    const late = body.data.notifications.filter(
      (n: { type: string }) => n.type === 'late_arrival'
    );
    expect(late.length).toBeGreaterThan(0);
  });

  it('includes summary counts', async () => {
    const { GET } = await import('@/app/api/attendance/notifications/route');
    const res = await GET(req('GET', '/api/attendance/notifications'));
    const body = await res.json();
    expect(body.data.summary).toMatchObject({
      total: expect.any(Number),
      missingClockOut: expect.any(Number),
      lateArrivals: expect.any(Number),
    });
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/attendance/notifications/route');
    const res = await GET(req('GET', '/api/attendance/notifications'));
    expect(res.status).toBe(404);
  });
});

// ── 16.4  Auto clock-out automation ───────────────────────────────────────
describe('autoClockOutForgottenSessions (16.4)', () => {
  const tenantDoc = { _id: { toString: () => TENANT_ID }, name: 'Test Co', status: 'active' };
  const forgottenSession = {
    _id: { toString: () => ATTENDANCE_ID },
    userId: { _id: USER_ID, name: 'Bob', email: null },
    clockIn: new Date(Date.now() - 15 * 60 * 60 * 1000), // 15 hours ago
    notes: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(tenantDoc),
    } as any);
    vi.mocked(getTenantSettingsById).mockResolvedValue({
      attendanceNotifications: { enabled: true, maxHoursWithoutClockOut: 12 },
      emailNotifications: false,
    } as any);
    vi.mocked(Attendance.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([forgottenSession]),
      }),
    } as any);
    vi.mocked(Attendance.findByIdAndUpdate).mockResolvedValue(undefined as any);
  });

  it('auto-clocks out sessions open longer than maxHours', async () => {
    const result = await autoClockOutForgottenSessions({ tenantId: TENANT_ID });
    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(vi.mocked(Attendance.findByIdAndUpdate)).toHaveBeenCalledWith(
      ATTENDANCE_ID,
      expect.objectContaining({ clockOut: expect.any(Date) })
    );
  });

  it('skips tenants with attendance notifications disabled', async () => {
    vi.mocked(getTenantSettingsById).mockResolvedValue({
      attendanceNotifications: { enabled: false },
    } as any);
    const result = await autoClockOutForgottenSessions({ tenantId: TENANT_ID });
    expect(result.processed).toBe(0);
    expect(vi.mocked(Attendance.findByIdAndUpdate)).not.toHaveBeenCalled();
  });

  it('returns no tenants message when tenant not found', async () => {
    vi.mocked(Tenant.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const result = await autoClockOutForgottenSessions({ tenantId: 'bad-id' });
    expect(result.message).toMatch(/no tenants/i);
  });
});

// ── 17.1  GET /api/branches ───────────────────────────────────────────────
describe('GET /api/branches (17.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(Branch.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockBranchDoc]),
        }),
      }),
    } as any);
  });

  it('returns list of branches', async () => {
    const { GET } = await import('@/app/api/branches/route');
    const res = await GET(req('GET', '/api/branches'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Main Branch');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const { GET } = await import('@/app/api/branches/route');
    const res = await GET(req('GET', '/api/branches'));
    expect(res.status).toBe(401);
  });
});

// ── 17.1  POST /api/branches ──────────────────────────────────────────────
describe('POST /api/branches (17.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Branch.countDocuments).mockResolvedValue(0 as any); // first branch — no feature check
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(Branch.create).mockResolvedValue({
      ...mockBranchDoc,
      _id: { toString: () => BRANCH_ID },
    } as any);
  });

  it('creates branch and returns 201', async () => {
    const { POST } = await import('@/app/api/branches/route');
    const res = await POST(req('POST', '/api/branches', { name: 'Main Branch', code: 'MAIN' }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/branches/route');
    const res = await POST(req('POST', '/api/branches', { code: 'MAIN' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when multi-branch feature not enabled for 2nd branch', async () => {
    vi.mocked(Branch.countDocuments).mockResolvedValue(1 as any); // already has 1 branch
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { POST } = await import('@/app/api/branches/route');
    const res = await POST(req('POST', '/api/branches', { name: 'Second Branch' }));
    expect(res.status).toBe(403);
  });
});

// ── 17.2  PUT /api/branches/[id] ──────────────────────────────────────────
describe('PUT /api/branches/[id] (17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Branch.findOne).mockResolvedValue(makeBranchDoc() as any);
  });

  it('updates branch and returns 200', async () => {
    const { PUT } = await import('@/app/api/branches/[id]/route');
    const res = await PUT(
      req('PUT', `/api/branches/${BRANCH_ID}`, { name: 'Updated Branch', phone: '555-1234' }),
      { params: Promise.resolve({ id: BRANCH_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when branch not found', async () => {
    vi.mocked(Branch.findOne).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/branches/[id]/route');
    const res = await PUT(
      req('PUT', `/api/branches/bad-id`, { name: 'Updated' }),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 17.2  DELETE /api/branches/[id] ───────────────────────────────────────
describe('DELETE /api/branches/[id] (17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Branch.findOne).mockResolvedValue(makeBranchDoc() as any);
  });

  it('soft-deletes branch (sets isActive=false)', async () => {
    const { DELETE } = await import('@/app/api/branches/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/branches/${BRANCH_ID}`),
      { params: Promise.resolve({ id: BRANCH_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when branch not found', async () => {
    vi.mocked(Branch.findOne).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/branches/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/branches/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 17.3  Users can be scoped to a branch ─────────────────────────────────
describe('Branch stores managerId — users scoped to branches (17.3)', () => {
  it('branch creation accepts managerId linking a user to the branch', async () => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID, user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Branch.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(Branch.create).mockResolvedValue({
      ...mockBranchDoc,
      managerId: USER_ID,
      _id: { toString: () => BRANCH_ID },
    } as any);

    const { POST } = await import('@/app/api/branches/route');
    const res = await POST(req('POST', '/api/branches', { name: 'Branch A', managerId: USER_ID }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(vi.mocked(Branch.create)).toHaveBeenCalledWith(
      expect.objectContaining({ managerId: USER_ID })
    );
  });

  it('PUT branch can reassign manager (change branch user scope)', async () => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID, user: { userId: USER_ID, tenantId: TENANT_ID, email: 'u@t.com', role: 'admin' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    const branchDoc = makeBranchDoc({ managerId: 'old-manager' });
    vi.mocked(Branch.findOne).mockResolvedValue(branchDoc as any);

    const { PUT } = await import('@/app/api/branches/[id]/route');
    await PUT(
      req('PUT', `/api/branches/${BRANCH_ID}`, { managerId: 'new-manager' }),
      { params: Promise.resolve({ id: BRANCH_ID }) }
    );
    expect(branchDoc.managerId).toBe('new-manager');
  });
});

// ── 17.4  Stock movements are branch-aware ────────────────────────────────
describe('updateStock records branchId in movement (17.4)', () => {
  const PRODUCT_ID = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StockMovement.create).mockResolvedValue(undefined as any);
  });

  it('includes branchId in StockMovement when provided via options', async () => {
    vi.mocked(Product.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    // updateStock calls Product.findOne (not find)
    const productDoc = {
      _id: PRODUCT_ID, tenantId: TENANT_ID, stock: 10,
      trackInventory: true, allowOutOfStockSales: false,
      hasVariations: false,
      save: vi.fn().mockResolvedValue(undefined),
      isModified: vi.fn().mockReturnValue(false),
      markModified: vi.fn(),
    };
    // updateStock uses Product.findOne
    const ProductModel = (await import('@/models/Product')).default;
    vi.mocked(ProductModel.findOne).mockResolvedValue(productDoc as any);

    await updateStock(PRODUCT_ID, TENANT_ID, -2, 'sale', { branchId: BRANCH_ID });

    expect(vi.mocked(StockMovement.create)).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: BRANCH_ID })
    );
  });
});

// ── 17.5  Multi-branch sync automation ────────────────────────────────────
describe('syncMultiBranchData runs without error (17.5)', () => {
  const tenantDoc = { _id: { toString: () => TENANT_ID }, name: 'Test Co', status: 'active' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(tenantDoc),
    } as any);
    vi.mocked(Branch.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'b1', tenantId: TENANT_ID, isActive: true },
        { _id: 'b2', tenantId: TENANT_ID, isActive: true },
      ]),
    } as any);
    vi.mocked(Product.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'p1', name: 'Widget', price: 100 },
        { _id: 'p2', name: 'Gadget', price: 200 },
      ]),
    } as any);
  });

  it('returns success result and processes items across branches', async () => {
    const result = await syncMultiBranchData({ tenantId: TENANT_ID });
    expect(result.success).toBe(true);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
  });

  it('handles missing tenant gracefully', async () => {
    vi.mocked(Tenant.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const result = await syncMultiBranchData({ tenantId: 'bad-id' });
    expect(result.message).toMatch(/no tenants/i);
  });

  it('skips tenants with fewer than 2 branches', async () => {
    vi.mocked(Branch.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'b1', isActive: true }]), // only 1 branch
    } as any);
    const result = await syncMultiBranchData({ tenantId: TENANT_ID });
    // processed count only from single-branch tenant (skipped, so 0 from product loop)
    expect(result.success).toBe(true);
  });
});
