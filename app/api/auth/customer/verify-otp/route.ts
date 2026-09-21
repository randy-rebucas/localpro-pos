import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { generateCustomerToken } from '@/lib/auth-customer';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { setTenantContext } from '@/lib/tenant-context';

/**
 * POST - Verify OTP and login customer
 * Body: { phone: string, otp: string, tenantSlug?: string, firstName?: string, lastName?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 verify attempts per 10 minutes per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`verify-otp:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { phone, otp, tenantSlug, firstName, lastName } = body;

    // Validation
    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, error: t('validation.phoneOtpRequired', 'Phone number and OTP are required') },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');

    // Get tenant ID
    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug || 'default', isActive: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }
    setTenantContext(tenant.id);

    // Find valid OTP
    const otpRecord = await prisma.customerOTP.findFirst({
      where: {
        tenantId: tenant.id,
        phone: normalizedPhone,
        otp,
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      // Increment attempts for rate limiting
      await prisma.customerOTP.updateMany({
        where: { tenantId: tenant.id, phone: normalizedPhone, verified: false },
        data: { attempts: { increment: 1 } },
      });

      return NextResponse.json(
        { success: false, error: t('validation.invalidOtp', 'Invalid or expired OTP') },
        { status: 401 }
      );
    }

    // Check max attempts
    if (otpRecord.attempts >= 5) {
      return NextResponse.json(
        { success: false, error: t('validation.maxOtpAttempts', 'Maximum verification attempts exceeded') },
        { status: 429 }
      );
    }

    // Mark OTP as verified
    await prisma.customerOTP.update({ where: { id: otpRecord.id }, data: { verified: true } });

    // Find or create customer
    let customer = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, phone: normalizedPhone },
    });

    if (!customer) {
      // Create new customer if doesn't exist
      if (!firstName || !lastName) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'First name and last name are required for new customers') },
          { status: 400 }
        );
      }

      try {
        customer = await prisma.customer.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            firstName,
            lastName,
            phone: normalizedPhone,
            isActive: true,
          },
        });
      } catch (createError: unknown) {
        // Unique-constraint race: another concurrent verify for the same
        // phone created the customer first — use that row instead.
        if (
          typeof createError === 'object' && createError !== null &&
          'code' in createError && createError.code === 'P2002'
        ) {
          customer = await prisma.customer.findFirst({
            where: { tenantId: tenant.id, phone: normalizedPhone },
          });
          if (!customer) throw createError;
        } else {
          throw createError;
        }
      }
    } else if (!customer.isActive) {
      // Update last login time (if we add that field)
      // For now, just ensure customer is active
      customer = await prisma.customer.update({ where: { id: customer.id }, data: { isActive: true } });
    }

    // Generate JWT token
    const token = generateCustomerToken({
      customerId: customer.id,
      tenantId: tenant.id,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
    });

    // Set httpOnly cookie — do NOT return token in body (XSS risk)
    const response = NextResponse.json({
      success: true,
      data: {
        customer: {
          _id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
        },
      },
    });

    response.cookies.set('customer-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
