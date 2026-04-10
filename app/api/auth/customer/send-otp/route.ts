import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendSMS } from '@/lib/notifications';
import { getTenantIdFromRequest } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OTP_EXPIRY_MINUTES, RL } from '@/lib/auth-config';

/**
 * POST - Send OTP to customer phone number
 * Body: { phone: string, tenantSlug?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 OTP requests per 10 minutes per IP (Twilio cost protection)
    const ip = getClientIp(request);
    const rl = checkRateLimit(`send-otp:${ip}`, RL.sendOtp.max, RL.sendOtp.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many OTP requests. Please try again later.', retryAfter: Math.ceil(rl.resetAfterMs / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

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

    // Generate cryptographically secure 6-digit OTP
    const otp = (100000 + (crypto.randomInt(900000))).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any existing OTPs for this phone
    await CustomerOTP.updateMany(
      { tenantId: tenant._id, phone: normalizedPhone, verified: false },
      { verified: true } // Mark as used
    );

    // Create new OTP — store hash, never plaintext
    await CustomerOTP.create({
      tenantId: tenant._id,
      phone: normalizedPhone,
      otp: otpHash,
      expiresAt,
      verified: false,
      attempts: 0,
    });

    // Send OTP via SMS using Twilio
    const smsMessage = `Your verification code is ${otp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes.`;
    
    const smsSent = await sendSMS({
      to: normalizedPhone,
      message: smsMessage,
      type: 'sms',
    });

    if (!smsSent) {
      logger.error('Failed to send OTP SMS');
      // Don't fail the request, OTP is still created
      // In production, you might want to handle this differently
    }

    // In development, log OTP to console
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`📱 OTP for ${normalizedPhone}: ${otp}`);
    }

    return NextResponse.json({
      success: true,
      message: t('validation.otpSent', 'OTP sent successfully'),
      // Don't send OTP in response for security
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
