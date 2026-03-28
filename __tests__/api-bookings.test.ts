/**
 * Section 11 — Bookings & Appointments
 * Tests: 11.1 – 11.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/validation', () => ({ validateEmail: vi.fn().mockReturnValue(true) }));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
  requireRole: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/notifications', () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingCancellation: vi.fn().mockResolvedValue(undefined),
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth-customer', () => ({
  requireCustomerAuth: vi.fn().mockRejectedValue(new Error('Unauthorized')),
}));
vi.mock('@/models/User', () => ({
  default: { findById: vi.fn(), findOne: vi.fn() },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/Product', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/Booking', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/Customer', () => ({
  default: { findById: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth, requireRole, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { checkFeatureAccess } from '@/lib/subscription';
import { sendBookingReminder } from '@/lib/notifications';
import Tenant from '@/models/Tenant';
import Product from '@/models/Product';
import Booking from '@/models/Booking';
import User from '@/models/User';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const BOOKING_ID = 'booking1';
const CUSTOMER_ID = 'cust1';
const FUTURE_TIME = '2099-01-01T10:00:00.000Z';

const mockTenantDoc = { _id: TENANT_ID, slug: 'tenant-slug', isActive: true };
const mockUserDoc = { _id: 'user1', name: 'John Doe', email: 'john@example.com' };
const mockBookingDoc = {
  _id: BOOKING_ID,
  tenantId: TENANT_ID,
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  serviceName: 'Haircut',
  startTime: new Date(FUTURE_TIME),
  endTime: new Date('2099-01-01T11:00:00.000Z'),
  duration: 60,
  status: 'pending',
};
const mockServiceDoc = {
  _id: 'svc1',
  tenantId: TENANT_ID,
  name: 'Haircut',
  price: 100,
  productType: 'service',
};

const makeBookingDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockBookingDoc,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
});

const req = (method: string, url: string, body?: unknown, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 11.1  POST /api/booking ────────────────────────────────────────────────
describe('POST /api/booking (11.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenantDoc) } as any);
    vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUserDoc) } as any);
    vi.mocked(Booking.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    vi.mocked(Booking.create).mockResolvedValue({ _id: BOOKING_ID, ...mockBookingDoc } as any);
  });

  it('creates booking and returns 201', async () => {
    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', {
      tenantId: 'tenant-slug',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', { tenantId: 'tenant-slug' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', {
      tenantId: 'bad-tenant',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', {
      tenantId: 'tenant-slug',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when startTime is in the past', async () => {
    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', {
      tenantId: 'tenant-slug',
      serviceName: 'Haircut',
      startTime: '2000-01-01T10:00:00.000Z',
      duration: 60,
    }));
    expect(res.status).toBe(400);
  });
});

// ── 11.2  GET /api/booking/availability ───────────────────────────────────
describe('GET /api/booking/availability (11.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenantDoc) } as any);
    vi.mocked(Product.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockServiceDoc) } as any);
    vi.mocked(Booking.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
  });

  it('returns available time slots array', async () => {
    const { GET } = await import('@/app/api/booking/availability/route');
    const res = await GET(req('GET', '/api/booking/availability?tenantId=tenant-slug&serviceId=svc1&date=2099-01-01'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slots).toBeInstanceOf(Array);
    expect(body.data.duration).toBe(60);
  });

  it('returns 400 when required params missing', async () => {
    const { GET } = await import('@/app/api/booking/availability/route');
    const res = await GET(req('GET', '/api/booking/availability'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/booking/availability/route');
    const res = await GET(req('GET', '/api/booking/availability?tenantId=bad&serviceId=svc1&date=2099-01-01'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when service not found', async () => {
    vi.mocked(Product.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/booking/availability/route');
    const res = await GET(req('GET', '/api/booking/availability?tenantId=tenant-slug&serviceId=bad&date=2099-01-01'));
    expect(res.status).toBe(404);
  });
});

// ── 11.3  GET /api/bookings ────────────────────────────────────────────────
describe('GET /api/bookings (11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockBookingDoc]),
        }),
      }),
    } as any);
  });

  it('returns list of bookings', async () => {
    const { GET } = await import('@/app/api/bookings/route');
    const res = await GET(req('GET', '/api/bookings'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { GET } = await import('@/app/api/bookings/route');
    const res = await GET(req('GET', '/api/bookings'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/bookings/route');
    const res = await GET(req('GET', '/api/bookings'));
    expect(res.status).toBe(404);
  });
});

// ── 11.3  POST /api/bookings ───────────────────────────────────────────────
describe('POST /api/bookings (11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // requireCustomerAuth throws → falls back to staff auth
    vi.mocked(requireCustomerAuth).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    // Conflict check: find returns empty array
    vi.mocked(Booking.find).mockResolvedValue([] as any);
    vi.mocked(Booking.create).mockResolvedValue({ _id: BOOKING_ID, ...mockBookingDoc } as any);
    vi.mocked(Booking.findById).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockBookingDoc),
      }),
    } as any);
  });

  it('creates booking and returns 201', async () => {
    const { POST } = await import('@/app/api/bookings/route');
    const res = await POST(req('POST', '/api/bookings', {
      customerName: 'John Doe',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.serviceName).toBe('Haircut');
  });

  it('returns 400 when required fields missing', async () => {
    const { POST } = await import('@/app/api/bookings/route');
    const res = await POST(req('POST', '/api/bookings', { serviceName: 'Haircut' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { POST } = await import('@/app/api/bookings/route');
    const res = await POST(req('POST', '/api/bookings', {
      customerName: 'John Doe',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(403);
  });
});

// ── 11.4  GET /api/bookings/[id] ──────────────────────────────────────────
describe('GET /api/bookings/[id] (11.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockBookingDoc),
      }),
    } as any);
  });

  it('returns booking by id', async () => {
    const { GET } = await import('@/app/api/bookings/[id]/route');
    const res = await GET(
      req('GET', `/api/bookings/${BOOKING_ID}`),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.serviceName).toBe('Haircut');
  });

  it('returns 404 when booking not found', async () => {
    vi.mocked(Booking.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as any);
    const { GET } = await import('@/app/api/bookings/[id]/route');
    const res = await GET(
      req('GET', `/api/bookings/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 11.4  PUT /api/bookings/[id] ──────────────────────────────────────────
describe('PUT /api/bookings/[id] (11.4)', () => {
  const existingDoc = makeBookingDoc({ status: 'pending', confirmationSent: false });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    // findOne returns existing booking doc (no .lean())
    vi.mocked(Booking.findOne).mockResolvedValue(existingDoc as any);
    vi.mocked(Booking.findByIdAndUpdate).mockReturnValue({
      populate: vi.fn().mockResolvedValue({ ...existingDoc, status: 'confirmed' }),
    } as any);
  });

  it('updates booking status and returns 200', async () => {
    const { PUT } = await import('@/app/api/bookings/[id]/route');
    const res = await PUT(
      req('PUT', `/api/bookings/${BOOKING_ID}`, { status: 'confirmed' }),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when booking not found', async () => {
    vi.mocked(Booking.findOne).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/bookings/[id]/route');
    const res = await PUT(
      req('PUT', `/api/bookings/bad-id`, { status: 'confirmed' }),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 11.4  DELETE /api/bookings/[id] ───────────────────────────────────────
describe('DELETE /api/bookings/[id] (11.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.findOne).mockResolvedValue(makeBookingDoc({ status: 'pending' }) as any);
  });

  it('soft-deletes booking and returns 200', async () => {
    const { DELETE } = await import('@/app/api/bookings/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/bookings/${BOOKING_ID}`),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when booking not found', async () => {
    vi.mocked(Booking.findOne).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/bookings/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/bookings/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 11.5  GET /api/bookings/customer/[customerId] ─────────────────────────
describe('GET /api/bookings/customer/[customerId] (11.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCustomerAuth).mockResolvedValue({
      customerId: CUSTOMER_ID,
      tenantId: TENANT_ID,
      email: 'john@example.com',
      phone: '555-1234',
    } as any);
    vi.mocked(Booking.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockBookingDoc]),
        }),
      }),
    } as any);
  });

  it('returns bookings for authenticated customer', async () => {
    const { GET } = await import('@/app/api/bookings/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/bookings/customer/${CUSTOMER_ID}`),
      { params: Promise.resolve({ customerId: CUSTOMER_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 when customer accesses another customer bookings', async () => {
    const { GET } = await import('@/app/api/bookings/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/bookings/customer/other-cust`),
      { params: Promise.resolve({ customerId: 'other-cust' }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireCustomerAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/bookings/customer/[customerId]/route');
    const res = await GET(
      req('GET', `/api/bookings/customer/${CUSTOMER_ID}`, undefined, ''),
      { params: Promise.resolve({ customerId: CUSTOMER_ID }) }
    );
    expect(res.status).toBe(401);
  });
});

// ── 11.6  GET /api/bookings/time-slots ────────────────────────────────────
describe('GET /api/bookings/time-slots (11.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
  });

  it('returns available time slots for a date', async () => {
    const { GET } = await import('@/app/api/bookings/time-slots/route');
    const res = await GET(req('GET', '/api/bookings/time-slots?date=2099-01-01'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slots).toBeInstanceOf(Array);
  });

  it('returns 400 when date param is missing', async () => {
    const { GET } = await import('@/app/api/bookings/time-slots/route');
    const res = await GET(req('GET', '/api/bookings/time-slots'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { GET } = await import('@/app/api/bookings/time-slots/route');
    const res = await GET(req('GET', '/api/bookings/time-slots?date=2099-01-01'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/bookings/time-slots/route');
    const res = await GET(req('GET', '/api/bookings/time-slots?date=2099-01-01'));
    expect(res.status).toBe(404);
  });
});

// ── 11.7  POST /api/bookings/[id]/reminder ────────────────────────────────
describe('POST /api/bookings/[id]/reminder (11.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockBookingDoc) } as any);
    vi.mocked(Booking.findByIdAndUpdate).mockResolvedValue(undefined as any);
    vi.mocked(sendBookingReminder).mockResolvedValue(undefined as any);
  });

  it('sends reminder and returns 200', async () => {
    const { POST } = await import('@/app/api/bookings/[id]/reminder/route');
    const res = await POST(
      req('POST', `/api/bookings/${BOOKING_ID}/reminder`),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(sendBookingReminder)).toHaveBeenCalled();
  });

  it('returns 404 when booking not found', async () => {
    vi.mocked(Booking.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { POST } = await import('@/app/api/bookings/[id]/reminder/route');
    const res = await POST(
      req('POST', `/api/bookings/bad-id/reminder`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when booking is cancelled', async () => {
    vi.mocked(Booking.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...mockBookingDoc, status: 'cancelled' }),
    } as any);
    const { POST } = await import('@/app/api/bookings/[id]/reminder/route');
    const res = await POST(
      req('POST', `/api/bookings/${BOOKING_ID}/reminder`),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );
    expect(res.status).toBe(400);
  });
});

// ── 11.8  POST /api/bookings/reminders/send ───────────────────────────────
describe('POST /api/bookings/reminders/send (11.8)', () => {
  const upcomingBooking = { ...mockBookingDoc, _id: { toString: () => BOOKING_ID } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Booking.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([upcomingBooking]) } as any);
    vi.mocked(Booking.findByIdAndUpdate).mockResolvedValue(undefined as any);
    vi.mocked(sendBookingReminder).mockResolvedValue(undefined as any);
  });

  it('sends batch reminders and returns sent count', async () => {
    const { POST } = await import('@/app/api/bookings/reminders/send/route');
    const res = await POST(req('POST', '/api/bookings/reminders/send'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results.total).toBe(1);
    expect(body.results.sent).toBe(1);
    expect(body.results.failed).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any);
    const { POST } = await import('@/app/api/bookings/reminders/send/route');
    const res = await POST(req('POST', '/api/bookings/reminders/send'));
    expect(res.status).toBe(401);
  });

  it('counts failed reminders when notification throws', async () => {
    vi.mocked(sendBookingReminder).mockRejectedValue(new Error('Email failed'));
    const { POST } = await import('@/app/api/bookings/reminders/send/route');
    const res = await POST(req('POST', '/api/bookings/reminders/send'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.failed).toBe(1);
    expect(body.results.sent).toBe(0);
  });
});

// ── 11.9  Double-booking prevention ───────────────────────────────────────
describe('Double-booking prevention (11.9)', () => {
  it('POST /api/booking returns 409 on time conflict', async () => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenantDoc) } as any);
    vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUserDoc) } as any);
    // Conflict: findOne returns an existing booking
    vi.mocked(Booking.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeBookingDoc({ status: 'confirmed' })),
    } as any);

    const { POST } = await import('@/app/api/booking/route');
    const res = await POST(req('POST', '/api/booking', {
      tenantId: 'tenant-slug',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(409);
  });

  it('POST /api/bookings returns 409 on time conflict', async () => {
    vi.clearAllMocks();
    vi.mocked(requireCustomerAuth).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    // Conflict: find returns a non-empty array
    vi.mocked(Booking.find).mockResolvedValue([makeBookingDoc({ status: 'confirmed' })] as any);

    const { POST } = await import('@/app/api/bookings/route');
    const res = await POST(req('POST', '/api/bookings', {
      customerName: 'John Doe',
      serviceName: 'Haircut',
      startTime: FUTURE_TIME,
      duration: 60,
    }));
    expect(res.status).toBe(409);
  });
});
