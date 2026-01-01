import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * GET - Get QR code token for a user (admin/manager only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['owner', 'admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const user = await User.findOne({ _id: id, tenantId }).select('qrToken name email');
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    if (!user.qrToken) {
      // Generate QR token if it doesn't exist
      const newQrToken = user._id.toString() + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
      await User.findByIdAndUpdate(id, { qrToken: newQrToken });
      return NextResponse.json({
        success: true,
        data: {
          qrToken: newQrToken,
          name: user.name,
          email: user.email,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        qrToken: user.qrToken,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('Get user QR code error:', error);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToGetQrCode', 'Failed to get QR code') },
      { status: error.message === 'Unauthorized' || error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

/**
 * POST - Regenerate QR code token for a user (admin/manager only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['owner', 'admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const currentUser = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Verify user exists and belongs to same tenant
    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    // Generate new QR token
    const newQrToken = user._id.toString() + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
    
    await User.findByIdAndUpdate(id, { qrToken: newQrToken });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: id,
      changes: { qrToken: { regenerated: true } },
      metadata: { updatedBy: currentUser?.userId },
    });

    return NextResponse.json({
      success: true,
      data: {
        qrToken: newQrToken,
      },
    });
  } catch (error: any) {
    console.error('Regenerate user QR code error:', error);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToRegenerateQrCode', 'Failed to regenerate QR code') },
      { status: error.message === 'Unauthorized' || error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

