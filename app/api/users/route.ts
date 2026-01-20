import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail, validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const users = await User.find({ tenantId })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
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
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
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

    // Check subscription limits
    const currentUserCount = await User.countDocuments({ tenantId, isActive: true });
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxUsers', currentUserCount);
    } catch (limitError: any) {
      return NextResponse.json(
        { success: false, error: limitError.message },
        { status: 403 }
      );
    }

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      role: role || 'cashier',
      tenantId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'user',
      entityId: user._id.toString(),
      changes: { email, name, role: user.role },
    });

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        users: currentUserCount + 1
      });
    } catch (usageError) {
      console.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    const userResponse = user.toObject();
    const { password: _, ...userWithoutPassword } = userResponse;

    return NextResponse.json({ success: true, data: userWithoutPassword }, { status: 201 });
  } catch (error: any) {
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
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

