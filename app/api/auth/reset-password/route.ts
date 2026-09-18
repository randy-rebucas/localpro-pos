import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateEmail, validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
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
    // Rate limiting: 5 reset attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`reset-password:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many password reset attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

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

  const user = await prisma.user.findUnique({ where: { id: currentUser.userId } });
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

  // Update password (hash manually — Prisma has no save-hook equivalent)
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

  await createAuditLog(request, {
    tenantId: currentUser.tenantId,
    userId: currentUser.userId,
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
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: tenantId }, { id: tenantId }], isActive: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
      { status: 404 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), tenantId: tenant.id },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
      { status: 400 }
    );
  }

  // Verify reset token and expiry
  // NOTE: resetToken/resetTokenExpiry are not defined on the User model (Mongoose
  // or Prisma) — this branch was already unreachable/dead prior to this migration
  // (storedToken is always undefined). Preserved as-is rather than silently
  // "fixed" without product sign-off on what the real reset-token flow should be.
  const storedToken = (user as unknown as Record<string, unknown>).resetToken as string | undefined;
  const tokenExpiry = (user as unknown as Record<string, unknown>).resetTokenExpiry as Date | undefined;

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
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });

  await createAuditLog(request, {
    tenantId: tenant.id,
    action: AuditActions.UPDATE,
    entityType: 'user',
    entityId: user.id,
    changes: { passwordReset: true, method: 'token' },
  });

  return NextResponse.json({
    success: true,
    message: t('validation.passwordResetSuccess', 'Password has been reset successfully'),
  });
}
