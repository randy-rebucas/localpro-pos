import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import {
  uploadTenantAsset,
  deleteTenantAsset,
  isAssetType,
  StorageNotConfiguredError,
  type AssetType,
} from '@/lib/cloudinary';
import { contentMatchesType } from '@/lib/file-content';
import File from '@/models/File';
import Tenant from '@/models/Tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { hasTenantPermission } from '@/lib/permissions-server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // Favicons (the settings favicon picker offers .ico)
  'image/x-icon',
  'image/vnd.microsoft.icon',
];
const DOCUMENT_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Each asset type (= Cloudinary folder 1pos/{slug}/{type}/) has its own rules:
 * who may upload it and which file types it accepts. Product images and
 * branding are images only; the general library also takes documents.
 */
const ASSET_RULES: Record<AssetType, { permissions: string[]; allowedTypes: string[] }> = {
  products: { permissions: ['products.manage'], allowedTypes: IMAGE_TYPES },
  branding: { permissions: ['settings.manage'], allowedTypes: IMAGE_TYPES },
  files: { permissions: ['products.manage', 'settings.manage'], allowedTypes: [...IMAGE_TYPES, ...DOCUMENT_TYPES] },
};

/** Listing and deleting tenant files: anyone who can upload some type. */
const FILE_MANAGER_PERMISSIONS = ['products.manage', 'settings.manage'];

async function hasAnyPermission(role: string | undefined, tenantId: string, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (await hasTenantPermission(role, tenantId, key)) return true;
  }
  return false;
}

function storageUnavailable(t: (key: string, fallback: string) => string) {
  return NextResponse.json(
    { success: false, error: t('validation.storageNotConfigured', 'File storage is not configured. Please contact support.') },
    { status: 503 }
  );
}

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
    const rawType = formData.get('type') ?? 'files';
    if (!isAssetType(rawType)) {
      return NextResponse.json({ success: false, error: t('validation.invalidAssetType', 'Invalid upload type') }, { status: 400 });
    }
    const assetType: AssetType = rawType;
    const rules = ASSET_RULES[assetType];

    if (!(await hasAnyPermission(user.role, tenantId, rules.permissions))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.noFileProvided', 'No file provided') }, { status: 400 });
    }

    // Validate type
    if (!rules.allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidFileType', `Invalid file type. Allowed: ${rules.allowedTypes.join(', ')}`) },
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

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (!contentMatchesType(fileBuffer, file.type)) {
      return NextResponse.json(
        { success: false, error: t('validation.fileContentMismatch', 'File content does not match its type') },
        { status: 400 }
      );
    }

    await connectDB();
    const tenant = await Tenant.findById(tenantId).select('slug').lean();
    if (!tenant?.slug) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Stored at 1pos/{tenant_slug}/{type}/ in the shared Cloudinary account
    const asset = await uploadTenantAsset({
      buffer: fileBuffer,
      filename: file.name,
      tenantId,
      tenantSlug: tenant.slug,
      type: assetType,
    });

    const fileDoc = await File.create({
      tenantId,
      name: file.name,
      filename: asset.publicId,
      size: file.size,
      type: file.type,
      url: asset.url,
      assetType,
      resourceType: asset.resourceType,
      folder: asset.folder,
      uploadedBy: user.userId,
    });

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
        assetType,
        cloudinaryPublicId: asset.publicId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: fileDoc._id,
        url: asset.url,
        filename: asset.publicId,
        size: file.size,
        type: file.type,
        assetType,
        uploadedAt: fileDoc.uploadedAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof StorageNotConfiguredError) return storageUnavailable(t);
    logger.error('Error uploading file:', error instanceof Error ? error.message : error);
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

    if (!(await hasAnyPermission(user.role, tenantId, FILE_MANAGER_PERMISSIONS))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
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

    // Optional ?type=products|branding|files filter
    const typeParam = new URL(request.url).searchParams.get('type');
    if (typeParam !== null && !isAssetType(typeParam)) {
      return NextResponse.json({ success: false, error: t('validation.invalidAssetType', 'Invalid upload type') }, { status: 400 });
    }

    await connectDB();

    const query: Record<string, unknown> = { tenantId };
    if (typeParam) {
      // Uploads made before asset types existed have no assetType; they were all general library files
      query.assetType = typeParam === 'files' ? { $in: ['files', null] } : typeParam;
    }

    const files = await File.find(query)
      .select('_id name filename size type url assetType uploadedAt uploadedBy')
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
        assetType: file.assetType || 'files',
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

    if (!(await hasAnyPermission(user.role, tenantId, FILE_MANAGER_PERMISSIONS))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
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
    if (!mongoose.isValidObjectId(fileId)) {
      return NextResponse.json({ success: false, error: t('validation.fileNotFound', 'File not found') }, { status: 404 });
    }

    await connectDB();

    // Tenant-scoped lookup: another tenant's file id is simply "not found"
    const file = await File.findOne({ _id: fileId, tenantId });

    if (!file) {
      return NextResponse.json({ success: false, error: t('validation.fileNotFound', 'File not found') }, { status: 404 });
    }

    // Delete from Cloudinary first, and keep the record if that fails: on the
    // shared account an asset whose record is gone can never be cleaned up.
    try {
      await deleteTenantAsset({
        publicId: file.filename,
        resourceType: file.resourceType,
        tenantId,
        recordFolder: file.folder,
      });
    } catch (cloudinaryError) {
      if (cloudinaryError instanceof StorageNotConfiguredError) return storageUnavailable(t);
      logger.error('Error deleting from Cloudinary:', cloudinaryError);
      return NextResponse.json(
        { success: false, error: t('validation.storageDeleteFailed', 'Could not delete the file from storage. Please try again.') },
        { status: 502 }
      );
    }

    await File.deleteOne({ _id: file._id, tenantId });

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
        assetType: file.assetType || 'files',
        cloudinaryPublicId: file.filename,
      },
    });

    return NextResponse.json({
      success: true,
      message: t('validation.fileDeleted', 'File deleted successfully'),
    });
  } catch (error: unknown) {
    logger.error('Error deleting file:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: t('validation.deleteFailed', 'Failed to delete file') }, { status: 500 });
  }
}
