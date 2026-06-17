import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import File from '@/models/File';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';

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
  try {
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 403 });
    }

    if (!user || !user.userId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 401 });
    }

    // Rate limit: 50 uploads per hour per user
    const rateLimitKey = `upload:${tenantId}:${user.userId}`;
    const { allowed } = checkRateLimit(rateLimitKey, 50, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Upload limit exceeded. Maximum 50 uploads per hour.' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to Cloudinary with tenant isolation
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const cloudinaryResult = await uploadToCloudinary(fileBuffer, file.name, tenantId, file.type);

    // Connect to database and save file record
    await connectDB();
    const fileDoc = await File.create({
      tenantId,
      name: file.name,
      filename: cloudinaryResult.public_id,
      size: file.size,
      type: file.type,
      url: cloudinaryResult.secure_url,
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
        cloudinaryPublicId: cloudinaryResult.public_id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: fileDoc._id,
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
    return NextResponse.json({ success: false, error: 'Failed to upload file' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 403 });
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
    return NextResponse.json({ success: false, error: 'Failed to fetch files' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 403 });
    }

    if (!user || !user.userId) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 401 });
    }

    // Get file ID from query params
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ success: false, error: 'File ID is required' }, { status: 400 });
    }

    await connectDB();

    // Fetch the file to get cloudinary public_id
    const file = await File.findById(fileId);

    if (!file) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    // Ensure file belongs to authenticated tenant (security check)
    if (file.tenantId.toString() !== tenantId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: File does not belong to your tenant' },
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
    await File.deleteOne({ _id: fileId });

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
      message: 'File deleted successfully',
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Error deleting file:', error.message);
    } else {
      logger.error('Error deleting file:', error);
    }
    return NextResponse.json({ success: false, error: 'Failed to delete file' }, { status: 500 });
  }
}

