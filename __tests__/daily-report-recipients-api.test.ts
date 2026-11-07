import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  permission: vi.fn(),
  tenant: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: mocks.permission }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, remaining: 9, resetAfterMs: 0 }) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit, AuditActions: { UPDATE: 'update' } }));
vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: () => ({ select: () => ({ lean: mocks.tenant }) }),
    updateOne: mocks.update,
  },
}));

import { GET, PUT } from '@/app/api/tenants/[slug]/daily-report/route';

const context = { params: Promise.resolve({ slug: 'store-a' }) };
const url = 'http://localhost/api/tenants/store-a/daily-report';
const put = (body: Record<string, unknown>) =>
  PUT(new NextRequest(url, { method: 'PUT', body: JSON.stringify(body) }), context);

describe('daily report recipients API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-a', role: 'owner' });
    mocks.permission.mockResolvedValue(true);
    mocks.tenant.mockResolvedValue({ _id: 'tenant-a', dailyReport: { email: 'owner@example.com', phone: '+639171234567' } });
    mocks.update.mockResolvedValue({ modifiedCount: 1 });
  });

  it('keeps recipients from anyone not signed in', async () => {
    mocks.user.mockResolvedValue(null);

    const res = await GET(new NextRequest(url), context);

    expect(res.status).toBe(401);
    expect(mocks.tenant).not.toHaveBeenCalled();
  });

  it("keeps recipients from another tenant's staff", async () => {
    mocks.user.mockResolvedValue({ userId: 'u2', tenantId: 'tenant-b', role: 'owner' });

    expect((await GET(new NextRequest(url), context)).status).toBe(403);
    expect((await put({ email: 'x@example.com' })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps recipients from staff who cannot manage settings', async () => {
    mocks.permission.mockResolvedValue(false);

    expect((await GET(new NextRequest(url), context)).status).toBe(403);
  });

  it('returns saved recipients to the owner', async () => {
    const body = await (await GET(new NextRequest(url), context)).json();

    expect(body.data).toEqual({ email: 'owner@example.com', phone: '+639171234567' });
  });

  it('saves a tidied email and number, and audits the change', async () => {
    const res = await put({ email: ' Owner@Example.com ', phone: '+63 917 123-4567' });

    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      { _id: 'tenant-a' },
      { $set: { dailyReport: { email: 'owner@example.com', phone: '+639171234567' } } }
    );
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it('lets both be cleared', async () => {
    expect((await put({ email: '', phone: '' })).status).toBe(200);
  });

  it.each([
    [{ email: 'not-an-email' }],
    [{ phone: '09171234567' }],
  ])('rejects %j', async (body) => {
    expect((await put(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
