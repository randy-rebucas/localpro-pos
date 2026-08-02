import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyWooCommerceWebhookSignature } from '@/lib/ecommerce/webhook-verify';
import { getWooWebhookSecretPlain } from '@/lib/ecommerce/integration-credentials';
import { handleWooCommerceWebhook } from '@/lib/ecommerce/process-channel-webhook';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const rawBody = await request.text();
  const sig = request.headers.get('x-wc-webhook-signature') || request.headers.get('X-WC-Webhook-Signature');

  const { integrationId } = await params;
  if (!integrationId || !UUID_RE.test(integrationId)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const integration = await prisma.tenantEcommerceIntegration.findUnique({ where: { id: integrationId } });
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
