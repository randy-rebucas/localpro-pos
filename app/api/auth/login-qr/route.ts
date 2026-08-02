import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug } from '@/lib/data/tenants';
import { getUserByQrToken, updateLastLogin } from '@/lib/data/users';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
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
    const tenant = await getTenantBySlug(tenantSlug || 'default');

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFoundOrInactive', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Find user by QR token
    const user = await getUserByQrToken(qrToken);

    if (!user || user.tenantId !== tenant.id || !user.isActive) {
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
    await updateLastLogin(user.id);

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

    // Set cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: user.id,
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('QR login error:', error);
    const errorMessage = error.message || 'Login failed';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
