process.env.JWT_SECRET = 'test-secret-for-upload-api-tests-32-characters!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a') }));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

// Keep the real folder/type helpers; only the network calls are mocked.
const mockUploadAsset = vi.fn();
const mockDeleteAsset = vi.fn();
vi.mock('@/lib/cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloudinary')>();
  return {
    ...actual,
    uploadTenantAsset: (...args: unknown[]) => mockUploadAsset(...args),
    deleteTenantAsset: (...args: unknown[]) => mockDeleteAsset(...args),
  };
});

const mockFileCreate = vi.fn();
const mockFileFindOne = vi.fn();
const mockFileDeleteOne = vi.fn();
vi.mock('@/models/File', () => ({
  default: {
    create: (...args: unknown[]) => mockFileCreate(...args),
    findOne: (...args: unknown[]) => mockFileFindOne(...args),
    deleteOne: (...args: unknown[]) => mockFileDeleteOne(...args),
  },
}));

const mockTenantFindById = vi.fn();
vi.mock('@/models/Tenant', () => ({
  default: { findById: (...args: unknown[]) => mockTenantFindById(...args) },
}));

import { POST, DELETE } from '@/app/api/upload/route';
import { StorageNotConfiguredError } from '@/lib/cloudinary';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode('%PDF-1.7 test');
const FILE_ID = '64b7f0c2a1b2c3d4e5f60718';

/**
 * jsdom's Blob isn't accepted by Node's multipart parser, so stub formData()
 * with a file-like object instead of building a real multipart body.
 */
function uploadRequest(bytes: Uint8Array, mime: string, name = 'logo.png', assetType?: string) {
  const req = new NextRequest(new URL('/api/upload', 'http://localhost'), { method: 'POST' });
  const file = {
    name,
    type: mime,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
  const fields: Record<string, unknown> = { file, ...(assetType !== undefined && { type: assetType }) };
  Object.defineProperty(req, 'formData', { value: async () => ({ get: (key: string) => fields[key] ?? null }) });
  return req;
}

const deleteRequest = (id = FILE_ID) =>
  new NextRequest(new URL(`/api/upload?id=${id}`, 'http://localhost'), { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-a', role: 'manager' });
  mockHasTenantPermission.mockResolvedValue(true);
  mockTenantFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ slug: 'store-a' }) }) });
  mockUploadAsset.mockResolvedValue({
    publicId: '1pos/store-a/products/logo-abc123',
    url: 'https://res.cloudinary.com/demo/image/upload/1pos/store-a/products/logo-abc123.png',
    resourceType: 'image',
    folder: '1pos/store-a/products',
    bytes: 12,
  });
  mockFileCreate.mockResolvedValue({ _id: { toString: () => FILE_ID }, uploadedAt: new Date() });
  mockDeleteAsset.mockResolvedValue(undefined);
  mockFileDeleteOne.mockResolvedValue({ deletedCount: 1 });
});

describe('POST /api/upload', () => {
  it('stores the file under the tenant slug and requested type', async () => {
    const res = await POST(uploadRequest(PNG, 'image/png', 'logo.png', 'products'));

    expect(res.status).toBe(200);
    expect(mockUploadAsset).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', tenantSlug: 'store-a', type: 'products' }));
    expect(mockFileCreate).toHaveBeenCalledWith(expect.objectContaining({
      filename: '1pos/store-a/products/logo-abc123',
      assetType: 'products',
      resourceType: 'image',
      folder: '1pos/store-a/products',
    }));
  });

  it('defaults to the general files library when no type is sent', async () => {
    await POST(uploadRequest(PNG, 'image/png'));
    expect(mockUploadAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'files' }));
  });

  it('rejects an unknown type', async () => {
    const res = await POST(uploadRequest(PNG, 'image/png', 'x.png', '../../other-app'));
    expect(res.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('requires settings.manage for branding uploads', async () => {
    mockHasTenantPermission.mockImplementation(async (_r: string, _t: string, key: string) => key === 'products.manage');

    const res = await POST(uploadRequest(PNG, 'image/png', 'logo.png', 'branding'));

    expect(res.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('only accepts images for product uploads', async () => {
    const res = await POST(uploadRequest(PDF, 'application/pdf', 'menu.pdf', 'products'));
    expect(res.status).toBe(400);
  });

  it('accepts documents in the general library', async () => {
    const res = await POST(uploadRequest(PDF, 'application/pdf', 'menu.pdf', 'files'));
    expect(res.status).toBe(200);
  });

  it('forbids users without products.manage or settings.manage (e.g. cashiers)', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u2', tenantId: 'tenant-a', role: 'cashier' });
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await POST(uploadRequest(PNG, 'image/png'));

    expect(res.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('rejects content that does not match the claimed type', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const res = await POST(uploadRequest(html, 'image/png'));

    expect(res.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it('rejects HTML disguised as CSV', async () => {
    const html = new TextEncoder().encode('<!doctype html><svg onload=alert(1)>');
    const res = await POST(uploadRequest(html, 'text/csv', 'data.csv'));
    expect(res.status).toBe(400);
  });

  it('accepts .ico favicons', async () => {
    const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    const res = await POST(uploadRequest(ico, 'image/x-icon', 'favicon.ico', 'branding'));
    expect(res.status).toBe(200);
  });

  it('returns 503 with a clear message when storage is not configured', async () => {
    mockUploadAsset.mockRejectedValue(new StorageNotConfiguredError());
    const res = await POST(uploadRequest(PNG, 'image/png'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/not configured/i);
    expect(mockFileCreate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/upload', () => {
  const record = {
    _id: FILE_ID,
    name: 'logo.png',
    size: 12,
    type: 'image/png',
    filename: '1pos/store-a/branding/logo-abc123',
    resourceType: 'image',
    folder: '1pos/store-a/branding',
    assetType: 'branding',
  };

  it('looks the file up scoped to the tenant and deletes it from Cloudinary, then the record', async () => {
    mockFileFindOne.mockResolvedValue(record);

    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(200);
    expect(mockFileFindOne).toHaveBeenCalledWith({ _id: FILE_ID, tenantId: 'tenant-a' });
    expect(mockDeleteAsset).toHaveBeenCalledWith({
      publicId: record.filename,
      resourceType: 'image',
      tenantId: 'tenant-a',
      recordFolder: '1pos/store-a/branding',
    });
    expect(mockFileDeleteOne).toHaveBeenCalled();
  });

  it('keeps the record when the Cloudinary delete fails, so it can be retried', async () => {
    mockFileFindOne.mockResolvedValue(record);
    mockDeleteAsset.mockRejectedValue(new Error('Cloudinary delete failed: error'));

    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(502);
    expect(mockFileDeleteOne).not.toHaveBeenCalled();
  });

  it('404s for another tenant\'s file or a malformed id', async () => {
    mockFileFindOne.mockResolvedValue(null);
    expect((await DELETE(deleteRequest())).status).toBe(404);
    expect((await DELETE(deleteRequest('not-an-id'))).status).toBe(404);
    expect(mockDeleteAsset).not.toHaveBeenCalled();
  });

  it('forbids users without file permissions from deleting tenant files', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u2', tenantId: 'tenant-a', role: 'viewer' });
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(403);
    expect(mockFileFindOne).not.toHaveBeenCalled();
    expect(mockDeleteAsset).not.toHaveBeenCalled();
  });
});
