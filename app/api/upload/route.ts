import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import File from '@/models/File';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
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

    // Create tenant upload directory
    const tenantDir = path.join(UPLOAD_DIR, tenantId);
    await fs.mkdir(tenantDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(file.name) || '.jpg';
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${hash}${ext}`;
    const filePath = path.join(tenantDir, filename);

    // Verify the resolved path is within UPLOAD_DIR (prevent path traversal)
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json({ success: false, error: 'Invalid file path' }, { status: 400 });
    }

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Return public URL
    const url = `/uploads/${tenantId}/${filename}`;

    // Connect to database and save file record
    await connectDB();
    const fileDoc = await File.create({
      tenantId,
      name: file.name,
      filename,
      size: file.size,
      type: file.type,
      url,
      uploadedBy: user.userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: fileDoc._id,
        url,
        filename,
        size: file.size,
        type: file.type,
        uploadedAt: fileDoc.uploadedAt,
      },
    });
  } catch (error: unknown) {
    logger.error('Error uploading file:', error);
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
