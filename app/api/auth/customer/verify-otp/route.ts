import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Verify OTP and login customer
 * Body: { phone: string, otp: string, tenantSlug?: string, firstName?: string, lastName?: string }
 */
export async function POST(request: NextRequest) {
  try {
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

    // Find valid OTP
    const otpRecord = await CustomerOTP.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
      otp,
      verified: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      // Increment attempts for rate limiting
      await CustomerOTP.updateOne(
        { tenantId: tenant._id, phone: normalizedPhone, verified: false },
        { $inc: { attempts: 1 } }
      );

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

    // Set cookie
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
        token,
      },
    });

    response.cookies.set('customer-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
