import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
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

    // Get tenant ID - for mobile, tenantSlug is optional
    // If not provided, find tenant from existing customer or OTP record
    const Tenant = (await import('@/models/Tenant')).default;
    let tenant;

    if (tenantSlug) {
      // If tenantSlug provided, use it
      tenant = await Tenant.findOne({ 
        slug: tenantSlug, 
        isActive: true 
      }).lean();
      
      if (!tenant) {
        return NextResponse.json(
          { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
          { status: 404 }
        );
      }
    } else {
      // For mobile: tenantSlug not provided, try to find from existing customer or OTP
      // First, check if customer exists with this phone
      const existingCustomer = await Customer.findOne({
        phone: normalizedPhone,
        isActive: true,
      }).select('tenantId').lean();

      if (existingCustomer) {
        tenant = await Tenant.findById(existingCustomer.tenantId).lean();
      } else {
        // Check if there's an unverified OTP for this phone (across all tenants)
        const otpRecord = await CustomerOTP.findOne({
          phone: normalizedPhone,
          otp,
          verified: false,
          expiresAt: { $gt: new Date() },
        }).select('tenantId').lean();

        if (otpRecord) {
          tenant = await Tenant.findById(otpRecord.tenantId).lean();
        } else {
          // No customer or OTP found, use default tenant
          tenant = await Tenant.findOne({ 
            slug: 'default', 
            isActive: true 
          }).lean();
        }
      }

      if (!tenant || !tenant.isActive) {
        return NextResponse.json(
          { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
          { status: 404 }
        );
      }
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
  } catch (error: unknown) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
