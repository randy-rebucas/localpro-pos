process.env.JWT_SECRET = 'test-secret-32chars-cashdrawer!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockNetSocket,
  mockRequireAuth,
  mockGetTenantIdFromRequest,
  mockGetTenantSettingsById,
  mockVerifyCronAuth,
  mockAutoCloseCashDrawers,
  mockSendCashCountReminders,
} = vi.hoisted(() => {
  const socket = {
    connect: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    mockNetSocket: socket,
    mockRequireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
    mockGetTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
    mockGetTenantSettingsById: vi.fn(),
    mockVerifyCronAuth: vi.fn().mockReturnValue(null), // null = authorized
    mockAutoCloseCashDrawers: vi.fn(),
    mockSendCashCountReminders: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('net', () => ({
  default: { Socket: function Socket() { return mockNetSocket; } },
  Socket: function Socket() { return mockNetSocket; },
}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mockGetTenantIdFromRequest,
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth };
});
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: mockGetTenantSettingsById }));
vi.mock('@/lib/automation-auth', () => ({ verifyCronAuth: mockVerifyCronAuth }));
vi.mock('@/lib/automations', () => ({
  autoCloseCashDrawers: mockAutoCloseCashDrawers,
  sendCashCountReminders: mockSendCashCountReminders,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: `auth-token=${token}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const successResult = { success: true, message: '2 sessions closed', processed: 2, failed: 0, errors: [] };

// ===========================================================================
// POST /api/hardware/cash-drawer-kick
// ===========================================================================

describe('POST /api/hardware/cash-drawer-kick', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockGetTenantSettingsById.mockResolvedValue({
      hardwareConfig: { printer: { ipAddress: '192.168.1.100', portNumber: 9100 } },
    });
    // Default: connect and write succeed synchronously
    mockNetSocket.connect.mockImplementation((_port: number, _ip: string, cb: () => void) => cb());
    mockNetSocket.write.mockImplementation((_data: Buffer, cb: (err?: Error) => void) => cb());
    mockNetSocket.on.mockImplementation(() => {});
    ({ POST } = await import('@/app/api/hardware/cash-drawer-kick/route'));
  });

  it('returns 200 when kick is sent successfully', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/kick sent/i);
  });

  it('returns 400 when no printer IP is configured', async () => {
    mockGetTenantSettingsById.mockResolvedValue({ hardwareConfig: {} });
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no network printer/i);
  });

  it('returns 400 when hardwareConfig is missing', async () => {
    mockGetTenantSettingsById.mockResolvedValue({});
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when write fails', async () => {
    mockNetSocket.write.mockImplementation((_data: Buffer, cb: (err?: Error) => void) => cb(new Error('Write failed')));
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/write failed/i);
  });

  it('returns 500 on socket connection error', async () => {
    mockNetSocket.connect.mockImplementation(() => {}); // never calls callback
    mockNetSocket.on.mockImplementation((event: string, cb: (err: Error) => void) => {
      if (event === 'error') Promise.resolve().then(() => cb(new Error('Connection refused')));
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/connection refused/i);
  });

  it('returns 500 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/hardware/cash-drawer-kick'));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// POST /api/automations/cash-drawer/auto-close
// ===========================================================================

describe('POST /api/automations/cash-drawer/auto-close', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockAutoCloseCashDrawers.mockResolvedValue(successResult);
    ({ POST } = await import('@/app/api/automations/cash-drawer/auto-close/route'));
  });

  it('returns 200 with automation result', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/auto-close', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(2);
  });

  it('passes tenantId and forceClose to autoCloseCashDrawers', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/auto-close', {
      tenantId: 'tenant-1',
      forceClose: true,
    }));
    expect(mockAutoCloseCashDrawers).toHaveBeenCalledWith({ tenantId: 'tenant-1', forceClose: true });
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/auto-close', {}));
    expect(res.status).toBe(401);
  });

  it('returns 500 when automation throws', async () => {
    mockAutoCloseCashDrawers.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/auto-close', {}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/automations/cash-drawer/auto-close
// ===========================================================================

describe('GET /api/automations/cash-drawer/auto-close', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockAutoCloseCashDrawers.mockResolvedValue(successResult);
    ({ GET } = await import('@/app/api/automations/cash-drawer/auto-close/route'));
  });

  it('returns 200 with automation result', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/auto-close'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('passes forceClose=true from query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/auto-close?forceClose=true&tenantId=t1'));
    expect(mockAutoCloseCashDrawers).toHaveBeenCalledWith(
      expect.objectContaining({ forceClose: true, tenantId: 't1' })
    );
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/auto-close'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/automations/cash-drawer/reminders
// ===========================================================================

describe('POST /api/automations/cash-drawer/reminders', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const reminderResult = { success: true, message: '3 reminders sent', processed: 3, failed: 0, errors: [] };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSendCashCountReminders.mockResolvedValue(reminderResult);
    ({ POST } = await import('@/app/api/automations/cash-drawer/reminders/route'));
  });

  it('returns 200 with reminder result', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/reminders', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(3);
  });

  it('passes tenantId and reminderMinutesBefore to sendCashCountReminders', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/reminders', {
      tenantId: 'tenant-1',
      reminderMinutesBefore: 15,
    }));
    expect(mockSendCashCountReminders).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      reminderMinutesBefore: 15,
    });
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/reminders', {}));
    expect(res.status).toBe(401);
  });

  it('returns 500 when automation throws', async () => {
    mockSendCashCountReminders.mockRejectedValue(new Error('Notification failed'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/automations/cash-drawer/reminders', {}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/automations/cash-drawer/reminders
// ===========================================================================

describe('GET /api/automations/cash-drawer/reminders', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const reminderResult = { success: true, message: '1 reminder sent', processed: 1, failed: 0, errors: [] };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSendCashCountReminders.mockResolvedValue(reminderResult);
    ({ GET } = await import('@/app/api/automations/cash-drawer/reminders/route'));
  });

  it('returns 200 with reminder result', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/reminders'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);
  });

  it('passes reminderMinutesBefore from query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/reminders?reminderMinutesBefore=45&tenantId=t1'));
    expect(mockSendCashCountReminders).toHaveBeenCalledWith(
      expect.objectContaining({ reminderMinutesBefore: 45, tenantId: 't1' })
    );
  });

  it('returns 401 when unauthorized', async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/automations/cash-drawer/reminders'));
    expect(res.status).toBe(401);
  });
});
