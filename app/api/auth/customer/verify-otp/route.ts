import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP, { MAX_OTP_ATTEMPTS, otpMatches } from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
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

    const invalidOtp = () => NextResponse.json(
      { success: false, error: t('validation.invalidOtp', 'Invalid or expired OTP') },
      { status: 401 }
    );
    const maxAttempts = () => NextResponse.json(
      { success: false, error: t('validation.maxOtpAttempts', 'Maximum verification attempts exceeded') },
      { status: 429 }
    );

    // Latest outstanding OTP for this tenant + phone (looked up WITHOUT the code,
    // so the attempts limit applies to wrong guesses too).
    const latest = await CustomerOTP.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
      verified: false,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!latest) {
      return invalidOtp();
    }

    if ((latest.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      await CustomerOTP.deleteOne({ _id: latest._id, tenantId: tenant._id });
      return maxAttempts();
    }

    // Atomically consume one attempt BEFORE comparing, so concurrent guesses can
    // never exceed MAX_OTP_ATTEMPTS comparisons. ($inc bypasses the schema `max`
    // validator, hence the explicit $lt guard.)
    const consumed = await CustomerOTP.findOneAndUpdate(
      {
        _id: latest._id,
        tenantId: tenant._id,
        verified: false,
        attempts: { $lt: MAX_OTP_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    ).lean();

    if (!consumed) {
      await CustomerOTP.deleteOne({ _id: latest._id, tenantId: tenant._id });
      return maxAttempts();
    }

    if (!otpMatches(String(otp), consumed.otpHash)) {
      if (consumed.attempts >= MAX_OTP_ATTEMPTS) {
        // Last attempt used up — invalidate so the code can't be guessed further.
        await CustomerOTP.deleteOne({ _id: consumed._id, tenantId: tenant._id });
      }
      return invalidOtp();
    }

    let customer = await Customer.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
    });

    // Ask a new customer for their name before claiming the OTP, so the same
    // code can be resubmitted with the name instead of requesting a new one.
    if (!customer && (!firstName || !lastName)) {
      return NextResponse.json(
        { success: false, error: t('validation.nameRequired', 'First name and last name are required for new customers') },
        { status: 400 }
      );
    }

    // Mark OTP as verified (single-use: guard against a concurrent successful verify)
    const claimed = await CustomerOTP.findOneAndUpdate(
      { _id: consumed._id, tenantId: tenant._id, verified: false },
      { $set: { verified: true } },
      { new: true }
    ).lean();

    if (!claimed) {
      return invalidOtp();
    }

    if (!customer) {
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
