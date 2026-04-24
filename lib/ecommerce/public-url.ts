import type { NextRequest } from 'next/server';

type RequestLike = Pick<NextRequest, 'nextUrl'>;

/**
 * Canonical public base URL (origin only, no trailing slash) for OAuth redirects and webhooks.
 *
 * Precedence:
 * 1. `NEXT_PUBLIC_APP_URL`
 * 2. `SHOPIFY_OAUTH_REDIRECT_URI` — origin only (full callback URL set in Partner Dashboard must match {@link getShopifyOAuthRedirectUri})
 * 3. Non-production: `request.nextUrl.origin` when `request` is passed (ngrok / LAN without duplicating env)
 * 4. `VERCEL_URL` (HTTPS)
 * 5. `request.nextUrl.origin` if available
 * 6. `http://localhost:3000`
 */
export function getPublicAppUrl(request?: RequestLike): string {
  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (nextPublic) return nextPublic;

  const shopifyRedirect = process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim();
  if (shopifyRedirect) {
    try {
      return new URL(shopifyRedirect).origin;
    } catch {
      /* ignore invalid */
    }
  }

  if (process.env.NODE_ENV !== 'production' && request?.nextUrl?.origin) {
    return request.nextUrl.origin;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;

  if (request?.nextUrl?.origin) return request.nextUrl.origin;

  return 'http://localhost:3000';
}

/**
 * Exact `redirect_uri` sent to Shopify — must match an **Allowed redirection URL** in the Partner/custom app (scheme, host, path; no trailing slash).
 */
export function getShopifyOAuthRedirectUri(request?: RequestLike): string {
  const fullOverride = process.env.SHOPIFY_OAUTH_REDIRECT_URI?.trim();
  if (fullOverride) {
    const normalized = fullOverride.replace(/\/$/, '');
    try {
      new URL(normalized);
      return normalized;
    } catch {
      throw new Error(
        'SHOPIFY_OAUTH_REDIRECT_URI must be a valid absolute URL (e.g. https://your-domain.com/api/integrations/shopify/oauth/callback)'
      );
    }
  }
  return `${getPublicAppUrl(request)}/api/integrations/shopify/oauth/callback`;
}
