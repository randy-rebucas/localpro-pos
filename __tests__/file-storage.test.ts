import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { saveFile, deleteFile, resolveStorageKey } from '@/lib/file-storage';

const TENANT_ID = '64b7f0c2a1b2c3d4e5f60718';

describe('file-storage', () => {
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    await fs.rm(uploadDir, { recursive: true, force: true });
  });

  it('saves under the tenant folder with a random name and public URL', async () => {
    const result = await saveFile(Buffer.from('hello'), '../../evil name.PNG', TENANT_ID);

    expect(result.key).toMatch(new RegExp(`^tenants/${TENANT_ID}/\\d+-[a-f0-9]{16}\\.png$`));
    expect(result.url).toBe(`/uploads/${result.key}`);
    expect(result.bytes).toBe(5);
    const onDisk = await fs.readFile(path.join(uploadDir, result.key), 'utf-8');
    expect(onDisk).toBe('hello');
  });

  it('deletes saved files and ignores already-missing ones', async () => {
    const { key } = await saveFile(Buffer.from('x'), 'a.jpg', TENANT_ID);
    await deleteFile(key);
    await expect(fs.access(path.join(uploadDir, key))).rejects.toThrow();
    await expect(deleteFile(key)).resolves.toBeUndefined();
  });

  it('rejects invalid tenant ids', async () => {
    await expect(saveFile(Buffer.from('x'), 'a.jpg', '../other')).rejects.toThrow('Invalid tenantId');
  });

  it('refuses keys outside the tenants/{tenantId}/{file} layout', () => {
    expect(resolveStorageKey(`tenants/${TENANT_ID}/../../etc.txt`)).toBeNull();
    expect(resolveStorageKey(`tenants/${TENANT_ID}/..`)).toBeNull();
    expect(resolveStorageKey('tenants/not-an-id/file.png')).toBeNull();
    expect(resolveStorageKey(`other/${TENANT_ID}/file.png`)).toBeNull();
    expect(resolveStorageKey('1700000000-abc-legacy-cloudinary-id')).toBeNull();
    expect(resolveStorageKey(`tenants/${TENANT_ID}/123-abc.png`)).toBe(
      path.join(uploadDir, 'tenants', TENANT_ID, '123-abc.png')
    );
  });
});
