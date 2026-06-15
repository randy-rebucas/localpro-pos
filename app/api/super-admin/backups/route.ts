import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createDatabaseBackup } from '@/lib/automations/database-backups';
import { logger } from '@/lib/logger';
import path from 'path';

const _importFs = () => import('fs/promises');

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const fs = await _importFs();
    const backupDir = path.join(process.cwd(), 'backups');

    let files: { name: string; size: number; createdAt: string }[] = [];
    try {
      const entries = await fs.readdir(backupDir);
      const stats = await Promise.all(
        entries
          .filter(f => f.endsWith('.json') || f.endsWith('.bson'))
          .map(async name => {
            const stat = await fs.stat(path.join(backupDir, name));
            return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
          })
      );
      files = stats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      // backups dir may not exist yet
    }

    return NextResponse.json({ success: true, data: files });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('List backups error', error);
    return NextResponse.json({ success: false, error: 'Failed to list backups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const body = await request.json().catch(() => ({}));
    const { tenantId, uploadToCloud } = body;

    const result = await createDatabaseBackup({ tenantId, uploadToCloud });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('Create backup error', error);
    return NextResponse.json({ success: false, error: 'Failed to create backup' }, { status: 500 });
  }
}
