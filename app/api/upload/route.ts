import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantIdForUser, handleTenantAccessViolation, TenantAccessViolationError } from '@/lib/api-tenant';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { hasAnyTenantPermission, hasTenantPermission } from '@/lib/permissions-server';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

type Translate = (key: string, fallback: string) => string;

/**
 * Uploading and browsing the media library is part of creating/editing
 * products (product images) and settings (logos), so any of these keys allows
 * it. Deleting a file needs files.manage itself.
 */
const UPLOAD_PERMISSIONS = ['files.manage', 'products.create', 'products.edit', 'settings.manage'];

function forbidden(t: Translate): NextResponse {
  return NextResponse.json(
    { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
    { status: 403 }
  );
}

/**
 * Map a caught error to the right response. Auth and tenant failures are the
 * caller's problem (401/403), not a server fault; anything else stays a 500
 * with a safe translated message rather than the raw internal error text.
 */
function errorResponse(
  error: unknown,
  request: NextRequest,
  t: Translate,
  logLabel: string,
  failure: { key: string; fallback: string }
): NextResponse {
  if (error instanceof TenantAccessViolationError) {
    return handleTenantAccessViolation(error, request);
  }
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
  }
  logger.error(logLabel, error instanceof Error ? error.message : error);
  return NextResponse.json({ success: false, error: t(failure.key, failure.fallback) }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdForUser(request, user);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!(await hasAnyTenantPermission(user.role, tenantId, UPLOAD_PERMISSIONS))) {
      return forbidden(t);
    }

    // Rate limit: 50 uploads per hour per user
    const rateLimitKey = `upload:${tenantId}:${user.userId}`;
    const { allowed } = checkRateLimit(rateLimitKey, 50, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: t('validation.uploadLimitExceeded', 'Upload limit exceeded. Maximum 50 uploads per hour.') },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.noFileProvided', 'No file provided') }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidFileType', `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`) },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: t('validation.fileTooLarge', `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`) },
        { status: 400 }
      );
    }

    // Upload to Cloudinary with tenant isolation
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const cloudinaryResult = await uploadToCloudinary(fileBuffer, file.name, tenantId, file.type);

    // Save file record
    const fileDoc = await prisma.file.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: file.name,
        filename: cloudinaryResult.public_id,
        size: file.size,
        type: file.type,
        url: cloudinaryResult.secure_url,
        uploadedById: user.userId,
      },
    });

    // Create audit log for file upload
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: 'upload_file',
      entityType: 'File',
      entityId: fileDoc.id,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        cloudinaryPublicId: cloudinaryResult.public_id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: fileDoc.id,
        url: cloudinaryResult.secure_url,
        filename: cloudinaryResult.public_id,
        size: file.size,
        type: file.type,
        uploadedAt: fileDoc.uploadedAt,
      },
    });
  } catch (error: unknown) {
    return errorResponse(error, request, t, 'Error uploading file:', { key: 'validation.uploadFailed', fallback: 'Failed to upload file' });
  }
}

export async function GET(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdForUser(request, user);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!(await hasAnyTenantPermission(user.role, tenantId, UPLOAD_PERMISSIONS))) {
      return forbidden(t);
    }

    // Rate limit: 200 listings per hour per user
    const rateLimitKey = `upload-list:${tenantId}:${user.userId}`;
    const { allowed } = checkRateLimit(rateLimitKey, 200, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: t('validation.tooManyRequests', 'Too many requests') },
        { status: 429 }
      );
    }

    const files = await prisma.file.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        filename: true,
        size: true,
        type: true,
        url: true,
        uploadedAt: true,
        uploadedById: true,
      },
      orderBy: { uploadedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: files.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url,
        uploadedAt: file.uploadedAt,
      })),
    });
  } catch (error: unknown) {
    return errorResponse(error, request, t, 'Error fetching files:', { key: 'validation.fetchFilesFailed', fallback: 'Failed to fetch files' });
  }
}

export async function DELETE(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdForUser(request, user);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'files.manage'))) {
      return forbidden(t);
    }

    // Rate limit: 50 deletions per hour per user
    const rateLimitKey = `upload-delete:${tenantId}:${user.userId}`;
    const { allowed } = checkRateLimit(rateLimitKey, 50, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: t('validation.tooManyRequests', 'Too many requests') },
        { status: 429 }
      );
    }

    // Get file ID from query params
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ success: false, error: t('validation.fileIdRequired', 'File ID is required') }, { status: 400 });
    }

    // Fetch the file (to get the cloudinary public_id), scoped to the caller's
    // tenant: another tenant's file is indistinguishable from a missing one, so
    // the response never confirms that a foreign file ID exists.
    const file = await prisma.file.findFirst({ where: { id: fileId, tenantId } });

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.fileNotFound', 'File not found') }, { status: 404 });
    }

    // Delete from Cloudinary
    try {
      await deleteFromCloudinary(file.filename);
    } catch (cloudinaryError) {
      logger.error('Error deleting from Cloudinary:', cloudinaryError);
      // Continue anyway to clean up database record
    }

    // Delete from database
    await prisma.file.delete({ where: { id: fileId } });

    // Create audit log for file deletion
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: 'delete_file',
      entityType: 'File',
      entityId: fileId,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        cloudinaryPublicId: file.filename,
      },
    });

    return NextResponse.json({
      success: true,
      message: t('validation.fileDeleted', 'File deleted successfully'),
    });
  } catch (error: unknown) {
    return errorResponse(error, request, t, 'Error deleting file:', { key: 'validation.deleteFailed', fallback: 'Failed to delete file' });
  }
}
