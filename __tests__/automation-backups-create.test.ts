import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const createDatabaseBackup = vi.fn();

vi.mock('@/lib/automations', () => ({ createDatabaseBackup: (...args: unknown[]) => createDatabaseBackup(...args) }));
vi.mock('@/lib/automation-auth', () => ({ verifyCronAuth: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { POST } from '@/app/api/automations/backups/create/route';

describe('POST /api/automations/backups/create', () => {
  beforeEach(() => {
    createDatabaseBackup.mockReset();
    createDatabaseBackup.mockResolvedValue({ success: true, message: 'ok', processed: 1, failed: 0, errors: [] });
  });

  it('ignores a caller-supplied backupPath so files stay in the server backups folder', async () => {
    const request = new NextRequest('http://localhost/api/automations/backups/create', {
      method: 'POST',
      body: JSON.stringify({ backupPath: '../../etc', tenantId: 'abc', uploadToCloud: true }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(request);

    expect(res.status).toBe(200);
    expect(createDatabaseBackup).toHaveBeenCalledTimes(1);
    const options = createDatabaseBackup.mock.calls[0][0];
    expect(options).toEqual({ tenantId: 'abc', uploadToCloud: true });
    expect(options).not.toHaveProperty('backupPath');
  });
});
