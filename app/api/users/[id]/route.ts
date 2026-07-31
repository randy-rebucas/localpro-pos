import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getRoleRank } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail, validatePassword } from '@/lib/validation';
import { handleApiError } from '@/lib/error-handler';
import { revokeAllUserTokens } from '@/lib/token-blacklist';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const authUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(authUser.role, tenantId, 'users.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const user = await User.findOne({ _id: id, tenantId })
      .select('-password')
      .lean();
    
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: user });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    const actingUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(actingUser.role, tenantId, 'users.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, name, role, isActive } = body;

    const oldUser = await User.findOne({ _id: id, tenantId }).lean();
    if (!oldUser) {
      return NextResponse.json({ success: false, error: t('validation.userNotFound', 'User not found') }, { status: 404 });
    }

    // SECURITY: A manager/admin cannot modify an account ranked above their
    // own (e.g. a manager editing an admin or owner account).
    if (getRoleRank(oldUser.role) > getRoleRank(actingUser.role)) {
      return NextResponse.json(
        { success: false, error: t('validation.cannotModifyHigherRole', 'You cannot modify a user with a higher role than your own') },
        { status: 403 }
      );
    }

    // SECURITY: prevent privilege escalation via role changes.
    if (role !== undefined) {
      if (getRoleRank(role) > getRoleRank(actingUser.role)) {
        return NextResponse.json(
          { success: false, error: t('validation.cannotGrantHigherRole', 'You cannot assign a role higher than your own') },
          { status: 403 }
        );
      }
      if (role === 'owner' && actingUser.role !== 'owner') {
        return NextResponse.json(
          { success: false, error: t('validation.onlyOwnerCanGrantOwner', 'Only an owner can grant the owner role') },
          { status: 403 }
        );
      }
    }

    // SECURITY: prevent self-lockout — a user cannot deactivate their own account.
    if (isActive === false && id === actingUser.userId) {
      return NextResponse.json(
        { success: false, error: t('validation.cannotDeactivateSelf', 'You cannot deactivate your own account') },
        { status: 400 }
      );
    }

    // SECURITY: prevent a tenant from being left with no active owner/admin.
    if (isActive === false && oldUser.isActive !== false && ['owner', 'admin'].includes(oldUser.role)) {
      const remainingActiveAdmins = await User.countDocuments({
        tenantId,
        _id: { $ne: id },
        isActive: { $ne: false },
        role: { $in: ['owner', 'admin'] },
      });
      if (remainingActiveAdmins === 0) {
        return NextResponse.json(
          { success: false, error: t('validation.cannotDeactivateLastAdmin', 'Cannot deactivate the last active owner/admin for this tenant') },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

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

    // Revoke all existing tokens when password is changed or account is deactivated
    if (updateData.password || updateData.isActive === false) {
      await revokeAllUserTokens(id);
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 11000) {
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
    const actingUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(actingUser.role, tenantId, 'users.delete'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const user = await User.findOne({ _id: id, tenantId }).lean();
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // SECURITY: can't delete your own account, and can't delete a user
    // ranked above you (e.g. an admin deleting an owner).
    if (id === actingUser.userId) {
      return NextResponse.json({ success: false, error: 'You cannot delete your own account' }, { status: 400 });
    }
    if (getRoleRank(user.role) > getRoleRank(actingUser.role)) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete a user with a higher role than your own' },
        { status: 403 }
      );
    }

    // SECURITY: prevent a tenant from being left with no active owner/admin.
    if (user.isActive !== false && ['owner', 'admin'].includes(user.role)) {
      const remainingActiveAdmins = await User.countDocuments({
        tenantId,
        _id: { $ne: id },
        isActive: { $ne: false },
        role: { $in: ['owner', 'admin'] },
      });
      if (remainingActiveAdmins === 0) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete the last active owner/admin for this tenant' },
          { status: 400 }
        );
      }
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

