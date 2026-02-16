import { Client, Environment, OrdersController, CheckoutPaymentIntent, OrderApplicationContextUserAction } from '@paypal/paypal-server-sdk';

// PayPal configuration
const clientId = process.env.PAYPAL_CLIENT_ID || 'your_paypal_client_id_here';
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'your_paypal_client_secret_here';
const environment = process.env.PAYPAL_ENVIRONMENT === 'production'
  ? Environment.Production
  : Environment.Sandbox;


export const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: clientId,
    oAuthClientSecret: clientSecret,
  },
  timeout: 0,
  environment,
});

const ordersController = new OrdersController(paypalClient);

// Helper function to create PayPal order for subscription payment
export async function createSubscriptionPayment(planId: string, amount: number, currency: string = 'PHP', tenant?: string, lang?: string, billingCycle?: string) {
  try {
    const language = lang || 'en';
    const tenantPath = tenant ? `/${tenant}/${language}` : '';
    const planParams = `planId=${encodeURIComponent(planId)}&billingCycle=${encodeURIComponent(billingCycle || 'monthly')}`;
    const returnUrl = `${process.env.BASE_URL || 'http://localhost:3000'}${tenantPath}/subscription/payment-success?${planParams}`;
    const cancelUrl = `${process.env.BASE_URL || 'http://localhost:3000'}${tenantPath}/subscription/payment-cancel?${planParams}`;
    const response = await ordersController.createOrder({
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [{
          amount: {
            currencyCode: currency,
            value: amount.toFixed(2),
          },
          description: `Subscription Plan Payment - Plan ID: ${planId}`,
        }],
        applicationContext: {
          returnUrl,
          cancelUrl,
          userAction: 'PAY_NOW' as OrderApplicationContextUserAction,
        },
      },
      prefer: 'return=representation',
    });
    return response.result;
  } catch (error) {
    console.error('Error creating PayPal payment:', error);
    throw error;
  }
}

// Helper function to capture PayPal payment
export async function capturePayment(orderId: string) {
  try {
    const response = await ordersController.captureOrder({
      id: orderId,
      body: {}
    });
    return response.result;
  } catch (error) {
    console.error('Error capturing PayPal payment:', error);
    throw error;
  }
}

// Verify PayPal webhook signature via PayPal API
export async function verifyWebhookSignature(
  headers: Record<string, string>,
  body: string,
  webhookId: string
): Promise<boolean> {
  const baseUrl = process.env.PAYPAL_ENVIRONMENT === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();

    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });

    const result = await verifyRes.json();
    return result.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('PayPal webhook verification failed:', error);
    return false;
  }
}