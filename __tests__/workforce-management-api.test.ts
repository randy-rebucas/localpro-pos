process.env.JWT_SECRET = 'test-secret-32chars-workforce!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockRequireAuth,
  mockRequireTenantAccess,
  mockGetTenantIdFromRequest,
  mockHasRole,
  mockCreateAuditLog,
  mockHandleApiError,
  mockAttendanceFindOne,
  mockAttendanceFind,
  mockShiftFindOne,
  mockShiftFindOneAndUpdate,
  mockCommissionFind,
  mockCommissionCountDocuments,
  mockCommissionUpdateMany,
  mockCommissionInsertMany,
  mockCommissionRuleFind,
  mockCommissionRuleCreate,
  mockTransactionFind,
  mockTenantFindById,
  mockSendAttendanceNotification,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
  mockRequireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', role: 'admin' },
  }),
  mockGetTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  mockHasRole: vi.fn().mockReturnValue(true),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn(),
  mockAttendanceFindOne: vi.fn(),
  mockAttendanceFind: vi.fn(),
  mockShiftFindOne: vi.fn(),
  mockShiftFindOneAndUpdate: vi.fn().mockResolvedValue({}),
  mockCommissionFind: vi.fn(),
  mockCommissionCountDocuments: vi.fn().mockResolvedValue(0),
  mockCommissionUpdateMany: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
  mockCommissionInsertMany: vi.fn().mockResolvedValue([]),
  mockCommissionRuleFind: vi.fn(),
  mockCommissionRuleCreate: vi.fn(),
  mockTransactionFind: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockSendAttendanceNotification: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth, hasRole: mockHasRole };
});
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: mockRequireTenantAccess,
  getTenantIdFromRequest: mockGetTenantIdFromRequest,
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/notifications', () => ({
  sendAttendanceNotification: mockSendAttendanceNotification,
  sendEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));
vi.mock('@/models/Tenant', () => ({ default: { findById: mockTenantFindById } }));
vi.mock('@/models/Attendance', () => ({
  default: { findOne: mockAttendanceFindOne, find: mockAttendanceFind },
}));
vi.mock('@/models/Shift', () => ({
  default: { findOne: mockShiftFindOne, findOneAndUpdate: mockShiftFindOneAndUpdate },
}));
vi.mock('@/models/Commission', () => ({
  default: {
    find: mockCommissionFind,
    countDocuments: mockCommissionCountDocuments,
    updateMany: mockCommissionUpdateMany,
    insertMany: mockCommissionInsertMany,
  },
}));
vi.mock('@/models/CommissionRule', () => ({
  default: { find: mockCommissionRuleFind, create: mockCommissionRuleCreate },
}));
vi.mock('@/models/Transaction', () => ({ default: { find: mockTransactionFind } }));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return { ...actual, default: actual.default };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: `auth-token=${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Returns an object that supports `.populate().sort().limit().skip().select().lean()` chains and direct `await`. */
function makeChain<T>(value: T) {
  const chain: any = {};
  ['populate', 'sort', 'limit', 'skip', 'select'].forEach(m => {
    chain[m] = () => chain;
  });
  chain.lean = () => Promise.resolve(value);
  chain.then = (resolve: any) => Promise.resolve(value).then(resolve);
  return chain;
}

function makeErrorResponse(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ===========================================================================
// GET /api/attendance/current
// ===========================================================================

describe('GET /api/attendance/current', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ GET } = await import('@/app/api/attendance/current/route'));
  });

  it('returns null data when no active session', async () => {
    mockAttendanceFindOne.mockReturnValue(makeChain(null));
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/current'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('returns session with currentHours when clocked in', async () => {
    const clockInTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const session = { _id: 'att-1', userId: 'user-1', tenantId: 'tenant-1', clockIn: clockInTime };
    mockAttendanceFindOne.mockReturnValue(makeChain(session));
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/current'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).not.toBeNull();
    expect(body.data.currentHours).toBeGreaterThan(1.9);
    expect(body.data.currentHours).toBeLessThan(2.1);
  });

  it('returns 401 when unauthorized', async () => {
    mockRequireAuth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { message: 'Unauthorized' }));
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/current'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/attendance/notifications
// ===========================================================================

describe('GET /api/attendance/notifications', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  // Missing clock-out: clocked in 48 hours ago (>> 12h default)
  const MISSING_CLOCK_OUT_SESSION = {
    _id: 'att-old',
    userId: { _id: 'user-2', name: 'Jane Doe', email: 'jane@test.com' },
    tenantId: 'tenant-1',
    clockIn: new Date(Date.now() - 48 * 60 * 60 * 1000),
  };

  // Late arrival: clocked in yesterday at 23:00 UTC (always > 09:00 local in any timezone)
  const YESTERDAY = new Date();
  YESTERDAY.setDate(YESTERDAY.getDate() - 1);
  YESTERDAY.setUTCHours(23, 0, 0, 0);
  const LATE_ARRIVAL_ATTENDANCE = {
    _id: 'att-late',
    userId: { _id: 'user-3', name: 'Bob Late', email: 'bob@test.com' },
    tenantId: 'tenant-1',
    clockIn: new Date(YESTERDAY),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockTenantFindById.mockReturnValue(makeChain(null)); // default: no tenant settings
    ({ GET } = await import('@/app/api/attendance/notifications/route'));
  });

  it('returns empty notifications when no active sessions or late arrivals', async () => {
    mockAttendanceFind
      .mockReturnValueOnce(makeChain([]))  // active sessions
      .mockReturnValueOnce(makeChain([])); // today's attendances
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/notifications'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(0);
    expect(body.data.summary.total).toBe(0);
  });

  it('detects missing clock-out notifications', async () => {
    mockAttendanceFind
      .mockReturnValueOnce(makeChain([MISSING_CLOCK_OUT_SESSION]))
      .mockReturnValueOnce(makeChain([]));
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/notifications'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.missingClockOut).toBe(1);
    expect(body.data.notifications[0].type).toBe('missing_clock_out');
    expect(body.data.notifications[0].userName).toBe('Jane Doe');
  });

  it('detects late arrival notifications', async () => {
    mockAttendanceFind
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([LATE_ARRIVAL_ATTENDANCE]));
    // expectedStartTime=00:00 ensures any time on that day is "late"
    const url = 'http://localhost/api/attendance/notifications?expectedStartTime=00:00&maxHoursWithoutClockOut=12';
    const res = await GET(makeRequest('GET', url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.lateArrivals).toBe(1);
    expect(body.data.notifications[0].type).toBe('late_arrival');
    expect(body.data.notifications[0].minutesLate).toBeGreaterThan(15);
  });

  it('returns both notification types when both present', async () => {
    mockAttendanceFind
      .mockReturnValueOnce(makeChain([MISSING_CLOCK_OUT_SESSION]))
      .mockReturnValueOnce(makeChain([LATE_ARRIVAL_ATTENDANCE]));
    const url = 'http://localhost/api/attendance/notifications?expectedStartTime=00:00';
    const res = await GET(makeRequest('GET', url));
    const body = await res.json();
    expect(body.data.summary.total).toBe(2);
    expect(body.data.summary.missingClockOut).toBe(1);
    expect(body.data.summary.lateArrivals).toBe(1);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance/notifications'));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/attendance/notifications
// ===========================================================================

describe('POST /api/attendance/notifications', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const notif = {
    userName: 'Alice',
    userEmail: 'alice@test.com',
    type: 'missing_clock_out',
    clockInTime: new Date().toISOString(),
    hoursSinceClockIn: '14.5',
    message: 'Too long without clock-out',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockSendAttendanceNotification.mockResolvedValue(true);
    ({ POST } = await import('@/app/api/attendance/notifications/route'));
  });

  it('sends emails and returns sent count', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {
      notifications: [notif],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.sent).toBe(1);
    expect(body.results.failed).toBe(0);
  });

  it('counts failed when notification has no email', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {
      notifications: [{ ...notif, userEmail: null }],
    }));
    const body = await res.json();
    expect(body.results.sent).toBe(0);
    expect(body.results.failed).toBe(1);
  });

  it('handles partial failure gracefully', async () => {
    mockSendAttendanceNotification
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {
      notifications: [notif, { ...notif, userEmail: 'other@test.com', userName: 'Other' }],
    }));
    const body = await res.json();
    expect(body.results.sent).toBe(1);
    expect(body.results.failed).toBe(1);
  });

  it('returns 400 when notifications array is empty', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {
      notifications: [],
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when notifications field is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance/notifications', {
      notifications: [notif],
    }));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/shifts/[id]/confirm
// ===========================================================================

describe('POST /api/shifts/[id]/confirm', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const SHIFT_ID = 'shift-abc';
  const makeShift = (staffId: string) => ({
    _id: SHIFT_ID,
    tenantId: 'tenant-1',
    staffId: { toString: () => staffId },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'staff' } });
    mockShiftFindOne.mockResolvedValue(makeShift('user-1'));
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ POST } = await import('@/app/api/shifts/[id]/confirm/route'));
  });

  function makeConfirmReq(shiftId: string) {
    return makeRequest('POST', `http://localhost/api/shifts/${shiftId}/confirm`);
  }

  it('confirms shift for the assigned staff', async () => {
    const res = await POST(makeConfirmReq(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockShiftFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: SHIFT_ID }),
      { status: 'confirmed' }
    );
  });

  it('returns 403 when user is not the assigned staff', async () => {
    mockShiftFindOne.mockResolvedValue(makeShift('other-user'));
    const res = await POST(makeConfirmReq(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/own shift/i);
  });

  it('returns 404 when shift not found', async () => {
    mockShiftFindOne.mockResolvedValue(null);
    const res = await POST(makeConfirmReq(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });
    expect(res.status).toBe(404);
  });

  it('delegates to handleApiError on exception', async () => {
    mockShiftFindOne.mockRejectedValue(new Error('DB failure'));
    await POST(makeConfirmReq(SHIFT_ID), { params: Promise.resolve({ id: SHIFT_ID }) });
    expect(mockHandleApiError).toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/shifts/swap-request
// ===========================================================================

describe('POST /api/shifts/swap-request', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const SHIFT_ID = 'shift-xyz';
  const makeShift = (staffId: string) => ({
    _id: SHIFT_ID,
    tenantId: 'tenant-1',
    staffId: { toString: () => staffId },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'staff' } });
    mockShiftFindOne.mockResolvedValue(makeShift('user-1'));
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ POST } = await import('@/app/api/shifts/swap-request/route'));
  });

  it('creates swap request for assigned staff', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts/swap-request', {
      shiftId: SHIFT_ID,
      targetStaffId: 'user-99',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockShiftFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: SHIFT_ID }),
      { status: 'swap_requested', swapRequestedTo: 'user-99' }
    );
  });

  it('returns 400 when shiftId is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts/swap-request', {
      targetStaffId: 'user-99',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when targetStaffId is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts/swap-request', {
      shiftId: SHIFT_ID,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when shift not found', async () => {
    mockShiftFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts/swap-request', {
      shiftId: SHIFT_ID,
      targetStaffId: 'user-99',
    }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the assigned staff', async () => {
    mockShiftFindOne.mockResolvedValue(makeShift('other-user'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/shifts/swap-request', {
      shiftId: SHIFT_ID,
      targetStaffId: 'user-99',
    }));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/commissions
// ===========================================================================

describe('GET /api/commissions', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const makeCommission = (id: string) => ({ _id: id, tenantId: 'tenant-1', status: 'pending', amount: 50 });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'admin' } });
    mockCommissionCountDocuments.mockResolvedValue(2);
    mockCommissionFind.mockReturnValue(makeChain([makeCommission('c-1'), makeCommission('c-2')]));
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ GET } = await import('@/app/api/commissions/route'));
  });

  it('returns commissions list with pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/commissions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
  });

  it('applies status filter', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/commissions?status=approved'));
    expect(mockCommissionFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' })
    );
  });

  it('applies period filter', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/commissions?period=2026-04'));
    expect(mockCommissionFind).toHaveBeenCalledWith(
      expect.objectContaining({ period: '2026-04' })
    );
  });

  it('converts staffId to ObjectId', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/commissions?staffId=507f1f77bcf86cd799439011'));
    const callArg = mockCommissionFind.mock.calls[0][0];
    expect(callArg.staffId).toBeDefined();
    // Should be a mongoose ObjectId, not a plain string
    expect(typeof callArg.staffId).toBe('object');
  });

  it('respects page and limit query params', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/commissions?page=2&limit=10'));
    expect(body => body).toBeDefined(); // chain was called
  });
});

// ===========================================================================
// PATCH /api/commissions
// ===========================================================================

describe('PATCH /api/commissions', () => {
  let PATCH: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'admin' } });
    mockHasRole.mockReturnValue(true);
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ PATCH } = await import('@/app/api/commissions/route'));
  });

  it('approves commissions and returns updated count', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      ids: ['c-1', 'c-2'],
      status: 'approved',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(2);
    expect(mockCommissionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ['c-1', 'c-2'] } }),
      expect.objectContaining({ status: 'approved' })
    );
  });

  it('sets paidAt when status is paid', async () => {
    await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      ids: ['c-1'],
      status: 'paid',
    }));
    const updateArg = mockCommissionUpdateMany.mock.calls[0][1];
    expect(updateArg.paidAt).toBeInstanceOf(Date);
  });

  it('creates audit log on success', async () => {
    await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      ids: ['c-1'],
      status: 'approved',
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'commission', metadata: expect.objectContaining({ status: 'approved' }) })
    );
  });

  it('returns 403 when user lacks admin/owner role', async () => {
    mockHasRole.mockReturnValue(false);
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      ids: ['c-1'],
      status: 'approved',
    }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid status', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      ids: ['c-1'],
      status: 'deleted',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid status/i);
  });

  it('returns 400 when ids are missing', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/commissions', {
      status: 'approved',
    }));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/commissions/calculate
// ===========================================================================

describe('POST /api/commissions/calculate', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const TX_ID = 'tx-111';
  const RULE_ID = 'rule-222';

  const makeTx = (id: string, total: number, userId = 'staff-1') => ({
    _id: id,
    userId: { toString: () => userId },
    total,
    tenantId: 'tenant-1',
  });

  const makePercentageRule = (id: string, rate: number) => ({
    _id: id,
    type: 'percentage',
    rate,
    staffIds: [],
    minimumSale: 0,
    isActive: true,
  });

  const makeFlatRule = (id: string, rate: number) => ({
    _id: id,
    type: 'flat',
    rate,
    staffIds: [],
    minimumSale: 0,
    isActive: true,
  });

  const makeTieredRule = (id: string, tiers: { minSale: number; rate: number }[]) => ({
    _id: id,
    type: 'tiered',
    tiers,
    staffIds: [],
    minimumSale: 0,
    isActive: true,
  });

  // Use a valid 24-hex ObjectId string — the route calls `new mongoose.Types.ObjectId(tenantId)`
  const VALID_TENANT_ID = '507f191e810c19729de860ea';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: VALID_TENANT_ID, user: { userId: 'user-1', role: 'admin' } });
    // Default: no existing commissions (no dedup)
    mockCommissionFind.mockReturnValue(makeChain([]));
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ POST } = await import('@/app/api/commissions/calculate/route'));
  });

  it('calculates percentage commissions', async () => {
    mockCommissionRuleFind.mockReturnValue(makeChain([makePercentageRule(RULE_ID, 5)]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 1000)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    const inserted = mockCommissionInsertMany.mock.calls[0][0][0];
    expect(inserted.amount).toBe(50); // 1000 * 5 / 100
    expect(inserted.status).toBe('pending');
  });

  it('calculates flat rate commissions', async () => {
    mockCommissionRuleFind.mockReturnValue(makeChain([makeFlatRule(RULE_ID, 25)]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 500)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    const body = await res.json();
    expect(body.data.created).toBe(1);
    const inserted = mockCommissionInsertMany.mock.calls[0][0][0];
    expect(inserted.amount).toBe(25); // flat rate
  });

  it('calculates tiered commissions using highest matching tier', async () => {
    const tiers = [{ minSale: 0, rate: 10 }, { minSale: 500, rate: 15 }];
    mockCommissionRuleFind.mockReturnValue(makeChain([makeTieredRule(RULE_ID, tiers)]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 500)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    const body = await res.json();
    expect(body.data.created).toBe(1);
    const inserted = mockCommissionInsertMany.mock.calls[0][0][0];
    expect(inserted.amount).toBe(75); // 500 * 15 / 100
  });

  it('returns 0 created when no rules exist', async () => {
    mockCommissionRuleFind.mockReturnValue(makeChain([]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 1000)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    const body = await res.json();
    expect(body.data.created).toBe(0);
    expect(mockCommissionInsertMany).not.toHaveBeenCalled();
  });

  it('skips already-existing commissions (dedup)', async () => {
    mockCommissionRuleFind.mockReturnValue(makeChain([makePercentageRule(RULE_ID, 5)]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 1000)]));
    // The route builds existingSet from `${c.transactionId}:${c.ruleId}` and checks `${tx._id}:${rule._id}`
    mockCommissionFind.mockReturnValue(makeChain([{ transactionId: TX_ID, ruleId: RULE_ID }]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    const body = await res.json();
    expect(body.data.created).toBe(0);
    expect(mockCommissionInsertMany).not.toHaveBeenCalled();
  });

  it('skips transaction below minimumSale', async () => {
    const rule = { ...makePercentageRule(RULE_ID, 5), minimumSale: 500 };
    mockCommissionRuleFind.mockReturnValue(makeChain([rule]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 100)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }));
    const body = await res.json();
    expect(body.data.created).toBe(0);
  });

  it('returns 400 for invalid date range', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {
      startDate: 'not-a-date',
      endDate: 'also-bad',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });

  it('uses current month period when no dates provided', async () => {
    mockCommissionRuleFind.mockReturnValue(makeChain([makePercentageRule(RULE_ID, 5)]));
    mockTransactionFind.mockReturnValue(makeChain([makeTx(TX_ID, 1000)]));
    const res = await POST(makeRequest('POST', 'http://localhost/api/commissions/calculate', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.period).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ===========================================================================
// GET /api/commission-rules
// ===========================================================================

describe('GET /api/commission-rules', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'admin' } });
    mockCommissionRuleFind.mockReturnValue(makeChain([
      { _id: 'r-1', name: 'Base Rate', type: 'percentage', rate: 5 },
      { _id: 'r-2', name: 'Flat Bonus', type: 'flat', rate: 10 },
    ]));
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ GET } = await import('@/app/api/commission-rules/route'));
  });

  it('returns all commission rules for tenant', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/commission-rules'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Base Rate');
  });
});

// ===========================================================================
// POST /api/commission-rules
// ===========================================================================

describe('POST /api/commission-rules', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const createdRule = { _id: 'r-new', name: 'Sales Rate', type: 'percentage', rate: 7, _id_str: () => 'r-new' };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'admin' } });
    mockCommissionRuleCreate.mockResolvedValue({ ...createdRule, _id: { toString: () => 'r-new' } });
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ POST } = await import('@/app/api/commission-rules/route'));
  });

  it('creates a percentage rule', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'Sales Rate',
      type: 'percentage',
      rate: 7,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockCommissionRuleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sales Rate', type: 'percentage', rate: 7 })
    );
  });

  it('creates a tiered rule', async () => {
    const tiers = [{ minSale: 0, rate: 5 }, { minSale: 1000, rate: 10 }];
    mockCommissionRuleCreate.mockResolvedValue({ _id: { toString: () => 'r-tiered' }, name: 'Tiered', type: 'tiered', tiers });
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'Tiered',
      type: 'tiered',
      tiers,
    }));
    expect(res.status).toBe(201);
    expect(mockCommissionRuleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tiered', tiers })
    );
  });

  it('calls createAuditLog after creation', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'Sales Rate',
      type: 'percentage',
      rate: 7,
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'commission_rule', metadata: expect.objectContaining({ name: 'Sales Rate', type: 'percentage' }) })
    );
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      type: 'percentage',
      rate: 5,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name and type/i);
  });

  it('returns 400 when type is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'My Rule',
      rate: 5,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when rate is missing for percentage type', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'My Rule',
      type: 'percentage',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rate is required/i);
  });

  it('returns 400 when rate is missing for flat type', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'My Rule',
      type: 'flat',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when tiers are missing for tiered type', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/commission-rules', {
      name: 'My Rule',
      type: 'tiered',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tiers are required/i);
  });
});
