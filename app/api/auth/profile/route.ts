import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validatePassword } from '@/lib/validation';
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

    let user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        id: true, email: true, name: true, role: true, isActive: true,
        createdAt: true, lastLogin: true, qrToken: true, tenantId: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    }

    // Generate QR token if it doesn't exist
    if (!user.qrToken) {
      const newQrToken = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({ where: { id: currentUser.userId }, data: { qrToken: newQrToken } });
      user = await prisma.user.findUnique({
        where: { id: currentUser.userId },
        select: {
          id: true, email: true, name: true, role: true, isActive: true,
          createdAt: true, lastLogin: true, qrToken: true, tenantId: true,
        },
      });

      if (!user) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    // Get tenant slug and name
    const tenant = user.tenantId
      ? await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { slug: true, name: true } })
      : null;
    const tenantSlug = tenant?.slug || null;
    const tenantName = tenant?.name || null;

    return NextResponse.json({
      success: true,
      user: {
        _id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        qrToken: user.qrToken || null,
        tenantId: user.tenantId || null,
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

    const body = await request.json();
    const { email, password, name, currentPassword } = body;

    // Get translation function
    t = await getValidationTranslatorFromRequest(request);

    const oldUser = await prisma.user.findUnique({ where: { id: currentUser.userId } });
    if (!oldUser || !oldUser.isActive) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Users cannot change their own email from self-service profile settings —
    // it's their login/recovery identifier; changes must go through an admin.
    if (email !== undefined && email !== oldUser.email) {
      return NextResponse.json(
        { success: false, error: t('validation.emailCannotBeChanged', 'Your email address cannot be changed here. Contact an administrator.') },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (name !== undefined && name !== oldUser.name) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    // Changing the password requires re-verifying the current password, so a
    // hijacked session can't silently take over the account.
    if (password !== undefined && password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: t('validation.currentPasswordRequired', 'Current password is required to change your password') },
          { status: 400 }
        );
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, oldUser.password);
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: t('validation.currentPasswordIncorrect', 'Current password is incorrect') },
          { status: 400 }
        );
      }
    }

    if (password !== undefined && password) {
      const passwordValidation = validatePassword(password, t);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
          { status: 400 }
        );
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.noChanges', 'No changes provided') },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({ where: { id: oldUser.id }, data: updateData });

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
        _id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        qrToken: user.qrToken || null,
      }
    });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}
