/**
 * createAuditLog, the audit-log and super-admin log routes, file uploads and
 * the retention automations, with repositories mocked.
 */
process.env.JWT_SECRET = 'test-secret-for-audit-routes-tests-32chars!';
(process.env as Record<string, string>).NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { TENANT, USER, repos, auth } = vi.hoisted(() => ({
  TENANT: '64abc123def4567890abcdef',
  USER: '64abc123def4567890abc111',
  auth: { requireAuth: vi.fn(), requireRole: vi.fn(), getCurrentUser: vi.fn(), verifyToken: vi.fn() },
  repos: {
    auditLogs: {
      create: vi.fn(),
      listWithUser: vi.fn(),
      listWithRefs: vi.fn(),
      count: vi.fn(),
      listForExport: vi.fn(),
      retireBatch: vi.fn(),
    },
    superAdminActions: { listWithAdmin: vi.fn(), count: vi.fn() },
    files: { list: vi.fn(), findById: vi.fn(), create: vi.fn(), delete: vi.fn() },
    dataArchive: { moveOlderThan: vi.fn() },
    tenants: { findById: vi.fn(), findBySlug: vi.fn() },
  },
}));

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getRepos: () => repos,
}));
vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/tenant', () => ({ getTenantId: vi.fn() }));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue(TENANT) }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/cloudinary', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { createAuditLog } from '@/lib/audit';
import { getTenantId } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { GET as listAuditLogs } from '@/app/api/audit-logs/route';
import { GET as exportAuditLogs } from '@/app/api/audit-logs/export/route';
import { GET as superAdminLogs } from '@/app/api/super-admin/logs/route';
import { GET as adminLogs } from '@/app/api/super-admin/admin-logs/route';
import { DELETE as deleteFile, GET as listFiles } from '@/app/api/upload/route';
import { cleanupAuditLogs } from '@/lib/automations/audit-log-cleanup';
import { archiveOldData } from '@/lib/automations/data-archiving';

const request = (url = 'http://localhost/api/x', init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(url, init);

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAuth.mockResolvedValue({ userId: USER, tenantId: TENANT, role: 'admin' });
  auth.getCurrentUser.mockResolvedValue({ userId: USER, tenantId: TENANT, role: 'admin' });
  auth.requireRole.mockResolvedValue({ userId: USER, role: 'super_admin' });
  auth.verifyToken.mockReturnValue(null);
  repos.auditLogs.create.mockResolvedValue({ _id: 'log-1' });
  repos.auditLogs.listWithUser.mockResolvedValue([]);
  repos.auditLogs.count.mockResolvedValue(0);
  repos.auditLogs.listForExport.mockResolvedValue([]);
  repos.auditLogs.listWithRefs.mockResolvedValue([]);
  repos.superAdminActions.listWithAdmin.mockResolvedValue([]);
  repos.superAdminActions.count.mockResolvedValue(0);
});

describe('createAuditLog', () => {
  it('writes the entry for the given tenant without another auth lookup', async () => {
    await createAuditLog(
      request('http://localhost/api/x', { headers: { 'user-agent': 'ua', 'x-forwarded-for': '1.2.3.4' } }),
      { tenantId: TENANT, userId: USER, action: 'create', entityType: 'product', entityId: 'p1' }
    );

    expect(auth.getCurrentUser).not.toHaveBeenCalled();
    expect(repos.auditLogs.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ userId: USER, action: 'create', entityType: 'product', entityId: 'p1', ipAddress: '1.2.3.4', userAgent: 'ua' })
    );
  });

  it('falls back to the authenticated user', async () => {
    await createAuditLog(request(), { action: 'create', entityType: 'product' } as never);

    expect(repos.auditLogs.create).toHaveBeenCalledWith(TENANT, expect.objectContaining({ userId: USER }));
  });

  it('resolves a slug passed as the tenant', async () => {
    vi.mocked(getTenantId).mockResolvedValue(TENANT);

    await createAuditLog(request(), { tenantId: 'acme', userId: USER, action: 'x', entityType: 'y' });

    expect(getTenantId).toHaveBeenCalledWith('acme');
    expect(repos.auditLogs.create).toHaveBeenCalledWith(TENANT, expect.anything());
  });

  it('skips the entry for an unknown slug', async () => {
    vi.mocked(getTenantId).mockResolvedValue(null);

    await createAuditLog(request(), { tenantId: 'nope', userId: USER, action: 'x', entityType: 'y' });

    expect(repos.auditLogs.create).not.toHaveBeenCalled();
  });

  it('tags entries made during impersonation', async () => {
    auth.getCurrentUser.mockResolvedValue({ userId: USER, tenantId: TENANT, impersonatedBy: 'admin-1' });

    await createAuditLog(request(), { action: 'x', entityType: 'y', metadata: { a: 1 } } as never);

    expect(repos.auditLogs.create.mock.calls[0][1].metadata).toEqual({ a: 1, impersonatedBy: 'admin-1' });
  });

  it('never fails the request', async () => {
    repos.auditLogs.create.mockRejectedValue(new Error('db down'));

    await expect(
      createAuditLog(request(), { tenantId: TENANT, userId: USER, action: 'x', entityType: 'y' })
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('GET /api/audit-logs', () => {
  it('reads only the caller tenant and builds the filter', async () => {
    const res = await listAuditLogs(
      request('http://localhost/api/audit-logs?action=login&entityType=auth&userId=u2&startDate=2026-01-01&page=2&limit=10')
    );

    expect(res.status).toBe(200);
    const [tenantId, filter, opts] = repos.auditLogs.listWithUser.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(filter).toEqual({
      action: 'login',
      entityType: 'auth',
      userId: 'u2',
      createdAt: { gte: new Date('2026-01-01') },
    });
    expect(opts).toEqual({ page: { skip: 10, limit: 10 } });
    expect(repos.auditLogs.count).toHaveBeenCalledWith(TENANT, filter);
  });

  it('leaves createdAt out without dates, since an empty range matches nothing', async () => {
    await listAuditLogs(request('http://localhost/api/audit-logs'));

    expect(repos.auditLogs.listWithUser.mock.calls[0][1]).toEqual({});
  });
});

describe('GET /api/audit-logs/export', () => {
  it('reads the archive only when the range reaches past the cutoff', async () => {
    await exportAuditLogs(request('http://localhost/api/audit-logs/export'));
    expect(repos.auditLogs.listForExport.mock.calls[0][2]).toEqual({ includeArchived: false });

    await exportAuditLogs(request('http://localhost/api/audit-logs/export?startDate=2020-01-01'));
    expect(repos.auditLogs.listForExport.mock.calls[1][2]).toEqual({ includeArchived: true });
  });

  it('reads only the caller tenant and records the export', async () => {
    repos.auditLogs.listForExport.mockResolvedValue([
      { createdAt: new Date(), action: 'login', entityType: 'auth', userId: { name: 'Ana', email: 'a@b.c' } },
    ]);

    const res = await exportAuditLogs(request('http://localhost/api/audit-logs/export'));

    expect(repos.auditLogs.listForExport.mock.calls[0][0]).toBe(TENANT);
    expect(res.status).toBe(200);
    expect(repos.auditLogs.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ action: 'audit_log.export', metadata: expect.objectContaining({ entryCount: 1 }) })
    );
  });
});

describe('GET /api/super-admin/logs', () => {
  it('reads every tenant when none is named', async () => {
    const res = await superAdminLogs(request('http://localhost/api/super-admin/logs?action=stock.'));

    expect(res.status).toBe(200);
    expect(repos.auditLogs.listWithRefs.mock.calls[0][0]).toBeNull();
    expect(repos.auditLogs.listWithRefs.mock.calls[0][1]).toEqual({ actionContains: 'stock.' });
  });

  it('resolves a tenant slug', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: TENANT });

    await superAdminLogs(request('http://localhost/api/super-admin/logs?tenantSlug=acme'));

    expect(repos.auditLogs.listWithRefs.mock.calls[0][0]).toBe(TENANT);
    expect(repos.auditLogs.count.mock.calls[0][0]).toBe(TENANT);
  });

  it('returns nothing for an unknown slug rather than every tenant', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);

    const res = await superAdminLogs(request('http://localhost/api/super-admin/logs?tenantSlug=nope'));

    expect((await res.json()).data).toEqual([]);
    expect(repos.auditLogs.listWithRefs).not.toHaveBeenCalled();
  });

  it('extends the end date to the end of that day', async () => {
    await superAdminLogs(request('http://localhost/api/super-admin/logs?endDate=2026-01-05'));

    const end = repos.auditLogs.listWithRefs.mock.calls[0][1].createdAt.lte as Date;
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59]);
  });
});

describe('GET /api/super-admin/admin-logs', () => {
  it('builds the filter and pages', async () => {
    const res = await adminLogs(
      request('http://localhost/api/super-admin/admin-logs?action=imp&targetType=User&page=3&limit=20')
    );

    expect(res.status).toBe(200);
    expect(repos.superAdminActions.listWithAdmin).toHaveBeenCalledWith(
      { actionContains: 'imp', targetType: 'User' },
      { page: { skip: 40, limit: 20 } }
    );
  });
});

describe('/api/upload', () => {
  const deleteRequest = () => request('http://localhost/api/upload?id=f1', { method: 'DELETE' });

  it('lists the tenant files', async () => {
    repos.files.list.mockResolvedValue([
      { _id: 'f1', name: 'a.png', size: 5, type: 'image/png', url: 'u', uploadedAt: new Date(0) },
    ]);

    const res = await listFiles(request('http://localhost/api/upload'));

    expect(repos.files.list).toHaveBeenCalledWith(TENANT, { limit: 100 });
    expect((await res.json()).data[0]).toMatchObject({ id: 'f1', name: 'a.png' });
  });

  it('treats another tenant file as not found and removes nothing', async () => {
    repos.files.findById.mockResolvedValue(null);

    const res = await deleteFile(deleteRequest());

    expect(res.status).toBe(404);
    expect(repos.files.findById).toHaveBeenCalledWith(TENANT, 'f1');
    expect(deleteFromCloudinary).not.toHaveBeenCalled();
    expect(repos.files.delete).not.toHaveBeenCalled();
  });

  it('deletes the stored file and its record', async () => {
    repos.files.findById.mockResolvedValue({ _id: 'f1', name: 'a.png', filename: 'cloud-id', size: 5, type: 'image/png' });

    const res = await deleteFile(deleteRequest());

    expect(res.status).toBe(200);
    expect(deleteFromCloudinary).toHaveBeenCalledWith('cloud-id');
    expect(repos.files.delete).toHaveBeenCalledWith(TENANT, 'f1');
  });

  it('still removes the record when Cloudinary fails', async () => {
    repos.files.findById.mockResolvedValue({ _id: 'f1', name: 'a.png', filename: 'cloud-id', size: 5, type: 'image/png' });
    vi.mocked(deleteFromCloudinary).mockRejectedValueOnce(new Error('down'));

    const res = await deleteFile(deleteRequest());

    expect(res.status).toBe(200);
    expect(repos.files.delete).toHaveBeenCalled();
  });
});

describe('cleanupAuditLogs', () => {
  it('keeps taking batches until one comes back short', async () => {
    repos.auditLogs.retireBatch
      .mockResolvedValueOnce({ found: 2, removed: 2 })
      .mockResolvedValueOnce({ found: 1, removed: 1 });

    const result = await cleanupAuditLogs({ batchSize: 2 });

    expect(repos.auditLogs.retireBatch).toHaveBeenCalledTimes(2);
    expect(repos.auditLogs.retireBatch.mock.calls[0][0]).toBeNull();
    expect(repos.auditLogs.retireBatch.mock.calls[0][1]).toMatchObject({ limit: 2, archive: true });
    expect(result.processed).toBe(3);
  });

  it('stops at maxBatches', async () => {
    repos.auditLogs.retireBatch.mockResolvedValue({ found: 2, removed: 2 });

    await cleanupAuditLogs({ batchSize: 2, maxBatches: 3 });

    expect(repos.auditLogs.retireBatch).toHaveBeenCalledTimes(3);
  });

  it('honours the retention window and a single tenant', async () => {
    repos.auditLogs.retireBatch.mockResolvedValue({ found: 0, removed: 0 });
    const before = Date.now();

    await cleanupAuditLogs({ tenantId: TENANT, retentionDays: 10, archive: false });

    const [tenantId, opts] = repos.auditLogs.retireBatch.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(opts.archive).toBe(false);
    expect(before - opts.before.getTime()).toBeGreaterThanOrEqual(10 * 86_400_000 - 1000);
  });

  it('reports a failure instead of throwing', async () => {
    repos.auditLogs.retireBatch.mockRejectedValue(new Error('merge failed'));

    const result = await cleanupAuditLogs();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(result.errors).toContain('merge failed');
  });
});

describe('archiveOldData', () => {
  beforeEach(() => {
    repos.tenants.findById.mockResolvedValue({ _id: TENANT, slug: 'acme', name: 'Acme' });
  });

  it('defaults to the 10-year BIR retention', async () => {
    repos.dataArchive.moveOlderThan.mockResolvedValue(4);

    const result = await archiveOldData({ tenantId: TENANT });

    const [tenantId, collection, opts] = repos.dataArchive.moveOlderThan.mock.calls[0];
    expect(tenantId).toBe(TENANT);
    expect(collection).toBe('transactions');
    expect(opts.limit).toBe(1000);
    expect(new Date().getFullYear() - opts.before.getFullYear()).toBe(10);
    expect(result.processed).toBe(4);
  });

  it('counts a failed collection and carries on', async () => {
    repos.dataArchive.moveOlderThan.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(2);

    const result = await archiveOldData({ tenantId: TENANT, collections: ['a', 'b'] });

    expect(result).toMatchObject({ processed: 2, failed: 1 });
    expect(result.errors?.[0]).toContain('boom');
  });
});
