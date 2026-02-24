import { NextRequest, NextResponse } from 'next/server';
import { capturePayment } from '@/lib/paypal';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token'); // PayPal order ID
    const tenant = searchParams.get('tenant') || '';
    const lang = searchParams.get('lang') || 'en';
    const planId = searchParams.get('planId') || '';
    const billingCycle = searchParams.get('billingCycle') || 'monthly';

    const basePath = tenant ? `/${tenant}/${lang}` : '';

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
    console.error('Error processing PayPal success:', error);
    return NextResponse.redirect(new URL('/subscription/payment-failed', request.url));
  }
}