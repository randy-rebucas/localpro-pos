import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { resolveStorageKey } from '@/lib/file-storage';

// Only types the upload API accepts; anything else is served as a download.
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const INLINE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

/**
 * Serve tenant files stored by lib/file-storage.ts.
 * Public (no auth) so product images work in img tags — stored names are random and unguessable.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const fullPath = resolveStorageKey(segments.join('/'));
  if (!fullPath) {
    return new NextResponse('Not found', { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(fullPath);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': INLINE_EXTENSIONS.has(ext) ? 'inline' : 'attachment',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
