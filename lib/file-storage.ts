/**
 * Local disk file storage with tenant isolation
 * Files are stored in: {UPLOAD_DIR}/tenants/{tenantId}/
 * Served publicly by app/uploads/[...path]/route.ts at /uploads/tenants/{tenantId}/{file}
 *
 * UPLOAD_DIR defaults to <project root>/uploads. Point it at a persistent volume
 * in production — files are not written to public/ because `next start` only
 * serves public/ files that existed at build time.
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

interface StoredFileResult {
  /** Storage key relative to the upload root, e.g. tenants/{tenantId}/{file} */
  key: string;
  /** Public URL path, e.g. /uploads/tenants/{tenantId}/{file} */
  url: string;
  bytes: number;
}

const TENANT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const STORED_NAME_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]{1,10})?$/;

export function getUploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
}

/**
 * Resolve a storage key to an absolute path, refusing anything that would
 * escape the upload root or doesn't match the tenants/{tenantId}/{file} layout.
 */
export function resolveStorageKey(key: string): string | null {
  const segments = key.split('/');
  if (segments.length !== 3) return null;

  const [prefix, tenantId, name] = segments;
  if (prefix !== 'tenants' || !TENANT_ID_PATTERN.test(tenantId) || !STORED_NAME_PATTERN.test(name)) {
    return null;
  }

  const root = getUploadRoot();
  const fullPath = path.resolve(root, prefix, tenantId, name);
  if (!fullPath.startsWith(root + path.sep)) return null;
  return fullPath;
}

/**
 * Save file to local disk with tenant isolation
 * The stored name is random (the original name is kept in the File record),
 * so URLs are unguessable and user input never reaches the filesystem path.
 */
export async function saveFile(
  fileBuffer: Buffer,
  filename: string,
  tenantId: string
): Promise<StoredFileResult> {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error('Invalid tenantId for file storage');
  }

  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 11);
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const key = `tenants/${tenantId}/${storedName}`;

  const fullPath = resolveStorageKey(key);
  if (!fullPath) {
    throw new Error('Invalid storage path');
  }

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, fileBuffer);

  return { key, url: `/uploads/${key}`, bytes: fileBuffer.length };
}

/**
 * Delete file from local disk
 * Tenant ownership is enforced at the API level before calling this.
 * Missing files are ignored so the database record can still be cleaned up.
 */
export async function deleteFile(key: string): Promise<void> {
  const fullPath = resolveStorageKey(key);
  if (!fullPath) {
    throw new Error('Invalid storage key');
  }

  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
