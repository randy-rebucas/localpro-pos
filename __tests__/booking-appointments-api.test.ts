process.env.JWT_SECRET = 'test-secret-32chars-booking123!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockBookingFind,
  mockBookingFindOne,
  mockBookingFindOneAndUpdate,
  mockBookingFindByIdAndUpdate,
  mockBookingCreate,
  mockTenantFindOne,
  mockProductFindOne,
  mockUserFindById,
  mockRequireAuth,
  mockGetCurrentUser,
  mockRequireRole,
  mockRequireCustomerAuth,
  mockSendBookingReminder,
} = vi.hoisted(() => ({
  mockBookingFind: vi.fn(),
  mockBookingFindOne: vi.fn(),
  mockBookingFindOneAndUpdate: vi.fn().mockResolvedValue(undefined),
  mockBookingFindByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
  mockBookingCreate: vi.fn(),
  mockTenantFindOne: vi.fn(),
  mockProductFindOne: vi.fn(),
  mockUserFindById: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockRequireCustomerAuth: vi.fn(),
  mockSendBookingReminder: vi.fn().mockResolvedValue({ email: true, sms: false }),
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
  return {
    ...actual,
    requireAuth: mockRequireAuth,
    getCurrentUser: mockGetCurrentUser,
    requireRole: mockRequireRole,
  };
});
vi.mock('@/lib/auth-customer', () => ({
  requireCustomerAuth: mockRequireCustomerAuth,
}));
vi.mock('@/lib/notifications', () => ({
  sendBookingReminder: mockSendBookingReminder,
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingCancellation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/models/Booking', () => ({
  default: {
    find: mockBookingFind,
    findOne: mockBookingFindOne,
    findOneAndUpdate: mockBookingFindOneAndUpdate,
    findByIdAndUpdate: mockBookingFindByIdAndUpdate,
    create: mockBookingCreate,
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: mockTenantFindOne },
}));
vi.mock('@/models/Product', () => ({
  default: { findOne: mockProductFindOne },
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: mockUserFindById,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const authUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };
const FUTURE_TIME = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockTenant = { _id: 'tenant-1', slug: 'demo', name: 'Demo', isActive: true };
const mockService = {
  _id: 'svc-1',
  name: 'Haircut',
  price: 25,
  productType: 'service',
  tenantId: 'tenant-1',
};
const mockBookingRecord = {
  _id: 'book-1',
  customerName: 'Jane Doe',
  customerEmail: 'jane@test.com',
  customerPhone: '555-0001',
  serviceName: 'Haircut',
  startTime: new Date(FUTURE_TIME),
  endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  duration: 60,
  status: 'pending',
  tenantId: 'tenant-1',
  reminderSent: false,
};

// ===========================================================================
// POST /api/booking  (client booking endpoint)
// ===========================================================================

describe('POST /api/booking (client create)', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authUser);
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: 'Jane Doe', email: 'jane@test.com' }) });
    mockBookingFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); // no conflict
    mockBookingCreate.mockResolvedValue({ _id: 'book-new', ...mockBookingRecord });
    ({ POST } = await import('@/app/api/booking/route'));
  });

  it('returns 201 on successful booking creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockBookingCreate).toHaveBeenCalled();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      // missing serviceName, startTime, duration
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'nonexistent',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 400 when startTime is in the past', async () => {
    const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: pastTime,
      duration: 60,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/past/i);
  });

  it('returns 400 when startTime is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: 'not-a-date',
      duration: 60,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid start time/i);
  });

  it('returns 400 when duration is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: -10,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive number/i);
  });

  it('returns 409 when time slot conflicts', async () => {
    mockBookingFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockBookingRecord) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/booking', {
      tenantId: 'demo',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not available/i);
  });
});

// ===========================================================================
// GET /api/booking  (client list own bookings)
// ===========================================================================

describe('GET /api/booking (client list)', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authUser);
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: 'Jane', email: 'jane@test.com' }) });
    mockBookingFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockBookingRecord]),
    });
    ({ GET } = await import('@/app/api/booking/route'));
  });

  it('returns 200 with own bookings', async () => {
    const res = await GET(makeRequest('GET',
      'http://localhost/api/booking?tenantId=demo&userId=user-1'
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 400 when tenantId or userId missing', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/booking?tenantId=demo'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET',
      'http://localhost/api/booking?tenantId=demo&userId=user-1'
    ));
    expect(res.status).toBe(401);
  });

  it('returns 403 when requesting another user\'s bookings without elevated role', async () => {
    mockRequireAuth.mockResolvedValue({ ...authUser, userId: 'user-1', role: 'viewer' });
    const res = await GET(makeRequest('GET',
      'http://localhost/api/booking?tenantId=demo&userId=user-99'
    ));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/own bookings/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET',
      'http://localhost/api/booking?tenantId=unknown&userId=user-1'
    ));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// GET /api/booking/availability  (public)
// ===========================================================================

describe('GET /api/booking/availability (public)', () => {
  let GET: (req: NextRequest) => Promise<Response>;
  const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockService) });
    mockBookingFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    ({ GET } = await import('@/app/api/booking/availability/route'));
  });

  it('returns 200 with time slots for a service', async () => {
    const res = await GET(makeRequest('GET',
      `http://localhost/api/booking/availability?tenantId=demo&serviceId=svc-1&date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.slots).toBeDefined();
    expect(Array.isArray(body.data.slots)).toBe(true);
    expect(body.data.service.name).toBe('Haircut');
  });

  it('returns 400 when required params are missing', async () => {
    const res = await GET(makeRequest('GET',
      'http://localhost/api/booking/availability?tenantId=demo'
      // missing serviceId and date
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET',
      `http://localhost/api/booking/availability?tenantId=unknown&serviceId=svc-1&date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 404 when service not found', async () => {
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET',
      `http://localhost/api/booking/availability?tenantId=demo&serviceId=bad-svc&date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/service not found/i);
  });

  it('marks slots as unavailable when conflicting bookings exist', async () => {
    // Return a booking that occupies 09:00-10:00
    const selectedDate = new Date(FUTURE_DATE);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(9, 0, 0, 0);
    const slotEnd = new Date(selectedDate);
    slotEnd.setHours(10, 0, 0, 0);
    mockBookingFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{
        startTime: slotStart,
        endTime: slotEnd,
        status: 'confirmed',
        _id: 'book-conflict',
      }]),
    });
    const res = await GET(makeRequest('GET',
      `http://localhost/api/booking/availability?tenantId=demo&serviceId=svc-1&date=${FUTURE_DATE}&startHour=9&endHour=17`
    ));
    const body = await res.json();
    // At least one slot should be unavailable due to the existing booking
    const unavailableSlots = body.data.slots.filter((s: { available: boolean }) => !s.available);
    expect(unavailableSlots.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// GET /api/bookings/time-slots  (staff)
// ===========================================================================

describe('GET /api/bookings/time-slots (staff)', () => {
  let GET: (req: NextRequest) => Promise<Response>;
  const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(authUser);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    ({ GET } = await import('@/app/api/bookings/time-slots/route'));
  });

  it('returns 200 with available slots for a date', async () => {
    const res = await GET(makeRequest('GET',
      `http://localhost/api/bookings/time-slots?date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.slots).toBeDefined();
    expect(Array.isArray(body.data.slots)).toBe(true);
    expect(body.data.slots.length).toBeGreaterThan(0);
  });

  it('returns 400 when date param is missing', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/bookings/time-slots'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date parameter is required/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET',
      `http://localhost/api/bookings/time-slots?date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET',
      `http://localhost/api/bookings/time-slots?date=${FUTURE_DATE}`
    ));
    expect(res.status).toBe(404);
  });

  it('includes booked slot info when conflicting bookings exist', async () => {
    const selectedDate = new Date(FUTURE_DATE);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(9, 0, 0, 0);
    const slotEnd = new Date(selectedDate);
    slotEnd.setHours(10, 0, 0, 0);
    mockBookingFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{
        _id: 'book-taken',
        startTime: slotStart,
        endTime: slotEnd,
        status: 'confirmed',
      }]),
    });
    const res = await GET(makeRequest('GET',
      `http://localhost/api/bookings/time-slots?date=${FUTURE_DATE}`
    ));
    const body = await res.json();
    const takenSlot = body.data.slots.find((s: { available: boolean }) => !s.available);
    expect(takenSlot).toBeDefined();
    expect(takenSlot.bookingId).toBe('book-taken');
  });
});

// ===========================================================================
// GET /api/bookings/customer/[customerId]  (customer portal)
// ===========================================================================

describe('GET /api/bookings/customer/[customerId]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) => Promise<Response>;
  const CUSTOMER_ID = 'cust-1';
  const mockParams = { params: Promise.resolve({ customerId: CUSTOMER_ID }) };
  const mockCustomer = {
    customerId: CUSTOMER_ID,
    tenantId: 'tenant-1',
    email: 'cust@test.com',
    phone: '555-0001',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireCustomerAuth.mockResolvedValue(mockCustomer);
    mockBookingFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockBookingRecord]),
    });
    ({ GET } = await import('@/app/api/bookings/customer/[customerId]/route'));
  });

  it('returns 200 with customer bookings', async () => {
    const res = await GET(
      makeRequest('GET', `http://localhost/api/bookings/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when customer not authenticated', async () => {
    mockRequireCustomerAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(
      makeRequest('GET', `http://localhost/api/bookings/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when accessing another customer\'s bookings', async () => {
    mockRequireCustomerAuth.mockResolvedValue({ ...mockCustomer, customerId: 'other-cust' });
    const res = await GET(
      makeRequest('GET', `http://localhost/api/bookings/customer/${CUSTOMER_ID}`),
      mockParams
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 200 with empty array when customer has no bookings', async () => {
    mockBookingFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(
      makeRequest('GET', `http://localhost/api/bookings/customer/${CUSTOMER_ID}`),
      mockParams
    );
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ===========================================================================
// POST /api/bookings/reminders/send  (bulk)
// ===========================================================================

describe('POST /api/bookings/reminders/send', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(authUser);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([mockBookingRecord]) });
    ({ POST } = await import('@/app/api/bookings/reminders/send/route'));
  });

  it('returns 200 with reminder results', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/bookings/reminders/send'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results.total).toBe(1);
    expect(body.results.sent).toBe(1);
    expect(body.results.failed).toBe(0);
  });

  it('returns 200 with zero when no bookings need reminders', async () => {
    mockBookingFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    const res = await POST(makeRequest('POST', 'http://localhost/api/bookings/reminders/send'));
    const body = await res.json();
    expect(body.results.total).toBe(0);
    expect(body.results.sent).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/bookings/reminders/send'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/bookings/reminders/send'));
    expect(res.status).toBe(404);
  });

  it('records failed reminders without crashing', async () => {
    mockSendBookingReminder.mockRejectedValueOnce(new Error('SMS gateway error'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/bookings/reminders/send'));
    const body = await res.json();
    expect(body.results.failed).toBe(1);
    expect(body.results.sent).toBe(0);
    expect(body.results.details[0].error).toBe('SMS gateway error');
  });
});

// ===========================================================================
// POST /api/bookings/[id]/reminder  (single)
// ===========================================================================

describe('POST /api/bookings/[id]/reminder', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const BOOKING_ID = 'book-1';
  const mockParams = { params: Promise.resolve({ id: BOOKING_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(authUser);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockBookingRecord) });
    ({ POST } = await import('@/app/api/bookings/[id]/reminder/route'));
  });

  it('returns 200 on successful reminder send', async () => {
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/reminder sent/i);
    expect(mockSendBookingReminder).toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking not found', async () => {
    mockBookingFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/booking not found/i);
  });

  it('returns 400 when booking is cancelled', async () => {
    mockBookingFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...mockBookingRecord, status: 'cancelled' }),
    });
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cancelled or completed/i);
  });

  it('returns 400 when booking is completed', async () => {
    mockBookingFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...mockBookingRecord, status: 'completed' }),
    });
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(400);
  });

  it('marks reminderSent after sending', async () => {
    await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: BOOKING_ID }),
      { reminderSent: true }
    );
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await POST(
      makeRequest('POST', `http://localhost/api/bookings/${BOOKING_ID}/reminder`),
      mockParams
    );
    expect(res.status).toBe(404);
  });
});
