import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail } from '@/lib/validation';
import bcrypt from 'bcryptjs';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    const body = await request.json();
    const { email, password, tenantSlug } = body;
    t = await getValidationTranslatorFromRequest(request);

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: t('validation.emailPasswordRequired', 'Email and password are required') },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
        { status: 400 }
      );
    }

    // Get tenant ID from slug
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({ slug: tenantSlug || 'default', isActive: true }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFoundOrInactive', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // First check if user exists in any tenant (to provide better error message)
    const userInAnyTenant = await User.findOne({ email: email.toLowerCase(), isActive: true })
      .select('tenantId');
    
    // Find user with password field in the requested tenant - ensure we get a Mongoose document, not a plain object
    const user = await User.findOne({ email: email.toLowerCase(), tenantId: tenant._id })
      .select('+password');

    if (!user || !user.isActive) {
      // Provide more specific error message
      if (userInAnyTenant) {
        // User exists but not in this tenant
        await createAuditLog(request, {
          tenantId: tenant._id,
          action: AuditActions.LOGIN,
          entityType: 'user',
          metadata: { success: false, reason: 'user_not_in_tenant', email: email.toLowerCase() },
        });
        return NextResponse.json(
          { success: false, error: 'This account does not have access to this store. Please log in to the correct store or contact your administrator.' },
          { status: 403 }
        );
      } else {
        // User doesn't exist at all
        await createAuditLog(request, {
          tenantId: tenant._id,
          action: AuditActions.LOGIN,
          entityType: 'user',
          metadata: { success: false, reason: 'user_not_found', email: email.toLowerCase() },
        });
        return NextResponse.json(
          { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
          { status: 401 }
        );
      }
    }

    // Check if password exists and is a string
    if (!user.password || typeof user.password !== 'string') {
      console.error('User password is missing or invalid for user:', user._id, 'Password type:', typeof user.password);
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }

    // Verify password using bcrypt directly (not the method to avoid 'this' context issues)
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError: unknown) {
      console.error('Bcrypt comparison error:', bcryptError);
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }
    
    if (!isPasswordValid) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: { success: false, reason: 'invalid_password' },
      });
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      tenantId: tenant._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: user._id.toString(),
      metadata: { success: true },
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: unknown) {
    console.error('Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

