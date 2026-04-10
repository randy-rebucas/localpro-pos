import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { AUTH_COOKIE_MAX_AGE, RL } from '@/lib/auth-config';

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // Rate limiting: 5 QR login attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`login-qr:${ip}`, RL.loginQr.max, RL.loginQr.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const body = await request.json();
    const { qrToken, tenantSlug } = body;
    t = await getValidationTranslatorFromRequest(request);

    // Validation
    if (!qrToken) {
      return NextResponse.json(
        { success: false, error: t('validation.qrTokenRequired', 'QR token is required') },
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

    // Find user by QR token
    const user = await User.findOne({ 
      qrToken, 
      tenantId: tenant._id, 
      isActive: true 
    });

    if (!user) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'invalid_qr_token', method: 'qr' },
      });
      return NextResponse.json(
        { success: false, error: t('validation.invalidQrCode', 'Invalid QR code') },
        { status: 401 }
      );
    }

    // If user has MFA enabled, do not issue a token — require MFA step
    const MFAConfig = (await import('@/models/MFAConfig')).default;
    const mfaConfig = await MFAConfig.findOne({ userId: user._id, isEnabled: true }).lean();
    if (mfaConfig) {
      return NextResponse.json({
        success: true,
        data: {
          mfaRequired: true,
          userId: user._id.toString(),
        },
      });
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
      metadata: { success: true, method: 'qr' },
    });

    // Set cookie — token is NOT returned in body (httpOnly cookie is sufficient)
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: user._id,
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
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('QR login error:', error);
    const errorMessage = error.message || 'Login failed';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

