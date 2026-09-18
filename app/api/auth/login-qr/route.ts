import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // Rate limiting: 10 attempts per 15 minutes per IP (matches password login)
    const ip = getClientIp(request);
    const rl = checkRateLimit(`login-qr:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

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
    const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug || 'default', isActive: true } });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFoundOrInactive', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Find user by QR token
    const user = await prisma.user.findFirst({
      where: { qrToken, tenantId: tenant.id, isActive: true },
    });

    if (!user) {
      await createAuditLog(request, {
        tenantId: tenant.id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'invalid_qr_token', method: 'qr' },
      });
      return NextResponse.json(
        { success: false, error: t('validation.invalidQrCode', 'Invalid QR code') },
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
      metadata: { success: true, method: 'qr' },
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
      maxAge: 60 * 60 * 24 * 7, // 7 days
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
