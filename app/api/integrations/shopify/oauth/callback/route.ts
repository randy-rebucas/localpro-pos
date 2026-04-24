import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { verifyShopifyOAuthQuery } from '@/lib/ecommerce/webhook-verify';
import { verifyShopifyOAuthState } from '@/lib/ecommerce/shopify-oauth-state';
import { shopifyExchangeCodeForToken, shopifyCredentialsFromTokenResponse } from '@/lib/ecommerce/shopify-oauth';
import { encryptCredentialsPayload } from '@/lib/ecommerce/crypto';
import { shopifyGetPrimaryLocationId } from '@/lib/ecommerce/shopify-api';
import { registerShopifyWebhooksForIntegration } from '@/lib/ecommerce/register-shopify-webhooks';
import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { requireEcommerceProviderConnectAllowed } from '@/lib/ecommerce/tenant-integration-policy';
import { normalizeShopifyShopDomain } from '@/lib/ecommerce/shopify-shop-domain';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const query: Record<string, string> = {};
    sp.forEach((v, k) => {
      query[k] = v;
    });

    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
    const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
    if (!clientSecret || !clientId) {
      return NextResponse.json({ error: 'Shopify app not configured' }, { status: 500 });
    }

    if (!verifyShopifyOAuthQuery(query, clientSecret)) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
    }

    const state = query.state;
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 });
    }
    const st = verifyShopifyOAuthState(state);
    if (!st) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
    }

    const shopNorm = normalizeShopifyShopDomain(query.shop ?? '');
    const code = query.code;
    if (!shopNorm || !code) {
      return NextResponse.json({ error: 'Missing or invalid shop, or missing code' }, { status: 400 });
    }

    await requireEcommerceProviderConnectAllowed(st.tenantId, 'shopify');

    const tokenData = await shopifyExchangeCodeForToken(shopNorm, clientId, clientSecret, code);
    const credBlob = shopifyCredentialsFromTokenResponse(tokenData);
    const enc = encryptCredentialsPayload({
      accessToken: credBlob.accessToken,
      ...(credBlob.refreshToken != null && {
        refreshToken: credBlob.refreshToken,
        accessTokenExpiresAtMs: credBlob.accessTokenExpiresAtMs,
      }),
    } as Record<string, unknown>);

    await connectDB();
    const tenantObjectId = new mongoose.Types.ObjectId(st.tenantId);
    const locId = await shopifyGetPrimaryLocationId(shopNorm, credBlob.accessToken);

    const integration = await TenantEcommerceIntegration.findOneAndUpdate(
      { tenantId: tenantObjectId, provider: 'shopify' },
      {
        $set: {
          shopDomain: shopNorm,
          credentialsEncrypted: enc,
          scopes: tokenData.scope ? tokenData.scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : [],
          shopifyLocationId: locId || undefined,
          isActive: true,
          lastError: undefined,
        },
        $setOnInsert: { tenantId: tenantObjectId, provider: 'shopify' },
      },
      { upsert: true, new: true }
    );

    try {
      await registerShopifyWebhooksForIntegration(integration, {
        publicAppBaseUrl: getPublicAppUrl(request),
      });
    } catch {
      await integration.updateOne({ $set: { lastError: 'webhook_registration_failed' } });
    }

    const tenant = await Tenant.findById(st.tenantId).select('slug').lean();
    const slug = tenant?.slug || st.tenantSlug || 'default';
    const redirect = new URL(`/${slug}/${st.lang}/settings`, request.nextUrl.origin);
    redirect.searchParams.set('tab', 'ecommerce');
    redirect.searchParams.set('shopify', 'connected');
    return NextResponse.redirect(redirect.toString());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'OAuth error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
