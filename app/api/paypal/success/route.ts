import { NextRequest, NextResponse } from 'next/server';
import { capturePayment } from '@/lib/paypal';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token'); // PayPal order ID

    if (!token) {
      return NextResponse.redirect(new URL('/?payment=cancelled', request.url));
    }

    // Capture the payment
    const captureResult = await capturePayment(token);

    // Check if payment was successful
    const isSuccessful = captureResult.status === 'COMPLETED';

    if (isSuccessful) {
      // Redirect to subscription activation page with success
      return NextResponse.redirect(new URL(`/subscription/payment-success?orderId=${token}`, request.url));
    } else {
      // Redirect with failure
      return NextResponse.redirect(new URL('/subscription/payment-failed', request.url));
    }

  } catch (error: any) {
    console.error('Error processing PayPal success:', error);
    return NextResponse.redirect(new URL('/subscription/payment-failed', request.url));
  }
}