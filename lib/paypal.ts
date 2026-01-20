import { Client, Environment, OrdersController } from '@paypal/paypal-server-sdk';

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
export async function createSubscriptionPayment(planId: string, amount: number, currency: string = 'PHP') {
  try {
    const request = new ordersController.OrdersCreateRequest();
    request.prefer("return=representation");

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toFixed(2),
        },
        description: `Subscription Plan Payment - Plan ID: ${planId}`,
      }],
      application_context: {
        return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/api/paypal/success`,
        cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/api/paypal/cancel`,
        user_action: 'PAY_NOW',
      },
    });

    const response = await paypalClient.execute(request);
    return response.result;
  } catch (error) {
    console.error('Error creating PayPal payment:', error);
    throw error;
  }
}

// Helper function to capture PayPal payment
export async function capturePayment(orderId: string) {
  try {
    const request = new ordersController.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const response = await paypalClient.execute(request);
    return response.result;
  } catch (error) {
    console.error('Error capturing PayPal payment:', error);
    throw error;
  }
}

// Helper function to verify PayPal webhook signature
export function verifyWebhookSignature(body: string, signature: string, webhookId: string) {
  // Webhook signature verification would be implemented here
  // For now, we'll trust the webhook (in production, implement proper verification)
  return true;
}