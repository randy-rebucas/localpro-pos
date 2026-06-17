import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { validateEmail, validatePassword } from '@/lib/validation';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { revokeAllUserTokens } from '@/lib/token-blacklist';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * GET - Get current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();
    let user = await User.findById(currentUser.userId)
      .select('-password')
      .lean();

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    }

    // Generate QR token if it doesn't exist
    if (!user.qrToken) {
      const newQrToken = crypto.randomBytes(32).toString('hex');
      await User.findByIdAndUpdate(currentUser.userId, { qrToken: newQrToken });
      user = await User.findById(currentUser.userId).select('-password').lean();
      
      if (!user) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    // Get tenant slug and name
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findById(user.tenantId).select('slug name').lean();
    const tenantSlug = tenant?.slug || null;
    const tenantName = tenant?.name || null;

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        qrToken: user.qrToken || null,
        tenantId: user.tenantId?.toString() || null,
        tenantSlug,
        tenantName,
      },
    });
  } catch (_error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}

/**
 * PUT - Update current user's profile
 */
export async function PUT(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    const currentUser = await getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();
    const { email, password, name, currentPassword } = body;

    // Get translation function
    t = await getValidationTranslatorFromRequest(request);

    const oldUser = await User.findById(currentUser.userId).lean();
    if (!oldUser || !oldUser.isActive) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (email !== undefined && email !== oldUser.email) {
      if (!validateEmail(email)) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
          { status: 400 }
        );
      }
      updateData.email = email.toLowerCase();
    }
    
    if (name !== undefined && name !== oldUser.name) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    
    // Password change requires current password
    if (password !== undefined && password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: t('validation.currentPasswordRequired', 'Current password is required to change password') },
          { status: 400 }
        );
      }

      // Verify current password
      const userDoc = await User.findById(currentUser.userId).select('+password');
      if (!userDoc) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }

      const isPasswordValid = await userDoc.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: t('validation.currentPasswordIncorrect', 'Current password is incorrect') },
          { status: 400 }
        );
      }

      const passwordValidation = validatePassword(password, t);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
          { status: 400 }
        );
      }
      updateData.password = password;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.noChanges', 'No changes provided') },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndUpdate(
      currentUser.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Revoke all existing tokens when password is changed
    if (updateData.password) {
      await revokeAllUserTokens(currentUser.userId);
    }

    // Track changes (excluding password details)
    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'password' && oldUser[key as keyof typeof oldUser] !== updateData[key]) {
        changes[key] = {
          old: oldUser[key as keyof typeof oldUser],
          new: updateData[key],
        };
      }
    });
    if (password) {
      changes.password = { changed: true };
    }

    await createAuditLog(request, {
      tenantId: currentUser.tenantId,
      userId: currentUser.userId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: currentUser.userId,
      changes,
    });
    
    return NextResponse.json({ 
      success: true, 
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        qrToken: user.qrToken || null,
      }
    });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}

