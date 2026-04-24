import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { verifyWooCommerceWebhookSignature } from '@/lib/ecommerce/webhook-verify';
import { getWooWebhookSecretPlain } from '@/lib/ecommerce/integration-credentials';
import { handleWooCommerceWebhook } from '@/lib/ecommerce/process-channel-webhook';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const rawBody = await request.text();
  const sig = request.headers.get('x-wc-webhook-signature') || request.headers.get('X-WC-Webhook-Signature');

  const { integrationId } = await params;
  if (!integrationId || !/^[a-f0-9]{24}$/i.test(integrationId)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  await connectDB();
  const integration = await TenantEcommerceIntegration.findById(integrationId).lean();
  if (!integration || integration.provider !== 'woocommerce' || !integration.isActive) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const secret = getWooWebhookSecretPlain(integration);
  if (!secret || !verifyWooCommerceWebhookSignature(rawBody, sig, secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const r = await handleWooCommerceWebhook(integrationId, rawBody, payload);
  return new NextResponse(r.body, { status: r.status });
}
