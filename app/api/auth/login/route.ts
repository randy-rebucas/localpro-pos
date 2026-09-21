import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail } from '@/lib/validation';
import bcrypt from 'bcryptjs';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { logger } from '@/lib/logger';
import { setTenantContext } from '@/lib/tenant-context';

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // Rate limiting: 10 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { email, password, tenantSlug, recaptchaToken } = body;
    t = await getValidationTranslatorFromRequest(request);

    const recaptchaValid = await verifyRecaptcha(recaptchaToken, ip);
    if (!recaptchaValid) {
      return NextResponse.json(
        { success: false, error: t('validation.recaptchaFailed', 'reCAPTCHA verification failed. Please try again.') },
        { status: 400 }
      );
    }

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
    const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug || 'default', isActive: true } });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFoundOrInactive', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }
    setTenantContext(tenant.id);

    // Find user with password field in the requested tenant
    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), tenantId: tenant.id } });

    if (!user || !user.isActive) {
      await createAuditLog(request, {
        tenantId: tenant.id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'user_not_found', email: email.toLowerCase() },
      });
      // Generic message — do not reveal whether the user exists in this or another tenant
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }

    // Check if password exists and is a string
    if (!user.password || typeof user.password !== 'string') {
      logger.error('User password is missing or invalid', { userId: user.id, passwordType: typeof user.password });
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }

    // Verify password using bcrypt directly (not the method to avoid 'this' context issues)
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('Bcrypt comparison error:', bcryptError);
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }
    
    if (!isPasswordValid) {
      await createAuditLog(request, {
        tenantId: tenant.id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        entityId: user.id,
        metadata: { success: false, reason: 'invalid_password' },
      });
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid credentials') },
        { status: 401 }
      );
    }

    // Update last login
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    // Generate token
    const token = generateToken({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: user.role,
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: user.id,
      metadata: { success: true },
    });

    // Set httpOnly cookie — do NOT return token in body (XSS risk)
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    );
  }
}

