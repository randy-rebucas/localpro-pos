/**
 * POST /api/super-admin/backups/restore
 *
 * Restore a full database backup. Two modes:
 *
 * 1. Restore from a local file already on the server:
 *    { "filename": "backup-2026-06-16T02-00-00-000Z.json", "clearExisting": true }
 *
 * 2. Upload a JSON file (multipart/form-data):
 *    form field "file" = the backup JSON file
 *    form field "clearExisting" = "true" | "false"
 *    form field "collections" = comma-separated list (optional)
 *    form field "dryRun" = "true" | "false"
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
    let collections: string[] | undefined;
    let dryRun = false;

    if (contentType.includes('multipart/form-data')) {
      // Mode 2: uploaded file
      const form = await request.formData();
      const file = form.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
      }
      if (!file.name.endsWith('.json')) {
        return NextResponse.json({ success: false, error: 'Only .json backup files are supported' }, { status: 400 });
      }

      // Write to a temp file so restoreDatabaseBackup can read it
      const arrayBuffer = await file.arrayBuffer();
      const tmpPath = path.join(os.tmpdir(), `restore-${Date.now()}.json`);
      await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));
      filePath = tmpPath;
      tempFile = true;

      clearExisting = form.get('clearExisting') === 'true';
      dryRun = form.get('dryRun') === 'true';
      const colParam = form.get('collections') as string | null;
      if (colParam) collections = colParam.split(',').map(c => c.trim()).filter(Boolean);
    } else {
      // Mode 1: restore from a local file on the server
      const body = await request.json().catch(() => ({}));
      const { filename, clearExisting: ce, collections: cols, dryRun: dr } = body;

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
      if (Array.isArray(cols) && cols.length > 0) collections = cols;
    }

    const result = await restoreDatabaseBackup({ backupFilePath: filePath, clearExisting, collections, dryRun });

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
