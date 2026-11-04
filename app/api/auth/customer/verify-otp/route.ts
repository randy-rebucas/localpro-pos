import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { generateCustomerToken } from '@/lib/auth-customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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
    const { tenants, customerOtps, customers } = getRepos();
    const tenant = await tenants.findBySlug(tenantSlug || 'default', { activeOnly: true });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Find valid OTP
    const otpRecord = await customerOtps.findValid(tenant._id, normalizedPhone, otp, new Date());

    if (!otpRecord) {
      // Increment attempts for rate limiting
      await customerOtps.recordFailedAttempt(tenant._id, normalizedPhone);

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
    await customerOtps.markVerified(tenant._id, otpRecord._id);

    // Find or create customer
    let customer = await customers.findOne(tenant._id, { phone: normalizedPhone });

    if (!customer) {
      // Create new customer if doesn't exist
      if (!firstName || !lastName) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'First name and last name are required for new customers') },
          { status: 400 }
        );
      }

      customer = await customers.create(tenant._id, {
        firstName,
        lastName,
        phone: normalizedPhone,
        isActive: true,
      });
    } else {
      // Update last login time (if we add that field)
      // For now, just ensure customer is active
      if (!customer.isActive) {
        await customers.update(tenant._id, customer._id, { isActive: true });
        customer = { ...customer, isActive: true };
      }

    }

    // Generate JWT token
    const token = generateCustomerToken({
      customerId: customer._id.toString(),
      tenantId: tenant._id,
      phone: customer.phone,
      email: customer.email,
    });

    // Set httpOnly cookie — do NOT return token in body (XSS risk)
    const response = NextResponse.json({
      success: true,
      data: {
        customer: {
          _id: customer._id,
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
