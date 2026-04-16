import { NextRequest, NextResponse } from 'next/server';
import { capturePayment } from '@/lib/paypal';
import { logger } from '@/lib/logger';

// Only allow alphanumeric slugs and hyphens to prevent open-redirect via crafted paths.
const SAFE_SLUG = /^[a-zA-Z0-9-]{1,64}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token'); // PayPal order ID
  const rawTenant = searchParams.get('tenant') || '';
  const rawLang = searchParams.get('lang') || 'en';
  const planId = searchParams.get('planId') || '';
  const billingCycle = searchParams.get('billingCycle') || 'monthly';

  // Validate path segments before building redirect URLs (prevent open redirect).
  const tenant = SAFE_SLUG.test(rawTenant) ? rawTenant : '';
  const lang = SAFE_SLUG.test(rawLang) ? rawLang : 'en';

  // Resolve basePath outside try so it's available in catch
  const basePath = tenant ? `/${tenant}/${lang}` : '';

  try {
    if (!token) {
      return NextResponse.redirect(new URL(`${basePath}/subscription/payment-cancel`, request.url));
    }

    // Capture the payment
    const captureResult = await capturePayment(token);

    // Check if payment was successful
    const isSuccessful = captureResult.status === 'COMPLETED';

    if (isSuccessful) {
      const params = new URLSearchParams({ orderId: token, planId, billingCycle });
      return NextResponse.redirect(new URL(`${basePath}/subscription/payment-success?${params}`, request.url));
    } else {
      return NextResponse.redirect(new URL(`${basePath}/subscription/payment-failed?orderId=${token}`, request.url));
    }

  } catch (error: unknown) {
    logger.error('Error processing PayPal success:', error);
    return NextResponse.redirect(new URL(`${basePath}/subscription/payment-failed`, request.url));
  }
}