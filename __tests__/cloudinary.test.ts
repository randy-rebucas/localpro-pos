import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUploadStream = vi.fn();
const mockDestroy = vi.fn();
const mockConfig = vi.fn();
vi.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => mockConfig(...args),
    uploader: {
      upload_stream: (...args: unknown[]) => mockUploadStream(...args),
      destroy: (...args: unknown[]) => mockDestroy(...args),
    },
  },
}));

import {
  deleteTenantAsset,
  isAssetType,
  isOwnedByTenant,
  StorageNotConfiguredError,
  tenantAssetFolder,
  uploadTenantAsset,
} from '@/lib/cloudinary';

const ENV_KEYS = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_ROOT_FOLDER'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  vi.clearAllMocks();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
});

describe('folder layout', () => {
  it('is 1pos/{tenant_slug}/{type}', () => {
    expect(tenantAssetFolder('store-a', 'products')).toBe('1pos/store-a/products');
    expect(tenantAssetFolder('store-a', 'branding')).toBe('1pos/store-a/branding');
    expect(tenantAssetFolder('store-a', 'files')).toBe('1pos/store-a/files');
  });

  it('honours CLOUDINARY_ROOT_FOLDER (e.g. staging)', () => {
    process.env.CLOUDINARY_ROOT_FOLDER = '1pos-staging';
    expect(tenantAssetFolder('store-a', 'files')).toBe('1pos-staging/store-a/files');
  });

  it('neutralises path characters in the slug', () => {
    expect(tenantAssetFolder('../Other App', 'files')).toBe('1pos/other-app/files');
  });

  it('only recognises the three asset types', () => {
    expect(isAssetType('products')).toBe(true);
    expect(isAssetType('images')).toBe(false);
    expect(isAssetType('../x')).toBe(false);
  });
});

describe('isOwnedByTenant', () => {
  it('accepts assets inside the folder recorded at upload', () => {
    expect(isOwnedByTenant('1pos/store-a/products/x-1', { tenantId: 't1', recordFolder: '1pos/store-a/products' })).toBe(true);
  });

  it('accepts legacy tenants/{tenantId}/ assets', () => {
    expect(isOwnedByTenant('tenants/t1/123-logo.png', { tenantId: 't1' })).toBe(true);
  });

  it('rejects anything else in the shared account', () => {
    expect(isOwnedByTenant('1pos/store-b/products/x-1', { tenantId: 't1', recordFolder: '1pos/store-a/products' })).toBe(false);
    expect(isOwnedByTenant('other-app/banner', { tenantId: 't1', recordFolder: '1pos/store-a/products' })).toBe(false);
    expect(isOwnedByTenant('tenants/t2/x', { tenantId: 't1' })).toBe(false);
    expect(isOwnedByTenant('1pos/store-a/products/../../store-b/x', { tenantId: 't1', recordFolder: '1pos/store-a/products' })).toBe(false);
    // A record folder outside our root never grants anything
    expect(isOwnedByTenant('other-app/x', { tenantId: 't1', recordFolder: 'other-app' })).toBe(false);
  });
});

describe('uploadTenantAsset', () => {
  it('throws StorageNotConfiguredError without credentials', async () => {
    await expect(
      uploadTenantAsset({ buffer: Buffer.from('x'), filename: 'a.png', tenantId: 't1', tenantSlug: 'store-a', type: 'files' })
    ).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });

  it('uploads into 1pos/{slug}/{type} with tenant tags and context', async () => {
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';
    mockUploadStream.mockImplementation((_opts: unknown, cb: (err: unknown, res: unknown) => void) => ({
      end: () => cb(null, {
        public_id: '1pos/store-a/products/My-Logo-x1y2',
        secure_url: 'https://res.cloudinary.com/demo/image/upload/1pos/store-a/products/My-Logo-x1y2.png',
        resource_type: 'image',
        bytes: 1,
        format: 'png',
      }),
    }));

    const asset = await uploadTenantAsset({
      buffer: Buffer.from('x'),
      filename: 'My Logo (final).png',
      tenantId: 't1',
      tenantSlug: 'store-a',
      type: 'products',
    });

    const opts = mockUploadStream.mock.calls[0][0];
    expect(opts).toMatchObject({
      folder: '1pos/store-a/products',
      resource_type: 'auto',
      overwrite: false,
      unique_filename: true,
      filename_override: 'My-Logo-final',
      tags: ['1pos', 'tenant:store-a', 'type:products'],
      context: { tenantId: 't1', tenantSlug: 'store-a', assetType: 'products' },
    });
    expect(mockConfig).toHaveBeenCalledWith(expect.objectContaining({ cloud_name: 'demo', api_key: 'key', api_secret: 'secret', secure: true }));
    expect(asset).toMatchObject({ publicId: '1pos/store-a/products/My-Logo-x1y2', resourceType: 'image', folder: '1pos/store-a/products' });
  });
});

describe('deleteTenantAsset', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@demo';
  });

  it('destroys with the stored resource type', async () => {
    mockDestroy.mockResolvedValue({ result: 'ok' });
    await deleteTenantAsset({ publicId: '1pos/store-a/files/menu-1.csv', resourceType: 'raw', tenantId: 't1', recordFolder: '1pos/store-a/files' });
    expect(mockDestroy).toHaveBeenCalledWith('1pos/store-a/files/menu-1.csv', { resource_type: 'raw', invalidate: true });
  });

  it('treats "not found" as already deleted', async () => {
    mockDestroy.mockResolvedValue({ result: 'not found' });
    await expect(
      deleteTenantAsset({ publicId: '1pos/store-a/files/x', tenantId: 't1', recordFolder: '1pos/store-a/files' })
    ).resolves.toBeUndefined();
  });

  it('refuses to delete outside the tenant folder without calling Cloudinary', async () => {
    await expect(
      deleteTenantAsset({ publicId: 'other-app/hero', tenantId: 't1', recordFolder: '1pos/store-a/files' })
    ).rejects.toThrow(/outside the tenant folder/);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('surfaces other failures', async () => {
    mockDestroy.mockResolvedValue({ result: 'error' });
    await expect(
      deleteTenantAsset({ publicId: '1pos/store-a/files/x', tenantId: 't1', recordFolder: '1pos/store-a/files' })
    ).rejects.toThrow(/delete failed/);
  });
});
