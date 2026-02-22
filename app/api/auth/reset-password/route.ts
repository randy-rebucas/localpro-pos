import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { validateEmail, validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/reset-password
 *
 * Two modes:
 * 1. Authenticated user changing their password:
 *    Body: { currentPassword, newPassword }
 *    Requires: valid auth token
 *
 * 2. Unauthenticated password reset (e.g. via email token):
 *    Body: { email, tenantId, resetToken, newPassword }
 *    Requires: valid reset token
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();

    const currentUser = await getCurrentUser(request);

    if (currentUser) {
      // Mode 1: Authenticated password change
      return await handleAuthenticatedReset(request, body, currentUser, t);
    } else {
      // Mode 2: Token-based password reset
      return await handleTokenReset(request, body, t);
    }
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Password reset failed' },
      { status: 500 }
    );
  }
}

async function handleAuthenticatedReset(
  request: NextRequest,
  body: { currentPassword?: string; newPassword?: string },
  currentUser: { userId: string; tenantId: string; email: string; role: string },
  t: (key: string, fallback: string) => string
) {
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, error: t('validation.passwordFieldsRequired', 'Current password and new password are required') },
      { status: 400 }
    );
  }

  const passwordValidation = validatePassword(newPassword, t);
  if (!passwordValidation.valid) {
    return NextResponse.json(
      { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
      { status: 400 }
    );
  }

  const user = await User.findById(currentUser.userId).select('+password');
  if (!user) {
    return NextResponse.json(
      { success: false, error: t('validation.userNotFound', 'User not found') },
      { status: 404 }
    );
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return NextResponse.json(
      { success: false, error: t('validation.currentPasswordIncorrect', 'Current password is incorrect') },
      { status: 401 }
    );
  }

  // Update password (pre-save hook will hash it)
  user.password = newPassword;
  await user.save();

  await createAuditLog(request, {
    tenantId: currentUser.tenantId,
    action: AuditActions.UPDATE,
    entityType: 'user',
    entityId: currentUser.userId,
    changes: { passwordChanged: true },
  });

  return NextResponse.json({
    success: true,
    message: t('validation.passwordResetSuccess', 'Password has been reset successfully'),
  });
}

async function handleTokenReset(
  request: NextRequest,
  body: { email?: string; tenantId?: string; resetToken?: string; newPassword?: string },
  t: (key: string, fallback: string) => string
) {
  const { email, tenantId, resetToken, newPassword } = body;

  if (!email || !tenantId || !resetToken || !newPassword) {
    return NextResponse.json(
      { success: false, error: t('validation.resetFieldsRequired', 'Email, tenantId, resetToken, and newPassword are required') },
      { status: 400 }
    );
  }

  if (!validateEmail(email)) {
    return NextResponse.json(
      { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
      { status: 400 }
    );
  }

  const passwordValidation = validatePassword(newPassword, t);
  if (!passwordValidation.valid) {
    return NextResponse.json(
      { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
      { status: 400 }
    );
  }

  // Find tenant
  const Tenant = (await import('@/models/Tenant')).default;
  const tenant = await Tenant.findOne({
    $or: [{ slug: tenantId }, { _id: tenantId }],
    isActive: true,
  });

  if (!tenant) {
    return NextResponse.json(
      { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
      { status: 404 }
    );
  }

  const user = await User.findOne({
    email: email.toLowerCase(),
    tenantId: tenant._id,
  }).select('+password +resetToken +resetTokenExpiry');

  if (!user) {
    return NextResponse.json(
      { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
      { status: 400 }
    );
  }

  // Verify reset token and expiry
  const storedToken = (user as any).resetToken; // eslint-disable-line @typescript-eslint/no-explicit-any
  const tokenExpiry = (user as any).resetTokenExpiry; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (!storedToken || !tokenExpiry) {
    return NextResponse.json(
      { success: false, error: t('validation.invalidResetToken', 'Invalid or expired reset token') },
      { status: 400 }
    );
  }

  const isTokenValid = await bcrypt.compare(resetToken, storedToken);
  if (!isTokenValid || new Date() > new Date(tokenExpiry)) {
    return NextResponse.json(
      { success: false, error: t('validation.invalidResetToken', 'Invalid or expired reset token') },
      { status: 400 }
    );
  }

  // Update password and clear reset token
  user.password = newPassword;
  (user as any).resetToken = undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  (user as any).resetTokenExpiry = undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  await user.save();

  await createAuditLog(request, {
    tenantId: tenant._id.toString(),
    action: AuditActions.UPDATE,
    entityType: 'user',
    entityId: user._id.toString(),
    changes: { passwordReset: true, method: 'token' },
  });

  return NextResponse.json({
    success: true,
    message: t('validation.passwordResetSuccess', 'Password has been reset successfully'),
  });
}
