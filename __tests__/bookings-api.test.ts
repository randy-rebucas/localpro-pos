process.env.JWT_SECRET = 'test-secret-32chars-bookings!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockBookingFind,
  mockBookingFindById,
  mockBookingFindByIdAndUpdate,
  mockBookingCreate,
  mockUserFindOne,
  mockGetCurrentUser,
  mockRequireRole,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockBookingFind: vi.fn(),
  mockBookingFindById: vi.fn(),
  mockBookingFindByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
  mockBookingCreate: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 19, resetAt: 0 }),
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
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/webhooks', () => ({ dispatchWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notifications', () => ({ sendBookingConfirmation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth-customer', () => ({
  requireCustomerAuth: vi.fn().mockRejectedValue(new Error('No customer token')),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getCurrentUser: mockGetCurrentUser, requireRole: mockRequireRole };
});
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
    find: mockBookingFind,
    findById: mockBookingFindById,
    findByIdAndUpdate: mockBookingFindByIdAndUpdate,
    create: mockBookingCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const staffUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };

function makeRequest(method: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest('http://localhost/api/bookings', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockBooking = {
  _id: 'book-1',
  customerName: 'Jane Doe',
  serviceName: 'Haircut',
  startTime: new Date('2024-06-01T10:00:00Z'),
  endTime: new Date('2024-06-01T11:00:00Z'),
  duration: 60,
  status: 'pending',
  tenantId: 'tenant-1',
};

const validBookingBody = {
  customerName: 'Jane Doe',
  serviceName: 'Haircut',
  startTime: '2024-06-01T10:00:00Z',
  duration: 60,
};

// ---------------------------------------------------------------------------
// GET /api/bookings
// ---------------------------------------------------------------------------

describe('GET /api/bookings', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(staffUser);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBookingFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockBooking]),
    });
    ({ GET } = await import('@/app/api/bookings/route'));
  });

  it('returns 200 with booking list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].customerName).toBe('Jane Doe');
  });

  it('returns 200 with empty array when no bookings', async () => {
    mockBookingFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------

describe('POST /api/bookings', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const createdBooking = { _id: 'book-new', ...mockBooking };

  beforeEach(async () => {
    vi.clearAllMocks();
    // customer auth fails → staff auth path
    vi.mocked((await import('@/lib/auth-customer')).requireCustomerAuth).mockRejectedValue(
      new Error('No customer token')
    );
    mockGetCurrentUser.mockResolvedValue(staffUser);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 19, resetAt: 0 });
    // No conflicts
    mockBookingFind.mockReturnValue({ lean: undefined, then: undefined });
    mockBookingFind.mockResolvedValue([]);
    mockBookingCreate.mockResolvedValue(createdBooking);
    mockBookingFindById.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(createdBooking),
    });
    ({ POST } = await import('@/app/api/bookings/route'));
  });

  it('returns 201 on successful booking creation', async () => {
    const res = await POST(makeRequest('POST', validBookingBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', { serviceName: 'Haircut' })); // missing customerName, startTime, duration
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 401 when unauthenticated (no customer or staff token)', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', validBookingBody));
    expect(res.status).toBe(401);
  });

  it('returns 403 when booking feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Booking scheduling not available on your plan')
    );
    const res = await POST(makeRequest('POST', validBookingBody));
    expect(res.status).toBe(403);
  });

  it('returns 409 when time slot conflicts with existing booking', async () => {
    mockBookingFind.mockResolvedValue([{ _id: 'conflict-1', status: 'confirmed' }]);
    const res = await POST(makeRequest('POST', validBookingBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/time slot is already booked/i);
  });

  it('returns 409 when staff has a conflicting booking', async () => {
    const conflictingBooking = { _id: 'conflict-1', staffId: { toString: () => 'staff-1' } };
    mockBookingFind.mockResolvedValue([conflictingBooking]);
    const res = await POST(makeRequest('POST', { ...validBookingBody, staffId: 'staff-1' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/staff member already has a booking/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', validBookingBody));
    expect(res.status).toBe(429);
  });

  it('returns 404 when staff ID is invalid', async () => {
    mockBookingFind.mockResolvedValue([]); // no conflicts
    mockUserFindOne.mockResolvedValue(null); // staff not found
    const res = await POST(makeRequest('POST', { ...validBookingBody, staffId: 'bad-staff' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/staff member not found/i);
  });
});
