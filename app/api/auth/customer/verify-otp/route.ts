import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { CUSTOMER_COOKIE_MAX_AGE, OTP_MAX_ATTEMPTS, RL } from '@/lib/auth-config';

/**
 * POST - Verify OTP and login customer
 * Body: { phone: string, otp: string, tenantSlug?: string, firstName?: string, lastName?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 verify attempts per 10 minutes per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`verify-otp:${ip}`, RL.verifyOtp.max, RL.verifyOtp.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
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
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({ 
      slug: tenantSlug || 'default', 
      isActive: true 
    }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Find the latest active OTP record for this phone (otp field is now a bcrypt hash)
    const otpRecord = await CustomerOTP.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
      verified: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidOtp', 'Invalid or expired OTP') },
        { status: 401 }
      );
    }

    // Check max attempts before comparing (prevents brute-force via repeated calls)
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: t('validation.maxOtpAttempts', 'Maximum verification attempts exceeded') },
        { status: 429 }
      );
    }

    // Timing-safe comparison against stored hash
    const isOtpValid = await bcrypt.compare(otp, otpRecord.otp);
    if (!isOtpValid) {
      await CustomerOTP.updateOne(
        { _id: otpRecord._id },
        { $inc: { attempts: 1 } }
      );
      return NextResponse.json(
        { success: false, error: t('validation.invalidOtp', 'Invalid or expired OTP') },
        { status: 401 }
      );
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Find or create customer
    let customer = await Customer.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
    });

    if (!customer) {
      // Create new customer if doesn't exist
      if (!firstName || !lastName) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'First name and last name are required for new customers') },
          { status: 400 }
        );
      }

      customer = await Customer.create({
        tenantId: tenant._id,
        firstName,
        lastName,
        phone: normalizedPhone,
        isActive: true,
      });
    } else {
      // Update last login time (if we add that field)
      // For now, just ensure customer is active
      if (!customer.isActive) {
        customer.isActive = true;
        await customer.save();
      }
    }

    // Generate JWT token
    const token = generateCustomerToken({
      customerId: customer._id.toString(),
      tenantId: tenant._id.toString(),
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
      maxAge: CUSTOMER_COOKIE_MAX_AGE,
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
