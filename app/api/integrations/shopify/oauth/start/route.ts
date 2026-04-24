import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess, getTenantSlugFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { signShopifyOAuthState } from '@/lib/ecommerce/shopify-oauth-state';
import { getShopifyOAuthRedirectUri } from '@/lib/ecommerce/public-url';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { requireEcommerceProviderConnectAllowed } from '@/lib/ecommerce/tenant-integration-policy';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeShopifyShopDomain } from '@/lib/ecommerce/shopify-shop-domain';

/** Always merged into the authorize request — required for inventory location + Admin APIs this app uses. */
const MIN_SHOPIFY_SCOPES = [
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_orders',
  'read_locations',
] as const;

function shopifyOAuthScopeParam(): string {
  const fromEnv = process.env.SHOPIFY_SCOPES?.trim();
  const parts = fromEnv
    ? fromEnv.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    : [...MIN_SHOPIFY_SCOPES];
  const set = new Set(parts);
  for (const s of MIN_SHOPIFY_SCOPES) set.add(s);
  return [...set].join(',');
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    await requireRole(request, ['admin', 'manager', 'owner', 'super_admin']);
    await requireEcommerceIntegrationFeature(tenantId);
    await requireEcommerceProviderConnectAllowed(tenantId, 'shopify');

    const rl = checkRateLimit(`shopify-oauth-start:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const shopRaw = request.nextUrl.searchParams.get('shop') ?? '';
    const shop = normalizeShopifyShopDomain(shopRaw);
    if (!shop) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid shop. Enter only the hostname, e.g. your-store.myshopify.com (no https:// or path).',
        },
        { status: 400 }
      );
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'SHOPIFY_CLIENT_ID is not configured' }, { status: 500 });
    }

    const tenantSlug = (await getTenantSlugFromRequest(request)) || 'default';
    const lang = request.nextUrl.searchParams.get('lang') === 'es' ? 'es' : 'en';
    const state = signShopifyOAuthState({ tenantId, tenantSlug, lang });
    const redirectUri = getShopifyOAuthRedirectUri(request);
    const scopes = shopifyOAuthScopeParam();

    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
