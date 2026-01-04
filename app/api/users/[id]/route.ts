import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail, validatePassword } from '@/lib/validation';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const user = await User.findOne({ _id: id, tenantId })
      .select('-password')
      .lean();
    
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const body = await request.json();
    const { email, password, name, role, isActive } = body;

    const oldUser = await User.findOne({ _id: id, tenantId }).lean();
    if (!oldUser) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (email !== undefined) {
      if (!validateEmail(email)) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
          { status: 400 }
        );
      }
      updateData.email = email.toLowerCase();
    }
    
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    
    if (role !== undefined) {
      if (!['owner', 'admin', 'manager', 'cashier', 'viewer'].includes(role)) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidRole', 'Invalid role') },
          { status: 400 }
        );
      }
      updateData.role = role;
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    
    if (password !== undefined && password) {
      const passwordValidation = validatePassword(password, t);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { success: false, error: t('validation.passwordValidationFailed', 'Password validation failed'), errors: passwordValidation.errors },
          { status: 400 }
        );
      }
      updateData.password = password;
    }

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId },
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Track changes
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
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: id,
      changes,
    });
    
    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const user = await User.findOne({ _id: id, tenantId }).lean();
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Hard delete - actually remove the user from the database
    await User.findOneAndDelete({ _id: id, tenantId });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'user',
      entityId: id,
      changes: { email: user.email, name: user.name },
    });
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: unknown) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

