process.env.JWT_SECRET = 'test-secret-32chars-invoices!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockInvoiceFind,
  mockInvoiceCreate,
  mockInvoiceCount,
  mockTransactionFindOne,
  mockCustomerFindOne,
  mockAttendanceFind,
  mockAttendanceFindOne,
  mockAttendanceCreate,
  mockRequireAuth,
  mockGenerateInvoiceNumber,
} = vi.hoisted(() => ({
  mockInvoiceFind: vi.fn(),
  mockInvoiceCreate: vi.fn(),
  mockInvoiceCount: vi.fn(),
  mockTransactionFindOne: vi.fn(),
  mockCustomerFindOne: vi.fn(),
  mockAttendanceFind: vi.fn(),
  mockAttendanceFindOne: vi.fn(),
  mockAttendanceCreate: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockGenerateInvoiceNumber: vi.fn().mockResolvedValue('INV-20240101-00001'),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    INVOICE_CREATE: 'INVOICE_CREATE',
    ATTENDANCE_CLOCK_IN: 'ATTENDANCE_CLOCK_IN',
    ATTENDANCE_CLOCK_OUT: 'ATTENDANCE_CLOCK_OUT',
  },
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
vi.mock('@/lib/receipt', () => ({
  generateInvoiceNumber: mockGenerateInvoiceNumber,
  generateReceiptNumber: vi.fn().mockResolvedValue('REC-20240101-00001'),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Invoice', () => ({
  default: {
    find: mockInvoiceFind,
    create: mockInvoiceCreate,
    countDocuments: mockInvoiceCount,
  },
}));
vi.mock('@/models/Transaction', () => ({
  default: { findOne: mockTransactionFindOne },
}));
vi.mock('@/models/Customer', () => ({
  default: { findOne: mockCustomerFindOne },
}));
vi.mock('@/models/Attendance', () => ({
  default: {
    find: mockAttendanceFind,
    findOne: mockAttendanceFindOne,
    create: mockAttendanceCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const staffUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' };

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockInvoice = {
  _id: 'inv-1',
  invoiceNumber: 'INV-20240101-00001',
  total: 1000,
  status: 'draft',
  tenantId: 'tenant-1',
};

const validInvoiceBody = {
  items: [{ name: 'Widget', quantity: 1, unitPrice: 1000 }],
  subtotal: 1000,
  taxAmount: 120,
  total: 1120,
  dueDate: '2024-02-01',
};

// ===========================================================================
// INVOICES
// ===========================================================================

describe('GET /api/invoices', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockInvoiceFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockInvoice]),
    });
    mockInvoiceCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/invoices/route'));
  });

  it('returns 200 with invoice list and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/invoices'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].invoiceNumber).toBe('INV-20240101-00001');
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty array when no invoices', async () => {
    mockInvoiceFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockInvoiceCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/invoices'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 403 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/invoices'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/invoices', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockGenerateInvoiceNumber.mockResolvedValue('INV-20240101-00001');
    mockTransactionFindOne.mockResolvedValue(null); // no transaction by default
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockInvoiceCreate.mockResolvedValue({ _id: 'inv-new', ...validInvoiceBody, invoiceNumber: 'INV-20240101-00001', tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/invoices/route'));
  });

  it('returns 201 on successful invoice creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/invoices', validInvoiceBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invoiceNumber).toBe('INV-20240101-00001');
  });

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/invoices', { ...validInvoiceBody, items: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/items are required/i);
  });

  it('returns 400 when items is missing', async () => {
    const { items: _i, ...bodyWithoutItems } = validInvoiceBody;
    const res = await POST(makeRequest('POST', 'http://localhost/api/invoices', bodyWithoutItems));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required financial fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/invoices', {
      items: [{ name: 'x', quantity: 1, unitPrice: 100 }],
      // missing subtotal, taxAmount, total, dueDate
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/subtotal/i);
  });

  it('returns 404 when transactionId is provided but not found', async () => {
    mockTransactionFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/invoices', {
      ...validInvoiceBody,
      transactionId: 'txn-nonexistent',
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/transaction not found/i);
  });

  it('generates invoice number for each new invoice', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/invoices', validInvoiceBody));
    expect(mockGenerateInvoiceNumber).toHaveBeenCalledWith('tenant-1');
  });

  it('uses customer info from DB when customerId provided without customerInfo', async () => {
    mockCustomerFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
        phone: '555-1234',
        addresses: [],
      }),
    });
    await POST(makeRequest('POST', 'http://localhost/api/invoices', {
      ...validInvoiceBody,
      customerId: 'cust-1',
    }));
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customerInfo: expect.objectContaining({ name: 'Jane Doe' }),
      })
    );
  });
});

// ===========================================================================
// ATTENDANCE
// ===========================================================================

describe('GET /api/attendance', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(staffUser);
    mockAttendanceFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'att-1', userId: 'user-1', clockIn: new Date() }]),
    });
    ({ GET } = await import('@/app/api/attendance/route'));
  });

  it('returns 200 with attendance records', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 200 with empty array when no records', async () => {
    mockAttendanceFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/attendance'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/attendance (clock-in / clock-out)', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(staffUser);
    mockAttendanceFindOne.mockResolvedValue(null); // no active session by default
    mockAttendanceCreate.mockResolvedValue({
      _id: 'att-new',
      userId: 'user-1',
      tenantId: 'tenant-1',
      clockIn: new Date(),
      clockOut: null,
    });
    ({ POST } = await import('@/app/api/attendance/route'));
  });

  it('returns 200 on successful clock-in', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'clock-in' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockAttendanceCreate).toHaveBeenCalled();
  });

  it('returns 400 when already clocked in', async () => {
    mockAttendanceFindOne.mockResolvedValue({ _id: 'att-active', clockOut: null });
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'clock-in' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already clocked in/i);
  });

  it('returns 200 on successful clock-out', async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    // clock-out calls findOne({clockOut:null}).sort({clockIn:-1}) → session
    mockAttendanceFindOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue({ _id: 'att-active', clockOut: null, save: saveMock }),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'clock-out' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(saveMock).toHaveBeenCalled();
  });

  it('returns 400 when clock-out with no active session', async () => {
    // findOne().sort() resolves to null → no active session
    mockAttendanceFindOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'clock-out' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active session/i);
  });

  it('returns 400 when action is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'break' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/clock-in.*clock-out/i);
  });

  it('returns 400 when action is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', {}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/attendance', { action: 'clock-in' }));
    expect(res.status).toBe(401);
  });
});
