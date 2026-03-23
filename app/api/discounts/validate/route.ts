import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);

    // Rate limit: 20 attempts per minute per IP to prevent brute-force code guessing
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkRateLimit(`discount-validate:${ip}`, 20, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetAfterMs / 1000)) } }
      );
    }
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
    const body = await request.json();
    const { code, subtotal } = body;

    // SC/PWD discounts are legal requirements (RA 9994/10754) — always allowed
    const legalDiscountCodes = ['SC20', 'PWD20'];
    const isLegalDiscount = code && legalDiscountCodes.includes(code.toUpperCase());

    // Check if discounts feature is enabled (skip for legally-required discounts)
    if (!isLegalDiscount) {
      const tenantSettings = await getTenantSettingsById(tenantId);
      if (tenantSettings && tenantSettings.enableDiscounts === false) {
        return NextResponse.json(
          { success: false, error: t('validation.discountsNotEnabled', 'Discounts are not enabled for this tenant') },
          { status: 400 }
        );
      }
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeRequired', 'Discount code is required') },
        { status: 400 }
      );
    }

    const discount = await Discount.findOne({
      tenantId,
      code: code.toUpperCase(),
      isActive: true,
    });

    if (!discount) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidDiscountCode', 'Invalid or inactive discount code') },
        { status: 404 }
      );
    }

    // Check validity dates
    const now = new Date();
    if (now < discount.validFrom || now > discount.validUntil) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeNotValid', 'Discount code is not valid at this time') },
        { status: 400 }
      );
    }

    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeUsageLimit', 'Discount code has reached its usage limit') },
        { status: 400 }
      );
    }

    // Check minimum purchase amount
    if (discount.minPurchaseAmount && subtotal < discount.minPurchaseAmount) {
      const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', discount.minPurchaseAmount.toString());
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg
        },
        { status: 400 }
      );
    }

    // Calculate discount amount with decimal precision
    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((subtotal * discount.value) / 100 * 100) / 100;
      if (discount.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
      }
    } else {
      discountAmount = Math.min(discount.value, subtotal);
    }

    return NextResponse.json({
      success: true,
      data: {
        code: discount.code,
        name: discount.name,
        type: discount.type,
        value: discount.value,
        discountAmount,
        finalTotal: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100),
      },
    });
  } catch (error: unknown) {
    logger.error('Error validating discount:', error);
    return NextResponse.json({ success: false, error: 'Failed to validate discount' }, { status: 500 });
  }
}

