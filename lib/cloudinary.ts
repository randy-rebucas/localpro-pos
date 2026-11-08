/**
 * Cloudinary storage for tenant files.
 *
 * The Cloudinary account is shared, so every asset lives under a folder this
 * app owns, organised by tenant and purpose:
 *
 *   1pos/{tenant_slug}/{type}/<file>
 *
 *   type = products  product images
 *        = branding  store logo, favicon
 *        = files     general file library (images, PDFs, spreadsheets)
 *
 * Assets are also tagged (`1pos`, `tenant:{slug}`, `type:{type}`) and carry the
 * tenant id in their context metadata, so they can be found from the Cloudinary
 * console even if a folder is moved.
 *
 * Config: CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME), or
 * CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.
 * Optional: CLOUDINARY_ROOT_FOLDER (default "1pos"; e.g. "1pos-staging" so a
 * staging deploy doesn't write into production's folders), and
 * CLOUDINARY_SIGNATURE_ALGORITHM ("sha1" default, or "sha256" if the account
 * is set to it).
 */
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

export const ASSET_TYPES = ['products', 'branding', 'files'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && (ASSET_TYPES as readonly string[]).includes(value);
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage (Cloudinary) is not configured');
    this.name = 'StorageNotConfiguredError';
  }
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  let apiKey = process.env.CLOUDINARY_API_KEY;
  let apiSecret = process.env.CLOUDINARY_API_SECRET;

  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      cloudName = parsed.hostname || cloudName;
      apiKey = decodeURIComponent(parsed.username) || apiKey;
      apiSecret = decodeURIComponent(parsed.password) || apiSecret;
    } catch {
      throw new StorageNotConfiguredError();
    }
  }
  if (!cloudName || !apiKey || !apiSecret) throw new StorageNotConfiguredError();

  const algorithm = process.env.CLOUDINARY_SIGNATURE_ALGORITHM === 'sha256' ? 'sha256' : 'sha1';
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
    signature_algorithm: algorithm,
  });
  configured = true;
}

/** Top-level folder this app owns in the shared account. */
export function rootFolder(): string {
  const raw = process.env.CLOUDINARY_ROOT_FOLDER?.trim() || '1pos';
  return raw.replace(/^\/+|\/+$/g, '');
}

/** Folder-safe form of a tenant slug (slugs are already URL-safe; this is belt and braces). */
function safeSegment(value: string): string {
  const s = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) throw new Error('Invalid tenant slug for storage folder');
  return s;
}

/** 1pos/{tenant_slug} */
export function tenantFolder(tenantSlug: string): string {
  return `${rootFolder()}/${safeSegment(tenantSlug)}`;
}

/** 1pos/{tenant_slug}/{type} */
export function tenantAssetFolder(tenantSlug: string, type: AssetType): string {
  return `${tenantFolder(tenantSlug)}/${type}`;
}

/** Filename without extension, reduced to characters Cloudinary keeps in public ids. */
function safeBaseName(filename: string): string {
  const base = filename.replace(/\.[^.]*$/, '');
  const s = base.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'file';
}

export interface StoredAsset {
  publicId: string; // includes the folder
  url: string;
  resourceType: 'image' | 'video' | 'raw';
  folder: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
}

export async function uploadTenantAsset(params: {
  buffer: Buffer;
  filename: string;
  tenantId: string;
  tenantSlug: string;
  type: AssetType;
}): Promise<StoredAsset> {
  ensureConfigured();
  const folder = tenantAssetFolder(params.tenantSlug, params.type);
  const slugTag = safeSegment(params.tenantSlug);

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        // Keep a readable name; Cloudinary appends a random suffix so names never collide
        use_filename: true,
        unique_filename: true,
        filename_override: safeBaseName(params.filename),
        overwrite: false,
        tags: ['1pos', `tenant:${slugTag}`, `type:${params.type}`],
        context: { tenantId: params.tenantId, tenantSlug: slugTag, assetType: params.type },
      },
      (error, res) => {
        if (error || !res) reject(new Error(`Cloudinary upload failed: ${error?.message || 'no response'}`));
        else resolve(res);
      }
    );
    stream.end(params.buffer);
  });

  return {
    publicId: result.public_id,
    url: result.secure_url,
    resourceType: (result.resource_type as StoredAsset['resourceType']) || 'image',
    folder,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
  };
}

/**
 * Whether `publicId` sits inside a folder this tenant owns. Checked before
 * every delete: on a shared account a bad public id must never reach another
 * tenant's — or another app's — assets.
 *
 * `recordFolder` is the folder stored on the File record at upload time (so a
 * later slug rename doesn't orphan old files). Legacy uploads went to
 * tenants/{tenantId}/.
 */
export function isOwnedByTenant(publicId: string, opts: { tenantId: string; recordFolder?: string | null }): boolean {
  const allowed: string[] = [`tenants/${opts.tenantId}/`];
  if (opts.recordFolder && opts.recordFolder.startsWith(`${rootFolder()}/`)) {
    allowed.push(`${opts.recordFolder.replace(/\/+$/, '')}/`);
  }
  return !publicId.includes('..') && allowed.some((prefix) => publicId.startsWith(prefix));
}

export async function deleteTenantAsset(params: {
  publicId: string;
  resourceType?: string | null;
  tenantId: string;
  recordFolder?: string | null;
}): Promise<void> {
  if (!isOwnedByTenant(params.publicId, { tenantId: params.tenantId, recordFolder: params.recordFolder })) {
    throw new Error('Refusing to delete an asset outside the tenant folder');
  }
  ensureConfigured();
  const resourceType = params.resourceType === 'raw' || params.resourceType === 'video' ? params.resourceType : 'image';
  const res = await cloudinary.uploader.destroy(params.publicId, { resource_type: resourceType, invalidate: true });
  // "not found" = already gone, which is the outcome we wanted
  if (res?.result !== 'ok' && res?.result !== 'not found') {
    throw new Error(`Cloudinary delete failed: ${res?.result ?? 'unknown result'}`);
  }
}
