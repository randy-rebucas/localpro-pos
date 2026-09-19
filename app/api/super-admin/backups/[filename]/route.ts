import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { createAuditLog, AuditActions } from '@/lib/audit';
import prisma from '@/lib/db';
import path from 'path';

const _importFs = () => import('fs/promises');

function safeFilename(filename: string): string | null {
  // Prevent path traversal: only allow alphanumeric, dash, underscore, dot
  if (!/^[\w.-]+$/.test(filename)) return null;
  return filename;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { filename } = await params;
    const safe = safeFilename(filename);
    if (!safe) {
      return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
    }

    const fs = await _importFs();
    const filePath = path.join(process.cwd(), 'backups', safe);

    let content: Buffer;
    try {
      content = await fs.readFile(filePath);
    } catch {
      return NextResponse.json({ success: false, error: 'Backup not found' }, { status: 404 });
    }

    const contentType = safe.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safe}"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('Download backup error', error);
    return NextResponse.json({ success: false, error: 'Failed to download backup' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await requireRole(request, ['super_admin']);

    const { filename } = await params;
    const safe = safeFilename(filename);
    if (!safe) {
      return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
    }

    const fs = await _importFs();
    const filePath = path.join(process.cwd(), 'backups', safe);

    try {
      await fs.unlink(filePath);
    } catch {
      return NextResponse.json({ success: false, error: 'Backup not found' }, { status: 404 });
    }

    const defaultTenant = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
    if (defaultTenant) {
      await createAuditLog(request, {
        tenantId: defaultTenant.id,
        userId: user.userId,
        action: AuditActions.DELETE,
        entityType: 'database_backup',
        entityId: safe,
        metadata: { deletedBy: user.userId, role: 'super_admin' },
      });
    }

    return NextResponse.json({ success: true, message: `Deleted ${safe}` });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('Delete backup error', error);
    return NextResponse.json({ success: false, error: 'Failed to delete backup' }, { status: 500 });
  }
}
