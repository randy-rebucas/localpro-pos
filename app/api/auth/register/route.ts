import { NextRequest, NextResponse } from 'next/server';
import { getRepos, isDuplicateKeyError } from '@/lib/db';
import { validateEmail, validatePassword } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Public endpoint for client (end user) registration
 * Allows a user to register for a specific tenant
 * POST /api/auth/register
 * Body: { name, email, password, tenantId }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // Rate limiting: 5 registrations per hour per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { name, email, password, tenantId } = body;

    // Get translation function
    t = await getValidationTranslatorFromRequest(request);

    // Validate input
    if (!name || !email || !password || !tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.userFieldsRequired', 'Name, email, password, and tenantId are required') },
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

    // Check tenant exists and is active
    const { tenants, users } = getRepos();
    const tenant = await tenants.findActiveBySlugOrId(String(tenantId));
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Check if user already exists
    const existingUser = await users.findByEmail(email, { tenantId: tenant._id });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: t('validation.emailExists', 'An account with this email already exists for this tenant') },
        { status: 400 }
      );
    }

    // Create user (default role: "viewer")
    const user = await users.create({
      email: email.toLowerCase(),
      password,
      name,
      role: 'viewer',
      tenantId: tenant._id,
      isActive: true,
    });

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.CREATE,
      entityType: 'user',
      entityId: user._id,
      changes: { email, name, role: 'viewer' },
    });

    // Issue JWT token
    const token = generateToken({
        userId: user._id, 
        tenantId: tenant._id, 
        role: user.role,
        email: user.email
    });

    // users.create() never returns the password hash
    const userWithoutPassword = user;

    // Return token only via httpOnly cookie — not in body
    const response = NextResponse.json({
      success: true,
      data: userWithoutPassword,
      message: t('validation.userCreatedSuccess', 'Registration successful! You can now log in.')
    }, { status: 201 });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    logger.error('Register error:', error);
    return NextResponse.json({ success: false, error: 'Registration failed. Please try again.' }, { status: 400 });
  }
}
