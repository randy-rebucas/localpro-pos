import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import { saveFile, deleteFile } from '@/lib/file-storage';
import File from '@/models/File';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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

    // Save to local disk with tenant isolation
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const stored = await saveFile(fileBuffer, file.name, tenantId);

    // Connect to database and save file record
    await connectDB();
    const fileDoc = await File.create({
      tenantId,
      name: file.name,
      filename: stored.key,
      size: file.size,
      type: file.type,
      url: stored.url,
      uploadedBy: user.userId,
    });

    // Create audit log for file upload
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: 'upload_file',
      entityType: 'File',
      entityId: fileDoc._id.toString(),
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        storageKey: stored.key,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: fileDoc._id,
        url: stored.url,
        filename: stored.key,
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

    await connectDB();

    const files = await File.find({ tenantId })
      .select('_id name filename size type url uploadedAt uploadedBy')
      .sort({ uploadedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      success: true,
      data: files.map(file => ({
        id: file._id,
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

    await connectDB();

    // Fetch the file to get its storage key — scoped to the authenticated tenant
    const file = await File.findOne({ _id: fileId, tenantId });

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.fileNotFound', 'File not found') }, { status: 404 });
    }

    // Delete from local disk
    try {
      await deleteFile(file.filename);
    } catch (storageError) {
      logger.error('Error deleting file from storage:', storageError);
      // Continue anyway to clean up database record
    }

    // Delete from database
    await File.deleteOne({ _id: fileId, tenantId });

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
        storageKey: file.filename,
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

