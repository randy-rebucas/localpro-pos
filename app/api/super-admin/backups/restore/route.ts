/**
 * POST /api/super-admin/backups/restore
 *
 * Restore a full database backup (pg_dump custom format, -Fc). Two modes:
 *
 * 1. Restore from a local file already on the server:
 *    { "filename": "backup-2026-06-16T02-00-00-000Z.dump", "clearExisting": true }
 *
 * 2. Upload a .dump file (multipart/form-data):
 *    form field "file" = the backup .dump file
 *    form field "clearExisting" = "true" | "false"
 *    form field "dryRun" = "true" | "false"
 *
 * Note: pg_restore operates on the whole dump — there is no per-collection/
 * per-table restore filtering like the old Mongo JSON restore supported.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { restoreDatabaseBackup } from '@/lib/automations/database-backups';
import { logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

function safeFilename(filename: string): string | null {
  if (!/^[\w.-]+$/.test(filename)) return null;
  return filename;
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const contentType = request.headers.get('content-type') ?? '';
    let filePath: string;
    let tempFile = false;
    let clearExisting = false;
    let dryRun = false;

    if (contentType.includes('multipart/form-data')) {
      // Mode 2: uploaded file
      const form = await request.formData();
      const file = form.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
      }
      if (!file.name.endsWith('.dump')) {
        return NextResponse.json({ success: false, error: 'Only .dump backup files are supported' }, { status: 400 });
      }

      // Write to a temp file so restoreDatabaseBackup can read it
      const arrayBuffer = await file.arrayBuffer();
      const tmpPath = path.join(os.tmpdir(), `restore-${Date.now()}.dump`);
      await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));
      filePath = tmpPath;
      tempFile = true;

      clearExisting = form.get('clearExisting') === 'true';
      dryRun = form.get('dryRun') === 'true';
    } else {
      // Mode 1: restore from a local file on the server
      const body = await request.json().catch(() => ({}));
      const { filename, clearExisting: ce, dryRun: dr } = body;

      if (!filename) {
        return NextResponse.json({ success: false, error: 'filename is required' }, { status: 400 });
      }
      const safe = safeFilename(filename);
      if (!safe) {
        return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
      }

      filePath = path.join(process.cwd(), 'backups', safe);
      clearExisting = ce === true;
      dryRun = dr === true;
    }

    const result = await restoreDatabaseBackup({ backupFilePath: filePath, clearExisting, dryRun });

    if (tempFile) {
      await fs.unlink(filePath).catch(() => null);
    }

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('Restore backup error', error);
    return NextResponse.json({ success: false, error: 'Failed to restore backup' }, { status: 500 });
  }
}
