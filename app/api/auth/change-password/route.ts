import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/change-password
 * Authenticated endpoint for changing the current user's password.
 * Body: { currentPassword, newPassword }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const body = await request.json();
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

    // Prevent reusing the same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { success: false, error: t('validation.passwordMustDiffer', 'New password must be different from current password') },
        { status: 400 }
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
      message: t('validation.passwordChangedSuccess', 'Password changed successfully'),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Password change failed' },
      { status: 500 }
    );
  }
}
