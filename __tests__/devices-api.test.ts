process.env.JWT_SECRET = 'test-secret-for-devices-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDeviceFindMany = vi.fn();
const mockDeviceFindFirst = vi.fn();
const mockDeviceCreate = vi.fn();
const mockDeviceUpdate = vi.fn();
const mockBranchFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    device: {
      findMany: (...args: unknown[]) => mockDeviceFindMany(...args),
      findFirst: (...args: unknown[]) => mockDeviceFindFirst(...args),
      create: (...args: unknown[]) => mockDeviceCreate(...args),
      update: (...args: unknown[]) => mockDeviceUpdate(...args),
    },
    branch: {
      findFirst: (...args: unknown[]) => mockBranchFindFirst(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: {
    DEVICE_CREATE: 'DEVICE_CREATE',
    DEVICE_UPDATE: 'DEVICE_UPDATE',
    DEVICE_DELETE: 'DEVICE_DELETE',
  },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

import { GET, POST } from '@/app/api/devices/route';
import { PUT, DELETE } from '@/app/api/devices/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockRequireTenantAccess.mockResolvedValue({
    tenantId,
    user: { userId, tenantId, email: 'test@example.com', role },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
  mockBranchFindFirst.mockResolvedValue({ id: 'branch-1', tenantId: TENANT_A });
});

// ---------------------------------------------------------------------------
// GET /api/devices
// ---------------------------------------------------------------------------

describe('GET /api/devices', () => {
  it('scopes the query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockDeviceFindMany.mockResolvedValue([{ id: 'd1', tenantId: TENANT_A }]);

    const res = await GET(createRequest('/api/devices'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeviceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: TENANT_A }),
    }));
  });
});

// ---------------------------------------------------------------------------
// POST /api/devices
// ---------------------------------------------------------------------------

describe('POST /api/devices', () => {
  it('rejects creation when the caller lacks devices.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockDeviceCreate).not.toHaveBeenCalled();
  });

  it('requires label, serialNumber, and terminalId', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/devices', 'POST', { label: 'Front Counter' }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockDeviceCreate).not.toHaveBeenCalled();
  });

  it('creates the device scoped to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockDeviceCreate.mockResolvedValue({ id: 'd1' });

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01', branchId: 'branch-1',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockDeviceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: TENANT_A }),
    }));
  });

  it('rejects when branchId does not belong to the tenant', async () => {
    authAs(TENANT_A);
    mockBranchFindFirst.mockResolvedValue(null);

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01', branchId: 'other-tenant-branch',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockDeviceCreate).not.toHaveBeenCalled();
  });

  it('returns 409 on duplicate terminalId/serialNumber', async () => {
    authAs(TENANT_A);
    const dupErr = new Error('duplicate') as Error & { code: string };
    dupErr.code = 'P2002';
    mockDeviceCreate.mockRejectedValue(dupErr);

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01', branchId: 'branch-1',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/devices/:id
// ---------------------------------------------------------------------------

describe('PUT /api/devices/:id', () => {
  it('404s when the device does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    mockDeviceFindFirst.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockDeviceFindFirst).toHaveBeenCalledWith({ where: { id: 'd1', tenantId: TENANT_B } });
  });

  it('rejects update when the caller lacks devices.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockDeviceFindFirst).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    const oldDevice = { id: 'd1', label: 'Old Label', terminalId: 'T-01' };
    mockDeviceFindFirst.mockResolvedValue(oldDevice);
    mockDeviceUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...oldDevice, ...data })
    );

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'New Label' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect((body.data as { label: string }).label).toBe('New Label');
    expect((body.data as { terminalId: string }).terminalId).toBe('T-01');
    expect(mockDeviceUpdate).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { label: 'New Label' },
    });
  });

  it('rejects reassigning the device to a branch outside the tenant', async () => {
    authAs(TENANT_A);
    mockDeviceFindFirst.mockResolvedValue({ id: 'd1', label: 'Front Counter', terminalId: 'T-01' });
    mockBranchFindFirst.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { branchId: 'other-tenant-branch' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockDeviceUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/devices/:id (soft delete)
// ---------------------------------------------------------------------------

describe('DELETE /api/devices/:id', () => {
  it('soft-deletes by setting isActive to false, not removing the document', async () => {
    authAs(TENANT_A);
    const device = { id: 'd1', label: 'Front Counter', terminalId: 'T-01', isActive: true };
    mockDeviceFindFirst.mockResolvedValue(device);
    mockDeviceUpdate.mockResolvedValue({ ...device, isActive: false });

    const res = await DELETE(createRequest('/api/devices/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeviceUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { isActive: false } });
  });

  it('404s for a device outside the caller tenant', async () => {
    authAs(TENANT_B);
    mockDeviceFindFirst.mockResolvedValue(null);

    const res = await DELETE(createRequest('/api/devices/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it('rejects deactivation when the caller lacks devices.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await DELETE(createRequest('/api/devices/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockDeviceFindFirst).not.toHaveBeenCalled();
  });
});
