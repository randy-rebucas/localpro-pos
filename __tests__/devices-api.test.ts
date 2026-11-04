process.env.JWT_SECRET = 'test-secret-for-devices-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

const repos = {
  devices: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors');
  return {
    getRepos: () => repos,
    isDuplicateKeyError: actual.isDuplicateKeyError,
  };
});

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
});

// ---------------------------------------------------------------------------
// GET /api/devices
// ---------------------------------------------------------------------------

describe('GET /api/devices', () => {
  it('scopes the query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    repos.devices.list.mockResolvedValue([{ _id: 'd1', tenantId: TENANT_A }]);

    const res = await GET(createRequest('/api/devices'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ _id: 'd1', tenantId: TENANT_A }]);
    expect(repos.devices.list).toHaveBeenCalledWith(TENANT_A, {});
  });

  it('passes the isActive filter through when provided', async () => {
    authAs(TENANT_A);
    repos.devices.list.mockResolvedValue([]);

    await GET(createRequest('/api/devices?isActive=false'));

    expect(repos.devices.list).toHaveBeenCalledWith(TENANT_A, { isActive: false });
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
    expect(repos.devices.create).not.toHaveBeenCalled();
  });

  it('requires label, serialNumber, and terminalId', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/devices', 'POST', { label: 'Front Counter' }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(repos.devices.create).not.toHaveBeenCalled();
  });

  it('creates the device scoped to the authenticated tenant', async () => {
    authAs(TENANT_A);
    repos.devices.create.mockResolvedValue({ _id: 'd1', tenantId: TENANT_A });

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ _id: 'd1', tenantId: TENANT_A });
    expect(repos.devices.create).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({
        label: 'Front Counter',
        serialNumber: 'SN1',
        terminalId: 'T-01',
        branchId: undefined,
        ptuStatus: 'pending',
        isActive: true,
        registeredBy: 'user-1',
      })
    );
  });

  it('returns 409 on duplicate terminalId/serialNumber', async () => {
    authAs(TENANT_A);
    const dupErr = new Error('duplicate') as Error & { code: number };
    dupErr.code = 11000;
    repos.devices.create.mockRejectedValue(dupErr);

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01',
    }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('returns 409 when the repository throws DuplicateKeyError', async () => {
    authAs(TENANT_A);
    const { DuplicateKeyError } = await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors');
    repos.devices.create.mockRejectedValue(new DuplicateKeyError());

    const res = await POST(createRequest('/api/devices', 'POST', {
      label: 'Front Counter', serialNumber: 'SN1', terminalId: 'T-01',
    }));
    const { status } = await parseResponse(res);

    expect(status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/devices/:id
// ---------------------------------------------------------------------------

describe('PUT /api/devices/:id', () => {
  it('404s when the device does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    repos.devices.update.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(repos.devices.update).toHaveBeenCalledWith(TENANT_B, 'd1', expect.anything());
  });

  it('rejects update when the caller lacks devices.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.devices.update).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    const before = { _id: 'd1', label: 'Old Label', terminalId: 'T-01' };
    const after = { _id: 'd1', label: 'New Label', terminalId: 'T-01' };
    repos.devices.update.mockResolvedValue({ before, after, changed: ['label'] });

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { label: 'New Label' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual(after);
    const patch = repos.devices.update.mock.calls[0][2];
    expect(repos.devices.update.mock.calls[0][0]).toBe(TENANT_A);
    expect(patch.label).toBe('New Label');
    for (const key of ['serialNumber', 'terminalId', 'branchId', 'ptuNumber', 'ptuStatus', 'isActive']) {
      expect(patch[key]).toBeUndefined();
    }
  });

  it('clears branchId when an empty value is sent', async () => {
    authAs(TENANT_A);
    const device = { _id: 'd1', label: 'L', terminalId: 'T-01' };
    repos.devices.update.mockResolvedValue({ before: device, after: device, changed: ['branchId'] });

    await PUT(createRequest('/api/devices/d1', 'PUT', { branchId: '' }), {
      params: Promise.resolve({ id: 'd1' }),
    });

    expect(repos.devices.update.mock.calls[0][2].branchId).toBeNull();
  });

  it('returns 409 on duplicate terminalId/serialNumber during update', async () => {
    authAs(TENANT_A);
    const dupErr = new Error('duplicate') as Error & { code: number };
    dupErr.code = 11000;
    repos.devices.update.mockRejectedValue(dupErr);

    const res = await PUT(createRequest('/api/devices/d1', 'PUT', { terminalId: 'T-02' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/devices/:id (soft delete)
// ---------------------------------------------------------------------------

describe('DELETE /api/devices/:id', () => {
  it('soft-deletes by setting isActive to false, not removing the document', async () => {
    authAs(TENANT_A);
    const device = { _id: 'd1', label: 'Front Counter', terminalId: 'T-01', isActive: true };
    repos.devices.update.mockResolvedValue({
      before: device,
      after: { ...device, isActive: false },
      changed: ['isActive'],
    });

    const res = await DELETE(createRequest('/api/devices/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(repos.devices.update).toHaveBeenCalledWith(TENANT_A, 'd1', { isActive: false });
  });

  it('404s for a device outside the caller tenant', async () => {
    authAs(TENANT_B);
    repos.devices.update.mockResolvedValue(null);

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
    expect(repos.devices.update).not.toHaveBeenCalled();
  });
});
