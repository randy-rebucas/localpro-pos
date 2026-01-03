import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
import { sendSMS } from '@/lib/notifications';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Send OTP to customer phone number
 * Body: { phone: string, tenantSlug?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { phone, tenantSlug } = body;

    // Validation
    if (!phone) {
      return NextResponse.json(
        { success: false, error: t('validation.phoneRequired', 'Phone number is required') },
        { status: 400 }
      );
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phone.replace(/\D/g, '');

    if (normalizedPhone.length < 10) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidPhone', 'Invalid phone number') },
        { status: 400 }
      );
    }

    // Get tenant ID - for mobile, tenantSlug is optional
    // If not provided, try to find from existing customer, otherwise use default
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
      // For mobile: tenantSlug not provided, try to find from existing customer
      const existingCustomer = await Customer.findOne({
        phone: normalizedPhone,
        isActive: true,
      }).select('tenantId').lean();

      if (existingCustomer) {
        tenant = await Tenant.findById(existingCustomer.tenantId).lean();
      }

      // If no customer found or tenant inactive, use default tenant
      if (!tenant || !tenant.isActive) {
        tenant = await Tenant.findOne({ 
          slug: 'default', 
          isActive: true 
        }).lean();
      }

      if (!tenant) {
        return NextResponse.json(
          { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
          { status: 404 }
        );
      }
    }

    // Check for recent OTP (rate limiting - max 1 per minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentOTP = await CustomerOTP.findOne({
      tenantId: tenant._id,
      phone: normalizedPhone,
      createdAt: { $gte: oneMinuteAgo },
    });

    if (recentOTP) {
      return NextResponse.json(
        { 
          success: false, 
          error: t('validation.otpRateLimit', 'Please wait before requesting another OTP'),
          retryAfter: 60,
        },
        { status: 429 }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Invalidate any existing OTPs for this phone
    await CustomerOTP.updateMany(
      { tenantId: tenant._id, phone: normalizedPhone, verified: false },
      { verified: true } // Mark as used
    );

    // Create new OTP
    await CustomerOTP.create({
      tenantId: tenant._id,
      phone: normalizedPhone,
      otp,
      expiresAt,
      verified: false,
      attempts: 0,
    });

    // Send OTP via SMS using Twilio
    const smsMessage = `Your verification code is ${otp}. This code expires in 10 minutes.`;
    
    const smsSent = await sendSMS({
      to: normalizedPhone,
      message: smsMessage,
      type: 'sms',
    });

    if (!smsSent) {
      console.error('Failed to send OTP SMS');
      // Don't fail the request, OTP is still created
      // In production, you might want to handle this differently
    }

    // In development, log OTP to console
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📱 OTP for ${normalizedPhone}: ${otp}`);
    }

    return NextResponse.json({
      success: true,
      message: t('validation.otpSent', 'OTP sent successfully'),
      // Don't send OTP in response for security
    });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
