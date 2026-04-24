import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhookHmac } from '@/lib/ecommerce/webhook-verify';
import { handleShopifyWebhook } from '@/lib/ecommerce/process-channel-webhook';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  const topic = request.headers.get('X-Shopify-Topic');
  const shop = request.headers.get('X-Shopify-Shop-Domain');

  const secret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!secret || !verifyShopifyWebhookHmac(rawBody, hmac, secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const r = await handleShopifyWebhook(shop, topic, rawBody, payload);
  return new NextResponse(r.body, { status: r.status });
}
