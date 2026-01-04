import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireAuth } from '@/lib/auth';
import { isPinDuplicate } from '@/lib/pin-validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * PUT - Update current user's PIN
 */
export async function PUT(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    const user = await requireAuth(request);
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json(
        { success: false, error: t('validation.pinRequired', 'PIN is required') },
        { status: 400 }
      );
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: t('validation.pinFormat', 'PIN must be 4-8 digits') },
        { status: 400 }
      );
    }

    // Get user's tenant ID
    const userDoc = await User.findById(user.userId).select('tenantId').lean();
    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    // Check if PIN is already in use by another user in the same tenant
    const pinExists = await isPinDuplicate(userDoc.tenantId, pin, user.userId);
    if (pinExists) {
      return NextResponse.json(
        { success: false, error: t('validation.pinInUse', 'This PIN is already in use by another user in your organization') },
        { status: 400 }
      );
    }

    // Hash the PIN before saving (the pre-save hook will handle it, but we can also do it here)
    // Actually, the pre-save hook will handle hashing, so we can just set it directly
    await User.findByIdAndUpdate(user.userId, { pin });

    return NextResponse.json({
      success: true,
      message: 'PIN updated successfully',
    });
  } catch (error: unknown) {
    console.error('Update PIN error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update PIN'; 
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

/**
 * DELETE - Remove current user's PIN
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    await User.findByIdAndUpdate(user.userId, { $unset: { pin: 1 } });

    return NextResponse.json({
      success: true,
      message: 'PIN removed successfully',
    });
  } catch (error: unknown) {
    console.error('Delete PIN error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove PIN'; 
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

