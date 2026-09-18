import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
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

export async function POST(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!user || !user.userId) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 401 });
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
    if (error instanceof Error) {
      logger.error('Error uploading file:', error.message);
    } else {
      logger.error('Error uploading file:', error);
    }
    return NextResponse.json({ success: false, error: t('validation.uploadFailed', 'Failed to upload file') }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!user || !user.userId) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 401 });
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
    logger.error('Error fetching files:', error);
    return NextResponse.json({ success: false, error: t('validation.fetchFilesFailed', 'Failed to fetch files') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    if (!user || !user.userId) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 401 });
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

    // Fetch the file to get cloudinary public_id
    const file = await prisma.file.findUnique({ where: { id: fileId } });

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.fileNotFound', 'File not found') }, { status: 404 });
    }

    // Ensure file belongs to authenticated tenant (security check)
    if (file.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.fileNotYourTenant', 'Unauthorized: File does not belong to your tenant') },
        { status: 403 }
      );
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
    if (error instanceof Error) {
      logger.error('Error deleting file:', error.message);
    } else {
      logger.error('Error deleting file:', error);
    }
    return NextResponse.json({ success: false, error: t('validation.deleteFailed', 'Failed to delete file') }, { status: 500 });
  }
}
