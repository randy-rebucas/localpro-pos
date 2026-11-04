import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { validateEmail } from '@/lib/validation';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

const PROFILE_FIELDS = 'name email role isActive lastLogin createdAt updatedAt';

/**
 * GET /api/client/profile?userId={{userId}}&tenantId={{tenantId}}
 * Authenticated endpoint to get a client's profile.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const tenantIdParam = searchParams.get('tenantId');

    if (!userId || !tenantIdParam) {
      return NextResponse.json(
        { success: false, error: t('validation.missingParams', 'userId and tenantId are required') },
        { status: 400 }
      );
    }

    // Users can only view their own profile (unless admin+)
    if (currentUser.userId !== userId && !['admin', 'owner', 'manager'].includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You can only view your own profile') },
        { status: 403 }
      );
    }

    // Resolve tenant
    const { tenants, users } = getRepos();
    const tenant = await tenants.findActiveBySlugOrId(tenantIdParam);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    const user = await users.findInTenant(tenant._id, userId, { select: PROFILE_FIELDS });

    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/client/profile?userId={{userId}}&tenantId={{tenantId}}
 * Authenticated endpoint to update a client's profile.
 * Body: { name?, email?, phone? }
 */
export async function PUT(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const tenantIdParam = searchParams.get('tenantId');

    if (!userId || !tenantIdParam) {
      return NextResponse.json(
        { success: false, error: t('validation.missingParams', 'userId and tenantId are required') },
        { status: 400 }
      );
    }

    // Users can only update their own profile (unless admin+)
    if (currentUser.userId !== userId && !['admin', 'owner', 'manager'].includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You can only update your own profile') },
        { status: 403 }
      );
    }

    // Resolve tenant
    const { tenants, users } = getRepos();
    const tenant = await tenants.findActiveBySlugOrId(tenantIdParam);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, email } = body;

    const updates: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name cannot be empty') },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (email !== undefined) {
      if (!validateEmail(email)) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
          { status: 400 }
        );
      }

      // Check if email is already taken by another user in this tenant
      const existingUser = await users.findByEmail(email, { tenantId: tenant._id, excludeId: userId });

      if (existingUser) {
        return NextResponse.json(
          { success: false, error: t('validation.emailExists', 'An account with this email already exists') },
          { status: 400 }
        );
      }

      updates.email = email.toLowerCase();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.noChanges', 'No fields to update') },
        { status: 400 }
      );
    }

    const result = await users.update(userId, updates, { tenantId: tenant._id, select: PROFILE_FIELDS });
    const updatedUser = result?.after;

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: currentUser.userId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: userId,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
