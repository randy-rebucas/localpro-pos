process.env.JWT_SECRET = 'test-secret-for-booking-api-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CREATE: 'CREATE' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockTenantFindOne = vi.fn();
vi.mock('@/models/Tenant', () => ({
  default: { findOne: (...args: unknown[]) => mockTenantFindOne(...args) },
}));

const mockUserFindOne = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/User', () => ({
  default: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

const mockBookingFind = vi.fn();
const mockBookingFindOne = vi.fn();
const mockBookingCreate = vi.fn();
vi.mock('@/models/Booking', () => ({
  default: {
    find: (...args: unknown[]) => mockBookingFind(...args),
    findOne: (...args: unknown[]) => mockBookingFindOne(...args),
    create: (...args: unknown[]) => mockBookingCreate(...args),
  },
}));

import { GET, POST } from '@/app/api/booking/route';

const TENANT_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const USER_A = 'user-a';
const USER_A2 = 'user-a2';

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

function listRequest(tenantId: string, userId: string) {
  return new NextRequest(new URL(`http://localhost/api/booking?tenantId=${tenantId}&userId=${userId}`));
}

function resolveTenant(id: string) {
  mockTenantFindOne.mockReturnValue(lean({ _id: { toString: () => id } }));
}

describe('POST /api/booking tenant isolation', () => {
  const createRequest = (tenantId: string) =>
    new NextRequest(new URL('http://localhost/api/booking'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        serviceName: 'Haircut',
        startTime: new Date(Date.now() + 864e5).toISOString(),
        duration: 30,
      }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'viewer' });
    mockUserFindById.mockReturnValue(lean({ _id: USER_A, name: 'Person', email: 'person@example.com' }));
    mockBookingFindOne.mockReturnValue(lean(null));
    mockBookingCreate.mockResolvedValue({ _id: { toString: () => 'booking-1' } });
  });

  it('blocks creating a booking in another tenant', async () => {
    resolveTenant(TENANT_B);

    const res = await POST(createRequest(TENANT_B));

    expect(res.status).toBe(403);
    expect(mockBookingFindOne).not.toHaveBeenCalled();
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it('creates a booking in the caller’s own tenant', async () => {
    resolveTenant(TENANT_A);

    const res = await POST(createRequest(TENANT_A));

    expect(res.status).toBe(201);
    expect(mockBookingCreate).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/booking tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindOne.mockReturnValue(lean({ _id: USER_A, email: 'person@example.com' }));
    mockUserFindById.mockReturnValue(lean({ _id: USER_A, email: 'person@example.com' }));
    mockBookingFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue(lean([{ _id: 'booking-1' }])),
      }),
    });
  });

  it("blocks a manager from reading another tenant's bookings", async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'manager' });
    resolveTenant(TENANT_B);

    const res = await GET(listRequest(TENANT_B, 'user-b'));

    expect(res.status).toBe(403);
    expect(mockBookingFind).not.toHaveBeenCalled();
  });

  it('blocks a self-lookup against another tenant, since emails are unverified', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'viewer' });
    resolveTenant(TENANT_B);

    const res = await GET(listRequest(TENANT_B, USER_A));

    expect(res.status).toBe(403);
    expect(mockBookingFind).not.toHaveBeenCalled();
  });

  it('does not resolve a user from outside the tenant', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'manager' });
    resolveTenant(TENANT_A);
    mockUserFindOne.mockReturnValue(lean(null));

    const res = await GET(listRequest(TENANT_A, 'user-b'));

    expect(res.status).toBe(404);
    expect(mockUserFindOne.mock.calls[0][0]).toMatchObject({ _id: 'user-b' });
    expect(String((mockUserFindOne.mock.calls[0][0] as { tenantId: unknown }).tenantId)).toBe(TENANT_A);
    expect(mockBookingFind).not.toHaveBeenCalled();
  });

  it('lets a user list their own bookings in their own tenant', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'viewer' });
    resolveTenant(TENANT_A);

    const res = await GET(listRequest(TENANT_A, USER_A));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
    const filter = mockBookingFind.mock.calls[0][0];
    expect(String(filter.bookedByUserId)).toBe(USER_A);
    expect(filter).not.toHaveProperty('customerEmail');
  });

  it("lets a manager list a colleague's bookings in the same tenant", async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'manager' });
    resolveTenant(TENANT_A);

    const res = await GET(listRequest(TENANT_A, USER_A2));

    expect(res.status).toBe(200);
  });

  it("still blocks a non-manager from another user's bookings", async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_A, tenantId: TENANT_A, role: 'viewer' });
    resolveTenant(TENANT_A);

    const res = await GET(listRequest(TENANT_A, USER_A2));

    expect(res.status).toBe(403);
    expect(mockBookingFind).not.toHaveBeenCalled();
  });
});
