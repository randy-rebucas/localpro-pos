import { logger } from '@/lib/logger';

/**
 * Message safe to return from an e-commerce route. Auth/permission/plan errors
 * (status < 500) and errors from the store's own API (bad keys, store down) are
 * useful to the tenant and are passed through; anything else is an internal
 * error (DB, decryption, code bugs) and gets a generic message — the detail is
 * logged instead.
 */
export function publicEcommerceError(message: string, status: number, fallback: string): string {
  if (status < 500) return message;
  if (/^(WooCommerce|Shopify)\b/i.test(message)) return message;
  logger.error(`E-commerce route error: ${fallback}`, message);
  return fallback;
}
