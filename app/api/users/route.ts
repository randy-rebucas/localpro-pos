import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getRoleRank } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail, validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { listTenantUsers, countActiveUsers, createUser } from '@/lib/data/users';
import { Prisma } from '@prisma/client';

function serializeUser(user: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, password: _password, ...rest } = user;
  return { _id: id, ...rest };
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'users.manage'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    const isActiveParam = request.nextUrl.searchParams.get('isActive');
    const isActiveFilter = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

    const users = await listTenantUsers(tenantId, isActiveFilter);

    return NextResponse.json({ success: true, data: users.map(serializeUser) });
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

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    let actingUser: { userId: string; role: string };
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'users.manage'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
      actingUser = tenantAccess.user;
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      t = await getValidationTranslatorFromRequest(request);
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    const body = await request.json();
    const { email, password, name, role } = body;

    // Get translation function
    t = await getValidationTranslatorFromRequest(request);

    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: t('validation.userFieldsRequired', 'Email, password, and name are required') },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
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

    if (role && !['owner', 'admin', 'manager', 'cashier', 'viewer'].includes(role)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidRole', 'Invalid role') },
        { status: 400 }
      );
    }

    // SECURITY: Prevent privilege escalation — an actor can't grant a role
    // ranked above their own (e.g. a manager creating an admin), and only an
    // owner can create another owner.
    if (role && getRoleRank(role) > getRoleRank(actingUser.role)) {
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

    // Check subscription limits
    const currentUserCount = await countActiveUsers(tenantId);
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxUsers', currentUserCount);
    } catch (limitError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: limitError.message },
        { status: 403 }
      );
    }

    let user;
    try {
      user = await createUser({
        email: email.toLowerCase(),
        password,
        name,
        role: role || 'cashier',
        tenantId,
      });
    } catch (createErr: unknown) {
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: 'User with this email already exists' },
          { status: 400 }
        );
      }
      throw createErr;
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'user',
      entityId: user.id,
      changes: { email, name, role: user.role },
    });

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        users: currentUserCount + 1
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: serializeUser(user) }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
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
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
