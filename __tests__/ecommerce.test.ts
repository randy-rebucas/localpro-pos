import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { verifyShopifyWebhookHmac, verifyShopifyOAuthQuery } from '@/lib/ecommerce/webhook-verify';
import { parseShopifyOrderWebhook } from '@/lib/ecommerce/parse-shopify-order';

describe('ecommerce crypto', () => {
  beforeEach(() => {
    process.env.ECOMMERCE_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  });

  it('encrypts and decrypts credential payloads', async () => {
    const { encryptCredentialsPayload, decryptCredentialsPayload } = await import('@/lib/ecommerce/crypto');
    const blob = encryptCredentialsPayload({ accessToken: 'secret-token', n: 1 });
    expect(decryptCredentialsPayload<{ accessToken: string; n: number }>(blob)).toEqual({
      accessToken: 'secret-token',
      n: 1,
    });
  });
});

describe('normalizeShopifyShopDomain', () => {
  it('accepts plain myshopify hostname', async () => {
    const { normalizeShopifyShopDomain } = await import('@/lib/ecommerce/shopify-shop-domain');
    expect(normalizeShopifyShopDomain('  My-Store.myshopify.com  ')).toBe('my-store.myshopify.com');
  });

  it('strips https and path so DNS host is not "https"', async () => {
    const { normalizeShopifyShopDomain } = await import('@/lib/ecommerce/shopify-shop-domain');
    expect(normalizeShopifyShopDomain('https://my-store.myshopify.com/admin')).toBe('my-store.myshopify.com');
  });

  it('rejects invalid hosts', async () => {
    const { normalizeShopifyShopDomain } = await import('@/lib/ecommerce/shopify-shop-domain');
    expect(normalizeShopifyShopDomain('https')).toBeNull();
    expect(normalizeShopifyShopDomain('store.com')).toBeNull();
    expect(normalizeShopifyShopDomain('a.b.myshopify.com')).toBeNull();
  });
});

describe('ecommerce webhooks', () => {
  it('verifies Shopify webhook HMAC', () => {
    const secret = 'test_secret';
    const body = '{"hello":"world"}';
    const hmac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    expect(verifyShopifyWebhookHmac(body, hmac, secret)).toBe(true);
    expect(verifyShopifyWebhookHmac(body, 'wrong', secret)).toBe(false);
  });

  it('verifies Shopify OAuth query HMAC', () => {
    const secret = 'hush';
    const query: Record<string, string> = {
      code: 'abc',
      shop: 'test.myshopify.com',
      state: 'nonce',
      timestamp: '1',
    };
    const message = Object.keys(query)
      .filter((k) => k !== 'hmac' && k !== 'signature')
      .sort()
      .map((k) => `${k}=${query[k]}`)
      .join('&');
    const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
    expect(verifyShopifyOAuthQuery({ ...query, hmac }, secret)).toBe(true);
    expect(verifyShopifyOAuthQuery({ ...query, hmac: 'deadbeef' }, secret)).toBe(false);
  });
});

describe('parseShopifyOrderWebhook', () => {
  it('returns null when not paid', () => {
    expect(
      parseShopifyOrderWebhook({
        id: 9,
        financial_status: 'pending',
        line_items: [{ id: 1, product_id: 1, variant_id: 2, title: 'x', quantity: 1, price: '1', sku: null }],
      })
    ).toBeNull();
  });

  it('normalizes paid order with line items', () => {
    const order = parseShopifyOrderWebhook({
      id: 501,
      financial_status: 'paid',
      currency: 'USD',
      subtotal_price: '20',
      total_tax: '0',
      total_price: '20',
      line_items: [
        {
          id: 10,
          product_id: 100,
          variant_id: 200,
          title: 'Widget',
          quantity: 2,
          price: '10',
          sku: 'W-1',
        },
      ],
    });
    expect(order?.externalOrderId).toBe('501');
    expect(order?.lines).toHaveLength(1);
    expect(order?.lines[0].externalVariantId).toBe('200');
  });
});
