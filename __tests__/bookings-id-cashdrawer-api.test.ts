process.env.JWT_SECRET = 'test-secret-32chars-cashdrawer!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockBookingFindOne,
  mockBookingFindOneAndUpdate,
  mockBookingFind,
  mockUserFindOne,
  mockCashDrawerFind,
  mockCashDrawerFindOne,
  mockCashDrawerCreate,
  mockCashDrawerCount,
  mockTransactionFind,
  mockExpenseFind,
  mockGetCurrentUser,
  mockRequireRole,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockBookingFindOne: vi.fn(),
  mockBookingFindOneAndUpdate: vi.fn(),
  mockBookingFind: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockCashDrawerFind: vi.fn(),
  mockCashDrawerFindOne: vi.fn(),
  mockCashDrawerCreate: vi.fn(),
  mockCashDrawerCount: vi.fn(),
  mockTransactionFind: vi.fn(),
  mockExpenseFind: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockRequireAuth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getCurrentUser: mockGetCurrentUser, requireRole: mockRequireRole, requireAuth: mockRequireAuth };
});
vi.mock('@/lib/notifications', () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingCancellation: vi.fn().mockResolvedValue(undefined),
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
    findOne: mockUserFindOne,
  },
}));
vi.mock('@/models/Booking', () => ({
  default: {
    findOne: mockBookingFindOne,
    findOneAndUpdate: mockBookingFindOneAndUpdate,
    find: mockBookingFind,
  },
}));
vi.mock('@/models/CashDrawerSession', () => ({
  default: {
    find: mockCashDrawerFind,
    findOne: mockCashDrawerFindOne,
    create: mockCashDrawerCreate,
    countDocuments: mockCashDrawerCount,
  },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: mockTransactionFind },
}));
vi.mock('@/models/Expense', () => ({
  default: { find: mockExpenseFind },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const BOOKING_ID = 'book-1';
const BOOKING_URL = `http://localhost/api/bookings/${BOOKING_ID}`;

const mockBooking = {
  _id: BOOKING_ID,
  customerName: 'Jane Doe',
  customerEmail: 'jane@test.com',
  customerPhone: '555-0001',
  serviceName: 'Haircut',
  startTime: new Date('2024-06-01T10:00:00Z'),
  endTime: new Date('2024-06-01T11:00:00Z'),
  duration: 60,
  status: 'pending',
  tenantId: 'tenant-1',
  isActive: true,
  staffName: undefined,
  notes: undefined,
  confirmationSent: false,
  save: vi.fn().mockResolvedValue(undefined),
};

const mockParams = { params: Promise.resolve({ id: BOOKING_ID }) };

// ===========================================================================
// BOOKINGS /[id]
// ===========================================================================

describe('GET /api/bookings/[id]', () => {
  let GET: (req: NextRequest, ctx: typeof mockParams) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(adminUser);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFindOne.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockBooking),
    });
    ({ GET } = await import('@/app/api/bookings/[id]/route'));
  });

  it('returns 200 with booking data', async () => {
    const res = await GET(makeRequest('GET', BOOKING_URL), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customerName).toBe('Jane Doe');
  });

  it('returns 404 when booking not found', async () => {
    mockBookingFindOne.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(makeRequest('GET', BOOKING_URL), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/booking not found/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', BOOKING_URL), mockParams);
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', BOOKING_URL), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });
});

describe('PUT /api/bookings/[id]', () => {
  let PUT: (req: NextRequest, ctx: typeof mockParams) => Promise<Response>;

  const updatedBooking = {
    ...mockBooking,
    customerName: 'Updated Name',
    populate: vi.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(adminUser);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFindOne.mockResolvedValue({ ...mockBooking, save: vi.fn() });
    mockBookingFind.mockResolvedValue([]); // no conflicts
    mockBookingFindOneAndUpdate.mockReturnValue({
      populate: vi.fn().mockResolvedValue(updatedBooking),
    });
    ({ PUT } = await import('@/app/api/bookings/[id]/route'));
  });

  it('returns 200 on successful update', async () => {
    const res = await PUT(
      makeRequest('PUT', BOOKING_URL, { customerName: 'Updated Name' }),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', BOOKING_URL, { customerName: 'x' }), mockParams);
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking not found', async () => {
    mockBookingFindOne.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', BOOKING_URL, { customerName: 'x' }), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/booking not found/i);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', BOOKING_URL, {}), mockParams);
    expect(res.status).toBe(404);
  });

  it('returns 409 when time change causes staff conflict', async () => {
    const conflictingBooking = { _id: 'conflict-1', staffId: { toString: () => 'staff-1' } };
    mockBookingFind.mockResolvedValue([conflictingBooking]);
    const res = await PUT(
      makeRequest('PUT', BOOKING_URL, { startTime: '2024-06-01T12:00:00Z', staffId: 'staff-1' }),
      mockParams
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/staff member already has a booking/i);
  });

  it('returns 404 when new staffId is not found', async () => {
    mockUserFindOne.mockResolvedValue(null);
    const res = await PUT(
      makeRequest('PUT', BOOKING_URL, { staffId: 'bad-staff' }),
      mockParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/staff member not found/i);
  });
});

describe('DELETE /api/bookings/[id]', () => {
  let DELETE: (req: NextRequest, ctx: typeof mockParams) => Promise<Response>;

  const saveMock = vi.fn().mockResolvedValue(undefined);
  const bookingWithSave = { ...mockBooking, save: saveMock };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(adminUser);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFindOne.mockResolvedValue(bookingWithSave);
    ({ DELETE } = await import('@/app/api/bookings/[id]/route'));
  });

  it('returns 200 on successful soft-delete', async () => {
    const res = await DELETE(makeRequest('DELETE', BOOKING_URL), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(saveMock).toHaveBeenCalled();
  });

  it('returns 404 when booking not found', async () => {
    mockBookingFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', BOOKING_URL), mockParams);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', BOOKING_URL), mockParams);
    expect(res.status).toBe(401);
  });

  it('marks booking as cancelled', async () => {
    await DELETE(makeRequest('DELETE', BOOKING_URL), mockParams);
    expect(bookingWithSave.status).toBe('cancelled');
    expect(bookingWithSave.isActive).toBe(false);
  });
});

// ===========================================================================
// CASH DRAWER SESSIONS
// ===========================================================================

describe('GET /api/cash-drawer/sessions', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockSession = {
    _id: 'sess-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    status: 'open',
    openingAmount: 100,
    openingTime: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(adminUser);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockCashDrawerFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSession]),
    });
    mockCashDrawerCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  it('returns 200 with session list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/cash-drawer/sessions (open / close)', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const openSession = {
    _id: 'sess-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    status: 'open',
    openingAmount: 100,
    openingTime: new Date('2024-06-01T09:00:00Z'),
    save: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(adminUser);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockCashDrawerFindOne.mockResolvedValue(null); // no open session by default
    mockCashDrawerCreate.mockResolvedValue({ ...openSession });
    mockTransactionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockExpenseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    ({ POST } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  // ---- OPEN ----

  it('returns 201 on successful open', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 100,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockCashDrawerCreate).toHaveBeenCalled();
  });

  it('returns 400 when drawer is already open', async () => {
    mockCashDrawerFindOne.mockResolvedValue(openSession);
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already an open cash drawer session/i);
  });

  it('returns 400 when opening amount is negative', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: -10,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-negative/i);
  });

  it('returns 400 when opening amount is missing/NaN', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 'abc',
    }));
    expect(res.status).toBe(400);
  });

  // ---- CLOSE ----

  it('returns 200 on successful close', async () => {
    // First findOne (by userId) returns the open session
    mockCashDrawerFindOne.mockResolvedValue({ ...openSession, save: vi.fn().mockResolvedValue(undefined) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 150,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when no open session to close', async () => {
    // User's session not found, requireRole passes, any session also not found
    mockCashDrawerFindOne
      .mockResolvedValueOnce(null)  // user's own session
      .mockResolvedValueOnce(null); // fallback any session
    mockRequireRole.mockResolvedValue(undefined);
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 150,
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no open cash drawer session/i);
  });

  it('returns 400 when closing amount is negative', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: -5,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-negative/i);
  });

  // ---- INVALID ACTION ----

  it('returns 400 for unknown action', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'recount',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/open.*close/i);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 100,
    }));
    expect(res.status).toBe(404);
  });
});
