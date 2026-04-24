import crypto from 'crypto';
/** Verify X-Shopify-Hmac-Sha256 against raw body (Shopify app client secret). */
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null, clientSecret: string): boolean {
  if (!hmacHeader || !clientSecret) return false;
  const digest = crypto.createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('base64');
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * WooCommerce webhook: X-WC-Webhook-Signature is base64(hmac_sha256(rawBody, webhook_secret)).
 */
export function verifyWooCommerceWebhookSignature(
  rawBody: string,
  signatureB64: string | null,
  webhookSecret: string
): boolean {
  if (!signatureB64 || !webhookSecret) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('base64');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureB64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verify Shopify OAuth callback query (excluding hmac and signature). */
export function verifyShopifyOAuthQuery(query: Record<string, string>, clientSecret: string): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;
  const entries = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', clientSecret).update(entries).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    return false;
  }
}
