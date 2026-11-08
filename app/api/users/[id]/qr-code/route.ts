import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { canManageUserAccount } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';

/** A QR badge signs its holder in as that user, so only someone who could manage the account may see or reissue it. */
const forbiddenBadge = (t: (key: string, fallback: string) => string) =>
  NextResponse.json(
    { success: false, error: t('validation.cannotModifyHigherRole', 'You cannot modify a user with a higher role than your own') },
    { status: 403 }
  );

/**
 * GET - Get QR code token for a user (admin/manager only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    const authUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (!(await hasTenantPermission(authUser.role, tenantId, 'users.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const user = await User.findOne({ _id: id, tenantId }).select('qrToken name email role');

    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    if (!canManageUserAccount(authUser.role, user.role, id === authUser.userId)) {
      return forbiddenBadge(t);
    }

    // Opening a badge exposes a sign-in credential — keep a record of who did.
    await createAuditLog(request, {
      tenantId,
      userId: authUser.userId,
      action: AuditActions.VIEW,
      entityType: 'user',
      entityId: id,
      changes: { qrToken: { viewed: true } },
    });

    if (!user.qrToken) {
      // Generate QR token if it doesn't exist
      const newQrToken = crypto.randomBytes(32).toString('hex');
      await User.findOneAndUpdate({ _id: id, tenantId }, { qrToken: newQrToken });
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get user QR code error:', error);
    const errorMessage = error.message || 'Failed to get QR code';
    return NextResponse.json(
      { success: false, error: errorMessage },
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
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    const authUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const currentUser = await getCurrentUser(request);
    t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (!(await hasTenantPermission(authUser.role, tenantId, 'users.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { allowed } = checkRateLimit(`write:users-qr:${tenantId}:${authUser.userId}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    // Verify user exists and belongs to same tenant
    const user = await User.findOne({ _id: id, tenantId }).select('role');
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    if (!canManageUserAccount(authUser.role, user.role, id === authUser.userId)) {
      return forbiddenBadge(t);
    }

    // Generate new QR token
    const newQrToken = crypto.randomBytes(32).toString('hex');

    await User.findOneAndUpdate({ _id: id, tenantId }, { qrToken: newQrToken });

    await createAuditLog(request, {
      tenantId,
      userId: currentUser?.userId,
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Regenerate user QR code error:', error);
    const errorMessage = error.message || 'Failed to regenerate QR code';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: error.message === 'Unauthorized' || error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

